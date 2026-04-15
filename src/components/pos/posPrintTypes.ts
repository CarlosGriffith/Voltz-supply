import type { POSLineItem } from '@/lib/posData';

export interface PrintDocProps {
  type: 'quote' | 'order' | 'invoice' | 'receipt' | 'refund';
  docNumber: string;
  date: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerCompany?: string;
  /** Multi-line street / mailing address (shown in Bill To / Ship To when set). */
  customerAddress?: string;
  /** Shown as "Cust No." — e.g. internal account id */
  customerAccountNo?: string;
  /** Multi-line ship-to; if omitted, matches bill-to block */
  shipToAddress?: string;
  poNumber?: string;
  terms?: string;
  salesperson?: string;
  enteredBy?: string;
  /** e.g. GCT registration number */
  taxRegistrationNo?: string;
  items: POSLineItem[];
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  discountAmount?: number;
  total: number;
  amountPaid?: number;
  /** Receipt: cash/card/cheque tender in hand (shown as "Amount Received"). Falls back to {@link amountPaid}. */
  amountReceivedTender?: number;
  paymentMethod?: string;
  notes?: string;
  status?: string;
  validUntil?: string;
  refundType?: string;
  reason?: string;
  receiptLineInvoiceNumbers?: string[];
  receiptSettlementInvoices?: {
    invoiceNumber: string;
    documentTotal: number;
    amountAppliedThisReceipt: number;
    orderNumber?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  }[];
}
