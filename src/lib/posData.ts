import { apiGet, apiPost, apiPatch, apiDelete, ensureArray } from '@/lib/api';
import { isValidEmailFormatForForms, taxAmountFromSubtotalAndGctPercent } from '@/lib/utils';
import { broadcastPOSChange, broadcastPOSCustomerRelatedTables } from '@/lib/posBroadcast';
import { parseWebsiteQuoteRequestLines, categorySlugForWebsiteLine } from '@/lib/websiteQuoteRequestParse';

/** POS list rows — same as {@link ensureArray}. */
export const asPosRows = ensureArray;

function assertSavedRow(data: unknown, label: string): asserts data is { id: string; items?: unknown } {
  if (data == null || typeof data !== 'object' || !(data as { id?: string }).id) {
    throw new Error(`Invalid ${label} response from server`);
  }
}

type PosLineItemRow = Record<string, unknown>;

function sanitizeItems(items: unknown): PosLineItemRow[] {
  try {
    let arr: unknown = items;
    if (typeof items === 'string') {
      try {
        arr = JSON.parse(items);
      } catch {
        return [];
      }
    } else if (items == null) {
      arr = [];
    }
    if (!Array.isArray(arr)) return [];
    return arr.map((item: unknown) => {
      const row = (item && typeof item === 'object' ? item : {}) as PosLineItemRow;
      return {
        ...row,
        quantity: Number(row.quantity) || 0,
        unit_price: Number(row.unit_price) || 0,
        total: Number(row.total) || 0,
      };
    });
  } catch (e) {
    console.error('sanitizeItems', e);
    return [];
  }
}

export interface POSCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  notes: string;
  /** Credit on account (customer can spend). */
  store_credit: number;
  /** Amount owed (AR); server-maintained sum of balance due on Unpaid + Partially Paid invoices. */
  account_balance?: number;
  created_at: string;
  updated_at: string;
}

export interface POSLineItem {
  product_id: string;
  product_name: string;
  product_image?: string;
  part_number?: string;
  brand?: string;
  category?: string;
  quantity: number;
  unit_price: number;
  total: number;
  /** Default EACH — shown on quotation PDF/email */
  uom?: string;
  /** If omitted, derived from document tax (all taxable when GCT applies) */
  taxable?: boolean;
}

export interface POSQuote {
  id: string;
  quote_number: string;
  customer_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_company: string;
  source: 'walk-in' | 'website';
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'reviewed' | 'printed' | 'emailed' | 'order_generated' | 'invoice_generated_unpaid' | 'invoice_generated_partially_paid' | 'invoice_generated_paid' | 'processed';
  items: POSLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  notes: string;
  valid_until?: string;
  website_request_id?: string;
  order_id?: string | null;
  invoice_id?: string | null;
  /** Set when the quote is emailed to the customer from POS (Save + Email). */
  email_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface POSQuoteRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  category: string;
  product: string;
  quantity: string;
  message: string;
  status: 'new' | 'reviewed' | 'printed' | 'emailed' | 'quoted' | 'closed';
  /** Set server-side when email or phone matches pos_customers. */
  customer_id?: string | null;
  quote_id?: string;
  /** Denormalized from the linked quote when saved (for display / resolve by number). */
  quote_number?: string | null;
  /** Set when the quote was emailed to the customer from POS (Save + Email). */
  email_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface POSOrder {
  id: string;
  order_number: string;
  customer_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_type: 'visitor' | 'registered';
  status:
    | 'pending'
    | 'confirmed'
    | 'processing'
    | 'ready'
    | 'completed'
    | 'cancelled'
    | 'reviewed'
    | 'emailed'
    | 'invoice_generated_unpaid'
    | 'invoice_generated_partially_paid'
    | 'invoice_generated_paid'
    | 'processed';
  items: POSLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  notes: string;
  quote_id?: string | null;
  invoice_id?: string;
  created_at: string;
  updated_at: string;
}

/** Canonical `pos_invoices.status` values (case-sensitive; match MySQL CHECK). */
export const INVOICE_STATUS_UNPAID = 'Unpaid';
export const INVOICE_STATUS_PAID = 'Paid';
export const INVOICE_STATUS_PARTIALLY_PAID = 'Partially Paid';
export const INVOICE_STATUS_REFUNDED = 'Refunded';

export type POSInvoiceStatus =
  | typeof INVOICE_STATUS_UNPAID
  | typeof INVOICE_STATUS_PAID
  | typeof INVOICE_STATUS_PARTIALLY_PAID
  | typeof INVOICE_STATUS_REFUNDED;

export interface POSInvoice {
  id: string;
  invoice_number: string;
  order_id?: string;
  quote_id?: string | null;
  customer_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  status: POSInvoiceStatus;
  payment_method?: string;
  delivery_status: 'pending' | 'ready' | 'delivered';
  items: POSLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  notes: string;
  paid_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export function normalizeInvoiceStatus(raw: string | null | undefined): POSInvoiceStatus {
  const s = String(raw ?? '').trim();
  if (!s) return INVOICE_STATUS_UNPAID;
  const compact = s.toLowerCase().replace(/\s+/g, '_');
  if (compact === 'unpaid' || compact === 'overdue' || compact === 'cancelled') return INVOICE_STATUS_UNPAID;
  if (compact === 'paid') return INVOICE_STATUS_PAID;
  if (compact === 'partially_paid' || compact === 'partial') return INVOICE_STATUS_PARTIALLY_PAID;
  if (compact === 'refunded') return INVOICE_STATUS_REFUNDED;
  if (
    s === INVOICE_STATUS_UNPAID ||
    s === INVOICE_STATUS_PAID ||
    s === INVOICE_STATUS_PARTIALLY_PAID ||
    s === INVOICE_STATUS_REFUNDED
  ) {
    return s;
  }
  return INVOICE_STATUS_UNPAID;
}

export function invoiceIsFullyPaid(inv: POSInvoice | null | undefined): boolean {
  if (!inv) return false;
  const st = normalizeInvoiceStatus(inv.status);
  if (st === INVOICE_STATUS_REFUNDED) return false;
  if (st === INVOICE_STATUS_PAID) return true;
  const total = Number(inv.total) || 0;
  const paid = Number(inv.amount_paid) || 0;
  if (total <= 0) return false;
  return paid >= total - 0.005;
}

/** True when staff can record a refund (paid balance on file and not already fully refunded). */
export function invoiceCanProcessRefund(inv: POSInvoice | null | undefined): boolean {
  if (!inv) return false;
  if (normalizeInvoiceStatus(inv.status) === INVOICE_STATUS_REFUNDED) return false;
  const paid = Number(inv.amount_paid) || 0;
  if (paid <= 0.005) return false;
  const st = normalizeInvoiceStatus(inv.status);
  if (st === INVOICE_STATUS_PAID) return true;
  const total = Number(inv.total) || 0;
  return paid >= total - 0.005;
}

/** Prefer the most recent receipt tied to an invoice for refund audit linkage. */
export function latestReceiptIdForInvoice(
  receipts: POSReceipt[],
  invoiceId: string | null | undefined
): string | undefined {
  if (!invoiceId) return undefined;
  const list = receipts.filter((r) => String(r.invoice_id || '') === String(invoiceId));
  if (list.length === 0) return undefined;
  list.sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  return list[0]?.id;
}

export function invoiceIsOpenBalance(inv: POSInvoice | null | undefined): boolean {
  if (!inv) return false;
  const st = normalizeInvoiceStatus(inv.status);
  return st === INVOICE_STATUS_UNPAID || st === INVOICE_STATUS_PARTIALLY_PAID;
}

/** Applied payment from a receipt toward an invoice (see `pos_receipt_invoice_links`). */
export interface POSReceiptInvoiceLink {
  invoice_id: string;
  amount_applied: number;
}

export interface POSReceipt {
  id: string;
  receipt_number: string;
  invoice_id?: string;
  customer_id?: string;
  customer_name: string;
  payment_method: string;
  status: 'approved' | 'pending_approval';
  payment_type: 'full' | 'partial' | 'overpayment';
  amount_paid: number;
  items: POSLineItem[];
  total: number;
  notes: string;
  created_at: string;
  /** When set, persisted in `pos_receipt_invoice_links` (one receipt can settle multiple invoices). */
  invoice_links?: POSReceiptInvoiceLink[];
}

export interface POSRefund {
  id: string;
  refund_number: string;
  invoice_id?: string;
  receipt_id?: string;
  customer_id?: string;
  customer_name: string;
  refund_type: 'cash' | 'store_credit' | 'exchange';
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  items: POSLineItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  store_credit_amount: number;
  reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface POSSentEmail {
  id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body?: string;
  html_body?: string;
  document_type: string;
  document_id: string;
  document_number: string;
  status: 'sent' | 'failed' | 'resent';
  error_message?: string;
  sent_at: string;
}

export interface POSSmtpSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

export async function generateDocNumber(type: 'quote' | 'order' | 'invoice' | 'receipt' | 'refund'): Promise<string> {
  try {
    const { number } = await apiPost<{ number: string }>('/api/pos/generate-number', { type });
    return number;
  } catch (err) {
    console.error('generateDocNumber:', err);
    const cfg = {
      quote: { prefix: 'QT-' },
      order: { prefix: 'OR-' },
      invoice: { prefix: 'INV-' },
      receipt: { prefix: 'RT-' },
      refund: { prefix: 'REF-' },
    }[type];
    return `${cfg.prefix}${String(Date.now()).slice(-7).padStart(7, '0')}`;
  }
}

export async function fetchCustomers(): Promise<POSCustomer[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/customers');
    return asPosRows<POSCustomer>(data).map((r) => ({
      ...r,
      store_credit: Number(r.store_credit) || 0,
      account_balance: Number(r.account_balance) || 0,
    }));
  } catch (e) {
    console.error('fetchCustomers:', e);
    return [];
  }
}

/**
 * Combine duplicate walk-in rows named "Visitor" or "Guest" (case-insensitive) into one row each.
 * Canonical row = lowest id. Map: canonical id → all merged ids (for history/delete).
 */
export function mergePlaceholderCustomerRows(customers: POSCustomer[]): {
  displayCustomers: POSCustomer[];
  mergedPlaceholderIdsByCanonicalId: Map<string, string[]>;
} {
  const list = Array.isArray(customers) ? customers : [];
  const mergedPlaceholderIdsByCanonicalId = new Map<string, string[]>();
  const visitor: POSCustomer[] = [];
  const guest: POSCustomer[] = [];
  const rest: POSCustomer[] = [];
  for (const c of list) {
    const k = String(c.name || '').trim().toLowerCase();
    if (k === 'visitor') visitor.push(c);
    else if (k === 'guest') guest.push(c);
    else rest.push(c);
  }
  const uniqJoin = (vals: (string | undefined)[], sep: string) =>
    [...new Set(vals.map((v) => String(v || '').trim()).filter(Boolean))].join(sep);
  const mergeGroup = (group: POSCustomer[]): POSCustomer | null => {
    if (group.length === 0) return null;
    if (group.length === 1) return group[0];
    group.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const primary = group[0];
    mergedPlaceholderIdsByCanonicalId.set(
      primary.id,
      group.map((v) => v.id)
    );
    return {
      ...primary,
      store_credit: group.reduce((s, v) => s + (Number(v.store_credit) || 0), 0),
      account_balance: group.reduce((s, v) => s + (Number(v.account_balance) || 0), 0),
      email: uniqJoin(group.map((v) => v.email), ' · ') || primary.email || '',
      phone: uniqJoin(group.map((v) => v.phone), ' · ') || primary.phone || '',
      company: uniqJoin(group.map((v) => v.company), ' · ') || primary.company || '',
      address: uniqJoin(group.map((v) => v.address), ' · ') || primary.address || '',
      notes: uniqJoin(group.map((v) => v.notes), ' · ') || primary.notes || '',
    };
  };
  const mergedRows: POSCustomer[] = [];
  const mv = mergeGroup(visitor);
  const mg = mergeGroup(guest);
  if (mv) mergedRows.push(mv);
  if (mg) mergedRows.push(mg);
  const displayCustomers = [...rest, ...mergedRows].sort((a, b) => {
    const an = String(a.name || '').toLowerCase();
    const bn = String(b.name || '').toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return String(a.id).localeCompare(String(b.id));
  });
  return { displayCustomers, mergedPlaceholderIdsByCanonicalId };
}

export async function saveCustomer(c: Partial<POSCustomer>): Promise<POSCustomer | null> {
  try {
    const body: Record<string, unknown> = {
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      address: c.address || '',
      notes: c.notes || '',
      store_credit: c.store_credit != null ? Number(c.store_credit) || 0 : 0,
    };
    if (c.id && String(c.id).trim() !== '') body.id = c.id;
    const row = await apiPost<POSCustomer>('/api/pos/customers', body);
    /** Server propagates denormalized name/email/phone/company to linked POS rows; refresh all affected lists. */
    broadcastPOSCustomerRelatedTables();
    return {
      ...row,
      store_credit: Number(row.store_credit) || 0,
      account_balance: Number(row.account_balance) || 0,
    };
  } catch (e) {
    console.error('saveCustomer:', e);
    return null;
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
  try {
    await apiDelete(`/api/pos/customers/${encodeURIComponent(id)}`);
    broadcastPOSChange('pos_customers');
    return true;
  } catch {
    return false;
  }
}

export async function updateCustomerStoreCredit(id: string, amount: number): Promise<boolean> {
  try {
    await apiPatch(`/api/pos/customers/${encodeURIComponent(id)}/store-credit`, { amount });
    broadcastPOSChange('pos_customers');
    return true;
  } catch {
    return false;
  }
}

/**
 * Subtract store credit after a checkout (reads current balance from the server, then sets the new absolute).
 * Avoids relying on stale client copies of {@link POSCustomer.store_credit}.
 */
export async function deductCustomerStoreCredit(customerId: string, deductAmount: number): Promise<number | null> {
  if (!customerId?.trim() || !Number.isFinite(deductAmount) || deductAmount <= 0) return null;
  try {
    const data = await apiPost<{ ok?: boolean; store_credit: number }>(
      `/api/pos/customers/${encodeURIComponent(customerId)}/deduct-store-credit`,
      { amount: deductAmount }
    );
    broadcastPOSChange('pos_customers');
    const next = Number(data?.store_credit);
    return Number.isFinite(next) ? next : null;
  } catch (e) {
    console.error('deductCustomerStoreCredit:', e);
    return null;
  }
}

/** Add store credit (e.g. checkout overpayment); increments existing balance. */
export async function addCustomerStoreCredit(customerId: string, addAmount: number): Promise<number | null> {
  if (!customerId?.trim() || !Number.isFinite(addAmount) || addAmount <= 0) return null;
  try {
    const data = await apiPost<{ ok?: boolean; store_credit: number }>(
      `/api/pos/customers/${encodeURIComponent(customerId)}/add-store-credit`,
      { amount: addAmount }
    );
    broadcastPOSChange('pos_customers');
    const next = Number(data?.store_credit);
    return Number.isFinite(next) ? next : null;
  } catch (e) {
    console.error('addCustomerStoreCredit:', e);
    return null;
  }
}

export async function fetchQuoteRequests(): Promise<POSQuoteRequest[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/quote-requests');
    return asPosRows<POSQuoteRequest>(data);
  } catch (e) {
    console.error('fetchQuoteRequests:', e);
    return [];
  }
}

/** When false, skips pushing this save to linked quote/order/invoice/quote-request rows (avoids loops and duplicate work during checkout). */
export type POSSaveOptions = {
  syncLinked?: boolean;
  /**
   * When true, do not promote quote status from `reviewed` to `order_generated` when `order_id` is set.
   * Used for Save & Checkout before checkout completes so list status stays unchanged until checkout runs.
   */
  skipOrderGeneratedPromotion?: boolean;
};

function buildQuoteRequestProductSummary(items: POSLineItem[], fallbackProduct: string): string {
  const fb = (fallbackProduct || '').trim();
  if (!items.length) return fb;
  if (items.length === 1) return items[0].product_name;
  const head = items.slice(0, 3).map((i) => i.product_name);
  const more = items.length > 3 ? ` (+${items.length - 3} more)` : '';
  return `${head.join('; ')}${more}`;
}

function commercialFromQuote(q: POSQuote) {
  return {
    customer_id: q.customer_id || null,
    customer_name: q.customer_name || '',
    customer_email: q.customer_email || '',
    customer_phone: q.customer_phone || '',
    items: q.items || [],
    subtotal: Number(q.subtotal) || 0,
    tax_rate: Number(q.tax_rate) || 0,
    tax_amount: Number(q.tax_amount) || 0,
    discount_amount: Number(q.discount_amount) || 0,
    total: Number(q.total) || 0,
    notes: q.notes || '',
  };
}

function commercialFromOrder(o: POSOrder) {
  return {
    customer_id: o.customer_id || null,
    customer_name: o.customer_name || '',
    customer_email: o.customer_email || '',
    customer_phone: o.customer_phone || '',
    items: o.items || [],
    subtotal: Number(o.subtotal) || 0,
    tax_rate: Number(o.tax_rate) || 0,
    tax_amount: Number(o.tax_amount) || 0,
    discount_amount: Number(o.discount_amount) || 0,
    total: Number(o.total) || 0,
    notes: o.notes || '',
  };
}

function commercialFromInvoice(inv: POSInvoice) {
  return {
    customer_id: inv.customer_id || null,
    customer_name: inv.customer_name || '',
    customer_email: inv.customer_email || '',
    customer_phone: inv.customer_phone || '',
    items: inv.items || [],
    subtotal: Number(inv.subtotal) || 0,
    tax_rate: Number(inv.tax_rate) || 0,
    tax_amount: Number(inv.tax_amount) || 0,
    discount_amount: Number(inv.discount_amount) || 0,
    total: Number(inv.total) || 0,
    notes: inv.notes || '',
  };
}

/** Align linked quote/order list status with invoice payment state. */
export function linkedDocStatusFromInvoice(inv: POSInvoice): string | undefined {
  const s = normalizeInvoiceStatus(inv.status);
  if (s === INVOICE_STATUS_PAID) return 'invoice_generated_paid';
  if (s === INVOICE_STATUS_PARTIALLY_PAID) return 'invoice_generated_partially_paid';
  if (s === INVOICE_STATUS_UNPAID) return 'invoice_generated_unpaid';
  return undefined;
}

/** Keep website quote request status aligned with the saved POS quote (Save / Save & Print / Save & Email vs pipeline). */
function mergeQuoteRequestStatusFromQuote(qr: POSQuoteRequest, saved: POSQuote): string {
  if (qr.status === 'closed') return 'closed';
  const s = String(saved.status || '');
  /** Quote was emailed from POS — drives request row to `emailed` (not pipeline `quoted`). */
  if (s === 'emailed' || saved.email_sent_at) {
    return 'emailed';
  }
  if (s === 'reviewed' || s === 'printed') return s;
  if (
    s === 'order_generated' ||
    s.startsWith('invoice_generated') ||
    s === 'processed'
  )
    return 'quoted';
  return 'quoted';
}

async function syncLinkedFromSavedQuote(saved: POSQuote): Promise<void> {
  const wid = saved.website_request_id;
  if (wid) {
    const qrs = await fetchQuoteRequests();
    const qr = qrs.find((x) => x.id === wid);
    if (qr) {
      const qtyTotal = (saved.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const quantityOut =
        qtyTotal > 0 ? String(qtyTotal) : String((qr.quantity ?? '').toString().trim() || '');
      const syncRes = await saveQuoteRequest(
        {
          ...qr,
          name: saved.customer_name,
          email: saved.customer_email,
          phone: saved.customer_phone,
          company: saved.customer_company,
          category: (saved.items[0]?.category || qr.category || '').trim(),
          product: buildQuoteRequestProductSummary(saved.items, qr.product || ''),
          quantity: quantityOut,
          message: saved.notes || '',
          status: mergeQuoteRequestStatusFromQuote(qr, saved),
          quote_id: saved.id,
          quote_number: saved.quote_number ?? null,
        },
        { syncLinked: false }
      );
      if (!syncRes.ok) console.warn('saveQuoteRequest (sync from quote)', syncRes.error);
    }
  }

  const oid = (saved as POSQuote & { order_id?: string | null }).order_id;
  if (oid) {
    const orders = await fetchOrders();
    const o = orders.find((x) => x.id === oid);
    if (o) {
      await saveOrder(
        {
          ...o,
          ...commercialFromQuote(saved),
          customer_type: saved.customer_id ? 'registered' : 'visitor',
          order_number: o.order_number,
          quote_id: o.quote_id ?? saved.id,
          invoice_id: o.invoice_id,
          status: o.status,
        },
        { syncLinked: false }
      );
    }
  }

  const iid = (saved as POSQuote & { invoice_id?: string | null }).invoice_id;
  if (iid) {
    const invs = await fetchInvoices();
    const inv = invs.find((x) => x.id === iid);
    if (inv) {
      await saveInvoice(
        {
          ...inv,
          ...commercialFromQuote(saved),
          invoice_number: inv.invoice_number,
          order_id: inv.order_id,
          quote_id: inv.quote_id ?? saved.id,
          status: inv.status,
          payment_method: inv.payment_method,
          delivery_status: inv.delivery_status,
          amount_paid: inv.amount_paid,
          paid_at: inv.paid_at,
          delivered_at: inv.delivered_at,
        },
        { syncLinked: false }
      );
    }
  }
}

async function syncLinkedFromSavedOrder(saved: POSOrder): Promise<void> {
  const comm = commercialFromOrder(saved);
  const qid = (saved as POSOrder & { quote_id?: string | null }).quote_id;
  if (qid) {
    const quotes = await fetchQuotes();
    const q = quotes.find((x) => x.id === qid);
    if (q) {
      const qExt = q as POSQuote & { invoice_id?: string | null };
      const effectiveInvId = saved.invoice_id || qExt.invoice_id;
      let quoteStatus = q.status;
      if (effectiveInvId) {
        const invs = await fetchInvoices();
        const inv = invs.find((x) => x.id === effectiveInvId);
        const fromInv = inv ? linkedDocStatusFromInvoice(inv) : undefined;
        quoteStatus = fromInv ?? q.status;
      } else {
        quoteStatus = 'order_generated';
      }
      await saveQuote(
        {
          ...q,
          ...comm,
          customer_company: q.customer_company,
          quote_number: q.quote_number,
          source: q.source,
          status: quoteStatus,
          valid_until: q.valid_until,
          website_request_id: q.website_request_id,
          order_id: q.order_id ?? saved.id,
          invoice_id: effectiveInvId || null,
          email_sent_at: q.email_sent_at ?? null,
        },
        { syncLinked: false }
      );
    }
  }

  const iid = saved.invoice_id;
  if (iid) {
    const invs = await fetchInvoices();
    const inv = invs.find((x) => x.id === iid);
    if (inv) {
      await saveInvoice(
        {
          ...inv,
          ...comm,
          invoice_number: inv.invoice_number,
          order_id: inv.order_id ?? saved.id,
          quote_id: inv.quote_id,
          status: inv.status,
          payment_method: inv.payment_method,
          delivery_status: inv.delivery_status,
          amount_paid: inv.amount_paid,
          paid_at: inv.paid_at,
          delivered_at: inv.delivered_at,
        },
        { syncLinked: false }
      );
    }
  }
}

async function syncLinkedFromSavedInvoice(saved: POSInvoice): Promise<void> {
  const comm = commercialFromInvoice(saved);
  const oid = saved.order_id;
  if (oid) {
    const orders = await fetchOrders();
    const o = orders.find((x) => x.id === oid);
    if (o) {
      await saveOrder(
        {
          ...o,
          ...comm,
          customer_type: saved.customer_id ? 'registered' : 'visitor',
          order_number: o.order_number,
          quote_id: o.quote_id,
          invoice_id: o.invoice_id ?? saved.id,
          status: linkedDocStatusFromInvoice(saved) ?? o.status,
        },
        { syncLinked: false }
      );
    }
  }

  const qid = (saved as POSInvoice & { quote_id?: string | null }).quote_id;
  if (qid) {
    const quotes = await fetchQuotes();
    const q = quotes.find((x) => x.id === qid);
    if (q) {
      await saveQuote(
        {
          ...q,
          ...comm,
          customer_company: q.customer_company,
          quote_number: q.quote_number,
          source: q.source,
          status: linkedDocStatusFromInvoice(saved) ?? q.status,
          valid_until: q.valid_until,
          website_request_id: q.website_request_id,
          order_id: q.order_id ?? oid ?? null,
          invoice_id: (q as POSQuote & { invoice_id?: string | null }).invoice_id ?? saved.id,
          email_sent_at: q.email_sent_at ?? null,
        },
        { syncLinked: false }
      );
    }
  }
}

/**
 * Push saved invoice lines, totals, customer fields, and payment-linked status to linked order + quote.
 * Call after batch saves that used `{ syncLinked: false }` (e.g. POS checkout).
 */
export async function propagateInvoiceToLinkedRecords(invoice: POSInvoice): Promise<void> {
  await syncLinkedFromSavedInvoice(invoice);
}

async function syncLinkedFromSavedQuoteRequest(qr: POSQuoteRequest): Promise<void> {
  if (!qr.quote_id) return;
  const quotes = await fetchQuotes();
  const q = quotes.find((x) => x.id === qr.quote_id);
  if (!q) return;
  await saveQuote(
    {
      ...q,
      customer_id: qr.customer_id ?? q.customer_id ?? null,
      customer_name: qr.name || q.customer_name,
      customer_email: qr.email || q.customer_email,
      customer_phone: qr.phone || q.customer_phone,
      customer_company: qr.company || q.customer_company,
      notes: (qr.message ?? '').trim() !== '' ? (qr.message || '') : q.notes,
    },
    { syncLinked: true }
  );
}

/**
 * Website quote form: whether the email matches an existing CRM customer (`pos_customers`).
 * Returns null if the address is invalid or the request fails.
 */
export async function checkCustomerEmailExistsForQuoteForm(email: string): Promise<boolean | null> {
  const em = email.trim();
  if (!isValidEmailFormatForForms(em)) return null;
  try {
    const r = await apiGet<{ exists?: boolean }>(
      `/api/public/customers/email-exists?email=${encodeURIComponent(em)}`
    );
    return !!r?.exists;
  } catch {
    return null;
  }
}

export type SaveQuoteRequestResult = { ok: true } | { ok: false; error: string };

export async function saveQuoteRequest(
  qr: Partial<POSQuoteRequest>,
  opts?: POSSaveOptions
): Promise<SaveQuoteRequestResult> {
  const resolvedId = qr.id || `qr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  try {
    await apiPost('/api/pos/quote-requests', {
      id: resolvedId,
      name: qr.name || '',
      email: qr.email || '',
      phone: qr.phone || '',
      company: qr.company || '',
      category: qr.category || '',
      product: qr.product || '',
      quantity: qr.quantity || '',
      message: qr.message || '',
      status: qr.status || 'new',
      quote_id: qr.quote_id || null,
      quote_number: qr.quote_number ?? null,
    });
    broadcastPOSChange('pos_quote_requests');
    if (opts?.syncLinked !== false && qr.quote_id) {
      const list = await fetchQuoteRequests();
      const fresh = list.find((x) => x.id === resolvedId);
      if (fresh?.quote_id) await syncLinkedFromSavedQuoteRequest(fresh);
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error && e.message.trim() ? e.message : 'Could not submit quote request. Please try again.';
    console.error('saveQuoteRequest', e);
    return { ok: false, error: msg };
  }
}

export async function updateQuoteRequestStatus(
  id: string,
  status: string,
  quoteId?: string,
  quoteNumber?: string | null
): Promise<boolean> {
  try {
    await apiPatch(`/api/pos/quote-requests/${encodeURIComponent(id)}`, {
      status,
      quote_id: quoteId !== undefined ? quoteId : undefined,
      quote_number: quoteNumber !== undefined ? quoteNumber : undefined,
    });
    broadcastPOSChange('pos_quote_requests');
    return true;
  } catch {
    return false;
  }
}

/** Call after Save + Email succeeds for a quote created from a website quote request. */
export async function markQuoteRequestEmailSent(id: string): Promise<boolean> {
  try {
    await apiPatch(`/api/pos/quote-requests/${encodeURIComponent(id)}`, {
      status: 'emailed',
      mark_email_sent: true,
    });
    broadcastPOSChange('pos_quote_requests');
    return true;
  } catch {
    return false;
  }
}

export async function fetchQuotes(): Promise<POSQuote[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/quotes');
    return asPosRows<any>(data).map((r) => ({
      ...r,
      items: sanitizeItems(r.items),
      subtotal: Number(r.subtotal) || 0, tax_rate: Number(r.tax_rate) || 0, tax_amount: Number(r.tax_amount) || 0,
      discount_amount: Number(r.discount_amount) || 0, total: Number(r.total) || 0,
    }));
  } catch (e) {
    console.error('fetchQuotes:', e);
    return [];
  }
}

export async function saveQuote(q: Partial<POSQuote>, opts?: POSSaveOptions): Promise<POSQuote> {
  const oid = (q as Partial<POSQuote> & { order_id?: string | null }).order_id;
  const iid = (q as Partial<POSQuote> & { invoice_id?: string | null }).invoice_id;
  const noInvoice = !iid || (typeof iid === 'string' && iid.trim() === '');
  let statusOut = q.status || 'reviewed';
  if (
    !opts?.skipOrderGeneratedPromotion &&
    oid &&
    noInvoice &&
    statusOut === 'reviewed'
  ) {
    statusOut = 'order_generated';
  }
  const data = await apiPost<any>('/api/pos/quotes', {
    id: q.id || `q-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    quote_number: q.quote_number || '',
    customer_id: q.customer_id || null,
    customer_name: q.customer_name || '',
    customer_email: q.customer_email || '',
    customer_phone: q.customer_phone || '',
    customer_company: q.customer_company || '',
    source: q.source || 'walk-in',
    status: statusOut,
    items: q.items || [],
    subtotal: q.subtotal || 0, tax_rate: q.tax_rate || 0, tax_amount: q.tax_amount || 0,
    discount_amount: q.discount_amount || 0, total: q.total || 0,
    notes: q.notes || '', valid_until: q.valid_until || null,
    website_request_id: q.website_request_id || null,
    order_id: (q as any).order_id || null,
    invoice_id: (q as any).invoice_id || null,
    email_sent_at: q.email_sent_at ?? null,
  });
  assertSavedRow(data, 'quote');
  broadcastPOSChange('pos_quotes');
  const out = { ...data, items: sanitizeItems(data.items) };
  if (opts?.syncLinked !== false) {
    try {
      await syncLinkedFromSavedQuote(out);
    } catch (e) {
      console.error('syncLinkedFromSavedQuote', e);
    }
  }
  return out;
}

export async function fetchOrders(): Promise<POSOrder[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/orders');
    return asPosRows<any>(data).map((r) => ({
      ...r,
      items: sanitizeItems(r.items),
      subtotal: Number(r.subtotal) || 0, tax_rate: Number(r.tax_rate) || 0, tax_amount: Number(r.tax_amount) || 0,
      discount_amount: Number(r.discount_amount) || 0, total: Number(r.total) || 0,
    }));
  } catch (e) {
    console.error('fetchOrders:', e);
    return [];
  }
}

export async function saveOrder(o: Partial<POSOrder>, opts?: POSSaveOptions): Promise<POSOrder> {
  const data = await apiPost<any>('/api/pos/orders', {
    id: o.id || `o-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    order_number: o.order_number || '',
    customer_id: o.customer_id || null,
    customer_name: o.customer_name || '',
    customer_email: o.customer_email || '',
    customer_phone: o.customer_phone || '',
    customer_type: o.customer_type || 'visitor',
    status: o.status || 'reviewed',
    items: o.items || [],
    subtotal: o.subtotal || 0, tax_rate: o.tax_rate || 0, tax_amount: o.tax_amount || 0,
    discount_amount: o.discount_amount || 0, total: o.total || 0,
    notes: o.notes || '', invoice_id: o.invoice_id || null,
    quote_id: (o as any).quote_id || null,
  });
  assertSavedRow(data, 'order');
  broadcastPOSChange('pos_orders');
  const out = { ...data, items: sanitizeItems(data.items) };
  if (opts?.syncLinked !== false) {
    try {
      await syncLinkedFromSavedOrder(out);
    } catch (e) {
      console.error('syncLinkedFromSavedOrder', e);
    }
  }
  return out;
}

export async function fetchInvoices(): Promise<POSInvoice[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/invoices');
    const rows = asPosRows<any>(data);
    return rows
      .map((r) => {
        try {
          return {
            ...r,
            status: normalizeInvoiceStatus(r?.status),
            items: sanitizeItems(r?.items),
            subtotal: Number(r.subtotal) || 0,
            tax_rate: Number(r.tax_rate) || 0,
            tax_amount: Number(r.tax_amount) || 0,
            discount_amount: Number(r.discount_amount) || 0,
            total: Number(r.total) || 0,
            amount_paid: Number(r.amount_paid) || 0,
          } as POSInvoice;
        } catch (rowErr) {
          console.error('fetchInvoices row', r?.id, rowErr);
          return null;
        }
      })
      .filter((x): x is POSInvoice => x != null);
  } catch (e) {
    console.error('fetchInvoices:', e);
    return [];
  }
}

function nMoney(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function saveInvoice(inv: Partial<POSInvoice>, opts?: POSSaveOptions): Promise<POSInvoice> {
  const data = await apiPost<any>('/api/pos/invoices', {
    id: inv.id || `inv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    invoice_number: inv.invoice_number || '',
    order_id: inv.order_id || null,
    quote_id: (inv as any).quote_id || null,
    customer_id: inv.customer_id || null,
    customer_name: inv.customer_name || '',
    customer_email: inv.customer_email || '',
    customer_phone: inv.customer_phone || '',
    status: inv.status ? normalizeInvoiceStatus(String(inv.status)) : INVOICE_STATUS_UNPAID,
    payment_method: inv.payment_method || null,
    delivery_status: inv.delivery_status || 'pending',
    items: inv.items || [],
    subtotal: nMoney(inv.subtotal),
    tax_rate: nMoney(inv.tax_rate),
    tax_amount: nMoney(inv.tax_amount),
    discount_amount: nMoney(inv.discount_amount),
    total: nMoney(inv.total),
    amount_paid: nMoney(inv.amount_paid),
    notes: inv.notes || '',
    paid_at: inv.paid_at || null, delivered_at: inv.delivered_at || null,
  });
  assertSavedRow(data, 'invoice');
  broadcastPOSChange('pos_invoices');
  const out = { ...data, items: sanitizeItems(data.items), status: normalizeInvoiceStatus(data.status) };
  if (opts?.syncLinked !== false) {
    try {
      await syncLinkedFromSavedInvoice(out);
    } catch (e) {
      console.error('syncLinkedFromSavedInvoice', e);
    }
  }
  return out;
}

function normalizeReceiptInvoiceLinks(raw: unknown): POSReceiptInvoiceLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => {
      const row = l && typeof l === 'object' ? (l as Record<string, unknown>) : {};
      const inv = row.invoice_id != null ? String(row.invoice_id).trim() : '';
      if (!inv) return null;
      return { invoice_id: inv, amount_applied: Number(row.amount_applied) || 0 };
    })
    .filter((x): x is POSReceiptInvoiceLink => x != null);
}

export async function fetchReceipts(): Promise<POSReceipt[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/receipts');
    return asPosRows<any>(data).map((r) => ({
      ...r,
      items: sanitizeItems(r.items),
      amount_paid: Number(r.amount_paid) || 0,
      total: Number(r.total) || 0,
      invoice_links: normalizeReceiptInvoiceLinks(r.invoice_links),
    }));
  } catch (e) {
    console.error('fetchReceipts:', e);
    return [];
  }
}

export async function saveReceipt(rec: Partial<POSReceipt>): Promise<POSReceipt | null> {
  try {
    const payload: Record<string, unknown> = {
      id: rec.id || `rec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      receipt_number: rec.receipt_number || '',
      invoice_id: rec.invoice_id || null,
      customer_id: rec.customer_id || null,
      customer_name: rec.customer_name || '',
      payment_method: rec.payment_method || '',
      status: rec.status || 'approved',
      payment_type: rec.payment_type || 'full',
      amount_paid: rec.amount_paid || 0,
      items: rec.items || [],
      total: rec.total || 0,
      notes: rec.notes || '',
      created_at:
        rec.created_at || new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 23),
    };
    if (rec.invoice_links && rec.invoice_links.length > 0) {
      payload.invoice_links = rec.invoice_links.map((l) => ({
        invoice_id: l.invoice_id,
        amount_applied: Number(l.amount_applied) || 0,
      }));
    }
    const data = await apiPost<any>('/api/pos/receipts', payload);
    broadcastPOSChange('pos_receipts');
    return {
      ...data,
      items: sanitizeItems(data.items),
      invoice_links: normalizeReceiptInvoiceLinks(data.invoice_links),
    };
  } catch (e) {
    console.error('saveReceipt:', e);
    return null;
  }
}

export async function fetchRefunds(): Promise<POSRefund[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/refunds');
    return asPosRows<any>(data).map((r) => ({
      ...r,
      items: sanitizeItems(r.items),
      subtotal: Number(r.subtotal) || 0, tax_amount: Number(r.tax_amount) || 0, total: Number(r.total) || 0,
      store_credit_amount: Number(r.store_credit_amount) || 0,
    }));
  } catch (e) {
    console.error('fetchRefunds:', e);
    return [];
  }
}

export async function saveRefund(ref: Partial<POSRefund>): Promise<POSRefund | null> {
  try {
    const data = await apiPost<any>('/api/pos/refunds', {
      id: ref.id || `ref-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      refund_number: ref.refund_number || '',
      invoice_id: ref.invoice_id || null,
      receipt_id: ref.receipt_id || null,
      customer_id: ref.customer_id || null,
      customer_name: ref.customer_name || '',
      refund_type: ref.refund_type || 'cash',
      status: ref.status || 'pending',
      items: ref.items || [],
      subtotal: ref.subtotal || 0, tax_amount: ref.tax_amount || 0, total: ref.total || 0,
      store_credit_amount: ref.store_credit_amount || 0,
      reason: ref.reason || '', notes: ref.notes || '',
    });
    broadcastPOSChange('pos_refunds');
    return { ...data, items: sanitizeItems(data.items) };
  } catch (e) {
    console.error('saveRefund:', e);
    return null;
  }
}

export async function fetchSentEmails(): Promise<POSSentEmail[]> {
  try {
    const data = await apiGet<unknown>('/api/pos/sent-emails');
    return asPosRows<POSSentEmail>(data);
  } catch (err) {
    console.error('fetchSentEmails:', err);
    return [];
  }
}

export async function sendEmail(params: {
  to: string; toName?: string; subject: string; htmlBody: string;
  documentType?: string; documentId?: string; documentNumber?: string;
  /** PDF (or other) attachments — base64 body, e.g. from `buildDocumentPdfBase64`. */
  attachments?: { filename: string; contentBase64: string; contentType?: string }[];
  /** When set (e.g. test email from the form), use these credentials instead of re-fetching from the DB. */
  smtpFromForm?: POSSmtpSettings | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let smtpRow: POSSmtpSettings | null = params.smtpFromForm
      ? { ...params.smtpFromForm }
      : await fetchSmtpSettings();

    if (!smtpRow?.host || !smtpRow.username) {
      return {
        success: false,
        error: 'SMTP host and username are required. Fill in the form and/or save settings.',
      };
    }

    // Form may omit password after page load; merge saved password for send.
    if (!smtpRow.password) {
      const saved = await fetchSmtpSettings();
      if (saved?.password) {
        smtpRow = { ...smtpRow, password: saved.password };
      }
    }
    if (!smtpRow.password) {
      return {
        success: false,
        error: 'SMTP password is missing. Enter your password/API key and save settings (or enter it before Send Test).',
      };
    }

    const smtp = {
      host: String(smtpRow.host || '').trim(),
      port: smtpRow.port || 587,
      username: String(smtpRow.username || '').trim(),
      password: String(smtpRow.password || '').trim(),
      from_email: String(smtpRow.from_email || '').trim() || String(smtpRow.username || '').trim(),
      from_name: String(smtpRow.from_name || '').trim(),
      use_tls: smtpRow.use_tls !== false,
    };

    const data = await apiPost<{ success?: boolean; error?: string }>('/api/pos/email/send', {
      to: params.to,
      toName: params.toName || '',
      subject: params.subject,
      htmlBody: params.htmlBody,
      smtp,
      attachments: params.attachments,
    });

    if (!data || data.success === false || data.error) {
      return { success: false, error: data?.error || 'Email sending failed' };
    }

    try {
      await apiPost('/api/pos/sent-emails', {
        id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        recipient_email: params.to,
        recipient_name: params.toName || '',
        subject: params.subject,
        html_body: params.htmlBody,
        document_type: params.documentType || '',
        document_id: params.documentId || '',
        document_number: params.documentNumber || '',
        status: 'sent',
      });
      broadcastPOSChange('pos_sent_emails');
    } catch (logErr) {
      console.error('Failed to log sent email:', logErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error('sendEmail error:', err);
    let msg = err.message || 'Unknown error sending email';
    try {
      const j = JSON.parse(msg);
      if (j?.error) msg = j.error;
      else if (j?.success === false && typeof j.message === 'string') msg = j.message;
    } catch {
      const m = msg.match(/\{[\s\S]*"error"\s*:\s*"([^"]+)"/);
      if (m) msg = m[1];
    }
    return { success: false, error: msg };
  }
}

export async function fetchSmtpSettings(): Promise<POSSmtpSettings | null> {
  try {
    const data = await apiGet<any>('/api/pos/smtp');
    if (!data) return null;
    return {
      host: data.host || '',
      port: data.port || 587,
      username: data.username || '',
      password: data.password || '',
      from_email: data.from_email || '',
      from_name: data.from_name || '',
      use_tls: data.use_tls !== 0 && data.use_tls !== false,
    };
  } catch (err) {
    console.error('fetchSmtpSettings:', err);
    return null;
  }
}

export async function saveSmtpSettings(settings: POSSmtpSettings): Promise<boolean> {
  try {
    await apiPost('/api/pos/smtp', {
      host: settings.host,
      port: settings.port,
      username: settings.username,
      password: settings.password,
      from_email: settings.from_email,
      from_name: settings.from_name,
      use_tls: settings.use_tls !== false,
    });
    return true;
  } catch (err) {
    console.error('saveSmtpSettings:', err);
    return false;
  }
}

export async function createOrderFromQuote(quote: POSQuote): Promise<POSOrder | null> {
  try {
    const quotesFresh = await fetchQuotes();
    const q = quotesFresh.find((x) => x.id === quote.id) || quote;
    const ext = q as POSQuote & { order_id?: string | null };
    if (ext.order_id) {
      const orders = await fetchOrders();
      return orders.find((o) => o.id === ext.order_id) ?? null;
    }
    const orderNumber = await generateDocNumber('order');
    const order = await saveOrder(
      {
        order_number: orderNumber,
        quote_id: q.id,
        customer_id: q.customer_id,
        customer_name: q.customer_name,
        customer_email: q.customer_email,
        customer_phone: q.customer_phone,
        customer_type: q.customer_id ? 'registered' : 'visitor',
        items: q.items,
        subtotal: q.subtotal,
        tax_rate: q.tax_rate,
        tax_amount: q.tax_amount,
        discount_amount: q.discount_amount,
        total: q.total,
        notes: q.notes || '',
        status: 'reviewed',
      },
      { syncLinked: false }
    );
    await saveQuote(
      {
        ...q,
        order_id: order.id,
        status: 'order_generated',
      },
      { syncLinked: true }
    );
    return order;
  } catch (e) {
    console.error('createOrderFromQuote', e);
    return null;
  }
}

/** Minimal quote from a website request when staff converts without an existing quote (one line per website product row). */
export async function createStubQuoteFromWebsiteRequest(qr: POSQuoteRequest): Promise<POSQuote | null> {
  try {
    const quoteNumber = await generateDocNumber('quote');
    const parsed = parseWebsiteQuoteRequestLines(qr.product || '', qr.quantity || '');
    const items: POSLineItem[] =
      parsed.length > 0
        ? parsed.map((ln, idx) => ({
            product_id: `website-request-${idx}`,
            product_name: ln.name,
            quantity: ln.qty,
            unit_price: 0,
            total: 0,
            category: categorySlugForWebsiteLine(qr.category || '', idx) || undefined,
          }))
        : [
            {
              product_id: 'website-request',
              product_name: (qr.product || '').trim() || 'Requested product',
              quantity: Math.max(
                1,
                Math.floor(Number(String(qr.quantity ?? '').replace(/[^\d.]/g, ''))) || 1
              ),
              unit_price: 0,
              total: 0,
              category: (qr.category || '').trim() || undefined,
            },
          ];
    const quote = await saveQuote(
      {
        quote_number: quoteNumber,
        customer_id: qr.customer_id || undefined,
        customer_name: qr.name || '',
        customer_email: qr.email || '',
        customer_phone: qr.phone || '',
        customer_company: qr.company || '',
        source: 'website',
        status: 'reviewed',
        website_request_id: qr.id,
        items,
        subtotal: 0,
        tax_rate: 0,
        tax_amount: 0,
        discount_amount: 0,
        total: 0,
        notes: (qr.message || '').trim(),
      },
      { syncLinked: true }
    );
    const saveRes = await saveQuoteRequest(
      {
        id: qr.id,
        name: qr.name || '',
        email: qr.email || '',
        phone: qr.phone || '',
        company: qr.company || '',
        category: qr.category || '',
        product: qr.product || '',
        quantity: qr.quantity || '',
        message: qr.message || '',
        status: 'reviewed',
        quote_id: quote.id,
        quote_number: quote.quote_number,
      },
      { syncLinked: false }
    );
    return saveRes.ok ? quote : null;
  } catch (e) {
    console.error('createStubQuoteFromWebsiteRequest', e);
    return null;
  }
}

export async function createOrderFromWebsiteQuoteRequest(
  qr: POSQuoteRequest,
  linkedQuote: POSQuote | null | undefined
): Promise<POSOrder | null> {
  let q = linkedQuote ?? null;
  if (!q) {
    q = await createStubQuoteFromWebsiteRequest(qr);
    if (!q) return null;
  }
  if ((q as POSQuote & { invoice_id?: string | null }).invoice_id) return null;
  return createOrderFromQuote(q);
}

/** Ensures an order exists, then creates an invoice and links quote + order (quote_id on invoice). */
export async function createInvoiceFromQuote(quote: POSQuote): Promise<POSInvoice | null> {
  try {
    const quotesFresh = await fetchQuotes();
    const q = quotesFresh.find((x) => x.id === quote.id) || quote;
    const ext = q as POSQuote & { order_id?: string | null; invoice_id?: string | null };
    if (ext.invoice_id) return null;

    let order: POSOrder | null = null;
    if (ext.order_id) {
      const orders = await fetchOrders();
      order = orders.find((o) => o.id === ext.order_id) || null;
    }
    if (!order) {
      order = await createOrderFromQuote(q);
    }
    if (!order || order.invoice_id) return null;
    return convertOrderToInvoice(order);
  } catch (e) {
    console.error('createInvoiceFromQuote', e);
    return null;
  }
}

export async function createInvoiceFromWebsiteQuoteRequest(
  qr: POSQuoteRequest,
  linkedQuote: POSQuote | null | undefined
): Promise<POSInvoice | null> {
  let q = linkedQuote ?? null;
  if (!q) {
    q = await createStubQuoteFromWebsiteRequest(qr);
    if (!q) return null;
  }
  return createInvoiceFromQuote(q);
}

export async function convertOrderToInvoice(order: POSOrder): Promise<POSInvoice | null> {
  if (order.invoice_id) return null;
  const quoteId = (order as POSOrder & { quote_id?: string | null }).quote_id || null;
  const invoiceNumber = await generateDocNumber('invoice');
  const invoice = await saveInvoice(
    {
      invoice_number: invoiceNumber,
      order_id: order.id,
      quote_id: quoteId || undefined,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      status: INVOICE_STATUS_UNPAID,
      delivery_status: 'pending',
      items: order.items,
      subtotal: order.subtotal,
      tax_rate: order.tax_rate,
      tax_amount: order.tax_amount,
      discount_amount: order.discount_amount,
      total: order.total,
      notes: order.notes,
    },
    { syncLinked: false }
  );
  await saveOrder(
    { ...order, invoice_id: invoice.id, status: 'invoice_generated_unpaid' },
    { syncLinked: false }
  );
  if (quoteId) {
    const quotes = await fetchQuotes();
    const q = quotes.find((x) => x.id === quoteId);
    if (q) {
      await saveQuote(
        {
          ...q,
          order_id: order.id,
          invoice_id: invoice.id,
          status: 'invoice_generated_unpaid',
        },
        { syncLinked: true }
      );
    }
  }
  return invoice;
}

export async function markInvoicePaidAndDelivered(
  invoice: POSInvoice,
  paymentMethod: string
): Promise<{ invoice: POSInvoice | null; receipt: POSReceipt | null }> {
  const now = new Date().toISOString();
  const updatedInvoice = await saveInvoice({
    ...invoice,
    status: INVOICE_STATUS_PAID,
    payment_method: paymentMethod,
    delivery_status: 'delivered',
    amount_paid: invoice.total,
    paid_at: now,
    delivered_at: now,
  });
  const receiptNumber = await generateDocNumber('receipt');
  const receipt = await saveReceipt({
    receipt_number: receiptNumber,
    invoice_id: invoice.id,
    customer_id: invoice.customer_id,
    customer_name: invoice.customer_name,
    payment_method: paymentMethod,
    status: 'approved',
    payment_type: 'full',
    amount_paid: invoice.total,
    items: invoice.items,
    total: invoice.total,
    invoice_links: [{ invoice_id: invoice.id, amount_applied: invoice.total }],
  });
  return { invoice: updatedInvoice, receipt };
}

export async function processRefund(params: {
  invoice: POSInvoice;
  items: POSLineItem[];
  refundType: 'cash' | 'store_credit' | 'exchange';
  reason: string;
  notes: string;
  /** Optional: receipt row this refund was initiated from (audit trail). */
  receiptId?: string | null;
}): Promise<POSRefund | null> {
  const { invoice, items, refundType, reason, notes, receiptId } = params;
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmount =
    invoice.tax_rate > 0 ? taxAmountFromSubtotalAndGctPercent(subtotal, invoice.tax_rate) : 0;
  const total = subtotal + taxAmount;
  const paidBefore = Number(invoice.amount_paid) || 0;
  if (total > paidBefore + 0.02) {
    console.error('processRefund: refund total exceeds amount paid', { total, paidBefore });
    return null;
  }
  const refundNumber = await generateDocNumber('refund');
  const refund = await saveRefund({
    refund_number: refundNumber,
    invoice_id: invoice.id,
    receipt_id: receiptId || null,
    customer_id: invoice.customer_id,
    customer_name: invoice.customer_name,
    refund_type: refundType,
    status: 'completed',
    items,
    subtotal,
    tax_amount: taxAmount,
    total,
    store_credit_amount: refundType === 'store_credit' ? total : 0,
    reason,
    notes,
  });
  if (refund && refundType === 'store_credit' && invoice.customer_id) {
    const { store_credit } = await apiGet<{ store_credit: number }>(
      `/api/pos/customers/${encodeURIComponent(invoice.customer_id)}/store-credit`
    );
    await updateCustomerStoreCredit(invoice.customer_id, Number(store_credit || 0) + total);
  }
  if (refund) {
    const paidAfter = Math.max(0, paidBefore - total);
    const newStatus =
      paidAfter < 0.01 ? INVOICE_STATUS_REFUNDED : INVOICE_STATUS_PAID;
    await saveInvoice({
      ...invoice,
      status: newStatus,
      amount_paid: paidAfter,
    });
  }
  return refund;
}

/** Merge history from multiple CRM customer ids (e.g. duplicate "Visitor" rows). Dedupes by document id. */
export async function fetchMergedCustomerHistory(customerIds: string[]) {
  const uniq = [...new Set(customerIds.map(String).filter(Boolean))];
  if (uniq.length === 0) {
    return {
      orders: [] as any[],
      invoices: [] as any[],
      receipts: [] as any[],
      quotes: [] as any[],
      refunds: [] as any[],
      quote_requests: [] as any[],
    };
  }
  if (uniq.length === 1) return fetchCustomerHistory(uniq[0]);
  const results = await Promise.all(uniq.map((id) => fetchCustomerHistory(id)));
  const mergeById = (arrays: any[][]) => {
    const byId = new Map<string, any>();
    for (const arr of arrays) {
      for (const x of arr || []) {
        if (x?.id != null) byId.set(String(x.id), x);
      }
    }
    return Array.from(byId.values());
  };
  return {
    orders: mergeById(results.map((r) => r.orders)),
    invoices: mergeById(results.map((r) => r.invoices)),
    receipts: mergeById(results.map((r) => r.receipts)),
    quotes: mergeById(results.map((r) => r.quotes)),
    refunds: mergeById(results.map((r) => r.refunds)),
    quote_requests: mergeById(results.map((r) => r.quote_requests || [])),
  };
}

export async function fetchCustomerHistory(customerId: string) {
  let data: {
    orders: any[];
    invoices: any[];
    receipts: any[];
    quotes: any[];
    refunds: any[];
    quote_requests?: any[];
  };
  try {
    data = await apiGet(`/api/pos/customers/${encodeURIComponent(customerId)}/history`);
  } catch (e) {
    console.error('fetchCustomerHistory:', e);
    return { orders: [], invoices: [], receipts: [], quotes: [], refunds: [], quote_requests: [] };
  }

  const numericDoc = (r: any) => ({
    ...r,
    items: sanitizeItems(r.items),
    subtotal: Number(r.subtotal) || 0,
    tax_rate: Number(r.tax_rate) || 0,
    tax_amount: Number(r.tax_amount) || 0,
    discount_amount: Number(r.discount_amount) || 0,
    total: Number(r.total) || 0,
    amount_paid: Number(r.amount_paid) || 0,
    store_credit_amount: Number(r.store_credit_amount) || 0,
  });

  return {
    orders: (data.orders || []).map(numericDoc),
    invoices: (data.invoices || []).map(numericDoc),
    receipts: (data.receipts || []).map(numericDoc),
    quotes: (data.quotes || []).map(numericDoc),
    refunds: (data.refunds || []).map(numericDoc),
    quote_requests: data.quote_requests || [],
  };
}
