import type { Tx } from './history.ts'
import { expect, it, vi } from 'vitest'
import { historySince } from './history.ts'

// newest first, like the client returns them
const chain: Tx[] = Array.from({ length: 250 }, (_, i) => ({ transactionHash: `h${250 - i}`, blockHeight: 1000 - i } as Tx))

function fakeClient(pageSizes: (number | 'empty')[]) {
  let call = 0
  return {
    getTransactionsByAddress: vi.fn(async (_a: unknown, since: number | null | undefined, _k: unknown, startAt: string | null | undefined, limit: number | null | undefined) => {
      const size = pageSizes[call++] ?? limit!
      if (size === 'empty')
        return []
      const from = startAt ? chain.findIndex(t => t.transactionHash === startAt) + 1 : 0
      return chain.slice(from).filter(t => t.blockHeight! >= since!).slice(0, Math.min(size, limit!))
    }),
  }
}

it('pages until the start height is reached', async () => {
  const client = fakeClient([])
  const r = await historySince(client, 'A', 800)
  expect(r.complete).toBe(true)
  expect(r.txs).toHaveLength(201)
  expect(Math.min(...r.txs.map(t => t.blockHeight!))).toBe(800)
})

it('keeps paging after a short page instead of stopping early', async () => {
  const r = await historySince(fakeClient([14]), 'A', 800)
  expect(r.txs).toHaveLength(201)
})

it('retries one empty page', async () => {
  const r = await historySince(fakeClient([100, 'empty']), 'A', 800)
  expect(r.txs).toHaveLength(201)
})

it('an address without older transactions completes after two empty pages', async () => {
  const r = await historySince(fakeClient(['empty', 'empty']), 'A', 800)
  expect(r).toEqual({ txs: [], complete: true })
})

it('deduplicates transactions repeated across pages', async () => {
  const client = fakeClient([])
  const original = client.getTransactionsByAddress.getMockImplementation()!
  client.getTransactionsByAddress.mockImplementationOnce(async (...args) => [...await original(...args), chain[0]!])
  const r = await historySince(client, 'A', 800)
  expect(new Set(r.txs.map(t => t.transactionHash)).size).toBe(r.txs.length)
})
