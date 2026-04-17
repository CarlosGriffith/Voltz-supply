import mysql from 'mysql2/promise';
import { getMysqlSslConfig } from './mysql-ssl.mjs';

export function createPool(overrides = {}) {
  const password = process.env.AIVEN_MYSQL_PASSWORD || '';
  if (!password) {
    console.warn('[api] AIVEN_MYSQL_PASSWORD is not set — database calls will fail until it is set.');
  }

  const ssl = getMysqlSslConfig();

  // Tables use utf8mb4_unicode_ci (scripts/*-bootstrap.sql). MySQL 8 session default is often
  // utf8mb4_0900_ai_ci → "Illegal mix of collations" on = with VARCHAR columns / trigger literals.
  // Important: `pool.on('connection', …)` runs SET NAMES asynchronously; the first query on that
  // connection could still see 0900. We wrap getConnection so SET NAMES always completes first.
  const promisePool = mysql.createPool({
    host: process.env.AIVEN_MYSQL_HOST || 'localhost',
    port: Number(process.env.AIVEN_MYSQL_PORT || 3306),
    user: process.env.AIVEN_MYSQL_USER || 'root',
    password,
    database: process.env.AIVEN_MYSQL_DATABASE || 'defaultdb',
    waitForConnections: true,
    connectionLimit: overrides.connectionLimit ?? 10,
    connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
    charset: 'utf8mb4_unicode_ci',
    dateStrings: true,
    enableKeepAlive: true,
    ssl,
  });

  const corePool = promisePool.pool;
  const origGetConnection = corePool.getConnection.bind(corePool);
  corePool.getConnection = function patchCollationThenGet(cb) {
    origGetConnection((err, connection) => {
      if (err) return cb(err);
      connection.query(
        'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
        (setErr) => {
          if (setErr) return cb(setErr);
          cb(null, connection);
        }
      );
    });
  };

  return promisePool;
}

export async function nextDocNumber(pool, docType, prefix) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_next_doc_number(?, ?, @docnum)', [docType, prefix]);
    const [rows] = await conn.query('SELECT @docnum AS n');
    return rows[0]?.n ?? '';
  } finally {
    conn.release();
  }
}

/** Sequential `cust-3454`, `cust-3455`, … (skips legacy `cust-<timestamp>-<random>` rows). */
export async function nextCustomerId(pool) {
  const conn = await pool.getConnection();
  try {
    const [[lockRow]] = await conn.query(
      "SELECT GET_LOCK('voltz_pos_customer_seq', 15) AS got"
    );
    if (lockRow?.got !== 1) {
      throw new Error('Could not acquire customer id lock');
    }
    try {
      const [[row]] = await conn.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(id, 6) AS UNSIGNED)), 3453) AS m
         FROM pos_customers WHERE id REGEXP '^cust-[0-9]+$'`
      );
      const nextNum = Math.max(3454, Number(row?.m) + 1);
      return `cust-${nextNum}`;
    } finally {
      await conn.query("SELECT RELEASE_LOCK('voltz_pos_customer_seq')");
    }
  } finally {
    conn.release();
  }
}

/**
 * Remap legacy customer ids (e.g. cust-1739…-abc) to cust-3454, cust-3455, … by created_at.
 * Safe on every startup (no-op if nothing legacy). INSERT copy + repoint FKs + DELETE old row.
 */
/** One-shot per process: add missing `customer_id` before any INSERT on cold start. */
let ensurePosQuoteRequestsCustomerIdPromise = null;

/**
 * Older deployments / schemas may lack `pos_quote_requests.customer_id` while INSERTs or triggers
 * still reference it — add the column idempotently. Safe to await on every quote-request write.
 */
export function ensurePosQuoteRequestsCustomerId(pool) {
  if (!ensurePosQuoteRequestsCustomerIdPromise) {
    ensurePosQuoteRequestsCustomerIdPromise = (async () => {
      try {
        await pool.query(
          'ALTER TABLE pos_quote_requests ADD COLUMN `customer_id` VARCHAR(128) NULL'
        );
        console.log('[api] Added column pos_quote_requests.customer_id');
      } catch (e) {
        const msg = e?.message || String(e);
        if (/Duplicate column name/i.test(msg)) return;
        console.error('[api] ensurePosQuoteRequestsCustomerId', e);
      }
    })();
  }
  return ensurePosQuoteRequestsCustomerIdPromise;
}

/** Older DBs may lack `customer_company` on POS document tables while API INSERT/UPDATE still references it. */
let ensurePosCustomerCompanyColumnsPromise = null;

export function ensurePosCustomerCompanyColumns(pool) {
  if (!ensurePosCustomerCompanyColumnsPromise) {
    ensurePosCustomerCompanyColumnsPromise = (async () => {
      const stmts = [
        'ALTER TABLE pos_quotes ADD COLUMN `customer_company` VARCHAR(512) NOT NULL DEFAULT \'\' AFTER `customer_phone`',
        'ALTER TABLE pos_orders ADD COLUMN `customer_company` VARCHAR(512) NOT NULL DEFAULT \'\' AFTER `customer_phone`',
        'ALTER TABLE pos_invoices ADD COLUMN `customer_company` VARCHAR(512) NOT NULL DEFAULT \'\' AFTER `customer_phone`',
      ];
      for (const sql of stmts) {
        try {
          await pool.query(sql);
          const tbl = /^ALTER TABLE (\S+)/i.exec(sql)?.[1] ?? 'pos_*';
          console.log(`[api] Added column ${tbl}.customer_company`);
        } catch (e) {
          const msg = e?.message || String(e);
          if (/Duplicate column name/i.test(msg)) continue;
          console.error('[api] ensurePosCustomerCompanyColumns', e);
          throw e;
        }
      }
    })();
  }
  return ensurePosCustomerCompanyColumnsPromise;
}

export async function migrateLegacyCustomerIds(pool) {
  const conn = await pool.getConnection();
  try {
    const [[lockRow]] = await conn.query(
      "SELECT GET_LOCK('voltz_pos_customer_seq', 30) AS got"
    );
    if (lockRow?.got !== 1) {
      console.warn('[migrateLegacyCustomerIds] lock not acquired, skip');
      return { migrated: 0 };
    }
    try {
      const [[maxRow]] = await conn.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(id, 6) AS UNSIGNED)), 3453) AS m
         FROM pos_customers WHERE id REGEXP '^cust-[0-9]+$'`
      );
      let next = Math.max(3454, Number(maxRow?.m) + 1);

      const [legacyRows] = await conn.query(
        `SELECT id FROM pos_customers
         WHERE id NOT REGEXP '^cust-[0-9]+$'
         ORDER BY created_at ASC, id ASC`
      );

      let migrated = 0;
      for (const row of legacyRows) {
        const oldId = row.id;
        let newId = `cust-${next}`;
        while (true) {
          const [taken] = await conn.query(
            'SELECT 1 AS x FROM pos_customers WHERE id = ? LIMIT 1',
            [newId]
          );
          if (!taken.length) break;
          next += 1;
          newId = `cust-${next}`;
        }
        next += 1;

        await conn.beginTransaction();
        try {
          await conn.query(
            `INSERT INTO pos_customers (id,name,email,phone,company,address,notes,store_credit,account_balance,created_at,updated_at)
             SELECT ?,name,email,phone,company,address,notes,store_credit,account_balance,created_at,updated_at
             FROM pos_customers WHERE id = ?`,
            [newId, oldId]
          );
          await conn.query(
            'UPDATE pos_quotes SET customer_id = ? WHERE customer_id = ?',
            [newId, oldId]
          );
          await conn.query(
            'UPDATE pos_orders SET customer_id = ? WHERE customer_id = ?',
            [newId, oldId]
          );
          await conn.query(
            'UPDATE pos_invoices SET customer_id = ? WHERE customer_id = ?',
            [newId, oldId]
          );
          await conn.query(
            'UPDATE pos_receipts SET customer_id = ? WHERE customer_id = ?',
            [newId, oldId]
          );
          await conn.query(
            'UPDATE pos_refunds SET customer_id = ? WHERE customer_id = ?',
            [newId, oldId]
          );
          await conn.query('DELETE FROM pos_customers WHERE id = ?', [oldId]);
          await conn.commit();
          migrated += 1;
          console.log(
            `[migrateLegacyCustomerIds] ${oldId} -> ${newId} (${migrated} total)`
          );
        } catch (e) {
          await conn.rollback();
          console.error('[migrateLegacyCustomerIds] failed for', oldId, e);
          throw e;
        }
      }
      return { migrated };
    } finally {
      await conn.query("SELECT RELEASE_LOCK('voltz_pos_customer_seq')");
    }
  } finally {
    conn.release();
  }
}
