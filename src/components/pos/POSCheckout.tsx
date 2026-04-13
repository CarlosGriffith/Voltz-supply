import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Search, CheckCircle2, Wallet, CreditCard, Building2, Package, Plus, Minus, Trash2, User, FileText, ShoppingCart, Receipt, ArrowLeft, Info,
} from 'lucide-react';
import { Product } from '@/data/products';
import { fetchCustomProducts, fetchProductOverrides, fetchConfig, updateProductStockCount } from '@/lib/cmsData';
import { productNameToCode } from '@/lib/barcodeGenerator';
import { useSyncSelectedCustomerFromList } from '@/hooks/usePOSRealtime';
import {
  POSCustomer,
  POSInvoice,
  POSLineItem,
  POSOrder,
  POSQuote,
  POSReceipt,
  fetchCustomers,
  fetchInvoices,
  fetchOrders,
  fetchQuotes,
  generateDocNumber,
  saveInvoice,
  saveOrder,
  saveReceipt,
  saveCustomer,
  propagateInvoiceToLinkedRecords,
  deductCustomerStoreCredit,
  addCustomerStoreCredit,
  sendEmail,
  invoiceIsFullyPaid,
  invoiceIsOpenBalance,
  INVOICE_STATUS_UNPAID,
  INVOICE_STATUS_PAID,
  INVOICE_STATUS_PARTIALLY_PAID,
} from '@/lib/posData';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { useCMSNotification } from '@/contexts/CMSNotificationContext';
import { loadContactDetails } from '@/contexts/CMSContext';
import {
  decimalInputToNumber,
  DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS,
  fmtCurrency,
  digitsFromPhoneInput,
  formatPhoneUsMask,
  displayUsPhoneFromStored,
  findCustomerByEmailOrPhone,
  isValidEmailFormatForForms,
  POS_DEFAULT_VISITOR_CUSTOMER_NAME,
  hasIdentityForPartialOrOverpayment,
  gctPercentForCalculation,
  taxAmountFromSubtotalAndGctPercent,
  roundForGctCalculation,
  RECEIPT_FULL_PAYMENT_TOLERANCE_CENTS,
  cn,
} from '@/lib/utils';
import type { PrintDocProps } from '@/components/pos/posPrintTypes';
import { generateEmailHTML } from '@/components/pos/POSPrintTemplate';
import { buildQuotationDocumentHtml, buildQuotationPreviewSrcDoc } from './quotationHtml';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { POS_PAGE_MAX, POS_QUICK_SEARCH_INPUT, POS_SEARCH_CARD, POS_SURFACE_RAISED } from '@/components/pos/posPageChrome';

type SourceType = 'quote' | 'order' | 'invoice';

interface POSCheckoutProps {
  source?: { sourceType: SourceType; sourceDocId: string } | null;
  onDone: () => void;
  onBack?: () => void;
  /** Called after store credit is applied so the host (e.g. CMS) can refresh the customer list from the server. */
  onCustomersRefresh?: () => void | Promise<void>;
}

const fmtMoney = (n: number) => `$${fmtCurrency(n)}`;

/** Default % widths for Items table columns (include, product, doc no., qty, price, total, remove). Must sum to 100. */
const POS_ITEMS_TABLE_COL_DEFAULTS: readonly number[] = [4, 34, 14, 15, 12, 13, 8];

const POS_CHECKOUT_WHERE = 'POS → Checkout';

const TENDER_METHODS = ['cash', 'card', 'bank_transfer', 'cheque'] as const;
type TenderMethod = (typeof TENDER_METHODS)[number];

const TENDER_METHOD_ORDER: Record<TenderMethod, number> = {
  cash: 0,
  card: 1,
  bank_transfer: 2,
  cheque: 3,
};

function tenderMethodLabel(m: TenderMethod): string {
  if (m === 'bank_transfer') return 'Bank transfer';
  if (m === 'cheque') return 'Cheque';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function sortTenderMethods(methods: TenderMethod[]): TenderMethod[] {
  return [...methods].sort((a, b) => TENDER_METHOD_ORDER[a] - TENDER_METHOD_ORDER[b]);
}

/** Stored on `pos_receipts.payment_type`. */
type ReceiptPaymentType = 'full' | 'partial' | 'overpayment';

/**
 * Auto-derived string for `pos_receipts.payment_method` from tender lines + store credit.
 */
function buildSuggestedReceiptPaymentMethodLabel(params: {
  tenderTotal: number;
  allowMultiplePaymentMethods: boolean;
  tenderMethodsMulti: TenderMethod[];
  paymentMethod: TenderMethod;
  creditApplied: number;
}): string {
  const { tenderTotal, allowMultiplePaymentMethods, tenderMethodsMulti, paymentMethod, creditApplied } = params;
  const labels: string[] = [];
  if (tenderTotal > 0) {
    if (allowMultiplePaymentMethods && tenderMethodsMulti.length > 1) {
      for (const m of sortTenderMethods(tenderMethodsMulti)) {
        labels.push(tenderMethodLabel(m));
      }
    } else if (allowMultiplePaymentMethods && tenderMethodsMulti.length === 1) {
      labels.push(tenderMethodLabel(tenderMethodsMulti[0]));
    } else {
      labels.push(tenderMethodLabel(paymentMethod));
    }
  }
  if (creditApplied > 0) {
    labels.push('Store Credit');
  }
  if (labels.length === 0) {
    return tenderMethodLabel(paymentMethod);
  }
  return labels.join(', ');
}

/** MySQL DECIMAL columns often arrive as strings; never use + with those raw values. */
function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Whole cents — avoids float drift on dollar comparisons. */
function moneyToCents(x: unknown): number {
  return Math.round(num(x) * 100);
}

/** Underpay, overpay, or cash when nothing is due — all need identifiable customer per business rules. Uses cents + ±$1 band (same idea as receipt full payment). */
function isCheckoutPartialOrOverpayment(dueAfterCredit: number, effectivePayment: number): boolean {
  const dueC = moneyToCents(dueAfterCredit);
  const payC = moneyToCents(effectivePayment);
  const band = RECEIPT_FULL_PAYMENT_TOLERANCE_CENTS;
  if (dueC <= 0 && payC <= 0) return false;
  if (dueC <= 0 && payC > 0) return true;
  if (Math.abs(payC - dueC) <= band) return false;
  if (payC < dueC - band) return true;
  if (payC > dueC + band) return true;
  return false;
}

/**
 * Balance still owed on an invoice **before** this checkout session’s payment is applied.
 * After persist, `inv.amount_paid` includes this session; `allocationThisSession` is that slice.
 */
function balanceDueBeforePaymentCents(inv: POSInvoice, allocationThisSession: number): number {
  const totalC = moneyToCents(inv.total);
  const paidAfterC = moneyToCents(inv.amount_paid);
  const allocC = moneyToCents(allocationThisSession);
  const priorPaidC = Math.max(0, paidAfterC - allocC);
  return Math.max(0, totalC - priorPaidC);
}

/**
 * Receipt `payment_type`: compare cash + store credit applied to the **sum of balances left** on the
 * invoice(s) before this payment (full / partial / overpayment). "Full" uses a ±$1 band vs exact equality
 * ({@link RECEIPT_FULL_PAYMENT_TOLERANCE_CENTS}).
 */
function receiptPaymentTypeFromReceivedVsCombinedBalanceCents(
  amountReceivedCents: number,
  combinedBalanceDueBeforePaymentCents: number
): ReceiptPaymentType {
  const tol = RECEIPT_FULL_PAYMENT_TOLERANCE_CENTS;
  if (amountReceivedCents > combinedBalanceDueBeforePaymentCents + tol) return 'overpayment';
  if (amountReceivedCents + tol < combinedBalanceDueBeforePaymentCents) return 'partial';
  return 'full';
}

function normalizeLineItem(i: POSLineItem): POSLineItem {
  const q = Number(i.quantity) || 0;
  const u = Number(i.unit_price) || 0;
  return {
    ...i,
    quantity: q,
    unit_price: u,
    total: q * u,
  };
}

/** Checkout-only: which document (quote/order/invoice #) a line came from — stripped before save. */
type CheckoutLineItem = POSLineItem & {
  /** Document number(s) only — never includes the "New" tag; that comes from checkoutDirectQty. */
  checkoutDocLabel?: string;
  /** Per–doc-number quantity for document-backed units (excludes {@link checkoutDirectQty}). */
  checkoutDocAllocations?: { label: string; qty: number }[];
  /** Units added via product search (shown as "New"). When reducing qty, New is consumed first, then document-backed. */
  checkoutDirectQty?: number;
  /** When false, line is excluded from subtotal/tax/total and from persisted invoice/order lines. */
  includeInTotal?: boolean;
};

const LINE_ITEMS_UNDO_MAX = 50;

function cloneCheckoutLineItem(item: CheckoutLineItem): CheckoutLineItem {
  const alloc = item.checkoutDocAllocations?.map((a) => ({ ...a }));
  return {
    ...item,
    checkoutDocAllocations: alloc,
  };
}

function cloneCheckoutLineItems(items: CheckoutLineItem[]): CheckoutLineItem[] {
  return items.map(cloneCheckoutLineItem);
}

/** Strip legacy/display tags from a merged doc label string. */
function stripDocLabelSuffix(label?: string): string | undefined {
  if (!label || label === 'Direct' || label === 'New') return undefined;
  const parts = label
    .split(' · ')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter(
      (p) =>
        p !== 'Direct' &&
        p !== 'New' &&
        !/^New\s*\(/i.test(p) &&
        !/^New\s*:\s*/i.test(p)
    );
  return parts.length ? parts.join(' · ') : undefined;
}

function docBackedQty(item: CheckoutLineItem): number {
  return Math.max(0, (Number(item.quantity) || 0) - (item.checkoutDirectQty ?? 0));
}

function splitDocLabelParts(label?: string): string[] {
  if (!label?.trim()) return [];
  return label
    .split(' · ')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Split integer `total` across `n` parts as evenly as possible. */
function integerSplitTotal(total: number, n: number): number[] {
  if (n <= 0) return [];
  const t = Math.max(0, Math.floor(total));
  const base = Math.floor(t / n);
  const rem = t - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function fallbackAllocationsFromLabel(item: CheckoutLineItem, docBack: number): { label: string; qty: number }[] {
  const parts = splitDocLabelParts(stripDocLabelSuffix(item.checkoutDocLabel));
  if (parts.length === 0 || docBack <= 0) return [];
  if (parts.length === 1) return [{ label: parts[0], qty: docBack }];
  const chunks = integerSplitTotal(docBack, parts.length);
  return parts.map((label, i) => ({ label, qty: chunks[i] ?? 0 })).filter((x) => x.qty > 0);
}

/** Quantities to combine when merging two lines (document-backed units only). */
function allocationsForMerge(item: CheckoutLineItem): { label: string; qty: number }[] {
  const db = docBackedQty(item);
  if (db <= 0) return [];
  const raw = item.checkoutDocAllocations;
  if (raw && raw.length > 0) {
    const sum = raw.reduce((s, a) => s + Math.max(0, Math.floor(Number(a.qty) || 0)), 0);
    if (sum <= 0) return fallbackAllocationsFromLabel(item, db);
    const scale = db / sum;
    return raw
      .map((a) => ({
        label: a.label,
        qty: Math.max(0, Math.round(Math.floor(Number(a.qty) || 0) * scale)),
      }))
      .filter((x) => x.qty > 0);
  }
  return fallbackAllocationsFromLabel(item, db);
}

function mergeDocAllocations(
  a: { label: string; qty: number }[],
  b: { label: string; qty: number }[]
): { label: string; qty: number }[] {
  const m = new Map<string, number>();
  for (const x of a) m.set(x.label, (m.get(x.label) || 0) + x.qty);
  for (const x of b) m.set(x.label, (m.get(x.label) || 0) + x.qty);
  return Array.from(m.entries())
    .map(([label, qty]) => ({ label, qty }))
    .filter((x) => x.qty > 0);
}

/** Display + tooltip: allocations aligned to current doc-backed qty. */
function resolvedDocAllocationsForDisplay(item: CheckoutLineItem): { label: string; qty: number }[] {
  const db = docBackedQty(item);
  if (db <= 0) return [];
  const raw = item.checkoutDocAllocations;
  if (raw && raw.length > 0) {
    const sum = raw.reduce((s, a) => s + Math.max(0, Math.floor(Number(a.qty) || 0)), 0);
    if (sum <= 0) return fallbackAllocationsFromLabel(item, db);
    if (sum === db) {
      return raw.map((a) => ({ label: a.label, qty: Math.floor(Number(a.qty) || 0) })).filter((x) => x.qty > 0);
    }
    const scale = db / sum;
    const scaled = raw.map((a) => ({
      label: a.label,
      qty: Math.max(0, Math.round(Math.floor(Number(a.qty) || 0) * scale)),
    }));
    const s = scaled.reduce((x, a) => x + a.qty, 0);
    if (scaled.length && s !== db) scaled[0] = { ...scaled[0], qty: scaled[0].qty + (db - s) };
    return scaled.filter((x) => x.qty > 0);
  }
  return fallbackAllocationsFromLabel(item, db);
}

function normalizeCheckoutLineItem(i: CheckoutLineItem): CheckoutLineItem {
  const base = normalizeLineItem(i);
  let lab = stripDocLabelSuffix(i.checkoutDocLabel);
  let dq = i.checkoutDirectQty;

  if (dq === undefined) {
    const raw = i.checkoutDocLabel;
    if (raw === 'Direct' || raw === 'New') {
      dq = base.quantity;
      lab = undefined;
    } else if (
      raw &&
      raw.split(' · ').some((p) => {
        const t = p.trim();
        return t === 'Direct' || t === 'New' || /^New\s*[:(]/i.test(t);
      })
    ) {
      dq = 1;
      lab = stripDocLabelSuffix(raw);
    } else {
      dq = 0;
    }
  }
  dq = Math.max(0, Math.min(dq ?? 0, base.quantity));
  return {
    ...base,
    checkoutDocLabel: lab,
    checkoutDocAllocations: i.checkoutDocAllocations,
    checkoutDirectQty: dq,
    includeInTotal: i.includeInTotal !== false,
  };
}

/** Document column tooltip / full label: doc number(s) plus "New" or "New: n" when search-added units exist. */
function checkoutDocColumnLabel(item: CheckoutLineItem): string {
  const dq = item.checkoutDirectQty ?? 0;
  const db = docBackedQty(item);
  const allocs = resolvedDocAllocationsForDisplay(item);
  const newTag = dq > 0 ? `New: ${dq}` : '';
  if (allocs.length > 0) {
    const docPart =
      allocs.length === 1
        ? allocs[0].label
        : allocs.map((a) => `${a.label}: ${a.qty}`).join(' · ');
    return dq > 0 ? `${docPart} · ${newTag}` : docPart;
  }
  const base = item.checkoutDocLabel?.trim();
  if (dq > 0) {
    if (db > 0 && base) return `${base} · ${newTag}`;
    return newTag;
  }
  return base ?? '—';
}

/** Doc No. column: stack "DOC: qty" per source when multiple docs; keep New on its own line when present. */
function CheckoutDocumentColumnCell({ item }: { item: CheckoutLineItem }) {
  const dq = item.checkoutDirectQty ?? 0;
  const allocs = resolvedDocAllocationsForDisplay(item);
  const title = checkoutDocColumnLabel(item);

  const docStack =
    allocs.length > 0 ? (
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
        {allocs.map((a) => (
          <span
            key={a.label}
            className="text-[11px] font-medium leading-snug text-[#1a2332] tabular-nums [overflow-wrap:anywhere]"
          >
            {allocs.length === 1 ? a.label : `${a.label}: ${a.qty}`}
          </span>
        ))}
      </div>
    ) : null;

  if (dq > 0 && allocs.length > 0) {
    return (
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-left" title={title}>
        {docStack}
        <span className="text-[11px] font-medium leading-tight text-[#1a2332] tabular-nums">New: {dq}</span>
      </div>
    );
  }

  if (dq > 0 && allocs.length === 0) {
    return (
      <p className="text-[11px] font-medium leading-tight text-left text-[#1a2332] tabular-nums" title={title}>
        New: {dq}
      </p>
    );
  }

  if (allocs.length > 1) {
    return (
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-left" title={title}>
        {docStack}
      </div>
    );
  }

  if (allocs.length === 1) {
    return (
      <p
        className="text-[11px] font-medium leading-snug text-left text-[#1a2332] tabular-nums [overflow-wrap:anywhere]"
        title={title}
      >
        {allocs[0].label}
      </p>
    );
  }

  const base = item.checkoutDocLabel?.trim();
  return (
    <p className="text-[11px] font-medium leading-tight text-left text-[#1a2332] truncate" title={title}>
      {base ?? '—'}
    </p>
  );
}

/**
 * Quantity changes: always take from New-added units first, then document. Decreases strip search-added
 * units before touching document-backed qty (so the New line drops when you’re back to the doc amount).
 * Increases add to the New portion.
 */
function adjustCheckoutLineQuantity(item: CheckoutLineItem, newQty: number): CheckoutLineItem {
  const cur = normalizeCheckoutLineItem(item);
  if (!Number.isFinite(newQty) || newQty < 0) return cur;
  if (newQty === 0) {
    return {
      ...cur,
      quantity: 0,
      total: 0,
      checkoutDirectQty: 0,
      checkoutDocAllocations: undefined,
      checkoutDocLabel: undefined,
    };
  }
  const oldQ = cur.quantity;
  let dq = cur.checkoutDirectQty ?? 0;
  if (newQty < oldQ) {
    const remove = oldQ - newQty;
    dq -= Math.min(remove, dq);
  } else if (newQty > oldQ) {
    dq += newQty - oldQ;
  }
  dq = Math.max(0, Math.min(dq, newQty));
  const newDocBack = newQty - dq;
  const oldDocBack = docBackedQty(cur);

  if (newDocBack <= 0) {
    return {
      ...cur,
      quantity: newQty,
      total: newQty * cur.unit_price,
      checkoutDirectQty: dq,
      checkoutDocAllocations: undefined,
      checkoutDocLabel: undefined,
    };
  }

  let nextAlloc: { label: string; qty: number }[] | undefined;
  if (oldDocBack <= 0) {
    nextAlloc = fallbackAllocationsFromLabel(cur, newDocBack);
    if (nextAlloc.length === 0) nextAlloc = undefined;
  } else {
    const merged = allocationsForMerge(cur);
    const sum = merged.reduce((s, a) => s + a.qty, 0);
    if (merged.length === 0) {
      nextAlloc = fallbackAllocationsFromLabel(cur, newDocBack);
      if (nextAlloc.length === 0) nextAlloc = undefined;
    } else if (sum === newDocBack) {
      nextAlloc = merged;
    } else {
      const scale = newDocBack / sum;
      const scaled = merged.map((a) => ({
        label: a.label,
        qty: Math.max(0, Math.round(Math.floor(a.qty) * scale)),
      }));
      const s = scaled.reduce((x, a) => x + a.qty, 0);
      if (scaled.length && s !== newDocBack) scaled[0] = { ...scaled[0], qty: scaled[0].qty + (newDocBack - s) };
      nextAlloc = scaled.filter((x) => x.qty > 0);
    }
  }

  const nextLabel =
    nextAlloc && nextAlloc.length > 0
      ? nextAlloc.map((a) => a.label).join(' · ')
      : stripDocLabelSuffix(cur.checkoutDocLabel);

  return {
    ...cur,
    quantity: newQty,
    total: newQty * cur.unit_price,
    checkoutDirectQty: dq,
    checkoutDocAllocations: nextAlloc,
    checkoutDocLabel: nextLabel,
  };
}

function mergeDocLabels(a?: string, b?: string): string | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return Array.from(new Set([a, b])).join(' · ');
}

function mergeCheckoutLineItems(prev: CheckoutLineItem[], incoming: CheckoutLineItem[]): CheckoutLineItem[] {
  const out = [...prev];
  for (const inc of incoming) {
    const n = normalizeCheckoutLineItem(inc);
    const idx = out.findIndex((x) => x.product_id === n.product_id);
    if (idx >= 0) {
      const cur = normalizeCheckoutLineItem(out[idx]);
      const q = cur.quantity + n.quantity;
      const mergedDirect = (cur.checkoutDirectQty ?? 0) + (n.checkoutDirectQty ?? 0);
      const mergedLabel = mergeDocLabels(cur.checkoutDocLabel, n.checkoutDocLabel);
      let mergedAlloc = mergeDocAllocations(allocationsForMerge(cur), allocationsForMerge(n));
      const docBackMerged = q - mergedDirect;
      if (docBackMerged > 0 && mergedAlloc.length === 0) {
        mergedAlloc =
          fallbackAllocationsFromLabel(
            { ...cur, quantity: q, checkoutDirectQty: mergedDirect, checkoutDocLabel: mergedLabel },
            docBackMerged
          );
      }
      const labelOut =
        mergedAlloc.length > 0 ? mergedAlloc.map((a) => a.label).join(' · ') : mergedLabel;
      const mergedInclude =
        cur.includeInTotal !== false && n.includeInTotal !== false;
      out[idx] = {
        ...cur,
        quantity: q,
        total: q * cur.unit_price,
        checkoutDocLabel: labelOut,
        checkoutDocAllocations: mergedAlloc.length > 0 ? mergedAlloc : undefined,
        checkoutDirectQty: mergedDirect,
        includeInTotal: mergedInclude,
      };
    } else {
      out.push(n);
    }
  }
  return out;
}

type CheckoutStreamSpec = {
  key: string;
  source: { sourceType: SourceType; sourceDocId: string } | null;
  lines: CheckoutLineItem[];
};

function normDocToken(s: string) {
  return s.trim().toLowerCase();
}

function resolveLabelToStreamKey(
  label: string,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): string {
  const n = normDocToken(label);
  const q = quotes.find((x) => normDocToken(String(x.quote_number || '')) === n);
  if (q) return `quote:${q.id}`;
  const o = orders.find((x) => normDocToken(String(x.order_number || '')) === n);
  if (o) return `order:${o.id}`;
  const inv = invoices.find((x) => normDocToken(String(x.invoice_number || '')) === n);
  if (inv) return `invoice:${inv.id}`;
  return 'direct';
}

function checkoutLineCloneForStream(
  item: CheckoutLineItem,
  qty: number,
  mode: { mode: 'direct' } | { mode: 'doc'; label: string }
): CheckoutLineItem {
  const u = Number(item.unit_price) || 0;
  const base: CheckoutLineItem = {
    ...item,
    quantity: qty,
    total: qty * u,
    includeInTotal: item.includeInTotal !== false,
  };
  if (mode.mode === 'direct') {
    base.checkoutDirectQty = qty;
    base.checkoutDocLabel = 'New';
    base.checkoutDocAllocations = undefined;
  } else {
    base.checkoutDirectQty = 0;
    base.checkoutDocLabel = mode.label;
    base.checkoutDocAllocations = [{ label: mode.label, qty }];
  }
  return normalizeCheckoutLineItem(base);
}

function expandLineToStreamPieces(
  item: CheckoutLineItem,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): { key: string; line: CheckoutLineItem }[] {
  const out: { key: string; line: CheckoutLineItem }[] = [];
  const dq = item.checkoutDirectQty ?? 0;
  if (dq > 0) {
    out.push({ key: 'direct', line: checkoutLineCloneForStream(item, dq, { mode: 'direct' }) });
  }
  const allocs = allocationsForMerge(item);
  for (const a of allocs) {
    if (a.qty <= 0) continue;
    const key = resolveLabelToStreamKey(a.label, quotes, orders, invoices);
    out.push({ key, line: checkoutLineCloneForStream(item, a.qty, { mode: 'doc', label: a.label }) });
  }
  return out;
}

/** Invoices referenced on cart lines that already have payment recorded (for “Payments Already Received” summary). */
function collectInvoicesWithPriorPaymentFromCheckoutLines(
  lineItems: CheckoutLineItem[],
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): POSInvoice[] {
  const invById = new Map<string, POSInvoice>();
  const addInv = (inv: POSInvoice | undefined) => {
    if (!inv) return;
    const id = String(inv.id);
    if (!invById.has(id)) invById.set(id, inv);
  };
  const fromStreamKey = (key: string) => {
    if (key.startsWith('invoice:')) {
      addInv(invoices.find((x) => String(x.id) === key.slice(8)));
    } else if (key.startsWith('quote:')) {
      const q = quotes.find((x) => String(x.id) === key.slice(6));
      if (q?.invoice_id) addInv(invoices.find((x) => String(x.id) === String(q.invoice_id)));
    } else if (key.startsWith('order:')) {
      const o = orders.find((x) => String(x.id) === key.slice(6));
      if (o?.invoice_id) addInv(invoices.find((x) => String(x.id) === String(o.invoice_id)));
    }
  };
  const considerLabel = (label: string) => {
    const trimmed = String(label || '').trim();
    if (!trimmed) return;
    fromStreamKey(resolveLabelToStreamKey(trimmed, quotes, orders, invoices));
  };
  for (const row of lineItems) {
    for (const a of allocationsForMerge(row)) considerLabel(a.label);
    const lab = stripDocLabelSuffix(row.checkoutDocLabel);
    if (lab) for (const part of splitDocLabelParts(lab)) considerLabel(part);
  }
  const priorPayEps = 0.005;
  const list = Array.from(invById.values()).filter((inv) => num(inv.amount_paid) > priorPayEps);
  list.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
  return list;
}

const PRIOR_PAYMENT_LINE_EPS = 0.005;

/** Linked invoice for this stream that already has payment on file (for per-stream “Payments Already Received” on multi-stream checkout). */
function invoiceWithPriorPaymentForStream(
  spec: CheckoutStreamSpec,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): POSInvoice | null {
  const k = spec.key;
  if (k === 'direct') return null;
  let inv: POSInvoice | undefined;
  if (k.startsWith('invoice:')) {
    inv = invoices.find((x) => String(x.id) === k.slice(8));
  } else if (k.startsWith('quote:')) {
    const q = quotes.find((x) => String(x.id) === k.slice(6));
    if (q?.invoice_id) inv = invoices.find((x) => String(x.id) === String(q.invoice_id));
  } else if (k.startsWith('order:')) {
    const o = orders.find((x) => String(x.id) === k.slice(6));
    if (o?.invoice_id) inv = invoices.find((x) => String(x.id) === String(o.invoice_id));
  }
  if (!inv || num(inv.amount_paid) <= PRIOR_PAYMENT_LINE_EPS) return null;
  return inv;
}

function mergeStreamLineGroup(pieces: CheckoutLineItem[]): CheckoutLineItem[] {
  if (pieces.length === 0) return [];
  return pieces.reduce((acc, li) => mergeCheckoutLineItems(acc, [li]), [] as CheckoutLineItem[]);
}

function buildCheckoutStreamSpecs(
  lineItems: CheckoutLineItem[],
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): CheckoutStreamSpec[] {
  const bucket = new Map<string, CheckoutLineItem[]>();
  const add = (key: string, line: CheckoutLineItem) => {
    const arr = bucket.get(key) ?? [];
    arr.push(line);
    bucket.set(key, arr);
  };
  for (const item of lineItems) {
    if (item.includeInTotal === false) continue;
    for (const { key, line } of expandLineToStreamPieces(item, quotes, orders, invoices)) {
      add(key, line);
    }
  }
  const out: CheckoutStreamSpec[] = [];
  for (const [key, arr] of bucket) {
    const merged = mergeStreamLineGroup(arr);
    const source: CheckoutStreamSpec['source'] =
      key.startsWith('quote:')
        ? { sourceType: 'quote', sourceDocId: key.slice(6) }
        : key.startsWith('order:')
          ? { sourceType: 'order', sourceDocId: key.slice(6) }
          : key.startsWith('invoice:')
            ? { sourceType: 'invoice', sourceDocId: key.slice(8) }
            : null;
    out.push({ key, source, lines: merged });
  }
  return out;
}

/** Multiple document streams (new + quotes/orders/invoices) → one persist pass per stream, oldest document first for payment. */
function shouldUseMultiStreamCheckout(streams: CheckoutStreamSpec[]): boolean {
  return streams.length > 1;
}

/** Standalone checkout: quote/order still unlinked, or invoice # on lines → persist against that invoice when open. */
function inferStandalonePersistSource(
  spec: CheckoutStreamSpec,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): { sourceType: SourceType; sourceDocId: string } | null {
  if (spec.key === 'direct') return null;
  if (spec.source?.sourceType === 'quote') {
    const q = quotes.find((x) => String(x.id) === String(spec.source!.sourceDocId));
    if (q && (q.invoice_id == null || String(q.invoice_id).trim() === '')) return spec.source;
    if (q?.invoice_id) {
      const inv = invoices.find((x) => String(x.id) === String(q.invoice_id));
      if (inv && invoiceIsOpenBalance(inv)) return { sourceType: 'invoice', sourceDocId: inv.id };
    }
    return null;
  }
  if (spec.source?.sourceType === 'order') {
    const o = orders.find((x) => String(x.id) === String(spec.source!.sourceDocId));
    if (o && (o.invoice_id == null || String(o.invoice_id ?? '').trim() === '')) return spec.source;
    if (o?.invoice_id) {
      const inv = invoices.find((x) => String(x.id) === String(o.invoice_id));
      if (inv && invoiceIsOpenBalance(inv)) return { sourceType: 'invoice', sourceDocId: inv.id };
    }
    return null;
  }
  if (spec.source?.sourceType === 'invoice') {
    const inv = invoices.find((x) => String(x.id) === String(spec.source!.sourceDocId));
    if (inv && invoiceIsOpenBalance(inv)) return spec.source;
    return null;
  }
  return null;
}

type StreamFiscal = {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  documentTotal: number;
};

function computeStreamFiscalTotals(
  streamLines: CheckoutLineItem[],
  taxRate: number,
  globalSubtotal: number,
  globalTaxAmount: number,
  globalDiscountAmount: number
): StreamFiscal {
  const strip = lineItemsForPersistence(streamLines);
  const sub = strip.reduce((s, i) => s + (Number(i.total) || 0), 0);
  if (globalSubtotal <= 1e-9) {
    return { subtotal: sub, taxAmount: 0, discountAmount: 0, documentTotal: Math.max(0, sub) };
  }
  const ratio = sub / globalSubtotal;
  const taxAmount = roundForGctCalculation(globalTaxAmount * ratio);
  const discountAmount = globalDiscountAmount * ratio;
  return {
    subtotal: sub,
    taxAmount,
    discountAmount,
    documentTotal: Math.max(0, sub + taxAmount - discountAmount),
  };
}

/**
 * Max payment this stream can absorb (waterfall cap): min(cart fiscal for stream, remaining balance on linked invoice if any).
 */
function streamOutstandingWaterfallCap(
  spec: CheckoutStreamSpec,
  fiscal: StreamFiscal,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): number {
  const dtot = Math.max(0, num(fiscal.documentTotal));
  if (spec.key === 'direct') return dtot;
  if (spec.key.startsWith('quote:')) {
    const id = spec.key.slice(6);
    const q = quotes.find((x) => String(x.id) === id);
    if (!q) return dtot;
    if (q.invoice_id != null && String(q.invoice_id).trim() !== '') {
      const inv = invoices.find((x) => String(x.id) === String(q.invoice_id));
      if (inv && invoiceIsOpenBalance(inv)) {
        const rem = Math.max(0, num(inv.total) - num(inv.amount_paid));
        return Math.min(dtot, rem);
      }
    }
    return dtot;
  }
  if (spec.key.startsWith('order:')) {
    const id = spec.key.slice(6);
    const o = orders.find((x) => String(x.id) === id);
    if (!o) return dtot;
    if (o.invoice_id != null && String(o.invoice_id).trim() !== '') {
      const inv = invoices.find((x) => String(x.id) === String(o.invoice_id));
      if (inv && invoiceIsOpenBalance(inv)) {
        const rem = Math.max(0, num(inv.total) - num(inv.amount_paid));
        return Math.min(dtot, rem);
      }
    }
    return dtot;
  }
  if (spec.key.startsWith('invoice:')) {
    const id = spec.key.slice(8);
    const inv = invoices.find((x) => String(x.id) === id);
    if (!inv) return dtot;
    const rem = Math.max(0, num(inv.total) - num(inv.amount_paid));
    return Math.min(dtot, rem);
  }
  return dtot;
}

function splitProportionally(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 1e-9) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const rounded = raw.map((x) => Math.round(x * 100) / 100);
  const drift = total - rounded.reduce((a, b) => a + b, 0);
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + drift) * 100) / 100;
  return rounded;
}

/** Oldest quote/order/invoice first (by document created_at); ad-hoc “direct” lines last. */
function streamSpecOldestFirstTimestamp(
  spec: CheckoutStreamSpec,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): number {
  if (spec.key === 'direct') return Number.MAX_SAFE_INTEGER;
  if (spec.key.startsWith('quote:')) {
    const id = spec.key.slice(6);
    const q = quotes.find((x) => String(x.id) === id);
    const t = q?.created_at ? new Date(q.created_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (spec.key.startsWith('order:')) {
    const id = spec.key.slice(6);
    const o = orders.find((x) => String(x.id) === id);
    const t = o?.created_at ? new Date(o.created_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (spec.key.startsWith('invoice:')) {
    const id = spec.key.slice(8);
    const inv = invoices.find((x) => String(x.id) === id);
    const t = inv?.created_at ? new Date(inv.created_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function sortCheckoutStreamSpecsOldestFirst(
  specs: CheckoutStreamSpec[],
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): CheckoutStreamSpec[] {
  return [...specs].sort((a, b) => {
    const ta = streamSpecOldestFirstTimestamp(a, quotes, orders, invoices);
    const tb = streamSpecOldestFirstTimestamp(b, quotes, orders, invoices);
    if (ta !== tb) return ta - tb;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Apply store credit, then tender, to streams in array order (oldest → newest).
 * `streamCaps` = max each stream can absorb (remaining balance on invoice, or fiscal total for new docs).
 */
function allocatePaymentAcrossStreamsOldestFirst(
  streamCaps: number[],
  creditApplied: number,
  tenderAmt: number
): { perStream: number[]; creditParts: number[]; tenderParts: number[] } {
  const n = streamCaps.length;
  const due = streamCaps.map((t) => Math.max(0, num(t)));
  const creditParts = Array.from({ length: n }, () => 0);
  let credLeft = num(creditApplied);
  for (let i = 0; i < n; i++) {
    const take = Math.min(credLeft, due[i]);
    creditParts[i] = take;
    due[i] -= take;
    credLeft -= take;
  }
  const tenderParts = Array.from({ length: n }, () => 0);
  let tenderLeft = num(tenderAmt);
  for (let i = 0; i < n; i++) {
    const take = Math.min(tenderLeft, due[i]);
    tenderParts[i] = take;
    due[i] -= take;
    tenderLeft -= take;
  }
  const perStream = creditParts.map((c, i) => c + tenderParts[i]);
  return { perStream, creditParts, tenderParts };
}

/** Lines checked for “include in total” with quantity > 0 only — metadata stripped for API. */
function lineItemsForPersistence(items: CheckoutLineItem[]): POSLineItem[] {
  return items
    .filter((i) => i.includeInTotal !== false && (Number(i.quantity) || 0) > 0)
    .map(
      ({
        checkoutDocLabel: _d,
        checkoutDocAllocations: _a,
        includeInTotal: _i,
        checkoutDirectQty: _q,
        ...rest
      }) => rest
    );
}

/** Document number only (section/type context already identifies quote vs order vs invoice). */
function docNumberLabel(doc: POSQuote | POSOrder | POSInvoice): string {
  if ('quote_number' in doc) return doc.quote_number;
  if ('order_number' in doc) return doc.order_number;
  return doc.invoice_number;
}

function resolvedCheckoutDisplayName(
  doc: POSQuote | POSOrder | POSInvoice,
  customers: POSCustomer[]
): string {
  const raw = (doc.customer_name || '').trim();
  if (doc.customer_id) {
    const c = customers.find((x) => x.id === doc.customer_id);
    const fromRecord = (c?.name || '').trim();
    return raw || fromRecord || POS_DEFAULT_VISITOR_CUSTOMER_NAME;
  }
  return raw || POS_DEFAULT_VISITOR_CUSTOMER_NAME;
}

function productSearchBlob(p: Product): string {
  const code = productNameToCode(p.name);
  return `${p.name} ${p.otherNames || ''} ${p.partNumber || ''} ${p.description || ''} ${p.brand || ''} ${p.category || ''} ${code}`.toLowerCase();
}

function docBlobForMatch(doc: POSQuote | POSOrder | POSInvoice): string {
  const num =
    'quote_number' in doc
      ? doc.quote_number
      : 'order_number' in doc
        ? doc.order_number
        : doc.invoice_number;
  const lines = (doc.items || [])
    .map((i) => `${i.product_name} ${i.part_number || ''} ${i.brand || ''} ${i.category || ''}`)
    .join(' ');
  return `${num} ${lines}`.toLowerCase();
}

/** One search token vs customer: name substring, or stored phone digits (Contact #). */
function checkoutSearchTokenMatchesCustomer(token: string, c: POSCustomer): boolean {
  const name = (c.name || '').toLowerCase();
  const tl = token.toLowerCase().trim();
  const phoneDigits = digitsFromPhoneInput(c.phone || '');
  const tDigits = digitsFromPhoneInput(token);
  const nonDigitChars = token.replace(/[\d\s\-().+]/g, '').trim();
  if (tDigits.length > 0 && nonDigitChars === '') {
    if (tDigits.length < 3) return false;
    return phoneDigits.includes(tDigits);
  }
  return name.includes(tl);
}

function docEntryKey(doc: POSQuote | POSOrder | POSInvoice): string {
  if ('quote_number' in doc) return `q:${doc.id}`;
  if ('order_number' in doc) return `o:${doc.id}`;
  return `i:${doc.id}`;
}

/** Quote/order/invoice # strings already shown on at least one line (Doc No. column). */
function docNumbersInCheckoutLines(lineItems: CheckoutLineItem[]): Set<string> {
  const s = new Set<string>();
  for (const row of lineItems) {
    const allocs = row.checkoutDocAllocations;
    if (allocs?.length) {
      for (const a of allocs) {
        const n = String(a.label || '').trim();
        if (n) s.add(n.toLowerCase());
      }
    }
    const lab = stripDocLabelSuffix(row.checkoutDocLabel);
    if (lab) {
      for (const part of splitDocLabelParts(lab)) {
        const n = part.trim();
        if (n) s.add(n.toLowerCase());
      }
    }
  }
  return s;
}

/**
 * Quote/order/invoice rows to hide in checkout document search: any doc whose # is already on a line,
 * plus all linked QT/OR/INV in the same chain (same ids as {@link docEntryKey}).
 */
function collectCheckoutSearchBlockedDocKeys(
  inLines: Set<string>,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[]
): Set<string> {
  const blocked = new Set<string>();
  if (inLines.size === 0) return blocked;

  const quoteById = new Map(quotes.map((q) => [String(q.id), q]));
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  const invById = new Map(invoices.map((i) => [String(i.id), i]));

  const inQ = new Set<string>();
  const inO = new Set<string>();
  const inI = new Set<string>();

  for (const q of quotes) {
    const k = String(q.quote_number || '').trim().toLowerCase();
    if (k && inLines.has(k)) inQ.add(String(q.id));
  }
  for (const o of orders) {
    const k = String(o.order_number || '').trim().toLowerCase();
    if (k && inLines.has(k)) inO.add(String(o.id));
  }
  for (const inv of invoices) {
    const k = String(inv.invoice_number || '').trim().toLowerCase();
    if (k && inLines.has(k)) inI.add(String(inv.id));
  }

  const tryAddQ = (id: string) => {
    const s = String(id || '').trim();
    if (!s) return false;
    if (inQ.has(s)) return false;
    inQ.add(s);
    return true;
  };
  const tryAddO = (id: string) => {
    const s = String(id || '').trim();
    if (!s) return false;
    if (inO.has(s)) return false;
    inO.add(s);
    return true;
  };
  const tryAddI = (id: string) => {
    const s = String(id || '').trim();
    if (!s) return false;
    if (inI.has(s)) return false;
    inI.add(s);
    return true;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const qid of inQ) {
      const q = quoteById.get(qid);
      if (!q) continue;
      if (q.order_id != null && String(q.order_id).trim() !== '' && tryAddO(String(q.order_id))) changed = true;
      if (q.invoice_id != null && String(q.invoice_id).trim() !== '' && tryAddI(String(q.invoice_id))) changed = true;
    }
    for (const oid of inO) {
      const o = orderById.get(oid);
      if (!o) continue;
      if (o.quote_id != null && String(o.quote_id).trim() !== '' && tryAddQ(String(o.quote_id))) changed = true;
      if (o.invoice_id != null && String(o.invoice_id).trim() !== '' && tryAddI(String(o.invoice_id))) changed = true;
    }
    for (const iid of inI) {
      const inv = invById.get(iid);
      if (!inv) continue;
      if (inv.quote_id != null && String(inv.quote_id).trim() !== '' && tryAddQ(String(inv.quote_id))) changed = true;
      if (inv.order_id != null && String(inv.order_id).trim() !== '' && tryAddO(String(inv.order_id))) changed = true;
    }
    for (const o of orders) {
      const qid = o.quote_id != null ? String(o.quote_id).trim() : '';
      if (qid && inQ.has(qid) && tryAddO(String(o.id))) changed = true;
    }
    for (const inv of invoices) {
      const qid = inv.quote_id != null ? String(inv.quote_id).trim() : '';
      const oid = inv.order_id != null ? String(inv.order_id).trim() : '';
      if (qid && inQ.has(qid) && tryAddI(String(inv.id))) changed = true;
      if (oid && inO.has(oid) && tryAddI(String(inv.id))) changed = true;
    }
  }

  for (const qid of inQ) blocked.add(`q:${qid}`);
  for (const oid of inO) blocked.add(`o:${oid}`);
  for (const iid of inI) blocked.add(`i:${iid}`);
  return blocked;
}

function looseCustomerNameMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length > y.length ? x : y;
  if (shorter.length < 3) return false;
  return longer.includes(shorter);
}

/** Quote/order/invoice for a customer matched by name/contact search (id or name/phone on doc). */
function documentBelongsToMatchedCustomers(
  doc: POSQuote | POSOrder | POSInvoice,
  matched: POSCustomer[]
): boolean {
  if (matched.length === 0) return false;
  const cid = doc.customer_id;
  if (cid != null && String(cid).trim() !== '') {
    return matched.some((c) => String(c.id) === String(cid));
  }
  const docPhoneDigits = digitsFromPhoneInput(doc.customer_phone || '');
  for (const c of matched) {
    if (looseCustomerNameMatch(doc.customer_name || '', c.name || '')) return true;
    const cPhone = digitsFromPhoneInput(c.phone || '');
    if (docPhoneDigits.length >= 7 && cPhone.length >= 7 && docPhoneDigits === cPhone) return true;
  }
  return false;
}

/**
 * Quotes / orders / open invoices for one CRM customer, same eligibility and caps as the search
 * “Customer documents” list (paid-off links excluded, blocked keys excluded).
 */
function collectCheckoutEligibleDocsForCustomer(
  c: POSCustomer,
  quotes: POSQuote[],
  orders: POSOrder[],
  invoices: POSInvoice[],
  blocked: Set<string>
): { quotes: POSQuote[]; orders: POSOrder[]; invoices: POSInvoice[] } {
  const invById = new Map(invoices.map((i) => [String(i.id), i]));
  const quotesForSearch = quotes.filter((q) => !linkedInvoiceIsPaidOff(q, invById, invoices));
  const ordersForSearch = orders.filter((o) => !linkedInvoiceIsPaidOff(o, invById, invoices));
  const openInvoices = invoices.filter((x) => invoiceIsOpenBalance(x));
  const matched = [c];
  const belongs = (doc: POSQuote | POSOrder | POSInvoice) =>
    documentBelongsToMatchedCustomers(doc, matched);
  const notBlocked = (doc: POSQuote | POSOrder | POSInvoice) => !blocked.has(docEntryKey(doc));
  return {
    quotes: quotesForSearch.filter(belongs).filter(notBlocked).slice(0, 8),
    orders: ordersForSearch.filter(belongs).filter(notBlocked).slice(0, 8),
    invoices: openInvoices.filter(belongs).filter(notBlocked).slice(0, 8),
  };
}

/**
 * Exclude quote/order from document search when a fully paid invoice is linked.
 * Checks both directions: `doc.invoice_id` → invoice, and invoice.{quote_id|order_id} → doc
 * (the quote row may be missing `invoice_id` even when the invoice references it).
 */
function linkedInvoiceIsPaidOff(
  doc: POSQuote | POSOrder,
  invById: Map<string, POSInvoice>,
  invoices: POSInvoice[]
): boolean {
  const iid = doc.invoice_id;
  if (iid != null && String(iid).trim() !== '') {
    const inv = invById.get(String(iid));
    if (invoiceIsFullyPaid(inv ?? null)) return true;
  }
  if ('quote_number' in doc) {
    return invoices.some(
      (inv) =>
        inv.quote_id != null &&
        String(inv.quote_id) === String(doc.id) &&
        invoiceIsFullyPaid(inv)
    );
  }
  return invoices.some(
    (inv) =>
      inv.order_id != null &&
      String(inv.order_id) === String(doc.id) &&
      invoiceIsFullyPaid(inv)
  );
}

/** Walk every line before save — same rules for standalone, Actions→Checkout, and Save & Checkout. */
function validateCheckoutLineItems(items: POSLineItem[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!String(row.product_id || '').trim()) {
      return `Line ${i + 1}: missing product — remove the row or pick a catalog product.`;
    }
    if (!String(row.product_name || '').trim()) {
      return `Line ${i + 1}: missing product name.`;
    }
    const q = Number(row.quantity);
    if (!Number.isFinite(q) || q < 1) {
      return `Line ${i + 1}: quantity must be at least 1.`;
    }
  }
  return null;
}

/**
 * For each line, roll up quantity by product_id, then update CMS stock once per product.
 * (Same outcome for merged duplicate SKUs — inventory matches total qty sold.)
 */
async function applyInventoryDeductionsForLineItems(
  items: POSLineItem[],
  catalog: Product[],
  updateStock: (productId: string, nextCount: number) => Promise<boolean>
): Promise<{ allOk: boolean; nextStockById: Map<string, number>; missingProductIds: string[] }> {
  const qtyByProduct = new Map<string, number>();
  for (let li = 0; li < items.length; li++) {
    const row = items[li];
    const pid = String(row.product_id || '').trim();
    if (!pid) continue;
    const q = Math.max(0, Number(row.quantity) || 0);
    qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + q);
  }
  const nextStockById = new Map<string, number>();
  const missingProductIds: string[] = [];
  let allOk = true;
  for (const [pid, qtySold] of qtyByProduct) {
    const p = catalog.find((x) => x.id === pid);
    if (!p) {
      missingProductIds.push(pid);
      allOk = false;
      continue;
    }
    const current = Number(p.stockCount) || 0;
    const next = Math.max(0, current - qtySold);
    nextStockById.set(pid, next);
    const ok = await updateStock(pid, next);
    if (!ok) allOk = false;
  }
  return { allOk, nextStockById, missingProductIds };
}

type PersistCtx = {
  source: { sourceType: SourceType; sourceDocId: string } | null;
  itemsPayload: POSLineItem[];
  customerId: string | undefined;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  documentTotal: number;
  /** Tender + store credit applied to this checkout (not capped at due — drives receipt & overpayment). */
  allocationThisCheckout: number;
  amountDueForPayment: number;
  quotes: POSQuote[];
  orders: POSOrder[];
  invoices: POSInvoice[];
};

/** Single persistence path: new cart vs quote vs order vs invoice — all produce an invoice row when successful. */
async function persistCheckoutDocuments(ctx: PersistCtx): Promise<{ invoice: POSInvoice | null; orderId?: string }> {
  const {
    source,
    itemsPayload,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    subtotal,
    taxRate,
    taxAmount,
    discountAmount,
    documentTotal,
    allocationThisCheckout,
    amountDueForPayment,
    quotes,
    orders,
    invoices,
  } = ctx;
  const sid = source ? String(source.sourceDocId) : '';
  let invoice: POSInvoice | null = null;
  let orderId: string | undefined;

  if (!source) {
    const ordNo = await generateDocNumber('order');
    const order = await saveOrder(
      {
        order_number: ordNo,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_type: customerId ? 'registered' : 'visitor',
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        status:
          allocationThisCheckout >= amountDueForPayment
            ? 'invoice_generated_paid'
            : allocationThisCheckout > 0
              ? 'invoice_generated_partially_paid'
              : 'invoice_generated_unpaid',
        notes: '',
      },
      { syncLinked: false }
    );
    orderId = order?.id;
    const invNo = await generateDocNumber('invoice');
    invoice = await saveInvoice(
      {
        invoice_number: invNo,
        order_id: order?.id,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        amount_paid: allocationThisCheckout,
        status:
          allocationThisCheckout >= amountDueForPayment
            ? INVOICE_STATUS_PAID
            : allocationThisCheckout > 0
              ? INVOICE_STATUS_PARTIALLY_PAID
              : INVOICE_STATUS_UNPAID,
        delivery_status: 'pending',
        notes: '',
      },
      { syncLinked: false }
    );
    return { invoice, orderId };
  }

  if (source.sourceType === 'quote') {
    let entry = quotes.find((v) => String(v.id) === sid) ?? null;
    if (!entry) {
      const list = await fetchQuotes();
      entry = list.find((v) => String(v.id) === sid) ?? null;
    }
    if (!entry) throw new Error('Quote not found — open checkout again from the quote');
    const linkedInv =
      entry.invoice_id != null
        ? invoices.find((v) => String(v.id) === String(entry.invoice_id))
        : undefined;
    if (linkedInv && invoiceIsOpenBalance(linkedInv)) {
      return persistCheckoutDocuments({
        ...ctx,
        source: { sourceType: 'invoice', sourceDocId: linkedInv.id },
      });
    }
    const targetAmount = amountDueForPayment;
    const ordNo = await generateDocNumber('order');
    const order = await saveOrder(
      {
        order_number: ordNo,
        quote_id: entry.id,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_type: customerId ? 'registered' : 'visitor',
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        status:
          allocationThisCheckout >= targetAmount
            ? 'invoice_generated_paid'
            : allocationThisCheckout > 0
              ? 'invoice_generated_partially_paid'
              : 'invoice_generated_unpaid',
        notes: entry.notes,
      },
      { syncLinked: false }
    );
    orderId = order?.id;
    const invNo = await generateDocNumber('invoice');
    invoice = await saveInvoice(
      {
        invoice_number: invNo,
        order_id: order?.id,
        quote_id: entry.id,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        amount_paid: allocationThisCheckout,
        status:
          allocationThisCheckout >= targetAmount
            ? INVOICE_STATUS_PAID
            : allocationThisCheckout > 0
              ? INVOICE_STATUS_PARTIALLY_PAID
              : INVOICE_STATUS_UNPAID,
        delivery_status: 'pending',
        notes: entry.notes,
      },
      { syncLinked: false }
    );
    return { invoice, orderId };
  }

  if (source.sourceType === 'order') {
    let entry = orders.find((v) => String(v.id) === sid) ?? null;
    if (!entry) {
      const list = await fetchOrders();
      entry = list.find((v) => String(v.id) === sid) ?? null;
    }
    if (!entry) throw new Error('Order not found — open checkout again from the order');
    const linkedInv =
      entry.invoice_id != null
        ? invoices.find((v) => String(v.id) === String(entry.invoice_id))
        : undefined;
    if (linkedInv && invoiceIsOpenBalance(linkedInv)) {
      return persistCheckoutDocuments({
        ...ctx,
        source: { sourceType: 'invoice', sourceDocId: linkedInv.id },
      });
    }
    const targetAmount = amountDueForPayment;
    orderId = entry.id;
    const invNo = await generateDocNumber('invoice');
    invoice = await saveInvoice(
      {
        invoice_number: invNo,
        order_id: entry.id,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        amount_paid: allocationThisCheckout,
        status:
          allocationThisCheckout >= targetAmount
            ? INVOICE_STATUS_PAID
            : allocationThisCheckout > 0
              ? INVOICE_STATUS_PARTIALLY_PAID
              : INVOICE_STATUS_UNPAID,
        delivery_status: 'pending',
        notes: entry.notes,
      },
      { syncLinked: false }
    );
    await saveOrder(
      {
        ...entry,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_type: customerId ? 'registered' : 'visitor',
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        invoice_id: invoice?.id,
        status:
          allocationThisCheckout >= targetAmount
            ? 'invoice_generated_paid'
            : allocationThisCheckout > 0
              ? 'invoice_generated_partially_paid'
              : 'invoice_generated_unpaid',
      },
      { syncLinked: false }
    );
    return { invoice, orderId };
  }

  let entry = invoices.find((v) => String(v.id) === sid) ?? null;
  if (!entry) {
    const list = await fetchInvoices();
    entry = list.find((v) => String(v.id) === sid) ?? null;
  }
  if (!entry) throw new Error('Invoice not found — open checkout again from the invoice');
  const prevPaid = num(entry.amount_paid);
  const newPaid = prevPaid + allocationThisCheckout;
  const invTotal = num(documentTotal);
  const invoiceStatus =
    newPaid <= 0 ? INVOICE_STATUS_UNPAID : newPaid >= invTotal ? INVOICE_STATUS_PAID : INVOICE_STATUS_PARTIALLY_PAID;
  const linkedDocStatus =
    newPaid >= invTotal
      ? 'invoice_generated_paid'
      : newPaid > 0
        ? 'invoice_generated_partially_paid'
        : 'invoice_generated_unpaid';
  invoice = await saveInvoice(
    {
      ...entry,
      customer_id: customerId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      items: itemsPayload,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total: documentTotal,
      amount_paid: newPaid,
      status: invoiceStatus,
    },
    { syncLinked: false }
  );
  if (!entry.order_id) {
    const ordNo = await generateDocNumber('order');
    const order = await saveOrder(
      {
        order_number: ordNo,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_type: customerId ? 'registered' : 'visitor',
        items: itemsPayload,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total: documentTotal,
        invoice_id: entry.id,
        status: linkedDocStatus,
        notes: entry.notes,
      },
      { syncLinked: false }
    );
    orderId = order?.id;
    if (order?.id && invoice) {
      invoice = await saveInvoice({ ...invoice, order_id: order.id }, { syncLinked: false });
    }
  } else {
    orderId = entry.order_id;
  }
  return { invoice, orderId };
}

const POSCheckout: React.FC<POSCheckoutProps> = ({ source, onDone, onBack, onCustomersRefresh }) => {
  const { notify } = useCMSNotification();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<POSCustomer[]>([]);
  const [quotes, setQuotes] = useState<POSQuote[]>([]);
  const [orders, setOrders] = useState<POSOrder[]>([]);
  const [invoices, setInvoices] = useState<POSInvoice[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [lineItems, setLineItems] = useState<CheckoutLineItem[]>([]);
  /** Prior line snapshots for Items “Undo” (each entry is the state before one user edit). */
  const [lineItemsUndoStack, setLineItemsUndoStack] = useState<CheckoutLineItem[][]>([]);
  const [itemsTableColLayout, setItemsTableColLayout] = useState<number[]>(() => [...POS_ITEMS_TABLE_COL_DEFAULTS]);
  const [taxRate, setTaxRate] = useState(0);
  const [discountInput, setDiscountInput] = useState('');
  const hydrateKeyRef = useRef<string | null>(null);
  /** When CRM match id changes, sync full customer row into the form (avoid clobbering edits for the same match). */
  const prevMatchedCustomerIdRef = useRef<string | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);
  /** After store credit or broadcast refresh, align selected CRM row with latest balances. */
  useSyncSelectedCustomerFromList(customers, setSelectedCustomer);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState(POS_DEFAULT_VISITOR_CUSTOMER_NAME);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [paymentMethod, setPaymentMethod] = useState<TenderMethod>('cash');
  const [allowMultiplePaymentMethods, setAllowMultiplePaymentMethods] = useState(false);
  const [tenderMethodsMulti, setTenderMethodsMulti] = useState<TenderMethod[]>(['cash']);
  const [paymentInputsMulti, setPaymentInputsMulti] = useState<Record<TenderMethod, string>>(() => ({
    cash: '',
    card: '',
    bank_transfer: '',
    cheque: '',
  }));
  const [useStoreCredit, setUseStoreCredit] = useState(false);
  const [paymentInput, setPaymentInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState('');
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  /** After a completed sale, hide CRM balance/credit in the grey panel until the user picks a customer again. */
  const [suppressCrmWalletDisplay, setSuppressCrmWalletDisplay] = useState(false);

  const dismissReceiptPreview = useCallback(() => {
    setReceiptPreviewOpen(false);
    setReceiptPreviewHtml('');
  }, []);

  useEffect(() => {
    (async () => {
      const [prods, overrides, c, q, o, i] = await Promise.all([
        fetchCustomProducts(),
        fetchProductOverrides(),
        fetchCustomers(),
        fetchQuotes(),
        fetchOrders(),
        fetchInvoices(),
      ]);
      const merged = prods.map((p) => {
        const ov = overrides[p.id];
        if (!ov) return p;
        return {
          ...p,
          name: ov.name ?? p.name,
          price: ov.price ?? p.price,
          image: ov.image ?? p.image,
          brand: ov.brand ?? p.brand,
        };
      });
      setProducts(merged);
      setCustomers(c);
      setQuotes(q);
      setOrders(o);
      setInvoices(i);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    prevMatchedCustomerIdRef.current = null;
  }, [source?.sourceType, source?.sourceDocId]);

  useEffect(() => {
    if (customers.length === 0) return;
    const match = findCustomerByEmailOrPhone(customers, customerEmail, customerPhone);
    if (match) {
      setIsExistingCustomer(true);
      setSelectedCustomer(match);
      if (prevMatchedCustomerIdRef.current !== match.id) {
        prevMatchedCustomerIdRef.current = match.id;
        setCustomerName((match.name || '').trim());
        setCustomerEmail((match.email || '').trim());
        setCustomerPhone(displayUsPhoneFromStored(match.phone));
        setCustomerCompany((match.company || '').trim());
      }
    } else {
      prevMatchedCustomerIdRef.current = null;
      setIsExistingCustomer(false);
      setSelectedCustomer(null);
    }
  }, [customerEmail, customerPhone, customers]);

  useEffect(() => {
    if (loading) return;
    const key = source ? `${source.sourceType}:${source.sourceDocId}` : 'none';
    if (source) {
      const q = quotes.find((v) => String(v.id) === String(source.sourceDocId));
      const o = orders.find((v) => String(v.id) === String(source.sourceDocId));
      const inv = invoices.find((v) => String(v.id) === String(source.sourceDocId));
      let doc: POSQuote | POSOrder | POSInvoice | undefined;
      let docLabel: string;
      if (source.sourceType === 'quote' && q) {
        const invLinked = q.invoice_id
          ? invoices.find((i) => String(i.id) === String(q.invoice_id))
          : undefined;
        if (
          invLinked &&
          invoiceIsOpenBalance(invLinked)
        ) {
          doc = invLinked;
          docLabel = q.quote_number;
        } else {
          doc = q;
          docLabel = docNumberLabel(q);
        }
      } else if (source.sourceType === 'order' && o) {
        const invLinked = o.invoice_id
          ? invoices.find((i) => String(i.id) === String(o.invoice_id))
          : undefined;
        if (
          invLinked &&
          invoiceIsOpenBalance(invLinked)
        ) {
          doc = invLinked;
          docLabel = o.order_number;
        } else {
          doc = o;
          docLabel = docNumberLabel(o);
        }
      } else {
        doc = source.sourceType === 'quote' ? q : source.sourceType === 'order' ? o : inv;
        docLabel = doc ? docNumberLabel(doc) : '';
      }
      if (!doc) return;
      if (hydrateKeyRef.current === key) return;
      hydrateKeyRef.current = key;
      setLineItems(
        (doc.items || []).map((item) => {
          const base = normalizeLineItem(item);
          const q = Number(base.quantity) || 0;
          return {
            ...base,
            checkoutDocLabel: docLabel,
            checkoutDocAllocations: q > 0 ? [{ label: docLabel, qty: q }] : undefined,
            checkoutDirectQty: 0,
            includeInTotal: true,
          };
        })
      );
      setLineItemsUndoStack([]);
      setTaxRate(doc.tax_rate ?? 0);
      const d = doc.discount_amount;
      setDiscountInput(d != null && Number(d) !== 0 ? String(d) : '');
      setCustomerName(resolvedCheckoutDisplayName(doc, customers));
      setCustomerEmail(doc.customer_email);
      setCustomerPhone(displayUsPhoneFromStored(doc.customer_phone));
      setCustomerCompany(
        source.sourceType === 'quote' && q
          ? q.customer_company || ''
          : doc.customer_id
            ? customers.find((x) => x.id === doc.customer_id)?.company || ''
            : ''
      );
      if (doc.customer_id) {
        const c = customers.find((x) => x.id === doc.customer_id);
        if (c) {
          setSelectedCustomer(c);
          setIsExistingCustomer(true);
        } else {
          setSelectedCustomer(null);
          setIsExistingCustomer(false);
        }
      } else {
        setSelectedCustomer(null);
        setIsExistingCustomer(false);
      }
      return;
    }
    if (hydrateKeyRef.current === 'none') return;
    hydrateKeyRef.current = 'none';
    setLineItems([]);
    setLineItemsUndoStack([]);
    setDiscountInput('');
    setCustomerName(POS_DEFAULT_VISITOR_CUSTOMER_NAME);
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerCompany('');
    setSelectedCustomer(null);
    setIsExistingCustomer(false);
    void (async () => {
      const v = await fetchConfig('pos_default_tax_rate');
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isNaN(n) && n >= 0) setTaxRate(n);
    })();
  }, [loading, source, quotes, orders, invoices, customers]);

  const subtotal = useMemo(
    () =>
      lineItems.reduce(
        (s, i) => s + (i.includeInTotal !== false ? Number(i.total) || 0 : 0),
        0
      ),
    [lineItems]
  );
  const gctPercentEffective = gctPercentForCalculation(taxRate);
  const taxAmount = taxAmountFromSubtotalAndGctPercent(subtotal, taxRate);
  const discountAmount = decimalInputToNumber(discountInput);
  const documentTotal = Math.max(0, subtotal + taxAmount - discountAmount);

  const invoicesWithPriorPaymentInCart = useMemo(
    () => collectInvoicesWithPriorPaymentFromCheckoutLines(lineItems, quotes, orders, invoices),
    [lineItems, quotes, orders, invoices]
  );
  /** Oldest-first streams (quote/order/invoice/direct) for multi-document carts — used for per-stream prior payment lines. */
  const checkoutStreamsSorted = useMemo(
    () =>
      sortCheckoutStreamSpecsOldestFirst(
        buildCheckoutStreamSpecs(lineItems, quotes, orders, invoices),
        quotes,
        orders,
        invoices
      ),
    [lineItems, quotes, orders, invoices]
  );
  const showPerStreamPriorPaymentRows = checkoutStreamsSorted.length > 1;
  /** Sum of amounts shown on “Payments Already Received” — subtracted from items summary with discount. */
  const priorPaymentsSubtractSum = useMemo(
    () => invoicesWithPriorPaymentInCart.reduce((s, i) => s + num(i.amount_paid), 0),
    [invoicesWithPriorPaymentInCart]
  );
  /** Subtotal + GCT − discount − prior payments (matches items footer & payment when no single-doc source). */
  const itemsSectionNetTotal = useMemo(
    () => Math.max(0, documentTotal - priorPaymentsSubtractSum),
    [documentTotal, priorPaymentsSubtractSum]
  );

  const itemsTableGridTemplateColumns = useMemo(
    () => itemsTableColLayout.map((w) => `${w}fr`).join(' '),
    [itemsTableColLayout]
  );

  const onItemsTableLayout = useCallback((sizes: number[]) => {
    setItemsTableColLayout(sizes);
  }, []);

  const searchQ = searchQuery.trim().toLowerCase();
  const docNumbersInLines = useMemo(() => docNumbersInCheckoutLines(lineItems), [lineItems]);
  /** Distinct Doc No. values (excludes New/Direct) — used to show invoice #s only when multiple docs are on the cart. */
  const meaningfulCheckoutDocNoCount = useMemo(() => {
    let c = 0;
    for (const k of docNumbersInLines) {
      const t = String(k || '').trim().toLowerCase();
      if (!t || t === 'new' || t === 'direct') continue;
      c++;
    }
    return c;
  }, [docNumbersInLines]);
  const checkoutSearchBlockedDocKeys = useMemo(
    () => collectCheckoutSearchBlockedDocKeys(docNumbersInLines, quotes, orders, invoices),
    [docNumbersInLines, quotes, orders, invoices]
  );

  const productResults = useMemo(() => {
    if (!searchQ) return [] as Product[];
    const tokens = searchQ.split(/\s+/).filter(Boolean);
    return products
      .filter((p) => {
        const blob = productSearchBlob(p);
        return tokens.every((t) => blob.includes(t));
      })
      .slice(0, 18);
  }, [searchQ, products]);

  const docMatches = useMemo(() => {
    if (!searchQ) return { quotes: [] as POSQuote[], orders: [] as POSOrder[], invoices: [] as POSInvoice[] };
    const invById = new Map(invoices.map((i) => [String(i.id), i]));
    const quotesForSearch = quotes.filter((q) => !linkedInvoiceIsPaidOff(q, invById, invoices));
    const ordersForSearch = orders.filter((o) => !linkedInvoiceIsPaidOff(o, invById, invoices));
    const openInvoices = invoices.filter((x) => invoiceIsOpenBalance(x));
    const match = (doc: POSQuote | POSOrder | POSInvoice) => {
      const num =
        'quote_number' in doc
          ? doc.quote_number
          : 'order_number' in doc
            ? doc.order_number
            : doc.invoice_number;
      return num.toLowerCase().includes(searchQ) || docBlobForMatch(doc).includes(searchQ);
    };
    const notBlocked = (doc: POSQuote | POSOrder | POSInvoice) =>
      !checkoutSearchBlockedDocKeys.has(docEntryKey(doc));
    return {
      quotes: quotesForSearch.filter(match).filter(notBlocked).slice(0, 8),
      orders: ordersForSearch.filter(match).filter(notBlocked).slice(0, 8),
      invoices: openInvoices.filter(match).filter(notBlocked).slice(0, 8),
    };
  }, [searchQ, quotes, orders, invoices, checkoutSearchBlockedDocKeys]);

  /** Match by customer name or contact phone (Contact #). */
  const customerMatches = useMemo(() => {
    if (!searchQ) return [] as POSCustomer[];
    const tokens = searchQ.split(/\s+/).filter(Boolean);
    return customers
      .filter((c) => tokens.every((t) => checkoutSearchTokenMatchesCustomer(t, c)))
      .slice(0, 12);
  }, [searchQ, customers]);

  /** Quotes/orders/invoices for customers matched by name/contact (same checkout eligibility as main doc search). */
  const customerDocMatches = useMemo(() => {
    if (customerMatches.length === 0) {
      return { quotes: [] as POSQuote[], orders: [] as POSOrder[], invoices: [] as POSInvoice[] };
    }
    const invById = new Map(invoices.map((i) => [String(i.id), i]));
    const quotesForSearch = quotes.filter((q) => !linkedInvoiceIsPaidOff(q, invById, invoices));
    const ordersForSearch = orders.filter((o) => !linkedInvoiceIsPaidOff(o, invById, invoices));
    const openInvoices = invoices.filter((x) => invoiceIsOpenBalance(x));
    const belongs = (doc: POSQuote | POSOrder | POSInvoice) =>
      documentBelongsToMatchedCustomers(doc, customerMatches);
    const notBlocked = (doc: POSQuote | POSOrder | POSInvoice) =>
      !checkoutSearchBlockedDocKeys.has(docEntryKey(doc));
    return {
      quotes: quotesForSearch.filter(belongs).filter(notBlocked).slice(0, 8),
      orders: ordersForSearch.filter(belongs).filter(notBlocked).slice(0, 8),
      invoices: openInvoices.filter(belongs).filter(notBlocked).slice(0, 8),
    };
  }, [customerMatches, quotes, orders, invoices, checkoutSearchBlockedDocKeys]);

  /** Text-based doc hits, minus rows already listed under customer match (no duplicates). */
  const docMatchesExcludingCustomerDocs = useMemo(() => {
    const seen = new Set<string>();
    for (const d of [...customerDocMatches.quotes, ...customerDocMatches.orders, ...customerDocMatches.invoices]) {
      seen.add(docEntryKey(d));
    }
    return {
      quotes: docMatches.quotes.filter((d) => !seen.has(docEntryKey(d))),
      orders: docMatches.orders.filter((d) => !seen.has(docEntryKey(d))),
      invoices: docMatches.invoices.filter((d) => !seen.has(docEntryKey(d))),
    };
  }, [customerDocMatches, docMatches]);

  const productStockById = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) map.set(p.id, Number(p.stockCount) || 0);
    return map;
  }, [products]);

  const showResultsPanel =
    showSearch &&
    searchQuery.trim().length > 0 &&
    (productResults.length > 0 ||
      customerMatches.length > 0 ||
      customerDocMatches.quotes.length +
        customerDocMatches.orders.length +
        customerDocMatches.invoices.length >
        0 ||
      docMatchesExcludingCustomerDocs.quotes.length +
        docMatchesExcludingCustomerDocs.orders.length +
        docMatchesExcludingCustomerDocs.invoices.length >
        0);

  const commitLineItemsUpdate = useCallback((recipe: (prev: CheckoutLineItem[]) => CheckoutLineItem[]) => {
    setLineItems((prev) => {
      const next = recipe(prev);
      if (next === prev) return prev;
      setLineItemsUndoStack((stack) =>
        [...stack, cloneCheckoutLineItems(prev)].slice(-LINE_ITEMS_UNDO_MAX)
      );
      return next;
    });
  }, []);

  const undoLastLineItemsChange = useCallback(() => {
    setLineItemsUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const snapshot = stack[stack.length - 1];
      setLineItems(cloneCheckoutLineItems(snapshot));
      return stack.slice(0, -1);
    });
  }, []);

  const addProduct = (p: Product) => {
    commitLineItemsUpdate((prev) =>
      mergeCheckoutLineItems(prev, [
        {
          product_id: p.id,
          product_name: p.name,
          product_image: p.image,
          part_number: p.partNumber,
          brand: p.brand,
          category: p.category,
          quantity: 1,
          unit_price: p.price,
          total: p.price,
          checkoutDirectQty: 1,
        },
      ])
    );
    setSearchQuery('');
    setShowSearch(false);
  };

  /** Same customer fields as hydrating checkout from a saved quote/order/invoice (Orders → Actions → Checkout). */
  const applyCustomerFromDocument = (doc: POSQuote | POSOrder | POSInvoice) => {
    setCustomerName(resolvedCheckoutDisplayName(doc, customers));
    setCustomerEmail(doc.customer_email || '');
    setCustomerPhone(displayUsPhoneFromStored(doc.customer_phone));
    setCustomerCompany((doc as POSQuote).customer_company || '');
    if (doc.customer_id) {
      const c = customers.find((x) => x.id === doc.customer_id);
      if (c) {
        setSelectedCustomer(c);
        setIsExistingCustomer(true);
      } else {
        setSelectedCustomer(null);
        setIsExistingCustomer(false);
      }
    } else {
      setSelectedCustomer(null);
      setIsExistingCustomer(false);
    }
  };

  const addItemsFromDoc = (doc: POSQuote | POSOrder | POSInvoice) => {
    const label = docNumberLabel(doc);
    commitLineItemsUpdate((prev) =>
      mergeCheckoutLineItems(
        prev,
        (doc.items || []).map((item) => {
          const base = normalizeLineItem(item);
          const q = Number(base.quantity) || 0;
          return {
            ...base,
            checkoutDocLabel: label,
            checkoutDocAllocations: q > 0 ? [{ label, qty: q }] : undefined,
            checkoutDirectQty: 0,
          };
        })
      )
    );
    setSearchQuery('');
    setShowSearch(false);
    if (!source) {
      applyCustomerFromDocument(doc);
    }
  };

  const updateQty = (idx: number, qty: number) => {
    const n = Number(qty);
    const q = !Number.isFinite(n) ? 0 : Math.max(0, Math.floor(n));
    commitLineItemsUpdate((prev) =>
      prev.map((item, i) => (i === idx ? adjustCheckoutLineQuantity(item, q) : item))
    );
  };

  const updatePrice = (idx: number, price: number) => {
    commitLineItemsUpdate((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, unit_price: price, total: item.quantity * price } : item
      )
    );
  };

  const clearAllLineItems = useCallback(() => {
    commitLineItemsUpdate((prev) => {
      if (prev.length === 0) return prev;
      return [];
    });
  }, [commitLineItemsUpdate]);

  const removeItem = useCallback(
    (idx: number) => {
      commitLineItemsUpdate((prev) => {
        if (!prev[idx]) return prev;
        return prev.filter((_, i) => i !== idx);
      });
    },
    [commitLineItemsUpdate]
  );

  const toggleLineIncluded = (idx: number) => {
    commitLineItemsUpdate((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, includeInTotal: it.includeInTotal === false } : it
      )
    );
  };

  const checkoutCustomerId =
    selectedCustomer?.id ||
    (source
      ? quotes.find((x) => String(x.id) === String(source?.sourceDocId))?.customer_id ||
        orders.find((x) => String(x.id) === String(source?.sourceDocId))?.customer_id ||
        invoices.find((x) => String(x.id) === String(source?.sourceDocId))?.customer_id
      : undefined);

  const checkoutCustomer = customers.find((c) => String(c.id) === String(checkoutCustomerId ?? ''));
  const accountBalance = Math.max(0, Number(checkoutCustomer?.account_balance ?? 0));
  const storeCredit = Math.max(0, Number(checkoutCustomer?.store_credit || 0));
  const accountBalanceDisplay = suppressCrmWalletDisplay ? 0 : accountBalance;
  const storeCreditDisplay = suppressCrmWalletDisplay ? 0 : storeCredit;

  /** Always matches Items section Total (cart fiscal − discount − prior payments on referenced invoices). */
  const amountDueForPayment = itemsSectionNetTotal;

  const PAY_EPS = 0.005;
  const safeAmountDue = Math.max(0, Number(amountDueForPayment) || 0);
  const safeStoreCredit = Math.max(0, Number(storeCreditDisplay) || 0);
  /** Customer can apply wallet credit whenever they have a balance, including if they also owe on open invoices. */
  const hasStoreCreditWallet = safeStoreCredit > PAY_EPS;

  const tenderTotal = useMemo(() => {
    if (allowMultiplePaymentMethods) {
      let s = 0;
      for (const m of tenderMethodsMulti) {
        s += Math.max(0, decimalInputToNumber(paymentInputsMulti[m] || ''));
      }
      return s;
    }
    return Math.max(0, decimalInputToNumber(paymentInput));
  }, [allowMultiplePaymentMethods, tenderMethodsMulti, paymentInputsMulti, paymentInput]);

  /** Credit applied to this invoice first (up to amount due), then tender covers the remainder. */
  const creditAppliedPreview =
    useStoreCredit && hasStoreCreditWallet ? Math.min(safeStoreCredit, safeAmountDue) : 0;

  /** Balance left on the customer’s store credit after this checkout (for the next transaction). */
  const storeCreditRemainingAfter = Math.max(0, safeStoreCredit - creditAppliedPreview);
  /** Amount still to cover with cash/card/bank/cheque after store credit. */
  const remainingAfterStoreCredit = Math.max(0, safeAmountDue - creditAppliedPreview);
  /** Tender in excess of amount owed — credits to store wallet when the sale completes (server ledger). */
  const overpaymentToStoreCredit = Math.max(0, tenderTotal - remainingAfterStoreCredit);
  /**
   * Projected store credit after this sale: remaining wallet after applying credit here,
   * plus overpayment from tender (credited via checkout API after the receipt is saved).
   */
  const totalStoreCreditAfterSale = storeCreditRemainingAfter + overpaymentToStoreCredit;
  const outstanding = Math.max(0, remainingAfterStoreCredit - tenderTotal);
  /** True when store credit alone covers the full amount due (no tender required). */
  const storeCreditCoversDue =
    useStoreCredit && hasStoreCreditWallet && remainingAfterStoreCredit <= 1e-6;

  /** Allow checkout when store credit is opted in, or tender entered, or nothing left to pay, or credit covers all. */
  const canCompletePayment =
    (!allowMultiplePaymentMethods || tenderMethodsMulti.length > 0) &&
    ((useStoreCredit && hasStoreCreditWallet) ||
      tenderTotal > PAY_EPS ||
      remainingAfterStoreCredit <= PAY_EPS ||
      storeCreditCoversDue);

  const paymentIsPartialOrOver = useMemo(
    () => isCheckoutPartialOrOverpayment(remainingAfterStoreCredit, tenderTotal),
    [remainingAfterStoreCredit, tenderTotal]
  );

  const identityAllowsPartialOrOver = hasIdentityForPartialOrOverpayment(
    customerName,
    customerEmail,
    customerPhone
  );
  const checkoutBlockedForWalkInSplitPay =
    paymentIsPartialOrOver && !identityAllowsPartialOrOver;

  const selectCustomerRow = (
    c: POSCustomer,
    options?: { appendCheckoutLinesFromEligibleDocs?: boolean }
  ) => {
    prevMatchedCustomerIdRef.current = c.id;
    setSelectedCustomer(c);
    setCustomerName(c.name);
    setCustomerEmail(c.email);
    setCustomerPhone(displayUsPhoneFromStored(c.phone));
    setCustomerCompany(c.company);
    setIsExistingCustomer(true);
    setShowCustomerDropdown(false);
    setCustomerSearch('');

    if (options?.appendCheckoutLinesFromEligibleDocs) {
      const { quotes: qRows, orders: oRows, invoices: iRows } = collectCheckoutEligibleDocsForCustomer(
        c,
        quotes,
        orders,
        invoices,
        checkoutSearchBlockedDocKeys
      );
      const docsToAdd = [...qRows, ...oRows, ...iRows];
      if (docsToAdd.length > 0) {
        commitLineItemsUpdate((prev) => {
          let next = prev;
          for (const doc of docsToAdd) {
            const label = docNumberLabel(doc);
            next = mergeCheckoutLineItems(
              next,
              (doc.items || []).map((item) => {
                const base = normalizeLineItem(item);
                const q = Number(base.quantity) || 0;
                return {
                  ...base,
                  checkoutDocLabel: label,
                  checkoutDocAllocations: q > 0 ? [{ label, qty: q }] : undefined,
                  checkoutDirectQty: 0,
                };
              })
            );
          }
          return next;
        });
      }
    }
  };

  const clearCustomerSection = useCallback(() => {
    prevMatchedCustomerIdRef.current = null;
    setSelectedCustomer(null);
    setIsExistingCustomer(false);
    setCustomerName(POS_DEFAULT_VISITOR_CUSTOMER_NAME);
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerCompany('');
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    setSuppressCrmWalletDisplay(true);
    setUseStoreCredit(false);
  }, []);

  const filteredCustomers = customerSearch.trim()
    ? customers
        .filter((c) =>
          `${c.name} ${c.email} ${c.phone} ${c.company}`.toLowerCase().includes(customerSearch.toLowerCase())
        )
        .slice(0, 10)
    : customers.slice(0, 10);

  useEffect(() => {
    if (selectedCustomer) setSuppressCrmWalletDisplay(false);
  }, [selectedCustomer]);

  useEffect(() => {
    if (allowMultiplePaymentMethods && tenderMethodsMulti.length === 0) {
      setTenderMethodsMulti(['cash']);
    }
  }, [allowMultiplePaymentMethods, tenderMethodsMulti.length]);

  const submitCheckout = async () => {
    if (lineItems.length === 0) {
      notify({ variant: 'error', title: 'Add at least one line item', subtitle: POS_CHECKOUT_WHERE });
      return;
    }
    if (!customerName.trim()) {
      notify({ variant: 'error', title: 'Enter a customer name', subtitle: POS_CHECKOUT_WHERE });
      return;
    }

    const itemsPayload = lineItemsForPersistence(lineItems);
    if (itemsPayload.length === 0) {
      notify({
        variant: 'error',
        title: 'Include at least one line in the total',
        subtitle: 'Check the box next to a line to include it in the price.',
      });
      return;
    }
    const lineErr = validateCheckoutLineItems(itemsPayload);
    if (lineErr) {
      notify({ variant: 'error', title: lineErr, subtitle: POS_CHECKOUT_WHERE });
      return;
    }

    const payPoolCents = moneyToCents(creditAppliedPreview) + moneyToCents(tenderTotal);
    const dueCentsForPay = moneyToCents(safeAmountDue);
    if (dueCentsForPay > 0 && Math.min(dueCentsForPay, payPoolCents) <= 0) {
      notify({
        variant: 'error',
        title: 'Enter payment',
        subtitle: `${POS_CHECKOUT_WHERE} — use store credit and/or amount received (cash, card, bank transfer, or cheque) when an amount is still owed.`,
      });
      return;
    }

    if (
      isCheckoutPartialOrOverpayment(remainingAfterStoreCredit, tenderTotal) &&
      !hasIdentityForPartialOrOverpayment(customerName, customerEmail, customerPhone)
    ) {
      notify({
        variant: 'error',
        title: 'Customer details required',
        subtitle:
          `${POS_CHECKOUT_WHERE} — for partial or overpayment, enter a real customer name (not Visitor/Guest) and an email or full phone number.`,
      });
      return;
    }

    setSaving(true);
    let receiptEmailedTo: string | undefined;
    try {
      let customerId: string | undefined = undefined;
      if (!isExistingCustomer && customerName.trim()) {
        const newCust = await saveCustomer({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          company: customerCompany,
        });
        if (newCust) {
          customerId = newCust.id;
          setSelectedCustomer(newCust);
          setCustomers((prev) => [...prev.filter((c) => c.id !== newCust.id), newCust]);
          setIsExistingCustomer(true);
        }
      }
      if (!customerId && selectedCustomer) customerId = selectedCustomer.id;
      if (!customerId && source) {
        customerId =
          quotes.find((x) => String(x.id) === String(source.sourceDocId))?.customer_id ||
          orders.find((x) => String(x.id) === String(source.sourceDocId))?.customer_id ||
          invoices.find((x) => String(x.id) === String(source.sourceDocId))?.customer_id;
      }

      const creditApplied = useStoreCredit ? Math.min(safeStoreCredit, safeAmountDue) : 0;
      const tenderAmt = tenderTotal;
      /** Full allocation (tender in hand + store credit used). Not capped at due — excess is overpayment → store credit. */
      const allocationThisCheckout = creditApplied + tenderAmt;
      const overpayToStoreCredit = Math.max(0, allocationThisCheckout - safeAmountDue);

      // Persistence: one invoice+order chain per unlinked document stream when the cart mixes them; otherwise a single chain.
      let persistResults: Array<{ invoice: POSInvoice | null; orderId?: string }> = [];
      let perStreamAllocations: number[] | null = null;
      /** Set for unlinked multi-stream checkout: totals and oldest→newest waterfall (for combined receipt `payment_type`). */
      let multiStreamSettlement: { streamTotals: number[]; perStreamAlloc: number[] } | null = null;

      if (source) {
        persistResults = [
          await persistCheckoutDocuments({
            source,
            itemsPayload,
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            subtotal,
            taxRate: gctPercentEffective,
            taxAmount,
            discountAmount,
            documentTotal,
            allocationThisCheckout,
            amountDueForPayment,
            quotes,
            orders,
            invoices,
          }),
        ];
      } else {
        const specs = buildCheckoutStreamSpecs(lineItems, quotes, orders, invoices);
        if (shouldUseMultiStreamCheckout(specs)) {
          const specsOrdered = sortCheckoutStreamSpecsOldestFirst(specs, quotes, orders, invoices);
          const fiscals = specsOrdered.map((s) =>
            computeStreamFiscalTotals(s.lines, gctPercentEffective, subtotal, taxAmount, discountAmount)
          );
          const streamCaps = specsOrdered.map((s, i) =>
            streamOutstandingWaterfallCap(s, fiscals[i], quotes, orders, invoices)
          );
          const streamTotals = fiscals.map((f) => f.documentTotal);
          const wf = allocatePaymentAcrossStreamsOldestFirst(streamCaps, creditApplied, tenderAmt);
          const perStream = wf.perStream;
          perStreamAllocations = perStream;
          multiStreamSettlement = { streamTotals, perStreamAlloc: perStream };
          for (let i = 0; i < specsOrdered.length; i++) {
            const sp = specsOrdered[i];
            const f = fiscals[i];
            const r = await persistCheckoutDocuments({
              source: sp.source,
              itemsPayload: lineItemsForPersistence(sp.lines),
              customerId,
              customerName,
              customerEmail,
              customerPhone,
              subtotal: f.subtotal,
              taxRate: gctPercentEffective,
              taxAmount: f.taxAmount,
              discountAmount: f.discountAmount,
              documentTotal: f.documentTotal,
              allocationThisCheckout: perStreamAllocations[i] ?? 0,
              amountDueForPayment: streamCaps[i] ?? f.documentTotal,
              quotes,
              orders,
              invoices,
            });
            persistResults.push(r);
          }
        } else if (specs.length === 1) {
          const spec = specs[0];
          const inferred = inferStandalonePersistSource(spec, quotes, orders, invoices);
          const f = computeStreamFiscalTotals(spec.lines, gctPercentEffective, subtotal, taxAmount, discountAmount);
          const streamCap = streamOutstandingWaterfallCap(spec, f, quotes, orders, invoices);
          persistResults = [
            await persistCheckoutDocuments({
              source: inferred,
              itemsPayload: lineItemsForPersistence(spec.lines),
              customerId,
              customerName,
              customerEmail,
              customerPhone,
              subtotal: f.subtotal,
              taxRate: gctPercentEffective,
              taxAmount: f.taxAmount,
              discountAmount: f.discountAmount,
              documentTotal: f.documentTotal,
              allocationThisCheckout,
              amountDueForPayment: streamCap,
              quotes,
              orders,
              invoices,
            }),
          ];
        } else {
          persistResults = [
            await persistCheckoutDocuments({
              source: null,
              itemsPayload,
              customerId,
              customerName,
              customerEmail,
              customerPhone,
              subtotal,
              taxRate: gctPercentEffective,
              taxAmount,
              discountAmount,
              documentTotal,
              allocationThisCheckout,
              amountDueForPayment,
              quotes,
              orders,
              invoices,
            }),
          ];
        }
      }

      const invoice = persistResults[0]?.invoice ?? null;
      const orderId = persistResults[0]?.orderId;

      if (invoice && creditApplied > 0) {
        const payCustomerIdRaw =
          invoice.customer_id || customerId || checkoutCustomerId;
        const payCustomerId = payCustomerIdRaw != null ? String(payCustomerIdRaw).trim() : '';
        if (payCustomerId) {
          const nextSc = await deductCustomerStoreCredit(payCustomerId, creditApplied);
          if (nextSc !== null) {
            setCustomers((prev) =>
              prev.map((c) =>
                String(c.id) === String(payCustomerId) ? { ...c, store_credit: nextSc } : c
              )
            );
            void onCustomersRefresh?.();
          } else {
            notify({
              variant: 'error',
              title: 'Store credit was not updated',
              subtitle: 'The sale was saved; check the customer’s store credit in CRM and adjust if needed.',
            });
          }
        } else {
          notify({
            variant: 'error',
            title: 'Store credit was not deducted',
            subtitle:
              'Link this sale to a CRM customer (pick them from search or ensure the invoice has a customer id), then try again or adjust store credit manually.',
          });
        }
      }

      // Push payment + lines to each linked quote/order row (one pass per saved invoice).
      await Promise.all(
        persistResults
          .filter((pr): pr is { invoice: POSInvoice; orderId?: string } => !!pr.invoice)
          .map((pr) => propagateInvoiceToLinkedRecords(pr.invoice))
      );

      const withInv = persistResults.filter((p) => p.invoice);
      const receiptWeights = withInv.map((pr) => num(pr.invoice?.total ?? 0));
      const creditParts = splitProportionally(creditApplied, receiptWeights);
      const tenderParts = splitProportionally(tenderAmt, receiptWeights);

      const receiptPayMethod = buildSuggestedReceiptPaymentMethodLabel({
        tenderTotal: tenderAmt,
        allowMultiplePaymentMethods,
        tenderMethodsMulti,
        paymentMethod,
        creditApplied,
      });

      const sendReceiptEmail = async (rec: POSReceipt, mailDoc: PrintDocProps) => {
        const emailTo = String(customerEmail || '').trim();
        if (!isValidEmailFormatForForms(emailTo)) return;
        try {
          const emailHtml = generateEmailHTML(mailDoc);
          const emailResult = await sendEmail({
            to: emailTo,
            toName: (customerName || '').trim() || undefined,
            subject: `Your receipt ${rec.receipt_number} from Voltz Industrial Supply`,
            htmlBody: emailHtml,
            documentType: 'receipt',
            documentId: String(rec.id),
            documentNumber: rec.receipt_number,
          });
          if (emailResult.success) {
            receiptEmailedTo = emailTo;
          } else {
            notify({
              variant: 'error',
              title: emailResult.error || 'Receipt could not be emailed',
              subtitle: `${rec.receipt_number} was saved`,
            });
          }
        } catch (emailErr) {
          console.error('Receipt email failed:', emailErr);
          notify({
            variant: 'error',
            title: 'Receipt could not be emailed',
            subtitle: `${rec.receipt_number} was saved`,
          });
        }
      };

      if (withInv.length > 1) {
        const primaryInv = withInv[0].invoice!;
        /** Sum of saved invoice totals — matches what the customer pays; checkout `documentTotal` can differ by cents. */
        const perStreamInvoiceTotals = withInv.map((pr) => {
          const inv = pr.invoice!;
          return num(inv.total);
        });
        const combinedSettlementTotal = Math.round(perStreamInvoiceTotals.reduce((a, b) => a + b, 0) * 100) / 100;
        const invLines = withInv.map((pr) => {
          const inv = pr.invoice!;
          const ord = pr.orderId ? orders.find((x) => String(x.id) === String(pr.orderId)) : undefined;
          const parts = [`${inv.invoice_number} ${fmtMoney(num(inv.total))}`];
          if (ord?.order_number) parts.push(`Order ${ord.order_number}`);
          return parts.join(' · ');
        });
        const noteParts: string[] = [`Settlement for invoices: ${invLines.join(' | ')}`];
        if (creditApplied > 0) noteParts.push(`Store credit ${fmtMoney(creditApplied)}`);
        if (allowMultiplePaymentMethods && tenderMethodsMulti.length > 0) {
          const br = tenderMethodsMulti
            .map((m) =>
              `${tenderMethodLabel(m)} ${fmtMoney(Math.max(0, decimalInputToNumber(paymentInputsMulti[m] || '')))}`
            )
            .join(' · ');
          if (br.trim()) noteParts.push(br);
        } else if (tenderAmt > 0) {
          noteParts.push(`${tenderMethodLabel(paymentMethod)} ${fmtMoney(tenderAmt)}`);
        }
        let combinedBalanceDueCents = 0;
        for (let pi = 0; pi < persistResults.length; pi++) {
          const pr = persistResults[pi];
          if (!pr.invoice) continue;
          const inv = pr.invoice!;
          const alloc = perStreamAllocations ? perStreamAllocations[pi]! : allocationThisCheckout;
          combinedBalanceDueCents += balanceDueBeforePaymentCents(inv, alloc);
        }
        const payType = receiptPaymentTypeFromReceivedVsCombinedBalanceCents(
          moneyToCents(allocationThisCheckout),
          combinedBalanceDueCents
        );
        const receiptNo = await generateDocNumber('receipt');
        const rec = await saveReceipt({
          receipt_number: receiptNo,
          invoice_id: primaryInv.id,
          customer_id: primaryInv.customer_id,
          customer_name: primaryInv.customer_name,
          payment_method: receiptPayMethod,
          status: 'approved',
          payment_type: payType,
          amount_paid: allocationThisCheckout,
          items: itemsPayload,
          total: combinedSettlementTotal,
          notes: noteParts.join(' — '),
        });
        if (!rec) throw new Error('Receipt could not be saved');

        const receiptDocHtml = buildQuotationDocumentHtml(
          {
            type: 'receipt',
            docNumber: rec.receipt_number,
            date: rec.created_at || new Date().toISOString(),
            customerName: primaryInv.customer_name || customerName,
            customerEmail: customerEmail.trim(),
            customerPhone: primaryInv.customer_phone || customerPhone,
            customerCompany: customerCompany,
            customerAccountNo: primaryInv.customer_id || customerId,
            items: itemsPayload,
            subtotal,
            taxRate: gctPercentEffective,
            taxAmount,
            discountAmount,
            total: combinedSettlementTotal,
            amountPaid: num(rec.amount_paid),
            amountReceivedTender: tenderAmt,
            paymentMethod: rec.payment_method,
            notes: rec.notes || '',
            status: rec.status || primaryInv.status,
          },
          loadContactDetails(),
          {
            mode: 'email',
            companyName: 'Voltz Industrial Supply',
            previewLayout: 'compact',
          }
        );
        setReceiptPreviewHtml(buildQuotationPreviewSrcDoc(receiptDocHtml));
        setReceiptPreviewOpen(true);

        const mailDoc: PrintDocProps = {
          type: 'receipt',
          docNumber: rec.receipt_number,
          date: rec.created_at || new Date().toISOString(),
          customerName: primaryInv.customer_name || customerName,
          customerEmail: String(customerEmail || '').trim(),
          customerPhone: primaryInv.customer_phone || customerPhone,
          customerCompany: customerCompany,
          customerAccountNo: primaryInv.customer_id || customerId,
          items: itemsPayload,
          subtotal,
          taxRate: gctPercentEffective,
          taxAmount,
          discountAmount,
          total: combinedSettlementTotal,
          amountPaid: num(rec.amount_paid),
          amountReceivedTender: tenderAmt,
          paymentMethod: rec.payment_method,
          notes: rec.notes || '',
          status: rec.status || primaryInv.status,
        };
        await sendReceiptEmail(rec, mailDoc);
      } else {
        for (let ridx = 0; ridx < persistResults.length; ridx++) {
          const pr = persistResults[ridx];
          if (!pr.invoice) continue;
          const inv = pr.invoice!;
          const allocationForReceipt = perStreamAllocations ? perStreamAllocations[ridx]! : allocationThisCheckout;
          const crPart = creditParts[ridx] ?? 0;
          const tnPart = tenderParts[ridx] ?? 0;
          const owedBeforeCents = balanceDueBeforePaymentCents(inv, allocationForReceipt);
          const payType = receiptPaymentTypeFromReceivedVsCombinedBalanceCents(
            moneyToCents(allocationForReceipt),
            owedBeforeCents
          );
          const noteParts: string[] = [];
          if (pr.orderId) noteParts.push(`Order Ref: ${pr.orderId}`);
          if (crPart > 0) noteParts.push(`Store credit ${fmtMoney(crPart)}`);
          if (allowMultiplePaymentMethods && tenderMethodsMulti.length > 0) {
            const br = tenderMethodsMulti
              .map((m) =>
                `${tenderMethodLabel(m)} ${fmtMoney(Math.max(0, decimalInputToNumber(paymentInputsMulti[m] || '')))}`
              )
              .join(' · ');
            if (br.trim()) noteParts.push(br);
          } else if (tenderAmt > 0) {
            noteParts.push(`${tenderMethodLabel(paymentMethod)} ${fmtMoney(tnPart)}`);
          }
          const receiptNo = await generateDocNumber('receipt');
          const rec = await saveReceipt({
            receipt_number: receiptNo,
            invoice_id: inv.id,
            customer_id: inv.customer_id,
            customer_name: inv.customer_name,
            payment_method: receiptPayMethod,
            status: 'approved',
            payment_type: payType,
            amount_paid: allocationForReceipt,
            items: inv.items,
            total: inv.total,
            notes: noteParts.join(' — '),
          });
          if (!rec) throw new Error('Receipt could not be saved');

          const receiptDocHtml = buildQuotationDocumentHtml(
            {
              type: 'receipt',
              docNumber: rec.receipt_number,
              date: rec.created_at || new Date().toISOString(),
              customerName: inv.customer_name || customerName,
              customerEmail: customerEmail.trim(),
              customerPhone: inv.customer_phone || customerPhone,
              customerCompany: customerCompany,
              customerAccountNo: inv.customer_id || customerId,
              items: inv.items || itemsPayload,
              subtotal: num(inv.subtotal),
              taxRate: num(inv.tax_rate),
              taxAmount: num(inv.tax_amount),
              discountAmount: num(inv.discount_amount),
              total: num(inv.total),
              amountPaid: num(rec.amount_paid),
              amountReceivedTender: tnPart,
              paymentMethod: rec.payment_method,
              notes: rec.notes || '',
              status: rec.status || inv.status,
            },
            loadContactDetails(),
            {
              mode: 'email',
              companyName: 'Voltz Industrial Supply',
              previewLayout: 'compact',
            }
          );
          setReceiptPreviewHtml(buildQuotationPreviewSrcDoc(receiptDocHtml));
          setReceiptPreviewOpen(true);

          const mailDoc: PrintDocProps = {
            type: 'receipt',
            docNumber: rec.receipt_number,
            date: rec.created_at || new Date().toISOString(),
            customerName: inv.customer_name || customerName,
            customerEmail: String(customerEmail || '').trim(),
            customerPhone: inv.customer_phone || customerPhone,
            customerCompany: customerCompany,
            customerAccountNo: inv.customer_id || customerId,
            items: inv.items || itemsPayload,
            subtotal: num(inv.subtotal),
            taxRate: num(inv.tax_rate),
            taxAmount: num(inv.tax_amount),
            discountAmount: num(inv.discount_amount),
            total: num(inv.total),
            amountPaid: num(rec.amount_paid),
            amountReceivedTender: tnPart,
            paymentMethod: rec.payment_method,
            notes: rec.notes || '',
            status: rec.status || inv.status,
          };
          await sendReceiptEmail(rec, mailDoc);
        }
      }

      const overpayInvoice = persistResults.find((p) => p.invoice)?.invoice;
      const creditCustomerIdOverpay = String(overpayInvoice?.customer_id || customerId || '').trim() || '';
      if (overpayToStoreCredit > PAY_EPS && creditCustomerIdOverpay) {
        const nextAfterOverpay = await addCustomerStoreCredit(creditCustomerIdOverpay, overpayToStoreCredit);
        if (nextAfterOverpay !== null) {
          setCustomers((prev) =>
            prev.map((c) =>
              String(c.id) === String(creditCustomerIdOverpay) ? { ...c, store_credit: nextAfterOverpay } : c
            )
          );
          void onCustomersRefresh?.();
        } else {
          notify({
            variant: 'error',
            title: 'Overpayment was not added to store credit',
            subtitle: `The receipt was saved; add ${fmtMoney(overpayToStoreCredit)} manually in POS → Customers if needed.`,
          });
        }
      }

      // Per line item → aggregate by product_id → update CMS product (inventory) for each SKU sold.
      if (itemsPayload.length > 0) {
        const { allOk, nextStockById, missingProductIds } = await applyInventoryDeductionsForLineItems(
          itemsPayload,
          products,
          updateProductStockCount
        );
        if (missingProductIds.length > 0) {
          notify({
            variant: 'error',
            title: 'Checkout saved, but some products are not in the catalog',
            subtitle: `${missingProductIds.slice(0, 5).join(', ')}${missingProductIds.length > 5 ? '…' : ''}`,
          });
        } else if (!allOk) {
          notify({
            variant: 'error',
            title: 'Checkout saved, but stock update failed for some items',
            subtitle: POS_CHECKOUT_WHERE,
          });
        } else if (nextStockById.size > 0) {
          setProducts((prev) =>
            prev.map((p) =>
              nextStockById.has(p.id)
                ? {
                    ...p,
                    stockCount: nextStockById.get(p.id) ?? 0,
                    inStock: (nextStockById.get(p.id) ?? 0) > 0,
                  }
                : p
            )
          );
        }
      }

      // Reset form for the next sale; receipt preview stays open until the user closes it.
      setLineItems([]);
      setLineItemsUndoStack([]);
      setItemsTableColLayout([...POS_ITEMS_TABLE_COL_DEFAULTS]);
      setSearchQuery('');
      setShowSearch(false);
      setDiscountInput('');
      setPaymentInput('');
      setPaymentInputsMulti({ cash: '', card: '', bank_transfer: '', cheque: '' });
      setAllowMultiplePaymentMethods(false);
      setTenderMethodsMulti(['cash']);
      setUseStoreCredit(false);
      setPaymentMethod('cash');
      setSelectedCustomer(null);
      setIsExistingCustomer(false);
      prevMatchedCustomerIdRef.current = null;
      setCustomerName(POS_DEFAULT_VISITOR_CUSTOMER_NAME);
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerCompany('');
      setCustomerSearch('');
      setShowCustomerDropdown(false);
      setSuppressCrmWalletDisplay(true);
      // Keep completion fast: refresh reference lists in background.
      void (async () => {
        try {
          const [qNext, oNext, iNext, freshCust] = await Promise.all([
            fetchQuotes(),
            fetchOrders(),
            fetchInvoices(),
            fetchCustomers(),
          ]);
          setQuotes(qNext);
          setOrders(oNext);
          setInvoices(iNext);
          setCustomers(freshCust);
        } catch (e) {
          console.error('background checkout refresh:', e);
        }
      })();
      void (async () => {
        const v = await fetchConfig('pos_default_tax_rate');
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n) && n >= 0) setTaxRate(n);
        else setTaxRate(0);
      })();

      notify({
        variant: 'success',
        title: 'Checkout completed',
        subtitle: receiptEmailedTo
          ? `${POS_CHECKOUT_WHERE} — receipt emailed to ${receiptEmailedTo}`
          : POS_CHECKOUT_WHERE,
      });
    } catch (err) {
      console.error('Checkout failed:', err);
      const detail = err instanceof Error && err.message ? err.message : POS_CHECKOUT_WHERE;
      notify({ variant: 'error', title: 'Could not complete checkout', subtitle: detail });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-gray-500">Loading checkout...</div>;

  const isQuotePayingLinkedOpenInvoice =
    source?.sourceType === 'quote' &&
    (() => {
      const q = quotes.find((x) => String(x.id) === String(source.sourceDocId));
      if (!q?.invoice_id) return false;
      const inv = invoices.find((x) => String(x.id) === String(q.invoice_id));
      return !!(inv && invoiceIsOpenBalance(inv));
    })();

  const isOrderPayingLinkedOpenInvoice =
    source?.sourceType === 'order' &&
    (() => {
      const ord = orders.find((x) => String(x.id) === String(source.sourceDocId));
      if (!ord?.invoice_id) return false;
      const inv = invoices.find((x) => String(x.id) === String(ord.invoice_id));
      return !!(inv && invoiceIsOpenBalance(inv));
    })();

  return (
    <div className={`${POS_PAGE_MAX} space-y-6`}>
      {receiptPreviewOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={dismissReceiptPreview} />
          <div className="relative z-[111] w-[min(96vw,980px)] max-h-[92vh] rounded-xl bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a2332]">Receipt Preview</h3>
              <button
                type="button"
                onClick={dismissReceiptPreview}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="p-3 sm:p-4 bg-white">
              <iframe
                title="Receipt Preview"
                className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm"
                srcDoc={receiptPreviewHtml}
              />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-gradient-to-r from-[#1a2332] to-[#24344a] p-6 text-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (onBack ? onBack() : onDone())}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold tracking-tight">Checkout Center</h2>
        </div>
        <p className="text-sm text-white/80 mt-1">
          Search products, or customers by name or Contact # — matching customers show their quotes, orders, and open invoices to add lines and fill customer details. You can also search by document # or line text.
        </p>
      </div>

      <div className={POS_SEARCH_CARD}>
      <div ref={searchRef} className="relative flex gap-2 items-stretch">
        <div className="relative flex-1 min-w-0">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearch(true);
            }}
            onFocus={() => setShowSearch(true)}
            placeholder="Product name, barcode, part #, description · Customer name or Contact # · Quote #, order #, invoice #"
            className={cn(POS_QUICK_SEARCH_INPUT, 'pl-10 pr-4 py-3 rounded-lg placeholder:text-gray-400')}
          />
        </div>
        {searchQuery.trim() ? (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
            className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        ) : null}
        {showResultsPanel && (
          <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-[28rem] overflow-y-auto">
            {productResults.length > 0 && (
              <div className="p-2 border-b border-gray-100">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Products</p>
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 rounded-lg"
                  >
                    {p.image ? (
                      <img src={resolveMediaUrl(p.image)} alt="" className="w-11 h-11 rounded-lg object-cover border" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a2332] truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{productNameToCode(p.name)}</p>
                      <div className="flex gap-2 text-xs text-gray-400">
                        {p.partNumber && <span>{p.partNumber}</span>}
                        {p.brand && <span>{p.brand}</span>}
                        <span className={(Number(p.stockCount) || 0) > 0 ? 'text-emerald-600' : 'text-red-500'}>
                          In stock: {Number(p.stockCount) || 0}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#1a2332]">{fmtMoney(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
            {customerMatches.length > 0 && (
              <div className="p-2 border-b border-gray-100">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Customers</p>
                {customerMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      selectCustomerRow(c, { appendCheckoutLinesFromEligibleDocs: true });
                      setSearchQuery('');
                      setShowSearch(false);
                    }}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 rounded-lg"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a2332] truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">
                        Contact #{' '}
                        <span className="font-mono tabular-nums">
                          {c.phone?.trim()
                            ? displayUsPhoneFromStored(c.phone)
                            : '—'}
                        </span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {(customerDocMatches.quotes.length > 0 ||
              customerDocMatches.orders.length > 0 ||
              customerDocMatches.invoices.length > 0) && (
              <div className="p-2 border-b border-gray-100">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Customer documents
                </p>
                <p className="px-2 pb-1 text-[11px] text-gray-400">
                  Add all lines from the record and fill customer details
                </p>
                {customerDocMatches.quotes.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addItemsFromDoc(d)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-blue-50/80 rounded-lg"
                  >
                    <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-[#1a2332]">{d.quote_number}</span>
                    <span className="text-xs text-gray-500 truncate">{d.customer_name}</span>
                  </button>
                ))}
                {customerDocMatches.orders.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addItemsFromDoc(d)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-amber-50/80 rounded-lg"
                  >
                    <ShoppingCart className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-[#1a2332]">{d.order_number}</span>
                    <span className="text-xs text-gray-500 truncate">{d.customer_name}</span>
                  </button>
                ))}
                {customerDocMatches.invoices.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addItemsFromDoc(d)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-green-50/80 rounded-lg"
                  >
                    <Receipt className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-[#1a2332]">{d.invoice_number}</span>
                    <span className="text-xs text-gray-500 truncate">{d.customer_name}</span>
                  </button>
                ))}
              </div>
            )}
            {(docMatchesExcludingCustomerDocs.quotes.length > 0 ||
              docMatchesExcludingCustomerDocs.orders.length > 0 ||
              docMatchesExcludingCustomerDocs.invoices.length > 0) && (
              <div className="p-2">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Documents (add all lines)</p>
                {docMatchesExcludingCustomerDocs.quotes.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addItemsFromDoc(d)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-blue-50/80 rounded-lg"
                  >
                    <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-[#1a2332]">{d.quote_number}</span>
                    <span className="text-xs text-gray-500 truncate">{d.customer_name}</span>
                  </button>
                ))}
                {docMatchesExcludingCustomerDocs.orders.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addItemsFromDoc(d)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-amber-50/80 rounded-lg"
                  >
                    <ShoppingCart className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-[#1a2332]">{d.order_number}</span>
                    <span className="text-xs text-gray-500 truncate">{d.customer_name}</span>
                  </button>
                ))}
                {docMatchesExcludingCustomerDocs.invoices.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addItemsFromDoc(d)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-green-50/80 rounded-lg"
                  >
                    <Receipt className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-[#1a2332]">{d.invoice_number}</span>
                    <span className="text-xs text-gray-500 truncate">{d.customer_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div ref={customerDropdownRef} className={`${POS_SURFACE_RAISED} px-4 py-3 space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider leading-none">Customer</p>
                <button
                  type="button"
                  onClick={clearCustomerSection}
                  className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-2 items-stretch">
                <div className="relative flex-1 min-w-0">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Search existing customer…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomerRow(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-gray-500 text-xs ml-2">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {customerSearch.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearch('');
                      setShowCustomerDropdown(false);
                    }}
                    className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 self-stretch"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === POS_DEFAULT_VISITOR_CUSTOMER_NAME) {
                      e.target.select();
                    }
                  }}
                  placeholder="Name *"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={14}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhoneUsMask(digitsFromPhoneInput(e.target.value)))}
                  placeholder="(876) 123-4567"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono tracking-tight"
                />
                <input
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder="Company"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

          <div className={`${POS_SURFACE_RAISED} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-[#1a2332] flex items-center justify-between gap-3 min-w-0">
              <span className="shrink-0">Items</span>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 justify-end">
                <span className="text-xs font-normal text-gray-400 shrink-0 tabular-nums">
                  {lineItems.length} line(s)
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={undoLastLineItemsChange}
                    disabled={saving || lineItemsUndoStack.length === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                    title={
                      lineItemsUndoStack.length > 0
                        ? 'Undo last change in Items (up to 50 steps)'
                        : 'Nothing to undo'
                    }
                    aria-label={
                      lineItemsUndoStack.length > 0
                        ? 'Undo last change in Items'
                        : 'Undo (nothing to restore)'
                    }
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={clearAllLineItems}
                    disabled={saving || lineItems.length === 0}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-500 leading-snug border-b border-gray-100 bg-gray-50/60">
              Adding quotes, orders, or invoices from search only links them to this checkout so you can pay more than one
              document in a single transaction — it does not change each document&apos;s balance until you complete payment.
            </p>
            <div className="bg-[#1a2332] text-white px-4 py-2">
              <PanelGroup
                direction="horizontal"
                className="w-full items-stretch min-h-0"
                onLayout={onItemsTableLayout}
                autoSaveId="pos-checkout-items-table"
              >
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[0]}
                  minSize={4}
                  maxSize={4}
                  id="pos-items-col-include"
                  className="min-w-0 flex items-center"
                >
                  <div className="w-full flex items-center justify-center" title="Include in total">
                    <span className="sr-only">Include in total</span>
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/60" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[1]}
                  minSize={12}
                  id="pos-items-col-product"
                  className="min-w-0 flex items-center"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider truncate pr-1">Product</div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/60" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[2]}
                  minSize={8}
                  id="pos-items-col-doc"
                  className="min-w-0 flex items-center justify-center"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider w-full text-center">Doc No.</div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/60" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[3]}
                  minSize={8}
                  id="pos-items-col-qty"
                  className="min-w-0 flex items-center justify-center"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider">Qty</div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/60" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[4]}
                  minSize={8}
                  id="pos-items-col-price"
                  className="min-w-0 flex items-center justify-end"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider">Price</div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/60" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[5]}
                  minSize={8}
                  id="pos-items-col-total"
                  className="min-w-0 flex items-center justify-end"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider">Total</div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/60" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_ITEMS_TABLE_COL_DEFAULTS[6]}
                  minSize={6}
                  maxSize={12}
                  id="pos-items-col-remove"
                  className="min-w-0 flex items-center justify-end"
                >
                  <span className="sr-only">Row actions</span>
                </Panel>
              </PanelGroup>
            </div>
            {lineItems.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-400 text-sm">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No items yet. Use the search bar above to add products or document lines.
              </div>
            ) : (
              lineItems.map((item, idx) => {
                const included = item.includeInTotal !== false;
                const rowMuted = !included ? 'opacity-40' : '';
                return (
                <div
                  key={`${item.product_id}-${idx}`}
                  className="px-4 py-3 grid gap-x-0 gap-y-1 items-center border-b border-gray-50 last:border-0"
                  style={{ gridTemplateColumns: itemsTableGridTemplateColumns }}
                >
                  <div className="flex w-full min-w-0 shrink-0 items-center justify-center self-center px-1">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => toggleLineIncluded(idx)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-blue-400 text-blue-600 focus:ring-2 focus:ring-blue-500/35 focus:ring-offset-0 shrink-0 accent-blue-600"
                      aria-label="Include line in total"
                    />
                  </div>
                  <div className={`flex items-center gap-2 min-w-0 px-1 ${rowMuted}`}>
                    {item.product_image ? (
                      <img src={resolveMediaUrl(item.product_image)} alt="" className="w-9 h-9 rounded-lg object-cover border flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1a2332] truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {(item.part_number || item.brand || '')}
                        {`  `}
                        <span className={(productStockById.get(item.product_id) || 0) > 0 ? 'text-emerald-600' : 'text-red-500'}>
                          In stock: {productStockById.get(item.product_id) || 0}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div
                    className={`min-w-0 flex w-full flex-col justify-center pl-px pr-px text-left ${
                      (item.checkoutDirectQty ?? 0) > 0 && item.checkoutDocLabel?.trim()
                        ? 'items-start gap-0 pt-0.5'
                        : 'items-start'
                    } ${rowMuted}`}
                  >
                    <CheckoutDocumentColumnCell item={item} />
                  </div>
                  <div className={`flex items-center justify-center gap-1 min-w-0 px-1 ${rowMuted}`}>
                    <button
                      type="button"
                      onClick={() => updateQty(idx, Math.max(0, item.quantity - 1))}
                      className="w-5 h-5 shrink-0 rounded bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-2 h-2" strokeWidth={2.5} />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          commitLineItemsUpdate((prev) =>
                            prev.map((it, i) =>
                              i === idx ? adjustCheckoutLineQuantity(it, 0) : it
                            )
                          );
                          return;
                        }
                        const nextQty = parseInt(raw, 10);
                        if (!Number.isNaN(nextQty)) {
                          commitLineItemsUpdate((prev) =>
                            prev.map((it, i) =>
                              i === idx ? adjustCheckoutLineQuantity(it, Math.max(0, nextQty)) : it
                            )
                          );
                        }
                      }}
                      onBlur={() => {
                        commitLineItemsUpdate((prev) =>
                          prev.map((it, i) =>
                            i === idx && !Number.isFinite(it.quantity)
                              ? adjustCheckoutLineQuantity(it, 0)
                              : it
                          )
                        );
                      }}
                      className={`w-full min-w-0 max-w-[5rem] text-center text-sm border border-gray-200 rounded-md py-1 px-1 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                    />
                    <button
                      type="button"
                      onClick={() => updateQty(idx, item.quantity + 1)}
                      className="w-5 h-5 shrink-0 rounded bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-2 h-2" strokeWidth={2.5} />
                    </button>
                  </div>
                  <div className={`text-right px-1 ${rowMuted}`}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.unit_price === 0 ? '' : String(item.unit_price)}
                      onChange={(e) => {
                        const t = e.target.value.trim().replace(/,/g, '');
                        if (t === '' || t === '.') {
                          updatePrice(idx, 0);
                          return;
                        }
                        const n = parseFloat(t);
                        if (!Number.isNaN(n)) updatePrice(idx, n);
                      }}
                      onBlur={(e) => {
                        const n = decimalInputToNumber(e.target.value);
                        updatePrice(idx, n);
                      }}
                      className={`w-full text-right text-sm border border-gray-200 rounded-md py-1 px-1 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                    />
                  </div>
                  <div className={`text-right text-sm font-semibold tabular-nums px-1 ${rowMuted}`}>{fmtMoney(item.total)}</div>
                  <div className={`flex justify-end pl-1 ${rowMuted}`}>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
              })
            )}

            <div className="px-4 py-3 space-y-2 border-t border-gray-100 bg-gray-50/80">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">GCT</span>
                <span className="font-semibold">{fmtMoney(taxAmount)}</span>
              </div>
              {showPerStreamPriorPaymentRows
                ? checkoutStreamsSorted.map((spec) => {
                    const inv = invoiceWithPriorPaymentForStream(spec, quotes, orders, invoices);
                    if (!inv) return null;
                    return (
                      <div key={spec.key} className="flex justify-between text-sm gap-2">
                        <span className="text-gray-500 inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                          <span>Payments Already Received</span>
                          <span className="text-[11px] font-medium leading-snug text-[#1a2332] tabular-nums [overflow-wrap:anywhere]">
                            ({inv.invoice_number})
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums text-gray-700">
                          ({fmtMoney(num(inv.amount_paid))})
                        </span>
                      </div>
                    );
                  })
                : invoicesWithPriorPaymentInCart.length > 0 && (
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-gray-500 inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                        <span>Payments Already Received</span>
                        {meaningfulCheckoutDocNoCount > 1 ? (
                          <span className="text-[11px] font-medium leading-snug text-[#1a2332] tabular-nums [overflow-wrap:anywhere]">
                            ({invoicesWithPriorPaymentInCart.map((i) => i.invoice_number).join(' · ')})
                          </span>
                        ) : null}
                      </span>
                      <span className="font-semibold tabular-nums text-gray-700">
                        (
                        {invoicesWithPriorPaymentInCart.map((i) => fmtMoney(num(i.amount_paid))).join(' · ')}
                        )
                      </span>
                    </div>
                  )}
              <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-500 shrink-0">Discount</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className={`w-28 text-right border border-gray-200 rounded-md py-1 px-2 text-sm ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                  />
                </div>
                <span className="font-semibold tabular-nums text-gray-700 shrink-0">
                  ({fmtMoney(discountAmount)})
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#1a2332] pt-1 border-t border-gray-200">
                <span>Total</span>
                <span>{fmtMoney(itemsSectionNetTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`w-full h-fit space-y-4 ${POS_SURFACE_RAISED} p-4 lg:z-10 lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:self-start lg:sticky lg:top-[4.5rem]`}
        >
          <h3 className="font-bold text-[#1a2332]">Payment</h3>
          <div className="text-sm space-y-3">
            <div>
              <p className="text-gray-500">
                {source?.sourceType === 'invoice' ||
                isQuotePayingLinkedOpenInvoice ||
                isOrderPayingLinkedOpenInvoice
                  ? 'Amount Due on invoice(s)'
                  : 'Total'}
              </p>
              <p className="text-xl font-bold text-[#1a2332] tabular-nums">{fmtMoney(itemsSectionNetTotal)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Customer Balance</p>
              <p className="text-sm font-semibold flex items-center gap-1.5 tabular-nums text-amber-900">
                <Building2 className="w-4 h-4 shrink-0" aria-hidden />
                {fmtMoney(accountBalanceDisplay)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Sum of balance due on invoices in Unpaid or Partially Paid status for this customer.
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Store credit</p>
              <p className="text-sm font-semibold flex items-center gap-1.5 tabular-nums text-green-800">
                <Wallet className="w-4 h-4 shrink-0" aria-hidden />
                {fmtMoney(safeStoreCredit)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">Available before this sale (CRM wallet).</p>
            </div>
            {(safeStoreCredit > PAY_EPS || overpaymentToStoreCredit > PAY_EPS || creditAppliedPreview > PAY_EPS) && (
              <div className="pt-1 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-0.5">Total store credit (after this sale)</p>
                <p className="text-sm font-semibold tabular-nums text-[#1a2332]">{fmtMoney(totalStoreCreditAfterSale)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Remaining wallet after this checkout plus any overpayment from tender below.
                </p>
              </div>
            )}
            {hasStoreCreditWallet ? (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useStoreCredit}
                  onChange={(e) => setUseStoreCredit(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Pay with store credit
              </label>
            ) : (
              <p className="text-[11px] text-gray-500">No store credit available for this customer.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs text-gray-500">Payment Method</p>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={allowMultiplePaymentMethods}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAllowMultiplePaymentMethods(on);
                    if (on) {
                      setTenderMethodsMulti(sortTenderMethods([paymentMethod]));
                      setPaymentInputsMulti((prev) => ({ ...prev, [paymentMethod]: paymentInput }));
                    } else {
                      const first = tenderMethodsMulti[0] ?? paymentMethod;
                      setPaymentMethod(first);
                      setPaymentInput(paymentInputsMulti[first] ?? '');
                    }
                  }}
                  className="rounded border-gray-300"
                />
                Allow Multiple
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TENDER_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    if (allowMultiplePaymentMethods) {
                      setTenderMethodsMulti((prev) => {
                        if (prev.includes(m)) {
                          if (prev.length <= 1) return prev;
                          return sortTenderMethods(prev.filter((x) => x !== m));
                        }
                        return sortTenderMethods([...prev, m]);
                      });
                    } else {
                      setPaymentMethod(m);
                    }
                  }}
                  className={`py-2 rounded-lg text-xs font-semibold border ${
                    allowMultiplePaymentMethods
                      ? tenderMethodsMulti.includes(m)
                        ? 'bg-[#1a2332] text-white border-[#1a2332]'
                        : 'border-gray-200 text-gray-600'
                      : paymentMethod === m
                        ? 'bg-[#1a2332] text-white border-[#1a2332]'
                        : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {tenderMethodLabel(m)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-0.5">Amount received</p>
            <p className="text-[11px] text-gray-400 mb-2">Cash, card, bank transfer, or cheque.</p>
            {allowMultiplePaymentMethods ? (
              <div className="flex flex-col gap-2">
                {sortTenderMethods(tenderMethodsMulti).map((m) => (
                  <div key={m}>
                    <p className="text-[11px] text-gray-500 mb-0.5">Amount Received — {tenderMethodLabel(m)}</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={paymentInputsMulti[m]}
                      onChange={(e) =>
                        setPaymentInputsMulti((prev) => ({
                          ...prev,
                          [m]: e.target.value,
                        }))
                      }
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                className={`w-full px-3 py-2 border border-gray-200 rounded-lg ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
              />
            )}
            {useStoreCredit && hasStoreCreditWallet && creditAppliedPreview > 0 ? (
              <div
                className="mt-3 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-950"
                role="status"
              >
                <Info className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" aria-hidden />
                <p className="m-0 leading-snug">
                  <span className="font-semibold">Store credit:</span>{' '}
                  {fmtMoney(creditAppliedPreview)} will be applied to this sale.{' '}
                  <span className="font-semibold">{fmtMoney(storeCreditRemainingAfter)}</span> will remain for future
                  purchases.
                </p>
              </div>
            ) : null}
          </div>

          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span>Due After Credit</span>
              <span className="font-semibold">{fmtMoney(remainingAfterStoreCredit)}</span>
            </div>
            <div className="flex justify-between">
              <span>Outstanding</span>
              <span className={`font-semibold ${outstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {fmtMoney(outstanding)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={submitCheckout}
            disabled={saving || lineItems.length === 0 || !canCompletePayment}
            className="w-full py-2.5 rounded-lg bg-[#e31e24] hover:bg-[#c91a1f] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" /> {saving ? 'Processing...' : 'Complete Checkout'}
          </button>
          <button type="button" onClick={onDone} className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-600 font-semibold">
            Back
          </button>
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" /> Generates a receipt for this payment.
          </p>
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" /> Full, partial, or overpayment is detected automatically.
          </p>
          {checkoutBlockedForWalkInSplitPay ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Partial or overpayment requires a real customer name (not Visitor/Guest) and an email or full phone number.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default POSCheckout;
