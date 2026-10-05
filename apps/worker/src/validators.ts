import { config } from './config.ts'

export interface ApiValidator {
  address: string
  name: string
  fee: number | null
  payoutType: 'restake' | 'direct' | 'none'
  payoutSchedule?: string
  accentColor?: string
  website?: string | null
  isListed?: boolean
}

/** Pools = validators that advertise a payout type (stakers get paid by them). */
export async function fetchPools(): Promise<ApiValidator[]> {
  const res = await fetch(`${config.validatorsApiUrl}/api/v1/validators`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok)
    throw new Error(`validators-api responded ${res.status}`)
  const list = await res.json() as ApiValidator[]
  return list.filter(v => v.payoutType && v.payoutType !== 'none' && typeof v.fee === 'number'
    && (config.poolAllowlist.length === 0 || config.poolAllowlist.includes(v.address)))
}
