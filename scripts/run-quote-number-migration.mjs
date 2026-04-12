/**
 * Adds pos_quote_requests.quote_number if missing (scripts/add-pos-quote-requests-quote-number.sql).
 * Uses .env AIVEN_MYSQL_* like db:bootstrap:aiven.
 *
 *   npm run db:add-quote-number-column
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

const sqlPath = path.join(__dirname, 'add-pos-quote-requests-quote-number.sql');
const raw = fs.readFileSync(sqlPath, 'utf8');
const stmt = raw
  .split(/\r?\n/)
  .filter((line) => !/^\s*--/.test(line))
  .join('\n')
  .trim();

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
  console.log('OK — quote_number column added.');
} catch (e) {
  const msg = e?.message || String(e);
  if (/Duplicate column name/i.test(msg)) {
    console.log('OK — quote_number already exists (no change).');
  } else {
    console.error(msg);
    process.exitCode = 1;
  }
} finally {
  await conn.end();
}
