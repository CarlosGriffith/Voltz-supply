-- Add `refunded` to pos_quotes / pos_orders status CHECK + update sp_recalc_invoice so receipt
-- triggers do not overwrite Refunded invoices or reset linked order/quote rows.
-- Run once on existing DBs (MySQL 8.0.16+). New installs: scripts/mysql-aiven-bootstrap.sql.
--
--   npm run db:migrate:pos-refunded-linked-status
--
-- If your DB uses routines from `npm run db:refresh-pos-routines-collation` (utf8mb4 collation
-- variant), run that after this migration so sp_recalc_invoice matches your deployment style.

ALTER TABLE pos_quotes DROP CHECK chk_pos_quotes_status;
ALTER TABLE pos_quotes
  ADD CONSTRAINT chk_pos_quotes_status CHECK (`status` IN (
    'reviewed',
    'printed',
    'emailed',
    'dormant',
    'order_generated',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed',
    'refunded'
  ));

ALTER TABLE pos_orders DROP CHECK chk_pos_orders_status;
ALTER TABLE pos_orders
  ADD CONSTRAINT chk_pos_orders_status CHECK (`status` IN (
    'pending',
    'confirmed',
    'processing',
    'ready',
    'completed',
    'cancelled',
    'reviewed',
    'printed',
    'emailed',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed',
    'refunded'
  ));

DROP PROCEDURE IF EXISTS sp_recalc_invoice;
DELIMITER //
CREATE PROCEDURE sp_recalc_invoice(IN p_invoice_id VARCHAR(128))
BEGIN
  DECLARE v_total DECIMAL(12,2);
  DECLARE v_paid DECIMAL(12,2);
  DECLARE v_status VARCHAR(64);
  DECLARE v_order_id VARCHAR(128);
  DECLARE v_quote_id VARCHAR(128);
  DECLARE v_q_status VARCHAR(64);
  DECLARE v_existing_status VARCHAR(64);
  IF p_invoice_id IS NOT NULL THEN
    SELECT COALESCE(total,0), order_id, quote_id, TRIM(status)
      INTO v_total, v_order_id, v_quote_id, v_existing_status
      FROM pos_invoices WHERE id = p_invoice_id LIMIT 1;

    IF v_existing_status IS NULL OR LOWER(v_existing_status) <> 'refunded' THEN
      SELECT COALESCE(SUM(l.amount_applied), 0) INTO v_paid
      FROM pos_receipt_invoice_links l
      INNER JOIN pos_receipts r ON r.id = l.receipt_id AND r.status = 'approved'
      WHERE l.invoice_id COLLATE utf8mb4_unicode_ci = p_invoice_id COLLATE utf8mb4_unicode_ci;

      IF v_paid <= 0 THEN SET v_status = 'Unpaid';
      ELSEIF v_paid < v_total THEN SET v_status = 'Partially Paid';
      ELSE SET v_status = 'Paid';
      END IF;

      IF v_status = 'Paid' THEN SET v_q_status = 'invoice_generated_paid';
      ELSEIF v_status = 'Partially Paid' THEN SET v_q_status = 'invoice_generated_partially_paid';
      ELSE SET v_q_status = 'invoice_generated_unpaid';
      END IF;

      UPDATE pos_invoices
        SET amount_paid = v_paid, status = v_status, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = p_invoice_id;

      IF v_order_id IS NOT NULL THEN
        UPDATE pos_orders SET status = v_q_status, invoice_id = p_invoice_id, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = v_order_id;
      END IF;

      IF v_quote_id IS NOT NULL THEN
        UPDATE pos_quotes SET status = v_q_status, invoice_id = p_invoice_id, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = v_quote_id;
      END IF;
    END IF;
  END IF;
END//
DELIMITER ;
