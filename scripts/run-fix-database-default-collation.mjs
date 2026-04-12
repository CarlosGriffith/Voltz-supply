/**
 * Sets default charset/collation for the current database so new objects and literals align with POS tables.
 *
 *   npm run db:fix-database-collation
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

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

const id = mysql.escapeId(database);
await conn.query(
  `ALTER DATABASE ${id} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
);
console.log('OK: ALTER DATABASE', database, '→ utf8mb4 / utf8mb4_unicode_ci');
await conn.end();
console.log('Done.');
