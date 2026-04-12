/**
 * Clears all rows in pos_orders and nulls pos_quotes.order_id.
 *
 *   npm run db:clear-orders
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
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

const sqlPath = path.join(__dirname, 'clear-pos-orders.sql');
const raw = fs.readFileSync(sqlPath, 'utf8');
const stmts = raw
  .split(/\r?\n/)
  .filter((line) => !/^\s*--/.test(line))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

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
for (const stmt of stmts) {
  const [res] = await conn.query(stmt);
  const n = res?.affectedRows;
  const label = stmt.length > 72 ? `${stmt.slice(0, 72)}…` : stmt;
  if (typeof n === 'number') console.log('OK:', label, '→', n, 'rows affected');
  else console.log('OK:', label);
}
await conn.end();
console.log('Done — pos_orders cleared, pos_quotes.order_id cleared where set.');
