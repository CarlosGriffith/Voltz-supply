/**
 * Import data from a PostgreSQL pg_dump plain-SQL file (COPY ... FROM stdin) into Aiven MySQL.
 * Target must already be bootstrapped: npm run db:bootstrap:aiven && db:bootstrap:cms
 *
 * Usage:
 *   node scripts/import-pgdump-to-mysql.mjs "C:\path\to\database.sql"
 *   or set PGDUMP_FILE=C:\path\to\database.sql
 *
 * After import, migrate legacy image URLs to local files:
 *   npm run db:migrate:legacy-images
 *
 * Env: AIVEN_MYSQL_* from .env (dotenv loaded)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig } from '../server/mysql-ssl.mjs';

const MYSQL_TABLE_ORDER = [
  'cms_config',
  'cms_categories',
  'cms_custom_products',
  'cms_product_overrides',
  'pos_doc_counters',
  'pos_customers',
  'pos_quote_requests',
  'pos_quotes',
  'pos_orders',
  'pos_invoices',
  'pos_receipts',
  'pos_refunds',
  'pos_sent_emails',
  'pos_smtp_settings',
];

function createMysqlPool() {
  const password = process.env.AIVEN_MYSQL_PASSWORD || '';
  if (!password) {
    console.error('Set AIVEN_MYSQL_PASSWORD in .env');
    process.exit(1);
  }
  return mysql.createPool({
    host: process.env.AIVEN_MYSQL_HOST || 'localhost',
    port: Number(process.env.AIVEN_MYSQL_PORT || 3306),
    user: process.env.AIVEN_MYSQL_USER || 'root',
    password,
    database: process.env.AIVEN_MYSQL_DATABASE || 'defaultdb',
    ssl: getMysqlSslConfig(),
    connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
    dateStrings: true,
    charset: 'utf8mb4',
    connectionLimit: 2,
  });
}

/** Parse pg_dump COPY sections: "schema".table_name */
function parseAllCopyBlocks(sql) {
  const lines = sql.split(/\r?\n/);
  /** @type {Record<string, { cols: string[], rows: string[][] }>} */
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^COPY\s+"[^"]+"\.(\w+)\s+\(([^)]+)\)\s+FROM stdin;/);
    if (!m) continue;
    const table = m[1];
    const cols = m[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const rows = [];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (line === '\\.' ) break;
      if (line === '' || /^\s*$/.test(line)) {
        i++;
        continue;
      }
      const cells = parseCopyTsvLine(line, cols.length);
      rows.push(cells);
      i++;
    }
    if (!out[table]) out[table] = { cols, rows: [] };
    out[table].rows.push(...rows);
  }
  return out;
}

/** Split TSV respecting pg text escapes; falls back if column count mismatches */
function parseCopyTsvLine(line, expectedCols) {
  const parts = line.split('\t');
  if (parts.length === expectedCols) return parts.map(parseCopyCell);
  if (parts.length > expectedCols) {
    const merged = [...parts.slice(0, expectedCols - 1), parts.slice(expectedCols - 1).join('\t')];
    return merged.map(parseCopyCell);
  }
  while (parts.length < expectedCols) parts.push('\\N');
  return parts.map(parseCopyCell);
}

function parseCopyCell(s) {
  if (s === '\\N' || s === undefined) return null;
  return s.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
}

function tsToMysql(ts) {
  if (ts == null) return null;
  const s = String(ts);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?/);
  if (m) {
    const ms = m[3] ? m[3].slice(0, 4).padEnd(4, '0') : '.000';
    return `${m[1]} ${m[2]}${ms}`;
  }
  return s.replace('T', ' ').replace(/\+00(:00)?$/, '').slice(0, 23);
}

function boolToMysql(v) {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === 't' || s === 'true' || s === '1') return 1;
  if (s === 'f' || s === 'false' || s === '0') return 0;
  return v ? 1 : 0;
}

/** Fix broken quote_number / document_number from JSON blob */
function stripQuoteNumberGarbage(s) {
  if (s == null || s === '') return '';
  const str = String(s);
  if (!str.includes('generate_quote_number') && !str.startsWith('{')) return str;
  const m = str.match(/Q-\d+/);
  return m ? m[0] : str.replace(/^\{.*$/, '').trim() || 'Q-IMPORT';
}

function mapQuoteStatus(s) {
  if (!s) return 'reviewed';
  const x = String(s).toLowerCase();
  const allowed = new Set([
    'reviewed',
    'order_generated',
    'invoice_generated_unpaid',
    'invoice_generated_partially_paid',
    'invoice_generated_paid',
    'processed',
  ]);
  if (allowed.has(x)) return x;
  if (x === 'draft' || x === 'sent' || x === 'accepted' || x === 'rejected' || x === 'expired' || x === 'converted')
    return 'reviewed';
  return 'reviewed';
}

function jsonItemsCell(v) {
  if (v == null) return '[]';
  if (typeof v === 'string' && v.trim().startsWith('[')) return v;
  return JSON.stringify([]);
}

async function getMysqlColumns(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
    [db, table]
  );
  return rows.map((r) => r.c);
}

function placeholdersRow(n) {
  return '(' + Array(n).fill('?').join(',') + ')';
}

function rowToMap(cols, vals) {
  const m = {};
  cols.forEach((c, i) => {
    m[c] = vals[i];
  });
  return m;
}

function transformRow(table, pgCols, vals, mysqlCols) {
  const r = rowToMap(pgCols, vals);
  /** @type {Record<string, unknown>} */
  const o = {};

  for (const c of mysqlCols) {
    switch (table) {
      case 'cms_config':
        if (c === 'key') o[c] = r.key;
        else if (c === 'value') {
          const v = r.value;
          o[c] = typeof v === 'object' && v != null ? JSON.stringify(v) : v ?? null;
        } else if (c === 'updated_at') o[c] = tsToMysql(r.updated_at);
        break;
      case 'cms_categories':
        if (c === 'visible' || c === 'is_custom') o[c] = boolToMysql(r[c]);
        else if (c === 'updated_at') o[c] = tsToMysql(r.updated_at) || new Date().toISOString().slice(0, 23);
        else if (c === 'created_at')
          o[c] = tsToMysql(r.created_at) || tsToMysql(r.updated_at) || new Date().toISOString().slice(0, 23);
        else o[c] = r[c] ?? (c === 'product_count' ? 0 : c === 'description' ? '' : null);
        break;
      case 'cms_custom_products':
        if (['in_stock', 'is_featured', 'show_on_website'].includes(c)) o[c] = boolToMysql(r[c]);
        else if (['created_at', 'updated_at'].includes(c)) o[c] = tsToMysql(r[c]);
        else if (['specs', 'features', 'documents', 'additional_images'].includes(c)) {
          const v = r[c];
          if (v == null) o[c] = c === 'specs' ? '{}' : c === 'features' || c === 'documents' ? '[]' : '[]';
          else o[c] = typeof v === 'string' ? v : JSON.stringify(v);
        } else o[c] = r[c] ?? '';
        break;
      case 'cms_product_overrides':
        if (['in_stock', 'is_featured'].includes(c)) {
          const v = r[c];
          o[c] = v == null ? null : boolToMysql(v);
        } else if (c === 'updated_at') o[c] = tsToMysql(r.updated_at);
        else o[c] = r[c] ?? null;
        break;
      case 'pos_doc_counters':
        o[c] = r[c];
        break;
      case 'pos_customers':
        if (c === 'account_balance') o[c] = 0;
        else if (['created_at', 'updated_at'].includes(c)) o[c] = tsToMysql(r[c]);
        else o[c] = r[c] ?? '';
        break;
      case 'pos_quote_requests':
        if (['created_at', 'updated_at', 'email_sent_at'].includes(c)) o[c] = tsToMysql(r[c]);
        else o[c] = r[c] ?? '';
        break;
      case 'pos_quotes': {
        if (c === 'quote_number') o[c] = stripQuoteNumberGarbage(r.quote_number);
        else if (c === 'status') o[c] = mapQuoteStatus(r.status);
        else if (c === 'items') o[c] = jsonItemsCell(r.items);
        else if (['created_at', 'updated_at', 'valid_until'].includes(c)) o[c] = tsToMysql(r[c]);
        else if (c === 'order_id' || c === 'invoice_id') o[c] = r[c] || null;
        else o[c] = r[c] ?? '';
        break;
      }
      case 'pos_orders':
        if (c === 'items') o[c] = jsonItemsCell(r.items);
        else if (['created_at', 'updated_at'].includes(c)) o[c] = tsToMysql(r[c]);
        else o[c] = r[c] ?? '';
        break;
      case 'pos_invoices':
        if (c === 'items') o[c] = jsonItemsCell(r.items);
        else if (['created_at', 'updated_at', 'paid_at', 'delivered_at'].includes(c)) o[c] = tsToMysql(r[c]);
        else o[c] = r[c] ?? '';
        break;
      case 'pos_receipts': {
        if (c === 'items') o[c] = jsonItemsCell(r.items);
        else if (c === 'status') o[c] = r.status || 'approved';
        else if (c === 'payment_type') o[c] = r.payment_type || 'full';
        else if (c === 'created_at') o[c] = tsToMysql(r.created_at);
        else o[c] = r[c] ?? '';
        break;
      }
      case 'pos_refunds':
        if (c === 'items') o[c] = jsonItemsCell(r.items);
        else if (['created_at', 'updated_at'].includes(c)) o[c] = tsToMysql(r[c]);
        else o[c] = r[c] ?? '';
        break;
      case 'pos_sent_emails':
        if (c === 'document_number') o[c] = stripQuoteNumberGarbage(r.document_number);
        else if (c === 'sent_at') o[c] = tsToMysql(r.sent_at);
        else o[c] = r[c] ?? '';
        break;
      case 'pos_smtp_settings':
        if (c === 'use_tls') o[c] = boolToMysql(r.use_tls);
        else if (c === 'updated_at') o[c] = tsToMysql(r.updated_at);
        else if (c === 'port') o[c] = Number(r.port) || 587;
        else o[c] = r[c] ?? '';
        break;
      default:
        o[c] = r[c];
    }
  }
  return mysqlCols.map((c) => o[c]);
}

const dumpPath = process.argv[2] || process.env.PGDUMP_FILE;
if (!dumpPath || !fs.existsSync(dumpPath)) {
  console.error('Usage: node scripts/import-pgdump-to-mysql.mjs <path-to-database.sql>');
  process.exit(1);
}

console.log('Reading', dumpPath);
const sql = fs.readFileSync(dumpPath, 'utf8');
const blocks = parseAllCopyBlocks(sql);

const pgToMysqlTable = {
  cms_categories: 'cms_categories',
  cms_config: 'cms_config',
  cms_custom_products: 'cms_custom_products',
  cms_product_overrides: 'cms_product_overrides',
  pos_customers: 'pos_customers',
  pos_quote_requests: 'pos_quote_requests',
  pos_quotes: 'pos_quotes',
  pos_orders: 'pos_orders',
  pos_invoices: 'pos_invoices',
  pos_receipts: 'pos_receipts',
  pos_refunds: 'pos_refunds',
  pos_sent_emails: 'pos_sent_emails',
  pos_smtp_settings: 'pos_smtp_settings',
};

/** Delete order (FK children first) */
const DELETE_ORDER = [
  'cms_product_overrides',
  'cms_custom_products',
  'cms_categories',
  'cms_config',
  'pos_refunds',
  'pos_receipts',
  'pos_sent_emails',
  'pos_invoices',
  'pos_orders',
  'pos_quotes',
  'pos_quote_requests',
  'pos_customers',
  'pos_smtp_settings',
  'pos_doc_counters',
];

const pool = createMysqlPool();
const db = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';

try {
  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of DELETE_ORDER) {
    try {
      await pool.query(`DELETE FROM \`${t}\``);
    } catch (e) {
      if (!e.message.includes("doesn't exist")) console.warn('DELETE', t, e.message);
    }
  }

  await pool.query(`
    INSERT INTO pos_doc_counters (doc_type, seq_value) VALUES
    ('quote', 1000000), ('order', 1000000), ('invoice', 1000000), ('receipt', 1000000), ('refund', 1000000)
  `);

  for (const [pgTable, mysqlTable] of Object.entries(pgToMysqlTable)) {
    const block = blocks[pgTable];
    if (!block || block.rows.length === 0) {
      console.log(`${mysqlTable}: 0 rows (skip or empty)`);
      continue;
    }
    const mysqlCols = await getMysqlColumns(pool, db, mysqlTable);
    if (mysqlCols.length === 0) {
      console.warn(`MySQL table ${mysqlTable} missing — run bootstrap`);
      continue;
    }
    const BATCH = 50;
    let done = 0;
    for (let i = 0; i < block.rows.length; i += BATCH) {
      const chunk = block.rows.slice(i, i + BATCH);
      const valueRows = chunk.map(() => placeholdersRow(mysqlCols.length)).join(',');
      const flat = chunk.flatMap((vals) => transformRow(mysqlTable, block.cols, vals, mysqlCols));
      const colList = mysqlCols.map((c) => `\`${c}\``).join(',');
      await pool.query(`INSERT INTO \`${mysqlTable}\` (${colList}) VALUES ${valueRows}`, flat);
      done += chunk.length;
    }
    console.log(`${mysqlTable}: inserted ${done} rows`);
  }

  await pool.query(`UPDATE cms_categories c SET product_count = (
    SELECT COUNT(*) FROM cms_custom_products p WHERE p.category_slug = c.slug
  )`);

  await pool.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('Done. Re-seed pos_doc_counters from bootstrap if you rely on sequential QT-/INV- numbers for brand-new docs.');
} finally {
  await pool.end();
}
