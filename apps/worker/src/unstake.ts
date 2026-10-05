import type * as Nimiq from '@nimiq/core'

type Staker = Pick<Nimiq.PlainStaker, 'balance' | 'inactiveBalance' | 'inactiveRelease' | 'retiredBalance'>

/** The next transaction that moves a pool wallet's NIM back to the funding wallet. Amounts in luna. */
export type UnstakeStep
  /** Withdraw retired stake from the staking contract (`value + fee` = retired balance). */
  = | { kind: 'remove', value: number }
  /** Retire released inactive stake so it can be withdrawn. */
    | { kind: 'retire', value: number }
  /** Set the active stake to 0; it becomes inactive and is released after the lock-up. */
    | { kind: 'deactivate' }
  /** Send the wallet's liquid balance (`value + fee`) to the funding wallet. */
    | { kind: 'sweep', value: number }
  /** Nothing to do yet: inactive stake is locked until `release` (if known), or fees cannot be paid. */
    | { kind: 'wait', release: number | null, reason: string }
    | { kind: 'done' }

/**
 * Unstaking runs one step per tick: deactivate, wait for the release, retire, withdraw. Active stake is only
 * deactivated while no stake is inactive, because deactivating more would restart the lock of the inactive balance
 * (restake pools may still add stake after the first deactivation). Liquid NIM is swept once the staker is gone; until
 * then it pays the fees of the signaling transactions.
 */
export function nextUnstakeStep(staker: Staker | undefined, liquid: number, head: number, fee: number): UnstakeStep {
  if (staker) {
    if (staker.retiredBalance > fee)
      return { kind: 'remove', value: staker.retiredBalance - fee }
    const release = staker.inactiveRelease ?? null
    const signal = staker.inactiveBalance > 0 && release != null && head >= release
      ? { kind: 'retire' as const, value: staker.inactiveBalance }
      : staker.balance > 0 && staker.inactiveBalance === 0
        ? { kind: 'deactivate' as const }
        : null
    if (signal && liquid < fee)
      return { kind: 'wait', release: null, reason: `needs ${fee} luna in the pool wallet for the transaction fee` }
    if (signal)
      return signal
    if (staker.balance > 0 || staker.inactiveBalance > 0)
      return { kind: 'wait', release, reason: 'inactive stake is locked' }
  }
  return liquid > fee ? { kind: 'sweep', value: liquid - fee } : { kind: 'done' }
}
