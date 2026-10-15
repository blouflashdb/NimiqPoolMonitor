import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UNSTAKE_REQUEST_FILE } from '@nimiq-pool-monitor/db'

/**
 * Asks the worker to unstake every pool wallet and send everything back to the funding wallet. Irreversible, so it
 * needs the admin token the worker prints on startup.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: unknown }>(event).catch(() => null)
  if (!isAdminToken(body?.token, getMeta('admin_token')))
    throw createError({ statusCode: 403, statusMessage: 'Wrong admin token' })
  if (getMeta('unstake_all'))
    return { status: 'active' }
  writeFileSync(join(dataDir(), UNSTAKE_REQUEST_FILE), String(Date.now()))
  return { status: 'requested' }
})
