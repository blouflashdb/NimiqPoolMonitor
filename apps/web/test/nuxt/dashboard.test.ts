import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import Index from '~/pages/index.vue'

// Nuxt UI components (e.g. tooltips) need the providers that <UApp> in app.vue supplies
const IndexPage = defineComponent({ render: () => h(UApp, () => h(Index)) })

const fee = {
  verdict: 'insufficient',
  confidence: 'none',
  realFee: null,
  delta: null,
  payoutCount: 0,
  actualLuna: 0,
  expectedLuna: 0,
  windowHours: 0,
  eligibleSince: 0,
  unearnedLuna: 0,
  unearnedCount: 0,
  smallRestakeCount: 0,
  unknownRewards: 0,
  approximateEpochs: 0,
  flags: [] as string[],
}
function pool(name: string, extra: object) {
  return {
    address: `NQ00 ${name}`,
    name,
    website: null,
    accentColor: null,
    listedFee: 0.03,
    payoutType: 'restake',
    payoutSchedule: null,
    stillListed: true,
    walletAddress: null,
    rewardAddress: null,
    status: 'staking',
    statusDetail: null,
    stakingSince: 0,
    stakeLuna: 10_000_000,
    liquidLuna: 0,
    totalPayoutLuna: 0,
    lastPayoutAt: null,
    fee,
    ...extra,
  }
}

registerEndpoint('/api/overview', () => ({
  network: 'MainAlbatross',
  node: { head: 1, consensus: true, ts: Date.now() },
  funding: { address: 'NQ00 FUND', balanceLuna: 0, stakePerPoolLuna: 10_000_000, stillNeededLuna: 0 },
  unstake: { since: null, requested: false, wallets: 3, done: 0 },
  pools: [
    pool('Honest Pool', { fee: { ...fee, verdict: 'ok', confidence: 'high', realFee: 0.03, delta: 0, payoutCount: 9, windowHours: 96 } }),
    pool('Shady Pool', { fee: { ...fee, verdict: 'suspicious', confidence: 'high', realFee: 0.12, delta: 0.09, payoutCount: 9, windowHours: 96 } }),
    pool('Eager Pool', { fee: { ...fee, eligibleSince: null, unearnedCount: 23, flags: ['paid_before_eligible', 'small_restakes'] } }),
  ],
  excluded: [{ address: 'NQ00 DEAD', name: 'Dead Pool' }],
  events: [],
}))

it('flags pools whose real fee exceeds the listed fee', async () => {
  const page = await mountSuspended(IndexPage)
  const text = page.text()
  expect(text).toContain('Shady Pool')
  expect(text).toContain('12.00%')
  expect(text).toContain('+9.00 pp')
  expect(text).toContain('Higher than listed')
  expect(text).toContain('Matches listed fee')
})

it('shows payout warnings', async () => {
  const text = (await mountSuspended(IndexPage)).text()
  expect(text).toContain('Pays unelected stake')
  expect(text).toContain('Restakes < 100 NIM')
  expect(text).toContain('Stake not elected yet')
  expect(text).toContain('1 with payout warnings')
})

it('lists excluded pools separately', async () => {
  const page = await mountSuspended(IndexPage)
  expect(page.text()).toContain('Excluded from monitoring')
  expect(page.find('tbody').text()).not.toContain('Dead Pool')
  expect(page.text()).toContain('Dead Pool')
})

it('offers to unstake everything', async () => {
  const text = (await mountSuspended(IndexPage)).text()
  expect(text).toContain('Stop monitoring')
  expect(text).toContain('Unstake all')
  expect(text).not.toContain('Unstaking all pools')
})
