import { desc, events } from '@nimiq-pool-monitor/db'

export default defineEventHandler(() => {
  const all = listPools()
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
