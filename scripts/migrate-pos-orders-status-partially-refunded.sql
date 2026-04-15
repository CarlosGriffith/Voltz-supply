-- Add `partially_refunded` to pos_orders.status CHECK (mirror invoice partial-refund display on linked order).
-- Run once on existing DBs (MySQL 8.0.16+).

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
    'partially_refunded',
    'refunded'
  ));
