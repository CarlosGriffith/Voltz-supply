import cors from 'cors';
import { setDefaultResultOrder } from 'node:dns';
import dns from 'node:dns/promises';

/** Prefer A records over AAAA — many SMTP hosts have broken IPv6; Render → Gmail/SES often times out without this. */
if (typeof setDefaultResultOrder === 'function') {
  setDefaultResultOrder('ipv4first');
}
import { Resolver } from 'node:dns/promises';
import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import {
  createPool,
  nextDocNumber,
  nextCustomerId,
  migrateLegacyCustomerIds,
  ensurePosQuoteRequestsCustomerId,
} from './db.mjs';
import { initDiskUploadDirs, saveUploadedFile, sendUploadedFile } from './storage.mjs';

/** Used only for deliverability MX/A lookups — avoids broken OS stub resolvers (e.g. ECONNREFUSED on Windows dev). */
const publicDnsForDeliverability = new Resolver();
publicDnsForDeliverability.setServers(['8.8.8.8', '1.1.1.1']);

/**
 * @param {{ storage?: 'disk' | 'blobs' }} options
 * - disk: local server/uploads (default for `node server/index.mjs`)
 * - blobs: Netlify Blobs (use from netlify/functions)
 */
export function createApp(options = {}) {
  const storageMode =
    options.storage ||
    (process.env.VOLTZ_STORAGE === 'blobs' ? 'blobs' : 'disk');
  const useBlobs = storageMode === 'blobs';

  const pool = createPool(useBlobs ? { connectionLimit: 3 } : {});
  const app = express();

  if (process.env.RENDER) {
    app.set('trust proxy', 1);
  }

  /**
   * Netlify rewrites `/api/*` → this function, but the request path can arrive as
   * `/.netlify/functions/api/...` so Express would not match `/api/...` routes.
   * Normalize before any routing.
   */
  app.use((req, _res, next) => {
    if (typeof req.url === 'string' && req.url.startsWith('/.netlify/functions/api')) {
      req.url = req.url.replace(/^\/\.netlify\/functions\/api/, '/api') || '/';
    }
    next();
  });

  /**
   * MySQL DATETIME(3) rejects ISO-8601 values like `2026-04-11T23:06:23.906Z` (T/Z).
   * Normalize to UTC `YYYY-MM-DD HH:mm:ss.SSS` for bound parameters.
   * @param {string | null | undefined} v
   * @returns {string | null}
   */
  function toMysqlDatetime3(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (s === '') return null;
    if (!/[tT]/.test(s) && !/[zZ]$/.test(s) && !/\+\d{2}:?\d{2}$/.test(s)) {
      return s;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n, l = 2) => String(n).padStart(l, '0');
    const ms = d.getUTCMilliseconds();
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${String(ms).padStart(3, '0')}`;
  }

  const quoteRequestsSchemaReady = ensurePosQuoteRequestsCustomerId(pool);

  migrateLegacyCustomerIds(pool).then(
    (r) => {
      if (r.migrated > 0) {
        console.log(`[api] migrated ${r.migrated} legacy customer id(s) to cust-3454+`);
      }
    },
    (e) => console.error('[api] migrateLegacyCustomerIds', e)
  );

  /**
   * After INSERT..ON DUPLICATE KEY UPDATE, MySQL may update a row matched by UNIQUE doc # while the
   * client `id` was never inserted — SELECT by id alone returns nothing and breaks the client.
   */
  async function rowAfterQuoteUpsert(id, quoteNumber) {
    const [[byId]] = await pool.query('SELECT * FROM pos_quotes WHERE id = ?', [id]);
    if (byId) return byId;
    if (quoteNumber != null && String(quoteNumber).trim() !== '') {
      const [[byDoc]] = await pool.query('SELECT * FROM pos_quotes WHERE quote_number = ?', [
        quoteNumber,
      ]);
      if (byDoc) return byDoc;
    }
    return null;
  }
  async function rowAfterOrderUpsert(id, orderNumber) {
    const [[byId]] = await pool.query('SELECT * FROM pos_orders WHERE id = ?', [id]);
    if (byId) return byId;
    if (orderNumber != null && String(orderNumber).trim() !== '') {
      const [[byDoc]] = await pool.query('SELECT * FROM pos_orders WHERE order_number = ?', [
        orderNumber,
      ]);
      if (byDoc) return byDoc;
    }
    return null;
  }
  async function rowAfterInvoiceUpsert(id, invoiceNumber) {
    const [[byId]] = await pool.query('SELECT * FROM pos_invoices WHERE id = ?', [id]);
    if (byId) return byId;
    if (invoiceNumber != null && String(invoiceNumber).trim() !== '') {
      const [[byDoc]] = await pool.query('SELECT * FROM pos_invoices WHERE invoice_number = ?', [
        invoiceNumber,
      ]);
      if (byDoc) return byDoc;
    }
    return null;
  }

  const nmInvoiceMoney = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };

  /** Maps invoice payment/status to allowed pos_orders.status values. */
  function orderStatusFromInvoiceRow(inv) {
    const s = String(inv.status ?? 'Unpaid').trim().toLowerCase();
    if (s.includes('refund')) return 'refunded';
    if (s.includes('partial')) return 'invoice_generated_partially_paid';
    if (s.includes('paid')) return 'invoice_generated_paid';
    const paid = nmInvoiceMoney(inv.amount_paid);
    const tot = nmInvoiceMoney(inv.total);
    if (tot > 0 && paid >= tot - 0.009) return 'invoice_generated_paid';
    if (paid > 0.009) return 'invoice_generated_partially_paid';
    return 'invoice_generated_unpaid';
  }

  const sqlIdStr = (v) => {
    if (v == null) return '';
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.toString('utf8').trim();
    return String(v).trim();
  };

  /** True if any `pos_refunds` row applies to this invoice (`invoice_id` or `invoice_links` JSON). */
  async function refundTouchesInvoice(conn, invoicePk) {
    const id = sqlIdStr(invoicePk);
    if (!id) return false;
    const [rows] = await conn.query(
      `SELECT invoice_id, invoice_links FROM pos_refunds
       WHERE invoice_id = ? OR (invoice_links IS NOT NULL AND TRIM(invoice_links) NOT IN ('', 'null', '[]'))`,
      [id]
    );
    for (const r of rows || []) {
      if (r.invoice_id != null && sqlIdStr(r.invoice_id) === id) return true;
      const raw = r.invoice_links;
      if (raw == null || raw === '') continue;
      try {
        const links = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (Array.isArray(links) && links.some((l) => l && sqlIdStr(l.invoice_id) === id)) return true;
      } catch {
        /* ignore malformed JSON */
      }
    }
    return false;
  }

  /** Same rule as the POS UI: Paid / Partially Paid + refund rows ⇒ `partially_refunded` on the order. */
  async function orderStatusFromInvoiceRowConsideringRefunds(conn, inv) {
    const raw = String(inv.status ?? 'Unpaid').trim().toLowerCase();
    if (raw === 'refunded') return 'refunded';
    const hasRef = await refundTouchesInvoice(conn, inv.id);
    if (hasRef && (raw === 'paid' || raw === 'partially paid')) return 'partially_refunded';
    return orderStatusFromInvoiceRow(inv);
  }

  /** Avoid FK failures on pos_orders: only reference existing CRM / quote rows. */
  async function fkCustomerIdOrNull(conn, customerId) {
    if (customerId == null || String(customerId).trim() === '') return null;
    const id = String(customerId).trim();
    const [[r]] = await conn.query('SELECT id FROM pos_customers WHERE id = ? LIMIT 1', [id]);
    return r?.id ? id : null;
  }
  async function fkQuoteIdOrNull(conn, quoteId) {
    if (quoteId == null || String(quoteId).trim() === '') return null;
    const id = String(quoteId).trim();
    const [[r]] = await conn.query('SELECT id FROM pos_quotes WHERE id = ? LIMIT 1', [id]);
    return r?.id ? id : null;
  }

  /**
   * Keep `pos_orders` in sync with `pos_invoices` when the invoice is edited (same line items, totals, customer).
   */
  async function syncLinkedOrderFromInvoice(invoiceId) {
    const conn = await pool.getConnection();
    try {
      const [[inv]] = await conn.query('SELECT * FROM pos_invoices WHERE id = ? LIMIT 1', [invoiceId]);
      if (!inv) return null;
      let oid =
        inv.order_id != null && String(inv.order_id).trim() !== '' ? String(inv.order_id).trim() : '';
      if (!oid) {
        const [[claim]] = await conn.query(
          'SELECT id FROM pos_orders WHERE invoice_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1',
          [invoiceId]
        );
        if (claim?.id) {
          oid = String(claim.id).trim();
          await conn.query('UPDATE pos_invoices SET order_id = ? WHERE id = ?', [oid, invoiceId]);
        }
      }
      if (!oid) return null;
      const [[ord]] = await conn.query('SELECT id FROM pos_orders WHERE id = ? LIMIT 1', [oid]);
      if (!ord?.id) return null;

      const custId = await fkCustomerIdOrNull(conn, inv.customer_id);
      const quoteId = await fkQuoteIdOrNull(conn, inv.quote_id);
      const itemsJson =
        typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items != null ? inv.items : []);

      const orderSt = await orderStatusFromInvoiceRowConsideringRefunds(conn, inv);

      await conn.query(
        `UPDATE pos_orders SET
          customer_id = ?,
          customer_name = ?,
          customer_email = ?,
          customer_phone = ?,
          customer_type = ?,
          status = ?,
          items = ?,
          subtotal = ?,
          tax_rate = ?,
          tax_amount = ?,
          discount_amount = ?,
          total = ?,
          notes = ?,
          quote_id = ?,
          invoice_id = ?
        WHERE id = ?`,
        [
          custId,
          inv.customer_name ?? '',
          inv.customer_email ?? '',
          inv.customer_phone ?? '',
          custId ? 'registered' : 'visitor',
          orderSt,
          itemsJson,
          nmInvoiceMoney(inv.subtotal),
          nmInvoiceMoney(inv.tax_rate),
          nmInvoiceMoney(inv.tax_amount),
          nmInvoiceMoney(inv.discount_amount),
          nmInvoiceMoney(inv.total),
          inv.notes ?? '',
          quoteId,
          invoiceId,
          oid,
        ]
      );
      return true;
    } finally {
      conn.release();
    }
  }

  /**
   * Every invoice should have a backing POS order when none exists yet (links `pos_invoices.order_id`).
   * Creates `pos_orders` from the invoice snapshot and sets `order_id` on the invoice row.
   *
   * Also fixes: (1) order row exists but `invoice_id` was never set / wrong; (2) invoice `order_id` points at
   * another invoice's order — clear and link or create; (3) a `pos_orders` row already references this
   * invoice via `invoice_id` but `pos_invoices.order_id` was never set — attach without duplicating.
   */
  async function ensureInvoiceHasLinkedOrder(invoiceId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[inv]] = await conn.query('SELECT * FROM pos_invoices WHERE id = ? FOR UPDATE', [invoiceId]);
      if (!inv) {
        await conn.rollback();
        return null;
      }
      const thisId = String(invoiceId).trim();
      const oid = inv.order_id != null && String(inv.order_id).trim() !== '' ? String(inv.order_id).trim() : '';
      if (oid) {
        const [[existing]] = await conn.query(
          'SELECT id, invoice_id FROM pos_orders WHERE id = ? LIMIT 1',
          [oid]
        );
        if (existing?.id) {
          const eInv = existing.invoice_id != null ? String(existing.invoice_id).trim() : '';
          if (eInv !== '' && eInv !== thisId) {
            /** This invoice pointed at another document's order — unlink and fall through to claim/create. */
            await conn.query('UPDATE pos_invoices SET order_id = NULL WHERE id = ?', [invoiceId]);
          } else {
            if (eInv !== thisId) {
              await conn.query('UPDATE pos_orders SET invoice_id = ? WHERE id = ?', [invoiceId, oid]);
            }
            await conn.commit();
            const [[rowFresh]] = await pool.query('SELECT * FROM pos_invoices WHERE id = ?', [invoiceId]);
            return rowFresh ?? inv;
          }
        } else {
          /** Stale FK: invoice pointed at a deleted/missing order — clear so a new order can be linked. */
          await conn.query('UPDATE pos_invoices SET order_id = NULL WHERE id = ?', [invoiceId]);
        }
      }

      /** Orphan back-link: an order row already names this invoice but the invoice has no (valid) order_id. */
      const [[claim]] = await conn.query(
        'SELECT id FROM pos_orders WHERE invoice_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1 FOR UPDATE',
        [invoiceId]
      );
      if (claim?.id) {
        const claimId = String(claim.id).trim();
        await conn.query('UPDATE pos_invoices SET order_id = ? WHERE id = ?', [claimId, invoiceId]);
        await conn.commit();
        const [[rowFresh]] = await pool.query('SELECT * FROM pos_invoices WHERE id = ?', [invoiceId]);
        return rowFresh ?? null;
      }

      const orderNumber = await nextDocNumber(pool, 'order', 'OR-');
      const orderId = `o-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const itemsJson =
        typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items != null ? inv.items : []);

      const custId = await fkCustomerIdOrNull(conn, inv.customer_id);
      const quoteId = await fkQuoteIdOrNull(conn, inv.quote_id);

      await conn.query(
        `INSERT INTO pos_orders (id,order_number,customer_id,customer_name,customer_email,customer_phone,customer_type,status,items,subtotal,tax_rate,tax_amount,discount_amount,total,notes,quote_id,invoice_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId,
          orderNumber,
          custId,
          inv.customer_name ?? '',
          inv.customer_email ?? '',
          inv.customer_phone ?? '',
          custId ? 'registered' : 'visitor',
          orderStatusFromInvoiceRow(inv),
          itemsJson,
          nmInvoiceMoney(inv.subtotal),
          nmInvoiceMoney(inv.tax_rate),
          nmInvoiceMoney(inv.tax_amount),
          nmInvoiceMoney(inv.discount_amount),
          nmInvoiceMoney(inv.total),
          inv.notes ?? '',
          quoteId,
          invoiceId,
        ]
      );
      await conn.query('UPDATE pos_invoices SET order_id = ? WHERE id = ?', [orderId, invoiceId]);
      await conn.commit();
      const [[row]] = await pool.query('SELECT * FROM pos_invoices WHERE id = ?', [invoiceId]);
      return row ?? null;
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      console.error('[api] ensureInvoiceHasLinkedOrder', e);
      throw e;
    } finally {
      conn.release();
    }
  }

  const uploadMax = useBlobs
    ? Math.min(
        4 * 1024 * 1024,
        Number(process.env.MAX_UPLOAD_BYTES || 4 * 1024 * 1024)
      )
    : 40 * 1024 * 1024;

  /**
   * Public API: browsers on other origins (e.g. www.voltzsupply.com → voltz-supply.netlify.app)
   * need explicit CORS. `origin: '*'` avoids reflection edge cases in serverless; no cookie auth on API.
   */
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 86400,
      optionsSuccessStatus: 204,
    })
  );
  app.use(express.json({ limit: '24mb' }));

  if (!useBlobs) {
    const { uploadRoot } = initDiskUploadDirs();
    app.use('/uploads', express.static(uploadRoot));
  } else {
    app.get('/uploads/products/:filename', (req, res) => {
      sendUploadedFile('products', req.params.filename, res, true).catch((e) => {
        console.error(e);
        res.status(500).end();
      });
    });
    app.get('/uploads/documents/:filename', (req, res) => {
      sendUploadedFile('documents', req.params.filename, res, true).catch((e) => {
        console.error(e);
        res.status(500).end();
      });
    });
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: uploadMax },
  });

app.get('/api/health', async (req, res) => {
  const payload = { ok: true, service: 'voltz-api' };
  if (req.query.db === '1') {
    if (!process.env.AIVEN_MYSQL_PASSWORD) {
      return res.status(503).json({
        ok: false,
        service: 'voltz-api',
        db: 'error',
        error:
          'AIVEN_MYSQL_PASSWORD is not set. Add it in the Render Web Service → Environment (or .env for local dev:api), then redeploy/restart.',
        code: 'ENV_MISSING_PASSWORD',
      });
    }
    try {
      await pool.query('SELECT 1 AS ok');
      payload.db = 'ok';
    } catch (e) {
      const base = e?.message || String(e);
      const code = e?.code != null ? String(e.code) : undefined;
      const errno = e?.errno != null ? Number(e.errno) : undefined;
      const sqlState = e?.sqlState != null ? String(e.sqlState) : undefined;
      const hint =
        code === 'ECONNREFUSED'
          ? ' Check AIVEN_MYSQL_HOST and AIVEN_MYSQL_PORT (Aiven uses a custom port, not 3306).'
          : code === 'ETIMEDOUT' || code === 'ENOTFOUND'
            ? ' Check AIVEN_MYSQL_HOST and that your API host (e.g. Render) can reach the DB (Aiven IP allowlist / VPC).'
            : /certificate|SSL|TLS|self signed/i.test(base)
              ? ' Ensure scripts/aiven-ca.pem is in the deploy or set AIVEN_MYSQL_SSL_CA in the API environment (Render).'
              : '';
      return res.status(503).json({
        ok: false,
        service: 'voltz-api',
        db: 'error',
        error: `${base}${hint}`,
        code,
        errno,
        sqlState,
      });
    }
  }
  res.json(payload);
});

// ─── POS: document numbers ───
app.post('/api/pos/generate-number', async (req, res) => {
  try {
    const type = req.body?.type;
    const map = {
      quote: ['quote', 'QT-'],
      order: ['order', 'OR-'],
      invoice: ['invoice', 'INV-'],
      receipt: ['receipt', 'RT-'],
      refund: ['refund', 'REF-'],
    };
    const cfg = map[type];
    if (!cfg) return res.status(400).json({ error: 'invalid type' });
    const num = await nextDocNumber(pool, cfg[0], cfg[1]);
    res.json({ number: num });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'generate failed' });
  }
});

/** Express JSON cannot serialize BigInt; mysql2 may return BigInt for some numeric types. */
function jsonSafeForApi(value) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

function posRowsHandler(table, orderSql = 'ORDER BY created_at DESC') {
  return async (_req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} ${orderSql}`);
      res.json(jsonSafeForApi(rows));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  };
}

/** MX records, or A/AAAA fallback — whether the domain plausibly accepts mail. */
async function emailDomainLooksDeliverable(email) {
  const em = String(email ?? '').trim();
  const at = em.indexOf('@');
  if (at < 1 || at === em.length - 1) return false;
  const domain = em.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes('.')) return false;

  const resolvers = [dns, publicDnsForDeliverability];

  for (const r of resolvers) {
    try {
      const mx = await r.resolveMx(domain);
      if (mx && mx.length > 0) return true;
    } catch {
      /* try next resolver */
    }
  }

  for (const r of resolvers) {
    try {
      await r.resolve4(domain);
      return true;
    } catch {
      try {
        await r.resolve6(domain);
        return true;
      } catch {
        /* try next resolver */
      }
    }
  }
  return false;
}

/** Public (no auth): DNS/MX check for quote/POS email fields. */
app.get('/api/public/validate-email-deliverable', async (req, res) => {
  try {
    const email = String(req.query.email ?? '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ deliverable: false });
    }
    const deliverable = await emailDomainLooksDeliverable(email);
    res.json({ deliverable });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'check failed' });
  }
});

/** Public (no auth): whether email matches a pos_customers row — used by website quote form UX only. */
app.get('/api/public/customers/email-exists', async (req, res) => {
  try {
    const email = String(req.query.email ?? '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ exists: false });
    }
    const [[row]] = await pool.query(
      'SELECT 1 AS ok FROM pos_customers WHERE LOWER(TRIM(email)) = LOWER(?) LIMIT 1',
      [email]
    );
    res.json({ exists: !!row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'check failed' });
  }
});

  /** Digits-only phone for matching denormalized rows across formatting. */
  function normalizePhoneDigits(p) {
    return String(p ?? '').replace(/\D/g, '');
  }

  /**
   * After pos_customers upsert: copy name/email/phone/company onto linked quotes/orders/invoices/receipts/refunds/quote_requests.
   * Rows with matching customer_id always update.
   * Rows with NULL customer_id update when phone digits match the previous customer phone and, if email was set on the old row,
   * customer_email matches (otherwise email constraint is skipped so phone is the primary match).
   */
  async function propagateCustomerDenormalizedFields(row, previousRow) {
    const id = row.id;
    const name = row.name ?? '';
    const email = row.email ?? '';
    const phone = row.phone ?? '';
    const company = row.company ?? '';

    await pool.query(
      `UPDATE pos_quotes SET customer_name=?, customer_email=?, customer_phone=?, customer_company=?, updated_at=CURRENT_TIMESTAMP(3) WHERE customer_id=?`,
      [name, email, phone, company, id]
    );
    await pool.query(
      `UPDATE pos_orders SET customer_name=?, customer_email=?, customer_phone=?, updated_at=CURRENT_TIMESTAMP(3) WHERE customer_id=?`,
      [name, email, phone, id]
    );
    await pool.query(
      `UPDATE pos_invoices SET customer_name=?, customer_email=?, customer_phone=?, updated_at=CURRENT_TIMESTAMP(3) WHERE customer_id=?`,
      [name, email, phone, id]
    );
    await pool.query(
      `UPDATE pos_receipts SET customer_name=?, updated_at=CURRENT_TIMESTAMP(3) WHERE customer_id=?`,
      [name, id]
    );
    await pool.query(
      `UPDATE pos_refunds SET customer_name=?, updated_at=CURRENT_TIMESTAMP(3) WHERE customer_id=?`,
      [name, id]
    );
    try {
      await pool.query(
        `UPDATE pos_quote_requests SET name=?, email=?, phone=?, company=?, updated_at=CURRENT_TIMESTAMP(3) WHERE customer_id=?`,
        [name, email, phone, company, id]
      );
    } catch (e) {
      if (!String(e.message || '').includes('customer_id')) throw e;
    }

    if (!previousRow) return;
    const oldP = normalizePhoneDigits(previousRow.phone);
    if (!oldP) return;
    const oldE = String(previousRow.email ?? '').trim().toLowerCase();

    const orphanEmailClause = `AND ((? = '') OR (LOWER(TRIM(IFNULL(customer_email,''))) = ?))`;

    await pool.query(
      `UPDATE pos_quotes SET customer_name=?, customer_email=?, customer_phone=?, customer_company=?, updated_at=CURRENT_TIMESTAMP(3)
       WHERE customer_id IS NULL
       AND REGEXP_REPLACE(IFNULL(customer_phone,''), '[^0-9]+', '') = ?
       ${orphanEmailClause}`,
      [name, email, phone, company, oldP, oldE, oldE]
    );
    await pool.query(
      `UPDATE pos_orders SET customer_name=?, customer_email=?, customer_phone=?, updated_at=CURRENT_TIMESTAMP(3)
       WHERE customer_id IS NULL
       AND REGEXP_REPLACE(IFNULL(customer_phone,''), '[^0-9]+', '') = ?
       ${orphanEmailClause}`,
      [name, email, phone, oldP, oldE, oldE]
    );
    await pool.query(
      `UPDATE pos_invoices SET customer_name=?, customer_email=?, customer_phone=?, updated_at=CURRENT_TIMESTAMP(3)
       WHERE customer_id IS NULL
       AND REGEXP_REPLACE(IFNULL(customer_phone,''), '[^0-9]+', '') = ?
       ${orphanEmailClause}`,
      [name, email, phone, oldP, oldE, oldE]
    );

    try {
      await pool.query(
        `UPDATE pos_quote_requests SET name=?, email=?, phone=?, company=?, updated_at=CURRENT_TIMESTAMP(3)
         WHERE customer_id IS NULL
         AND REGEXP_REPLACE(IFNULL(phone,''), '[^0-9]+', '') = ?
         AND ((? = '') OR (LOWER(TRIM(IFNULL(email,''))) = ?))`,
        [name, email, phone, company, oldP, oldE, oldE]
      );
    } catch (e) {
      if (!String(e.message || '').includes('customer_id')) throw e;
    }
  }

app.get('/api/pos/customers', posRowsHandler('pos_customers', 'ORDER BY name'));
app.get('/api/pos/quote-requests', posRowsHandler('pos_quote_requests'));
app.get('/api/pos/quotes', posRowsHandler('pos_quotes'));
app.get('/api/pos/orders', posRowsHandler('pos_orders'));
app.get('/api/pos/invoices', posRowsHandler('pos_invoices'));
app.get('/api/pos/receipts', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pos_receipts ORDER BY created_at DESC');
    if (!rows?.length) return res.json([]);
    const ids = rows.map((r) => r.id);
    let linkRows = [];
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      const [lr] = await pool.query(
        `SELECT l.receipt_id, l.invoice_id, l.amount_applied, i.invoice_number AS invoice_number
         FROM pos_receipt_invoice_links l
         LEFT JOIN pos_invoices i
           ON i.id COLLATE utf8mb4_unicode_ci = l.invoice_id COLLATE utf8mb4_unicode_ci
         WHERE l.receipt_id IN (${ph})`,
        ids
      );
      linkRows = lr || [];
    }
    const byReceipt = new Map();
    for (const l of linkRows) {
      const rid = String(l.receipt_id ?? '').trim();
      if (!rid) continue;
      if (!byReceipt.has(rid)) byReceipt.set(rid, []);
      const invNum =
        l.invoice_number != null && String(l.invoice_number).trim() !== ''
          ? String(l.invoice_number).trim()
          : undefined;
      byReceipt.get(rid).push({
        invoice_id: String(l.invoice_id ?? '').trim(),
        amount_applied: Number(l.amount_applied) || 0,
        ...(invNum ? { invoice_number: invNum } : {}),
      });
    }
    res.json(
      rows.map((r) => ({
        ...r,
        invoice_links: byReceipt.get(String(r.id ?? '').trim()) ?? [],
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'receipts list failed' });
  }
});
app.get('/api/pos/refunds', posRowsHandler('pos_refunds'));
app.get('/api/pos/sent-emails', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM pos_sent_emails ORDER BY sent_at DESC LIMIT 200'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/customers', async (req, res) => {
  try {
    const c = req.body;
    const id = c.id && String(c.id).trim() !== '' ? c.id : await nextCustomerId(pool);
    let previousRow = null;
    if (c.id && String(c.id).trim() !== '') {
      const [prevRows] = await pool.query('SELECT * FROM pos_customers WHERE id = ?', [id]);
      previousRow = prevRows?.[0] ?? null;
    }
    const sql = `INSERT INTO pos_customers (id,name,email,phone,company,address,notes,store_credit,updated_at)
      VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),phone=VALUES(phone),company=VALUES(company),
      address=VALUES(address),notes=VALUES(notes),store_credit=VALUES(store_credit),updated_at=CURRENT_TIMESTAMP(3)`;
    await pool.query(sql, [
      id,
      c.name ?? '',
      c.email ?? '',
      c.phone ?? '',
      c.company ?? '',
      c.address ?? '',
      c.notes ?? '',
      c.store_credit ?? 0,
    ]);
    const [[row]] = await pool.query('SELECT * FROM pos_customers WHERE id = ?', [id]);
    await propagateCustomerDenormalizedFields(row, previousRow);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/pos/customers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM pos_customers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/pos/customers/:id/store-credit', async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE pos_customers SET store_credit = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [req.body?.amount ?? 0, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Checkout: add to store credit (overpayment); increments existing balance. */
app.post('/api/pos/customers/:id/add-store-credit', async (req, res) => {
  try {
    const add = Number(req.body?.amount ?? 0);
    if (!Number.isFinite(add) || add <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const id = req.params.id;
    const [result] = await pool.query(
      `UPDATE pos_customers
       SET store_credit = COALESCE(store_credit, 0) + ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [add, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const [[row]] = await pool.query('SELECT store_credit FROM pos_customers WHERE id = ?', [id]);
    res.json({ ok: true, store_credit: row?.store_credit != null ? Number(row.store_credit) : 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** Checkout: atomically subtract store credit (one UPDATE; verifies row exists). */
app.post('/api/pos/customers/:id/deduct-store-credit', async (req, res) => {
  try {
    const deduct = Number(req.body?.amount ?? 0);
    if (!Number.isFinite(deduct) || deduct <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const id = req.params.id;
    const [result] = await pool.query(
      `UPDATE pos_customers
       SET store_credit = GREATEST(0, COALESCE(store_credit, 0) - ?),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [deduct, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const [[row]] = await pool.query('SELECT store_credit FROM pos_customers WHERE id = ?', [id]);
    res.json({ ok: true, store_credit: row?.store_credit != null ? Number(row.store_credit) : 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/quote-requests', async (req, res) => {
  try {
    await quoteRequestsSchemaReady;
    const q = req.body;
    const id = q.id || `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Do not reference customer_id in SQL — some DBs lack that column (see scripts/add-pos-quote-requests-customer-id.sql).
    await pool.query(
      `INSERT INTO pos_quote_requests (id,name,email,phone,company,category,product,quantity,message,status,quote_id,quote_number,email_sent_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),phone=VALUES(phone),company=VALUES(company),
       category=VALUES(category),product=VALUES(product),quantity=VALUES(quantity),message=VALUES(message),
       status=VALUES(status),quote_id=VALUES(quote_id),quote_number=VALUES(quote_number),updated_at=CURRENT_TIMESTAMP(3)`,
      [
        id,
        q.name ?? '',
        q.email ?? '',
        q.phone ?? '',
        q.company ?? '',
        q.category ?? '',
        q.product ?? '',
        q.quantity ?? '',
        q.message ?? '',
        q.status ?? 'new',
        q.quote_id ?? null,
        q.quote_number ?? null,
        q.email_sent_at != null ? toMysqlDatetime3(q.email_sent_at) : null,
      ]
    );
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/pos/quote-requests/:id', async (req, res) => {
  try {
    const { status, quote_id, quote_number, email_sent_at, mark_email_sent } = req.body || {};
    const fields = ['updated_at = CURRENT_TIMESTAMP(3)'];
    const params = [];
    if (status !== undefined) {
      fields.push('status = ?');
      params.push(status);
    }
    if (quote_id !== undefined) {
      fields.push('quote_id = ?');
      params.push(quote_id);
    }
    if (quote_number !== undefined) {
      fields.push('quote_number = ?');
      params.push(quote_number);
    }
    if (mark_email_sent === true) {
      fields.push('email_sent_at = CURRENT_TIMESTAMP(3)');
    } else if (email_sent_at !== undefined) {
      fields.push('email_sent_at = ?');
      params.push(toMysqlDatetime3(email_sent_at));
    }
    params.push(req.params.id);
    await pool.query(`UPDATE pos_quote_requests SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/quotes', async (req, res) => {
  try {
    const q = req.body;
    const id = q.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const normSt = (s) => (s == null ? '' : String(s).trim().toLowerCase());
    let newStatus = q.status ?? 'reviewed';
    let statusBeforeDormant = null;
    if (q.id) {
      const [[existing]] = await pool.query(
        'SELECT status, status_before_dormant FROM pos_quotes WHERE id = ?',
        [q.id]
      );
      if (existing) {
        const ex = normSt(existing.status);
        const inc = normSt(newStatus);
        if (inc === 'dormant') {
          if (ex !== 'dormant') {
            statusBeforeDormant = existing.status;
          } else {
            statusBeforeDormant = existing.status_before_dormant ?? null;
          }
        } else if (ex === 'dormant') {
          const restore = existing.status_before_dormant;
          newStatus =
            restore != null && String(restore).trim() !== '' ? String(restore).trim() : 'reviewed';
          statusBeforeDormant = null;
        }
      }
    }
    const cols = [
      'quote_number',
      'customer_id',
      'customer_name',
      'customer_email',
      'customer_phone',
      'customer_company',
      'source',
      'status',
      'status_before_dormant',
      'items',
      'subtotal',
      'tax_rate',
      'tax_amount',
      'discount_amount',
      'total',
      'notes',
      'valid_until',
      'website_request_id',
      'order_id',
      'invoice_id',
      'email_sent_at',
    ];
    const vals = [
      q.quote_number ?? '',
      q.customer_id ?? null,
      q.customer_name ?? '',
      q.customer_email ?? '',
      q.customer_phone ?? '',
      q.customer_company ?? '',
      q.source ?? 'walk-in',
      newStatus,
      statusBeforeDormant,
      typeof q.items === 'string' ? q.items : JSON.stringify(q.items || []),
      q.subtotal ?? 0,
      q.tax_rate ?? 0,
      q.tax_amount ?? 0,
      q.discount_amount ?? 0,
      q.total ?? 0,
      q.notes ?? '',
      toMysqlDatetime3(q.valid_until ?? null),
      q.website_request_id ?? null,
      q.order_id ?? null,
      q.invoice_id ?? null,
      toMysqlDatetime3(q.email_sent_at ?? null),
    ];
    const placeholders = cols.map(() => '?').join(',');
    // MySQL 8.0.33+ deprecates VALUES(col) here; use row alias (INSERT ... VALUES (...) AS d)
    const updates = cols
      .map((c) =>
        c === 'email_sent_at'
          ? 'email_sent_at=COALESCE(d.email_sent_at, pos_quotes.email_sent_at)'
          : `${c}=d.${c}`
      )
      .join(',');
    await pool.query(
      `INSERT INTO pos_quotes (id,${cols.join(',')}) VALUES (?,${placeholders}) AS d
       ON DUPLICATE KEY UPDATE ${updates}`,
      [id, ...vals]
    );
    const row = await rowAfterQuoteUpsert(id, q.quote_number ?? '');
    if (!row) {
      return res.status(500).json({ error: 'Quote not found after save' });
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/orders', async (req, res) => {
  try {
    const o = req.body;
    const id = o.id || `o-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cols = [
      'order_number',
      'customer_id',
      'customer_name',
      'customer_email',
      'customer_phone',
      'customer_type',
      'status',
      'items',
      'subtotal',
      'tax_rate',
      'tax_amount',
      'discount_amount',
      'total',
      'notes',
      'quote_id',
      'invoice_id',
    ];
    const vals = [
      o.order_number ?? '',
      o.customer_id ?? null,
      o.customer_name ?? '',
      o.customer_email ?? '',
      o.customer_phone ?? '',
      o.customer_type ?? 'visitor',
      o.status ?? 'reviewed',
      typeof o.items === 'string' ? o.items : JSON.stringify(o.items || []),
      o.subtotal ?? 0,
      o.tax_rate ?? 0,
      o.tax_amount ?? 0,
      o.discount_amount ?? 0,
      o.total ?? 0,
      o.notes ?? '',
      o.quote_id ?? null,
      o.invoice_id ?? null,
    ];
    const placeholders = cols.map(() => '?').join(',');
    const updates = cols.map((c) => `${c}=d.${c}`).join(',');
    await pool.query(
      `INSERT INTO pos_orders (id,${cols.join(',')}) VALUES (?,${placeholders}) AS d
       ON DUPLICATE KEY UPDATE ${updates}`,
      [id, ...vals]
    );
    const row = await rowAfterOrderUpsert(id, o.order_number ?? '');
    if (!row) {
      return res.status(500).json({ error: 'Order not found after save' });
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/invoices', async (req, res) => {
  try {
    const inv = req.body;
    /** JSON can send DECIMAL columns as strings; reject NaN so MySQL never stores concat garbage. */
    const nm = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const id = inv.id || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cols = [
      'invoice_number',
      'order_id',
      'quote_id',
      'customer_id',
      'customer_name',
      'customer_email',
      'customer_phone',
      'status',
      'payment_method',
      'delivery_status',
      'items',
      'subtotal',
      'tax_rate',
      'tax_amount',
      'discount_amount',
      'total',
      'amount_paid',
      'notes',
      'paid_at',
      'delivered_at',
    ];
    const vals = [
      inv.invoice_number ?? '',
      inv.order_id ?? null,
      inv.quote_id ?? null,
      inv.customer_id ?? null,
      inv.customer_name ?? '',
      inv.customer_email ?? '',
      inv.customer_phone ?? '',
      inv.status ?? 'Unpaid',
      inv.payment_method ?? null,
      inv.delivery_status ?? 'pending',
      typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items || []),
      nm(inv.subtotal),
      nm(inv.tax_rate),
      nm(inv.tax_amount),
      nm(inv.discount_amount),
      nm(inv.total),
      nm(inv.amount_paid),
      inv.notes ?? '',
      inv.paid_at ?? null,
      inv.delivered_at ?? null,
    ];
    const placeholders = cols.map(() => '?').join(',');
    /** Do not wipe server-assigned links when the client omits `order_id` / `quote_id` (common on saveInvoice). */
    const updates = cols
      .map((c) => {
        if (c === 'order_id') return 'order_id=COALESCE(d.order_id, pos_invoices.order_id)';
        if (c === 'quote_id') return 'quote_id=COALESCE(d.quote_id, pos_invoices.quote_id)';
        return `${c}=d.${c}`;
      })
      .join(',');
    await pool.query(
      `INSERT INTO pos_invoices (id,${cols.join(',')}) VALUES (?,${placeholders}) AS d
       ON DUPLICATE KEY UPDATE ${updates}`,
      [id, ...vals]
    );
    let row = await rowAfterInvoiceUpsert(id, inv.invoice_number ?? '');
    if (!row) {
      return res.status(500).json({ error: 'Invoice not found after save' });
    }
    const invoicePk = String(row.id ?? id).trim();
    const syncFailMsgs = [];
    let withOrder = null;
    try {
      withOrder = await ensureInvoiceHasLinkedOrder(invoicePk);
      if (withOrder) row = withOrder;
    } catch (e) {
      console.error('[api] pos/invoices: ensure order for invoice', e);
      syncFailMsgs.push(
        `Creating or linking the POS order failed: ${String(e?.message || e)}. The invoice may still be saved — try Save again.`
      );
    }
    if (!withOrder && syncFailMsgs.length === 0) {
      syncFailMsgs.push(
        'The server could not verify or create a linked POS order for this invoice. Try Save again, or contact support if this continues.'
      );
    }
    try {
      await syncLinkedOrderFromInvoice(invoicePk);
    } catch (e) {
      console.error('[api] pos/invoices: sync order from invoice', e);
      syncFailMsgs.push(
        `Updating the linked POS order failed: ${String(e?.message || e)}. Try Save again to resync.`
      );
    }
    const [[fresh]] = await pool.query('SELECT * FROM pos_invoices WHERE id = ? LIMIT 1', [invoicePk]);
    if (fresh) row = fresh;
    const hasOrder = row?.order_id != null && String(row.order_id).trim() !== '';
    let orderSyncError = '';
    if (!hasOrder) {
      orderSyncError = syncFailMsgs.length ? syncFailMsgs.join(' ') : 'The invoice saved without a linked POS order. Try Save again.';
    } else if (syncFailMsgs.length) {
      orderSyncError = syncFailMsgs.join(' ');
    }
    if (orderSyncError) {
      row = { ...row, _order_sync_error: orderSyncError };
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/receipts', async (req, res) => {
  const r = req.body;
  const id = r.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rawLinks = r.invoice_links;
  let invoiceLinks = [];
  if (Array.isArray(rawLinks) && rawLinks.length > 0) {
    invoiceLinks = rawLinks
      .map((l) => ({
        invoice_id: l?.invoice_id != null ? String(l.invoice_id).trim() : '',
        amount_applied: Number(l.amount_applied) || 0,
      }))
      .filter((l) => l.invoice_id);
  } else if (r.invoice_id != null && String(r.invoice_id).trim() !== '') {
    invoiceLinks = [
      {
        invoice_id: String(r.invoice_id).trim(),
        amount_applied: Number(r.amount_paid) || 0,
      },
    ];
  }

  const nRecOpt = (v) => {
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  const cols = [
    'receipt_number',
    'invoice_id',
    'customer_id',
    'customer_name',
    'payment_method',
    'status',
    'payment_type',
    'amount_paid',
    'items',
    'total',
    'subtotal',
    'tax_rate',
    'tax_amount',
    'discount_amount',
    'notes',
    'created_at',
  ];
  const vals = [
    r.receipt_number ?? '',
    r.invoice_id ?? null,
    r.customer_id ?? null,
    r.customer_name ?? '',
    r.payment_method ?? '',
    r.status ?? 'approved',
    r.payment_type ?? 'full',
    r.amount_paid ?? 0,
    typeof r.items === 'string' ? r.items : JSON.stringify(r.items || []),
    r.total ?? 0,
    nRecOpt(r.subtotal),
    nRecOpt(r.tax_rate),
    nRecOpt(r.tax_amount),
    nRecOpt(r.discount_amount),
    r.notes ?? '',
    r.created_at ?? new Date().toISOString().replace('Z', '').slice(0, 23),
  ];
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols
    .filter((c) => c !== 'created_at')
    .map((c) => `${c}=d.${c}`)
    .join(',');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO pos_receipts (id,${cols.join(',')}) VALUES (?,${placeholders}) AS d
       ON DUPLICATE KEY UPDATE ${updates}`,
      [id, ...vals]
    );
    await conn.query('DELETE FROM pos_receipt_invoice_links WHERE receipt_id = ?', [id]);
    for (const link of invoiceLinks) {
      await conn.query(
        `INSERT INTO pos_receipt_invoice_links (receipt_id, invoice_id, amount_applied) VALUES (?, ?, ?)`,
        [id, link.invoice_id, link.amount_applied]
      );
    }
    await conn.commit();
    const [[row]] = await conn.query('SELECT * FROM pos_receipts WHERE id = ?', [id]);
    let responseLinks = invoiceLinks;
    if (invoiceLinks.length > 0) {
      const ph = invoiceLinks.map(() => '?').join(',');
      const invIds = invoiceLinks.map((x) => x.invoice_id);
      const [invRows] = await conn.query(
        `SELECT id, invoice_number FROM pos_invoices WHERE id IN (${ph})`,
        invIds
      );
      const numById = new Map(
        (invRows || []).map((ir) => [String(ir.id ?? '').trim(), ir.invoice_number])
      );
      responseLinks = invoiceLinks.map((link) => {
        const n = numById.get(String(link.invoice_id).trim());
        const invNum =
          n != null && String(n).trim() !== '' ? String(n).trim() : undefined;
        return {
          ...link,
          ...(invNum ? { invoice_number: invNum } : {}),
        };
      });
    }
    res.json({ ...row, invoice_links: responseLinks });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error(rb);
    }
    console.error(e);
    res.status(500).json({ error: e.message || 'receipt save failed' });
  } finally {
    conn.release();
  }
});

/** Only REF-########… numbers are valid for POS refunds (matches `sp_next_doc_number` + client). */
async function resolvePosRefundNumber(pool, id, rawFromClient) {
  const raw = String(rawFromClient ?? '').trim();
  if (/^REF-[0-9]+$/.test(raw)) return raw;
  const [[row]] = await pool.query('SELECT refund_number FROM pos_refunds WHERE id = ? LIMIT 1', [id]);
  const stored = row ? String(row.refund_number ?? '').trim() : '';
  if (/^REF-[0-9]+$/.test(stored)) return stored;
  return nextDocNumber(pool, 'refund', 'REF-');
}

app.post('/api/pos/refunds', async (req, res) => {
  try {
    const r = req.body;
    const id = r.id || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const refund_number = await resolvePosRefundNumber(pool, id, r.refund_number);
    const cols = [
      'refund_number',
      'invoice_id',
      'invoice_links',
      'receipt_id',
      'customer_id',
      'customer_name',
      'refund_type',
      'status',
      'items',
      'subtotal',
      'tax_amount',
      'total',
      'store_credit_amount',
      'reason',
      'notes',
    ];
    const invoiceLinksVal =
      r.invoice_links == null || r.invoice_links === ''
        ? null
        : typeof r.invoice_links === 'string'
          ? r.invoice_links
          : JSON.stringify(r.invoice_links);
    const vals = [
      refund_number,
      r.invoice_id ?? null,
      invoiceLinksVal,
      r.receipt_id ?? null,
      r.customer_id ?? null,
      r.customer_name ?? '',
      r.refund_type ?? 'cash',
      r.status ?? 'pending',
      typeof r.items === 'string' ? r.items : JSON.stringify(r.items || []),
      r.subtotal ?? 0,
      r.tax_amount ?? 0,
      r.total ?? 0,
      r.store_credit_amount ?? 0,
      r.reason ?? '',
      r.notes ?? '',
    ];
    const placeholders = cols.map(() => '?').join(',');
    const updates = cols.map((c) => `${c}=d.${c}`).join(',');
    await pool.query(
      `INSERT INTO pos_refunds (id,${cols.join(',')}) VALUES (?,${placeholders}) AS d
       ON DUPLICATE KEY UPDATE ${updates}`,
      [id, ...vals]
    );
    const [[row]] = await pool.query('SELECT * FROM pos_refunds WHERE id = ?', [id]);
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/sent-emails', async (req, res) => {
  try {
    const e = req.body;
    const id = e.id || `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO pos_sent_emails (id,recipient_email,recipient_name,subject,html_body,document_type,document_id,document_number,status,sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))`,
      [
        id,
        e.recipient_email ?? '',
        e.recipient_name ?? '',
        e.subject ?? '',
        e.html_body ?? '',
        e.document_type ?? '',
        e.document_id ?? '',
        e.document_number ?? '',
        e.status ?? 'sent',
      ]
    );
    const docType = String(e.document_type || '').toLowerCase();
    const docId = e.document_id != null ? String(e.document_id).trim() : '';
    const st = String(e.status || 'sent').toLowerCase();
    if (docType === 'quote' && docId && (st === 'sent' || st === 'resent')) {
      await pool.query(
        'UPDATE pos_quotes SET email_sent_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [docId]
      );
      // Website Quote Requests table: keep in sync when any quote email is logged (not only Save+Email from request flow).
      await pool.query(
        'UPDATE pos_quote_requests SET email_sent_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE quote_id = ?',
        [docId]
      );
    }
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pos/smtp', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM pos_smtp_settings WHERE id = ?', ['default']);
    res.json(row || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pos/smtp', async (req, res) => {
  try {
    const s = req.body;
    const incomingPwd = String(s.password ?? '').trim();
    let passwordToStore = incomingPwd;
    if (!incomingPwd) {
      const [[row]] = await pool.query('SELECT password FROM pos_smtp_settings WHERE id = ?', [
        'default',
      ]);
      if (row?.password != null && String(row.password).trim() !== '') {
        passwordToStore = row.password;
      }
    }
    await pool.query(
      `INSERT INTO pos_smtp_settings (id,host,port,username,password,from_email,from_name,use_tls,updated_at)
       VALUES ('default',?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE host=VALUES(host),port=VALUES(port),username=VALUES(username),password=VALUES(password),
       from_email=VALUES(from_email),from_name=VALUES(from_name),use_tls=VALUES(use_tls),updated_at=CURRENT_TIMESTAMP(3)`,
      [
        s.host ?? '',
        s.port ?? 587,
        s.username ?? '',
        passwordToStore,
        s.from_email ?? '',
        s.from_name ?? '',
        s.use_tls !== false ? 1 : 0,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeSmtpPayload(s) {
  if (!s || typeof s !== 'object') return s;
  const host = String(s.host ?? '').trim();
  const username = String(s.username ?? '').trim();
  const password = String(s.password ?? '').trim();
  const fromEmail = String(s.from_email ?? '').trim();
  return {
    ...s,
    host,
    username,
    password,
    from_email: fromEmail || username,
    from_name: String(s.from_name ?? '').trim(),
  };
}

/** Human-readable hints for nodemailer / SMTP failures (timeouts, auth, DNS). */
function friendlySmtpSendError(err) {
  const raw = err?.message || String(err);
  const code = err?.code;

  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /timeout|timed out|Connection timeout/i.test(raw)) {
    return `${raw} — SMTP never connected. Fix host/port/provider, or set RESEND_API_KEY on the API host (Render) — HTTPS, no SMTP (see RENDER.md).`;
  }
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(raw)) {
    return `${raw} — Connection refused: wrong host/port, or the provider blocks this source network.`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo|ENOTFOUND/i.test(raw)) {
    return `${raw} — Check SMTP host DNS spelling.`;
  }
  if (/certificate|SSL|TLS|self signed|unable to verify|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(raw)) {
    return `${raw} — TLS issue: try the other port (465 vs 587), or confirm your provider’s required TLS settings.`;
  }
  if (/535|Invalid login|authentication credentials invalid|auth failed|535-/i.test(raw)) {
    return `${raw} — Verify SMTP username (often your full email) and password. Gmail/Google Workspace: use an App Password. Microsoft 365: enable SMTP AUTH for the mailbox if required.`;
  }
  return raw;
}

/** Resend API + SMTP — used for /api/pos/email/send error JSON. */
function friendlyPosEmailSendError(err) {
  const raw = err?.message || String(err);
  if (
    /verify a domain|resend\.com\/domains|only send testing emails|testing emails to your own email/i.test(raw)
  ) {
    return `${raw} — Add your domain at https://resend.com/domains (DNS), then set “From email” in Email Configuration to an address @that domain. Until verified, Resend only allows sending to your account email for tests.`;
  }
  return friendlySmtpSendError(err);
}

/**
 * Send via Resend HTTPS when RESEND_API_KEY is set.
 * Set EMAIL_TRANSPORT=smtp to force nodemailer even if RESEND_API_KEY exists.
 */
function useResendEmail() {
  if (String(process.env.EMAIL_TRANSPORT || '').toLowerCase() === 'smtp') return false;
  return String(process.env.RESEND_API_KEY || '').trim() !== '';
}

async function sendViaResendApi({ smtp, to, subject, htmlBody, attachments }) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  const fromAddr = String(smtp.from_email || '').trim();
  if (!fromAddr) throw new Error('From email is required');
  const from = smtp.from_name ? `"${smtp.from_name}" <${fromAddr}>` : fromAddr;
  const payload = {
    from,
    to: [to],
    subject: subject || '',
    html: htmlBody || '',
  };
  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      filename: String(a.filename || 'document.pdf'),
      content: String(a.contentBase64 || ''),
    }));
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j?.message) msg = j.message;
    } catch {
      /* raw */
    }
    throw new Error(msg || `Resend HTTP ${r.status}`);
  }
}

app.post('/api/pos/email/send', async (req, res) => {
  try {
    const { to, toName, subject, htmlBody, smtp: smtpBody, attachments } = req.body || {};
    let smtp = smtpBody ? normalizeSmtpPayload(smtpBody) : null;
    if (smtp?.host && !smtp.password) {
      const [[row]] = await pool.query('SELECT password FROM pos_smtp_settings WHERE id = ?', [
        'default',
      ]);
      if (row?.password != null && String(row.password).trim() !== '') {
        smtp = { ...smtp, password: String(row.password).trim() };
      }
    }
    if (!smtp?.host) {
      const [[row]] = await pool.query('SELECT * FROM pos_smtp_settings WHERE id = ?', ['default']);
      if (!row) return res.status(400).json({ error: 'SMTP not configured' });
      const allowNoHost = useResendEmail() && String(row.from_email || '').trim() !== '';
      if (!row.host && !allowNoHost) return res.status(400).json({ error: 'SMTP not configured' });
      smtp = normalizeSmtpPayload({
        host: row.host,
        port: row.port,
        username: row.username,
        password: row.password,
        from_email: row.from_email || row.username,
        from_name: row.from_name || '',
        use_tls: row.use_tls !== 0,
      });
    }

    if (useResendEmail()) {
      let fromEmail = String(smtp.from_email || '').trim();
      if (!fromEmail) {
        const [[r2]] = await pool.query(
          'SELECT from_email, from_name FROM pos_smtp_settings WHERE id = ?',
          ['default']
        );
        if (r2?.from_email) {
          smtp = {
            ...smtp,
            from_email: r2.from_email,
            from_name: smtp.from_name || r2.from_name || '',
          };
          fromEmail = String(smtp.from_email || '').trim();
        }
      }
      if (fromEmail) {
        await sendViaResendApi({ smtp, to, subject, htmlBody, attachments });
        return res.json({ success: true });
      }
    }

    if (!String(smtp.host || '').trim()) {
      return res.status(400).json({
        error:
          'SMTP host required, or set RESEND_API_KEY on the API (Render) and save From email — see RENDER.md',
      });
    }

    const port = Number(smtp.port) || 587;
    const connMs = Math.min(
      120_000,
      Math.max(5_000, Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 45_000))
    );
    const sockMs = Math.min(120_000, Math.max(5_000, Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 60_000)));

    const transportOpts = {
      host: smtp.host,
      port,
      secure: port === 465,
      auth: { user: smtp.username, pass: smtp.password },
      requireTLS: smtp.use_tls !== false && port !== 465,
      connectionTimeout: connMs,
      greetingTimeout: connMs,
      socketTimeout: sockMs,
      tls: {
        servername: String(smtp.host).trim(),
      },
    };
    const forceIpv4Socket =
      process.env.SMTP_FORCE_IPV4 === '1' ||
      process.env.SMTP_FORCE_IPV4 === 'true' ||
      (Boolean(process.env.RENDER) && process.env.SMTP_USE_IPV6 !== '1' && process.env.SMTP_USE_IPV6 !== 'true');
    if (forceIpv4Socket) {
      transportOpts.family = 4;
    }

    const transporter = nodemailer.createTransport(transportOpts);

    const mail = {
      from: smtp.from_name
        ? `"${smtp.from_name}" <${smtp.from_email}>`
        : smtp.from_email,
      to: toName ? `"${toName}" <${to}>` : to,
      subject: subject || '',
      html: htmlBody || '',
    };
    if (Array.isArray(attachments) && attachments.length > 0) {
      mail.attachments = attachments.map((a) => ({
        filename: String(a.filename || 'document.pdf'),
        content: Buffer.from(String(a.contentBase64 || ''), 'base64'),
        contentType: a.contentType || 'application/pdf',
      }));
    }
    await transporter.sendMail(mail);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      success: false,
      error: friendlyPosEmailSendError(e) || 'send failed',
    });
  }
});

app.get('/api/pos/customers/:id/history', async (req, res) => {
  try {
    const id = req.params.id;
    const [orders] = await pool.query(
      'SELECT * FROM pos_orders WHERE customer_id = ? ORDER BY created_at DESC',
      [id]
    );
    const [invoices] = await pool.query(
      'SELECT * FROM pos_invoices WHERE customer_id = ? ORDER BY created_at DESC',
      [id]
    );
    const [receipts] = await pool.query(
      'SELECT * FROM pos_receipts WHERE customer_id = ? ORDER BY created_at DESC',
      [id]
    );
    const [quotes] = await pool.query(
      'SELECT * FROM pos_quotes WHERE customer_id = ? ORDER BY created_at DESC',
      [id]
    );
    const [refunds] = await pool.query(
      'SELECT * FROM pos_refunds WHERE customer_id = ? ORDER BY created_at DESC',
      [id]
    );
    let quote_requests = [];
    try {
      const [qrRows] = await pool.query(
        'SELECT * FROM pos_quote_requests WHERE customer_id = ? ORDER BY created_at DESC',
        [id]
      );
      quote_requests = qrRows;
    } catch (e) {
      if (!String(e?.message || e).includes('customer_id')) throw e;
    }
    res.json({ orders, invoices, receipts, quotes, refunds, quote_requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pos/customers/:id/store-credit', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT store_credit FROM pos_customers WHERE id = ?', [
      req.params.id,
    ]);
    res.json({ store_credit: row?.store_credit ?? 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CMS ───

app.get('/api/cms/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cms_categories ORDER BY name');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/categories', async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `INSERT INTO cms_categories (id,slug,name,description,color,icon,product_count,visible,is_custom,updated_at)
       VALUES (?,?,?,?,?,?,0,?,?,CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE slug=VALUES(slug),name=VALUES(name),description=VALUES(description),
       color=VALUES(color),icon=VALUES(icon),visible=VALUES(visible),is_custom=VALUES(is_custom),updated_at=CURRENT_TIMESTAMP(3)`,
      [
        c.id,
        c.slug,
        c.name,
        c.description ?? '',
        c.color ?? '#e31e24',
        c.icon ?? 'Package',
        c.visible !== false ? 1 : 0,
        c.is_custom ? 1 : 0,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cms/categories/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[cat]] = await conn.query('SELECT slug FROM cms_categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ success: false, error: 'not found' });
    const [products] = await conn.query(
      'SELECT id FROM cms_custom_products WHERE category_slug = ?',
      [cat.slug]
    );
    const ids = products.map((p) => p.id);
    await conn.beginTransaction();
    try {
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        await conn.query(`DELETE FROM cms_product_overrides WHERE product_id IN (${ph})`, ids);
        await conn.query(`DELETE FROM cms_custom_products WHERE id IN (${ph})`, ids);
      }
      await conn.query('DELETE FROM cms_categories WHERE id = ?', [req.params.id]);
      await conn.commit();
      res.json({ success: true, deletedProducts: ids.length });
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  } finally {
    conn.release();
  }
});

app.get('/api/cms/custom-products', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cms_custom_products ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/custom-products', async (req, res) => {
  try {
    const p = req.body;
    const cleanFeatures = Array.isArray(p.features) ? p.features : [];
    const cleanSpecs = p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {};
    const cleanDocs = Array.isArray(p.documents) ? p.documents : [];
    const cleanAdd = Array.isArray(p.additionalImages) ? p.additionalImages : [];

    await pool.query(
      `INSERT INTO cms_custom_products (
        id,name,other_names,category,category_slug,brand,price,original_price,rating,reviews,in_stock,is_featured,show_on_website,
        stock_count,badge,badge_color,image,additional_images,description,specs,features,part_number,warranty,weight,dimensions,
        voltage,amperage,phase,power,documents,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),other_names=VALUES(other_names),category=VALUES(category),category_slug=VALUES(category_slug),
        brand=VALUES(brand),price=VALUES(price),original_price=VALUES(original_price),rating=VALUES(rating),reviews=VALUES(reviews),
        in_stock=VALUES(in_stock),is_featured=VALUES(is_featured),show_on_website=VALUES(show_on_website),stock_count=VALUES(stock_count),
        badge=VALUES(badge),badge_color=VALUES(badge_color),image=VALUES(image),additional_images=VALUES(additional_images),
        description=VALUES(description),specs=VALUES(specs),features=VALUES(features),part_number=VALUES(part_number),
        warranty=VALUES(warranty),weight=VALUES(weight),dimensions=VALUES(dimensions),voltage=VALUES(voltage),amperage=VALUES(amperage),
        phase=VALUES(phase),power=VALUES(power),documents=VALUES(documents),updated_at=CURRENT_TIMESTAMP(3)`,
      [
        p.id,
        p.name,
        p.other_names ?? '',
        p.category,
        p.category_slug,
        p.brand,
        p.price ?? 0,
        p.original_price ?? 0,
        p.rating ?? 0,
        p.reviews ?? 0,
        p.in_stock ? 1 : 0,
        p.is_featured ? 1 : 0,
        p.show_on_website !== false ? 1 : 0,
        p.stock_count ?? 0,
        p.badge ?? '',
        p.badge_color ?? '',
        p.image ?? null,
        typeof p.additional_images === 'string' ? p.additional_images : JSON.stringify(cleanAdd),
        p.description ?? '',
        typeof p.specs === 'string' ? p.specs : JSON.stringify(cleanSpecs),
        typeof p.features === 'string' ? p.features : JSON.stringify(cleanFeatures),
        p.part_number ?? '',
        p.warranty ?? '',
        p.weight ?? '',
        p.dimensions ?? '',
        p.voltage ?? '',
        p.amperage ?? '',
        p.phase ?? '',
        p.power ?? '',
        typeof p.documents === 'string' ? p.documents : JSON.stringify(cleanDocs),
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cms/custom-products/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM cms_product_overrides WHERE product_id = ? OR id = ?', [
      req.params.id,
      req.params.id,
    ]);
    await conn.query('DELETE FROM cms_custom_products WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.post('/api/cms/custom-products/batch', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const products = req.body?.products;
    if (!Array.isArray(products)) return res.status(400).json({ error: 'products array required' });
    if (products.length === 0) {
      await conn.query('DELETE FROM cms_custom_products');
      return res.json({ ok: true });
    }
    for (const p of products) {
      const cleanFeatures = Array.isArray(p.features) ? p.features : [];
      const cleanSpecs = p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {};
      const cleanDocs = Array.isArray(p.documents) ? p.documents : [];
      const cleanAdd = Array.isArray(p.additionalImages) ? p.additionalImages : [];
      await conn.query(
        `INSERT INTO cms_custom_products (
          id,name,other_names,category,category_slug,brand,price,original_price,rating,reviews,in_stock,is_featured,show_on_website,
          stock_count,badge,badge_color,image,additional_images,description,specs,features,part_number,warranty,weight,dimensions,
          voltage,amperage,phase,power,documents,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          name=VALUES(name),other_names=VALUES(other_names),category=VALUES(category),category_slug=VALUES(category_slug),
          brand=VALUES(brand),price=VALUES(price),original_price=VALUES(original_price),rating=VALUES(rating),reviews=VALUES(reviews),
          in_stock=VALUES(in_stock),is_featured=VALUES(is_featured),show_on_website=VALUES(show_on_website),stock_count=VALUES(stock_count),
          badge=VALUES(badge),badge_color=VALUES(badge_color),image=VALUES(image),additional_images=VALUES(additional_images),
          description=VALUES(description),specs=VALUES(specs),features=VALUES(features),part_number=VALUES(part_number),
          warranty=VALUES(warranty),weight=VALUES(weight),dimensions=VALUES(dimensions),voltage=VALUES(voltage),amperage=VALUES(amperage),
          phase=VALUES(phase),power=VALUES(power),documents=VALUES(documents),updated_at=CURRENT_TIMESTAMP(3)`,
        [
          p.id,
          p.name,
          p.otherNames ?? p.other_names ?? '',
          p.category,
          p.categorySlug ?? p.category_slug,
          p.brand,
          p.price ?? 0,
          p.originalPrice ?? p.original_price ?? 0,
          p.rating ?? 0,
          p.reviews ?? 0,
          (p.inStock ?? p.in_stock ?? false) ? 1 : 0,
          (p.isFeatured ?? p.is_featured ?? false) ? 1 : 0,
          p.showOnWebsite === false || p.show_on_website === false ? 0 : 1,
          p.stockCount ?? p.stock_count ?? 0,
          p.badge ?? '',
          p.badgeColor ?? p.badge_color ?? '',
          p.image ?? null,
          JSON.stringify(cleanAdd),
          p.description ?? '',
          JSON.stringify(cleanSpecs),
          JSON.stringify(cleanFeatures.map((f) => String(f)).filter(Boolean)),
          p.partNumber ?? p.part_number ?? '',
          p.warranty ?? '',
          p.weight ?? '',
          p.dimensions ?? '',
          p.voltage ?? '',
          p.amperage ?? '',
          p.phase ?? '',
          p.power ?? '',
          JSON.stringify(cleanDocs),
        ]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.get('/api/cms/overrides', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cms_product_overrides');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/overrides', async (req, res) => {
  try {
    const o = req.body;
    const id = o.id || o.product_id;
    await pool.query(
      `INSERT INTO cms_product_overrides (id,product_id,name,price,original_price,image,description,brand,in_stock,is_featured,badge,badge_color,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),name=VALUES(name),price=VALUES(price),original_price=VALUES(original_price),
       image=VALUES(image),description=VALUES(description),brand=VALUES(brand),in_stock=VALUES(in_stock),is_featured=VALUES(is_featured),
       badge=VALUES(badge),badge_color=VALUES(badge_color),updated_at=CURRENT_TIMESTAMP(3)`,
      [
        id,
        o.product_id || id,
        o.name ?? null,
        o.price ?? null,
        o.original_price ?? null,
        o.image ?? null,
        o.description ?? null,
        o.brand ?? null,
        o.in_stock ?? null,
        o.is_featured ?? null,
        o.badge ?? null,
        o.badge_color ?? null,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/cms/overrides/:productId', async (req, res) => {
  try {
    await pool.query('DELETE FROM cms_product_overrides WHERE product_id = ?', [req.params.productId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/overrides/batch', async (req, res) => {
  try {
    const entries = req.body?.overrides;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'overrides array required' });
    if (entries.length === 0) {
      await pool.query('DELETE FROM cms_product_overrides');
      return res.json({ ok: true });
    }
    for (const o of entries) {
      const id = o.id;
      await pool.query(
        `INSERT INTO cms_product_overrides (id,product_id,name,price,original_price,image,description,brand,in_stock,is_featured,badge,badge_color,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),name=VALUES(name),price=VALUES(price),original_price=VALUES(original_price),
         image=VALUES(image),description=VALUES(description),brand=VALUES(brand),in_stock=VALUES(in_stock),is_featured=VALUES(is_featured),
         badge=VALUES(badge),badge_color=VALUES(badge_color),updated_at=CURRENT_TIMESTAMP(3)`,
        [
          id,
          id,
          o.name ?? null,
          o.price ?? null,
          o.originalPrice ?? o.original_price ?? null,
          o.image ?? null,
          o.description ?? null,
          o.brand ?? null,
          o.inStock ?? o.in_stock ?? null,
          o.isFeatured ?? o.is_featured ?? null,
          o.badge ?? null,
          o.badgeColor ?? o.badge_color ?? null,
        ]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/cleanup-orphans', async (_req, res) => {
  try {
    const [r1] = await pool.query(`
      DELETE o FROM cms_product_overrides o
      LEFT JOIN cms_custom_products p ON p.id = o.product_id
      WHERE p.id IS NULL
    `);
    const [r2] = await pool.query(`
      DELETE c FROM cms_custom_products c
      LEFT JOIN cms_categories cat ON cat.slug = c.category_slug
      WHERE cat.id IS NULL
    `);
    res.json({ deleted_orphans: (r2.affectedRows || 0) + (r1.affectedRows || 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function parseConfigStoredValue(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' || typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

app.get('/api/cms/config/:key', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT value FROM cms_config WHERE `key` = ?', [req.params.key]);
    if (!row) return res.json(null);
    res.json(parseConfigStoredValue(row.value));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/config', async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    const str = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    await pool.query(
      'INSERT INTO cms_config (`key`, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=CURRENT_TIMESTAMP(3)',
      [key, str]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cms/version', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT value FROM cms_config WHERE `key` = ?', ['cms_version']);
    const v = parseConfigStoredValue(row?.value);
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10) || 0;
    res.json({ version: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cms/version/bump', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT value FROM cms_config WHERE `key` = ?', ['cms_version']);
    let cur = parseConfigStoredValue(row?.value);
    if (typeof cur !== 'number') cur = parseInt(String(cur ?? '0'), 10) || 0;
    const next = cur + 1;
    await pool.query(
      'INSERT INTO cms_config (`key`, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=CURRENT_TIMESTAMP(3)',
      ['cms_version', JSON.stringify(next)]
    );
    res.json({ version: next });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/cms/custom-products/:id/visibility', async (req, res) => {
  try {
    const show = req.body?.showOnWebsite !== false;
    await pool.query(
      'UPDATE cms_custom_products SET show_on_website = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [show ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/cms/custom-products/:id/stock', async (req, res) => {
  try {
    const n = Number(req.body?.stockCount ?? 0);
    await pool.query(
      'UPDATE cms_custom_products SET stock_count = ?, in_stock = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [n, n > 0 ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload/product-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'no file' });
    const { url } = await saveUploadedFile(req.file, 'products', useBlobs);
    res.json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'upload failed' });
  }
});

app.post('/api/upload/product-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'no file' });
    const { url } = await saveUploadedFile(req.file, 'documents', useBlobs);
    res.json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'upload failed' });
  }
});

  return app;
}
