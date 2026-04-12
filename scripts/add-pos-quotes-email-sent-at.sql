-- Run once on existing MySQL databases (bootstrap includes this for new installs).
-- Backfill from sent-email log: npm run db:backfill-quote-email-sent-at

ALTER TABLE pos_quotes
  ADD COLUMN email_sent_at DATETIME(3) NULL AFTER invoice_id;
