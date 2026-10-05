import process from 'node:process'
import { fileURLToPath } from 'node:url'

const env = process.env
const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d)
const list = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)

/** Pools still listed in the validators-api but not operational for a long time. */
const DEFAULT_POOL_EXCLUDE = [
  'NQ85 EA0M YF3E P9AX SM2C 58KX GD0B SXJE K2PJ', // Nova Pool
  'NQ12 M1PJ QH7K DNAC JREU 0LD0 M4YS TQKA 751B', // Techbits Validator
]

const network = env.NIMIQ_NETWORK || 'MainAlbatross'
const isMain = network.toLowerCase() === 'mainalbatross'

export const LUNA_PER_NIM = 100_000
export const config = {
  network,
  /** Defaults to data/ at the repository root, shared with the web app in development. */
  dataDir: env.DATA_DIR || fileURLToPath(new URL('../../../data', import.meta.url)),
  validatorsApiUrl: env.VALIDATORS_API_URL
    || (isMain ? 'https://validators-api-main.je-cf9.workers.dev' : 'https://validators-api-test.je-cf9.workers.dev'),
  /** Stake per dedicated wallet in NIM (protocol minimum is 100). */
  stakeNim: Math.max(100, num(env.STAKE_NIM, 100)),
  /** Transaction fee in luna (0 is accepted by the network). */
  feeLuna: num(env.TX_FEE_LUNA, 0),
  tickSeconds: num(env.TICK_SECONDS, 120),
  poolSyncMinutes: num(env.POOL_SYNC_MINUTES, 15),
  logLevel: env.NODE_LOG_LEVEL || 'error',
  /** Optionally restrict monitoring to these validator addresses (comma separated). */
  poolAllowlist: list(env.POOL_ALLOWLIST ?? ''),
  /** Validator addresses never funded or monitored (comma separated). Unset = defaults, empty = exclude nothing. */
  poolExclude: env.POOL_EXCLUDE === undefined ? DEFAULT_POOL_EXCLUDE : list(env.POOL_EXCLUDE),
}
export const stakeLuna = config.stakeNim * LUNA_PER_NIM
