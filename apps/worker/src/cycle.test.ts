import type * as Nimiq from '@nimiq/core'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, pendingTxs, pools, UNSTAKE_REQUEST_FILE } from '@nimiq-pool-monitor/db'
import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { config } from './config.ts'
import { Monitor } from './cycle.ts'
import { getMeta, openDb } from './db.ts'
import { fetchPools } from './validators.ts'
import { addr, deriveKeyPair } from './wallets.ts'

vi.mock('./validators.ts', () => ({ fetchPools: vi.fn(async () => []) }))

const NIM = 100_000
const HEAD = 63_417_700 // mainnet, shortly after an election
const mnemonic = generateMnemonic(wordlist, 256)
const wallet = (i: number) => addr(deriveKeyPair(mnemonic, i))

let dir: string
let db: ReturnType<typeof openDb>
let sent: Nimiq.PlainTransaction[]

/** Accounts and stakers by address; everything else is empty. */
function fakeClient(accounts: Record<string, number>, stakers: Record<string, Partial<Nimiq.PlainStaker>>) {
  return {
    getNetworkId: async () => 24,
    addHeadChangedListener: async () => 0,
    getHeadHeight: async () => HEAD,
    isConsensusEstablished: async () => true,
    getAccount: async (a: string) => ({ balance: accounts[a] ?? 0 }),
    getStaker: async (a: string) => stakers[a],
    getStakers: async (list: string[]) => list.map(a => stakers[a]),
    getValidators: async (list: string[]) => list.map(() => ({ totalStake: 1000 * NIM })),
    getValidator: async () => ({ rewardAddress: wallet(99), totalStake: 1000 * NIM }),
    getTransactionsByAddress: async () => [],
    sendTransaction: async (tx: Nimiq.Transaction) => {
      sent.push(tx.toPlain())
      return { transactionHash: tx.hash() }
    },
  } as unknown as Nimiq.Client
}

function addPool(i: number, values: Partial<typeof pools.$inferInsert> = {}) {
  db.insert(pools).values({ address: `NQ00 VAL${i}`, name: `Pool ${i}`, walletIndex: i, walletAddress: wallet(i), ...values }).run()
}
const pool = (i: number) => db.select().from(pools).where(eq(pools.address, `NQ00 VAL${i}`)).get()!

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'monitor-'))
  config.dataDir = dir
  config.poolExclude = ['NQ00 VAL2']
  db = openDb(dir)
  sent = []
})
afterEach(() => {
  db.$client.close()
  rmSync(dir, { recursive: true, force: true })
})

it('unstakes every wallet once the web app asks for it, and only then', async () => {
  const staked = { stakingSince: 1, status: 'staking', stakeHeight: 1, stakeInitial: 100 * NIM, stakeTxHash: 'x', eligibleEpoch: 1 }
  addPool(1, staked)
  addPool(2, { ...staked, excluded: true })
  addPool(3, { status: 'awaiting_funds' })
  const stakers = Object.fromEntries([1, 2].map(i => [wallet(i), { balance: 100 * NIM, inactiveBalance: 0, retiredBalance: 0, delegation: `NQ00 VAL${i}` }]))
  // Enough to fund pool 3 if funding were still on.
  const client = fakeClient({ [wallet(0)]: 500 * NIM }, stakers)

  const monitor = new Monitor(db, client, mnemonic)
  await monitor.init()
  await monitor.tick()
  expect(sent.map(tx => tx.recipient)).toEqual([wallet(3)]) // funding pool 3
  sent = []

  writeFileSync(join(dir, UNSTAKE_REQUEST_FILE), '1')
  db.delete(pendingTxs).run() // the funding never arrived
  const restarted = new Monitor(db, client, mnemonic)
  await restarted.init()
  await restarted.tick()

  expect(existsSync(join(dir, UNSTAKE_REQUEST_FILE))).toBe(false)
  expect(getMeta(db, 'unstake_all')).toBeTruthy()
  // Excluded pools are unstaked too; nothing is funded anymore.
  expect(sent.map(tx => [tx.sender, tx.data.type])).toEqual([
    [wallet(1), 'set-active-stake'],
    [wallet(2), 'set-active-stake'],
  ])
  expect(pool(1)).toMatchObject({ status: 'unstaking' })
  expect(pool(3)).toMatchObject({ status: 'unstaked', statusDetail: 'nothing to return' })
})

it('keeps unstaking after a restart and assigns no new wallets', async () => {
  db.insert(pools).values({ address: 'NQ00 VAL1', name: 'Pool 1', walletIndex: 1, walletAddress: wallet(1), status: 'unstaking' }).run()
  writeFileSync(join(dir, UNSTAKE_REQUEST_FILE), '1')
  const client = fakeClient({ [wallet(0)]: 500 * NIM, [wallet(1)]: 7 * NIM }, {})
  const first = new Monitor(db, client, mnemonic)
  await first.init()
  await first.tick()
  expect(sent.map(tx => [tx.sender, tx.recipient, tx.value])).toEqual([[wallet(1), wallet(0), 7 * NIM]])

  vi.mocked(fetchPools).mockResolvedValue([{ address: 'NQ00 NEW', name: 'New Pool', fee: 0.05, payoutType: 'restake' }])
  db.delete(pendingTxs).run() // the sweep is confirmed
  sent = []
  const restarted = new Monitor(db, fakeClient({ [wallet(0)]: 507 * NIM }, {}), mnemonic)
  await restarted.init()
  await restarted.syncPools()
  await restarted.tick()
  expect(sent).toEqual([])
  expect(db.select().from(pools).where(eq(pools.address, 'NQ00 NEW')).get()).toMatchObject({ walletAddress: null })
  expect(pool(1)).toMatchObject({ status: 'unstaked', statusDetail: 'everything sent back to the funding wallet' })
})
