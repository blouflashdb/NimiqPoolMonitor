export const LUNA = 100_000
export function nim(luna: number | null | undefined, digits = 2) {
  return luna == null ? '-' : (luna / LUNA).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export const pct = (f: number | null | undefined, digits = 2) => (f == null ? '-' : `${(f * 100).toFixed(digits)}%`)
export const pp = (f: number | null | undefined) => (f == null ? '-' : `${f >= 0 ? '+' : ''}${(f * 100).toFixed(2)} pp`)
export const dateTime = (ts: number | null | undefined) => (ts ? new Date(ts).toLocaleString() : '-')
export const shortHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-6)}`
export const hours = (h: number) => (h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`)

export interface Fee {
  verdict: 'insufficient' | 'ok' | 'suspicious'
  confidence: 'none' | 'low' | 'medium' | 'high'
  realFee: number | null
  delta: number | null
  payoutCount: number
  actualLuna: number
  expectedLuna: number
  windowHours: number
  eligibleSince: number | null
  unearnedLuna: number
  unearnedCount: number
  smallRestakeCount: number
  unknownRewards: number
  approximateEpochs: number
  flags: Flag[]
}
export type Flag = 'paid_before_eligible' | 'small_restakes'
export interface Pool {
  address: string
  name: string
  website: string | null
  accentColor: string | null
  listedFee: number | null
  payoutType: string | null
  payoutSchedule: string | null
  stillListed: boolean
  walletAddress: string | null
  rewardAddress: string | null
  status: string
  statusDetail: string | null
  stakingSince: number | null
  stakeHeight: number | null
  eligibleEpoch: number | null
  stakeLuna: number
  liquidLuna: number
  totalPayoutLuna: number
  lastPayoutAt: number | null
  fee: Fee
}

export const statusLabel: Record<string, string> = {
  pending: 'Pending',
  awaiting_funds: 'Awaiting funds',
  funding_sent: 'Funding…',
  staking_tx_sent: 'Staking…',
  staking: 'Staking',
  excluded: 'Excluded',
  error: 'Error',
}

export function verdictBadge(f: Fee) {
  const prelim = f.confidence === 'low'
  if (f.verdict === 'suspicious')
    return { label: prelim ? 'Higher than listed (preliminary)' : 'Higher than listed', color: 'error' as const }
  if (f.verdict === 'ok')
    return { label: prelim ? 'Matches (preliminary)' : 'Matches listed fee', color: 'success' as const }
  return { label: f.eligibleSince == null ? 'Stake not elected yet' : 'Collecting data', color: 'neutral' as const }
}

export const flagInfo: Record<Flag, { label: string, description: string }> = {
  paid_before_eligible: {
    label: 'Pays unelected stake',
    description: 'Paid out before our stake was part of an election. Rewards should be split by the stakes fixed at each epoch\'s election, so this money comes out of other stakers\' share.',
  },
  small_restakes: {
    label: 'Restakes < 100 NIM',
    description: 'Restake payouts below 100 NIM will be rejected after the next protocol upgrade, so stakers of this pool would stop receiving rewards.',
  },
}
