/**
 * Adds `dormant` to pos_quotes.status (scripts/add-pos-quotes-status-dormant.sql).
 *
 *   npm run db:add-pos-quotes-status-dormant
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
    'ALTER TABLE pos_quotes DROP CHECK chk_pos_quotes_status'
  );
  await conn.query(`ALTER TABLE pos_quotes
    ADD CONSTRAINT chk_pos_quotes_status CHECK (\`status\` IN (
      'reviewed',
      'printed',
      'emailed',
      'dormant',
      'order_generated',
      'invoice_generated_unpaid',
      'invoice_generated_partially_paid',
      'invoice_generated_paid',
      'processed'
    ))`);
  console.log('OK — pos_quotes.status now allows dormant.');
} catch (e) {
  console.error(e?.message || String(e));
  process.exitCode = 1;
} finally {
  await conn.end();
}
