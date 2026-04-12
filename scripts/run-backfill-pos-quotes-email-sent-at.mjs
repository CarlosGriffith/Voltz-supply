/**
 * Backfill pos_quotes.email_sent_at from pos_sent_emails (latest sent quote email per document).
 *
 *   npm run db:backfill-quote-email-sent-at
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

const sqlPath = path.join(__dirname, 'backfill-pos-quotes-email-sent-at.sql');
let stmt = fs.readFileSync(sqlPath, 'utf8');
stmt = stmt
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
  const [result] = await conn.query(stmt);
  const info = result && typeof result === 'object' && 'affectedRows' in result ? result.affectedRows : result;
  console.log('OK — backfill complete.', typeof info === 'number' ? `Rows matched/updated: ${info}` : '');
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  await conn.end();
}
