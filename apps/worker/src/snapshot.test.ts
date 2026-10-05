import type { SnapshotPool } from './snapshot.ts'
import { describe, expect, it, vi } from 'vitest'
import { readStakes } from './snapshot.ts'

const list: SnapshotPool[] = [
  { address: 'NQ00 VAL1', walletAddress: 'NQ00 W1' },
  { address: 'NQ00 VAL2', walletAddress: 'NQ00 W2' },
]

/** A client whose head advances by the given steps, one step per getHeadHeight call. */
function fakeClient(heads: number[], stakers: unknown[] = [{ balance: 100 }, { balance: 200 }]) {
  let i = 0
  return {
    getHeadHeight: vi.fn(async () => heads[Math.min(i++, heads.length - 1)]!),
    getStakers: vi.fn(async () => stakers),
    getValidators: vi.fn(async () => [{ totalStake: 10_000 }, { totalStake: 20_000 }]),
  }
}

describe('readStakes', () => {
  it('reads all pools in one batch per kind at a stable head', async () => {
    const client = fakeClient([1000, 1000])
    const res = await readStakes(client as never, list)
    expect(res).toEqual({
      height: 1000,
      exact: true,
      stakes: [
        { pool: 'NQ00 VAL1', stakerBalance: 100, validatorStake: 10_000 },
        { pool: 'NQ00 VAL2', stakerBalance: 200, validatorStake: 20_000 },
      ],
    })
    expect(client.getStakers).toHaveBeenCalledOnce()
    expect(client.getStakers).toHaveBeenCalledWith(['NQ00 W1', 'NQ00 W2'])
    expect(client.getValidators).toHaveBeenCalledWith(['NQ00 VAL1', 'NQ00 VAL2'])
  })

  it('reads again when the head moved during the read', async () => {
    const client = fakeClient([1000, 1001, 1001, 1001])
    const res = await readStakes(client as never, list)
    expect(res.height).toBe(1001)
    expect(res.exact).toBe(true)
    expect(client.getStakers).toHaveBeenCalledTimes(2)
  })

  it('gives up after three attempts and reports the later head', async () => {
    const client = fakeClient([1000, 1001, 1002, 1003, 1004, 1005])
    const res = await readStakes(client as never, list)
    expect(res).toMatchObject({ height: 1005, exact: false })
    expect(client.getStakers).toHaveBeenCalledTimes(3)
  })

  it('leaves out pools whose staker is unknown', async () => {
    const client = fakeClient([1000, 1000], [undefined, { balance: 200 }])
    const res = await readStakes(client as never, list)
    expect(res.stakes.map(s => s.pool)).toEqual(['NQ00 VAL2'])
  })
})
