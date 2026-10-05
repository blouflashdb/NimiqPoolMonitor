import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { slip10Derive } from './slip10.ts'

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

// Official SLIP-0010 ed25519 test vector 1
it('slip10 ed25519 vector 1', () => {
  const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')
  expect(hex(slip10Derive(seed, []).key)).toBe('2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7')
  expect(hex(slip10Derive(seed, [0]).key)).toBe('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3')
  expect(hex(slip10Derive(seed, [0, 1, 2, 2, 1000000000]).key)).toBe('8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793')
})
