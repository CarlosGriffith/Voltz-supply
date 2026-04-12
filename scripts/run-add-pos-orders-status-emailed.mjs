/**
 * Widens pos_orders.status CHECK (scripts/add-pos-orders-status-emailed.sql).
 * Adds emailed + legacy workflow values so saves do not violate chk_pos_orders_status.
 *
 *   npm run db:add-pos-orders-status-emailed
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

const sqlPath = path.join(__dirname, 'add-pos-orders-status-emailed.sql');
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
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
});

console.log('Connected to', host, 'database', database);
try {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    await conn.query(stmt);
    console.log(`OK — statement ${i + 1}/${statements.length} applied.`);
  }
  console.log('Done — chk_pos_orders_status now allows emailed and legacy order statuses.');
} catch (e) {
  const msg = e?.message || String(e);
  if (/check constraint.*already exists/i.test(msg) || /Duplicate check/i.test(msg)) {
    console.log('OK — chk_pos_orders_status already matches (no change needed).');
  } else if (/check constraint.*doesn't exist|Unknown check constraint|check.*chk_pos_orders_status.*not exist/i.test(msg)) {
    console.error('DROP CHECK failed — constraint name may differ. Query:');
    console.error(
      "  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_orders' AND CONSTRAINT_TYPE = 'CHECK';"
    );
    console.error(msg);
    process.exitCode = 1;
  } else {
    console.error(msg);
    process.exitCode = 1;
  }
} finally {
  await conn.end();
}
