<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Overview {
  network: string | null
  node: { head: number, consensus: boolean, ts: number } | null
  funding: { address: string | null, balanceLuna: number, stakePerPoolLuna: number, stillNeededLuna: number }
  pools: Pool[]
  excluded: { address: string, name: string }[]
  events: { ts: number, level: string, pool: string | null, message: string }[]
}

const { data, error, refresh } = await useFetch<Overview>('/api/overview')
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(refresh, 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

const toast = useToast()
async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied', description: text })
}

const monitored = computed(() => (data.value?.pools ?? []).filter(p => p.status === 'staking'))
const flagged = computed(() => monitored.value.filter(p => p.fee.verdict === 'suspicious'))
const measured = computed(() => monitored.value.filter(p => p.fee.verdict !== 'insufficient'))
const warned = computed(() => monitored.value.filter(p => p.fee.flags.length))
const nodeStale = computed(() => !data.value?.node || Date.now() - data.value.node.ts > 10 * 60_000)
const needsFunding = computed(() => !!data.value?.funding.address && data.value.funding.stillNeededLuna > data.value.funding.balanceLuna)

const columns: TableColumn<Pool>[] = [
  { accessorKey: 'name', header: 'Pool' },
  { accessorKey: 'listedFee', header: 'Listed fee' },
  { id: 'realFee', header: 'Real fee', accessorFn: p => p.fee.realFee },
  { id: 'delta', header: 'Difference', accessorFn: p => p.fee.delta },
  { id: 'verdict', header: 'Verdict' },
  { id: 'payouts', header: 'Payouts', accessorFn: p => p.fee.payoutCount },
  { id: 'window', header: 'Window', accessorFn: p => p.fee.windowHours },
  { accessorKey: 'status', header: 'Wallet' },
]

const sorted = computed(() => [...(data.value?.pools ?? [])].sort((a, b) =>
  (b.fee.delta ?? -Infinity) - (a.fee.delta ?? -Infinity) || a.name.localeCompare(b.name)))
const open = (_e: Event, row: { original: Pool }) => navigateTo(`/pools/${encodeURIComponent(row.original.address)}`)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Backend not ready"
      description="The worker has not created the database yet. It starts after the Nimiq node reaches consensus (usually under a minute)."
    />
    <UAlert
      v-else-if="nodeStale"
      color="warning"
      variant="subtle"
      title="Worker is not reporting"
      description="No heartbeat from the monitoring node in the last 10 minutes."
    />

    <div v-if="data" class="grid gap-4 md:grid-cols-4">
      <UCard>
        <p class="text-sm text-muted">
          Pools tracked
        </p>
        <p class="text-2xl font-semibold">
          {{ data.pools.length }}
        </p>
        <p class="text-xs text-muted">
          {{ monitored.length }} staking · {{ measured.length }} measured
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Pools charging more than listed
        </p>
        <p class="text-2xl font-semibold" :class="flagged.length ? 'text-error' : ''">
          {{ flagged.length }}
        </p>
        <p class="text-xs" :class="warned.length ? 'text-warning' : 'text-muted'">
          {{ warned.length }} with payout warnings
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Node
        </p>
        <p class="text-2xl font-semibold">
          {{ data.node ? `#${data.node.head.toLocaleString()}` : '–' }}
        </p>
        <p class="text-xs text-muted">
          {{ data.network }} · {{ data.node?.consensus ? 'synced' : 'syncing' }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Funding wallet
        </p>
        <p class="text-2xl font-semibold">
          {{ nim(data.funding.balanceLuna) }} NIM
        </p>
        <p class="text-xs" :class="needsFunding ? 'text-warning' : 'text-muted'">
          {{ nim(data.funding.stillNeededLuna, 0) }} NIM still needed to stake with every pool
        </p>
      </UCard>
    </div>

    <UCard v-if="data?.funding.address && needsFunding">
      <template #header>
        <h2 class="font-semibold">
          Fund the monitor
        </h2>
      </template>
      <p class="text-sm text-muted mb-3">
        Send NIM to this address. Every pool needs its own wallet with at least {{ nim(data.funding.stakePerPoolLuna, 0) }} NIM
        staked. The monitor distributes the funds and starts staking automatically.
      </p>
      <div class="flex items-center gap-2 flex-wrap">
        <code class="px-2 py-1 rounded bg-elevated text-sm break-all">{{ data.funding.address }}</code>
        <UButton size="xs" variant="soft" icon="i-lucide-copy" @click="copy(data.funding.address!)">
          Copy
        </UButton>
      </div>
    </UCard>

    <UCard v-if="data">
      <template #header>
        <h2 class="font-semibold">
          Listed vs. real fees
        </h2>
      </template>
      <UTable :data="sorted" :columns="columns" class="cursor-pointer" @select="open">
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2 max-w-48">
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: row.original.accentColor ?? 'var(--ui-border-accented)' }" />
            <span class="font-medium whitespace-normal break-words">{{ row.original.name }}</span>
            <UBadge v-if="!row.original.stillListed" size="sm" color="neutral" variant="subtle">
              delisted
            </UBadge>
          </div>
          <div class="text-xs text-muted truncate max-w-48" :title="row.original.payoutSchedule ?? undefined">
            {{ row.original.payoutType }}<template v-if="row.original.payoutSchedule">
              · {{ row.original.payoutSchedule }}
            </template>
          </div>
        </template>
        <template #listedFee-cell="{ row }">
          {{ pct(row.original.listedFee) }}
        </template>
        <template #realFee-cell="{ row }">
          <span class="font-semibold" :class="row.original.fee.verdict === 'suspicious' ? 'text-error' : ''">{{ pct(row.original.fee.realFee) }}</span>
        </template>
        <template #delta-cell="{ row }">
          {{ pp(row.original.fee.delta) }}
        </template>
        <template #verdict-cell="{ row }">
          <div class="flex flex-col items-start gap-1">
            <UBadge :color="verdictBadge(row.original.fee).color" variant="subtle">
              {{ verdictBadge(row.original.fee).label }}
            </UBadge>
            <UTooltip v-for="f in row.original.fee.flags" :key="f" :text="flagInfo[f].description">
              <UBadge color="warning" variant="subtle" icon="i-lucide-triangle-alert">
                {{ flagInfo[f].label }}
              </UBadge>
            </UTooltip>
          </div>
        </template>
        <template #window-cell="{ row }">
          {{ row.original.fee.windowHours ? hours(row.original.fee.windowHours) : '–' }}
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="row.original.status === 'staking' ? 'success' : row.original.status === 'error' ? 'error' : 'neutral'" variant="outline">
            {{ statusLabel[row.original.status] ?? row.original.status }}
          </UBadge>
        </template>
      </UTable>
      <template v-if="data.excluded.length" #footer>
        <p class="text-xs text-muted">
          Excluded from monitoring (<code>POOL_EXCLUDE</code>):
          <template v-for="(p, i) in data.excluded" :key="p.address">
            <ULink :to="`/pools/${encodeURIComponent(p.address)}`" class="underline">
              {{ p.name }}
            </ULink><template v-if="i < data.excluded.length - 1">
              ,
            </template>
          </template>
        </p>
      </template>
    </UCard>

    <UCard v-if="data?.events.length">
      <template #header>
        <h2 class="font-semibold">
          Activity
        </h2>
      </template>
      <ul class="space-y-1 text-sm">
        <li v-for="(e, i) in data.events" :key="i" class="flex gap-3">
          <span class="text-muted shrink-0">{{ dateTime(e.ts) }}</span>
          <span :class="e.level === 'error' ? 'text-error' : e.level === 'warn' ? 'text-warning' : ''">{{ e.message }}</span>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          How the real fee is measured
        </h2>
      </template>
      <div class="text-sm text-muted space-y-2">
        <p>For each pool a dedicated wallet stakes with that validator. The monitor reads every gross block-reward batch the validator receives on-chain and computes our stake's pro-rata share of it, using the stakes fixed at the election of the epoch the batch belongs to.</p>
        <p>Stake added during an epoch only earns from the next epoch, and each reward pays for the previous batch, so the first batch of an epoch still pays for the epoch before. Payouts received before our stake was entitled to anything are reported as a warning, not counted as rewards.</p>
        <p><strong>Real fee = 1 − (payouts received) ÷ (pro-rata share of gross rewards)</strong>, measured between the first and last payout after our stake became entitled. Direct transfers and restakes are both counted. Short windows are noisy, so verdicts are marked preliminary until enough data is collected.</p>
      </div>
    </UCard>
  </div>
</template>
