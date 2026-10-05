import type { PayoutPoint, RewardPoint } from '../utils/fees'
import { describe, expect, it } from 'vitest'
import { computeFee, electionStakes, rewardShare } from '../utils/fees'

const H = 3_600_000
const NIM = 100_000
const opts = { listedFee: 0.05, eligibleEpoch: 2, tolerance: 0.01, minRestakeLuna: 100 * NIM, maxSnapshotLagBlocks: 60 }
const stakes = { stakerBalance: 100, validatorStake: 10_000, lagBlocks: 2 }

// Epoch 1 = hours 1..12 (our stake not elected yet), epoch 2+ = hours 13..; each hourly reward of 10_000
// gives us 1% = 100 when we're elected.
const rewards: RewardPoint[] = Array.from({ length: 100 }, (_, i) => ({
  ts: (i + 1) * H,
  reward: 10_000,
  epoch: i < 12 ? 1 : 2 + Math.floor((i - 12) / 12),
  stakes,
}))
const payout = (hour: number, amount: number, kind = 'direct'): PayoutPoint => ({ ts: hour * H, amount, kind })

describe('electionStakes', () => {
  const ours = 'NQ00 OURS'
  const read = { electionHeight: 1000, snapshotHeight: 1005, stakerBalance: 150, validatorStake: 10_300 }

  it('subtracts the pool restakes between the election and the read', () => {
    const additions = [
      { staker: ours, blockHeight: 1001, amount: 50 },
      { staker: 'NQ00 OTHER', blockHeight: 1005, amount: 250 },
    ]
    expect(electionStakes(read, additions, ours)).toEqual({ stakerBalance: 100, validatorStake: 10_000, lagBlocks: 5 })
  })

  it('keeps restakes up to the election and after the read', () => {
    const additions = [
      { staker: ours, blockHeight: 999, amount: 50 },
      { staker: ours, blockHeight: 1000, amount: 50 },
      { staker: ours, blockHeight: 1006, amount: 50 },
    ]
    expect(electionStakes(read, additions, ours)).toEqual({ stakerBalance: 150, validatorStake: 10_300, lagBlocks: 5 })
  })

  it('an exact read at the election block is unchanged', () => {
    const atElection = { ...read, snapshotHeight: 1000 }
    expect(electionStakes(atElection, [{ staker: ours, blockHeight: 1001, amount: 50 }], ours))
      .toEqual({ stakerBalance: 150, validatorStake: 10_300, lagBlocks: 0 })
  })
})

describe('rewardShare', () => {
  it('nothing before the stake was elected', () => {
    expect(rewardShare(rewards[0]!, 2)).toBe(0)
  })
  it('pro-rata by election stakes', () => {
    expect(rewardShare(rewards[12]!, 2)).toBe(100)
  })
  it('unknown without election stakes or eligibility', () => {
    expect(rewardShare({ ...rewards[12]!, stakes: null }, 2)).toBeNull()
    expect(rewardShare(rewards[12]!, null)).toBeNull()
  })
})

describe('computeFee', () => {
  it('honest pool', () => {
    // first entitled reward at hour 13; payouts cover the previous 12 h each
    const r = computeFee([payout(14, 1), payout(26, 1140), payout(38, 1140)], rewards, opts)
    expect(r.eligibleSince).toBe(13 * H)
    expect(r.realFee).toBeCloseTo(0.05, 9)
    expect(r.verdict).toBe('ok')
    expect(r.confidence).toBe('medium')
    expect(r.flags).toEqual([])
  })

  it('hidden fee is flagged', () => {
    const r = computeFee([payout(14, 1), payout(26, 1080), payout(38, 1080)], rewards, opts)
    expect(r.realFee).toBeCloseTo(0.1, 9)
    expect(r.verdict).toBe('suspicious')
  })

  it('payouts before the stake was elected are unearned, not rewards', () => {
    const early = [payout(2, 3, 'restake'), payout(5, 3, 'restake')]
    const r = computeFee([...early, payout(14, 1), payout(26, 1140), payout(38, 1140)], rewards, opts)
    expect(r.unearnedCount).toBe(2)
    expect(r.unearnedLuna).toBe(6)
    expect(r.flags).toContain('paid_before_eligible')
    expect(r.realFee).toBeCloseTo(0.05, 9)
  })

  it('everything is unearned while no entitled reward has arrived yet', () => {
    const r = computeFee([payout(2, 3, 'restake')], rewards.slice(0, 12), opts)
    expect(r.eligibleSince).toBeNull()
    expect(r.flags).toEqual(['paid_before_eligible', 'small_restakes'])
    expect(r.verdict).toBe('insufficient')
  })

  it('restakes below 100 NIM are flagged', () => {
    const r = computeFee([payout(14, 50 * NIM, 'restake'), payout(26, 150 * NIM, 'restake')], rewards, opts)
    expect(r.smallRestakeCount).toBe(1)
    expect(r.flags).toEqual(['small_restakes'])
  })

  it('missing or late election stakes lower the confidence', () => {
    const withGaps = rewards.map(r => (r.epoch === 3 ? { ...r, stakes: null } : r))
    const missing = computeFee([payout(14, 1), payout(50, 2280)], withGaps, opts)
    expect(missing.unknownRewards).toBe(12)
    expect(missing.confidence).toBe('low')

    const late = rewards.map(r => (r.epoch === 3 ? { ...r, stakes: { ...stakes, lagBlocks: 500 } } : r))
    const approx = computeFee([payout(14, 1), payout(50, 3420)], late, opts)
    expect(approx.approximateEpochs).toBe(1)
    expect(approx.confidence).toBe('low')
  })

  it('needs two entitled payouts', () => {
    expect(computeFee([payout(14, 10)], rewards, opts).verdict).toBe('insufficient')
    expect(computeFee([payout(14, 10), payout(26, 10)], rewards, { ...opts, eligibleEpoch: null }).verdict).toBe('insufficient')
  })
})
