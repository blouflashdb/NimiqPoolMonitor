import { expect, it } from 'vitest'
import { electionBlockFor, eligibleEpoch, rewardedEpoch, stakesEpochAt } from './epochs.ts'

// Mainnet: the election block 63_417_600 ends epoch 1388; batches have 60 blocks.
const ELECTION = 63_417_600

it('stake added during an epoch earns from the next one', () => {
  expect(eligibleEpoch(63_399_713)).toBe(1389)
  expect(eligibleEpoch(ELECTION - 1)).toBe(1389)
  expect(eligibleEpoch(ELECTION + 1)).toBe(1390)
})

it('rewards are paid one batch late', () => {
  expect(rewardedEpoch(ELECTION)).toBe(1388) // last macro block of 1388 pays the batch before it
  expect(rewardedEpoch(ELECTION + 60)).toBe(1388) // first macro block of 1389 still pays the last batch of 1388
  expect(rewardedEpoch(ELECTION + 120)).toBe(1389)
})

it('the election block fixes the stakes of the next epoch', () => {
  expect(stakesEpochAt(ELECTION - 1)).toBe(1388)
  expect(stakesEpochAt(ELECTION)).toBe(1389)
  expect(stakesEpochAt(ELECTION + 1)).toBe(1389)
  expect(electionBlockFor(ELECTION)).toBe(ELECTION)
  expect(electionBlockFor(ELECTION + 30_000)).toBe(ELECTION)
})
