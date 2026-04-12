-- Link website quote requests to pos_customers when email or phone matches.
ALTER TABLE pos_quote_requests
  ADD COLUMN `customer_id` VARCHAR(128) NULL AFTER `quote_number`;
