import type { Pool } from '@nimiq-pool-monitor/db'
import type { RewardPoint } from './fees'
import { and, asc, desc, epochStakes, eq, payouts, pools, rewardEvents, sql } from '@nimiq-pool-monitor/db'
import { buildEvidenceCsv } from './evidence'
import { computeFee, rewardShare } from './fees'

/** Restake (add-stake) payouts below 100 NIM will be rejected after the next protocol upgrade. */
const MIN_RESTAKE_LUNA = 100 * 100_000
/** Election stakes captured more than one batch after the election are approximate. */
const MAX_SNAPSHOT_LAG_BLOCKS = 60

export function feeOptions(p: Pool) {
  return {
    listedFee: p.listedFee,
    eligibleEpoch: p.eligibleEpoch,
    tolerance: Number(useRuntimeConfig().feeTolerance),
    minRestakeLuna: MIN_RESTAKE_LUNA,
    maxSnapshotLagBlocks: MAX_SNAPSHOT_LAG_BLOCKS,
  }
}

export function loadPool(address: string) {
  return useDb().select().from(pools).where(eq(pools.address, address)).get()
}

export function listPools() {
  return useDb().select().from(pools).orderBy(sql`${pools.name} COLLATE NOCASE`).all()
}

export function loadPayouts(pool: string, order: 'asc' | 'desc' = 'asc', limit?: number) {
  const query = useDb()
    .select({ id: payouts.id, kind: payouts.kind, amount: payouts.amount, blockHeight: payouts.blockHeight, ts: payouts.ts })
    .from(payouts)
    .where(eq(payouts.pool, pool))
    .orderBy(order === 'asc' ? asc(payouts.ts) : desc(payouts.ts))
  return (limit ? query.limit(limit) : query).all()
}

/** Gross rewards, newest first, with the election stakes of the epoch each one pays for. */
function loadRewards(pool: string, limit?: number) {
  const query = useDb()
    .select({
      hash: rewardEvents.txHash,
      blockHeight: rewardEvents.blockHeight,
      ts: rewardEvents.ts,
      reward: rewardEvents.reward,
      epoch: rewardEvents.rewardedEpoch,
      electionHeight: epochStakes.electionHeight,
      stakerBalance: epochStakes.stakerBalance,
      validatorStake: epochStakes.validatorStake,
      lagBlocks: sql<number | null>`${epochStakes.snapshotHeight} - ${epochStakes.electionHeight}`,
    })
    .from(rewardEvents)
    .leftJoin(epochStakes, and(eq(epochStakes.pool, rewardEvents.pool), eq(epochStakes.epoch, rewardEvents.rewardedEpoch)))
    .where(eq(rewardEvents.pool, pool))
    .orderBy(desc(rewardEvents.ts))
  return (limit ? query.limit(limit) : query).all()
}

type RewardRow = ReturnType<typeof loadRewards>[number]

function toRewardPoint(r: RewardRow): RewardPoint {
  return {
    ts: r.ts,
    reward: r.reward,
    epoch: r.epoch,
    stakes: r.stakerBalance == null ? null : { stakerBalance: r.stakerBalance, validatorStake: r.validatorStake!, lagBlocks: r.lagBlocks! },
  }
}

/** The latest rewards with our entitled share of each (0 = not elected yet, null = election stakes unknown). */
export function rewardHistory(p: Pool, limit: number) {
  return loadRewards(p.address, limit).map(r => ({
    hash: r.hash,
    blockHeight: r.blockHeight,
    ts: r.ts,
    reward: r.reward,
    epoch: r.epoch,
    share: rewardShare(toRewardPoint(r), p.eligibleEpoch),
  }))
}

export function poolSummary(p: Pool) {
  const received = loadPayouts(p.address)
  const fee = computeFee(received, loadRewards(p.address).map(toRewardPoint), feeOptions(p))
  return {
    address: p.address,
    name: p.name,
    website: p.website,
    accentColor: p.accentColor,
    listedFee: p.listedFee,
    payoutType: p.payoutType,
    payoutSchedule: p.payoutSchedule,
    stillListed: p.listed,
    walletAddress: p.walletAddress,
    rewardAddress: p.rewardAddress,
    status: p.status,
    statusDetail: p.statusDetail,
    stakingSince: p.stakingSince,
    stakeHeight: p.stakeHeight,
    eligibleEpoch: p.eligibleEpoch,
    stakeLuna: p.stakeLuna,
    liquidLuna: p.liquidLuna,
    totalPayoutLuna: received.reduce((s, x) => s + x.amount, 0),
    lastPayoutAt: received.length ? received[received.length - 1]!.ts : null,
    fee,
  }
}

/** All payouts and gross rewards of the pool as a CSV the pool operator can verify. */
export function poolEvidenceCsv(p: Pool, network: string | null) {
  const rewards = loadRewards(p.address).reverse()
  const received = loadPayouts(p.address)
  return buildEvidenceCsv({
    generatedAt: Date.now(),
    network,
    pool: {
      name: p.name,
      address: p.address,
      rewardAddress: p.rewardAddress,
      walletAddress: p.walletAddress,
      listedFee: p.listedFee,
      payoutType: p.payoutType,
      payoutSchedule: p.payoutSchedule,
      stakeTxHash: p.stakeTxHash,
      stakeHeight: p.stakeHeight,
      eligibleEpoch: p.eligibleEpoch,
    },
    fee: computeFee(received, rewards.map(toRewardPoint), feeOptions(p)),
    minRestakeLuna: MIN_RESTAKE_LUNA,
    payouts: received,
    rewards: rewards.map(r => ({ ...r, share: rewardShare(toRewardPoint(r), p.eligibleEpoch) })),
  })
}
