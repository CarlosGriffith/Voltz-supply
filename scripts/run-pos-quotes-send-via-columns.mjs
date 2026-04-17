/**
 * Adds pos_quotes.send_via_email and pos_quotes.send_via_whatsapp if missing
 * (scripts/mysql-pos-quote-send-prefs-and-company.sql).
 * Required for saving/sending quotes from POS (server POST /api/pos/quotes).
 *
 *   npm run db:add-pos-quotes-send-via-columns
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

/** No AFTER clause — works even if email_sent_at column order differs on old DBs. */
const STEPS = [
  {
    label: 'send_via_email',
    sql: 'ALTER TABLE pos_quotes ADD COLUMN `send_via_email` TINYINT(1) NOT NULL DEFAULT 1',
  },
  {
    label: 'send_via_whatsapp',
    sql: 'ALTER TABLE pos_quotes ADD COLUMN `send_via_whatsapp` TINYINT(1) NOT NULL DEFAULT 0',
  },
];

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  ssl,
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
});

console.log('Connected to', host, 'database', database);
try {
  for (const { label, sql } of STEPS) {
    try {
      await conn.query(sql);
      console.log('OK — added', label);
    } catch (e) {
      const msg = e?.message || String(e);
      if (/Duplicate column name/i.test(msg)) {
        console.log('OK —', label, 'already exists (skipped).');
      } else {
        throw e;
      }
    }
  }
  console.log('Done.');
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  await conn.end();
}
