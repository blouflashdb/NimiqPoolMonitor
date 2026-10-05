import type { EvidenceInput } from '../utils/evidence'
import { expect, it } from 'vitest'
import { buildEvidenceCsv } from '../utils/evidence'
import { computeFee } from '../utils/fees'

const H = 3_600_000
const NIM = 100_000
const HASH = (n: number) => n.toString(16).padStart(64, '0')

// epoch 1 (not elected): hours 1..12, epoch 2: hours 13..; we get 1% of each 10_000 luna reward once elected
const stakes = { stakerBalance: 100 * NIM, validatorStake: 10_000 * NIM, electionHeight: 5000 }
const rewards = Array.from({ length: 40 }, (_, i) => ({
  hash: HASH(1000 + i),
  blockHeight: 1000 + i * 60,
  ts: (i + 1) * H,
  reward: 10_000,
  epoch: i < 12 ? 1 : 2,
  ...stakes,
  share: i < 12 ? 0 : 100,
}))
const payouts = [
  { id: HASH(1), kind: 'restake', amount: 3, blockHeight: 900, ts: 2 * H }, // before our stake was elected
  { id: HASH(2), kind: 'restake', amount: 50, blockHeight: 1800, ts: 14 * H }, // fee window anchor
  { id: HASH(3), kind: 'restake', amount: 1080, blockHeight: 2500, ts: 26 * H }, // 10% instead of the listed 5%
  { id: 'growth:X:3000', kind: 'restake', amount: 1080, blockHeight: 3000, ts: 38 * H },
]

function csv(overrides: Partial<EvidenceInput> = {}) {
  const fee = computeFee(payouts, rewards.map(r => ({ ts: r.ts, reward: r.reward, epoch: r.epoch, stakes: { ...stakes, lagBlocks: 1 } })), { listedFee: 0.05, eligibleEpoch: 2, tolerance: 0.01, minRestakeLuna: 100 * NIM, maxSnapshotLagBlocks: 60 })
  const text = buildEvidenceCsv({
    generatedAt: 0,
    network: 'MainAlbatross',
    fee,
    minRestakeLuna: 100 * NIM,
    payouts,
    rewards,
    pool: {
      name: 'Shady, "Pool"',
      address: 'NQ08 ACT8',
      rewardAddress: 'NQ08 ACT8',
      walletAddress: 'NQ88 8SXQ',
      listedFee: 0.05,
      payoutType: 'restake',
      payoutSchedule: null,
      stakeTxHash: HASH(9),
      stakeHeight: 950,
      eligibleEpoch: 2,
    },
    ...overrides,
  })
  const [header, ...lines] = text.trimEnd().split('\r\n')
  const cols = header!.split(',')
  const unquote = (v: string) => (v.startsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v)
  const parse = (line: string) => Object.fromEntries(cols.map((c, i) => [c, unquote(line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)![i]!.replace(/,$/, ''))]))
  return { text, rows: lines.map(parse) }
}

it('summary states the measured fee and the issues', () => {
  const { rows } = csv()
  const summary = Object.fromEntries(rows.filter(r => r.type === 'summary').map(r => [r.kind, r.note]))
  expect(summary.real_fee).toBe('10.0000%')
  expect(summary.difference_to_listed_fee).toBe('+5.0000 pp')
  expect(summary.paid_before_stake_elected).toBe('1 payouts, 0.00003 NIM')
  expect(summary.restakes_below_100_nim).toBe('4')
  expect(summary.pool).toBe('Shady, "Pool"')
})

it('fields with commas or quotes are quoted per RFC 4180', () => {
  expect(csv().text).toContain('"Shady, ""Pool"""')
})

it('payout rows carry hash, explorer link, window and issues', () => {
  const p = csv().rows.filter(r => r.type === 'payout')
  expect(p.map(r => r.in_fee_window)).toEqual(['no', 'anchor (excluded)', 'yes', 'yes'])
  expect(p[0]!.issues).toBe('paid_before_stake_elected restake_below_100_nim')
  expect(p[2]!.issues).toBe('restake_below_100_nim')
  expect(p[2]!.explorer_url).toBe(`https://nimiq.watch/#${HASH(3)}`)
  expect(p[3]!.tx_hash).toBe('') // balance growth without a transaction
})

it('reward rows show the election stakes and our entitled share', () => {
  const r = csv().rows.filter(row => row.type === 'reward')
  expect(r).toHaveLength(40)
  expect(r[0]!.entitled_nim).toBe('0.0000000000')
  expect(r[0]!.note).toBe('our stake was not elected for this epoch')
  expect(r[12]!).toMatchObject({ epoch: '2', our_election_stake_nim: '100.00000', validator_election_stake_nim: '10000.00000', election_block: '5000', entitled_nim: '0.0010000000' })
})

it('rows are in time order', () => {
  const t = csv().rows.filter(r => r.type !== 'summary').map(r => r.time_utc)
  expect(t).toEqual([...t].sort())
})
