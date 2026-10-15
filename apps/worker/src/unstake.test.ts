import type { UnstakeInput } from './unstake.ts'
import { expect, it } from 'vitest'
import { nextUnstakeStep } from './unstake.ts'

const NIM = 100_000
function staker(s: { balance?: number, inactiveBalance?: number, inactiveRelease?: number, retiredBalance?: number } = {}) {
  return { balance: 0, inactiveBalance: 0, inactiveRelease: undefined, retiredBalance: 0, ...s }
}
function step(input: Partial<UnstakeInput>) {
  return nextUnstakeStep({ staker: undefined, jailRelease: undefined, liquid: 0, head: 1000, fee: 0, minStake: 100 * NIM, ...input })
}

it('deactivates active stake first', () => {
  expect(step({ staker: staker({ balance: 100 * NIM }) })).toEqual({ kind: 'deactivate' })
})

it('waits for the release of inactive stake, then retires and withdraws it', () => {
  const inactive = staker({ inactiveBalance: 100 * NIM, inactiveRelease: 2000 })
  expect(step({ staker: inactive, head: 1999 })).toEqual({ kind: 'wait', release: 2000 })
  expect(step({ staker: inactive, head: 2000 })).toEqual({ kind: 'retire', value: 100 * NIM })
  expect(step({ staker: staker({ retiredBalance: 100 * NIM }), head: 2001 })).toEqual({ kind: 'remove', value: 100 * NIM })
})

it('waits for the end of the validator\'s jail period', () => {
  const inactive = staker({ inactiveBalance: 100 * NIM, inactiveRelease: 2000 })
  expect(step({ staker: inactive, head: 2500, jailRelease: 3000 })).toEqual({ kind: 'wait', release: 3000 })
  expect(step({ staker: inactive, head: 3000, jailRelease: 3000 })).toEqual({ kind: 'retire', value: 100 * NIM })
})

it('does not restart the lock of inactive stake for restakes received meanwhile', () => {
  const s = staker({ balance: 200 * NIM, inactiveBalance: 100 * NIM, inactiveRelease: 2000 })
  expect(step({ staker: s, head: 1500 })).toEqual({ kind: 'wait', release: 2000 })
  expect(step({ staker: s, head: 2000 })).toEqual({ kind: 'retire', value: 100 * NIM })
  expect(step({ staker: staker({ balance: 200 * NIM }), head: 2001 })).toEqual({ kind: 'deactivate' })
})

it('keeps the minimum stake when restakes below it are active', () => {
  // A retire must leave active + inactive at 0 or at least the minimum stake.
  const s = staker({ balance: 2 * NIM, inactiveBalance: 150 * NIM, inactiveRelease: 2000 })
  expect(step({ staker: s, head: 2000 })).toEqual({ kind: 'retire', value: 52 * NIM })
  // Nothing can be retired: fold the restakes into the inactive balance (restarts its lock).
  const rest = staker({ balance: 2 * NIM, inactiveBalance: 98 * NIM, inactiveRelease: 2000 })
  expect(step({ staker: rest, head: 2001 })).toEqual({ kind: 'deactivate' })
})

it('withdraws retired stake before anything else', () => {
  expect(step({ staker: staker({ balance: 2 * NIM, retiredBalance: 100 * NIM }) })).toEqual({ kind: 'remove', value: 100 * NIM })
})

it('pays the fee out of the withdrawn and swept amounts', () => {
  expect(step({ staker: staker({ retiredBalance: 100 * NIM }), fee: 10 })).toEqual({ kind: 'remove', value: 100 * NIM - 10 })
  expect(step({ liquid: 5 * NIM, fee: 10 })).toEqual({ kind: 'sweep', value: 5 * NIM - 10 })
  expect(step({ liquid: 10, fee: 10 })).toEqual({ kind: 'done', leftover: 0 })
})

it('tops up the fee of a signaling transaction from the funding wallet', () => {
  expect(step({ staker: staker({ balance: 100 * NIM }), liquid: 4, fee: 10 })).toEqual({ kind: 'topup', value: 6 })
  expect(step({ staker: staker({ balance: 100 * NIM }), liquid: 10, fee: 10 })).toEqual({ kind: 'deactivate' })
})

it('reports retired dust that cannot pay the withdrawal fee', () => {
  expect(step({ staker: staker({ retiredBalance: 8 }), fee: 10 })).toEqual({ kind: 'done', leftover: 8 })
})

it('sweeps liquid NIM only once the staker is gone', () => {
  const locked = staker({ inactiveBalance: 100 * NIM, inactiveRelease: 2000 })
  expect(step({ staker: locked, liquid: 3 * NIM })).toEqual({ kind: 'wait', release: 2000 })
  expect(step({ liquid: 3 * NIM })).toEqual({ kind: 'sweep', value: 3 * NIM })
  expect(step({})).toEqual({ kind: 'done', leftover: 0 })
})
