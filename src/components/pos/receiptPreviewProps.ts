import type { POSCustomer, POSInvoice, POSLineItem, POSReceipt, POSRefund } from '@/lib/posData';
import type { PrintDocProps } from '@/components/pos/posPrintTypes';
import { safeNum } from '@/lib/utils';

function invoiceLineItems(inv: POSInvoice): POSLineItem[] {
  const raw = inv.items as unknown;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** True when receipt row stores checkout footer snapshot (subtotal / GCT / discount). */
function receiptHasCheckoutFiscalSnap(r: POSReceipt): boolean {
  return (
    r.tax_amount != null ||
    r.subtotal != null ||
    r.tax_rate != null ||
    r.discount_amount != null
  );
}

/** Base fields from the persisted receipt row (before invoice / CRM enrichment). */
export function posReceiptToEmailPreviewProps(r: POSReceipt): PrintDocProps {
  const subtotalFromItems = Array.isArray(r.items)
    ? r.items.reduce((sum, item) => sum + safeNum(item.total), 0)
    : 0;
  const hasSnap = receiptHasCheckoutFiscalSnap(r);
  const subtotal =
    hasSnap && r.subtotal != null
      ? safeNum(r.subtotal)
      : subtotalFromItems > 0
        ? subtotalFromItems
        : safeNum(r.total);
  return {
    type: 'receipt',
    docNumber: r.receipt_number,
    date: r.created_at,
    customerName: r.customer_name,
    customerAccountNo: r.customer_id,
    items: r.items || [],
    subtotal,
    total: r.total,
    taxRate: hasSnap && r.tax_rate != null ? safeNum(r.tax_rate) : undefined,
    taxAmount: hasSnap && r.tax_amount != null ? safeNum(r.tax_amount) : undefined,
    discountAmount: hasSnap && r.discount_amount != null ? safeNum(r.discount_amount) : undefined,
    amountPaid: r.amount_paid,
    amountReceivedTender: r.amount_paid,
    paymentMethod: r.payment_method,
    notes: r.notes || undefined,
    status: r.status,
  };
}

/** Bill To / Ship To: merge receipt row, CRM customer profile, and invoice snapshot. */
function receiptCustomerFieldsFromReceiptAndCrm(
  receipt: POSReceipt,
  customers: POSCustomer[],
  invoiceForContact: POSInvoice | undefined
): Pick<PrintDocProps, 'customerName' | 'customerEmail' | 'customerPhone' | 'customerCompany' | 'customerAddress' | 'customerAccountNo'> {
  const rid = String(receipt.customer_id || '').trim();
  const cust = rid ? customers.find((c) => String(c.id) === rid) : undefined;
  const rName = String(receipt.customer_name || '').trim();
  const invName = String(invoiceForContact?.customer_name || '').trim();
  const name = rName || (cust?.name || '').trim() || invName || 'Customer';
  const email = String(cust?.email || invoiceForContact?.customer_email || '').trim();
  const phone = String(cust?.phone || invoiceForContact?.customer_phone || '').trim();
  const company = String(cust?.company || '').trim();
  const address = String(cust?.address || '').trim();
  const account =
    rid ||
    (invoiceForContact?.customer_id != null ? String(invoiceForContact.customer_id).trim() : '') ||
    undefined;
  return {
    customerName: name,
    customerEmail: email || undefined,
    customerPhone: phone || undefined,
    customerCompany: company || undefined,
    customerAddress: address || undefined,
    customerAccountNo: account,
  };
}

/**
 * Single source of truth for receipt HTML (View Receipt popup, checkout receipt popup, email body).
 * Pass the same `customers` and `invoices` lists you use elsewhere so lookups match.
 */
export function buildReceiptPrintDocPropsForPreview(
  receipt: POSReceipt,
  customers: POSCustomer[],
  invoices: POSInvoice[]
): PrintDocProps {
  const fallback = posReceiptToEmailPreviewProps(receipt);
  const receiptLinks =
    Array.isArray(receipt.invoice_links) && receipt.invoice_links.length > 0
      ? receipt.invoice_links
      : receipt.invoice_id
        ? [
            {
              invoice_id: String(receipt.invoice_id),
              amount_applied: safeNum(receipt.amount_paid),
            },
          ]
        : [];

  const settlement = receiptLinks
    .map((link) => {
      const invoiceId = String(link.invoice_id || '').trim();
      if (!invoiceId) return null;
      const invoice = invoices.find((inv) => String(inv.id) === invoiceId);
      if (!invoice) return null;
      return {
        invoiceNumber:
          (typeof link.invoice_number === 'string' && link.invoice_number.trim()) || invoice.invoice_number,
        documentTotal: safeNum(invoice.total),
        amountAppliedThisReceipt: safeNum(link.amount_applied),
      };
    })
    .filter(Boolean) as NonNullable<PrintDocProps['receiptSettlementInvoices']>[number][];

  const linkedInvoices = receiptLinks
    .map((link) => {
      const invoiceId = String(link.invoice_id || '').trim();
      if (!invoiceId) return null;
      const invoice = invoices.find((inv) => String(inv.id) === invoiceId);
      if (!invoice) return null;
      const invoiceNumber =
        (typeof link.invoice_number === 'string' && link.invoice_number.trim()) || invoice.invoice_number;
      return {
        invoice,
        invoiceNumber: String(invoiceNumber || '').trim(),
      };
    })
    .filter(Boolean) as { invoice: POSInvoice; invoiceNumber: string }[];

  const singleInvoice =
    receiptLinks.length === 1
      ? invoices.find((inv) => String(inv.id) === String(receiptLinks[0]?.invoice_id || '')) || null
      : null;

  const canRebuildItemsFromInvoices =
    linkedInvoices.length > 0 &&
    linkedInvoices.every(({ invoice, invoiceNumber }) => {
      const invoiceItems = invoiceLineItems(invoice);
      return invoiceNumber !== '' && invoiceItems.length > 0;
    });

  const rebuiltItemsFromInvoices = canRebuildItemsFromInvoices
    ? linkedInvoices.flatMap(({ invoice }) => invoiceLineItems(invoice))
    : [];

  const rebuiltInvoiceNumbers = canRebuildItemsFromInvoices
    ? linkedInvoices.flatMap(({ invoice, invoiceNumber }) =>
        invoiceLineItems(invoice).map(() => invoiceNumber)
      )
    : [];

  const singleInvoiceNumber = String(singleInvoice?.invoice_number || '').trim();
  const receiptLineInvoiceNumbers =
    rebuiltInvoiceNumbers.length > 0
      ? rebuiltInvoiceNumbers
      : singleInvoiceNumber && Array.isArray(receipt.items) && receipt.items.length > 0
        ? receipt.items.map(() => singleInvoiceNumber)
        : undefined;

  const invoiceForContact =
    singleInvoice ?? (linkedInvoices.length > 0 ? linkedInvoices[0]?.invoice : undefined);
  const customerOverlay = receiptCustomerFieldsFromReceiptAndCrm(receipt, customers, invoiceForContact);

  /** Checkout snapshot on the receipt row — matches footer GCT/subtotal from POS Checkout at payment time. */
  if (receiptHasCheckoutFiscalSnap(receipt)) {
    const useRebuiltLineItems =
      linkedInvoices.length > 1 &&
      canRebuildItemsFromInvoices &&
      rebuiltItemsFromInvoices.length > 0 &&
      rebuiltInvoiceNumbers.length === rebuiltItemsFromInvoices.length;

    const itemsOut = useRebuiltLineItems ? rebuiltItemsFromInvoices : fallback.items;
    const sumLines = itemsOut.reduce((s, item) => s + safeNum(item.total), 0);
    const subOut = receipt.subtotal != null ? safeNum(receipt.subtotal) : sumLines;
    const taxOut = receipt.tax_amount != null ? safeNum(receipt.tax_amount) : 0;
    const discOut = receipt.discount_amount != null ? safeNum(receipt.discount_amount) : 0;
    const rateOut =
      receipt.tax_rate != null
        ? safeNum(receipt.tax_rate)
        : singleInvoice
          ? safeNum(singleInvoice.tax_rate)
          : 0;
    const singleNum = String(singleInvoice?.invoice_number || '').trim();
    const fromStored = itemsOut.map((it) =>
      String((it as POSLineItem).receipt_invoice_number || '').trim()
    );
    const lineNums = useRebuiltLineItems
      ? rebuiltInvoiceNumbers
      : fromStored.length === itemsOut.length && fromStored.some((x) => x)
        ? fromStored
        : singleNum && itemsOut.length > 0
          ? itemsOut.map(() => singleNum)
          : receiptLineInvoiceNumbers;

    return {
      ...fallback,
      ...customerOverlay,
      items: itemsOut,
      subtotal: subOut,
      taxRate: rateOut,
      taxAmount: taxOut,
      discountAmount: discOut,
      total: safeNum(receipt.total),
      receiptLineInvoiceNumbers: lineNums,
      receiptSettlementInvoices: settlement.length > 0 ? settlement : undefined,
    };
  }

  return {
    ...fallback,
    ...customerOverlay,
    items: rebuiltItemsFromInvoices.length > 0 ? rebuiltItemsFromInvoices : fallback.items,
    subtotal:
      rebuiltItemsFromInvoices.length > 0
        ? rebuiltItemsFromInvoices.reduce((sum, item) => sum + safeNum(item.total), 0)
        : singleInvoice
          ? safeNum(singleInvoice.subtotal)
          : fallback.subtotal,
    taxRate: singleInvoice ? safeNum(singleInvoice.tax_rate) : fallback.taxRate,
    taxAmount: singleInvoice ? safeNum(singleInvoice.tax_amount) : fallback.taxAmount,
    discountAmount: singleInvoice ? safeNum(singleInvoice.discount_amount) : fallback.discountAmount,
    total: singleInvoice ? safeNum(singleInvoice.total) : fallback.total,
    receiptLineInvoiceNumbers,
    receiptSettlementInvoices: settlement.length > 0 ? settlement : undefined,
  };
}

function invoiceNumberFromRefundInvoiceId(invoices: POSInvoice[], id: string | undefined): string {
  if (!id) return '';
  const inv = invoices.find((x) => String(x.id) === String(id));
  return String(inv?.invoice_number || '').trim();
}

/**
 * Print / preview props for a POS refund — fills {@link PrintDocProps.receiptLineInvoiceNumbers} so the
 * template always shows invoice # in the line-items column (single primary invoice or per-line sources).
 */
export function buildRefundPrintDocProps(refund: POSRefund, invoices: POSInvoice[]): PrintDocProps {
  const items = (Array.isArray(refund.items) ? refund.items : []) as POSLineItem[];
  const primaryNum = invoiceNumberFromRefundInvoiceId(invoices, refund.invoice_id);

  let receiptLineInvoiceNumbers: string[] | undefined;
  if (items.length > 0) {
    const perLine = items.map((line) => String(line.source_invoice_number || '').trim());
    if (primaryNum) {
      receiptLineInvoiceNumbers = perLine.map((s) => s || primaryNum);
    } else if (perLine.some(Boolean)) {
      receiptLineInvoiceNumbers = perLine;
    }
  }

  return {
    type: 'refund',
    docNumber: refund.refund_number,
    date: refund.created_at,
    customerName: refund.customer_name,
    items,
    subtotal: safeNum(refund.subtotal),
    taxAmount: safeNum(refund.tax_amount),
    total: safeNum(refund.total),
    refundType: refund.refund_type,
    reason: refund.reason,
    notes: refund.notes || undefined,
    receiptLineInvoiceNumbers,
  };
}
