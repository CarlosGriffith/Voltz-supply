/**
 * Replaces sp_recalc_customer_ledger so Balance Due ignores invoices with refund activity.
 *
 *   npm run db:migrate:sp-recalc-customer-ledger-exclude-refunds
 *
 * Env: AIVEN_MYSQL_* (see other scripts/run-*.mjs). Requires AIVEN_MYSQL_PASSWORD in .env.
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
const sqlPath = path.join(__dirname, 'migrate-sp-recalc-customer-ledger-exclude-refund-invoices.sql');

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
let stmtCount = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    stmtCount += 1;
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('Failed on statement', stmtCount + 1);
    console.error(stmt.slice(0, 240) + (stmt.length > 240 ? '...' : ''));
    console.error(msg);
    await conn.end();
    process.exit(1);
  }
}
console.log('Applied sp_recalc_customer_ledger migration.', stmtCount, 'statement(s).');

const [custRows] = await conn.query(
  'SELECT DISTINCT customer_id AS id FROM pos_invoices WHERE customer_id IS NOT NULL AND TRIM(customer_id) <> \'\''
);
let n = 0;
for (const row of custRows || []) {
  const id = row?.id;
  if (!id) continue;
  await conn.query('CALL sp_recalc_customer_ledger(?)', [id]);
  n += 1;
}
console.log(`Recalculated Balance Due for ${n} customer(s) with invoices.`);

await conn.end();
