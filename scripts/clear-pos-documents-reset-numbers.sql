-- Destructive: removes all quote requests, quotes, orders, invoices, receipts, refunds, sent-email log, and POS customers.
-- Resets document counters so the next auto numbers are QT-1000001, OR-1000001, INV-1000001, RT-1000001, REF-1000001.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE pos_refunds;
TRUNCATE TABLE pos_receipt_invoice_links;
TRUNCATE TABLE pos_receipts;
TRUNCATE TABLE pos_invoices;
TRUNCATE TABLE pos_orders;
TRUNCATE TABLE pos_quotes;
TRUNCATE TABLE pos_quote_requests;
TRUNCATE TABLE pos_sent_emails;
TRUNCATE TABLE pos_customers;

SET FOREIGN_KEY_CHECKS = 1;

UPDATE pos_doc_counters SET seq_value = 1000000 WHERE doc_type IN ('quote', 'order', 'invoice', 'receipt', 'refund');
