/**
 * One-time: widens pos_quotes / pos_orders CHECK for `refunded` and replaces sp_recalc_invoice
 * so receipt triggers do not overwrite Refunded invoices (see scripts/migrate-pos-quotes-orders-status-refunded.sql).
 *
 *   npm run db:migrate:pos-refunded-linked-status
 *
 * Env: AIVEN_MYSQL_* (same as other db scripts). Requires AIVEN_MYSQL_PASSWORD in .env.
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

const sqlPath = path.join(__dirname, 'migrate-pos-quotes-orders-status-refunded.sql');

if (!password) {
  console.error('Set AIVEN_MYSQL_PASSWORD in .env and run again.');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error('Aiven MySQL requires TLS. CA:', defaultCaPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = splitSqlWithDelimiters(sql)
  .map((s) => {
    const t = s.trim();
    if (t.endsWith('//')) return t.replace(/\/\/\s*$/, '').trim();
    return s.trim();
  })
  .map((s) =>
    s
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n')
      .trim()
  )
  .filter((s) => s.length > 0);

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  ssl,
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
});

console.log('Connected to', host, database);
console.log('Running', statements.length, 'statement(s) from migrate-pos-quotes-orders-status-refunded.sql');
let n = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    n += 1;
    console.log(`OK — ${n}/${statements.length}`);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('Failed on statement', n + 1);
    console.error(stmt.slice(0, 300) + (stmt.length > 300 ? '...' : ''));
    console.error(msg);
    await conn.end();
    process.exit(1);
  }
}
await conn.end();
console.log('Done — pos_quotes/pos_orders may use status refunded; sp_recalc_invoice skips Refunded rows.');
console.log('If you use `npm run db:refresh-pos-routines-collation`, run it now to align routine collations.');
