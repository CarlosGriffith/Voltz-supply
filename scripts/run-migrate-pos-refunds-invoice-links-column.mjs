/**
 * Runs scripts/migrate-pos-refunds-invoice-links-column.sql
 *
 *   npm run db:migrate:pos-refunds-invoice-links
 *
 * Uses .env AIVEN_MYSQL_* — same DB as npm run dev:api (local or Aiven).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';
import { splitSqlWithDelimiters } from './mysql-split-sql.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const host = process.env.AIVEN_MYSQL_HOST || 'localhost';
const port = Number(process.env.AIVEN_MYSQL_PORT || 3306);
const user = process.env.AIVEN_MYSQL_USER || 'root';
const password = process.env.AIVEN_MYSQL_PASSWORD || '';
const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';
const sqlPath = path.join(__dirname, 'migrate-pos-refunds-invoice-links-column.sql');

if (!password) {
  console.error('Set AIVEN_MYSQL_PASSWORD in .env and run again.');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error(
    'Aiven MySQL requires TLS. Place CA at scripts/aiven-ca.pem or set AIVEN_CA_PATH / AIVEN_MYSQL_SSL_CA.',
    'Expected file:',
    defaultCaPath
  );
  process.exit(1);
}

/** Drop leading full-line `--` comments so ALTER… is not mistaken for “comment-only” and skipped. */
function stripLeadingLineComments(text) {
  let s = text.trim();
  while (/^--[^\n]*/m.test(s)) {
    s = s.replace(/^--[^\n]*\n?/m, '').trim();
  }
  return s;
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = splitSqlWithDelimiters(sql)
  .map((s) => {
    const t = s.trim();
    if (t.endsWith('//')) return t.replace(/\/\/\s*$/, '').trim();
    return s.trim();
  })
  .map(stripLeadingLineComments)
  .filter((s) => s.length > 0);

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  ssl,
  charset: 'utf8mb4_unicode_ci',
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
  multipleStatements: false,
});

await conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');

console.log('Connected to', host, 'database', database);
let n = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    n += 1;
  } catch (e) {
    const msg = e?.message || String(e);
    if (/Duplicate column name/i.test(msg)) {
      console.warn('Column invoice_links already exists — skipping (idempotent).');
      await conn.end();
      process.exit(0);
    }
    console.error('Failed on statement', n + 1);
    console.error(stmt.slice(0, 200) + (stmt.length > 200 ? '...' : ''));
    console.error(msg);
    await conn.end();
    process.exit(1);
  }
}

await conn.end();
console.log('OK — pos_refunds.invoice_links migration executed', n, 'statement(s).');
