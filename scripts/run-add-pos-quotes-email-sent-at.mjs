/**
 * Adds pos_quotes.email_sent_at if missing (scripts/add-pos-quotes-email-sent-at.sql).
 *
 *   npm run db:add-quote-email-sent-at
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const sqlPath = path.join(__dirname, 'add-pos-quotes-email-sent-at.sql');
const raw = fs.readFileSync(sqlPath, 'utf8');
const stmt = raw
  .split(/\r?\n/)
  .filter((line) => !/^\s*--/.test(line) && line.trim() !== '')
  .join('\n')
  .trim();

// Only run the ALTER (file may contain commented-only lines stripped to empty blocks)
if (!/ALTER\s+TABLE/i.test(stmt)) {
  console.error('No ALTER TABLE statement found after stripping comments.');
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

console.log('Connected to', host, 'database', database);
try {
  await conn.query(stmt);
  console.log('OK — pos_quotes.email_sent_at added.');
} catch (e) {
  const msg = e?.message || String(e);
  if (/Duplicate column name/i.test(msg)) {
    console.log('OK — email_sent_at on pos_quotes already exists (no change).');
  } else {
    console.error(msg);
    process.exitCode = 1;
  }
} finally {
  await conn.end();
}
