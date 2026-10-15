import type * as Nimiq from '@nimiq/core'

type SnapshotClient = Pick<Nimiq.Client, 'getHeadHeight' | 'getStakers' | 'getValidators'>

export interface SnapshotPool { address: string, walletAddress: string }

export interface PoolStakes {
  pool: string
  stakerBalance: number
  validatorStake: number
}

const MAX_ATTEMPTS = 3

/**
 * Reads the stakes of all pools in one batch per kind, so they reflect a single head. The client only serves the
 * current state; when the head moved during the read the height is ambiguous, so the read is repeated. After the last
 * attempt the later head is reported with `exact: false`. Pools whose validator is unknown are left out.
 */
export async function readStakes(client: SnapshotClient, list: SnapshotPool[]) {
  for (let attempt = 1; ; attempt++) {
    const before = await client.getHeadHeight()
    const [stakers, validators] = await Promise.all([
      client.getStakers(list.map(p => p.walletAddress)),
      client.getValidators(list.map(p => p.address)),
    ])
    const after = await client.getHeadHeight()
    if (before !== after && attempt < MAX_ATTEMPTS)
      continue
    const stakes: PoolStakes[] = []
    list.forEach((p, i) => {
      const staker = stakers[i]
      const validator = validators[i]
      // Only pools that have staked are read, so a missing staker was withdrawn and has no stake.
      if (validator)
        stakes.push({ pool: p.address, stakerBalance: staker?.balance ?? 0, validatorStake: validator.totalStake })
    })
    return { height: after, exact: before === after, stakes }
  }
}
