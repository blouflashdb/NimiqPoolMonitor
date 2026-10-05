<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Detail {
  network: string | null
  pool: Pool
  /** id: the transaction hash, or 'growth:…' for restaked balance growth without a matching add-stake transaction */
  payouts: { id: string, kind: string, amount: number, blockHeight: number | null, ts: number }[]
  /** share: our entitled part, 0 = stake not elected for that epoch, null = election stakes unknown */
  rewards: { hash: string, blockHeight: number, ts: number, reward: number, epoch: number, share: number | null }[]
  events: { ts: number, level: string, message: string }[]
}

const route = useRoute()
const { data, error } = await useFetch<Detail>(`/api/pools/${encodeURIComponent(String(route.params.address))}`)

const payoutCols: TableColumn<Detail['payouts'][number]>[] = [
  { accessorKey: 'ts', header: 'Time' },
  { accessorKey: 'kind', header: 'Type' },
  { accessorKey: 'amount', header: 'Amount' },
  { accessorKey: 'id', header: 'Transaction' },
  { accessorKey: 'blockHeight', header: 'Block' },
]
const watch = (value: string | number) => watchUrl(value, data.value?.network)
const addresses = computed(() => data.value
  ? [
      { label: 'Validator', address: data.value.pool.address },
      { label: 'Reward address', address: data.value.pool.rewardAddress },
      { label: 'Dedicated wallet', address: data.value.pool.walletAddress },
    ]
  : [])
const rewardCols: TableColumn<Detail['rewards'][number]>[] = [
  { accessorKey: 'ts', header: 'Time' },
  { accessorKey: 'epoch', header: 'For epoch' },
  { accessorKey: 'reward', header: 'Validator gross reward' },
  { accessorKey: 'share', header: 'Our pro-rata share' },
  { accessorKey: 'blockHeight', header: 'Block' },
]
function beforeEligible(ts: number) {
  const since = data.value?.pool.fee.eligibleSince
  return data.value?.pool.eligibleEpoch != null && (since == null || ts < since)
}
</script>

<template>
  <div class="space-y-6">
    <UButton to="/" variant="link" icon="i-lucide-arrow-left" class="px-0">
      All pools
    </UButton>
    <UAlert v-if="error" color="error" variant="subtle" title="Pool not found" />
    <template v-else-if="data">
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-2xl font-semibold">
          {{ data.pool.name }}
        </h1>
        <UBadge :color="verdictBadge(data.pool.fee).color" variant="subtle">
          {{ verdictBadge(data.pool.fee).label }}
        </UBadge>
        <UButton v-if="data.pool.website" :to="data.pool.website" target="_blank" variant="link" icon="i-lucide-external-link" size="sm">
          Website
        </UButton>
        <UTooltip text="Every payout and gross reward with transaction links, entitled share and issues, to send to the pool operator">
          <UButton
            :to="`/api/pools/${encodeURIComponent(data.pool.address)}/evidence.csv`"
            external
            download
            variant="soft"
            icon="i-lucide-download"
            size="sm"
            class="ms-auto"
          >
            Export evidence (CSV)
          </UButton>
        </UTooltip>
      </div>

      <UAlert
        v-for="f in data.pool.fee.flags"
        :key="f"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="flagInfo[f].label"
        :description="f === 'paid_before_eligible'
          ? `${flagInfo[f].description} Received ${nim(data.pool.fee.unearnedLuna, 5)} NIM in ${data.pool.fee.unearnedCount} payouts before our stake earned anything.`
          : `${flagInfo[f].description} Seen in ${data.pool.fee.smallRestakeCount} restake payouts.`"
      />

      <div class="grid gap-4 md:grid-cols-4">
        <UCard>
          <p class="text-sm text-muted">
            Listed fee
          </p>
          <p class="text-2xl font-semibold">
            {{ pct(data.pool.listedFee) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Real fee
          </p>
          <p class="text-2xl font-semibold" :class="data.pool.fee.verdict === 'suspicious' ? 'text-error' : ''">
            {{ pct(data.pool.fee.realFee) }}
          </p>
          <p class="text-xs text-muted">
            {{ pp(data.pool.fee.delta) }} vs. listed
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Received / entitled
          </p>
          <p class="text-lg font-semibold">
            {{ nim(data.pool.fee.actualLuna, 4) }} / {{ nim(data.pool.fee.expectedLuna, 4) }} NIM
          </p>
          <p class="text-xs text-muted">
            {{ data.pool.fee.payoutCount }} payouts over {{ data.pool.fee.windowHours ? hours(data.pool.fee.windowHours) : '–' }}
          </p>
          <p v-if="data.pool.fee.unknownRewards || data.pool.fee.approximateEpochs" class="text-xs text-warning">
            Election stakes missing for {{ data.pool.fee.unknownRewards }} rewards, captured late for {{ data.pool.fee.approximateEpochs }} epochs
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Staked
          </p>
          <p class="text-2xl font-semibold">
            {{ nim(data.pool.stakeLuna) }} NIM
          </p>
          <p class="text-xs text-muted">
            {{ statusLabel[data.pool.status] ?? data.pool.status }}<template v-if="data.pool.statusDetail">
              · {{ data.pool.statusDetail }}
            </template>
          </p>
        </UCard>
      </div>

      <UCard>
        <dl class="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[max-content_1fr]">
          <template v-for="a in addresses" :key="a.label">
            <dt class="text-muted">
              {{ a.label }}
            </dt>
            <dd class="font-mono break-all">
              <ULink v-if="a.address" :to="watch(a.address)" target="_blank" class="text-primary hover:underline">
                {{ a.address }}
              </ULink>
              <template v-else>
                –
              </template>
            </dd>
          </template>
          <dt class="text-muted">
            Payout (listed)
          </dt><dd>{{ data.pool.payoutType }} · {{ data.pool.payoutSchedule || 'no schedule listed' }}</dd>
          <dt class="text-muted">
            Staking since
          </dt><dd>
            {{ dateTime(data.pool.stakingSince) }}<template v-if="data.pool.stakeHeight">
              · block {{ data.pool.stakeHeight.toLocaleString() }}
            </template>
          </dd>
          <dt class="text-muted">
            Earns rewards from
          </dt>
          <dd>
            <template v-if="data.pool.eligibleEpoch">
              epoch {{ data.pool.eligibleEpoch }} · first entitled reward {{ dateTime(data.pool.fee.eligibleSince) }}
            </template>
            <template v-else>
              unknown until the staking transaction is found
            </template>
          </dd>
        </dl>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Payouts received
          </h2>
        </template>
        <UTable :data="data.payouts" :columns="payoutCols">
          <template #ts-cell="{ row }">
            {{ dateTime(row.original.ts) }}
          </template>
          <template #amount-cell="{ row }">
            {{ nim(row.original.amount, 5) }} NIM
          </template>
          <template #id-cell="{ row }">
            <ULink v-if="isTxHash(row.original.id)" :to="watch(row.original.id)" target="_blank" class="font-mono text-primary hover:underline">
              {{ shortHash(row.original.id) }}
            </ULink>
            <span v-else class="text-muted" title="The staker balance grew, but no matching add-stake transaction was sent from the pool's reward address">no matching transaction</span>
          </template>
          <template #blockHeight-cell="{ row }">
            <ULink v-if="isTxHash(row.original.id) && row.original.blockHeight" :to="watch(row.original.blockHeight)" target="_blank" class="text-primary hover:underline">
              {{ row.original.blockHeight.toLocaleString() }}
            </ULink>
            <span v-else-if="row.original.blockHeight" class="text-muted" title="Block at which the balance growth was noticed, not the transaction's block">
              ~{{ row.original.blockHeight.toLocaleString() }}
            </span>
          </template>
          <template #kind-cell="{ row }">
            <div class="flex gap-1">
              <UBadge variant="subtle" color="neutral">
                {{ row.original.kind }}
              </UBadge>
              <UBadge v-if="beforeEligible(row.original.ts)" variant="subtle" color="warning">
                before stake was elected
              </UBadge>
            </div>
          </template>
        </UTable>
        <p v-if="!data.payouts.length" class="text-sm text-muted p-4">
          No payouts observed yet.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Validator gross rewards (latest 200)
          </h2>
        </template>
        <UTable :data="data.rewards" :columns="rewardCols" :ui="{ root: 'max-h-96' }">
          <template #ts-cell="{ row }">
            {{ dateTime(row.original.ts) }}
          </template>
          <template #reward-cell="{ row }">
            {{ nim(row.original.reward, 4) }} NIM
          </template>
          <template #share-cell="{ row }">
            <span v-if="row.original.share === 0" class="text-muted">not elected</span>
            <span v-else-if="row.original.share == null" class="text-warning">unknown</span>
            <template v-else>
              {{ nim(row.original.share, 6) }} NIM
            </template>
          </template>
        </UTable>
        <p v-if="!data.rewards.length" class="text-sm text-muted p-4">
          Reward tracking starts once the stake is confirmed.
        </p>
      </UCard>
    </template>
  </div>
</template>
