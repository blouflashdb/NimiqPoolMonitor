import * as Nimiq from '@nimiq/core'

const { Policy } = Nimiq

/**
 * Stake added during epoch E is counted at the election block that ends E, so it earns from E + 1.
 * (Transactions are only included in micro blocks, never in the election block itself.)
 */
export function eligibleEpoch(stakeTxHeight: number) {
  return Policy.epochAt(stakeTxHeight) + 1
}

/** The reward inherent in macro block h pays for the previous batch, so the first rewards of epoch E + 1 still belong to E. */
export function rewardedEpoch(rewardHeight: number) {
  return Policy.epochAt(rewardHeight - Policy.BLOCKS_PER_BATCH)
}

/** The epoch whose stakes are fixed at `height`. An election block belongs to the epoch it ends but fixes the next one. */
export function stakesEpochAt(height: number) {
  return Policy.isElectionBlockAt(height) ? Policy.epochAt(height) + 1 : Policy.epochAt(height)
}

/** The election block that fixed the stakes of the epoch at `height`. */
export function electionBlockFor(height: number) {
  return Policy.lastElectionBlock(height)
}
