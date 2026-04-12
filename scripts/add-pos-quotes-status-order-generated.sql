-- Run once on existing MySQL 8+ databases (new installs get this from mysql-aiven-bootstrap.sql).
-- Adds quote status order_generated (order linked, no invoice yet) and backfills rows.
--
--   npm run db:add-quote-status-order-generated

ALTER TABLE pos_quotes DROP CHECK chk_pos_quotes_status;

ALTER TABLE pos_quotes
  ADD CONSTRAINT chk_pos_quotes_status CHECK (`status` IN (
    'reviewed',
    'order_generated',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed'
  ));

UPDATE pos_quotes
SET status = 'order_generated', updated_at = CURRENT_TIMESTAMP(3)
WHERE order_id IS NOT NULL
  AND (invoice_id IS NULL OR TRIM(COALESCE(invoice_id, '')) = '')
  AND status = 'reviewed';
