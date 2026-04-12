/**
 * Migrate CMS tables from Supabase (PostgreSQL) into Aiven MySQL.
 *
 * Uses the Postgres connection string from the Supabase dashboard:
 *   Project Settings → Database → Connection string → URI
 * (Use the "Transaction" or "Session" pooler URL, or direct 5432 — whichever you use for admin tools.)
 *
 * Prerequisites:
 *   npm run db:bootstrap:aiven
 *   npm run db:bootstrap:cms
 *
 * PowerShell:
 *   $env:SUPABASE_DATABASE_URL = "postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:6543/postgres"
 *   node scripts/migrate-supabase-to-aiven.mjs
 *
 * Env:
 *   SUPABASE_DATABASE_URL or POSTGRES_URL (required)
 *   SUPABASE_PG_SSL_DISABLE=1 — only if connecting to local Postgres without TLS
 *   AIVEN_MYSQL_* — target (from .env)
 *   MIGRATE_DRY_RUN=1 — row counts only
 *   MIGRATE_MERGE=1 — upsert into existing MySQL rows (no delete); default replaces CMS tables
 */

import 'dotenv/config';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig } from '../server/mysql-ssl.mjs';

const { Client } = pg;

/** Logical MySQL table name → candidate Postgres table names (first match wins) */
const TABLE_CANDIDATES = {
  cms_config: ['cms_config', 'voltz_cms_config'],
  cms_categories: ['cms_categories', 'voltz_cms_categories', 'categories'],
  cms_custom_products: ['cms_custom_products', 'voltz_cms_products', 'custom_products', 'cms_products'],
  cms_product_overrides: ['cms_product_overrides', 'product_overrides', 'cms_overrides'],
};

const COPY_ORDER = [
  'cms_config',
  'cms_categories',
  'cms_custom_products',
  'cms_product_overrides',
];

function createMysqlConfig() {
  const password = process.env.AIVEN_MYSQL_PASSWORD || process.env.TARGET_MYSQL_PASSWORD || '';
  if (!password) {
    console.error('Set AIVEN_MYSQL_PASSWORD in .env for the target database.');
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

function createPgClient() {
  const conn =
    process.env.SUPABASE_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    '';
  if (!conn) {
    console.error(
      'Set SUPABASE_DATABASE_URL (or POSTGRES_URL) to your Supabase Postgres connection URI.'
    );
    process.exit(1);
  }
  const ssl =
    process.env.SUPABASE_PG_SSL_DISABLE === '1' || process.env.SUPABASE_PG_SSL_DISABLE === 'true'
      ? undefined
      : { rejectUnauthorized: false };
  return new Client({ connectionString: conn, ssl });
}

function normalizeValue(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 23).replace('T', ' ');
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') {
    if (Buffer.isBuffer(v)) return v.toString('utf8');
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v;
}

function pickRowForMysql(row, mysqlCols) {
  const lower = {};
  for (const [k, v] of Object.entries(row)) {
    lower[String(k).toLowerCase()] = v;
  }
  const out = {};
  for (const col of mysqlCols) {
    const raw = row[col] ?? lower[col.toLowerCase()];
    out[col] = normalizeValue(raw);
  }
  return out;
}

function placeholdersRow(n) {
  return '(' + Array(n).fill('?').join(',') + ')';
}

function assertSafeIdent(name) {
  if (!/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
}

async function pgTableExists(client, name) {
  assertSafeIdent(name);
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rowCount > 0;
}

async function resolvePgTable(client, mysqlTableName) {
  const candidates = TABLE_CANDIDATES[mysqlTableName] || [mysqlTableName];
  for (const c of candidates) {
    if (await pgTableExists(client, c)) return c;
  }
  return null;
}

async function getMysqlColumns(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [db, table]
  );
  return rows.map((r) => r.c);
}

async function mysqlTableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [db, table]
  );
  return rows.length > 0;
}

async function migrateTable(pgClient, mysqlPool, mysqlDb, mysqlTable, pgTable, { dryRun, merge }) {
  if (!pgTable) {
    console.log(`  skip ${mysqlTable} (no matching Postgres table)`);
    return 0;
  }
  if (!(await mysqlTableExists(mysqlPool, mysqlDb, mysqlTable))) {
    console.log(`  skip ${mysqlTable} (missing on MySQL — run db:bootstrap:cms)`);
    return 0;
  }

  const mysqlCols = await getMysqlColumns(mysqlPool, mysqlDb, mysqlTable);
  if (mysqlCols.length === 0) return 0;

  assertSafeIdent(pgTable);
  const countR = await pgClient.query(`SELECT COUNT(*)::int AS n FROM ${pgTable}`);
  const n = countR.rows[0]?.n ?? 0;
  if (dryRun) {
    console.log(`  [dry-run] ${mysqlTable} ← ${pgTable}: ${n} rows`);
    return 0;
  }

  if (n === 0) {
    console.log(`  ${mysqlTable} ← ${pgTable}: 0 rows`);
    return 0;
  }

  const dataR = await pgClient.query(`SELECT * FROM ${pgTable}`);
  const rows = dataR.rows.map((row) => pickRowForMysql(row, mysqlCols));

  const colList = mysqlCols.map((c) => `\`${c}\``).join(',');
  const BATCH = 80;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const valueRows = chunk.map(() => placeholdersRow(mysqlCols.length)).join(',');
    const flat = chunk.flatMap((r) => mysqlCols.map((c) => r[c]));

    if (merge) {
      const updates = mysqlCols.map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(',');
      await mysqlPool.query(
        `INSERT INTO \`${mysqlTable}\` (${colList}) VALUES ${valueRows} ON DUPLICATE KEY UPDATE ${updates}`,
        flat
      );
    } else {
      await mysqlPool.query(`INSERT INTO \`${mysqlTable}\` (${colList}) VALUES ${valueRows}`, flat);
    }
    inserted += chunk.length;
  }

  console.log(`  ${mysqlTable} ← ${pgTable}: ${inserted} rows`);
  return inserted;
}

const dryRun = process.env.MIGRATE_DRY_RUN === '1' || process.env.MIGRATE_DRY_RUN === 'true';
const merge = process.env.MIGRATE_MERGE === '1' || process.env.MIGRATE_MERGE === 'true';

const pgClient = createPgClient();
const mysqlCfg = createMysqlConfig();
const targetDb = mysqlCfg.database;
const mysqlPool = mysql.createPool({ ...mysqlCfg, connectionLimit: 3 });

console.log('Supabase / Postgres → Aiven MySQL (CMS tables)');
console.log('Target:', mysqlCfg.host, '/', targetDb, dryRun ? '(dry run)' : '', merge ? '(merge)' : '(replace)');

await pgClient.connect();
console.log('Connected to Postgres.');

try {
  if (!dryRun && !merge) {
    await mysqlPool.query('SET FOREIGN_KEY_CHECKS=0');
    const reverse = [...COPY_ORDER].reverse();
    for (const t of reverse) {
      if (await mysqlTableExists(mysqlPool, targetDb, t)) {
        await mysqlPool.query(`DELETE FROM \`${t}\``);
      }
    }
    await mysqlPool.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('Cleared CMS tables on MySQL.');
  }

  const resolved = {};
  for (const mysqlName of COPY_ORDER) {
    resolved[mysqlName] = await resolvePgTable(pgClient, mysqlName);
    if (resolved[mysqlName]) console.log(`  Postgres: ${resolved[mysqlName]} → MySQL: ${mysqlName}`);
  }

  await mysqlPool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const mysqlName of COPY_ORDER) {
    await migrateTable(pgClient, mysqlPool, targetDb, mysqlName, resolved[mysqlName], {
      dryRun,
      merge,
    });
  }
  await mysqlPool.query('SET FOREIGN_KEY_CHECKS=1');

  if (!dryRun) {
    try {
      await mysqlPool.query(`
        UPDATE cms_categories c
        SET product_count = (
          SELECT COUNT(*) FROM cms_custom_products p WHERE p.category_slug = c.slug
        )
      `);
      console.log('Updated cms_categories.product_count from products.');
    } catch (e) {
      console.warn('Could not recalc product_count:', e.message);
    }
  }

  console.log(dryRun ? 'Dry run done.' : 'Supabase → Aiven CMS migration done.');
} finally {
  await pgClient.end();
  await mysqlPool.end();
}
