import type { DB } from '@nimiq-pool-monitor/db'
import { join } from 'node:path'
import { eq, events, lt, meta, openWriter, sql } from '@nimiq-pool-monitor/db'

export type { DB }

const KEEP_EVENTS = 2000

/** Opens (and creates or migrates) the database the worker owns. */
export function openDb(dataDir: string): DB {
  return openWriter(join(dataDir, 'monitor.db'))
}

export function getMeta(db: DB, key: string) {
  return db.select({ value: meta.value }).from(meta).where(eq(meta.key, key)).get()?.value
}

export function setMeta(db: DB, key: string, value: string) {
  db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run()
}

export function logEvent(db: DB, level: 'info' | 'warn' | 'error', message: string, pool?: string) {
  console.log(`[${level}]${pool ? ` ${pool}` : ''} ${message}`)
  db.insert(events).values({ ts: Date.now(), level, pool: pool ?? null, message }).run()
  db.delete(events).where(lt(events.id, sql`(SELECT MAX(${events.id}) - ${KEEP_EVENTS} FROM ${events})`)).run()
}
