/**
 * Run a read-only SQL query against Aiven MySQL from .env.
 * Usage: npm run db:sql -- "SELECT * FROM your_table LIMIT 5"
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const sql = process.argv.slice(2).join(' ').trim();
if (!sql) {
  console.error('Usage: npm run db:sql -- "SELECT * FROM your_table LIMIT 5"');
  process.exit(1);
}

const upper = sql.replace(/^\s*\(/, '').trim().slice(0, 24).toUpperCase();
if (!/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/.test(upper)) {
  console.error('Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH).');
  process.exit(1);
}

const host = process.env.AIVEN_MYSQL_HOST || 'localhost';
const port = Number(process.env.AIVEN_MYSQL_PORT || 3306);
const user = process.env.AIVEN_MYSQL_USER || 'root';
const password = process.env.AIVEN_MYSQL_PASSWORD || '';
const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';

if (!password) {
  console.error('Set AIVEN_MYSQL_PASSWORD in .env');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error('Aiven MySQL requires TLS. CA:', defaultCaPath);
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
  const [rows] = await conn.query(sql);
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error(e.code || e.message);
  process.exit(1);
} finally {
  await conn.end();
}
