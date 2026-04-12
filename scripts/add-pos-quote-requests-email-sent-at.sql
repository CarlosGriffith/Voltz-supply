-- Run once on existing MySQL databases (bootstrap already includes this column for new installs).
ALTER TABLE pos_quote_requests
  ADD COLUMN email_sent_at DATETIME(3) NULL AFTER quote_id;
