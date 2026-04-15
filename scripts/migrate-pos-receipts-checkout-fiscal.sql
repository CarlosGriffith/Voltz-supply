-- Snapshot subtotal / GCT / discount at checkout time so receipts match the checkout footer.
-- Run once on existing DBs. New installs: scripts/mysql-aiven-bootstrap.sql.

ALTER TABLE pos_receipts
  ADD COLUMN `subtotal` DECIMAL(12,2) NULL DEFAULT NULL AFTER `total`,
  ADD COLUMN `tax_rate` DECIMAL(12,2) NULL DEFAULT NULL AFTER `subtotal`,
  ADD COLUMN `tax_amount` DECIMAL(12,2) NULL DEFAULT NULL AFTER `tax_rate`,
  ADD COLUMN `discount_amount` DECIMAL(12,2) NULL DEFAULT NULL AFTER `tax_amount`;
