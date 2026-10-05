export default defineEventHandler((event) => {
  const address = decodeURIComponent(getRouterParam(event, 'address') ?? '')
  const pool = loadPool(address)
  if (!pool)
    throw createError({ statusCode: 404, statusMessage: 'Unknown pool' })
  const slug = pool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pool'
  const date = new Date().toISOString().slice(0, 10)
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${slug}-fee-evidence-${date}.csv"`,
  })
  return poolEvidenceCsv(pool, getMeta('network') ?? null)
})
