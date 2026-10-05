import type { Pool } from '@nimiq-pool-monitor/db'
import type { DB } from './db.ts'
import { and, asc, count, epochStakes, eq, gt, isNotNull, lt, max, notExists, payouts, pendingTxs, pools, rewardEvents, sql } from '@nimiq-pool-monitor/db'
import * as Nimiq from '@nimiq/core'

import { config, LUNA_PER_NIM, stakeLuna } from './config.ts'
import { logEvent, setMeta } from './db.ts'
import { electionBlockFor, eligibleEpoch, rewardedEpoch, stakesEpochAt } from './epochs.ts'
import { historySince } from './history.ts'
import { fetchPools } from './validators.ts'
import { addr, deriveKeyPair } from './wallets.ts'

const { Policy } = Nimiq
const PENDING_TTL_MS = 3 * 60_000
/** How long staker-balance growth may stay unmatched by an add-stake transaction before it is recorded anyway. */
const UNMATCHED_GROWTH_GRACE_MS = 10 * 60_000

type ConfirmedTx = Nimiq.PlainTransactionDetails & { blockHeight: number, timestamp: number }

export class Monitor {
  readonly funding: Nimiq.KeyPair
  private lastPoolSync = 0
  private networkId = 0
  private stakesCapturedFor = 0
  private capturingStakes = false
  private unmatchedGrowthSince = new Map<string, number>()

  private db: DB
  private client: Nimiq.Client
  private mnemonic: string

  constructor(db: DB, client: Nimiq.Client, mnemonic: string) {
    this.db = db
    this.client = client
    this.mnemonic = mnemonic
    this.funding = deriveKeyPair(mnemonic, 0)
  }

  async init() {
    this.networkId = await this.client.getNetworkId()
    setMeta(this.db, 'funding_address', addr(this.funding))
    setMeta(this.db, 'stake_luna', String(stakeLuna))
    setMeta(this.db, 'network', config.network)

    // Capture election stakes as soon as the election block arrives, not on the next tick.
    await this.client.addHeadChangedListener(() => void this.onHead())
  }

  private async onHead() {
    try {
      const head = await this.client.getHeadHeight()
      if (stakesEpochAt(head) !== this.stakesCapturedFor)
        await this.captureElectionStakes(head)
    }
    catch (e) {
      logEvent(this.db, 'error', `capturing election stakes failed: ${(e as Error).message}`)
    }
  }

  /**
   * Rewards of an epoch are split by the stakes fixed at the election block before it, so restakes received
   * during an epoch only count from the next one. Snapshots taken late (e.g. after a restart) are approximate.
   */
  private async captureElectionStakes(head: number) {
    if (this.capturingStakes)
      return
    this.capturingStakes = true
    try {
      const epoch = stakesEpochAt(head)
      const election = electionBlockFor(head)
      const missing = this.db.select({ address: pools.address, walletAddress: pools.walletAddress }).from(pools).where(and(
        isNotNull(pools.stakingSince),
        eq(pools.excluded, false),
        notExists(this.db.select().from(epochStakes).where(and(eq(epochStakes.pool, pools.address), eq(epochStakes.epoch, epoch)))),
      )).all()
      let complete = true
      for (const p of missing) {
        const [staker, validator] = await Promise.all([this.client.getStaker(p.walletAddress!), this.client.getValidator(p.address)])
        if (!staker || !validator) {
          complete = false
          continue
        }
        this.db.insert(epochStakes).values({
          pool: p.address,
          epoch,
          electionHeight: election,
          snapshotHeight: head,
          stakerBalance: staker.balance,
          validatorStake: validator.totalStake,
        }).onConflictDoNothing().run()
      }
      if (complete)
        this.stakesCapturedFor = epoch
      if (missing.length)
        logEvent(this.db, 'info', `captured election stakes of ${missing.length} pools for epoch ${epoch} (${head - election} blocks after the election)`)
    }
    finally {
      this.capturingStakes = false
    }
  }

  async tick() {
    const head = await this.client.getHeadHeight()
    const consensus = await this.client.isConsensusEstablished()
    this.publishNode(head, consensus)
    if (!consensus)
      return
    await this.captureElectionStakes(head)

    if (Date.now() - this.lastPoolSync > config.poolSyncMinutes * 60_000)
      await this.syncPools()

    const fundingBalance = (await this.client.getAccount(addr(this.funding))).balance
    setMeta(this.db, 'funding_balance', String(fundingBalance))
    let available = fundingBalance - this.pendingFunding()

    const monitored = this.db.select().from(pools).where(and(isNotNull(pools.walletAddress), eq(pools.excluded, false))).orderBy(asc(pools.walletIndex)).all()
    for (const pool of monitored) {
      try {
        available = await this.processPool(pool, head, available)
      }
      catch (e) {
        logEvent(this.db, 'error', `processing failed: ${(e as Error).message}`, pool.address)
      }
    }
    this.publishNode(head, true)
  }

  private publishNode(head: number, consensus: boolean) {
    setMeta(this.db, 'node', JSON.stringify({ head, consensus, ts: Date.now() }))
  }

  /** Funding transactions that were sent but may not yet be reflected in the balance. */
  private pendingFunding() {
    const { n } = this.db.select({ n: count() }).from(pendingTxs).where(and(eq(pendingTxs.kind, 'fund'), gt(pendingTxs.sentAt, Date.now() - PENDING_TTL_MS))).get()!
    return n * stakeLuna
  }

  async syncPools() {
    const list = await fetchPools()
    this.db.update(pools).set({ listed: false }).run()
    let next = (this.db.select({ m: max(pools.walletIndex) }).from(pools).get()?.m ?? 0) + 1
    for (const v of list) {
      const listing = {
        name: v.name,
        website: v.website ?? null,
        accentColor: v.accentColor ?? null,
        listedFee: v.fee,
        payoutType: v.payoutType,
        payoutSchedule: v.payoutSchedule ?? null,
        listed: true,
      }
      this.db.insert(pools).values({ address: v.address, ...listing }).onConflictDoUpdate({ target: pools.address, set: listing }).run()
      if (config.poolExclude.includes(v.address))
        continue
      const row = this.db.select({ walletIndex: pools.walletIndex }).from(pools).where(eq(pools.address, v.address)).get()
      if (row?.walletIndex == null) {
        const kp = deriveKeyPair(this.mnemonic, next)
        this.db.update(pools).set({ walletIndex: next, walletAddress: addr(kp) }).where(eq(pools.address, v.address)).run()
        logEvent(this.db, 'info', `new pool "${v.name}" -> dedicated wallet #${next} ${addr(kp)}`, v.address)
        next++
      }
    }
    this.applyExclusions()
    this.lastPoolSync = Date.now()
  }

  /** Excluded pools are skipped entirely: no funding, staking or monitoring. */
  private applyExclusions() {
    const excluded = new Set(config.poolExclude)
    for (const p of this.db.select({ address: pools.address, name: pools.name, excluded: pools.excluded }).from(pools).all()) {
      const shouldExclude = excluded.has(p.address)
      if (shouldExclude === p.excluded)
        continue
      this.db.update(pools).set({ excluded: shouldExclude }).where(eq(pools.address, p.address)).run()
      if (shouldExclude)
        this.setStatus(p.address, 'excluded', 'excluded via POOL_EXCLUDE')
      logEvent(this.db, 'info', `"${p.name}" ${shouldExclude ? 'excluded from' : 'included in'} monitoring`, p.address)
    }
  }

  private setStatus(address: string, status: string, detail: string | null = null) {
    this.db.update(pools).set({ status, statusDetail: detail, updatedAt: Date.now() }).where(eq(pools.address, address)).run()
  }

  private updatePool(address: string, values: Partial<Pool>) {
    this.db.update(pools).set(values).where(eq(pools.address, address)).run()
  }

  private hasPending(pool: string) {
    this.db.delete(pendingTxs).where(lt(pendingTxs.sentAt, Date.now() - PENDING_TTL_MS)).run()
    return !!this.db.select().from(pendingTxs).where(eq(pendingTxs.pool, pool)).get()
  }

  private async send(tx: Nimiq.Transaction, kp: Nimiq.KeyPair, pool: string, kind: string) {
    tx.sign(kp, undefined)
    const res = await this.client.sendTransaction(tx)
    const pending = { pool, kind, sentAt: Date.now() }
    this.db.insert(pendingTxs).values({ hash: res.transactionHash, ...pending }).onConflictDoUpdate({ target: pendingTxs.hash, set: pending }).run()
    return res.transactionHash
  }

  /** Returns the funding balance still available after this pool's needs. */
  private async processPool(pool: Pool, head: number, available: number): Promise<number> {
    const wallet = pool.walletAddress!
    const kp = deriveKeyPair(this.mnemonic, pool.walletIndex!)
    const liquid = (await this.client.getAccount(wallet)).balance
    const staker = await this.client.getStaker(wallet)
    const staked = staker ? staker.balance + staker.inactiveBalance + staker.retiredBalance : 0
    this.updatePool(pool.address, { liquidLuna: liquid, stakeLuna: staked, updatedAt: Date.now() })
    const pending = this.hasPending(pool.address)

    if (!staker) {
      if (pending)
        return available
      if (liquid >= stakeLuna) {
        const tx = Nimiq.TransactionBuilder.newCreateStaker(
          Nimiq.Address.fromString(wallet),
          Nimiq.Address.fromString(pool.address),
          BigInt(stakeLuna),
          BigInt(config.feeLuna),
          head,
          this.networkId,
        )
        const hash = await this.send(tx, kp, pool.address, 'stake')
        this.setStatus(pool.address, 'staking_tx_sent', hash)
        logEvent(this.db, 'info', `staking ${config.stakeNim} NIM (${hash})`, pool.address)
      }
      else if (available >= stakeLuna - liquid + config.feeLuna) {
        const amount = stakeLuna - liquid
        const tx = Nimiq.TransactionBuilder.newBasic(
          this.funding.toAddress(),
          Nimiq.Address.fromString(wallet),
          BigInt(amount),
          BigInt(config.feeLuna),
          head,
          this.networkId,
        )
        const hash = await this.send(tx, this.funding, pool.address, 'fund')
        this.setStatus(pool.address, 'funding_sent', hash)
        logEvent(this.db, 'info', `funded with ${amount / LUNA_PER_NIM} NIM (${hash})`, pool.address)
        return available - amount - config.feeLuna
      }
      else {
        this.setStatus(pool.address, 'awaiting_funds', `needs ${config.stakeNim} NIM from the funding wallet`)
      }
      return available
    }

    if (staker.delegation !== pool.address) {
      this.setStatus(pool.address, 'error', `staker delegates to ${staker.delegation ?? 'nobody'}`)
      return available
    }

    // Staking is established.
    if (!pool.stakingSince) {
      const from = Policy.lastMacroBlock(head)
      const started = { stakingSince: Date.now(), lastTxHeight: from, lastRewardHeight: from }
      this.updatePool(pool.address, started)
      pool = { ...pool, ...started }
      logEvent(this.db, 'info', 'stake confirmed - monitoring payouts', pool.address)
    }
    if (pool.stakeHeight == null || pool.stakeInitial == null || pool.stakeTxHash == null)
      pool = await this.recordStakeHeight(pool, wallet)
    this.setStatus(pool.address, 'staking')

    await this.collectDirectPayouts(pool, wallet, head)
    await this.scanRewardAddress(pool, wallet, head)
    this.recordUnmatchedGrowth(pool, staker.balance, head)
    return available
  }

  /**
   * Scans `address` from the pool's stored position. Only confirmed transactions are handed to `onTx`; the position
   * then moves to the last finalized macro block (the client docs require a height that cannot be forked from), so
   * anything newer is scanned again next time. An incomplete scan keeps the old position.
   */
  private async scan(address: string, from: number, head: number, onTx: (tx: ConfirmedTx) => void) {
    const { txs, complete } = await historySince(this.client, address, from)
    for (const tx of txs) {
      if (tx.state === 'confirmed' && tx.executionResult !== false && tx.blockHeight && tx.timestamp)
        onTx(tx as ConfirmedTx)
    }
    return complete ? Policy.lastMacroBlock(head) : from
  }

  private recordPayout(pool: string, kind: 'direct' | 'restake', tx: ConfirmedTx) {
    const { changes } = this.db.insert(payouts).values({
      id: tx.transactionHash,
      pool,
      kind,
      amount: tx.value,
      blockHeight: tx.blockHeight,
      ts: tx.timestamp,
    }).onConflictDoNothing().run()
    return changes > 0
  }

  /** Direct payouts are plain incoming transfers to the dedicated wallet (not from our funding wallet). */
  private async collectDirectPayouts(pool: Pool, wallet: string, head: number) {
    const fundingAddr = addr(this.funding)
    const next = await this.scan(wallet, pool.lastTxHeight ?? Policy.lastMacroBlock(head), head, (tx) => {
      if (tx.recipient !== wallet || tx.sender === wallet || tx.sender === fundingAddr)
        return
      if (this.recordPayout(pool.address, 'direct', tx))
        logEvent(this.db, 'info', `direct payout ${(tx.value / LUNA_PER_NIM).toFixed(5)} NIM from ${tx.sender}`, pool.address)
    })
    this.updatePool(pool.address, { lastTxHeight: next })
  }

  /** Our stake only earns from the epoch after the one our create-staker transaction landed in. */
  private async recordStakeHeight(pool: Pool, wallet: string): Promise<Pool> {
    const { txs } = await historySince(this.client, wallet, 0)
    const create = txs.find(tx => tx.state === 'confirmed' && tx.blockHeight && tx.sender === wallet
      && tx.recipient === Policy.STAKING_CONTRACT_ADDRESS && tx.data.type === 'create-staker')
    // Peers sometimes return an incomplete history; retried on the next tick.
    if (!create?.blockHeight)
      return pool
    const stake = {
      stakeHeight: create.blockHeight,
      eligibleEpoch: eligibleEpoch(create.blockHeight),
      stakeInitial: create.value,
      stakeTxHash: create.transactionHash,
    }
    this.updatePool(pool.address, stake)
    if (pool.stakeHeight == null)
      logEvent(this.db, 'info', `stake included at block ${stake.stakeHeight}; earns rewards from epoch ${stake.eligibleEpoch}`, pool.address)
    return { ...pool, ...stake }
  }

  /**
   * The validator's reward address (from the staking contract) receives the gross reward inherents. Pools usually
   * also pay restakes from it: add-stake transactions to the staking contract whose data names our wallet as staker.
   */
  private async scanRewardAddress(pool: Pool, wallet: string, head: number) {
    const validator = await this.client.getValidator(pool.address)
    if (!validator) {
      logEvent(this.db, 'warn', 'validator not found on chain', pool.address)
      return
    }
    const rewardAddress = validator.rewardAddress
    this.updatePool(pool.address, { rewardAddress, totalStake: validator.totalStake })

    const next = await this.scan(rewardAddress, pool.lastRewardHeight ?? Policy.lastMacroBlock(head), head, (tx) => {
      if (tx.sender === Policy.COINBASE_ADDRESS && tx.recipient === rewardAddress) {
        this.db.insert(rewardEvents).values({
          txHash: tx.transactionHash,
          pool: pool.address,
          blockHeight: tx.blockHeight,
          ts: tx.timestamp,
          reward: tx.value,
          rewardedEpoch: rewardedEpoch(tx.blockHeight),
        }).onConflictDoNothing().run()
      }
      else if (tx.sender === rewardAddress && tx.data.type === 'add-stake' && tx.data.staker === wallet) {
        if (this.recordPayout(pool.address, 'restake', tx))
          logEvent(this.db, 'info', `restake payout ${(tx.value / LUNA_PER_NIM).toFixed(5)} NIM (${tx.transactionHash})`, pool.address)
      }
    })
    this.updatePool(pool.address, { lastRewardHeight: next })
  }

  /**
   * Add stake can be sent "from any external address", so a pool may restake from somewhere other than its reward
   * address. Staker-balance growth not explained by matched add-stake transactions is recorded without a hash once it
   * has stayed unexplained for a grace period (matching transactions can lag behind the balance).
   */
  private recordUnmatchedGrowth(pool: Pool, stakerBalance: number, head: number) {
    if (pool.stakeInitial == null)
      return
    const { restaked } = this.db.select({ restaked: sql<number>`coalesce(sum(${payouts.amount}), 0)` }).from(payouts).where(and(eq(payouts.pool, pool.address), eq(payouts.kind, 'restake'))).get()!
    const unmatched = stakerBalance - pool.stakeInitial - restaked
    if (unmatched <= 0) {
      this.unmatchedGrowthSince.delete(pool.address)
      return
    }
    const since = this.unmatchedGrowthSince.get(pool.address) ?? Date.now()
    this.unmatchedGrowthSince.set(pool.address, since)
    if (Date.now() - since < UNMATCHED_GROWTH_GRACE_MS)
      return
    this.db.insert(payouts).values({
      id: `growth:${pool.address}:${head}`,
      pool: pool.address,
      kind: 'restake',
      amount: unmatched,
      blockHeight: head,
      ts: Date.now(),
    }).onConflictDoNothing().run()
    logEvent(this.db, 'warn', `restake of ${(unmatched / LUNA_PER_NIM).toFixed(5)} NIM without a matching add-stake from the reward address`, pool.address)
    this.unmatchedGrowthSince.delete(pool.address)
  }
}
