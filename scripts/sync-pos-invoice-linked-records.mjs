/**
 * Push commercial fields + payment-linked status from pos_invoices onto linked
 * pos_orders / pos_quotes (same idea as propagateInvoiceToLinkedRecords / syncLinkedFromSavedInvoice).
 *
 * Usage:
 *   node scripts/sync-pos-invoice-linked-records.mjs INV-1000008
 *   node scripts/sync-pos-invoice-linked-records.mjs --dry-run INV-1000008
 *
 * Env: AIVEN_MYSQL_* (see other scripts/run-*.mjs). Requires AIVEN_MYSQL_PASSWORD in .env.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const host = process.env.AIVEN_MYSQL_HOST || 'mysql-voltz-elife365-voltz.j.aivencloud.com';
const port = Number(process.env.AIVEN_MYSQL_PORT || 28070);
const user = process.env.AIVEN_MYSQL_USER || 'avnadmin';
const password = process.env.AIVEN_MYSQL_PASSWORD || '';
const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const invoiceNumber = args[0] || 'INV-1000008';

function linkedDocStatusFromInvoice(status) {
  const raw = String(status || '').trim();
  const compact = raw.toLowerCase().replace(/\s+/g, '_');
  if (compact === 'refunded' || raw === 'Refunded') return 'refunded';
  if (compact === 'paid') return 'invoice_generated_paid';
  if (compact === 'partially_paid' || compact === 'partial') return 'invoice_generated_partially_paid';
  if (compact === 'unpaid' || compact === 'overdue') return 'invoice_generated_unpaid';
  if (raw === 'Paid') return 'invoice_generated_paid';
  if (raw === 'Partially Paid') return 'invoice_generated_partially_paid';
  if (raw === 'Unpaid') return 'invoice_generated_unpaid';
  return null;
}

function itemsCell(row) {
  const i = row.items;
  if (typeof i === 'string') return i;
  return JSON.stringify(i ?? []);
}

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

try {
  const [[inv]] = await conn.query('SELECT * FROM pos_invoices WHERE invoice_number = ? LIMIT 1', [
    invoiceNumber,
  ]);
  if (!inv) {
    console.error(`No invoice found with invoice_number=${invoiceNumber}`);
    process.exit(1);
  }

  console.log(`Invoice ${inv.invoice_number} id=${inv.id} status=${inv.status}`);
  const oid = inv.order_id || null;
  const qid = inv.quote_id || null;
  if (!oid && !qid) {
    console.log('No order_id or quote_id on invoice — nothing to sync.');
    process.exit(0);
  }

  const linkedStatus = linkedDocStatusFromInvoice(inv.status);
  const itemsJson = itemsCell(inv);
  const custId = inv.customer_id ?? null;
  const customerType = custId ? 'registered' : 'visitor';

  if (oid) {
    const [[orderRow]] = await conn.query('SELECT id, status FROM pos_orders WHERE id = ?', [oid]);
    if (!orderRow) {
      console.warn(`Warning: invoice.order_id=${oid} but no pos_orders row — skipping order update.`);
    } else {
      const nextStatus = linkedStatus ?? orderRow.status;
      const sql = `UPDATE pos_orders SET
        customer_id = ?, customer_name = ?, customer_email = ?, customer_phone = ?,
        customer_type = ?, status = ?, items = ?, subtotal = ?, tax_rate = ?, tax_amount = ?,
        discount_amount = ?, total = ?, notes = ?, quote_id = ?, invoice_id = ?,
        updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`;
      const params = [
        custId,
        inv.customer_name ?? '',
        inv.customer_email ?? '',
        inv.customer_phone ?? '',
        customerType,
        nextStatus,
        itemsJson,
        Number(inv.subtotal) || 0,
        Number(inv.tax_rate) || 0,
        Number(inv.tax_amount) || 0,
        Number(inv.discount_amount) || 0,
        Number(inv.total) || 0,
        inv.notes ?? '',
        inv.quote_id ?? null,
        inv.id,
        oid,
      ];
      console.log(
        dryRun ? '[dry-run] Would update pos_orders' : 'Updating pos_orders',
        oid,
        `status -> ${nextStatus}`
      );
      if (!dryRun) await conn.query(sql, params);
    }
  }

  if (qid) {
    const [[quoteRow]] = await conn.query(
      'SELECT id, status, order_id FROM pos_quotes WHERE id = ?',
      [qid]
    );
    if (!quoteRow) {
      console.warn(`Warning: invoice.quote_id=${qid} but no pos_quotes row — skipping quote update.`);
    } else {
      const nextOrderId = quoteRow.order_id || oid || null;
      const nextStatus = linkedStatus ?? quoteRow.status;
      const sql = `UPDATE pos_quotes SET
        customer_id = ?, customer_name = ?, customer_email = ?, customer_phone = ?,
        status = ?, items = ?, subtotal = ?, tax_rate = ?, tax_amount = ?,
        discount_amount = ?, total = ?, notes = ?, order_id = ?, invoice_id = ?,
        updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`;
      const params = [
        custId,
        inv.customer_name ?? '',
        inv.customer_email ?? '',
        inv.customer_phone ?? '',
        nextStatus,
        itemsJson,
        Number(inv.subtotal) || 0,
        Number(inv.tax_rate) || 0,
        Number(inv.tax_amount) || 0,
        Number(inv.discount_amount) || 0,
        Number(inv.total) || 0,
        inv.notes ?? '',
        nextOrderId,
        inv.id,
        qid,
      ];
      console.log(
        dryRun ? '[dry-run] Would update pos_quotes' : 'Updating pos_quotes',
        qid,
        `status -> ${nextStatus} order_id -> ${nextOrderId ?? 'null'}`
      );
      if (!dryRun) await conn.query(sql, params);
    }
  }

  console.log(dryRun ? 'Dry run finished (no DB writes).' : 'Done.');
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  await conn.end();
}
