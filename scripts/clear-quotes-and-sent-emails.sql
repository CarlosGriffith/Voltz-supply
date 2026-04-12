-- Empty POS quotes and sent-email log. Safe with FKs: orders/invoices use ON DELETE SET NULL on quote_id.
UPDATE pos_quote_requests SET quote_id = NULL, quote_number = NULL WHERE quote_id IS NOT NULL OR quote_number IS NOT NULL;
DELETE FROM pos_quotes;
TRUNCATE TABLE pos_sent_emails;
