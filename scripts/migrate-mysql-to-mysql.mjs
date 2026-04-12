/**
 * Copy Voltz POS + CMS tables from a source MySQL into the target (e.g. new Aiven) database.
 * Schemas should match scripts/mysql-aiven-bootstrap.sql + mysql-cms-bootstrap.sql.
 *
 * Prerequisites: target DB already bootstrapped (npm run db:bootstrap:aiven && db:bootstrap:cms).
 *
 * PowerShell example (local source → Aiven target from .env):
 *   $env:SOURCE_MYSQL_HOST = "127.0.0.1"
 *   $env:SOURCE_MYSQL_PORT = "3306"
 *   $env:SOURCE_MYSQL_USER = "root"
 *   $env:SOURCE_MYSQL_PASSWORD = "..."
 *   $env:SOURCE_MYSQL_DATABASE = "voltz_old"
 *   $env:SOURCE_MYSQL_SSL_NO = "1"
 *   node scripts/migrate-mysql-to-mysql.mjs
 *
 * Another Aiven as source: set SOURCE_MYSQL_* and omit SOURCE_MYSQL_SSL_NO (uses scripts/aiven-ca.pem).
 *
 * Env:
 *   MIGRATE_DRY_RUN=1     — only print row counts, no writes
 *   MIGRATE_MERGE=1       — insert without truncating target (duplicate keys skipped per table)
 *   SOURCE_MYSQL_SSL_NO=1 — disable SSL for source (typical local MySQL)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig, defaultCaPath } from '../server/mysql-ssl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** FK-safe copy order (parents before children) */
const TABLES_IN_ORDER = [
  'pos_doc_counters',
  'pos_customers',
  'pos_quote_requests',
  'pos_quotes',
  'pos_orders',
  'pos_invoices',
  'pos_receipts',
  'pos_refunds',
  'pos_sent_emails',
  'pos_smtp_settings',
  'cms_config',
  'cms_categories',
  'cms_custom_products',
  'cms_product_overrides',
];

function sourceSslOptions() {
  if (process.env.SOURCE_MYSQL_SSL_NO === '1' || process.env.SOURCE_MYSQL_SSL_NO === 'true') {
    return undefined;
  }
  const host = process.env.SOURCE_MYSQL_HOST || '';
  if (host.includes('aivencloud.com')) {
    const caPath = process.env.SOURCE_MYSQL_SSL_CA || defaultCaPath;
    if (!fs.existsSync(caPath)) {
      console.error('Source is Aiven; need CA PEM at', caPath, 'or set SOURCE_MYSQL_SSL_CA');
      process.exit(1);
    }
    return { ca: fs.readFileSync(caPath), rejectUnauthorized: true };
  }
  return undefined;
}

function createSourceConfig() {
  const host = process.env.SOURCE_MYSQL_HOST;
  const password = process.env.SOURCE_MYSQL_PASSWORD;
  const database = process.env.SOURCE_MYSQL_DATABASE;
  if (!host || !password || !database) {
    console.error(
      'Set SOURCE_MYSQL_HOST, SOURCE_MYSQL_PASSWORD, SOURCE_MYSQL_DATABASE.\n' +
        'Optional: SOURCE_MYSQL_PORT (default 3306), SOURCE_MYSQL_USER (default root), SOURCE_MYSQL_SSL_NO=1 for local.'
    );
    process.exit(1);
  }
  return {
    host,
    port: Number(process.env.SOURCE_MYSQL_PORT || 3306),
    user: process.env.SOURCE_MYSQL_USER || 'root',
    password,
    database,
    ssl: sourceSslOptions(),
    connectTimeout: Number(process.env.SOURCE_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
    dateStrings: true,
    charset: 'utf8mb4',
  };
}

function createTargetConfig() {
  const password = process.env.AIVEN_MYSQL_PASSWORD || process.env.TARGET_MYSQL_PASSWORD || '';
  if (!password) {
    console.error('Set AIVEN_MYSQL_PASSWORD (or TARGET_MYSQL_PASSWORD) for the target database.');
    process.exit(1);
  }
  return {
    host: process.env.AIVEN_MYSQL_HOST || process.env.TARGET_MYSQL_HOST || 'localhost',
    port: Number(process.env.AIVEN_MYSQL_PORT || process.env.TARGET_MYSQL_PORT || 3306),
    user: process.env.AIVEN_MYSQL_USER || process.env.TARGET_MYSQL_USER || 'root',
    password,
    database: process.env.AIVEN_MYSQL_DATABASE || process.env.TARGET_MYSQL_DATABASE || 'defaultdb',
    ssl: getMysqlSslConfig(),
    connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
    dateStrings: true,
    charset: 'utf8mb4',
  };
}

async function tableExists(conn, schema, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [schema, name]
  );
  return rows.length > 0;
}

async function getColumns(conn, schema, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [schema, table]
  );
  return rows.map((r) => r.c);
}

function placeholdersRow(n) {
  return '(' + Array(n).fill('?').join(',') + ')';
}

async function copyTable(sourceConn, targetConn, sourceDb, targetDb, table, { dryRun, merge }) {
  if (!(await tableExists(sourceConn, sourceDb, table))) {
    console.log(`  skip ${table} (missing on source)`);
    return { copied: 0, skipped: true };
  }
  if (!(await tableExists(targetConn, targetDb, table))) {
    console.log(`  skip ${table} (missing on target — run bootstrap)`);
    return { copied: 0, skipped: true };
  }

  const cols = await getColumns(sourceConn, sourceDb, table);
  if (cols.length === 0) {
    console.log(`  skip ${table} (no columns)`);
    return { copied: 0, skipped: true };
  }

  const [countRows] = await sourceConn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  const n = Number(countRows[0]?.n || 0);
  if (dryRun) {
    console.log(`  [dry-run] ${table}: ${n} rows`);
    return { copied: 0, dry: true };
  }

  const colList = cols.map((c) => `\`${c}\``).join(',');
  const [rows] = await sourceConn.query(`SELECT ${colList} FROM \`${table}\``);

  const BATCH = 150;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const valueRows = chunk.map(() => placeholdersRow(cols.length)).join(',');
    const flat = chunk.flatMap((r) => cols.map((c) => r[c]));
    const sql = merge
      ? `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES ${valueRows}`
      : `INSERT INTO \`${table}\` (${colList}) VALUES ${valueRows}`;
    await targetConn.query(sql, flat);
    inserted += chunk.length;
  }

  console.log(`  ${table}: ${inserted} rows`);
  return { copied: inserted, skipped: false };
}

const dryRun = process.env.MIGRATE_DRY_RUN === '1' || process.env.MIGRATE_DRY_RUN === 'true';
const merge = process.env.MIGRATE_MERGE === '1' || process.env.MIGRATE_MERGE === 'true';

const sourceCfg = createSourceConfig();
const targetCfg = createTargetConfig();

console.log('Source:', sourceCfg.host, '/', sourceCfg.database, dryRun ? '(dry run)' : '');
console.log('Target:', targetCfg.host, '/', targetCfg.database, merge ? '(merge / INSERT IGNORE)' : '(replace)');

const sourceConn = await mysql.createConnection(sourceCfg);
const targetConn = await mysql.createConnection(targetCfg);

try {
  if (!dryRun && !merge) {
    await targetConn.query('SET FOREIGN_KEY_CHECKS=0');
    const reverse = [...TABLES_IN_ORDER].reverse();
    for (const t of reverse) {
      if (await tableExists(targetConn, targetCfg.database, t)) {
        await targetConn.query(`DELETE FROM \`${t}\``);
      }
    }
    await targetConn.query('SET FOREIGN_KEY_CHECKS=1');
  }

  if (!dryRun) {
    await targetConn.query('SET FOREIGN_KEY_CHECKS=0');
  }

  for (const t of TABLES_IN_ORDER) {
    await copyTable(sourceConn, targetConn, sourceCfg.database, targetCfg.database, t, {
      dryRun,
      merge,
    });
  }

  if (!dryRun) {
    await targetConn.query('SET FOREIGN_KEY_CHECKS=1');
  }

  console.log(dryRun ? 'Dry run done.' : 'Migration done.');
} finally {
  await sourceConn.end();
  await targetConn.end();
}
