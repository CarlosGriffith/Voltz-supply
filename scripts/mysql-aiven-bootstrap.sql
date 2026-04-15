-- ============================================================
-- Voltz POS — MySQL 8+ bootstrap for Aiven MySQL
-- Save Aiven CA to a .pem file, then connect with SSL.
--
--   mysql -h HOST -P PORT -u avnadmin -p --ssl-mode=VERIFY_CA --ssl-ca=CA.pem defaultdb
--
-- Or create a dedicated DB:
--   CREATE DATABASE voltz_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE voltz_pos;
--   SOURCE scripts/mysql-aiven-bootstrap.sql;
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS pos_doc_counters;
CREATE TABLE pos_doc_counters (
  doc_type VARCHAR(32) NOT NULL PRIMARY KEY,
  seq_value INT UNSIGNED NOT NULL DEFAULT 1000000
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pos_doc_counters (doc_type, seq_value) VALUES
  ('quote', 1000000),
  ('order', 1000000),
  ('invoice', 1000000),
  ('receipt', 1000000),
  ('refund', 1000000);

DROP TABLE IF EXISTS pos_customers;
CREATE TABLE pos_customers (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `name` VARCHAR(512) NOT NULL DEFAULT '',
  `email` VARCHAR(512) NOT NULL DEFAULT '',
  `phone` VARCHAR(128) NOT NULL DEFAULT '',
  `company` VARCHAR(512) NOT NULL DEFAULT '',
  `address` TEXT,
  `notes` TEXT,
  `store_credit` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `account_balance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_quote_requests;
CREATE TABLE pos_quote_requests (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `name` VARCHAR(512) NOT NULL DEFAULT '',
  `email` VARCHAR(512) NOT NULL DEFAULT '',
  `phone` VARCHAR(128) NOT NULL DEFAULT '',
  `company` VARCHAR(512) NOT NULL DEFAULT '',
  `category` VARCHAR(256) NOT NULL DEFAULT '',
  `product` VARCHAR(512) NOT NULL DEFAULT '',
  `quantity` VARCHAR(64) NOT NULL DEFAULT '',
  `message` TEXT,
  `status` VARCHAR(64) NOT NULL DEFAULT 'new',
  `quote_id` VARCHAR(128) NULL,
  `quote_number` VARCHAR(64) NULL,
  `customer_id` VARCHAR(128) NULL,
  `email_sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_pos_quote_requests_status CHECK (`status` IN ('new','reviewed','printed','emailed','quoted','closed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_quotes;
CREATE TABLE pos_quotes (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `quote_number` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(128) NULL,
  `customer_name` VARCHAR(512) NOT NULL DEFAULT '',
  `customer_email` VARCHAR(512) NOT NULL DEFAULT '',
  `customer_phone` VARCHAR(128) NOT NULL DEFAULT '',
  `customer_company` VARCHAR(512) NOT NULL DEFAULT '',
  `source` VARCHAR(32) NOT NULL DEFAULT 'walk-in',
  `status` VARCHAR(64) NOT NULL DEFAULT 'reviewed',
  `status_before_dormant` VARCHAR(64) NULL,
  `items` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `notes` TEXT,
  `valid_until` DATETIME(3) NULL,
  `website_request_id` VARCHAR(128) NULL,
  `order_id` VARCHAR(128) NULL,
  `invoice_id` VARCHAR(128) NULL,
  `email_sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pos_quotes_number (`quote_number`),
  CONSTRAINT chk_pos_quotes_source CHECK (`source` IN ('walk-in','website')),
  CONSTRAINT chk_pos_quotes_status CHECK (`status` IN (
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
  )),
  CONSTRAINT fk_pos_quotes_customer FOREIGN KEY (`customer_id`) REFERENCES pos_customers (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_orders;
CREATE TABLE pos_orders (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `order_number` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(128) NULL,
  `customer_name` VARCHAR(512) NOT NULL DEFAULT '',
  `customer_email` VARCHAR(512) NOT NULL DEFAULT '',
  `customer_phone` VARCHAR(128) NOT NULL DEFAULT '',
  `customer_type` VARCHAR(32) NOT NULL DEFAULT 'visitor',
  `status` VARCHAR(64) NOT NULL DEFAULT 'reviewed',
  `items` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `notes` TEXT,
  `quote_id` VARCHAR(128) NULL,
  `invoice_id` VARCHAR(128) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pos_orders_number (`order_number`),
  CONSTRAINT chk_pos_orders_customer_type CHECK (`customer_type` IN ('visitor','registered')),
  CONSTRAINT chk_pos_orders_status CHECK (`status` IN (
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
    'partially_refunded',
    'refunded'
  )),
  CONSTRAINT fk_pos_orders_customer FOREIGN KEY (`customer_id`) REFERENCES pos_customers (`id`) ON DELETE SET NULL,
  CONSTRAINT fk_pos_orders_quote FOREIGN KEY (`quote_id`) REFERENCES pos_quotes (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_invoices;
CREATE TABLE pos_invoices (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(128) NULL,
  `quote_id` VARCHAR(128) NULL,
  `customer_id` VARCHAR(128) NULL,
  `customer_name` VARCHAR(512) NOT NULL DEFAULT '',
  `customer_email` VARCHAR(512) NOT NULL DEFAULT '',
  `customer_phone` VARCHAR(128) NOT NULL DEFAULT '',
  `status` VARCHAR(64) NOT NULL DEFAULT 'Unpaid',
  `payment_method` VARCHAR(64) NULL,
  `delivery_status` VARCHAR(64) NOT NULL DEFAULT 'pending',
  `items` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `amount_paid` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `notes` TEXT,
  `paid_at` DATETIME(3) NULL,
  `delivered_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pos_invoices_number (`invoice_number`),
  CONSTRAINT chk_pos_invoices_status CHECK (`status` IN ('Unpaid','Partially Paid','Paid','Refunded')),
  CONSTRAINT chk_pos_invoices_delivery CHECK (`delivery_status` IN ('pending','ready','delivered')),
  CONSTRAINT fk_pos_invoices_order FOREIGN KEY (`order_id`) REFERENCES pos_orders (`id`) ON DELETE SET NULL,
  CONSTRAINT fk_pos_invoices_quote FOREIGN KEY (`quote_id`) REFERENCES pos_quotes (`id`) ON DELETE SET NULL,
  CONSTRAINT fk_pos_invoices_customer FOREIGN KEY (`customer_id`) REFERENCES pos_customers (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_receipts;
CREATE TABLE pos_receipts (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `receipt_number` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(128) NULL,
  `customer_id` VARCHAR(128) NULL,
  `customer_name` VARCHAR(512) NOT NULL DEFAULT '',
  `payment_method` VARCHAR(64) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'approved',
  `payment_type` VARCHAR(32) NOT NULL DEFAULT 'full',
  `amount_paid` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `items` LONGTEXT NOT NULL,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `subtotal` DECIMAL(12,2) NULL DEFAULT NULL,
  `tax_rate` DECIMAL(12,2) NULL DEFAULT NULL,
  `tax_amount` DECIMAL(12,2) NULL DEFAULT NULL,
  `discount_amount` DECIMAL(12,2) NULL DEFAULT NULL,
  `notes` TEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pos_receipts_number (`receipt_number`),
  CONSTRAINT chk_pos_receipts_status CHECK (`status` IN ('approved','pending_approval')),
  CONSTRAINT chk_pos_receipts_payment_type CHECK (`payment_type` IN ('full','partial','overpayment')),
  CONSTRAINT fk_pos_receipts_invoice FOREIGN KEY (`invoice_id`) REFERENCES pos_invoices (`id`) ON DELETE SET NULL,
  CONSTRAINT fk_pos_receipts_customer FOREIGN KEY (`customer_id`) REFERENCES pos_customers (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_receipt_invoice_links;
CREATE TABLE pos_receipt_invoice_links (
  `receipt_id` VARCHAR(128) NOT NULL,
  `invoice_id` VARCHAR(128) NOT NULL,
  `amount_applied` DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`receipt_id`, `invoice_id`),
  KEY `idx_pril_invoice` (`invoice_id`),
  CONSTRAINT `fk_pril_receipt` FOREIGN KEY (`receipt_id`) REFERENCES `pos_receipts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pril_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `pos_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_refunds;
CREATE TABLE pos_refunds (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `refund_number` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(128) NULL,
  `invoice_links` LONGTEXT NULL COMMENT 'JSON: per-invoice subtotals when one refund spans multiple invoices',
  `receipt_id` VARCHAR(128) NULL,
  `customer_id` VARCHAR(128) NULL,
  `customer_name` VARCHAR(512) NOT NULL DEFAULT '',
  `refund_type` VARCHAR(32) NOT NULL DEFAULT 'cash',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `items` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `store_credit_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `reason` TEXT,
  `notes` TEXT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pos_refunds_number (`refund_number`),
  CONSTRAINT chk_pos_refunds_type CHECK (`refund_type` IN ('cash','store_credit','exchange')),
  CONSTRAINT chk_pos_refunds_status CHECK (`status` IN ('pending','approved','completed','rejected')),
  CONSTRAINT fk_pos_refunds_invoice FOREIGN KEY (`invoice_id`) REFERENCES pos_invoices (`id`) ON DELETE SET NULL,
  CONSTRAINT fk_pos_refunds_receipt FOREIGN KEY (`receipt_id`) REFERENCES pos_receipts (`id`) ON DELETE SET NULL,
  CONSTRAINT fk_pos_refunds_customer FOREIGN KEY (`customer_id`) REFERENCES pos_customers (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_sent_emails;
CREATE TABLE pos_sent_emails (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `recipient_email` VARCHAR(512) NOT NULL DEFAULT '',
  `recipient_name` VARCHAR(512) NOT NULL DEFAULT '',
  `subject` VARCHAR(1024) NOT NULL DEFAULT '',
  `body` TEXT,
  `html_body` MEDIUMTEXT,
  `document_type` VARCHAR(64) NOT NULL DEFAULT '',
  `document_id` VARCHAR(128) NOT NULL DEFAULT '',
  `document_number` VARCHAR(128) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'sent',
  `error_message` TEXT,
  `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_pos_sent_emails_status CHECK (`status` IN ('sent','failed','resent'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS pos_smtp_settings;
CREATE TABLE pos_smtp_settings (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `host` VARCHAR(512) NOT NULL DEFAULT '',
  `port` INT NOT NULL DEFAULT 587,
  `username` VARCHAR(512) NOT NULL DEFAULT '',
  `password` VARCHAR(512) NOT NULL DEFAULT '',
  `from_email` VARCHAR(512) NOT NULL DEFAULT '',
  `from_name` VARCHAR(512) NOT NULL DEFAULT '',
  `use_tls` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Sequential doc numbers: QT-1000001, OR-1000001, INV-1000001, RT-1000001, REF-1000001
DROP PROCEDURE IF EXISTS sp_next_doc_number;
DELIMITER //
CREATE PROCEDURE sp_next_doc_number(IN p_doc_type VARCHAR(32), IN p_prefix VARCHAR(16), OUT p_out VARCHAR(64))
BEGIN
  DECLARE v_next INT UNSIGNED;
  UPDATE pos_doc_counters
    SET seq_value = LAST_INSERT_ID(seq_value + 1)
  WHERE doc_type = p_doc_type;
  SET v_next = LAST_INSERT_ID();
  SET p_out = CONCAT(p_prefix, LPAD(v_next, 7, '0'));
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_quotes_before_insert;
DELIMITER //
CREATE TRIGGER trg_pos_quotes_before_insert
BEFORE INSERT ON pos_quotes
FOR EACH ROW
BEGIN
  DECLARE v_num VARCHAR(64);
  IF NEW.quote_number IS NULL OR TRIM(NEW.quote_number) = '' THEN
    CALL sp_next_doc_number('quote', 'QT-', v_num);
    SET NEW.quote_number = v_num;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_orders_before_insert;
DELIMITER //
CREATE TRIGGER trg_pos_orders_before_insert
BEFORE INSERT ON pos_orders
FOR EACH ROW
BEGIN
  DECLARE v_num VARCHAR(64);
  IF NEW.order_number IS NULL OR TRIM(NEW.order_number) = '' THEN
    CALL sp_next_doc_number('order', 'OR-', v_num);
    SET NEW.order_number = v_num;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_invoices_before_insert;
DELIMITER //
CREATE TRIGGER trg_pos_invoices_before_insert
BEFORE INSERT ON pos_invoices
FOR EACH ROW
BEGIN
  DECLARE v_num VARCHAR(64);
  IF NEW.invoice_number IS NULL OR TRIM(NEW.invoice_number) = '' THEN
    CALL sp_next_doc_number('invoice', 'INV-', v_num);
    SET NEW.invoice_number = v_num;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipts_before_insert;
DELIMITER //
CREATE TRIGGER trg_pos_receipts_before_insert
BEFORE INSERT ON pos_receipts
FOR EACH ROW
BEGIN
  DECLARE v_num VARCHAR(64);
  IF NEW.receipt_number IS NULL OR TRIM(NEW.receipt_number) = '' THEN
    CALL sp_next_doc_number('receipt', 'RT-', v_num);
    SET NEW.receipt_number = v_num;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_refunds_before_insert;
DELIMITER //
CREATE TRIGGER trg_pos_refunds_before_insert
BEFORE INSERT ON pos_refunds
FOR EACH ROW
BEGIN
  DECLARE v_num VARCHAR(64);
  IF NEW.refund_number IS NULL OR TRIM(NEW.refund_number) = '' THEN
    CALL sp_next_doc_number('refund', 'REF-', v_num);
    SET NEW.refund_number = v_num;
  END IF;
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

    -- Refunds are applied in the app; receipt totals must not resurrect Paid over Refunded.
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
      AND i.status IN ('Unpaid', 'Partially Paid')
      AND NOT EXISTS (
        SELECT 1 FROM pos_refunds rf
        WHERE rf.invoice_id COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
           OR (
             rf.invoice_links IS NOT NULL
             AND TRIM(rf.invoice_links) NOT IN ('', 'null', '[]')
             AND JSON_VALID(rf.invoice_links)
             AND JSON_SEARCH(rf.invoice_links, 'one', i.id, NULL, '$[*].invoice_id') IS NOT NULL
           )
      );

    UPDATE pos_customers
    SET account_balance = GREATEST(v_bal, 0),
        updated_at = CURRENT_TIMESTAMP(3)
    WHERE id = p_customer_id;
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_receipt_invoice_links_after_ins;
DROP TRIGGER IF EXISTS trg_pos_receipt_invoice_links_after_upd;
DROP TRIGGER IF EXISTS trg_pos_receipt_invoice_links_after_del;
DROP TRIGGER IF EXISTS trg_pos_receipts_after_ins;
DROP TRIGGER IF EXISTS trg_pos_receipts_after_upd;
DROP TRIGGER IF EXISTS trg_pos_receipts_after_del;

DELIMITER //
CREATE TRIGGER trg_pos_receipt_invoice_links_after_ins
AFTER INSERT ON pos_receipt_invoice_links
FOR EACH ROW
BEGIN
  CALL sp_recalc_invoice(NEW.invoice_id);
END//
DELIMITER ;

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

DELIMITER //
CREATE TRIGGER trg_pos_receipt_invoice_links_after_del
AFTER DELETE ON pos_receipt_invoice_links
FOR EACH ROW
BEGIN
  CALL sp_recalc_invoice(OLD.invoice_id);
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_invoices_after_ins;
DELIMITER //
CREATE TRIGGER trg_pos_invoices_after_ins
AFTER INSERT ON pos_invoices
FOR EACH ROW
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    CALL sp_recalc_customer_ledger(NEW.customer_id);
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_invoices_after_upd;
DELIMITER //
CREATE TRIGGER trg_pos_invoices_after_upd
AFTER UPDATE ON pos_invoices
FOR EACH ROW
BEGIN
  IF OLD.customer_id IS NOT NULL THEN CALL sp_recalc_customer_ledger(OLD.customer_id); END IF;
  IF NEW.customer_id IS NOT NULL AND (NEW.customer_id <> OLD.customer_id OR OLD.customer_id IS NULL) THEN
    CALL sp_recalc_customer_ledger(NEW.customer_id);
  END IF;
END//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pos_invoices_after_del;
DELIMITER //
CREATE TRIGGER trg_pos_invoices_after_del
AFTER DELETE ON pos_invoices
FOR EACH ROW
BEGIN
  IF OLD.customer_id IS NOT NULL THEN CALL sp_recalc_customer_ledger(OLD.customer_id); END IF;
END//
DELIMITER ;

DROP VIEW IF EXISTS v_pos_checkout_candidates;
CREATE VIEW v_pos_checkout_candidates AS
SELECT
  'quote' AS doc_type,
  q.id AS doc_id,
  q.quote_number AS doc_number,
  q.customer_id,
  q.customer_name,
  q.customer_email,
  q.customer_phone,
  q.total AS amount_due,
  q.status
FROM pos_quotes q
WHERE q.status = 'reviewed'
UNION ALL
SELECT
  'order',
  o.id,
  o.order_number,
  o.customer_id,
  o.customer_name,
  o.customer_email,
  o.customer_phone,
  o.total,
  o.status
FROM pos_orders o
WHERE o.status = 'reviewed'
UNION ALL
SELECT
  'invoice',
  i.id,
  i.invoice_number,
  i.customer_id,
  i.customer_name,
  i.customer_email,
  i.customer_phone,
  GREATEST(i.total - COALESCE(i.amount_paid, 0), 0),
  i.status
FROM pos_invoices i
WHERE i.status IN ('Unpaid', 'Partially Paid');
