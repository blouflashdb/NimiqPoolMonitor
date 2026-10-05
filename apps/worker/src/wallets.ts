import type { DB } from './db.ts'
import process from 'node:process'
import * as Nimiq from '@nimiq/core'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { getMeta, setMeta } from './db.ts'
import { slip10Derive } from './slip10.ts'

/** Nimiq account path: m/44'/242'/0'/<index>'. Index 0 = funding wallet, 1.. = one wallet per pool. */
export function deriveKeyPair(mnemonic: string, index: number): Nimiq.KeyPair {
  const seed = mnemonicToSeedSync(mnemonic)
  const { key } = slip10Derive(seed, [44, 242, 0, index])
  return Nimiq.KeyPair.derive(Nimiq.PrivateKey.deserialize(new Uint8Array(key)))
}

export function loadMnemonic(db: DB): string {
  const fromEnv = process.env.WALLET_MNEMONIC?.trim()
  let m = fromEnv || getMeta(db, 'mnemonic')
  if (!m) {
    m = generateMnemonic(wordlist, 256)
    setMeta(db, 'mnemonic', m)
    console.log('Generated a new wallet seed (stored in the database volume).')
  }
  if (!validateMnemonic(m, wordlist))
    throw new Error('Invalid wallet mnemonic')
  if (fromEnv && !getMeta(db, 'mnemonic'))
    setMeta(db, 'mnemonic', m)
  return m
}

export const addr = (kp: Nimiq.KeyPair) => kp.toAddress().toUserFriendlyAddress()
