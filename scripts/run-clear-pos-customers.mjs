/**
 * Clears all POS customer records (pos_customers).
 * Optionally nulls pos_quote_requests.customer_id when that column exists (no FK in older schemas).
 *
 *   npm run db:clear-pos-customers
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

console.log('Connected to', host, 'database', database);

try {
  const [ur] = await conn.query(
    'UPDATE pos_quote_requests SET customer_id = NULL WHERE customer_id IS NOT NULL'
  );
  const n = ur?.affectedRows;
  if (typeof n === 'number') {
    console.log('OK: pos_quote_requests customer_id cleared →', n, 'row(s)');
  }
} catch (e) {
  if (
    e.code === 'ER_BAD_FIELD_ERROR' ||
    e.errno === 1054 ||
    String(e.message || '').includes('Unknown column')
  ) {
    console.log('Note: pos_quote_requests.customer_id not present — skipped unlink.');
  } else {
    throw e;
  }
}

const sqlPath = path.join(__dirname, 'clear-pos-customers.sql');
const raw = fs.readFileSync(sqlPath, 'utf8');
const stmts = raw
  .split(/\r?\n/)
  .filter((line) => !/^\s*--/.test(line))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of stmts) {
  const [res] = await conn.query(stmt);
  const n = res?.affectedRows;
  const label = stmt.length > 72 ? `${stmt.slice(0, 72)}…` : stmt;
  if (typeof n === 'number') console.log('OK:', label, '→', n, 'rows affected');
  else console.log('OK:', label);
}

await conn.end();
console.log('Done — pos_customers cleared (all customer registry rows removed).');
