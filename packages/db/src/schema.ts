import { index, integer, primaryKey, real, sqliteTableCreator, text } from 'drizzle-orm/sqlite-core'

// Column names are snake_case in the database, camelCase in TypeScript.
const table = sqliteTableCreator(name => name, 'snake_case')

// Amounts are in luna (1 NIM = 100'000 luna), times in ms since epoch.

export const meta = table('meta', {
  key: text().primaryKey(),
  value: text().notNull(),
})

/** Pools from the validators-api, each with a dedicated staking wallet. */
export const pools = table('pools', {
  /** Validator address. */
  address: text().primaryKey(),
  name: text().notNull(),
  website: text(),
  accentColor: text(),
  /** Fee as claimed by the validators-api (0..1). */
  listedFee: real(),
  payoutType: text(),
  payoutSchedule: text(),
  /** Still present in the validators-api. */
  listed: integer({ mode: 'boolean' }).notNull().default(true),
  /** Never funded or monitored (POOL_EXCLUDE). */
  excluded: integer({ mode: 'boolean' }).notNull().default(false),
  walletIndex: integer().unique(),
  walletAddress: text().unique(),
  rewardAddress: text(),
  totalStake: integer(),
  status: text().notNull().default('pending'),
  statusDetail: text(),
  stakingSince: integer(),
  stakeLuna: integer().notNull().default(0),
  liquidLuna: integer().notNull().default(0),
  /** Our create-staker transaction: its block, value and hash. */
  stakeHeight: integer(),
  stakeInitial: integer(),
  stakeTxHash: text(),
  /** First epoch our stake earns rewards in. */
  eligibleEpoch: integer(),
  /** Scan positions: finalized macro blocks from which the next history scan starts. */
  lastTxHeight: integer(),
  lastRewardHeight: integer(),
  updatedAt: integer(),
})

export const pendingTxs = table('pending_txs', {
  hash: text().primaryKey(),
  pool: text().notNull().references(() => pools.address),
  kind: text().notNull(),
  sentAt: integer().notNull(),
})

/** Gross reward inherents paid to a validator. A reward in block h pays for the previous batch. */
export const rewardEvents = table('reward_events', {
  txHash: text().primaryKey(),
  pool: text().notNull().references(() => pools.address),
  blockHeight: integer().notNull(),
  ts: integer().notNull(),
  reward: integer().notNull(),
  /** epochAt(blockHeight - BLOCKS_PER_BATCH) */
  rewardedEpoch: integer().notNull(),
}, t => [index('reward_events_pool_ts').on(t.pool, t.ts)])

/** Stakes fixed at the election block that starts an epoch: the basis for splitting that epoch's rewards. */
export const epochStakes = table('epoch_stakes', {
  pool: text().notNull().references(() => pools.address),
  epoch: integer().notNull(),
  electionHeight: integer().notNull(),
  snapshotHeight: integer().notNull(),
  stakerBalance: integer().notNull(),
  validatorStake: integer().notNull(),
}, t => [primaryKey({ columns: [t.pool, t.epoch] })])

/** What the dedicated wallet really received from the pool. */
export const payouts = table('payouts', {
  /** Transaction hash, or 'growth:<pool>:<height>' for restaked balance growth without a matching transaction. */
  id: text().primaryKey(),
  pool: text().notNull().references(() => pools.address),
  kind: text({ enum: ['direct', 'restake'] }).notNull(),
  amount: integer().notNull(),
  blockHeight: integer(),
  ts: integer().notNull(),
}, t => [index('payouts_pool_ts').on(t.pool, t.ts)])

export const events = table('events', {
  id: integer().primaryKey({ autoIncrement: true }),
  ts: integer().notNull(),
  level: text({ enum: ['info', 'warn', 'error'] }).notNull(),
  pool: text(),
  message: text().notNull(),
})

export type Pool = typeof pools.$inferSelect
export type Payout = typeof payouts.$inferSelect
