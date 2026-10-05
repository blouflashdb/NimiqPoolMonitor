import process from 'node:process'
import * as Nimiq from '@nimiq/core'
import { config } from './config.ts'
import { Monitor } from './cycle.ts'
import { logEvent, openDb } from './db.ts'
import { addr, loadMnemonic } from './wallets.ts'

const db = openDb(config.dataDir)
const mnemonic = loadMnemonic(db)

const cfg = new Nimiq.ClientConfiguration()
cfg.network(config.network)
cfg.syncMode('pico')
cfg.logLevel(config.logLevel)
console.log(`Starting Nimiq web-client (${config.network}, pico)...`)
const client = await Nimiq.Client.create(cfg.build())
await client.waitForConsensusEstablished()
logEvent(db, 'info', `consensus established at block ${await client.getHeadHeight()}`)

const monitor = new Monitor(db, client, mnemonic)
await monitor.init()
console.log(`Funding wallet: ${addr(monitor.funding)} - send at least ${config.stakeNim} NIM per pool to it.`)

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0))
while (true) {
  try {
    await monitor.tick()
  }
  catch (e) {
    logEvent(db, 'error', `tick failed: ${(e as Error).message}`)
  }
  await new Promise(r => setTimeout(r, config.tickSeconds * 1000))
}
