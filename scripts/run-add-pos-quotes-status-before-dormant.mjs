/**
 * Adds pos_quotes.status_before_dormant (scripts/add-pos-quotes-status-before-dormant.sql).
 *
 *   npm run db:add-pos-quotes-status-before-dormant
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const host = process.env.AIVEN_MYSQL_HOST || 'mysql-voltz-elife365-voltz.j.aivencloud.com';
const port = Number(process.env.AIVEN_MYSQL_PORT || 28070);
const user = process.env.AIVEN_MYSQL_USER || 'avnadmin';
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

console.log('Connected to', host, database);
try {
  await conn.query(
    'ALTER TABLE pos_quotes ADD COLUMN `status_before_dormant` VARCHAR(64) NULL AFTER `status`'
  );
  console.log('OK — pos_quotes.status_before_dormant added.');
} catch (e) {
  const msg = e?.message || String(e);
  if (/Duplicate column name/i.test(msg)) {
    console.log('OK — pos_quotes.status_before_dormant already exists.');
  } else {
    console.error(msg);
    process.exitCode = 1;
  }
} finally {
  await conn.end();
}
