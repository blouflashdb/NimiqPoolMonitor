import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UNSTAKE_REQUEST_FILE } from '@nimiq-pool-monitor/db'

/**
 * Asks the worker to unstake every pool wallet and send everything back to the funding wallet. Requires a JSON body,
 * so a cross-site form cannot trigger it without a CORS preflight.
 */
export default defineEventHandler(async (event) => {
  if (!getHeader(event, 'content-type')?.startsWith('application/json'))
    throw createError({ statusCode: 415, statusMessage: 'Expected a JSON body' })
  const body = await readBody<{ confirm?: string }>(event)
  if (body?.confirm !== 'unstake-all')
    throw createError({ statusCode: 400, statusMessage: 'Missing confirmation' })
  if (getMeta('unstake_all'))
    return { status: 'active' }
  writeFileSync(join(dataDir(), UNSTAKE_REQUEST_FILE), String(Date.now()))
  return { status: 'requested' }
})
