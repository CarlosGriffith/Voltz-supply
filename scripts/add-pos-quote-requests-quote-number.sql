-- Denormalized quote number for website quote request rows (display + resolve linked quote).
ALTER TABLE pos_quote_requests
  ADD COLUMN `quote_number` VARCHAR(64) NULL AFTER `quote_id`;
