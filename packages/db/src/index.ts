import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'

export * from './schema.ts'
// The apps import query operators from here, so there is a single drizzle-orm instance.
export { and, asc, count, desc, eq, gt, isNotNull, lt, max, notExists, sql } from 'drizzle-orm'

function connect(client: DatabaseSync) {
  client.exec('PRAGMA busy_timeout = 5000')
  return drizzle({ client })
}

export type DB = ReturnType<typeof connect>

/**
 * The web app cannot write the database, so it asks the worker to unstake everything by creating this file in the
 * data directory. The worker then records the request in meta `unstake_all` and deletes the file.
 */
export const UNSTAKE_REQUEST_FILE = 'unstake-all.request'

/** The worker owns the database: it creates it and applies the migrations. */
export function openWriter(file: string): DB {
  mkdirSync(dirname(file), { recursive: true })
  const client = new DatabaseSync(file)
  client.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON')
  const db = connect(client)
  migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
  return db
}

/** The web app only reads. */
export function openReader(file: string): DB {
  return connect(new DatabaseSync(file, { readOnly: true }))
}
