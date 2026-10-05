import type { FeeResult } from './fees'
import { isTxHash, watchUrl } from '../../shared/utils/explorer'
import { paidBeforeEligible } from './fees'

export interface EvidenceInput {
  generatedAt: number
  network: string | null
  pool: {
    name: string
    address: string
    rewardAddress: string | null
    walletAddress: string | null
    listedFee: number | null
    payoutType: string | null
    payoutSchedule: string | null
    stakeTxHash: string | null
    stakeHeight: number | null
    eligibleEpoch: number | null
  }
  fee: FeeResult
  minRestakeLuna: number
  payouts: { id: string, kind: string, amount: number, blockHeight: number | null, ts: number }[]
  rewards: {
    hash: string
    blockHeight: number
    ts: number
    reward: number
    epoch: number
    electionHeight: number | null
    stakerBalance: number | null
    validatorStake: number | null
    share: number | null
  }[]
}

const COLUMNS = [
  'type',
  'time_utc',
  'block',
  'epoch',
  'tx_hash',
  'explorer_url',
  'kind',
  'amount_nim',
  'gross_reward_nim',
  'election_block',
  'our_election_stake_nim',
  'validator_election_stake_nim',
  'entitled_nim',
  'in_fee_window',
  'issues',
  'note',
] as const
type Row = Partial<Record<(typeof COLUMNS)[number], string | number | null>>

const nim = (luna: number | null | undefined, digits = 5) => (luna == null ? '' : (luna / 100_000).toFixed(digits))
const utc = (ts: number | null | undefined) => (ts == null ? '' : new Date(ts).toISOString())
const pct = (f: number | null) => (f == null ? '' : `${(f * 100).toFixed(4)}%`)

function cell(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * One CSV a pool can check line by line: a summary, then every payout and gross reward in time order, each with its
 * transaction hash and explorer link, our entitled share, whether it falls in the fee window and any issues.
 */
export function buildEvidenceCsv(e: EvidenceInput) {
  const { pool, fee } = e
  const link = (v: string | number | null | undefined) => (v == null ? '' : watchUrl(v, e.network))
  const summary = (kind: string, note: string | number | null, extra: Row = {}): Row => ({ type: 'summary', kind, note, ...extra })

  const rows: Row[] = [
    summary('pool', pool.name),
    summary('validator_address', pool.address, { explorer_url: link(pool.address) }),
    summary('reward_address', pool.rewardAddress, { explorer_url: link(pool.rewardAddress) }),
    summary('dedicated_wallet', pool.walletAddress, { explorer_url: link(pool.walletAddress) }),
    summary('stake_transaction', pool.stakeTxHash, { tx_hash: pool.stakeTxHash, block: pool.stakeHeight, explorer_url: link(pool.stakeTxHash) }),
    summary('stake_elected_from_epoch', pool.eligibleEpoch),
    summary('first_entitled_reward', utc(fee.eligibleSince)),
    summary('listed_fee', `${pct(pool.listedFee)} (validators-api)`),
    summary('listed_payout', [pool.payoutType, pool.payoutSchedule].filter(Boolean).join(', ')),
    summary('fee_window', fee.windowStart == null ? 'not enough payouts yet' : `${utc(fee.windowStart)} (excl.) to ${utc(fee.windowEnd)} (incl.)`),
    summary('received_in_window_nim', nim(fee.actualLuna)),
    summary('entitled_in_window_nim', nim(fee.expectedLuna, 10)),
    summary('real_fee', pct(fee.realFee)),
    summary('difference_to_listed_fee', fee.delta == null ? '' : `${fee.delta >= 0 ? '+' : ''}${(fee.delta * 100).toFixed(4)} pp`),
    summary('paid_before_stake_elected', `${fee.unearnedCount} payouts, ${nim(fee.unearnedLuna)} NIM`),
    summary('restakes_below_100_nim', fee.smallRestakeCount),
    summary('method', 'real fee = 1 - received / entitled. entitled = gross reward x our stake at the election of the rewarded epoch / validator total stake at that election. A reward inherent in block h pays for the batch ending at h - 60. Stake added during epoch E is elected at the end of E and earns from E + 1. The fee window runs from the first payout after the first entitled reward (excluded, it covers earlier rewards) to the last payout.'),
    summary('generated', utc(e.generatedAt)),
  ]

  const inWindow = (ts: number, anchor: boolean) => {
    if (fee.windowStart == null || fee.windowEnd == null)
      return 'no'
    if (anchor && ts === fee.windowStart)
      return 'anchor (excluded)'
    return ts > fee.windowStart && ts <= fee.windowEnd ? 'yes' : 'no'
  }

  const timeline: (Row & { ts: number })[] = [
    ...e.payouts.map((p) => {
      const issues = [
        paidBeforeEligible(p.ts, pool.eligibleEpoch, fee.eligibleSince) && 'paid_before_stake_elected',
        p.kind === 'restake' && p.amount < e.minRestakeLuna && 'restake_below_100_nim',
      ].filter(Boolean).join(' ')
      const hash = isTxHash(p.id) ? p.id : null
      return {
        ts: p.ts,
        type: 'payout',
        time_utc: utc(p.ts),
        block: p.blockHeight,
        tx_hash: hash,
        explorer_url: link(hash),
        kind: p.kind,
        amount_nim: nim(p.amount),
        in_fee_window: inWindow(p.ts, true),
        issues,
        note: hash ? '' : 'staker balance grew without a matching add-stake transaction; block is when it was noticed',
      }
    }),
    ...e.rewards.map(r => ({
      ts: r.ts,
      type: 'reward',
      time_utc: utc(r.ts),
      block: r.blockHeight,
      epoch: r.epoch,
      tx_hash: r.hash,
      explorer_url: link(r.hash),
      kind: 'gross_reward_inherent',
      gross_reward_nim: nim(r.reward),
      election_block: r.electionHeight,
      our_election_stake_nim: nim(r.stakerBalance),
      validator_election_stake_nim: nim(r.validatorStake),
      entitled_nim: r.share == null ? '' : nim(r.share, 10),
      in_fee_window: inWindow(r.ts, false),
      note: r.share === 0 ? 'our stake was not elected for this epoch' : r.share == null ? 'election stakes unknown' : '',
    })),
  ].sort((a, b) => a.ts - b.ts || (a.type === b.type ? 0 : a.type === 'reward' ? -1 : 1))

  const lines = [COLUMNS.join(','), ...[...rows, ...timeline].map(r => COLUMNS.map(c => cell(r[c])).join(','))]
  return `${lines.join('\r\n')}\r\n`
}
