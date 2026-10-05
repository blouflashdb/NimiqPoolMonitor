import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'

/** SLIP-0010 ed25519 hardened-only derivation (the scheme Nimiq accounts use: m/44'/242'/0'/i'). */
export function slip10Master(seed: Uint8Array) {
  const i = createHmac('sha512', 'ed25519 seed').update(seed).digest()
  return { key: i.subarray(0, 32), chain: i.subarray(32) }
}

export function slip10Child(parent: { key: Uint8Array, chain: Uint8Array }, index: number) {
  const data = Buffer.alloc(37)
  data[0] = 0
  Buffer.from(parent.key).copy(data, 1)
  data.writeUInt32BE((index | 0x80000000) >>> 0, 33)
  const i = createHmac('sha512', parent.chain).update(data).digest()
  return { key: i.subarray(0, 32), chain: i.subarray(32) }
}

export function slip10Derive(seed: Uint8Array, path: number[]) {
  return path.reduce(slip10Child, slip10Master(seed))
}
