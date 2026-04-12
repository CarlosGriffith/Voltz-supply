-- Run once if you use processRefund (invoice status 'Refunded')
ALTER TABLE pos_invoices DROP CHECK chk_pos_invoices_status;
ALTER TABLE pos_invoices
  ADD CONSTRAINT chk_pos_invoices_status
  CHECK (`status` IN ('Unpaid', 'Partially Paid', 'Paid', 'Refunded'));
