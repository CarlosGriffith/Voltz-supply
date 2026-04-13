-- Stores the quote `status` before it was set to `dormant`, so "Restore from Dormant" can revert.
ALTER TABLE pos_quotes
  ADD COLUMN `status_before_dormant` VARCHAR(64) NULL
  AFTER `status`;
