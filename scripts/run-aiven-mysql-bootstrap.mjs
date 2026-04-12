/**
 * Runs scripts/mysql-aiven-bootstrap.sql against Aiven MySQL (handles DELIMITER //).
 *
 * Usage (PowerShell):
 *   $env:AIVEN_MYSQL_PASSWORD = "your-password"
 *   node scripts/run-aiven-mysql-bootstrap.mjs
 *
 * Optional env:
 *   AIVEN_MYSQL_HOST (default: mysql-voltz-elife365-voltz.j.aivencloud.com)
 *   AIVEN_MYSQL_PORT (default: 28070)
 *   AIVEN_MYSQL_USER (default: avnadmin)
 *   AIVEN_MYSQL_DATABASE (default: defaultdb)
 *   AIVEN_CA_PATH (default: scripts/aiven-ca.pem next to this file)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function splitSqlWithDelimiters(content) {
  const lines = content.split(/\r?\n/);
  let delim = ';';
  const stmts = [];
  let chunk = [];

  const flushChunk = () => {
    const text = chunk.join('\n').trim();
    if (text.length > 0) stmts.push(text);
    chunk = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase().startsWith('DELIMITER ')) {
      flushChunk();
      delim = trimmed.slice(10).trim();
      continue;
    }

    chunk.push(line);

    if (delim === ';') {
      if (trimmed.endsWith(';')) flushChunk();
    } else {
      if (trimmed.endsWith(delim)) flushChunk();
    }
  }
  flushChunk();
  return stmts;
}

const host = process.env.AIVEN_MYSQL_HOST || 'mysql-voltz-elife365-voltz.j.aivencloud.com';
const port = Number(process.env.AIVEN_MYSQL_PORT || 28070);
const user = process.env.AIVEN_MYSQL_USER || 'avnadmin';
const password = process.env.AIVEN_MYSQL_PASSWORD || '';
const database = process.env.AIVEN_MYSQL_DATABASE || 'defaultdb';
const sqlPath = path.join(__dirname, 'mysql-aiven-bootstrap.sql');

if (!password) {
  console.error('Set AIVEN_MYSQL_PASSWORD in the environment and run again.');
  process.exit(1);
}

const ssl = getMysqlSslConfig();
if (!ssl && String(host).includes('aivencloud.com')) {
  console.error(
    'Aiven MySQL requires TLS. Place CA at scripts/aiven-ca.pem or set AIVEN_CA_PATH / AIVEN_MYSQL_SSL_CA.',
    'Expected file:', defaultCaPath
  );
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = splitSqlWithDelimiters(sql)
  .map((s) => {
    const t = s.trim();
    if (t.endsWith('//')) return t.replace(/\/\/\s*$/, '').trim();
    return s.trim();
  })
  .filter((s) => s.length > 0 && !/^--/.test(s));

const conn = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
  ssl,
  connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
  multipleStatements: false,
});

console.log('Connected to', host, 'database', database);
let n = 0;
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    n += 1;
  } catch (e) {
    console.error('Failed on statement', n + 1);
    console.error(stmt.slice(0, 200) + (stmt.length > 200 ? '...' : ''));
    console.error(e.message);
    await conn.end();
    process.exit(1);
  }
}

await conn.end();
console.log('OK — executed', n, 'statements.');
