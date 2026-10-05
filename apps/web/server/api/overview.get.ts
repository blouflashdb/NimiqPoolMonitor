import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { desc, events, UNSTAKE_REQUEST_FILE } from '@nimiq-pool-monitor/db'

export default defineEventHandler(() => {
  const all = listPools()
  const unstakeSince = getMeta('unstake_all')
  const wallets = all.filter(p => p.walletAddress)
  const pools = all.filter(p => !p.excluded).map(poolSummary)
  const excluded = all.filter(p => p.excluded).map(p => ({ address: p.address, name: p.name }))
  const stake = Number(getMeta('stake_luna') ?? 0)
  const unfunded = pools.filter(p => p.status !== 'staking' && p.status !== 'staking_tx_sent').length
  const node = JSON.parse(getMeta('node') ?? 'null') as { head: number, consensus: boolean, ts: number } | null
  return {
    network: getMeta('network'),
    node,
    funding: {
      address: getMeta('funding_address') ?? null,
      balanceLuna: Number(getMeta('funding_balance') ?? 0),
      stakePerPoolLuna: stake,
      stillNeededLuna: unfunded * stake,
    },
    unstake: {
      /** When the worker started unstaking everything (null = not requested or not picked up yet). */
      since: unstakeSince ? Number(unstakeSince) : null,
      /** Requested, waiting for the worker's next tick. */
      requested: existsSync(join(dataDir(), UNSTAKE_REQUEST_FILE)),
      wallets: wallets.length,
      done: wallets.filter(p => p.status === 'unstaked').length,
    },
    pools,
    excluded,
    events: useDb()
      .select({ ts: events.ts, level: events.level, pool: events.pool, message: events.message })
      .from(events)
      .orderBy(desc(events.id))
      .limit(30)
      .all(),
  }
})
