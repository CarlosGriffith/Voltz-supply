/**
 * Read-only: verify .env can reach MySQL. npm run db:ping-mysql
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
  console.error('Set AIVEN_MYSQL_PASSWORD in .env');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error('Aiven MySQL requires TLS. CA:', defaultCaPath);
  process.exit(1);
}

try {
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl,
    connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
  });
  const [[row]] = await conn.query('SELECT 1 AS ok, DATABASE() AS db, @@hostname AS server_host');
  await conn.end();
  console.log('Connected successfully.');
  console.log('  Host (client target):', host, 'port', port);
  console.log('  Database:', row.db);
  console.log('  Check:', row);
} catch (e) {
  console.error('Connection failed:', e.code || e.message);
  if (e.code === 'ENOTFOUND') {
    console.error('  Hint: DNS could not resolve the hostname — check AIVEN_MYSQL_HOST and your network/VPN.');
  }
  if (e.code === 'ECONNREFUSED') {
    console.error('  Hint: Nothing listening on that host:port — check port and firewall.');
  }
  process.exit(1);
}
