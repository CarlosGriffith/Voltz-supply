-- Destructive: clears website quote requests, quotes, and sent-email log only.
-- Resets the quote document counter so the next quote number is QT-1000001.
-- Does not touch orders, invoices, receipts, refunds, or customers.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE pos_quotes;
TRUNCATE TABLE pos_quote_requests;
TRUNCATE TABLE pos_sent_emails;

SET FOREIGN_KEY_CHECKS = 1;

UPDATE pos_doc_counters SET seq_value = 1000000 WHERE doc_type = 'quote';
