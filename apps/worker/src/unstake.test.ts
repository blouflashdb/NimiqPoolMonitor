import { expect, it } from 'vitest'
import { nextUnstakeStep } from './unstake.ts'

const NIM = 100_000
function staker(s: { balance?: number, inactiveBalance?: number, inactiveRelease?: number, retiredBalance?: number } = {}) {
  return { balance: 0, inactiveBalance: 0, inactiveRelease: undefined, retiredBalance: 0, ...s }
}

it('deactivates active stake first', () => {
  expect(nextUnstakeStep(staker({ balance: 100 * NIM }), 0, 1000, 0)).toEqual({ kind: 'deactivate' })
})

it('waits for the release of inactive stake, then retires and withdraws it', () => {
  const inactive = staker({ inactiveBalance: 100 * NIM, inactiveRelease: 2000 })
  expect(nextUnstakeStep(inactive, 0, 1999, 0)).toMatchObject({ kind: 'wait', release: 2000 })
  expect(nextUnstakeStep(inactive, 0, 2000, 0)).toEqual({ kind: 'retire', value: 100 * NIM })
  expect(nextUnstakeStep(staker({ retiredBalance: 100 * NIM }), 0, 2001, 0)).toEqual({ kind: 'remove', value: 100 * NIM })
})

it('does not restart the lock of inactive stake for restakes received meanwhile', () => {
  const s = staker({ balance: 2 * NIM, inactiveBalance: 100 * NIM, inactiveRelease: 2000 })
  expect(nextUnstakeStep(s, 0, 1500, 0)).toMatchObject({ kind: 'wait' })
  expect(nextUnstakeStep(s, 0, 2000, 0)).toEqual({ kind: 'retire', value: 100 * NIM })
  expect(nextUnstakeStep(staker({ balance: 2 * NIM }), 0, 2001, 0)).toEqual({ kind: 'deactivate' })
})

it('withdraws retired stake before anything else', () => {
  const s = staker({ balance: 2 * NIM, retiredBalance: 100 * NIM })
  expect(nextUnstakeStep(s, 0, 1000, 0)).toEqual({ kind: 'remove', value: 100 * NIM })
})

it('pays the fee out of the withdrawn and swept amounts', () => {
  expect(nextUnstakeStep(staker({ retiredBalance: 100 * NIM }), 0, 1000, 10)).toEqual({ kind: 'remove', value: 100 * NIM - 10 })
  expect(nextUnstakeStep(undefined, 5 * NIM, 1000, 10)).toEqual({ kind: 'sweep', value: 5 * NIM - 10 })
  expect(nextUnstakeStep(undefined, 10, 1000, 10)).toEqual({ kind: 'done' })
})

it('waits when the wallet cannot pay the fee of a signaling transaction', () => {
  expect(nextUnstakeStep(staker({ balance: 100 * NIM }), 5, 1000, 10)).toMatchObject({ kind: 'wait', release: null })
})

it('sweeps liquid NIM only once the staker is gone', () => {
  expect(nextUnstakeStep(staker({ inactiveBalance: 100 * NIM, inactiveRelease: 2000 }), 3 * NIM, 1000, 0)).toMatchObject({ kind: 'wait' })
  expect(nextUnstakeStep(undefined, 3 * NIM, 1000, 0)).toEqual({ kind: 'sweep', value: 3 * NIM })
  expect(nextUnstakeStep(undefined, 0, 1000, 0)).toEqual({ kind: 'done' })
})
