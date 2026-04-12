-- Adds reviewed/printed/emailed workflow for website quotes + quote requests (Save / Save & Print / Save & Email).
-- Run once on existing DBs: npm run db:add-website-quote-workflow-statuses

ALTER TABLE pos_quote_requests DROP CHECK chk_pos_quote_requests_status;
ALTER TABLE pos_quote_requests
  ADD CONSTRAINT chk_pos_quote_requests_status CHECK (`status` IN (
    'new','reviewed','printed','emailed','quoted','closed'
  ));

ALTER TABLE pos_quotes DROP CHECK chk_pos_quotes_status;
ALTER TABLE pos_quotes
  ADD CONSTRAINT chk_pos_quotes_status CHECK (`status` IN (
    'reviewed','printed','emailed',
    'order_generated',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed'
  ));
