CREATE TABLE `epoch_stakes` (
	`pool` text NOT NULL,
	`epoch` integer NOT NULL,
	`election_height` integer NOT NULL,
	`snapshot_height` integer NOT NULL,
	`staker_balance` integer NOT NULL,
	`validator_stake` integer NOT NULL,
	CONSTRAINT `epoch_stakes_pk` PRIMARY KEY(`pool`, `epoch`),
	CONSTRAINT `fk_epoch_stakes_pool_pools_address_fk` FOREIGN KEY (`pool`) REFERENCES `pools`(`address`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`ts` integer NOT NULL,
	`level` text NOT NULL,
	`pool` text,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY,
	`pool` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`block_height` integer,
	`ts` integer NOT NULL,
	CONSTRAINT `fk_payouts_pool_pools_address_fk` FOREIGN KEY (`pool`) REFERENCES `pools`(`address`)
);
--> statement-breakpoint
CREATE TABLE `pending_txs` (
	`hash` text PRIMARY KEY,
	`pool` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	CONSTRAINT `fk_pending_txs_pool_pools_address_fk` FOREIGN KEY (`pool`) REFERENCES `pools`(`address`)
);
--> statement-breakpoint
CREATE TABLE `pools` (
	`address` text PRIMARY KEY,
	`name` text NOT NULL,
	`website` text,
	`accent_color` text,
	`listed_fee` real,
	`payout_type` text,
	`payout_schedule` text,
	`listed` integer DEFAULT true NOT NULL,
	`excluded` integer DEFAULT false NOT NULL,
	`wallet_index` integer UNIQUE,
	`wallet_address` text UNIQUE,
	`reward_address` text,
	`total_stake` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_detail` text,
	`staking_since` integer,
	`stake_luna` integer DEFAULT 0 NOT NULL,
	`liquid_luna` integer DEFAULT 0 NOT NULL,
	`stake_height` integer,
	`stake_initial` integer,
	`stake_tx_hash` text,
	`eligible_epoch` integer,
	`last_tx_height` integer,
	`last_reward_height` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `reward_events` (
	`tx_hash` text PRIMARY KEY,
	`pool` text NOT NULL,
	`block_height` integer NOT NULL,
	`ts` integer NOT NULL,
	`reward` integer NOT NULL,
	`rewarded_epoch` integer NOT NULL,
	CONSTRAINT `fk_reward_events_pool_pools_address_fk` FOREIGN KEY (`pool`) REFERENCES `pools`(`address`)
);
--> statement-breakpoint
CREATE INDEX `payouts_pool_ts` ON `payouts` (`pool`,`ts`);--> statement-breakpoint
CREATE INDEX `reward_events_pool_ts` ON `reward_events` (`pool`,`ts`);