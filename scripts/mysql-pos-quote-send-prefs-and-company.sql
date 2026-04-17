-- Run once on existing MySQL databases (Aiven / production).
-- Quote send preferences + company on orders/invoices.
--
-- For only `pos_quotes` send columns (idempotent, duplicate-safe), prefer:
--   npm run db:add-pos-quotes-send-via-columns
--
-- If a column already exists, skip that statement or comment it out.

ALTER TABLE pos_quotes
  ADD COLUMN `send_via_email` TINYINT(1) NOT NULL DEFAULT 1 AFTER `email_sent_at`,
  ADD COLUMN `send_via_whatsapp` TINYINT(1) NOT NULL DEFAULT 0 AFTER `send_via_email`;

ALTER TABLE pos_orders
  ADD COLUMN `customer_company` VARCHAR(512) NOT NULL DEFAULT '' AFTER `customer_phone`;

ALTER TABLE pos_invoices
  ADD COLUMN `customer_company` VARCHAR(512) NOT NULL DEFAULT '' AFTER `customer_phone`;
