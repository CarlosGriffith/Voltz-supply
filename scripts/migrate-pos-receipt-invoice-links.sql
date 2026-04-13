-- Links receipts to one or more invoices with the amount applied to each (multi-invoice checkout).
-- Run once against an existing database. Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS where appropriate.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS pos_receipt_invoice_links (
  receipt_id VARCHAR(128) NOT NULL,
  invoice_id VARCHAR(128) NOT NULL,
  amount_applied DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (receipt_id, invoice_id),
  KEY idx_pril_invoice (invoice_id),
  CONSTRAINT fk_pril_receipt FOREIGN KEY (receipt_id) REFERENCES pos_receipts (id) ON DELETE CASCADE,
  CONSTRAINT fk_pril_invoice FOREIGN KEY (invoice_id) REFERENCES pos_invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per legacy receipt that had invoice_id set (idempotent if already present)
INSERT IGNORE INTO pos_receipt_invoice_links (receipt_id, invoice_id, amount_applied)
SELECT id, invoice_id, amount_paid
FROM pos_receipts
WHERE invoice_id IS NOT NULL AND TRIM(invoice_id) <> '';

SET FOREIGN_KEY_CHECKS = 1;

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
  IF p_invoice_id IS NOT NULL THEN
    SELECT COALESCE(total,0), order_id, quote_id
      INTO v_total, v_order_id, v_quote_id
    FROM pos_invoices WHERE id = p_invoice_id LIMIT 1;

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
END//
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_recalc_customer_ledger;
DELIMITER //
CREATE PROCEDURE sp_recalc_customer_ledger(IN p_customer_id VARCHAR(128))
BEGIN
  DECLARE v_bal DECIMAL(14,2);
  IF p_customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(i.total, 0) - COALESCE(rp.paid, 0))), 0) INTO v_bal
    FROM pos_invoices i
    LEFT JOIN (
      SELECT l.invoice_id AS invoice_id, SUM(l.amount_applied) AS paid
      FROM pos_receipt_invoice_links l
      INNER JOIN pos_receipts r ON r.id = l.receipt_id AND r.status = 'approved'
      GROUP BY l.invoice_id
    ) rp ON rp.invoice_id = i.id
    WHERE i.customer_id = p_customer_id
      AND i.status IN ('Unpaid', 'Partially Paid');

    UPDATE pos_customers
    SET account_balance = GREATEST(v_bal, 0),
        updated_at = CURRENT_TIMESTAMP(3)
    WHERE id = p_customer_id;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipt_invoice_links_after_ins;
DELIMITER //
CREATE TRIGGER trg_pos_receipt_invoice_links_after_ins
AFTER INSERT ON pos_receipt_invoice_links
FOR EACH ROW
BEGIN
  CALL sp_recalc_invoice(NEW.invoice_id);
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipt_invoice_links_after_upd;
DELIMITER //
CREATE TRIGGER trg_pos_receipt_invoice_links_after_upd
AFTER UPDATE ON pos_receipt_invoice_links
FOR EACH ROW
BEGIN
  IF OLD.invoice_id COLLATE utf8mb4_unicode_ci <> NEW.invoice_id COLLATE utf8mb4_unicode_ci THEN
    CALL sp_recalc_invoice(OLD.invoice_id);
    CALL sp_recalc_invoice(NEW.invoice_id);
  ELSE
    CALL sp_recalc_invoice(NEW.invoice_id);
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipt_invoice_links_after_del;
DELIMITER //
CREATE TRIGGER trg_pos_receipt_invoice_links_after_del
AFTER DELETE ON pos_receipt_invoice_links
FOR EACH ROW
BEGIN
  CALL sp_recalc_invoice(OLD.invoice_id);
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipts_before_ins_pay;
DELIMITER //
CREATE TRIGGER trg_pos_receipts_before_ins_pay
BEFORE INSERT ON pos_receipts
FOR EACH ROW
BEGIN
  DECLARE inv_total DECIMAL(12,2);
  DECLARE prev_paid DECIMAL(12,2);
  DECLARE after_paid DECIMAL(12,2);
  IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
    SET NEW.status = 'approved';
  END IF;
  IF NOT (NEW.payment_type IS NOT NULL AND TRIM(COALESCE(NEW.payment_type,'')) <> '') THEN
    IF NEW.invoice_id IS NULL THEN
      SET NEW.payment_type = 'full';
    ELSE
      SELECT COALESCE(total, 0) INTO inv_total FROM pos_invoices WHERE id = NEW.invoice_id LIMIT 1;
      SELECT COALESCE(SUM(l.amount_applied), 0) INTO prev_paid
      FROM pos_receipt_invoice_links l
      INNER JOIN pos_receipts r ON r.id = l.receipt_id AND r.status = 'approved'
      WHERE l.invoice_id = NEW.invoice_id;
      SET after_paid = prev_paid + COALESCE(NEW.amount_paid, 0);
      IF after_paid > inv_total THEN
        SET NEW.payment_type = 'overpayment';
      ELSEIF after_paid = inv_total THEN
        SET NEW.payment_type = 'full';
      ELSE
        SET NEW.payment_type = 'partial';
      END IF;
    END IF;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipts_before_upd_pay;
DELIMITER //
CREATE TRIGGER trg_pos_receipts_before_upd_pay
BEFORE UPDATE ON pos_receipts
FOR EACH ROW
BEGIN
  DECLARE inv_total DECIMAL(12,2);
  DECLARE prev_paid DECIMAL(12,2);
  DECLARE after_paid DECIMAL(12,2);
  IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
    SET NEW.status = 'approved';
  END IF;
  IF NOT (NEW.payment_type IS NOT NULL AND TRIM(COALESCE(NEW.payment_type,'')) <> '') THEN
    IF NEW.invoice_id IS NULL THEN
      SET NEW.payment_type = 'full';
    ELSE
      SELECT COALESCE(total, 0) INTO inv_total FROM pos_invoices WHERE id = NEW.invoice_id LIMIT 1;
      SELECT COALESCE(SUM(l.amount_applied), 0) INTO prev_paid
      FROM pos_receipt_invoice_links l
      INNER JOIN pos_receipts r ON r.id = l.receipt_id AND r.status = 'approved' AND r.id <> NEW.id
      WHERE l.invoice_id = NEW.invoice_id;
      SET after_paid = prev_paid + COALESCE(NEW.amount_paid, 0);
      IF after_paid > inv_total THEN
        SET NEW.payment_type = 'overpayment';
      ELSEIF after_paid = inv_total THEN
        SET NEW.payment_type = 'full';
      ELSE
        SET NEW.payment_type = 'partial';
      END IF;
    END IF;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipts_after_ins;
DROP TRIGGER IF EXISTS trg_pos_receipts_after_upd;
DROP TRIGGER IF EXISTS trg_pos_receipts_after_del;
