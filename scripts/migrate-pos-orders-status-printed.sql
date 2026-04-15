-- Add `printed` to pos_orders.status CHECK (Save & Print on orders before an invoice exists).
-- Run once on existing DBs. New installs: scripts/mysql-aiven-bootstrap.sql.

ALTER TABLE pos_orders DROP CHECK chk_pos_orders_status;
ALTER TABLE pos_orders
  ADD CONSTRAINT chk_pos_orders_status CHECK (`status` IN (
    'pending',
    'confirmed',
    'processing',
    'ready',
    'completed',
    'cancelled',
    'reviewed',
    'printed',
    'emailed',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed',
    'refunded'
  ));
