/**
 * Runs scripts/migrate-pos-receipt-invoice-links.sql (DELIMITER-aware).
 * Uses .env AIVEN_MYSQL_* — same DB as npm run dev:api (local or Aiven).
 *
 *   npm run db:migrate:pos-receipt-invoice-links
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';
import { splitSqlWithDelimiters } from './mysql-split-sql.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const host = process.env.AIVEN_MYSQL_HOST || 'mysql-voltz-elife365-voltz.j.aivencloud.com';
const port = Number(process.env.AIVEN_MYSQL_PORT || 28070);
const user = process.env.AIVEN_MYSQL_USER || 'avnadmin';
const password = process.env.AIVEN_MYSQL_PASSWORD || '';
const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';
const sqlPath = path.join(__dirname, 'migrate-pos-receipt-invoice-links.sql');

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

const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = splitSqlWithDelimiters(sql)
  .map((s) => {
    const t = s.trim();
    if (t.endsWith('//')) return t.replace(/\/\/\s*$/, '').trim();
    return s.trim();
  })
  .filter((s) => s.length > 0 && !/^--/.test(s));

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  ssl,
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
  multipleStatements: false,
});

console.log('Connected to', host, 'database', database);
let n = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    n += 1;
  } catch (e) {
    console.error('Failed on statement', n + 1);
    console.error(stmt.slice(0, 200) + (stmt.length > 200 ? '...' : ''));
    console.error(e.message);
    await conn.end();
    process.exit(1);
  }
}

await conn.end();
console.log('OK — pos_receipt_invoice_links migration executed', n, 'statements.');
