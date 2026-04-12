-- Remove all POS order rows and neutralize references (quotes have optional order_id; invoices FK SET NULL on delete).
UPDATE pos_quotes SET order_id = NULL WHERE order_id IS NOT NULL;
DELETE FROM pos_orders;
