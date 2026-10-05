import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import Index from '~/pages/index.vue'

const IndexPage = defineComponent({ render: () => h(UApp, () => h(Index)) })

registerEndpoint('/api/overview', () => ({
  network: 'MainAlbatross',
  node: { head: 1, consensus: true, ts: Date.now() },
  // Funding would otherwise be asked for: unstaked pools need stake again
  funding: { address: 'NQ00 FUND', balanceLuna: 0, stakePerPoolLuna: 10_000_000, stillNeededLuna: 20_000_000 },
  unstake: { since: Date.now(), requested: false, wallets: 2, done: 1 },
  pools: [],
  excluded: [],
  events: [],
}))

it('shows unstaking progress instead of asking for funds', async () => {
  const text = (await mountSuspended(IndexPage)).text()
  expect(text).toContain('Unstaking all pools: 1/2 wallets done')
  expect(text).not.toContain('Fund the monitor')
  expect(text).not.toContain('Stop monitoring')
})
