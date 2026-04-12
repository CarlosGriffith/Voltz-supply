/**
 * Migrates pos_invoices.status to case-sensitive display values:
 * Unpaid, Partially Paid, Paid, Refunded (matches app + chk_pos_invoices_status).
 *
 *   npm run db:migrate:invoice-status-display
 *
 * Env: AIVEN_MYSQL_* (see other scripts/run-*.mjs). Requires AIVEN_MYSQL_PASSWORD in .env.
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
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
});

const spRecalcInvoice = `
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

    SELECT COALESCE(SUM(amount_paid), 0) INTO v_paid
    FROM pos_receipts WHERE invoice_id = p_invoice_id AND status = 'approved';

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
END`;

const viewCheckoutCandidates = `
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
WHERE i.status IN ('Unpaid', 'Partially Paid')`;

async function run() {
  console.log('Connected to', host, database);

  await conn.query('DROP VIEW IF EXISTS v_pos_checkout_candidates');

  try {
    await conn.query('ALTER TABLE pos_invoices DROP CHECK chk_pos_invoices_status');
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/check constraint|Unknown check constraint|doesn't exist/i.test(msg)) {
      throw e;
    }
    console.log('Note: chk_pos_invoices_status not dropped (may use different name or already migrated).');
  }

  await conn.query(`UPDATE pos_invoices SET status = 'Unpaid' WHERE status IN ('unpaid', 'overdue')`);
  await conn.query(`UPDATE pos_invoices SET status = 'Paid' WHERE status = 'paid'`);
  await conn.query(`UPDATE pos_invoices SET status = 'Partially Paid' WHERE status IN ('partially_paid', 'partial')`);
  await conn.query(`UPDATE pos_invoices SET status = 'Refunded' WHERE status = 'refunded'`);
  // Any legacy/unknown value left (e.g. mixed case, typos) — required before ADD CHECK
  await conn.query(
    `UPDATE pos_invoices SET status = 'Unpaid' WHERE status NOT IN ('Unpaid','Partially Paid','Paid','Refunded')`
  );

  try {
    await conn.query(`
      ALTER TABLE pos_invoices
        ADD CONSTRAINT chk_pos_invoices_status
        CHECK (\`status\` IN ('Unpaid','Partially Paid','Paid','Refunded'))
    `);
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/Duplicate check|already exists/i.test(msg)) throw e;
    console.log('Note: chk_pos_invoices_status already present.');
  }

  await conn.query(`ALTER TABLE pos_invoices MODIFY COLUMN \`status\` VARCHAR(64) NOT NULL DEFAULT 'Unpaid'`);

  await conn.query('DROP PROCEDURE IF EXISTS sp_recalc_invoice');
  await conn.query(spRecalcInvoice);

  await conn.query(viewCheckoutCandidates);

  console.log('OK — invoice status values migrated to Unpaid / Partially Paid / Paid / Refunded.');
}

try {
  await run();
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  await conn.end();
}
