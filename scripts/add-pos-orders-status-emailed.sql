-- Widen pos_orders.status CHECK: add `emailed` (Save & Email) and legacy workflow values
-- so existing rows and app updates do not violate chk_pos_orders_status.
-- Run once on existing databases. Requires MySQL 8.0.16+ / MariaDB 10.2.1+ for named CHECK.

ALTER TABLE pos_orders DROP CHECK chk_pos_orders_status;

ALTER TABLE pos_orders ADD CONSTRAINT chk_pos_orders_status CHECK (`status` IN (
  'pending',
  'confirmed',
  'processing',
  'ready',
  'completed',
  'cancelled',
  'reviewed',
  'emailed',
  'invoice_generated_unpaid',
  'invoice_generated_partially_paid',
  'invoice_generated_paid',
  'processed'
));
