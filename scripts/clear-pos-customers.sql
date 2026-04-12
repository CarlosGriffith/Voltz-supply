-- Removes all rows from pos_customers (POS customer registry).
-- Related tables use ON DELETE SET NULL for customer_id where FKs exist.
-- The Node runner also clears pos_quote_requests.customer_id when that column exists.

DELETE FROM pos_customers;
