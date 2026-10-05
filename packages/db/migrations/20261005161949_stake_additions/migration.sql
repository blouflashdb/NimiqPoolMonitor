CREATE TABLE `stake_additions` (
	`tx_hash` text PRIMARY KEY,
	`pool` text NOT NULL,
	`staker` text NOT NULL,
	`block_height` integer NOT NULL,
	`amount` integer NOT NULL,
	CONSTRAINT `fk_stake_additions_pool_pools_address_fk` FOREIGN KEY (`pool`) REFERENCES `pools`(`address`)
);
--> statement-breakpoint
CREATE INDEX `stake_additions_pool_height` ON `stake_additions` (`pool`,`block_height`);