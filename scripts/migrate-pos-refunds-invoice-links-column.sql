-- Add invoice_links for combined receipt-originated refunds (multiple invoices, one RF row).
ALTER TABLE pos_refunds
  ADD COLUMN `invoice_links` LONGTEXT NULL COMMENT 'JSON: per-invoice subtotals when one refund spans multiple invoices'
  AFTER `invoice_id`;
