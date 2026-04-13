-- Adds `dormant` to pos_quotes.status CHECK (quotes hidden from checkout customer search until looked up by quote #).
-- Run once: npm run db:add-pos-quotes-status-dormant

ALTER TABLE pos_quotes DROP CHECK chk_pos_quotes_status;

ALTER TABLE pos_quotes
  ADD CONSTRAINT chk_pos_quotes_status CHECK (`status` IN (
    'reviewed',
    'printed',
    'emailed',
    'dormant',
    'order_generated',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed'
  ));
