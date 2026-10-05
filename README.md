# Nimiq Pool Fee Monitor

Some Nimiq staking pools list a lower fee in the [validators-api](https://github.com/nimiq/validators-api) than they really charge. This app measures the **real** fee on-chain and shows it next to the listed one.

```
docker compose up -d --build      # dashboard on http://localhost:3000
```

Then open the dashboard, copy the **funding wallet** address and send NIM to it. Every pool needs its own wallet with at least 100 NIM staked, so about `100 × number of pools` (~2,000 NIM for the 20 pools listed today). The monitor funds and stakes with each pool automatically as NIM arrives, and pools are processed in order, so partial funding is fine. Staked NIM is never spent, only locked.

## How it works

| Service | Role |
|---|---|
| `worker` | Runs a Nimiq node via `@nimiq/core` (the web-client, pico sync, no full node needed). Syncs the pool list from the validators-api every 15 min, derives one wallet per pool, funds and stakes, records payouts and gross rewards in SQLite. |
| `web` | Nuxt 4 + Nuxt UI dashboard. Read-only access to the same SQLite file (shared volume). |

**Pools** = validators with `payoutType` `restake` or `direct` and a listed fee, minus `POOL_EXCLUDE`. By default that excludes Nova Pool and Techbits Validator, which are still listed but haven't been operational for a long time. Excluded pools are never funded or monitored. NIM already staked with them stays staked: unstake it in the Nimiq Wallet using the seed.

**Wallets** come from one BIP39 24-word seed (generated on first start, stored in the `data` volume, or supplied via `WALLET_MNEMONIC`). Index 0 (`m/44'/242'/0'/0'`) is the funding wallet and index *n* is the *n*-th pool's wallet (SLIP-10 ed25519, the Nimiq account path). The seed can be imported into a Nimiq wallet to recover funds. Importing the seed into the Nimiq Wallet shows the funding wallet and all pool wallets, so funds can be recovered or swept from there. **Back up the seed** by printing it with:

PowerShell:

```
'import {DatabaseSync} from "node:sqlite"; console.log(new DatabaseSync("/data/monitor.db",{readOnly:true}).prepare("select value from meta where key=''mnemonic''").get().value)' | docker compose exec -T worker node --input-type=module -
```

Bash:

```
echo 'import {DatabaseSync} from "node:sqlite"; console.log(new DatabaseSync("/data/monitor.db",{readOnly:true}).prepare("select value from meta where key='"'"'mnemonic'"'"'").get().value)' | docker compose exec -T worker node --input-type=module -
```

**Payout detection**
- *direct*: incoming transfers to the dedicated wallet (excluding the funding wallet).
- *restake*: add-stake transactions to the staking contract whose data names the dedicated wallet as staker, sent from the validator's reward address (read from the validator in the staking contract). The light client doesn't index add-stakes by staker, so the reward address's history is scanned. Add stake may come "from any external address", so staker-balance growth that stays unmatched for 10 minutes is recorded as a payout without a transaction hash.

History scans page through `getTransactionsByAddress` (up to 256 per request; peers sometimes return short pages, so paging continues until the start height). As the client docs require, each scan starts from a finalized macro block, not the last seen height.

**Real fee**
The chain pays each validator's gross rewards in per-batch inherents from the coinbase address to its `rewardAddress`. The monitor computes our share of every batch and compares it to what really arrived:

```
real fee = 1 − payouts received ÷ pro-rata share of gross rewards
share    = reward × ourStake@election ÷ validatorStake@election
```

Timing follows the protocol:
- **Eligibility.** Stake added during epoch *E* is counted at the election block that ends *E*, so it earns from *E + 1*. The monitor records the block of the create-staker transaction to know that epoch.
- **One-batch delay.** The reward inherent in a macro block pays for the *previous* batch. The first reward in epoch *E + 1* therefore still belongs to *E*, where our stake earned nothing.
- **Election stakes.** Rewards of an epoch are split by the stakes fixed at its election, not by current balances. Restakes received during an epoch only count from the next one. The worker captures both stakes when the election block arrives, reading all pools in one batch and again if the head moved meanwhile. The light client only serves current balances, so the read lands a few blocks after the election: every add-stake the pool's reward address sent in between (to us or any other staker) is subtracted again. If the worker was down at the election, the snapshot is taken late and marked approximate.

Pools pay in lumps, so the window starts at the first payout after our first entitled reward (that amount is excluded because it covers an unknown earlier period) and ends at the last payout. Verdicts are marked *preliminary* for windows under 12 h or with missing or late election stakes. A pool is flagged when the real fee exceeds the listed fee by more than `FEE_TOLERANCE` (default 1 percentage point).

**Evidence export**: each pool page has an *Export evidence (CSV)* button (`/api/pools/<address>/evidence.csv`) to send to the pool operator. It has a summary (listed vs. real fee, fee window, stake transaction, issue counts, method), then every payout and gross reward in time order with transaction hash, nimiq.watch link, election stakes, our entitled share, whether it counts in the fee window, and issue tags (`paid_before_stake_elected`, `restake_below_100_nim`). It only contains public on-chain data.

**Warnings** (shown separately from the fee verdict):
- *Pays unelected stake*: the pool paid us before our stake was part of an election. That money comes out of other stakers' share, which suggests the pool splits rewards by current rather than election stakes.
- *Restakes < 100 NIM*: restake payouts below 100 NIM will be rejected after the next protocol upgrade, so small stakers of that pool would stop receiving rewards. The flag fires per add-stake transaction (or per unmatched balance growth) below 100 NIM.

## Configuration

See [.env.example](.env.example): `NIMIQ_NETWORK` (`TestAlbatross` works too), `STAKE_NIM`, `FEE_TOLERANCE`, `POOL_ALLOWLIST` (cheap trial with a few pools), `POOL_EXCLUDE` (unset = the defaults above, empty = exclude nothing), `WEB_PORT`.

## Development

An npm workspaces monorepo; each app declares only what it needs:

| Workspace | Path | Contents |
|---|---|---|
| `@nimiq-pool-monitor/web` | `apps/web` | Nuxt 4 dashboard: `app/`, `server/` (API, fee and evidence logic), `shared/`, tests in `server/tests` and `test/nuxt` |
| `@nimiq-pool-monitor/worker` | `apps/worker` | Nimiq node, wallets and payout monitoring in `src/` (run directly by Node 24, no build step) |
| `@nimiq-pool-monitor/db` | `packages/db` | Drizzle ORM schema, SQLite client (`node:sqlite`) and migrations, shared by both apps |

```
npm install           # all workspaces; needs Node 24
npm run worker        # worker, writes data/monitor.db at the repo root (DATA_DIR to override)
npm run dev           # dashboard, reads the same database
npm test              # vitest in every workspace
npm run typecheck     # nuxt typecheck + tsc for the worker and db package
npm run lint          # ESLint (antfu); each workspace has its own eslint.config.mjs
npm run db:generate   # after changing packages/db/src/schema.ts: generate a migration
```

**Database**: [Drizzle ORM](https://orm.drizzle.team/) 1.0 (release candidate, pinned to `1.0.0-rc.4` for its `node:sqlite` driver) over SQLite. The worker owns the database: it applies the migrations in `packages/db/migrations` on startup. The web app opens it read-only. To change the schema, edit `packages/db/src/schema.ts`, run `npm run db:generate` and commit the generated migration. The root `overrides` pins `drizzle-orm` across the tree because Nuxt's `db0` declares an optional `drizzle-orm: "*"` peer, which excludes pre-releases and would otherwise stop npm from installing a single shared copy.

Add a dependency to one app with `npm i <pkg> -w @nimiq-pool-monitor/web` (or `/worker`). Note that the lockfile is shared: a package the web app needs at runtime (e.g. TypeScript, via Nuxt) is not marked dev-only and also ends up in the worker image.

## Caveats

- Fees are measured, not proven. Short windows are noisy, and pools with minimum payout thresholds can take a long time to produce 2 payouts from a 100 NIM stake. Raise `STAKE_NIM` for faster, more accurate results.
- The seed is stored unencrypted in the Docker volume. Treat the volume like a hot wallet and don't keep more NIM in it than needed.
