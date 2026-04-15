/**
 * Adds `printed` to pos_orders.status CHECK (scripts/migrate-pos-orders-status-printed.sql).
 *
 *   npm run db:migrate:pos-orders-status-printed
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

const sqlPath = path.join(__dirname, 'migrate-pos-orders-status-printed.sql');

if (!password) {
  console.error('Set AIVEN_MYSQL_PASSWORD in .env and run again.');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error('Aiven MySQL requires TLS. CA:', defaultCaPath);
  process.exit(1);
}

const raw = fs.readFileSync(sqlPath, 'utf8');
const statements = raw
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

console.log('Connected to', host, database);
for (let i = 0; i < statements.length; i++) {
  await conn.query(statements[i]);
  console.log(`OK — statement ${i + 1}/${statements.length}`);
}
await conn.end();
console.log('Done — pos_orders.status allows printed.');
