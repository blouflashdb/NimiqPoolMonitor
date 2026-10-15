import type * as Nimiq from '@nimiq/core'

type Staker = Pick<Nimiq.PlainStaker, 'balance' | 'inactiveBalance' | 'inactiveRelease' | 'retiredBalance'>

export interface UnstakeInput {
  /** undefined: the staker does not exist (never created, or fully withdrawn). */
  staker: Staker | undefined
  /** End of the delegated validator's jail period, if it is jailed: inactive stake is only released after it. */
  jailRelease: number | undefined
  liquid: number
  head: number
  fee: number
  /** Protocol minimum: active + non-retired inactive stake must stay 0 or at least this much. */
  minStake: number
}

/** The next transaction that moves a pool wallet's NIM back to the funding wallet. Amounts in luna. */
export type UnstakeStep
  /** Withdraw retired stake from the staking contract (`value + fee` = retired balance). */
  = | { kind: 'remove', value: number }
  /** Retire released inactive stake so it can be withdrawn. */
    | { kind: 'retire', value: number }
  /** Set the active stake to 0; it becomes inactive and is released after the lock-up. */
    | { kind: 'deactivate' }
  /** The wallet cannot pay the fee of a signaling transaction: send `value` from the funding wallet. */
    | { kind: 'topup', value: number }
  /** Send the wallet's liquid balance (`value + fee`) to the funding wallet. */
    | { kind: 'sweep', value: number }
  /** Inactive stake is locked until `release`. */
    | { kind: 'wait', release: number }
  /** Nothing left to return. `leftover`: retired luna that cannot pay the withdrawal fee. */
    | { kind: 'done', leftover: number }

/**
 * Unstaking runs one step per tick: deactivate, wait for the release, retire, withdraw. Restake pools may still add
 * stake after the deactivation. Deactivating it right away would restart the lock of the inactive balance, so it is
 * deactivated once the inactive balance is retired; a retire must leave active + inactive at 0 or at least the
 * minimum stake, so with less than that active it keeps back the difference. Liquid NIM is swept once the staker is
 * gone; until then it pays the fees of the signaling transactions.
 */
export function nextUnstakeStep({ staker, jailRelease, liquid, head, fee, minStake }: UnstakeInput): UnstakeStep {
  if (staker) {
    const { balance: active, inactiveBalance: inactive, retiredBalance: retired } = staker
    if (retired > fee)
      return { kind: 'remove', value: retired - fee }
    const release = Math.max(staker.inactiveRelease ?? 0, jailRelease ?? 0)
    let signal: UnstakeStep | null = null
    if (inactive > 0 && head >= release) {
      const retirable = active === 0 || active >= minStake ? inactive : Math.max(0, active + inactive - minStake)
      signal = retirable > 0 ? { kind: 'retire', value: retirable } : { kind: 'deactivate' }
    }
    else if (active > 0 && inactive === 0) {
      signal = { kind: 'deactivate' }
    }
    if (signal)
      return liquid < fee ? { kind: 'topup', value: fee - liquid } : signal
    if (inactive > 0)
      return { kind: 'wait', release }
    if (liquid <= fee)
      return { kind: 'done', leftover: retired }
  }
  return liquid > fee ? { kind: 'sweep', value: liquid - fee } : { kind: 'done', leftover: 0 }
}
