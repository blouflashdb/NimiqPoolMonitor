import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import Detail from '~/pages/pools/[address].vue'

const VALIDATOR = 'NQ08 ACT8 T0FE PTG8 P5RL H2S3 QGXH V15R NVXY'
const HASH = '83f7f3962447c5ef077e4b6ea4167c181ac615398dcec37e91e87986f9dab5f3'
const RESTAKE_HASH = 'b2ede07d388f2bdc89cd75ff699a551c6eb889a88b390342c2b1438c06c6e486'

describe('watchUrl', () => {
  it('addresses use + instead of spaces', () => {
    expect(watchUrl(VALIDATOR, 'MainAlbatross')).toBe('https://nimiq.watch/#NQ08+ACT8+T0FE+PTG8+P5RL+H2S3+QGXH+V15R+NVXY')
  })
  it('transactions, blocks and testnet', () => {
    expect(watchUrl(HASH, 'MainAlbatross')).toBe(`https://nimiq.watch/#${HASH}`)
    expect(watchUrl(63_399_713, 'TestAlbatross')).toBe('https://test.nimiq.watch/#63399713')
  })
})

const fee = {
  verdict: 'insufficient',
  confidence: 'none',
  realFee: null,
  delta: null,
  payoutCount: 0,
  actualLuna: 0,
  expectedLuna: 0,
  windowHours: 0,
  eligibleSince: null,
  unearnedLuna: 0,
  unearnedCount: 0,
  smallRestakeCount: 0,
  unknownRewards: 0,
  approximateEpochs: 0,
  flags: [],
}

// registered under the decoded path: the mock router matches after URL decoding
registerEndpoint(`/api/pools/${VALIDATOR}`, () => ({
  network: 'MainAlbatross',
  pool: {
    address: VALIDATOR,
    name: 'ImpactZero stake',
    website: null,
    accentColor: null,
    listedFee: 0,
    payoutType: 'restake',
    payoutSchedule: null,
    stillListed: true,
    walletAddress: 'NQ88 8SXQ CAMV LLM1 0LBK 8368 6X72 KHJQ BH5C',
    rewardAddress: null,
    status: 'staking',
    statusDetail: null,
    stakingSince: 0,
    stakeHeight: 63_399_713,
    eligibleEpoch: 1389,
    stakeLuna: 10_000_000,
    liquidLuna: 0,
    totalPayoutLuna: 0,
    lastPayoutAt: null,
    fee,
  },
  payouts: [
    { id: HASH, kind: 'direct', amount: 5, blockHeight: 63_400_100, ts: 3 },
    { id: RESTAKE_HASH, kind: 'restake', amount: 11, blockHeight: 63_405_736, ts: 2 },
    { id: `growth:${VALIDATOR}:63400008`, kind: 'restake', amount: 3, blockHeight: 63_400_008, ts: 1 },
  ],
  rewards: [],
  events: [],
}))

it('links addresses, transactions and blocks to nimiq.watch', async () => {
  const page = await mountSuspended(defineComponent({ render: () => h(UApp, () => h(Detail)) }), { route: `/pools/${encodeURIComponent(VALIDATOR)}` })
  const hrefs = page.findAll('a').map(a => a.attributes('href'))
  expect(hrefs).toContain('https://nimiq.watch/#NQ08+ACT8+T0FE+PTG8+P5RL+H2S3+QGXH+V15R+NVXY')
  expect(hrefs).toContain('https://nimiq.watch/#NQ88+8SXQ+CAMV+LLM1+0LBK+8368+6X72+KHJQ+BH5C')
  expect(hrefs).toContain(`https://nimiq.watch/#${HASH}`)
  expect(hrefs).toContain('https://nimiq.watch/#63400100')
  // restakes matched to their add-stake transaction are linked like any other payout
  expect(hrefs).toContain(`https://nimiq.watch/#${RESTAKE_HASH}`)
  expect(hrefs).toContain('https://nimiq.watch/#63405736')
  // unmatched balance growth has no transaction and only a detection height
  expect(hrefs).not.toContain('https://nimiq.watch/#63400008')
  expect(page.text()).toContain('no matching transaction')
  expect(hrefs).toContain(`/api/pools/${encodeURIComponent(VALIDATOR)}/evidence.csv`)
})
