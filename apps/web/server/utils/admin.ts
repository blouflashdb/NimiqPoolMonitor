import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (s: string) => createHash('sha256').update(s).digest()

/** Compares in constant time; false while the worker has not generated a token yet. */
export function isAdminToken(given: unknown, expected: string | undefined) {
  return typeof given === 'string' && !!expected && timingSafeEqual(digest(given), digest(expected))
}
