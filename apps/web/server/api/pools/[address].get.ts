import { desc, eq, events } from '@nimiq-pool-monitor/db'

export default defineEventHandler((event) => {
  const address = decodeURIComponent(getRouterParam(event, 'address') ?? '')
  const pool = loadPool(address)
  if (!pool)
    throw createError({ statusCode: 404, statusMessage: 'Unknown pool' })
  return {
    network: getMeta('network') ?? null,
    pool: poolSummary(pool),
    payouts: loadPayouts(address, 'desc', 500),
    rewards: rewardHistory(pool, 200),
    events: useDb()
      .select({ ts: events.ts, level: events.level, message: events.message })
      .from(events)
      .where(eq(events.pool, address))
      .orderBy(desc(events.id))
      .limit(50)
      .all(),
  }
})
