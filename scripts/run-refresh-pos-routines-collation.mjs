/**
 * Recreates POS routines/triggers under utf8mb4_unicode_ci to prevent checkout collation mismatch.
 *
 *   npm run db:refresh-pos-routines-collation
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const host = process.env.AIVEN_MYSQL_HOST || 'localhost';
const port = Number(process.env.AIVEN_MYSQL_PORT || 3306);
const user = process.env.AIVEN_MYSQL_USER || 'root';
const password = process.env.AIVEN_MYSQL_PASSWORD || '';
const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';

if (!password) {
  console.error('Set AIVEN_MYSQL_PASSWORD in .env and run again.');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error(
    'Aiven MySQL requires TLS. Place CA at scripts/aiven-ca.pem or set AIVEN_CA_PATH.',
    'Expected file:',
    defaultCaPath
  );
  process.exit(1);
}

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  ssl,
  charset: 'utf8mb4_unicode_ci',
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
});
await conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');

const statements = [
  'DROP TRIGGER IF EXISTS trg_pos_invoices_after_del',
  'DROP TRIGGER IF EXISTS trg_pos_invoices_after_upd',
  'DROP TRIGGER IF EXISTS trg_pos_invoices_after_ins',
  'DROP TRIGGER IF EXISTS trg_pos_invoices_before_insert',
  'DROP TRIGGER IF EXISTS trg_pos_receipts_after_del',
  'DROP TRIGGER IF EXISTS trg_pos_receipts_after_upd',
  'DROP TRIGGER IF EXISTS trg_pos_receipts_after_ins',
  'DROP TRIGGER IF EXISTS trg_pos_receipts_before_upd_pay',
  'DROP TRIGGER IF EXISTS trg_pos_receipts_before_ins_pay',
  'DROP TRIGGER IF EXISTS trg_pos_receipts_before_insert',
  'DROP TRIGGER IF EXISTS trg_pos_orders_before_insert',
  'DROP TRIGGER IF EXISTS trg_pos_quotes_before_insert',
  'DROP PROCEDURE IF EXISTS sp_recalc_customer_ledger',
  'DROP PROCEDURE IF EXISTS sp_recalc_invoice',
  'DROP PROCEDURE IF EXISTS sp_next_doc_number',
  `CREATE PROCEDURE sp_next_doc_number(
    IN p_doc_type VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    IN p_prefix VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    OUT p_out VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  )
  BEGIN
    DECLARE v_next INT UNSIGNED;
    UPDATE pos_doc_counters
      SET seq_value = LAST_INSERT_ID(seq_value + 1)
    WHERE doc_type COLLATE utf8mb4_unicode_ci = p_doc_type COLLATE utf8mb4_unicode_ci;
    SET v_next = LAST_INSERT_ID();
    SET p_out = CONCAT(p_prefix, LPAD(v_next, 7, '0'));
  END`,
  `CREATE TRIGGER trg_pos_quotes_before_insert
  BEFORE INSERT ON pos_quotes
  FOR EACH ROW
  BEGIN
    DECLARE v_num VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF NEW.quote_number IS NULL OR TRIM(NEW.quote_number) = '' THEN
      CALL sp_next_doc_number('quote', 'QT-', v_num);
      SET NEW.quote_number = v_num;
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_orders_before_insert
  BEFORE INSERT ON pos_orders
  FOR EACH ROW
  BEGIN
    DECLARE v_num VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF NEW.order_number IS NULL OR TRIM(NEW.order_number) = '' THEN
      CALL sp_next_doc_number('order', 'OR-', v_num);
      SET NEW.order_number = v_num;
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_invoices_before_insert
  BEFORE INSERT ON pos_invoices
  FOR EACH ROW
  BEGIN
    DECLARE v_num VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF NEW.invoice_number IS NULL OR TRIM(NEW.invoice_number) = '' THEN
      CALL sp_next_doc_number('invoice', 'INV-', v_num);
      SET NEW.invoice_number = v_num;
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_receipts_before_insert
  BEFORE INSERT ON pos_receipts
  FOR EACH ROW
  BEGIN
    DECLARE v_num VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF NEW.receipt_number IS NULL OR TRIM(NEW.receipt_number) = '' THEN
      CALL sp_next_doc_number('receipt', 'RT-', v_num);
      SET NEW.receipt_number = v_num;
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_receipts_before_ins_pay
  BEFORE INSERT ON pos_receipts
  FOR EACH ROW
  BEGIN
    DECLARE inv_total DECIMAL(12,2);
    DECLARE prev_paid DECIMAL(12,2);
    DECLARE after_paid DECIMAL(12,2);
    IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
      SET NEW.status = 'approved';
    END IF;
    IF NEW.invoice_id IS NULL THEN
      SET NEW.payment_type = IFNULL(NEW.payment_type, 'full');
    ELSE
      SELECT COALESCE(total, 0) INTO inv_total FROM pos_invoices WHERE id = NEW.invoice_id LIMIT 1;
      SELECT COALESCE(SUM(amount_paid), 0) INTO prev_paid
        FROM pos_receipts
        WHERE invoice_id = NEW.invoice_id AND status = 'approved';
      SET after_paid = prev_paid + COALESCE(NEW.amount_paid, 0);
      IF after_paid > inv_total THEN
        SET NEW.payment_type = 'overpayment';
      ELSEIF after_paid = inv_total THEN
        SET NEW.payment_type = 'full';
      ELSE
        SET NEW.payment_type = 'partial';
      END IF;
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_receipts_before_upd_pay
  BEFORE UPDATE ON pos_receipts
  FOR EACH ROW
  BEGIN
    DECLARE inv_total DECIMAL(12,2);
    DECLARE prev_paid DECIMAL(12,2);
    DECLARE after_paid DECIMAL(12,2);
    IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
      SET NEW.status = 'approved';
    END IF;
    IF NEW.invoice_id IS NULL THEN
      SET NEW.payment_type = IFNULL(NEW.payment_type, 'full');
    ELSE
      SELECT COALESCE(total, 0) INTO inv_total FROM pos_invoices WHERE id = NEW.invoice_id LIMIT 1;
      SELECT COALESCE(SUM(amount_paid), 0) INTO prev_paid
        FROM pos_receipts
        WHERE invoice_id = NEW.invoice_id AND status = 'approved' AND id <> NEW.id;
      SET after_paid = prev_paid + COALESCE(NEW.amount_paid, 0);
      IF after_paid > inv_total THEN
        SET NEW.payment_type = 'overpayment';
      ELSEIF after_paid = inv_total THEN
        SET NEW.payment_type = 'full';
      ELSE
        SET NEW.payment_type = 'partial';
      END IF;
    END IF;
  END`,
  `CREATE PROCEDURE sp_recalc_invoice(
    IN p_invoice_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  )
  BEGIN
    DECLARE v_total DECIMAL(12,2);
    DECLARE v_paid DECIMAL(12,2);
    DECLARE v_status VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE v_order_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE v_quote_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE v_q_status VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF p_invoice_id IS NOT NULL THEN
      SELECT COALESCE(total,0), order_id, quote_id
        INTO v_total, v_order_id, v_quote_id
      FROM pos_invoices WHERE id COLLATE utf8mb4_unicode_ci = p_invoice_id COLLATE utf8mb4_unicode_ci LIMIT 1;

      SELECT COALESCE(SUM(amount_paid), 0) INTO v_paid
      FROM pos_receipts WHERE invoice_id COLLATE utf8mb4_unicode_ci = p_invoice_id COLLATE utf8mb4_unicode_ci AND status = 'approved';

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
      WHERE id COLLATE utf8mb4_unicode_ci = p_invoice_id COLLATE utf8mb4_unicode_ci;

      IF v_order_id IS NOT NULL THEN
        UPDATE pos_orders SET status = v_q_status, invoice_id = p_invoice_id, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id COLLATE utf8mb4_unicode_ci = v_order_id COLLATE utf8mb4_unicode_ci;
      END IF;

      IF v_quote_id IS NOT NULL THEN
        UPDATE pos_quotes SET status = v_q_status, invoice_id = p_invoice_id, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id COLLATE utf8mb4_unicode_ci = v_quote_id COLLATE utf8mb4_unicode_ci;
      END IF;
    END IF;
  END`,
  `CREATE PROCEDURE sp_recalc_customer_ledger(
    IN p_customer_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  )
  BEGIN
    DECLARE v_bal DECIMAL(14,2);
    IF p_customer_id IS NOT NULL THEN
      SELECT COALESCE(SUM(GREATEST(0, COALESCE(i.total, 0) - COALESCE(rp.paid, 0))), 0) INTO v_bal
      FROM pos_invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount_paid) AS paid
        FROM pos_receipts WHERE status = 'approved' GROUP BY invoice_id
      ) rp ON rp.invoice_id = i.id
      WHERE i.customer_id COLLATE utf8mb4_unicode_ci = p_customer_id COLLATE utf8mb4_unicode_ci
        AND i.status COLLATE utf8mb4_unicode_ci IN ('Unpaid', 'Partially Paid');

      UPDATE pos_customers
      SET account_balance = GREATEST(v_bal, 0),
          updated_at = CURRENT_TIMESTAMP(3)
      WHERE id COLLATE utf8mb4_unicode_ci = p_customer_id COLLATE utf8mb4_unicode_ci;
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_receipts_after_ins
  AFTER INSERT ON pos_receipts
  FOR EACH ROW
  BEGIN
    DECLARE v_cid VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF NEW.invoice_id IS NOT NULL THEN
      CALL sp_recalc_invoice(NEW.invoice_id);
      SELECT customer_id INTO v_cid FROM pos_invoices WHERE id = NEW.invoice_id LIMIT 1;
      CALL sp_recalc_customer_ledger(v_cid);
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_receipts_after_upd
  AFTER UPDATE ON pos_receipts
  FOR EACH ROW
  BEGIN
    DECLARE v_cid_old VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE v_cid_new VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF OLD.invoice_id IS NOT NULL THEN
      CALL sp_recalc_invoice(OLD.invoice_id);
      SELECT customer_id INTO v_cid_old FROM pos_invoices WHERE id = OLD.invoice_id LIMIT 1;
      CALL sp_recalc_customer_ledger(v_cid_old);
    END IF;
    IF NEW.invoice_id IS NOT NULL AND (NEW.invoice_id <> OLD.invoice_id OR OLD.invoice_id IS NULL) THEN
      CALL sp_recalc_invoice(NEW.invoice_id);
      SELECT customer_id INTO v_cid_new FROM pos_invoices WHERE id = NEW.invoice_id LIMIT 1;
      CALL sp_recalc_customer_ledger(v_cid_new);
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_receipts_after_del
  AFTER DELETE ON pos_receipts
  FOR EACH ROW
  BEGIN
    DECLARE v_cid VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    IF OLD.invoice_id IS NOT NULL THEN
      CALL sp_recalc_invoice(OLD.invoice_id);
      SELECT customer_id INTO v_cid FROM pos_invoices WHERE id = OLD.invoice_id LIMIT 1;
      CALL sp_recalc_customer_ledger(v_cid);
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_invoices_after_ins
  AFTER INSERT ON pos_invoices
  FOR EACH ROW
  BEGIN
    IF NEW.customer_id IS NOT NULL THEN
      CALL sp_recalc_customer_ledger(NEW.customer_id);
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_invoices_after_upd
  AFTER UPDATE ON pos_invoices
  FOR EACH ROW
  BEGIN
    IF OLD.customer_id IS NOT NULL THEN CALL sp_recalc_customer_ledger(OLD.customer_id); END IF;
    IF NEW.customer_id IS NOT NULL AND (NEW.customer_id <> OLD.customer_id OR OLD.customer_id IS NULL) THEN
      CALL sp_recalc_customer_ledger(NEW.customer_id);
    END IF;
  END`,
  `CREATE TRIGGER trg_pos_invoices_after_del
  AFTER DELETE ON pos_invoices
  FOR EACH ROW
  BEGIN
    IF OLD.customer_id IS NOT NULL THEN CALL sp_recalc_customer_ledger(OLD.customer_id); END IF;
  END`,
];

console.log('Connected to', host, database);
for (const stmt of statements) {
  await conn.query(stmt);
  const s = stmt.replace(/\s+/g, ' ').trim();
  console.log('OK:', s.slice(0, 92) + (s.length > 92 ? '…' : ''));
}
await conn.end();
console.log('Done — POS routines/triggers refreshed with utf8mb4_unicode_ci-safe definitions.');
