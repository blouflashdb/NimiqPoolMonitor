export interface PayoutPoint { ts: number, amount: number, kind: string }

/** A gross reward inherent of the validator plus the stakes fixed at the election of the epoch it pays for. */
export interface RewardPoint {
  ts: number
  reward: number
  epoch: number
  stakes: { stakerBalance: number, validatorStake: number, lagBlocks: number } | null
}

export type Verdict = 'insufficient' | 'ok' | 'suspicious'
export type Confidence = 'none' | 'low' | 'medium' | 'high'
export type Flag = 'paid_before_eligible' | 'small_restakes'

export interface FeeResult {
  verdict: Verdict
  confidence: Confidence
  /** Measured fee as fraction 0..1 (can be slightly negative from timing noise). */
  realFee: number | null
  /** realFee - listedFee */
  delta: number | null
  payoutCount: number
  actualLuna: number
  expectedLuna: number
  windowStart: number | null
  windowEnd: number | null
  windowHours: number
  /** Time of the first reward our stake was entitled to. */
  eligibleSince: number | null
  /** Payouts received before our stake earned anything. */
  unearnedLuna: number
  unearnedCount: number
  smallRestakeCount: number
  /** Rewards in the window whose election stakes are unknown (counted as 0). */
  unknownRewards: number
  /** Epochs in the window whose election stakes were captured late. */
  approximateEpochs: number
  flags: Flag[]
}

export interface FeeOptions {
  listedFee: number | null
  /** First epoch our stake earns rewards in (null while unknown). */
  eligibleEpoch: number | null
  /** Allowed excess over the listed fee before a pool is flagged (fraction, 0.01 = 1 percentage point). */
  tolerance: number
  /** Restake payouts below this will be rejected after the next protocol upgrade. */
  minRestakeLuna: number
  /** Election stakes captured later than this are treated as approximate. */
  maxSnapshotLagBlocks: number
}

/** Our entitled share of one reward: 0 before our stake was elected, null if the election stakes are unknown. */
export function rewardShare(r: RewardPoint, eligibleEpoch: number | null): number | null {
  if (eligibleEpoch == null)
    return null
  if (r.epoch < eligibleEpoch)
    return 0
  if (!r.stakes || r.stakes.validatorStake <= 0)
    return null
  return r.reward * r.stakes.stakerBalance / r.stakes.validatorStake
}

/** A payout before our first entitled reward pays stake that wasn't elected yet (unknown while eligibility is). */
export function paidBeforeEligible(ts: number, eligibleEpoch: number | null, eligibleSince: number | null) {
  return eligibleEpoch != null && (eligibleSince == null || ts < eligibleSince)
}

/**
 * Real fee = 1 - received / entitled.
 *
 * Our stake earns from the epoch after it was added, and each reward inherent pays for the previous batch, so
 * entitlement starts with the first reward attributed to that epoch. Rewards are split by the stakes fixed at the
 * epoch's election, not by current balances.
 *
 * Pools pay in lumps, so to avoid counting rewards whose payout hasn't happened yet (or payouts for rewards before
 * the window) the window is anchored on payouts: it starts at the first payout after entitlement began (excluded,
 * it covers an unknown earlier period) and ends at the last payout.
 */
export function computeFee(payoutsIn: PayoutPoint[], rewardsIn: RewardPoint[], o: FeeOptions): FeeResult {
  const payouts = [...payoutsIn].sort((a, b) => a.ts - b.ts)
  const rewards = [...rewardsIn].sort((a, b) => a.ts - b.ts)

  const eligibleSince = o.eligibleEpoch == null ? null : rewards.find(r => r.epoch >= o.eligibleEpoch!)?.ts ?? null
  // With a known eligible epoch but no entitled reward yet, everything received so far is unearned.
  const unearned = payouts.filter(p => paidBeforeEligible(p.ts, o.eligibleEpoch, eligibleSince))
  const counted = eligibleSince == null ? [] : payouts.filter(p => p.ts >= eligibleSince)
  const smallRestakeCount = payouts.filter(p => p.kind === 'restake' && p.amount < o.minRestakeLuna).length

  const flags: Flag[] = []
  if (unearned.length)
    flags.push('paid_before_eligible')
  if (smallRestakeCount)
    flags.push('small_restakes')

  const base: FeeResult = {
    verdict: 'insufficient',
    confidence: 'none',
    realFee: null,
    delta: null,
    payoutCount: counted.length,
    actualLuna: 0,
    expectedLuna: 0,
    windowStart: null,
    windowEnd: null,
    windowHours: 0,
    eligibleSince,
    unearnedLuna: unearned.reduce((s, p) => s + p.amount, 0),
    unearnedCount: unearned.length,
    smallRestakeCount,
    unknownRewards: 0,
    approximateEpochs: 0,
    flags,
  }
  if (counted.length < 2)
    return base

  const start = counted[0]!.ts
  const end = counted[counted.length - 1]!.ts
  const windowHours = (end - start) / 3_600_000
  const inWindow = rewards.filter(r => r.ts > start && r.ts <= end)
  const shares = inWindow.map(r => rewardShare(r, o.eligibleEpoch))
  const expected = shares.reduce<number>((s, x) => s + (x ?? 0), 0)
  const unknownRewards = shares.filter(x => x == null).length
  const approximateEpochs = new Set(inWindow
    .filter(r => r.epoch >= o.eligibleEpoch! && r.stakes && r.stakes.lagBlocks > o.maxSnapshotLagBlocks)
    .map(r => r.epoch)).size
  const actual = counted.slice(1).reduce((s, p) => s + p.amount, 0)
  const windowed = { ...base, actualLuna: actual, expectedLuna: expected, windowStart: start, windowEnd: end, windowHours, unknownRewards, approximateEpochs }
  if (expected <= 0)
    return windowed

  const realFee = 1 - actual / expected
  const confidence: Confidence = windowHours < 12 || unknownRewards || approximateEpochs ? 'low' : windowHours < 72 ? 'medium' : 'high'
  const delta = o.listedFee == null ? null : realFee - o.listedFee
  return {
    ...windowed,
    verdict: delta != null && delta > o.tolerance ? 'suspicious' : 'ok',
    confidence,
    realFee,
    delta,
  }
}
