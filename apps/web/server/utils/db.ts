import type { DB } from '@nimiq-pool-monitor/db'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { eq, meta, openReader } from '@nimiq-pool-monitor/db'

let db: DB | null = null

/** The worker owns and writes the database (and applies its migrations); the web app only reads it. */
export function useDb(): DB {
  if (db)
    return db
  // npm runs workspace scripts in apps/web, so the default is data/ at the repository root (shared with the worker)
  const file = join(process.env.DATA_DIR ?? '../../data', 'monitor.db')
  if (!existsSync(file))
    throw createError({ statusCode: 503, statusMessage: 'Worker has not created the database yet' })
  db = openReader(file)
  return db
}

export function getMeta(key: string) {
  return useDb().select({ value: meta.value }).from(meta).where(eq(meta.key, key)).get()?.value
}
