import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { useNavigate } from 'react-router-dom';
import { PosColumnResizeSuspendContext } from '@/contexts/PosColumnResizeSuspendContext';
import { useCMSAuth } from '@/contexts/CMSAuthContext';
import { useCMS, SectionConfig, loadContactDetails } from '@/contexts/CMSContext';
import CMSProductManager from '@/components/voltz/CMSProductManager';
import CMSCategoryManager from '@/components/voltz/CMSCategoryManager';
import CMSContactManager from '@/components/voltz/CMSContactManager';
import CMSCompanyProfileManager from '@/components/voltz/CMSCompanyProfileManager';
import POSDocCreate from '@/components/pos/POSDocCreate';
import POSDashboardView from '@/components/pos/POSDashboard';
import POSCheckout from '@/components/pos/POSCheckout';
import { printDocument, generateEmailHTML } from '@/components/pos/POSPrintTemplate';
import {
  buildQuotationDocumentHtml,
  buildQuotationPreviewSrcDoc,
  displayRefundDocNumber,
} from '@/components/pos/quotationHtml';
import { buildReceiptPrintDocPropsForPreview, buildRefundPrintDocProps } from '@/components/pos/receiptPreviewProps';
import type { PrintDocProps } from '@/components/pos/posPrintTypes';
import { POS_PAGE_SHELL, POS_QUICK_SEARCH_INPUT, POS_SEARCH_CARD, POS_SURFACE_RAISED } from '@/components/pos/posPageChrome';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { usePosResizableTableLayout } from '@/hooks/usePosResizableTableLayout';
import { PosResizableTableFrame } from '@/components/pos/PosResizableTableFrame';
import { DocListPanelHeader } from '@/components/pos/DocListPanelHeader';
import { CustomersPanelHeader, RefundsPanelHeader, SentEmailsPanelHeader } from '@/components/pos/PosListPanelHeaders';

import { parseQuoteRequestDeliveryPreferences } from '@/lib/quoteRequestDeliveryPrefs';
import { getApiHealthDb } from '@/lib/api';
import { broadcastCMSUpdate } from '@/lib/cmsCache';
import {
  cn,
  fmtCurrency,
  fmtDatePOS,
  safeNum,
  DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS,
  formatSentEmailDocumentDisplay,
  taxAmountFromSubtotalAndGctPercent,
  digitsFromPhoneInput,
  formatPhoneUsMask,
  displayUsPhoneFromStored,
  findCustomerByEmailOrPhone,
  isPlaceholderWalkInCustomerName,
} from '@/lib/utils';

import { saveConfigDetailed, saveConfig as dbSaveConfig, fetchConfig, saveConfig } from '@/lib/cmsData';
import { usePOSRealtime, useSyncSelectedCustomerFromList } from '@/hooks/usePOSRealtime';
import {
  asPosRows,
  POSCustomer, POSQuote, POSOrder, POSInvoice, POSReceipt, POSRefund, POSQuoteRequest, POSSentEmail, POSSmtpSettings, POSLineItem,
  fetchCustomers, saveCustomer, deleteCustomer, fetchQuotes, fetchOrders, fetchInvoices, fetchReceipts, fetchRefunds,
  fetchQuoteRequests, fetchSentEmails, fetchSmtpSettings, saveSmtpSettings, saveQuote,
  convertOrderToInvoice, createOrderFromQuote, createInvoiceFromQuote,
  createOrderFromWebsiteQuoteRequest, createInvoiceFromWebsiteQuoteRequest,
  markInvoicePaidAndDelivered, processRefund, processRefundSegments, generateDocNumber, sendEmail, fetchCustomerHistory,
  fetchMergedCustomerHistory,
  saveInvoice, saveReceipt,
  invoiceIsOpenBalance, invoiceIsFullyPaid,   invoiceCanProcessRefund, latestReceiptIdForInvoice,
  invoiceLineItemsRemainingForRefund,
  INVOICE_STATUS_PAID, INVOICE_STATUS_UNPAID,
  INVOICE_STATUS_PARTIALLY_PAID,
  INVOICE_STATUS_REFUNDED,
  normalizeInvoiceStatus,
  receiptTableDisplayStatus,
  refundTouchesReceiptRow,
  refundsTouchingInvoice,
  invoiceListShowsPartiallyRefunded,
  invoiceExcludedFromCheckoutDocumentSearch,
  checkoutDocumentExcludedDueToRefundedInvoice,
  posOrderCheckoutBlocked,
} from '@/lib/posData';
import {
  Layout, Package, LogOut, Settings, ChevronUp, ChevronDown, Eye, EyeOff, GripVertical, Minus, Plus,
  RotateCcw, Save, Check, X, User, Home, Shield, FolderOpen, DollarSign, Phone, Building2, AlertTriangle,
  ShoppingCart, ShoppingBag, FileText, Receipt, Users, MessageSquare, Mail, RefreshCw, Send, Search,
  ChevronRight, BarChart3, Clock, CreditCard, Truck, RotateCcw as Undo, ArrowRight, ExternalLink,
  Menu, ChevronLeft, Wifi, ArrowLeft,
} from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CMSNotificationProvider, useCMSNotification } from '@/contexts/CMSNotificationContext';
import {
  PosActionsFa,
  POS_MENU_FA,
  PosCustomerFormTitleFa,
  PosListPageTitleFa,
  posListPageKindFromDocType,
} from '@/components/pos/posActionMenuIcons';


const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_7206a7df.png';

/**
 * Default column width weights for POS document lists (panel defaults before localStorage).
 * Favor wider text columns (customer, product, email) and a usable actions column.
 */
const POS_DEFAULT_COL_PCT_DOC: Record<'quote' | 'order' | 'invoice' | 'receipt', number[]> = {
  /** Quote #, Customer, Date, Total, Status, Email sent, Actions */
  quote: [11, 22, 10, 10, 12, 25, 10],
  /** Order #, Customer, Date, Total, Status, Actions */
  order: [15, 26, 11, 12, 16, 20],
  /** Invoice #, Customer, Date, Total, Status, Actions */
  invoice: [15, 26, 11, 12, 16, 20],
  /** Receipt #, Customer, Date, Payment method, Invoice(s) total, Amount received, Status, Actions */
  receipt: [10, 18, 9, 15, 11, 11, 14, 12],
};

/** Website quote requests: Customer, Product, Date, Status, Email sent, Actions */
const POS_DEFAULT_COL_PCT_QUOTE_REQUESTS = [28, 30, 7, 8, 19, 8];

/** Min % width per panel (react-resizable-panels). */
const POS_QUOTE_REQUESTS_PANEL_MIN = [8, 10, 5, 5, 8, 9] as const;

/** Name, Contact, Company, Store credit, Balance due, Actions */
const POS_DEFAULT_COL_PCT_CUSTOMERS = [20, 24, 18, 12, 14, 12];

/** Refund #, Customer, Type, Amount, Date, Status, Actions */
const POS_DEFAULT_COL_PCT_REFUNDS = [12, 22, 12, 12, 11, 15, 16];

/** Recipient, Subject, Document, Sent, Status, Actions */
const POS_DEFAULT_COL_PCT_SENT_EMAILS = [22, 28, 14, 14, 12, 10];

/** Min panel % — document lists (quotes / orders / invoices / receipts). */
const POS_DOC_PANEL_MIN: Record<'quote' | 'order' | 'invoice' | 'receipt', readonly number[]> = {
  quote: [8, 9, 5, 6, 7, 9, 9],
  order: [9, 11, 6, 6, 8, 9],
  invoice: [9, 11, 6, 6, 8, 9],
  receipt: [7, 9, 6, 8, 7, 7, 7, 9],
};

const POS_DOC_BASE_MIN_WIDTH_REM: Record<'quote' | 'order' | 'invoice' | 'receipt', number> = {
  quote: 56,
  order: 52,
  invoice: 52,
  receipt: 66,
};

const POS_CUSTOMERS_PANEL_MIN = [10, 10, 8, 7, 7, 9] as const;
const POS_REFUNDS_PANEL_MIN = [8, 10, 7, 7, 6, 8, 9] as const;
const POS_SENT_EMAILS_PANEL_MIN = [10, 12, 8, 8, 8, 9] as const;

const POS_QUOTE_REQUESTS_BASE_MIN_WIDTH_REM = 52;
const POS_CUSTOMERS_BASE_MIN_WIDTH_REM = 52;
const POS_REFUNDS_BASE_MIN_WIDTH_REM = 56;
const POS_SENT_EMAILS_BASE_MIN_WIDTH_REM = 52;

// ─── Section Row (from original) ───
const SectionRow: React.FC<{
  section: SectionConfig; index: number; total: number;
  onMoveUp: () => void; onMoveDown: () => void; onToggle: () => void; onMarginChange: (val: number) => void;
}> = ({ section, index, total, onMoveUp, onMoveDown, onToggle, onMarginChange }) => {
  const [showSpacing, setShowSpacing] = useState(false);
  return (
    <div className={`rounded-xl border transition-all ${section.visible ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
      <div className="flex items-center gap-2 p-3">
        <div className="text-gray-300"><GripVertical className="w-4 h-4" /></div>
        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"><span className="text-xs font-bold text-gray-500">{index + 1}</span></div>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-semibold truncate block ${section.visible ? 'text-[#1a2332]' : 'text-gray-400 line-through'}`}>{section.label}</span>
          {section.marginTop !== 0 && <span className="text-[10px] text-gray-400">Offset: {section.marginTop}px</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowSpacing(!showSpacing)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showSpacing ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-400'}`}><Layout className="w-4 h-4" /></button>
          <button onClick={onMoveUp} disabled={index === 0} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
          <button onClick={onToggle} className={`w-8 h-8 rounded-lg flex items-center justify-center ${section.visible ? 'hover:bg-green-50 text-green-600' : 'hover:bg-red-50 text-red-400'}`}>
            {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {showSpacing && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Offset</span>
            <button onClick={() => onMarginChange(Math.max(section.marginTop - 5, -50))} className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Minus className="w-3 h-3" /></button>
            <input type="range" min={-50} max={50} step={1} value={section.marginTop} onChange={e => onMarginChange(Number(e.target.value))} className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e31e24]" />
            <button onClick={() => onMarginChange(Math.min(section.marginTop + 5, 50))} className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Plus className="w-3 h-3" /></button>
            <span className="text-xs font-mono text-gray-500 w-10 text-right">{section.marginTop}px</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Section Manager Tab ───
const SectionManagerTab: React.FC = () => {
  const { notify } = useCMSNotification();
  const { sections, moveSection, toggleVisibility, updateMarginTop, resetToDefaults, settings, updateSettings } = useCMS();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sorted = [...(Array.isArray(sections) ? sections : [])].sort((a, b) => a.order - b.order);
  const visibleCount = sorted.filter(s => s.visible).length;

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      const cleanSections = sections.map(s => ({ id: s.id, label: s.label, visible: s.visible, order: s.order, marginTop: s.marginTop }));
      const r1 = await saveConfigDetailed('cms_sections', cleanSections);
      if (!r1.ok) {
        const msg = r1.errorMessage || 'Unknown error';
        setSaveError(`Save failed: ${msg}`);
        notify({ variant: 'error', title: 'Changes not saved', subtitle: `Website → Homepage sections — ${msg}` });
        setSaving(false);
        return;
      }
      await saveConfigDetailed('cms_settings', settings);
      window.dispatchEvent(new CustomEvent('voltz-sections-updated'));
      window.dispatchEvent(new CustomEvent('voltz-settings-updated'));
      await broadcastCMSUpdate('cms_sections');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      notify({ variant: 'success', title: 'Changes saved', subtitle: 'Website → Homepage sections & global settings' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      setSaveError(`Failed: ${msg}`);
      notify({ variant: 'error', title: 'Changes not saved', subtitle: `Website → Homepage sections — ${msg}` });
    } finally { setSaving(false); }
  };

  const handleToggleHidePrices = async () => {
    const newVal = !settings.hidePrices;
    updateSettings({ hidePrices: newVal });
    try {
      await dbSaveConfig('cms_settings', { ...settings, hidePrices: newVal });
      await broadcastCMSUpdate('cms_settings');
      notify({ variant: 'success', title: 'Setting updated', subtitle: 'Website → Hide product prices' });
    } catch (e) {
      updateSettings({ hidePrices: !newVal });
      notify({
        variant: 'error',
        title: 'Could not update setting',
        subtitle: `Website → Hide product prices — ${e instanceof Error ? e.message : 'Error'}`,
      });
    }
  };

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-[#1a2332] flex items-center gap-2 mb-3"><Settings className="w-5 h-5 text-amber-600" /> Global Settings</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1"><div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-amber-600" /><span className="text-sm font-bold">Hide Product Prices</span></div>
            <p className="text-xs text-gray-500">When enabled, prices are hidden on the website.</p></div>
          <button onClick={handleToggleHidePrices} className={`relative w-14 h-8 rounded-full transition-all ${settings.hidePrices ? 'bg-amber-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all flex items-center justify-center ${settings.hidePrices ? 'left-[26px]' : 'left-1'}`}>
              {settings.hidePrices ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
            </div>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5 text-sm"><Eye className="w-4 h-4 text-green-500" /><span className="font-semibold">{visibleCount}</span><span className="text-gray-500">visible</span></div>
        <div className="flex items-center gap-1.5 text-sm"><EyeOff className="w-4 h-4 text-gray-400" /><span className="font-semibold">{sorted.length - visibleCount}</span><span className="text-gray-500">hidden</span></div>
      </div>
      <div className="space-y-2 mb-6">{sorted.map((s, i) => <SectionRow key={s.id} section={s} index={i} total={sorted.length} onMoveUp={() => moveSection(s.id, 'up')} onMoveDown={() => moveSection(s.id, 'down')} onToggle={() => toggleVisibility(s.id)} onMarginChange={v => updateMarginTop(s.id, v)} />)}</div>
      {saveError && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" /><span className="text-sm text-red-700">{saveError}</span></div>}
      <div className="flex gap-3">
        <button onClick={resetToDefaults} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50"><RotateCcw className="w-4 h-4" /> Reset</button>
        <button onClick={handleSave} disabled={saving} className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold ${saved ? 'bg-green-600 text-white' : saving ? 'bg-gray-400 text-white' : 'bg-[#e31e24] text-white hover:bg-[#c91a1f]'}`}>
          {saved ? <><Check className="w-4 h-4" /> Saved!</> : saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save All</>}
        </button>
      </div>
    </div>
  );
};

/** Human label for quote workflow status (toast copy). */
function posQuoteWorkflowStatusLabel(status: string): string {
  const m: Record<string, string> = {
    reviewed: 'Reviewed',
    printed: 'Printed',
    emailed: 'Sent',
    dormant: 'Dormant',
    order_generated: 'Order Generated',
    invoice_generated_unpaid: 'Invoice Generated - Unpaid',
    invoice_generated_partially_paid: 'Invoice Generated - Partially Paid',
    invoice_generated_paid: 'Invoice Generated - Paid',
    processed: 'Processed',
    partially_refunded: 'Partially Refunded',
    refunded: 'Refunded',
  };
  return m[status] || status.replace(/_/g, ' ');
}

// ─── Status Badge ───
const StatusBadge: React.FC<{
  status: string;
  /** Quotes / quote requests: show `emailed` as "Sent". */
  emailedAsSent?: boolean;
  className?: string;
}> = ({
  status,
  emailedAsSent = false,
  className,
}) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600', new: 'bg-[#EF4444]/25 text-[#B91C1C]', sent: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', processing: 'bg-purple-100 text-purple-700',
    ready: 'bg-cyan-100 text-cyan-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
    unpaid: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', partial: 'bg-orange-100 text-orange-700', partially_paid: 'bg-orange-100 text-orange-700',
    Unpaid: 'bg-yellow-100 text-yellow-700', Paid: 'bg-green-100 text-green-700', 'Partially Paid': 'bg-orange-100 text-orange-700', Refunded: 'bg-pink-100 text-pink-700',
    overdue: 'bg-red-100 text-red-700', refunded: 'bg-pink-100 text-pink-700', delivered: 'bg-green-100 text-green-700',
    accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-gray-100 text-gray-500',
    converted: 'bg-indigo-100 text-indigo-700', reviewed: 'bg-blue-100 text-blue-700', quoted: 'bg-green-100 text-green-700',
    order_generated: 'bg-violet-100 text-violet-800',
    invoice_generated_unpaid: 'bg-yellow-100 text-yellow-700',
    invoice_generated_partially_paid: 'bg-orange-100 text-orange-700',
    invoice_generated_paid: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-600',
    approved: 'bg-green-100 text-green-700',
    pending_approval: 'bg-amber-100 text-amber-900',
    'Partially Refunded': 'bg-orange-100 text-orange-800',
    failed: 'bg-red-100 text-red-700',
    resent: 'bg-blue-100 text-blue-700',
    printed: 'bg-sky-100 text-sky-800',
    emailed: 'bg-teal-100 text-teal-800',
    dormant: 'bg-slate-200 text-slate-700',
    partially_refunded: 'bg-orange-100 text-orange-800',
  };
  const labels: Record<string, string> = {
    new: 'New',
    reviewed: 'Reviewed',
    quoted: 'Quoted',
    printed: 'Printed',
    emailed: emailedAsSent ? 'Sent' : 'Emailed',
    dormant: 'Dormant',
    order_generated: 'Order Generated',
    invoice_generated_unpaid: 'Invoice Generated - Unpaid',
    invoice_generated_partially_paid: 'Invoice Generated - Partially Paid',
    invoice_generated_paid: 'Invoice Generated - Paid',
    approved: 'Approved',
    pending_approval: 'Pending Approval',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
  };
  const label = labels[status] || status;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
        colors[status] || 'bg-gray-100 text-gray-600',
        className
      )}
    >
      {label}
    </span>
  );
};

function isInvoiceGeneratedRowStatus(status: string): boolean {
  return (
    status === 'invoice_generated_unpaid' ||
    status === 'invoice_generated_partially_paid' ||
    status === 'invoice_generated_paid'
  );
}

/** Match invoice by id on the doc, or by quote_id / order_id on the invoice (handles missing back-links). */
function resolveInvoiceForQuoteOrOrder(
  doc: POSQuote | POSOrder,
  kind: 'quote' | 'order',
  invoiceList: POSInvoice[]
): POSInvoice | undefined {
  const extId = kind === 'quote' ? (doc as POSQuote).invoice_id : (doc as POSOrder).invoice_id;
  if (extId != null && String(extId).trim() !== '') {
    const byId = invoiceList.find((i) => String(i.id) === String(extId));
    if (byId) return byId;
  }
  if (kind === 'quote') {
    return invoiceList.find((i) => i.quote_id != null && String(i.quote_id) === String(doc.id));
  }
  return invoiceList.find((i) => i.order_id != null && String(i.order_id) === String(doc.id));
}

/** Match order by id on the quote, or by quote_id on the order (handles missing back-links). */
function resolveOrderForQuote(quote: POSQuote, orderList: POSOrder[]): POSOrder | undefined {
  const extId = quote.order_id;
  if (extId != null && String(extId).trim() !== '') {
    const byId = orderList.find((o) => String(o.id) === String(extId));
    if (byId) return byId;
  }
  return orderList.find((o) => o.quote_id != null && String(o.quote_id) === String(quote.id));
}

/** Wider + visible overflow so multi-invoice / multi-receipt lines are not clipped (base TooltipContent uses overflow-hidden). */
const DOC_STATUS_TOOLTIP_CLASS =
  'max-w-[min(28rem,calc(100vw-2rem))] overflow-visible whitespace-normal break-words rounded-none border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium leading-snug bg-white text-gray-800 shadow-sm';

const QuoteOrderInvoiceStatusCell: React.FC<{
  doc: POSQuote | POSOrder;
  docType: 'quote' | 'order';
  invoiceList: POSInvoice[];
  orderList: POSOrder[];
  refunds: POSRefund[];
  onOpenInvoice: (invoiceNumber: string) => void;
  onOpenOrder: (orderNumber: string) => void;
}> = ({ doc, docType, invoiceList, orderList, refunds, onOpenInvoice, onOpenOrder }) => {
  const status = doc.status || '';
  const linkedInv = resolveInvoiceForQuoteOrOrder(doc, docType, invoiceList);
  const invRefunded =
    linkedInv != null && normalizeInvoiceStatus(linkedInv.status) === INVOICE_STATUS_REFUNDED;
  const rowSaysRefunded = (status || '').toLowerCase() === 'refunded';

  if (
    docType === 'order' &&
    linkedInv &&
    invoiceListShowsPartiallyRefunded(linkedInv, refunds) &&
    isInvoiceGeneratedRowStatus(status)
  ) {
    const invNum = String(linkedInv.invoice_number || '').trim();
    const tip = invNum || 'Not linked in list — try Refresh';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (invNum) onOpenInvoice(invNum);
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              invNum ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={invNum ? `Open ${invNum} on Invoices page` : 'Linked document unavailable'}
          >
            <StatusBadge status="Partially Refunded" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (
    (docType === 'order' || docType === 'quote') &&
    (invRefunded || rowSaysRefunded)
  ) {
    const inv = linkedInv;
    const tip = inv?.invoice_number?.trim()
      ? inv.invoice_number
      : 'Not linked in list — try Refresh';
    const canNav = Boolean(inv?.invoice_number?.trim());
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (inv?.invoice_number?.trim()) onOpenInvoice(inv.invoice_number.trim());
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              canNav ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={
              canNav && inv?.invoice_number
                ? `Open invoice ${inv.invoice_number} on Invoices page`
                : 'Linked invoice unavailable'
            }
          >
            <StatusBadge status="Refunded" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isInvoiceGeneratedRowStatus(status)) {
    const inv = resolveInvoiceForQuoteOrOrder(doc, docType, invoiceList);
    const tip = inv ? inv.invoice_number : 'Not linked in list — try Refresh';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (inv?.invoice_number) onOpenInvoice(inv.invoice_number);
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              inv?.invoice_number ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={inv ? `Open ${inv.invoice_number} on Invoices page` : 'Linked document unavailable'}
          >
            <StatusBadge status={status} emailedAsSent={docType === 'quote'} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (docType === 'quote' && status === 'order_generated') {
    const q = doc as POSQuote;
    const ord = resolveOrderForQuote(q, orderList);
    const tip = ord ? ord.order_number : 'Not linked in list — try Refresh';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (ord?.order_number) onOpenOrder(ord.order_number);
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              ord?.order_number ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={ord ? `Open order ${ord.order_number} on Orders page` : 'Linked order unavailable'}
          >
            <StatusBadge status={status} emailedAsSent />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <StatusBadge status={status} emailedAsSent={docType === 'quote'} />;
};

const LINKED_QUOTE_REQUEST_STATUSES = new Set(['quoted', 'printed', 'emailed']);

const QuoteRequestQuotedStatusCell: React.FC<{
  qr: POSQuoteRequest;
  quoteList: POSQuote[];
  onOpenQuote: (quoteNumber: string) => void;
}> = ({ qr, quoteList, onOpenQuote }) => {
  const status = qr.status || '';
  if (!LINKED_QUOTE_REQUEST_STATUSES.has((status || '').toLowerCase())) {
    return (
      <StatusBadge
        status={status}
        emailedAsSent
        className="max-w-[min(11rem,100%)] whitespace-normal text-center leading-tight"
      />
    );
  }
  const linked = findQuoteForWebsiteRequest(qr, quoteList);
  const quoteNum = (linked?.quote_number || qr.quote_number || '').trim();
  const tip = quoteNum || 'Not linked in list — try Refresh';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (quoteNum) onOpenQuote(quoteNum);
          }}
          className={`inline-flex max-w-full min-w-0 justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
            quoteNum ? 'cursor-pointer' : 'cursor-default opacity-90'
          }`}
          aria-label={quoteNum ? `Open ${quoteNum} on Quotes page` : 'Quote link unavailable'}
        >
          <StatusBadge
            status={status}
            emailedAsSent
            className="max-w-[min(11rem,100%)] whitespace-normal text-center leading-tight"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
        <p className="m-0">{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
};

/** Invoices list: Unpaid shows linked order # on hover; click opens Orders filtered by that order. Paid / Partially Paid / Refunded show receipt #s on hover (Refunded); click opens Receipts filtered by invoice #. */
const InvoicePaymentReceiptsStatusCell: React.FC<{
  inv: POSInvoice;
  receipts: POSReceipt[];
  orders: POSOrder[];
  invoices: POSInvoice[];
  refunds: POSRefund[];
  onOpenReceiptsByInvoice: (invoiceNumber: string) => void;
  onOpenOrder: (orderNumber: string) => void;
}> = ({ inv, receipts, orders, invoices, refunds, onOpenReceiptsByInvoice, onOpenOrder }) => {
  const status = inv.status || '';
  const ns = normalizeInvoiceStatus(status);

  if (ns === INVOICE_STATUS_UNPAID) {
    const ord = inv.order_id
      ? orders.find((o) => String(o.id) === String(inv.order_id))
      : undefined;
    const orderNum = (ord?.order_number || '').trim();
    const tip = orderNum
      ? orderNum
      : inv.order_id
        ? 'Order record not found — try Refresh'
        : 'No order linked';
    const canNav = Boolean(orderNum);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (orderNum) onOpenOrder(orderNum);
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              canNav ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={orderNum ? `Open order ${orderNum} on Orders page` : 'No linked order'}
          >
            <StatusBadge status={status} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (ns === INVOICE_STATUS_REFUNDED) {
    const receiptNums = receiptNumbersAssociatedWithInvoice(inv, receipts);
    const tip =
      receiptNums.length > 0 ? receiptNums.join(', ') : 'No receipt linked — try Refresh';
    const invNum = String(inv.invoice_number || '').trim();
    const canNav = Boolean(invNum);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (invNum) onOpenReceiptsByInvoice(invNum);
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              canNav ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={
              canNav
                ? `Open Receipts with search ${invNum} to show linked receipt(s)`
                : 'Invoice number unavailable'
            }
          >
            <StatusBadge status={status} />
        </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (ns !== INVOICE_STATUS_PAID && ns !== INVOICE_STATUS_PARTIALLY_PAID) {
    return <StatusBadge status={status} />;
  }
  const refundRowsForPartial = refundsTouchingInvoice(inv, refunds);
  const displayStatus =
    refundRowsForPartial.length > 0 ? 'Partially Refunded' : status;
  const nums = receiptNumbersAssociatedWithInvoice(inv, receipts);
  const tip =
    nums.length > 0 ? nums.join(', ') : 'No receipt records linked — try Refresh';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onOpenReceiptsByInvoice(inv.invoice_number)}
          className="inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 cursor-pointer"
          aria-label={
            nums.length > 0
              ? `Receipts: ${nums.join(', ')}. Open Receipts for invoice ${inv.invoice_number}`
              : `View receipts for invoice ${inv.invoice_number}`
          }
        >
          <StatusBadge status={displayStatus} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
        <p className="m-0">{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const RECEIPT_STATUSES_WITH_INVOICE_LINK = new Set(['approved', 'pending_approval']);

/** REF-* numbers for refunds tied to this receipt (display form), oldest first, unique. */
function refundDocNumbersForReceiptTouch(rec: POSReceipt, refunds: POSRefund[]): string[] {
  const relevant = refunds.filter((rf) => refundTouchesReceiptRow(rf, rec));
  relevant.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rf of relevant) {
    const d = displayRefundDocNumber(rf.refund_number).trim();
    if (d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

function sortInvoiceNumbersForDisplay(nums: string[]): string[] {
  return [...nums].sort((a, b) => {
    const ma = /^INV-(\d+)$/i.exec(a.trim());
    const mb = /^INV-(\d+)$/i.exec(b.trim());
    if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
    return a.localeCompare(b);
  });
}

/** Invoice #s for a receipt: `pos_receipt_invoice_links` (invoice_links) plus primary `pos_receipts.invoice_id` — API JOIN supplies invoice_number on each link. */
function invoiceNumbersAssociatedWithReceipt(rec: POSReceipt, invoices: POSInvoice[]): string[] {
  const nums = new Set<string>();
  const linkRows = rec.invoice_links;
  if (Array.isArray(linkRows) && linkRows.length > 0) {
    for (const link of linkRows) {
      if (!link?.invoice_id) continue;
      const fromApi = (link.invoice_number || '').trim();
      if (fromApi) {
        nums.add(fromApi);
        continue;
      }
      const inv = invoices.find((i) => String(i.id).trim() === String(link.invoice_id).trim());
      const n = (inv?.invoice_number || '').trim();
      if (n) nums.add(n);
      else {
        const id = String(link.invoice_id || '').trim();
        if (id) nums.add(id);
      }
    }
  }
  const primary = rec.invoice_id
    ? invoices.find((i) => String(i.id).trim() === String(rec.invoice_id).trim())
    : undefined;
  const pn = (primary?.invoice_number || '').trim();
  if (pn) nums.add(pn);
  else if (rec.invoice_id && (!linkRows || linkRows.length === 0)) {
    const id = String(rec.invoice_id).trim();
    if (id) nums.add(id);
  }

  return sortInvoiceNumbersForDisplay([...nums]);
}

/** Resolved invoice rows for a receipt (primary `invoice_id` + every `invoice_links` entry). Omits ids missing from `allInvoices`. */
function invoicesAssociatedWithReceipt(rec: POSReceipt, allInvoices: POSInvoice[]): POSInvoice[] {
  const byId = new Map<string, POSInvoice>();
  for (const inv of allInvoices) {
    const id = String(inv.id ?? '').trim();
    if (id) byId.set(id, inv);
  }
  const ids = new Set<string>();
  const addId = (raw: string | null | undefined) => {
    const id = String(raw ?? '').trim();
    if (id) ids.add(id);
  };
  addId(rec.invoice_id);
  const links = rec.invoice_links;
  if (Array.isArray(links)) {
    for (const l of links) addId(l?.invoice_id);
  }
  const out: POSInvoice[] = [];
  for (const id of ids) {
    const inv = byId.get(id);
    if (inv) out.push(inv);
  }
  out.sort((a, b) => {
    const na = (a.invoice_number || '').trim();
    const nb = (b.invoice_number || '').trim();
    const ma = /^INV-(\d+)$/i.exec(na);
    const mb = /^INV-(\d+)$/i.exec(nb);
    if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
    return na.localeCompare(nb);
  });
  return out;
}

/** True if this invoice is tied to the receipt via `pos_receipts.invoice_id` or `pos_receipt_invoice_links` (id match; optional invoice_number match from API JOIN). */
function receiptAppliesToInvoice(rec: POSReceipt, inv: POSInvoice): boolean {
  const invId = String(inv.id ?? '').trim();
  const invNum = String(inv.invoice_number ?? '').trim();
  if (!invId) return false;
  if (String(rec.invoice_id ?? '').trim() === invId) return true;
  const links = rec.invoice_links;
  if (!Array.isArray(links)) return false;
  return links.some((l) => {
    if (l?.invoice_id != null && String(l.invoice_id).trim() === invId) return true;
    if (invNum && (l.invoice_number || '').trim() === invNum) return true;
    return false;
  });
}

/** Receipt #(s) for an invoice — only mapping table + primary receipt invoice_id (same rules as API). */
function receiptNumbersAssociatedWithInvoice(inv: POSInvoice, receipts: POSReceipt[]): string[] {
  const invId = String(inv.id ?? '').trim();
  if (!invId) return [];
  const linked = receipts.filter((r) => receiptAppliesToInvoice(r, inv));
  linked.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return linked.map((r) => (r.receipt_number || '').trim()).filter(Boolean);
}

/** Receipts list: Approved / Pending — invoice-linked statuses show invoice #(s) on hover (or REF #(s) when refunded); click opens Invoices or Refunds filtered by this receipt #. */
const ReceiptLinkedInvoiceStatusCell: React.FC<{
  rec: POSReceipt;
  invoices: POSInvoice[];
  refunds: POSRefund[];
  onOpenInvoiceByReceiptSearch: (receiptNumber: string) => void;
  onOpenRefundsByReceiptSearch: (receiptNumber: string) => void;
}> = ({ rec, invoices, refunds, onOpenInvoiceByReceiptSearch, onOpenRefundsByReceiptSearch }) => {
  const status = rec.status || '';
  const displayStatus = receiptTableDisplayStatus(rec, invoices, refunds);
  if (!RECEIPT_STATUSES_WITH_INVOICE_LINK.has((status || '').toLowerCase())) {
    return <StatusBadge status={displayStatus} />;
  }

  const dsNorm = displayStatus.trim().toLowerCase();
  const isRefundDerived = dsNorm === 'refunded' || dsNorm === 'partially refunded';
  const recNum = (rec.receipt_number || '').trim();

  if (isRefundDerived) {
    const refNums = refundDocNumbersForReceiptTouch(rec, refunds);
    const tip = refNums.length > 0 ? refNums.join(', ') : 'No refund linked — try Refresh';
    const canNav = Boolean(recNum);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (recNum) onOpenRefundsByReceiptSearch(recNum);
            }}
            className={`inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 ${
              canNav ? 'cursor-pointer' : 'cursor-default opacity-90'
            }`}
            aria-label={
              canNav
                ? `Open Refunds with search ${recNum} for refund(s) on this receipt`
                : 'Receipt number unavailable'
            }
          >
            <StatusBadge status={displayStatus} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
          <p className="m-0">{tip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const invNums = invoiceNumbersAssociatedWithReceipt(rec, invoices);
  const tip = invNums.length > 0 ? invNums.join(', ') : 'No invoice linked — try Refresh';
  const ariaInvoices = invNums.length > 0 ? invNums.join(', ') : 'linked';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onOpenInvoiceByReceiptSearch(rec.receipt_number)}
          className="inline-flex max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e31e24]/40 focus-visible:ring-offset-1 cursor-pointer"
          aria-label={
            invNums.length > 0
              ? `Invoices: ${ariaInvoices}. Open Invoices filtered by this receipt.`
              : 'Open Invoices filtered by this receipt'
          }
        >
          <StatusBadge status={displayStatus} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className={DOC_STATUS_TOOLTIP_CLASS}>
        <p className="m-0">{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const fmtDate = (d: string) => fmtDatePOS(d);

/** Remove " ×5"-style quantity suffixes from product text (quantity remains in the Qty field / `qr.quantity`). */
function stripQuoteRequestProductQtyDisplay(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '-';
  s = s.replace(/\s*×\s*[\d.]+/g, '');
  s = s.replace(/\s*;\s*/g, '; ').replace(/\s+/g, ' ').trim();
  return s || '-';
}

const fmtMoney = (n: unknown) => `$${fmtCurrency(n)}`;

/** Pre-tax sum of selected refund lines (qty × unit) — matches {@link processRefund} line subtotals. */
function refundSelectionSubtotal(lines: POSLineItem[]): number {
  return lines.reduce((s, i) => s + safeNum(i.quantity) * safeNum(i.unit_price), 0);
}

/** GCT on refund selection; uses invoice tax % (same as `processRefund` / `processRefundSegments`). */
function refundTaxForSelection(subtotal: number, taxRatePercent: unknown): number {
  return taxAmountFromSubtotalAndGctPercent(subtotal, Number(taxRatePercent) || 0);
}

/** Prefer `quote_id` on the request; then denormalized `quote_number`; then `website_request_id` on quotes (legacy). */
function findQuoteForWebsiteRequest(qr: POSQuoteRequest, quoteList: POSQuote[]): POSQuote | undefined {
  if (qr.quote_id) {
    const byId = quoteList.find((q) => q.id === qr.quote_id);
    if (byId) return byId;
  }
  const qn = (qr.quote_number || '').trim();
  if (qn) {
    const byNum = quoteList.find((q) => q.quote_number === qn);
    if (byNum) return byNum;
  }
  const matches = quoteList.filter((q) => q.website_request_id === qr.id);
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return matches[0];
}

/** Sent emails tied to a customer: same recipient email and/or linked POS documents in history. */
function filterSentEmailsForCustomer(
  emails: POSSentEmail[],
  customer: POSCustomer,
  history: {
    quotes: POSQuote[];
    orders: POSOrder[];
    invoices: POSInvoice[];
    receipts: POSReceipt[];
    refunds: POSRefund[];
  }
): POSSentEmail[] {
  const emailNorm = (customer.email || '').trim().toLowerCase();
  const quoteIds = new Set(history.quotes.map((q) => String(q.id)));
  const orderIds = new Set(history.orders.map((o) => String(o.id)));
  const invoiceIds = new Set(history.invoices.map((i) => String(i.id)));
  const receiptIds = new Set(history.receipts.map((r) => String(r.id)));
  const refundIds = new Set(history.refunds.map((r) => String(r.id)));

  const filtered = emails.filter((e) => {
    const to = (e.recipient_email || '').trim().toLowerCase();
    if (emailNorm && to === emailNorm) return true;
    const dt = (e.document_type || '').toLowerCase();
    const did = String(e.document_id || '');
    if (dt === 'quote' && quoteIds.has(did)) return true;
    if (dt === 'order' && orderIds.has(did)) return true;
    if (dt === 'invoice' && invoiceIds.has(did)) return true;
    if (dt === 'receipt' && receiptIds.has(did)) return true;
    if (dt === 'refund' && refundIds.has(did)) return true;
    return false;
  });
  return filtered.sort((a, b) => {
    const ta = new Date(a.sent_at || 0).getTime();
    const tb = new Date(b.sent_at || 0).getTime();
    return tb - ta;
  });
}

/** Matches {@link renderDocList} filter for quote / order / invoice rows (not receipts). */
function docMatchesPosListSearch(
  doc: POSQuote | POSOrder | POSInvoice,
  q: string,
  numKey: 'quote_number' | 'order_number' | 'invoice_number',
  receipts: POSReceipt[],
  invoices: POSInvoice[]
): boolean {
  const numberText = String(doc[numKey] || '').toLowerCase();
  const customerText = String(doc.customer_name || '').toLowerCase();
  const customerEmailText = String(doc.customer_email || '').toLowerCase();
  const customerPhoneText = String(doc.customer_phone || '').toLowerCase();
  const productText = (doc.items || [])
    .map((i: POSLineItem) => `${i.product_name || ''} ${i.part_number || ''}`)
    .join(' ')
    .toLowerCase();
  const statusText = String(doc.status || (doc as POSInvoice).delivery_status || '').toLowerCase();
  const invoiceLinkedReceiptNumbersText =
    numKey === 'invoice_number'
      ? receiptNumbersAssociatedWithInvoice(doc as POSInvoice, receipts)
          .map((n) => n.toLowerCase())
          .join(' ')
      : '';
  return (
    numberText.includes(q) ||
    customerText.includes(q) ||
    customerEmailText.includes(q) ||
    customerPhoneText.includes(q) ||
    productText.includes(q) ||
    statusText.includes(q) ||
    invoiceLinkedReceiptNumbersText.includes(q)
  );
}

/**
 * Sidebar → Checkout: if the list search narrows to one document (or exact doc #), open checkout with that doc.
 */
function pickCheckoutDocFromListSearch<T extends POSQuote | POSOrder | POSInvoice>(
  docs: T[],
  searchRaw: string,
  numKey: 'quote_number' | 'order_number' | 'invoice_number',
  receipts: POSReceipt[],
  invoices: POSInvoice[]
): T | null {
  const q = searchRaw.trim().toLowerCase();
  if (!q) return null;
  const filtered = docs.filter((d) => docMatchesPosListSearch(d, q, numKey, receipts, invoices));
  if (filtered.length === 1) return filtered[0];
  const exact = docs.find((d) => String(d[numKey] || '').toLowerCase() === q);
  return exact ?? null;
}

/** Quote Requests list: single filtered row with a linked quote → use that quote on checkout. */
function pickQuoteFromQuoteRequestsCheckoutSource(
  qrList: POSQuoteRequest[],
  searchRaw: string,
  quoteList: POSQuote[]
): POSQuote | null {
  const s = searchRaw.trim().toLowerCase();
  if (!s) return null;
  const filtered = qrList.filter((qr) => {
    const linked = findQuoteForWebsiteRequest(qr, quoteList);
    const customerText = `${qr.name || ''} ${qr.email || ''} ${qr.phone || ''}`.toLowerCase();
    const productText = `${qr.product || ''} ${qr.category || ''}`.toLowerCase();
    const quoteNum = `${linked?.quote_number || qr.quote_number || ''}`.toLowerCase();
    return customerText.includes(s) || productText.includes(s) || quoteNum.includes(s);
  });
  if (filtered.length !== 1) return null;
  const linked = findQuoteForWebsiteRequest(filtered[0], quoteList);
  return linked ?? null;
}

/** Build `PrintDocProps` from a stored quote for quotation HTML (popup / print / email body). */
function posQuoteToEmailPreviewProps(q: POSQuote): PrintDocProps {
  return {
    type: 'quote',
    docNumber: q.quote_number,
    date: q.created_at,
    customerName: q.customer_name,
    customerEmail: q.customer_email,
    customerPhone: q.customer_phone,
    customerCompany: q.customer_company,
    customerAccountNo: q.customer_id,
    items: q.items || [],
    subtotal: q.subtotal,
    taxRate: q.tax_rate,
    taxAmount: q.tax_amount,
    discountAmount: q.discount_amount,
    total: q.total,
    notes: q.notes || undefined,
    status: q.status,
    validUntil: q.valid_until || undefined,
  };
}

const SENT_EMAIL_EMPTY_BODY_FALLBACK = `<div style="padding:24px;font-family:Segoe UI,Tahoma,sans-serif;color:#64748b;font-size:14px;line-height:1.5">No HTML body is stored for this message. For newer sends, the full email appears here.</div>`;

/** HTML for sent-email preview iframe and resend — stored body or rebuild from quote when missing. */
function resolveSentEmailHtmlBody(e: POSSentEmail, quotes: POSQuote[]): string {
  const stored = (e.html_body || '').trim();
  if (stored) return stored;
  if (e.document_type === 'quote' && e.document_id) {
    const q = quotes.find((x) => x.id === e.document_id);
    if (q) return generateEmailHTML(posQuoteToEmailPreviewProps(q));
  }
  return SENT_EMAIL_EMPTY_BODY_FALLBACK;
}

function posOrderToEmailPreviewProps(o: POSOrder): PrintDocProps {
  return {
    type: 'order',
    docNumber: o.order_number,
    date: o.created_at,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    customerAccountNo: o.customer_id,
    items: o.items || [],
    subtotal: o.subtotal,
    taxRate: o.tax_rate,
    taxAmount: o.tax_amount,
    discountAmount: o.discount_amount,
    total: o.total,
    notes: o.notes || undefined,
    status: o.status,
  };
}

function posInvoiceToEmailPreviewProps(i: POSInvoice): PrintDocProps {
  const rawItems = i.items as unknown;
  const items: POSLineItem[] = Array.isArray(rawItems)
    ? rawItems
    : typeof rawItems === 'string'
      ? (() => {
          try {
            const p = JSON.parse(rawItems);
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        })()
      : [];
  return {
    type: 'invoice',
    docNumber: i.invoice_number,
    date: i.created_at,
    customerName: i.customer_name,
    customerEmail: i.customer_email,
    customerPhone: i.customer_phone,
    customerAccountNo: i.customer_id,
    items,
    subtotal: i.subtotal,
    taxRate: i.tax_rate,
    taxAmount: i.tax_amount,
    discountAmount: i.discount_amount,
    total: i.total,
    amountPaid: i.amount_paid,
    paymentMethod: i.payment_method,
    notes: i.notes || undefined,
    status: i.status,
  };
}

// ─── Main CMS Dashboard ───
const CMSDashboardInner: React.FC = () => {
  const { notify } = useCMSNotification();
  const navigate = useNavigate();
  const { username, logout } = useCMSAuth();
  type PageKey =
    | 'pos-dashboard'
    | 'pos-quotes'
    | 'pos-orders'
    | 'pos-invoices'
    | 'pos-receipts'
    | 'pos-customers'
    | 'pos-customer-history'
    | 'pos-quote-requests'
    | 'pos-refunds'
    | 'pos-emails'
    | 'pos-settings-email'
    | 'pos-settings-billing'
    | 'cms-sections'
    | 'cms-products'
    | 'cms-categories'
    | 'cms-contact'
    | 'cms-profile'
    | 'pos-create-quote'
    | 'pos-create-order'
    | 'pos-create-invoice'
    | 'pos-checkout';
  const [activePage, setActivePage] = useState<PageKey>('pos-dashboard');
  const pageHistoryRef = useRef<PageKey[]>(['pos-dashboard']);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);


  // POS Data
  const [quotes, setQuotes] = useState<POSQuote[]>([]);
  const [orders, setOrders] = useState<POSOrder[]>([]);
  const [invoices, setInvoices] = useState<POSInvoice[]>([]);
  const [receipts, setReceipts] = useState<POSReceipt[]>([]);
  const [refunds, setRefunds] = useState<POSRefund[]>([]);
  const [customers, setCustomers] = useState<POSCustomer[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<POSQuoteRequest[]>([]);
  const [sentEmails, setSentEmails] = useState<POSSentEmail[]>([]);
  const [smtpSettings, setSmtpSettings] = useState<POSSmtpSettings>({ host: '', port: 587, username: '', password: '', from_email: '', from_name: '', use_tls: true });
  const [editDoc, setEditDoc] = useState<any>(null);
  const [prefillData, setPrefillData] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<any>(null);
  const [orderEditorReturnPage, setOrderEditorReturnPage] = useState<PageKey | null>(null);
  const [invoiceEditorReturnPage, setInvoiceEditorReturnPage] = useState<PageKey | null>(null);
  const [customerPendingDelete, setCustomerPendingDelete] = useState<POSCustomer | null>(null);
  const realCustomers = useMemo(
    () => customers.filter((c) => !isPlaceholderWalkInCustomerName(c.name)),
    [customers]
  );
  const displayCustomers = realCustomers;
  const mergedPlaceholderIdsByCanonicalId = useMemo(() => new Map<string, string[]>(), []);
  const [checkoutSource, setCheckoutSource] = useState<{ sourceType: 'quote' | 'order' | 'invoice'; sourceDocId: string } | null>(null);
  /** After Exchange refund: Checkout opens with this customer + intro dialog + Pay with Store Credit. */
  const [checkoutExchangeHandoff, setCheckoutExchangeHandoff] = useState<{ customerId: string } | null>(null);
  const [checkoutExchangeNavKey, setCheckoutExchangeNavKey] = useState(0);
  /** Page to return to when leaving checkout via Back / Complete (unless cleared by navTo). */
  const [checkoutReturnPage, setCheckoutReturnPage] = useState<PageKey | null>(null);
  /** Where the user opened the quote editor from (Quotes list vs Quote Requests); drives Back on pos-create-quote. */
  const [quoteEditorReturnPage, setQuoteEditorReturnPage] = useState<PageKey | null>(null);
  const [viewQuotePopup, setViewQuotePopup] = useState<POSQuote | null>(null);
  const [viewOrderPopup, setViewOrderPopup] = useState<POSOrder | null>(null);
  const [viewInvoicePopup, setViewInvoicePopup] = useState<POSInvoice | null>(null);
  const [viewReceiptPopup, setViewReceiptPopup] = useState<POSReceipt | null>(null);
  const [viewRefundPopup, setViewRefundPopup] = useState<POSRefund | null>(null);
  const [quotesSearch, setQuotesSearch] = useState('');
  const [ordersSearch, setOrdersSearch] = useState('');
  const [invoicesSearch, setInvoicesSearch] = useState('');
  const [receiptsSearch, setReceiptsSearch] = useState('');
  const [refundsSearch, setRefundsSearch] = useState('');
  const [quoteRequestsSearch, setQuoteRequestsSearch] = useState('');
  const quoteRequestsTable = usePosResizableTableLayout({
    columnCount: 6,
    defaultPercents: [...POS_DEFAULT_COL_PCT_QUOTE_REQUESTS],
    panelMins: POS_QUOTE_REQUESTS_PANEL_MIN,
  });
  const docQuoteTable = usePosResizableTableLayout({
    columnCount: 7,
    defaultPercents: [...POS_DEFAULT_COL_PCT_DOC.quote],
    panelMins: POS_DOC_PANEL_MIN.quote,
  });
  const docOrderTable = usePosResizableTableLayout({
    columnCount: 6,
    defaultPercents: [...POS_DEFAULT_COL_PCT_DOC.order],
    panelMins: POS_DOC_PANEL_MIN.order,
  });
  const docInvoiceTable = usePosResizableTableLayout({
    columnCount: 6,
    defaultPercents: [...POS_DEFAULT_COL_PCT_DOC.invoice],
    panelMins: POS_DOC_PANEL_MIN.invoice,
  });
  const docReceiptTable = usePosResizableTableLayout({
    columnCount: 8,
    defaultPercents: [...POS_DEFAULT_COL_PCT_DOC.receipt],
    panelMins: POS_DOC_PANEL_MIN.receipt,
  });
  const customersTable = usePosResizableTableLayout({
    columnCount: 6,
    defaultPercents: [...POS_DEFAULT_COL_PCT_CUSTOMERS],
    panelMins: POS_CUSTOMERS_PANEL_MIN,
  });
  const refundsTable = usePosResizableTableLayout({
    columnCount: 7,
    defaultPercents: [...POS_DEFAULT_COL_PCT_REFUNDS],
    panelMins: POS_REFUNDS_PANEL_MIN,
  });
  const sentEmailsTable = usePosResizableTableLayout({
    columnCount: 6,
    defaultPercents: [...POS_DEFAULT_COL_PCT_SENT_EMAILS],
    panelMins: POS_SENT_EMAILS_PANEL_MIN,
  });

  const viewQuotePopupHtml = useMemo(() => {
    if (!viewQuotePopup) return '';
    try {
      const fragment = buildQuotationDocumentHtml(posQuoteToEmailPreviewProps(viewQuotePopup), loadContactDetails(), {
        mode: 'email',
        companyName: 'Voltz Industrial Supply',
        previewLayout: 'compact',
      });
      return buildQuotationPreviewSrcDoc(fragment);
    } catch (e) {
      console.error('viewQuotePopupHtml', e);
      return buildQuotationPreviewSrcDoc(
        '<div style="padding:24px;font-family:Inter,sans-serif;color:#b91c1c;font-size:14px">Preview could not be rendered.</div>'
      );
    }
  }, [viewQuotePopup]);
  const viewOrderPopupHtml = useMemo(() => {
    if (!viewOrderPopup) return '';
    try {
      const fragment = buildQuotationDocumentHtml(posOrderToEmailPreviewProps(viewOrderPopup), loadContactDetails(), {
        mode: 'email',
        companyName: 'Voltz Industrial Supply',
        previewLayout: 'compact',
      });
      return buildQuotationPreviewSrcDoc(fragment);
    } catch (e) {
      console.error('viewOrderPopupHtml', e);
      return buildQuotationPreviewSrcDoc(
        '<div style="padding:24px;font-family:Inter,sans-serif;color:#b91c1c;font-size:14px">Preview could not be rendered.</div>'
      );
    }
  }, [viewOrderPopup]);
  const viewInvoicePopupHtml = useMemo(() => {
    if (!viewInvoicePopup) return '';
    try {
      const fragment = buildQuotationDocumentHtml(posInvoiceToEmailPreviewProps(viewInvoicePopup), loadContactDetails(), {
        mode: 'email',
        companyName: 'Voltz Industrial Supply',
        previewLayout: 'compact',
      });
      return buildQuotationPreviewSrcDoc(fragment);
    } catch (e) {
      console.error('viewInvoicePopupHtml', e);
      return buildQuotationPreviewSrcDoc(
        '<div style="padding:24px;font-family:Inter,sans-serif;color:#b91c1c;font-size:14px">Preview could not be rendered.</div>'
      );
    }
  }, [viewInvoicePopup]);
  const viewReceiptPopupHtml = useMemo(() => {
    if (!viewReceiptPopup) return '';
    try {
      const receiptPreviewProps = buildReceiptPrintDocPropsForPreview(viewReceiptPopup, customers, invoices);
      const fragment = buildQuotationDocumentHtml(receiptPreviewProps, loadContactDetails(), {
        mode: 'email',
        companyName: 'Voltz Industrial Supply',
        previewLayout: 'compact',
      });
      return buildQuotationPreviewSrcDoc(fragment);
    } catch (e) {
      console.error('viewReceiptPopupHtml', e);
      return buildQuotationPreviewSrcDoc(
        '<div style="padding:24px;font-family:Inter,sans-serif;color:#b91c1c;font-size:14px">Preview could not be rendered.</div>'
      );
    }
  }, [viewReceiptPopup, invoices, customers]);

  const viewRefundPopupHtml = useMemo(() => {
    if (!viewRefundPopup) return '';
    try {
      const props = buildRefundPrintDocProps(viewRefundPopup, invoices);
      const fragment = buildQuotationDocumentHtml(props, loadContactDetails(), {
        mode: 'email',
        companyName: 'Voltz Industrial Supply',
        previewLayout: 'compact',
      });
      return buildQuotationPreviewSrcDoc(fragment);
    } catch (e) {
      console.error('viewRefundPopupHtml', e);
      return buildQuotationPreviewSrcDoc(
        '<div style="padding:24px;font-family:Inter,sans-serif;color:#b91c1c;font-size:14px">Preview could not be rendered.</div>'
      );
    }
  }, [viewRefundPopup, invoices]);

  const [sentEmailPreview, setSentEmailPreview] = useState<POSSentEmail | null>(null);
  const sentEmailViewHtml = useMemo(() => {
    if (!sentEmailPreview) return '';
    return resolveSentEmailHtmlBody(sentEmailPreview, quotes);
  }, [sentEmailPreview, quotes]);

  /** Latest successful send time per quote id (from sent-email log). */
  const quoteEmailSentAtByQuoteId = useMemo(() => {
    const map = new Map<string, string>();
    const rows = Array.isArray(sentEmails) ? sentEmails : [];
    for (const e of rows) {
      if ((e.document_type || '').toLowerCase() !== 'quote' || !e.document_id) continue;
      if (e.status !== 'sent' && e.status !== 'resent') continue;
      const prev = map.get(e.document_id);
      const t = e.sent_at || '';
      if (!t) continue;
      if (!prev || t > prev) map.set(e.document_id, t);
    }
    return map;
  }, [sentEmails]);

  // Refund modal
  const [refundInvoice, setRefundInvoice] = useState<POSInvoice | null>(null);
  const [refundReceiptId, setRefundReceiptId] = useState<string | null>(null);
  /** When refund was opened from Receipts: every invoice linked to that receipt (for display + switching). */
  const [refundReceiptLinkedInvoices, setRefundReceiptLinkedInvoices] = useState<POSInvoice[] | null>(null);
  /** Receipt path only: line items to refund per invoice id (allows one or multiple invoices in one session). */
  const [refundLinesByInvoiceId, setRefundLinesByInvoiceId] = useState<Record<string, POSLineItem[]> | null>(null);
  const [refundSourceReceiptNumber, setRefundSourceReceiptNumber] = useState<string | null>(null);
  const [refundType, setRefundType] = useState<'cash' | 'store_credit' | 'exchange'>('cash');
  const [refundReason, setRefundReason] = useState('');
  const [refundItems, setRefundItems] = useState<POSLineItem[]>([]);
  const [refundRealCustomerArmed, setRefundRealCustomerArmed] = useState(false);
  const [refundRealCustomerForm, setRefundRealCustomerForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
  });
  const refundMatchedCustomerIdRef = useRef<string | null>(null);
  const [refundProcessing, setRefundProcessing] = useState(false);
  /** Synchronous guard — blocks double-submit before React re-renders `refundProcessing`. */
  const refundSubmitLockRef = useRef(false);
  const resetRefundRealCustomerForm = useCallback(() => {
    setRefundRealCustomerArmed(false);
    setRefundRealCustomerForm({ name: '', email: '', phone: '', company: '', address: '' });
    refundMatchedCustomerIdRef.current = null;
  }, []);

  // Checkout modal
  const [checkoutInvoice, setCheckoutInvoice] = useState<POSInvoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const loadData = useCallback(async () => {
    const health = await getApiHealthDb();
    if (!health.reachable) {
      notify({
        variant: 'error',
        title: 'API unreachable',
        subtitle: health.error || 'Confirm the app can reach the API (Render URL in VITE_API_URL, or local npm run dev:full).',
      });
    } else if (!health.dbOk) {
      notify({
        variant: 'error',
        title: 'Database unavailable',
        subtitle: health.error || 'Set AIVEN_MYSQL_* on Render (API service) or in .env for local dev, then redeploy/restart.',
      });
    }

    const [q, o, i, r, ref, c, qr, e, smtp] = await Promise.all([
      fetchQuotes(), fetchOrders(), fetchInvoices(), fetchReceipts(), fetchRefunds(),
      fetchCustomers(), fetchQuoteRequests(), fetchSentEmails(), fetchSmtpSettings(),
    ]);
    setQuotes(asPosRows<POSQuote>(q));
    setOrders(asPosRows<POSOrder>(o));
    setInvoices(asPosRows<POSInvoice>(i));
    setReceipts(asPosRows<POSReceipt>(r));
    setRefunds(asPosRows<POSRefund>(ref));
    setCustomers(asPosRows<POSCustomer>(c));
    setQuoteRequests(asPosRows<POSQuoteRequest>(qr));
    setSentEmails(asPosRows<POSSentEmail>(e));
    if (smtp) setSmtpSettings(smtp);
  }, [notify]);

  /** POS Checkout applies store credit server-side; refresh CRM customer rows so Store Credit column stays accurate. */
  const refreshCustomers = useCallback(async () => {
    const c = await fetchCustomers();
    setCustomers(asPosRows<POSCustomer>(c));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Real-time subscriptions: auto-refresh all POS data on any change across all devices ───
  // NOTE: SMTP settings are excluded - they only update on Save click
  const realtimeSetters = useMemo(() => ({
    setCustomers, setQuotes, setOrders, setInvoices, setReceipts,
    setRefunds, setQuoteRequests, setSentEmails,
  }), []);
  /** Skip POS polling / broadcast refreshes while resizing a table column (avoids janky drags). */
  const posColumnResizeSuspendRef = useRef(false);
  usePOSRealtime(realtimeSetters, true, { suspendRef: posColumnResizeSuspendRef });

  /** Keep History / edit-customer form in sync when `customers` refetches (store credit, balance). */
  useSyncSelectedCustomerFromList(customers, setSelectedCustomer);

  const handleLogout = () => { logout(); navigate('/login'); };

  const posMenuItems: { key: PageKey; label: string; icon: React.FC<any>; badge?: number }[] = [
    { key: 'pos-dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'cms-products', label: 'Products', icon: Package },
    { key: 'pos-quote-requests', label: 'Quote Requests', icon: MessageSquare, badge: quoteRequests.filter(q => q.status === 'new').length },
    { key: 'pos-quotes', label: 'Quotes', icon: FileText },
    { key: 'pos-orders', label: 'Orders', icon: ShoppingCart },
    { key: 'pos-invoices', label: 'Invoices', icon: Receipt },
    { key: 'pos-checkout', label: 'Checkout', icon: ShoppingBag },
    { key: 'pos-receipts', label: 'Receipts', icon: CreditCard },
    { key: 'pos-refunds', label: 'Refunds', icon: Undo },
    { key: 'pos-customers', label: 'Customers', icon: Users },
    { key: 'pos-emails', label: 'Sent Emails', icon: Mail },
    { key: 'pos-settings', label: 'Settings', icon: Settings },
  ];

  const cmsMenuItems: { key: PageKey; label: string; icon: React.FC<any> }[] = [
    { key: 'cms-sections', label: 'Sections', icon: Layout },
    { key: 'cms-contact', label: 'Contact', icon: Phone },
    { key: 'cms-profile', label: 'Company Profile', icon: Building2 },
  ];



  // Close mobile sidebar helper - also resets sub-menu state
  const closeMobileSidebar = () => {
    setMobileSidebarOpen(false);
    setProductsExpanded(false);
    setSettingsExpanded(false);
  };

  const navTo = (page: PageKey) => {
    setActivePage(page);
    setEditDoc(null);
    setPrefillData(null);
    if (page !== 'pos-checkout') {
      setCheckoutSource(null);
      setCheckoutReturnPage(null);
    }
    if (page !== 'pos-create-quote') {
      setQuoteEditorReturnPage(null);
    }
    if (page !== 'pos-create-order') {
      setOrderEditorReturnPage(null);
    }
    if (page !== 'pos-create-invoice') {
      setInvoiceEditorReturnPage(null);
    }
    // On mobile, close sidebar and reset sub-menu; on desktop, leave productsExpanded alone
    if (mobileSidebarOpen) {
      closeMobileSidebar();
    }
  };

  const closeRefundModal = useCallback(() => {
    setRefundInvoice(null);
    setRefundReceiptId(null);
    setRefundReceiptLinkedInvoices(null);
    setRefundLinesByInvoiceId(null);
    setRefundSourceReceiptNumber(null);
    setRefundProcessing(false);
    resetRefundRealCustomerForm();
    refundSubmitLockRef.current = false;
  }, [resetRefundRealCustomerForm]);

  useEffect(() => {
    if (customers.length === 0) return;
    const match = findCustomerByEmailOrPhone(
      customers,
      refundRealCustomerForm.email,
      refundRealCustomerForm.phone
    );
    if (!match) {
      refundMatchedCustomerIdRef.current = null;
      return;
    }
    if (refundMatchedCustomerIdRef.current === String(match.id)) return;
    refundMatchedCustomerIdRef.current = String(match.id);
    setRefundRealCustomerForm((prev) => ({
      ...prev,
      name: String(match.name || '').trim() || prev.name,
      email: String(match.email || '').trim() || prev.email,
      phone: displayUsPhoneFromStored(match.phone),
      company: String(match.company || '').trim() || prev.company,
      address: String(match.address || '').trim() || prev.address,
    }));
  }, [customers, refundRealCustomerForm.email, refundRealCustomerForm.phone]);
  useEffect(() => {
    const h = pageHistoryRef.current;
    if (h[h.length - 1] !== activePage) h.push(activePage);
  }, [activePage]);

  const goBackPage = () => {
    const h = pageHistoryRef.current;
    if (h.length <= 1) return;
    h.pop(); // current
    const target = h[h.length - 1] ?? 'pos-dashboard';
    navTo(target);
  };

  const goCheckoutFromList = useCallback(
    async (payload: { sourceType: 'quote' | 'order' | 'invoice'; sourceDocId: string }) => {
      setCheckoutReturnPage(activePage);
      setCheckoutSource(payload);
      await loadData();
      setActivePage('pos-checkout');
    },
    [activePage, loadData]
  );

  /** Sidebar → Checkout: from Quotes / Quote Requests / Orders / Invoices, load the doc implied by list search when unambiguous. */
  const navigateToCheckoutFromSidebar = useCallback(async () => {
    setCheckoutReturnPage(activePage);
    let next: { sourceType: 'quote' | 'order' | 'invoice'; sourceDocId: string } | null = null;
    switch (activePage) {
      case 'pos-quotes': {
        const d = pickCheckoutDocFromListSearch(quotes, quotesSearch, 'quote_number', receipts, invoices);
        if (d) next = { sourceType: 'quote', sourceDocId: d.id };
        break;
      }
      case 'pos-orders': {
        const d = pickCheckoutDocFromListSearch(orders, ordersSearch, 'order_number', receipts, invoices);
        if (d) next = { sourceType: 'order', sourceDocId: d.id };
        break;
      }
      case 'pos-invoices': {
        const d = pickCheckoutDocFromListSearch(invoices, invoicesSearch, 'invoice_number', receipts, invoices);
        if (d) next = { sourceType: 'invoice', sourceDocId: d.id };
        break;
      }
      case 'pos-quote-requests': {
        const q = pickQuoteFromQuoteRequestsCheckoutSource(quoteRequests, quoteRequestsSearch, quotes);
        if (q) next = { sourceType: 'quote', sourceDocId: q.id };
        break;
      }
      default:
        break;
    }
    let blockedCheckoutNav = false;
    if (next) {
      if (next.sourceType === 'order') {
        const o = orders.find((x) => x.id === next.sourceDocId);
        if (!o) next = null;
        else if (posOrderCheckoutBlocked(o, invoices, refunds)) {
          notify({
            variant: 'warning',
            title: 'Checkout unavailable',
            subtitle: 'This order is refunded or partially refunded, or its invoice cannot be checked out.',
          });
          next = null;
          blockedCheckoutNav = true;
        }
      } else {
        const doc =
          next.sourceType === 'quote'
            ? quotes.find((x) => x.id === next.sourceDocId)
            : invoices.find((x) => x.id === next.sourceDocId);
        if (!doc) next = null;
        else if (checkoutDocumentExcludedDueToRefundedInvoice(doc, invoices, refunds)) {
          notify({
            variant: 'warning',
            title: 'Checkout unavailable',
            subtitle: 'This document is refunded or partially refunded.',
          });
          next = null;
          blockedCheckoutNav = true;
        }
      }
    }
    setCheckoutSource(next);
    if (next) await loadData();
    if (!blockedCheckoutNav) setActivePage('pos-checkout');
    if (mobileSidebarOpen) closeMobileSidebar();
  }, [
    activePage,
    quotes,
    orders,
    invoices,
    quoteRequests,
    receipts,
    refunds,
    quotesSearch,
    ordersSearch,
    invoicesSearch,
    quoteRequestsSearch,
    loadData,
    mobileSidebarOpen,
    notify,
  ]);

  /** Quotes/Orders: jump to Invoices list with search prefilled to open the linked invoice. */
  const goToInvoiceSearch = (invoiceNumber: string) => {
    setInvoicesSearch(invoiceNumber.trim());
    navTo('pos-invoices');
  };

  const goToQuoteSearch = (quoteNumber: string) => {
    setQuotesSearch(quoteNumber.trim());
    navTo('pos-quotes');
  };

  /** Quotes: jump to Orders list with search prefilled to open the linked order. */
  const goToOrderSearch = (orderNumber: string) => {
    setOrdersSearch(orderNumber.trim());
    navTo('pos-orders');
  };

  /** Invoices: jump to Receipts with search prefilled to invoice # (matches receipts linked to that invoice). */
  const goToReceiptsSearchByInvoice = (invoiceNumber: string) => {
    setReceiptsSearch(invoiceNumber.trim());
    navTo('pos-receipts');
  };

  /** Receipts: jump to Invoices with search prefilled to receipt # (matches invoice linked to that receipt). */
  const goToInvoiceSearchByReceipt = (receiptNumber: string) => {
    setInvoicesSearch(receiptNumber.trim());
    navTo('pos-invoices');
  };

  /** Invoices: jump to Refunds with search prefilled to refund # (display form). */
  const goToRefundSearch = (refundNumber: string) => {
    setRefundsSearch(refundNumber.trim());
    navTo('pos-refunds');
  };

  /** Receipts: jump to Refunds with search prefilled to receipt # (finds refunds tied to that receipt). */
  const goToRefundsSearchByReceipt = (receiptNumber: string) => {
    setRefundsSearch(receiptNumber.trim());
    navTo('pos-refunds');
  };

  const openWebsiteRequestInQuoteEditor = useCallback(
    (qr: POSQuoteRequest, listReturnPage: PageKey = 'pos-quote-requests') => {
      const linked = findQuoteForWebsiteRequest(qr, quotes);
      const deliveryPrefs = parseQuoteRequestDeliveryPreferences(qr.message ?? '');
      if (linked) {
        setEditDoc(linked);
        setPrefillData({
          websiteRequestId: qr.id,
          websiteQuoteRequestStatus: qr.status,
          customerName: linked.customer_name ?? qr.name ?? '',
          customerEmail: linked.customer_email ?? qr.email ?? '',
          customerPhone: linked.customer_phone ?? qr.phone ?? '',
          customerCompany: linked.customer_company ?? qr.company ?? '',
          productName: (qr.product ?? '').trim() || '',
          productCategory: (qr.category ?? '').trim() || '',
          productQuantity:
            qr.quantity != null && String(qr.quantity).trim() !== '' ? String(qr.quantity) : '',
          notes: (linked.notes ?? qr.message) ?? '',
          sendViaEmail: deliveryPrefs.sendViaEmail,
          sendViaWhatsapp: deliveryPrefs.sendViaWhatsapp,
        });
      } else {
        setEditDoc(null);
        setPrefillData({
          customerName: qr.name ?? '',
          customerEmail: qr.email ?? '',
          customerPhone: qr.phone ?? '',
          customerCompany: qr.company ?? '',
          productName: (qr.product ?? '').trim() || '',
          productCategory: (qr.category ?? '').trim() || '',
          productQuantity:
            qr.quantity != null && String(qr.quantity).trim() !== '' ? String(qr.quantity) : '',
          notes: qr.message ?? '',
          websiteRequestId: qr.id,
          websiteQuoteRequestStatus: qr.status,
          sendViaEmail: deliveryPrefs.sendViaEmail,
          sendViaWhatsapp: deliveryPrefs.sendViaWhatsapp,
        });
      }
      setQuoteEditorReturnPage(listReturnPage);
      setActivePage('pos-create-quote');
    },
    [quotes]
  );

  // Derived: is the current page Products or Categories?
  const isProductsOrCategoriesActive = activePage === 'cms-products' || activePage === 'cms-categories';
  // Show the Categories sub-menu if user toggled it open OR if they're on the Categories page
  const showCategoriesSubmenu = productsExpanded || activePage === 'cms-categories';

  const isSettingsSectionActive =
    activePage === 'pos-settings-email' || activePage === 'pos-settings-billing';
  const showSettingsSubmenu = settingsExpanded || isSettingsSectionActive;




  // ─── Render Sidebar ───
  const renderSidebar = () => (
    <div className={`bg-[#1e1e2e] text-white flex flex-col h-full transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}>
      {/* Logo */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <img src={LOGO_URL} alt="Voltz" className="h-8 w-auto flex-shrink-0" />
        {!sidebarCollapsed && <span className="text-sm font-bold truncate">Voltz Admin</span>}
      </div>

      {/* POS Section */}
      <div className="flex-1 overflow-y-auto py-2">
        {!sidebarCollapsed && <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Point of Sale</div>}
        {posMenuItems.map(item => {

          // Special handling for Products: render with expandable sub-menu containing Categories
          if (item.key === 'cms-products') {
            const isProductsActive = activePage === 'cms-products';
            return (
              <div key={item.key}>
                <div
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isProductsActive ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]' : isProductsOrCategoriesActive ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  {/* Clicking the icon + label navigates to Products page */}
                  <button
                    onClick={() => navTo('cms-products')}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <Package className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                  {/* Clicking the chevron only toggles the sub-menu */}
                  {!sidebarCollapsed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProductsExpanded(prev => !prev);
                      }}
                      className="p-1 rounded-md hover:bg-white/10 flex-shrink-0 transition-colors"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCategoriesSubmenu ? 'rotate-0' : '-rotate-90'}`} />
                    </button>
                  )}
                </div>
                {/* Sub-menu: Categories */}
                {!sidebarCollapsed && showCategoriesSubmenu && (
                  <button
                    onClick={() => navTo('cms-categories')}
                    className={`w-full flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${activePage === 'cms-categories' ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Categories</span>
                  </button>
                )}
              </div>
            );
          }

          // Settings: row only toggles submenu (does not navigate)
          if (item.key === 'pos-settings') {
            return (
              <div key={item.key}>
                <button
                  type="button"
                  onClick={() => setSettingsExpanded(prev => !prev)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left text-gray-400 hover:text-white hover:bg-white/5"
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-expanded={showSettingsSubmenu}
                  aria-controls="settings-submenu"
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate flex-1 min-w-0">{item.label}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${showSettingsSubmenu ? 'rotate-0' : '-rotate-90'}`}
                      />
                    </>
                  )}
                </button>
                {!sidebarCollapsed && showSettingsSubmenu && (
                  <div id="settings-submenu">
                    <button
                      type="button"
                      onClick={() => navTo('pos-settings-email')}
                      className={`w-full flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${
                        activePage === 'pos-settings-email'
                          ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">Email Configuration</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navTo('pos-settings-billing')}
                      className={`w-full flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${
                        activePage === 'pos-settings-billing'
                          ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">Billing / Invoicing</span>
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // Checkout: from list pages, carry over a single filtered doc when search is unambiguous; else empty cart
          if (item.key === 'pos-checkout') {
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => void navigateToCheckoutFromSidebar()}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${activePage === 'pos-checkout' ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          }

          // Default rendering for all other menu items

          return (
            <button key={item.key} onClick={() => navTo(item.key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${activePage === item.key ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              title={sidebarCollapsed ? item.label : undefined}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              {!sidebarCollapsed && item.badge && item.badge > 0 ? <span className="ml-auto bg-[#e31e24] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span> : null}
            </button>
          );
        })}


        <div className="my-2 mx-4 border-t border-white/10" />
        {!sidebarCollapsed && <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Website CMS</div>}
        {cmsMenuItems.map(item => (
          <button key={item.key} onClick={() => navTo(item.key)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${activePage === item.key ? 'bg-[#e31e24]/20 text-[#e31e24] font-semibold border-r-2 border-[#e31e24]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            title={sidebarCollapsed ? item.label : undefined}>
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </div>

      {/* Bottom */}
      <div className="border-t border-white/10 p-3">
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-full flex items-center justify-center gap-2 py-2 text-gray-500 hover:text-white text-xs">
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /> Collapse</>}
        </button>
      </div>
    </div>
  );

  // ─── POS Dashboard (new analytics view) ───
  const renderDashboard = () => (
    <POSDashboardView
      quotes={quotes}
      orders={orders}
      invoices={invoices}
      receipts={receipts}
      refunds={refunds}
      customers={realCustomers}
      quoteRequests={quoteRequests}
    />
  );


  // ─── Document List (shared for quotes, orders, invoices, receipts) ───
  const renderDocList = (
    docType: 'quote' | 'order' | 'invoice' | 'receipt',
    embed?: { scopedRows: POSQuote[] | POSOrder[] | POSInvoice[] | POSReceipt[]; editorReturnPage: PageKey }
  ) => {
    const fromState = { quote: quotes, order: orders, invoice: invoices, receipt: receipts }[docType];
    const rawDocs = embed?.scopedRows ?? fromState;
    const docs = Array.isArray(rawDocs) ? rawDocs : [];
    const listReturn = embed?.editorReturnPage ?? 'pos-quotes';
    const orderInvReturn = embed?.editorReturnPage ?? null;
    const label = { quote: 'Quotes', order: 'Orders', invoice: 'Invoices', receipt: 'Receipts' }[docType];
    const numKey = { quote: 'quote_number', order: 'order_number', invoice: 'invoice_number', receipt: 'receipt_number' }[docType];
    const canCreate = docType !== 'receipt';
    const searchValue =
      docType === 'quote'
        ? quotesSearch
        : docType === 'order'
          ? ordersSearch
          : docType === 'invoice'
            ? invoicesSearch
            : docType === 'receipt'
              ? receiptsSearch
              : '';
    const setSearchValue =
      docType === 'quote'
        ? setQuotesSearch
        : docType === 'order'
          ? setOrdersSearch
          : docType === 'invoice'
            ? setInvoicesSearch
            : docType === 'receipt'
              ? setReceiptsSearch
              : undefined;
    const q = embed ? '' : searchValue.trim().toLowerCase();
    const filteredDocs =
      embed || q === ''
        ? docs
        : docs.filter((doc: any) => {
            const numberText = String(doc[numKey] || '').toLowerCase();
            const customerText = String(doc.customer_name || '').toLowerCase();
            const customerEmailText = String(doc.customer_email || '').toLowerCase();
            const customerPhoneText = String(doc.customer_phone || '').toLowerCase();
            const lineItemsForSearch = Array.isArray(doc.items) ? doc.items : [];
            const productText = lineItemsForSearch
              .map((i: POSLineItem) => `${i.product_name || ''} ${i.part_number || ''}`)
              .join(' ')
              .toLowerCase();
            const statusText = String(doc.status || doc.delivery_status || '').toLowerCase();
            const receiptTypeText = docType === 'receipt' ? String(doc.payment_type || '').replace('_', ' ').toLowerCase() : '';
            const receiptPaymentMethodText =
              docType === 'receipt' ? String((doc as POSReceipt).payment_method || '').replace('_', ' ').toLowerCase() : '';
            const receiptInvoiceNumberText =
              docType === 'receipt'
                ? invoiceNumbersAssociatedWithReceipt(doc as POSReceipt, invoices)
                    .map((n) => n.toLowerCase())
                    .join(' ')
                : '';
            const invoiceLinkedReceiptNumbersText =
              docType === 'invoice'
                ? receiptNumbersAssociatedWithInvoice(doc as POSInvoice, receipts)
                    .map((n) => n.toLowerCase())
                    .join(' ')
                : '';
            return (
              numberText.includes(q) ||
              customerText.includes(q) ||
              customerEmailText.includes(q) ||
              customerPhoneText.includes(q) ||
              productText.includes(q) ||
              statusText.includes(q) ||
              receiptTypeText.includes(q) ||
              receiptPaymentMethodText.includes(q) ||
              receiptInvoiceNumberText.includes(q) ||
              invoiceLinkedReceiptNumbersText.includes(q)
            );
          });

    const docTable =
      docType === 'quote'
        ? docQuoteTable
        : docType === 'order'
          ? docOrderTable
          : docType === 'invoice'
            ? docInvoiceTable
            : docReceiptTable;
    const docBaseRem = POS_DOC_BASE_MIN_WIDTH_REM[docType];
    const docAutoSaveId =
      docType === 'quote'
        ? 'pos-doc-quote-panels-v1'
        : docType === 'order'
          ? 'pos-doc-order-panels-v1'
          : docType === 'invoice'
            ? 'pos-doc-invoice-panels-v1'
            : 'pos-doc-receipt-panels-v1';
    return (
      <div className={POS_PAGE_SHELL}>
        {!embed && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
              <PosListPageTitleFa kind={posListPageKindFromDocType(docType)} />
              {label}
            </h2>
          </div>
          {canCreate && (
            <button onClick={() => {
              if (docType === 'quote') setQuoteEditorReturnPage(listReturn);
              if (docType === 'order') setOrderEditorReturnPage(orderInvReturn);
              if (docType === 'invoice') setInvoiceEditorReturnPage(orderInvReturn);
              setEditDoc(null);
              setPrefillData(null);
              setActivePage(`pos-create-${docType}` as PageKey);
            }}
              className="flex items-center gap-2 px-4 py-2 bg-[#e31e24] text-white rounded-lg text-sm font-semibold hover:bg-[#c91a1f]">
              <Plus className="w-4 h-4" /> New {label.slice(0, -1)}
            </button>
          )}
        </div>
        )}
        {!embed && setSearchValue && (
          <div className={POS_SEARCH_CARD}>
            <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-0 sm:max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className={POS_QUICK_SEARCH_INPUT}
                placeholder={
                  docType === 'receipt'
                    ? 'Search by customer, email, phone, product, receipt #, invoice #, status, or payment method'
                    : docType === 'invoice'
                      ? 'Search by customer, email, phone, product, invoice #, receipt #, or status'
                      : `Search ${label.toLowerCase()} by customer, email, phone, product, ${label.slice(0, -1).toLowerCase()} #, or status`
                }
              />
            </div>
            {searchValue.trim() ? (
              <button
                type="button"
                onClick={() => setSearchValue('')}
                className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
            ) : null}
            </div>
          </div>
        )}
        <PosResizableTableFrame
          key={`pos-doc-${docType}-${embed ? 'embed' : 'page'}`}
          table={docTable}
          baseMinWidthRem={docBaseRem}
          edgeAriaLabel="Widen or narrow the table from the right edge"
          edgeTitle="Drag right to widen the table; drag left to narrow"
          header={
            <>
              <DocListPanelHeader docType={docType} table={docTable} autoSaveId={docAutoSaveId} />
              <div
                className="pointer-events-none absolute right-3 top-1/2 z-[5] h-3/4 w-px -translate-y-1/2 bg-gray-200"
                aria-hidden
              />
            </>
          }
        >
            {filteredDocs.map((doc: any, rowIdx: number) => (
              <div
                key={doc?.id != null ? String(doc.id) : `${docType}-row-${rowIdx}`}
                className="grid items-center gap-x-0 border-b border-gray-100 bg-white text-[13px] transition-colors duration-150 hover:bg-gray-50/70"
                style={{ gridTemplateColumns: docTable.gridTemplateColumns }}
              >
                <div className="min-w-0 overflow-hidden px-3 py-2.5 pl-4 text-left">
                  <span className="block truncate font-semibold text-[#1a2332]">{doc[numKey]}</span>
                </div>
                <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-600">
                  <span className="block truncate">{doc.customer_name || 'Visitor'}</span>
                </div>
                <div className="min-w-0 overflow-hidden px-3 py-2.5 pl-2 text-left tabular-nums text-gray-500">
                  <span className="block truncate whitespace-nowrap">{fmtDate(doc.created_at) || '—'}</span>
                </div>
                {docType === 'receipt' ? (
                  <>
                    <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left capitalize text-gray-500">
                      <span className="block truncate">{(doc.payment_method || '—').replace('_', ' ')}</span>
                    </div>
                    <div className="min-w-0 overflow-hidden px-3 py-2.5 text-right font-bold tabular-nums">
                      <span className="block truncate">{fmtMoney(doc.total)}</span>
                    </div>
                    <div className="min-w-0 overflow-hidden px-3 py-2.5 text-right font-bold tabular-nums">
                      <span className="block truncate">{fmtMoney((doc as POSReceipt).amount_paid)}</span>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0 overflow-hidden px-3 py-2.5 text-right font-bold tabular-nums">
                    <span className="block truncate">{fmtMoney(doc.total)}</span>
                  </div>
                )}
                <div className="flex min-w-0 items-center justify-center overflow-hidden px-3 py-2.5 [&_.inline-flex]:max-w-full">
                  {docType === 'quote' || docType === 'order' ? (
                    <QuoteOrderInvoiceStatusCell
                      doc={doc as POSQuote | POSOrder}
                      docType={docType}
                      invoiceList={invoices}
                      orderList={orders}
                      refunds={refunds}
                      onOpenInvoice={goToInvoiceSearch}
                      onOpenOrder={goToOrderSearch}
                    />
                  ) : docType === 'invoice' ? (
                    <InvoicePaymentReceiptsStatusCell
                      inv={doc as POSInvoice}
                      receipts={receipts}
                      orders={orders}
                      invoices={invoices}
                      refunds={refunds}
                      onOpenReceiptsByInvoice={goToReceiptsSearchByInvoice}
                      onOpenOrder={goToOrderSearch}
                    />
                  ) : docType === 'receipt' ? (
                    <ReceiptLinkedInvoiceStatusCell
                      rec={doc as POSReceipt}
                      invoices={invoices}
                      refunds={refunds}
                      onOpenInvoiceByReceiptSearch={goToInvoiceSearchByReceipt}
                      onOpenRefundsByReceiptSearch={goToRefundsSearchByReceipt}
                    />
                  ) : (
                    <StatusBadge status={doc.status || doc.delivery_status || ''} />
                  )}
                </div>
                {docType === 'quote' && (
                  <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-500 tabular-nums">
                    <span className="block truncate whitespace-nowrap">
                      {(() => {
                        const at = (doc as POSQuote).email_sent_at || quoteEmailSentAtByQuoteId.get(doc.id);
                        return at ? fmtDate(at) : '—';
                      })()}
                    </span>
                  </div>
                )}
                <div className="flex min-h-0 min-w-0 items-center justify-center self-stretch overflow-hidden px-2 py-2.5">
                    {docType === 'quote' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex shrink-0 items-center gap-0.5 px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                          >
                            Actions
                            <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[11rem]">
                          {(() => {
                            const inv = resolveInvoiceForQuoteOrOrder(doc as POSQuote, 'quote', invoices);
                            if (inv && invoiceIsFullyPaid(inv)) return null;
                            return (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => {
                                  setQuoteEditorReturnPage(listReturn);
                                  setPrefillData(null);
                                  setEditDoc(doc);
                                  setActivePage('pos-create-quote');
                                }}
                              >
                                <PosActionsFa icon={POS_MENU_FA.review} />
                                Review
                              </DropdownMenuItem>
                            );
                          })()}
                          <DropdownMenuItem className="gap-2" onClick={() => setViewQuotePopup(doc as POSQuote)}>
                            <PosActionsFa icon={POS_MENU_FA.view} />
                            View Quote
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => printDocument({ type: 'quote', docNumber: doc.quote_number, date: doc.created_at, customerName: doc.customer_name, customerEmail: doc.customer_email, customerPhone: doc.customer_phone, items: doc.items || [], subtotal: doc.subtotal || 0, taxRate: doc.tax_rate, taxAmount: doc.tax_amount, discountAmount: doc.discount_amount, total: doc.total || 0, notes: doc.notes, status: doc.status })}
                          >
                            <PosActionsFa icon={POS_MENU_FA.print} />
                            Print Quote
                          </DropdownMenuItem>
                          {(doc as POSQuote).status !== 'dormant' ? (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={async () => {
                                const q = doc as POSQuote;
                                try {
                                  await saveQuote(
                                    { ...q, status: 'dormant' },
                                    { syncLinked: false, skipOrderGeneratedPromotion: true }
                                  );
                                  await loadData();
                                  notify({
                                    variant: 'success',
                                    title: 'Quote set to Dormant',
                                    subtitle: `${q.quote_number} — hidden from checkout customer search; find by quote #.`,
                                  });
                                } catch {
                                  notify({ variant: 'error', title: 'Could not update quote', subtitle: 'POS → Quotes' });
                                }
                              }}
                            >
                              <PosActionsFa icon={POS_MENU_FA.setDormant} />
                              Set Dormant
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={async () => {
                                const q = doc as POSQuote;
                                try {
                                  const saved = await saveQuote(
                                    { ...q, status: 'reviewed' },
                                    { syncLinked: false, skipOrderGeneratedPromotion: true }
                                  );
                                  await loadData();
                                  notify({
                                    variant: 'success',
                                    title: 'Quote restored',
                                    subtitle: `${saved.quote_number} — ${posQuoteWorkflowStatusLabel(saved.status)}.`,
                                  });
                                } catch {
                                  notify({ variant: 'error', title: 'Could not update quote', subtitle: 'POS → Quotes' });
                                }
                              }}
                            >
                              <PosActionsFa icon={POS_MENU_FA.restoreDormant} />
                              Restore from Dormant
                            </DropdownMenuItem>
                          )}
                          {!(doc as POSQuote).order_id && !(doc as POSQuote).invoice_id && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={async () => {
                                const o = await createOrderFromQuote(doc as POSQuote);
                                if (o) {
                                  await loadData();
                                  notify({ variant: 'success', title: 'Order created', subtitle: `POS → Quotes — ${o.order_number}` });
                                } else {
                                  notify({ variant: 'error', title: 'Could not create order', subtitle: 'POS → Quotes' });
                                }
                              }}
                            >
                              <PosActionsFa icon={POS_MENU_FA.generateOrder} />
                              Generate Order
                            </DropdownMenuItem>
                          )}
                          {!(doc as POSQuote).invoice_id && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={async () => {
                                const inv = await createInvoiceFromQuote(doc as POSQuote);
                                if (inv) {
                                  await loadData();
                                  notify({ variant: 'success', title: 'Invoice created', subtitle: `POS → Quotes — ${inv.invoice_number}` });
                                } else {
                                  notify({ variant: 'error', title: 'Could not create invoice', subtitle: 'POS → Quotes' });
                                }
                              }}
                            >
                              <PosActionsFa icon={POS_MENU_FA.generateInvoice} />
                              Generate Invoice
                            </DropdownMenuItem>
                          )}
                          {(() => {
                            const q = doc as POSQuote;
                            const invRow = q.invoice_id ? invoices.find((i) => i.id === q.invoice_id) : undefined;
                            const can =
                              !q.invoice_id ||
                              (invRow &&
                                invoiceIsOpenBalance(invRow) &&
                                !invoiceExcludedFromCheckoutDocumentSearch(invRow, refunds));
                            if (!can) return null;
                            return (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={async () => {
                                  await goCheckoutFromList({ sourceType: 'quote', sourceDocId: q.id });
                                }}
                              >
                                <PosActionsFa icon={POS_MENU_FA.checkout} />
                                Checkout
                              </DropdownMenuItem>
                            );
                          })()}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex shrink-0 items-center gap-0.5 px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                          >
                            Actions
                            <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[11rem]">
                          {docType === 'order' && (
                            <>
                              {(() => {
                                const o = doc as POSOrder;
                                // Match Orders status badge: Paid/Partially Paid + refunds can show “Partially Refunded”
                                // while `pos_orders.status` stays `invoice_generated_*` — still hide Review.
                                if (posOrderCheckoutBlocked(o, invoices, refunds)) return null;
                                const inv = resolveInvoiceForQuoteOrOrder(o, 'order', invoices);
                                if (inv && invoiceIsFullyPaid(inv)) return null;
                                return (
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={() => {
                                      setOrderEditorReturnPage(orderInvReturn);
                                      setEditDoc(doc);
                                      setPrefillData(null);
                                      setActivePage('pos-create-order');
                                    }}
                                  >
                                    <PosActionsFa icon={POS_MENU_FA.review} />
                                    Review
                                  </DropdownMenuItem>
                                );
                              })()}
                              <DropdownMenuItem className="gap-2" onClick={() => setViewOrderPopup(doc as POSOrder)}>
                                <PosActionsFa icon={POS_MENU_FA.view} />
                                View Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => printDocument({ type: 'order', docNumber: doc.order_number, date: doc.created_at, customerName: doc.customer_name, customerEmail: doc.customer_email, customerPhone: doc.customer_phone, items: doc.items || [], subtotal: doc.subtotal || 0, taxRate: doc.tax_rate, taxAmount: doc.tax_amount, discountAmount: doc.discount_amount, total: doc.total || 0, notes: doc.notes, status: doc.status })}
                              >
                                <PosActionsFa icon={POS_MENU_FA.print} />
                                Print Order
                              </DropdownMenuItem>
                              {doc.status !== 'completed' && doc.status !== 'cancelled' && !doc.invoice_id && (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={async () => {
                                    const inv = await convertOrderToInvoice(doc as POSOrder);
                                    if (inv) {
                                      await loadData();
                                      notify({ variant: 'success', title: 'Invoice created', subtitle: `POS → Orders — ${inv.invoice_number}` });
                                    } else {
                                      notify({ variant: 'error', title: 'Could not create invoice', subtitle: 'POS → Orders' });
                                    }
                                  }}
                                >
                                  <PosActionsFa icon={POS_MENU_FA.generateInvoice} />
                                  Generate Invoice
                                </DropdownMenuItem>
                              )}
                              {(() => {
                                const o = doc as POSOrder;
                                if (posOrderCheckoutBlocked(o, invoices, refunds)) return null;
                                const invRow = o.invoice_id ? invoices.find((i) => i.id === o.invoice_id) : undefined;
                                const can =
                                  !o.invoice_id ||
                                  (invRow &&
                                    invoiceIsOpenBalance(invRow) &&
                                    !invoiceExcludedFromCheckoutDocumentSearch(invRow, refunds));
                                if (!can) return null;
                                return (
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={async () => {
                                      await goCheckoutFromList({ sourceType: 'order', sourceDocId: o.id });
                                    }}
                                  >
                                    <PosActionsFa icon={POS_MENU_FA.checkout} />
                                    Checkout
                                  </DropdownMenuItem>
                                );
                              })()}
                            </>
                          )}
                          {docType === 'invoice' && (
                            <>
                              {!invoiceIsFullyPaid(doc as POSInvoice) &&
                                normalizeInvoiceStatus((doc as POSInvoice).status) !== INVOICE_STATUS_REFUNDED &&
                                !invoiceListShowsPartiallyRefunded(doc as POSInvoice, refunds) && (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => {
                                    setInvoiceEditorReturnPage(orderInvReturn);
                                    setEditDoc(doc);
                                    setPrefillData(null);
                                    setActivePage('pos-create-invoice');
                                  }}
                                >
                                  <PosActionsFa icon={POS_MENU_FA.review} />
                                  Review
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="gap-2" onClick={() => setViewInvoicePopup(doc as POSInvoice)}>
                                <PosActionsFa icon={POS_MENU_FA.view} />
                                View Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => printDocument({ type: 'invoice', docNumber: doc.invoice_number, date: doc.created_at, customerName: doc.customer_name, customerEmail: doc.customer_email, customerPhone: doc.customer_phone, items: doc.items || [], subtotal: doc.subtotal || 0, taxRate: doc.tax_rate, taxAmount: doc.tax_amount, discountAmount: doc.discount_amount, total: doc.total || 0, notes: doc.notes, status: doc.status, amountPaid: doc.amount_paid, paymentMethod: doc.payment_method })}
                              >
                                <PosActionsFa icon={POS_MENU_FA.print} />
                                Print Invoice
                              </DropdownMenuItem>
                              {invoiceIsOpenBalance(doc as POSInvoice) &&
                                !invoiceExcludedFromCheckoutDocumentSearch(doc as POSInvoice, refunds) && (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={async () => {
                                    await goCheckoutFromList({ sourceType: 'invoice', sourceDocId: (doc as POSInvoice).id });
                                  }}
                                >
                                  <PosActionsFa icon={POS_MENU_FA.checkout} />
                                  Checkout
                                </DropdownMenuItem>
                              )}
                              {invoiceCanProcessRefund(doc as POSInvoice) && (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => {
                                    const inv = doc as POSInvoice;
                                    setRefundInvoice(inv);
                                    setRefundReceiptId(latestReceiptIdForInvoice(receipts, inv.id) ?? null);
                                    setRefundReceiptLinkedInvoices(null);
                                    setRefundLinesByInvoiceId(null);
                                    setRefundSourceReceiptNumber(null);
                                    setRefundItems(invoiceLineItemsRemainingForRefund(inv, refunds));
                                    setRefundType('cash');
                                    setRefundReason('');
                                    resetRefundRealCustomerForm();
                                  }}
                                >
                                  <PosActionsFa icon={POS_MENU_FA.refund} />
                                  Refund
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          {docType === 'receipt' && (
                            <>
                              <DropdownMenuItem className="gap-2" onClick={() => setViewReceiptPopup(doc as POSReceipt)}>
                                <PosActionsFa icon={POS_MENU_FA.viewReceipt} />
                                View Receipt
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => printDocument({ type: 'receipt', docNumber: doc.receipt_number, date: doc.created_at, customerName: doc.customer_name, items: doc.items || [], subtotal: doc.total || 0, total: doc.total || 0, amountPaid: doc.amount_paid, paymentMethod: doc.payment_method, notes: doc.notes, status: doc.status })}
                              >
                                <PosActionsFa icon={POS_MENU_FA.print} />
                                Print POS Receipt
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => printDocument({ type: 'receipt', docNumber: doc.receipt_number, date: doc.created_at, customerName: doc.customer_name, items: doc.items || [], subtotal: doc.total || 0, total: doc.total || 0, amountPaid: doc.amount_paid, paymentMethod: doc.payment_method, notes: doc.notes, status: doc.status })}
                              >
                                <PosActionsFa icon={POS_MENU_FA.print} />
                                Print Receipt
                              </DropdownMenuItem>
                              {(() => {
                                const rec = doc as POSReceipt;
                                const linked = invoicesAssociatedWithReceipt(rec, invoices);
                                if (!linked.some((inv) => invoiceCanProcessRefund(inv))) return null;
                                const firstRefundable =
                                  linked.find((inv) => invoiceCanProcessRefund(inv)) ?? linked[0];
                                return (
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={() => {
                                      setRefundInvoice(firstRefundable);
                                      setRefundReceiptId(rec.id);
                                      setRefundReceiptLinkedInvoices(linked);
                                      setRefundLinesByInvoiceId(
                                        Object.fromEntries(
                                          linked.map((inv) => [
                                            String(inv.id),
                                            invoiceLineItemsRemainingForRefund(inv, refunds),
                                          ])
                                        )
                                      );
                                      setRefundSourceReceiptNumber(
                                        String((rec as POSReceipt).receipt_number || '').trim() || null
                                      );
                                      setRefundItems(
                                        invoiceLineItemsRemainingForRefund(firstRefundable, refunds)
                                      );
                                      setRefundType('cash');
                                      setRefundReason('');
                                      resetRefundRealCustomerForm();
                                    }}
                                  >
                                    <PosActionsFa icon={POS_MENU_FA.refund} />
                                    Refund
                                  </DropdownMenuItem>
                                );
                              })()}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                </div>
              </div>
            ))}
            {filteredDocs.length === 0 && (
              <div className="flex h-32 w-full items-center justify-center border-b border-b-gray-100 bg-white px-4 text-center text-sm text-gray-400">
                  {embed
                    ? `No ${label.toLowerCase()} for this customer`
                    : q
                      ? `No matching ${label.toLowerCase()} found`
                      : `No ${label.toLowerCase()} found`}
              </div>
            )}
      </PosResizableTableFrame>
      </div>
    );
  };

  // ─── Quote Requests ───
  const renderQuoteRequests = (embed?: { rows: POSQuoteRequest[]; quoteEditorListReturnPage: PageKey }) => {
    const qrReturn = embed?.quoteEditorListReturnPage ?? 'pos-quote-requests';
    const baseList = embed?.rows ?? quoteRequests;
    const filteredQrRows = baseList.filter((qr) => {
      if (embed) return true;
      const s = quoteRequestsSearch.trim().toLowerCase();
      if (!s) return true;
      const linked = findQuoteForWebsiteRequest(qr, quotes);
      const customerText = `${qr.name || ''} ${qr.email || ''} ${qr.phone || ''}`.toLowerCase();
      const productText = `${qr.product || ''} ${qr.category || ''}`.toLowerCase();
      const quoteNum = `${linked?.quote_number || qr.quote_number || ''}`.toLowerCase();
      return customerText.includes(s) || productText.includes(s) || quoteNum.includes(s);
    });
    return (
    <div className={POS_PAGE_SHELL}>
      {!embed && (
      <div className="flex items-center gap-2 mb-6">
        <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
          <PosListPageTitleFa kind="quote-requests" />
          Website Quote Requests
        </h2>
      </div>
      )}
      {!embed && (
      <div className={POS_SEARCH_CARD}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0 sm:max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={quoteRequestsSearch}
            onChange={(e) => setQuoteRequestsSearch(e.target.value)}
            className={POS_QUICK_SEARCH_INPUT}
            placeholder="Search quote requests by customer, product, or quote #"
          />
        </div>
        {quoteRequestsSearch.trim() ? (
          <button
            type="button"
            onClick={() => setQuoteRequestsSearch('')}
            className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      </div>
      )}
      <Dialog open={viewQuotePopup != null} onOpenChange={(open) => { if (!open) setViewQuotePopup(null); }}>
        <DialogContent
          hideClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
        >
          {viewQuotePopup && (
            <>
              <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                <div className="min-w-0 flex-1 space-y-1 pr-2">
                  <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">
                    Quote {viewQuotePopup.quote_number}
                  </DialogTitle>
                  <p className="text-xs text-gray-600">
                    {fmtDatePOS(viewQuotePopup.created_at)}
                    {viewQuotePopup.status ? ` · ${viewQuotePopup.status}` : ''}
                  </p>
                </div>
                <DialogClose
                  type="button"
                  className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </DialogClose>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                <iframe
                  title={`Quote ${viewQuotePopup.quote_number}`}
                  className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm"
                  srcDoc={viewQuotePopupHtml}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={viewOrderPopup != null} onOpenChange={(open) => { if (!open) setViewOrderPopup(null); }}>
        <DialogContent
          hideClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
        >
          {viewOrderPopup && (
            <>
              <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                <div className="min-w-0 flex-1 space-y-1 pr-2">
                  <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Order {viewOrderPopup.order_number}</DialogTitle>
                  <p className="text-xs text-gray-600">{fmtDatePOS(viewOrderPopup.created_at)}{viewOrderPopup.status ? ` · ${viewOrderPopup.status}` : ''}</p>
                </div>
                <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                <iframe title={`Order ${viewOrderPopup.order_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewOrderPopupHtml} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={viewInvoicePopup != null} onOpenChange={(open) => { if (!open) setViewInvoicePopup(null); }}>
        <DialogContent
          hideClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
        >
          {viewInvoicePopup && (
            <>
              <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                <div className="min-w-0 flex-1 space-y-1 pr-2">
                  <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Invoice {viewInvoicePopup.invoice_number}</DialogTitle>
                  <p className="text-xs text-gray-600">{fmtDatePOS(viewInvoicePopup.created_at)}{viewInvoicePopup.status ? ` · ${viewInvoicePopup.status}` : ''}</p>
                </div>
                <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                <iframe title={`Invoice ${viewInvoicePopup.invoice_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewInvoicePopupHtml} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={viewReceiptPopup != null} onOpenChange={(open) => { if (!open) setViewReceiptPopup(null); }}>
        <DialogContent
          hideClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
        >
          {viewReceiptPopup && (
            <>
              <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                <div className="min-w-0 flex-1 space-y-1 pr-2">
                  <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Receipt {viewReceiptPopup.receipt_number}</DialogTitle>
                  <p className="text-xs text-gray-600">{fmtDatePOS(viewReceiptPopup.created_at)}{viewReceiptPopup.status ? ` · ${viewReceiptPopup.status}` : ''}</p>
                </div>
                <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                <iframe title={`Receipt ${viewReceiptPopup.receipt_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewReceiptPopupHtml} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/*
        Resizable columns: same structure as Checkout → Items table (react-resizable-panels + CSS grid rows).
      */}
      <PosResizableTableFrame
        table={quoteRequestsTable}
        baseMinWidthRem={POS_QUOTE_REQUESTS_BASE_MIN_WIDTH_REM}
        edgeAriaLabel="Widen or narrow the table from the right edge"
        edgeTitle="Drag right to widen the table; drag left to narrow"
        header={
          <>
            <PanelGroup
              ref={quoteRequestsTable.panelGroupRef}
              direction="horizontal"
              className="w-full items-stretch min-h-0"
              onLayout={quoteRequestsTable.onPanelLayout}
              autoSaveId="pos-quote-requests-panels-v3"
            >
                <Panel
                  defaultSize={POS_DEFAULT_COL_PCT_QUOTE_REQUESTS[0]}
                  minSize={POS_QUOTE_REQUESTS_PANEL_MIN[0]}
                  id="pos-qr-col-customer"
                  className="min-w-0 flex items-center"
                >
                  <div
                    className={cn(
                      'relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-sm:whitespace-normal sm:whitespace-nowrap',
                      'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]',
                    )}
                  >
                    Customer
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_DEFAULT_COL_PCT_QUOTE_REQUESTS[1]}
                  minSize={POS_QUOTE_REQUESTS_PANEL_MIN[1]}
                  id="pos-qr-col-product"
                  className="min-w-0 flex items-center"
                >
                  <div
                    className={cn(
                      'relative w-full px-3 py-2.5 pr-2 text-xs font-medium text-gray-600 max-sm:whitespace-normal sm:whitespace-nowrap',
                      'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]',
                    )}
                  >
                    Product
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_DEFAULT_COL_PCT_QUOTE_REQUESTS[2]}
                  minSize={POS_QUOTE_REQUESTS_PANEL_MIN[2]}
                  id="pos-qr-col-date"
                  className="min-w-0 flex items-center"
                >
                  <div
                    className={cn(
                      'relative w-full px-3 py-2.5 pl-2 text-xs font-medium text-gray-600 whitespace-nowrap',
                      'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]',
                    )}
                  >
                    Date
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_DEFAULT_COL_PCT_QUOTE_REQUESTS[3]}
                  minSize={POS_QUOTE_REQUESTS_PANEL_MIN[3]}
                  id="pos-qr-col-status"
                  className="min-w-0 flex items-center justify-center"
                >
                  <div
                    className={cn(
                      'relative w-full px-3 py-2.5 text-center text-xs font-medium text-gray-600 max-sm:px-1',
                      'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]',
                    )}
                  >
                    Status
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_DEFAULT_COL_PCT_QUOTE_REQUESTS[4]}
                  minSize={POS_QUOTE_REQUESTS_PANEL_MIN[4]}
                  id="pos-qr-col-email"
                  className="min-w-0 flex items-center"
                >
                  <div
                    className={cn(
                      'relative w-full px-3 py-2.5 text-left text-xs font-medium text-gray-600 max-sm:break-words max-sm:leading-snug sm:whitespace-nowrap',
                      'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]',
                    )}
                  >
                    Email Sent
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group"
                  title="Resize columns"
                >
                  <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
                </PanelResizeHandle>
                <Panel
                  defaultSize={POS_DEFAULT_COL_PCT_QUOTE_REQUESTS[5]}
                  minSize={POS_QUOTE_REQUESTS_PANEL_MIN[5]}
                  id="pos-qr-col-actions"
                  className="min-w-0 flex items-center justify-center self-stretch"
                >
                  <span className="sr-only">Row actions</span>
                  <div className="relative w-full px-2 py-2.5" aria-hidden />
                </Panel>
            </PanelGroup>
            <div
              className="pointer-events-none absolute right-3 top-1/2 z-[5] h-3/4 w-px -translate-y-1/2 bg-gray-200"
              aria-hidden
            />
          </>
        }
      >
            {filteredQrRows.map((qr) => (
              <div
                key={qr.id}
                className="grid items-center gap-x-0 border-b border-gray-100 bg-white text-[13px] transition-colors duration-150 hover:bg-gray-50/70"
                style={{ gridTemplateColumns: quoteRequestsTable.gridTemplateColumns }}
              >
                <div className="min-w-0 px-3 py-2.5 pl-4 max-sm:break-words max-sm:overflow-hidden">
                  <p className="font-semibold text-[#1a2332] break-words [overflow-wrap:anywhere] leading-snug">
                    {qr.name}
                  </p>
                  <p className="text-xs text-gray-400 break-words [overflow-wrap:anywhere] mt-0.5">
                    {qr.email} {qr.phone && `| ${qr.phone}`}
                  </p>
                  {qr.company && (
                    <p className="text-xs text-gray-400 break-words [overflow-wrap:anywhere] mt-0.5">{qr.company}</p>
                  )}
                </div>
                <div className="min-w-0 px-3 py-2.5 pr-2 max-sm:break-words max-sm:overflow-hidden">
                  <p className="text-inherit text-gray-800 break-words [overflow-wrap:anywhere] leading-snug">
                    {stripQuoteRequestProductQtyDisplay(qr.product || '')}
                  </p>
                  <p className="text-xs text-gray-400 break-words [overflow-wrap:anywhere] mt-0.5">{qr.category}</p>
                  {qr.quantity && <p className="text-xs text-gray-400">Qty: {qr.quantity}</p>}
                </div>
                <div className="min-w-0 whitespace-nowrap px-3 py-2.5 pl-2 text-gray-500">
                  {fmtDatePOS(qr.created_at) || '—'}
                </div>
                <div className="min-w-0 px-3 py-2.5 text-center max-sm:overflow-hidden max-sm:px-1">
                  <div className="flex justify-center max-sm:min-w-0 max-sm:px-0.5">
                    <div className="flex min-w-0 max-w-full items-center justify-center">
                      <QuoteRequestQuotedStatusCell qr={qr} quoteList={quotes} onOpenQuote={goToQuoteSearch} />
                    </div>
                  </div>
                </div>
                <div className="min-w-0 px-3 py-2.5 text-left text-gray-700 max-sm:break-words max-sm:leading-snug max-sm:overflow-hidden max-sm:whitespace-normal sm:whitespace-nowrap">
                  {(() => {
                    const linked = findQuoteForWebsiteRequest(qr, quotes);
                    const rawAt =
                      (qr.email_sent_at != null && String(qr.email_sent_at).trim() !== ''
                        ? String(qr.email_sent_at)
                        : '') ||
                      (linked?.email_sent_at != null && String(linked.email_sent_at).trim() !== ''
                        ? String(linked.email_sent_at)
                        : '') ||
                      (linked?.id ? quoteEmailSentAtByQuoteId.get(linked.id) : undefined);
                    if (!rawAt) return <span className="text-gray-400">—</span>;
                    const formatted = fmtDatePOS(rawAt);
                    return formatted ? <span>{formatted}</span> : <span className="text-gray-400">—</span>;
                  })()}
                </div>
                <div className="flex min-h-0 min-w-0 items-center justify-center self-stretch overflow-hidden px-2 py-2.5">
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex max-w-full shrink-0 items-center gap-0.5 whitespace-nowrap rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"
                      >
                        Actions
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-[10rem]">
                      {(() => {
                        const linkedQr = findQuoteForWebsiteRequest(qr, quotes);
                        const inv = linkedQr
                          ? resolveInvoiceForQuoteOrOrder(linkedQr, 'quote', invoices)
                          : undefined;
                        const paidOff = inv && invoiceIsFullyPaid(inv);
                        const isNewQr = (qr.status || '').toLowerCase() === 'new';
                        if (paidOff && !isNewQr) return null;
                        return (
                          <DropdownMenuItem className="gap-2" onClick={() => openWebsiteRequestInQuoteEditor(qr, qrReturn)}>
                            <PosActionsFa icon={POS_MENU_FA.createOrGenerateQuote} />
                            {isNewQr ? 'Create Quote' : 'Review'}
                          </DropdownMenuItem>
                        );
                      })()}
                      {!findQuoteForWebsiteRequest(qr, quotes) && qr.status !== 'new' ? (
                        <DropdownMenuItem className="gap-2" onClick={() => openWebsiteRequestInQuoteEditor(qr, qrReturn)}>
                          <PosActionsFa icon={POS_MENU_FA.createOrGenerateQuote} />
                          Generate Quote
                        </DropdownMenuItem>
                      ) : null}
                      {findQuoteForWebsiteRequest(qr, quotes) ? (
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => {
                            const qdoc = findQuoteForWebsiteRequest(qr, quotes);
                            if (qdoc) setViewQuotePopup(qdoc);
                          }}
                        >
                          <PosActionsFa icon={POS_MENU_FA.view} />
                          View Quote
                        </DropdownMenuItem>
                      ) : null}
                      {(() => {
                        const linked = findQuoteForWebsiteRequest(qr, quotes);
                        const reviewed = qr.status !== 'new';
                        const showCreateOrder = reviewed && !linked?.order_id && !linked?.invoice_id;
                        const showCreateInvoice = reviewed && !linked?.invoice_id;
                        const linkedInv = linked?.invoice_id
                          ? invoices.find((i) => i.id === linked.invoice_id)
                          : undefined;
                        const showCheckout =
                          linked &&
                          (!linked.invoice_id ||
                            (linkedInv &&
                              invoiceIsOpenBalance(linkedInv) &&
                              !invoiceExcludedFromCheckoutDocumentSearch(linkedInv, refunds)));
                        return (
                          <>
                            {showCreateOrder ? (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={async () => {
                                  const o = await createOrderFromWebsiteQuoteRequest(qr, linked);
                                  if (o) {
                                    await loadData();
                                    notify({
                                      variant: 'success',
                                      title: 'Order created',
                                      subtitle: `POS → Quote Requests — ${o.order_number}`,
                                    });
                                  } else {
                                    notify({
                                      variant: 'error',
                                      title: 'Could not create order',
                                      subtitle: 'POS → Quote Requests',
                                    });
                                  }
                                }}
                              >
                                <PosActionsFa icon={POS_MENU_FA.generateOrder} />
                                Generate Order
                              </DropdownMenuItem>
                            ) : null}
                            {showCreateInvoice ? (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={async () => {
                                  const inv = await createInvoiceFromWebsiteQuoteRequest(qr, linked);
                                  if (inv) {
                                    await loadData();
                                    notify({
                                      variant: 'success',
                                      title: 'Invoice created',
                                      subtitle: `POS → Quote Requests — ${inv.invoice_number}`,
                                    });
                                  } else {
                                    notify({
                                      variant: 'error',
                                      title: 'Could not create invoice',
                                      subtitle: 'POS → Quote Requests',
                                    });
                                  }
                                }}
                              >
                                <PosActionsFa icon={POS_MENU_FA.generateInvoice} />
                                Generate Invoice
                              </DropdownMenuItem>
                            ) : null}
                            {showCheckout ? (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={async () => {
                                  const l = findQuoteForWebsiteRequest(qr, quotes);
                                  if (!l) return;
                                  await goCheckoutFromList({ sourceType: 'quote', sourceDocId: l.id });
                                }}
                              >
                                <PosActionsFa icon={POS_MENU_FA.checkout} />
                                Checkout
                              </DropdownMenuItem>
                            ) : null}
                          </>
                        );
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            {filteredQrRows.length === 0 && (
              <div className="flex h-32 items-center justify-center border-b border-b-gray-100 bg-white px-4 text-center text-sm text-gray-400">
                {embed
                  ? 'No quote requests for this customer'
                  : quoteRequestsSearch.trim()
                    ? 'No matching quote requests found'
                    : 'No quote requests from the website yet'}
              </div>
            )}
      </PosResizableTableFrame>
    </div>
  );
  };

  // ─── Customer history (full page from Customers → View History) ───
  const renderCustomerHistoryPage = () => {
    if (!selectedCustomer || !customerHistory) {
      return (
        <div className={POS_PAGE_SHELL}>
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={() => {
                setCustomerHistory(null);
                navTo('pos-customers');
              }}
              className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
              <PosListPageTitleFa kind="customer-history" />
              Customer history
            </h2>
          </div>
          <p className="text-sm text-gray-500">Open a customer from Customers and choose View History.</p>
        </div>
      );
    }
    const c = selectedCustomer;
    const h = customerHistory;
    const embedReturn: PageKey = 'pos-customer-history';
    const qrRows = (h.quote_requests as POSQuoteRequest[]) ?? [];
    const quoteRows = (h.quotes as POSQuote[]) ?? [];
    const orderRows = (h.orders as POSOrder[]) ?? [];
    const invoiceRows = (h.invoices as POSInvoice[]) ?? [];
    const receiptRows = (h.receipts as POSReceipt[]) ?? [];
    const refundRows = (h.refunds as POSRefund[]) ?? [];
    const sentEmailRows = filterSentEmailsForCustomer(sentEmails, c, {
      quotes: quoteRows,
      orders: orderRows,
      invoices: invoiceRows,
      receipts: receiptRows,
      refunds: refundRows,
    });

    return (
      <div className={POS_PAGE_SHELL}>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setCustomerHistory(null);
              goBackPage();
            }}
            className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
            <PosListPageTitleFa kind="customer-history" />
            Customer history
          </h2>
        </div>

        <div className={`${POS_SURFACE_RAISED} p-5 mb-6`}>
          <h3 className="text-lg font-bold text-[#1a2332] mb-3">{c.name}</h3>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <p className="text-gray-600">
              <span className="font-semibold text-gray-800">Contact:</span>{' '}
              {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
            </p>
            {c.company ? (
              <p className="text-gray-600">
                <span className="font-semibold text-gray-800">Company:</span> {c.company}
              </p>
            ) : null}
            {c.address ? (
              <p className="text-gray-600 sm:col-span-2">
                <span className="font-semibold text-gray-800">Address:</span> {c.address}
              </p>
            ) : null}
            {c.notes ? (
              <p className="text-gray-600 sm:col-span-2">
                <span className="font-semibold text-gray-800">Notes:</span> {c.notes}
              </p>
            ) : null}
            <p className="text-gray-600">
              <span className="font-semibold text-gray-800">Store credit:</span>{' '}
              <span className="tabular-nums text-green-800 font-semibold">{fmtMoney(c.store_credit || 0)}</span>
            </p>
            <p className="text-gray-600">
              <span className="font-semibold text-gray-800">Balance due:</span>{' '}
              {(c.account_balance ?? 0) > 0 ? (
                <span className="tabular-nums text-amber-800 font-semibold">{fmtMoney(c.account_balance ?? 0)}</span>
              ) : (
                '—'
              )}
            </p>
          </div>
        </div>

        <Tabs defaultValue="quote-requests" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 justify-start rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
            <TabsTrigger value="quote-requests" className="text-xs sm:text-sm">
              Quote Requests
            </TabsTrigger>
            <TabsTrigger value="quotes" className="text-xs sm:text-sm">
              Quotes
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-xs sm:text-sm">
              Orders
            </TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs sm:text-sm">
              Invoices
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs sm:text-sm">
              Receipts
            </TabsTrigger>
            <TabsTrigger value="refunds" className="text-xs sm:text-sm">
              Refunds
            </TabsTrigger>
            <TabsTrigger value="sent-emails" className="text-xs sm:text-sm">
              Sent Emails
            </TabsTrigger>
          </TabsList>
          <TabsContent value="quote-requests" className="mt-4">
            {renderQuoteRequests({ rows: qrRows, quoteEditorListReturnPage: embedReturn })}
          </TabsContent>
          <TabsContent value="quotes" className="mt-4">
            {renderDocList('quote', { scopedRows: quoteRows, editorReturnPage: embedReturn })}
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            {renderDocList('order', { scopedRows: orderRows, editorReturnPage: embedReturn })}
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            {renderDocList('invoice', { scopedRows: invoiceRows, editorReturnPage: embedReturn })}
          </TabsContent>
          <TabsContent value="receipts" className="mt-4">
            {renderDocList('receipt', { scopedRows: receiptRows, editorReturnPage: embedReturn })}
          </TabsContent>
          <TabsContent value="refunds" className="mt-4">
            {renderRefunds({ rows: refundRows })}
          </TabsContent>
          <TabsContent value="sent-emails" className="mt-4">
            {renderSentEmails({ rows: sentEmailRows })}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  // ─── Customers ───
  const [custForm, setCustForm] = useState({ name: '', email: '', phone: '', company: '', address: '', notes: '' });
  const [showCustForm, setShowCustForm] = useState(false);

  const renderCustomers = () => (
    <div className={POS_PAGE_SHELL}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
            <PosListPageTitleFa kind="customers" />
            Customers
          </h2>
        </div>
        <button onClick={() => { setCustForm({ name: '', email: '', phone: '', company: '', address: '', notes: '' }); setShowCustForm(true); setSelectedCustomer(null); setCustomerHistory(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#e31e24] text-white rounded-lg text-sm font-semibold hover:bg-[#c91a1f]"><Plus className="w-4 h-4" /> New Customer</button>
      </div>

      {showCustForm && (
        <div className={`${POS_SURFACE_RAISED} p-5 mb-6`}>
          <h3 className="flex items-center gap-2.5 font-bold text-[#1a2332] mb-4">
            <PosCustomerFormTitleFa edit={!!selectedCustomer} />
            {selectedCustomer ? 'Edit' : 'New'} Customer
          </h3>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <input value={custForm.name} onChange={e => setCustForm({ ...custForm, name: e.target.value })} className="px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder="Name *" />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={14}
              value={custForm.phone}
              onChange={(e) =>
                setCustForm({
                  ...custForm,
                  phone: formatPhoneUsMask(digitsFromPhoneInput(e.target.value)),
                })
              }
              className="px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors font-mono tracking-tight"
              placeholder="(876) 123-4567"
            />
            <input value={custForm.email} onChange={e => setCustForm({ ...custForm, email: e.target.value })} className="px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder="Email" />
            <input value={custForm.company} onChange={e => setCustForm({ ...custForm, company: e.target.value })} className="px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder="Company" />
            <input value={custForm.address} onChange={e => setCustForm({ ...custForm, address: e.target.value })} className="px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors col-span-2" placeholder="Address" />
          </div>
          <div className="flex gap-2">
            <button onClick={async () => {
              if (!custForm.name.trim()) {
                notify({ variant: 'error', title: 'Customer not saved', subtitle: 'POS → Customers — Name is required' });
                return;
              }
              if (isPlaceholderWalkInCustomerName(custForm.name)) {
                notify({
                  variant: 'error',
                  title: 'Customer not saved',
                  subtitle: 'POS → Customers — "Visitor" and "Guest" are placeholder customers and should not be created here',
                });
                return;
              }
              const savedCust = await saveCustomer({ id: selectedCustomer?.id, ...custForm, store_credit: selectedCustomer?.store_credit || 0 });
              if (savedCust) {
                await loadData();
                setShowCustForm(false);
                notify({ variant: 'success', title: 'Changes saved', subtitle: 'POS → Customers' });
              } else {
                notify({ variant: 'error', title: 'Changes not saved', subtitle: 'POS → Customers' });
              }
            }} className="px-4 py-2 bg-[#1a2332] text-white rounded-lg text-sm font-semibold">Save</button>
            <button onClick={() => setShowCustForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <PosResizableTableFrame
        table={customersTable}
        baseMinWidthRem={POS_CUSTOMERS_BASE_MIN_WIDTH_REM}
        edgeAriaLabel="Widen or narrow the table from the right edge"
        edgeTitle="Drag right to widen the table; drag left to narrow"
        header={
          <>
            <CustomersPanelHeader table={customersTable} autoSaveId="pos-customers-panels-v1" />
            <div
              className="pointer-events-none absolute right-3 top-1/2 z-[5] h-3/4 w-px -translate-y-1/2 bg-gray-200"
              aria-hidden
            />
          </>
        }
      >
          {displayCustomers.map((c) => (
            <div
              key={c.id}
              className="grid items-center gap-x-0 border-b border-gray-100 bg-white text-[13px] transition-colors duration-150 hover:bg-gray-50/70"
              style={{ gridTemplateColumns: customersTable.gridTemplateColumns }}
            >
              <div className="min-w-0 overflow-hidden px-3 py-2.5 pl-4 text-left">
                <span className="block truncate font-semibold text-[#1a2332]">{c.name}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-500">
                <span className="block truncate">
                  {c.phone}
                  {c.email && ` | ${c.email}`}
                </span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-500">
                <span className="block truncate">{c.company || '-'}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-right font-semibold tabular-nums text-green-800">
                <span className="block truncate">{fmtMoney(c.store_credit || 0)}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 pr-10 text-right font-semibold tabular-nums text-amber-800">
                <span className="block truncate">{(c.account_balance ?? 0) > 0 ? fmtMoney(c.account_balance ?? 0) : '—'}</span>
              </div>
              <div className="flex min-h-0 min-w-0 items-center justify-center self-stretch overflow-hidden px-2 py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-0.5 px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                      >
                        Actions
                        <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[11rem]">
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => {
                          setCustForm({
                            name: c.name,
                            email: c.email,
                            phone: formatPhoneUsMask(digitsFromPhoneInput(c.phone)),
                            company: c.company,
                            address: c.address,
                            notes: c.notes,
                          });
                          setSelectedCustomer(c);
                          setShowCustForm(true);
                          setCustomerHistory(null);
                        }}
                      >
                        <PosActionsFa icon={POS_MENU_FA.editCustomer} />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={async () => {
                          setSelectedCustomer(c);
                          const ids = mergedPlaceholderIdsByCanonicalId.get(c.id) ?? [c.id];
                          const h =
                            ids.length > 1
                              ? await fetchMergedCustomerHistory(ids)
                              : await fetchCustomerHistory(c.id);
                          setCustomerHistory(h);
                          setShowCustForm(false);
                          navTo('pos-customer-history');
                        }}
                      >
                        <PosActionsFa icon={POS_MENU_FA.viewHistory} />
                        View History
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                        onClick={() => setCustomerPendingDelete(c)}
                      >
                        <PosActionsFa icon={POS_MENU_FA.deleteCustomer} className="!text-red-600" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
              </div>
            </div>
          ))}
          {displayCustomers.length === 0 && (
            <div className="flex h-32 w-full items-center justify-center border-b border-b-gray-100 bg-white px-4 text-center text-sm text-gray-400">
              No customers yet
            </div>
          )}
      </PosResizableTableFrame>

      <Dialog open={customerPendingDelete != null} onOpenChange={(open) => { if (!open) setCustomerPendingDelete(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete customer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Permanently remove{' '}
            <span className="font-semibold text-[#1a2332]">{customerPendingDelete?.name}</span>
            {customerPendingDelete &&
            (mergedPlaceholderIdsByCanonicalId.get(customerPendingDelete.id)?.length ?? 0) > 1 ? (
              <>
                {' '}
                <span className="font-semibold">
                  ({mergedPlaceholderIdsByCanonicalId.get(customerPendingDelete.id)!.length} linked duplicate records)
                </span>
              </>
            ) : (
              <> ({customerPendingDelete?.id})</>
            )}
            ? This cannot be undone. If they are linked to quotes, orders, or invoices, the delete may fail.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setCustomerPendingDelete(null)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!customerPendingDelete) return;
                const ids =
                  mergedPlaceholderIdsByCanonicalId.get(customerPendingDelete.id) ?? [customerPendingDelete.id];
                let deleted = 0;
                let failed = 0;
                for (const id of ids) {
                  const ok = await deleteCustomer(id);
                  if (ok) deleted += 1;
                  else failed += 1;
                }
                if (deleted > 0) {
                  setCustomerPendingDelete(null);
                  if (selectedCustomer && ids.includes(selectedCustomer.id)) {
                    setSelectedCustomer(null);
                    setCustomerHistory(null);
                    setShowCustForm(false);
                  }
                  await loadData();
                  notify({
                    variant: failed > 0 ? 'error' : 'success',
                    title: failed > 0 ? 'Some deletes failed' : ids.length > 1 ? 'Duplicate records deleted' : 'Customer deleted',
                    subtitle:
                      failed > 0
                        ? `${deleted} removed, ${failed} failed — they may still be linked to documents.`
                        : 'POS → Customers',
                  });
                } else {
                  notify({
                    variant: 'error',
                    title: 'Could not delete customer',
                    subtitle: 'They may be linked to existing documents. Remove links or use the database.',
                  });
                }
              }}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ─── Refunds ───
  const renderRefunds = (embed?: { rows: POSRefund[] }) => {
    const rows = embed?.rows ?? refunds;
    const q = embed ? '' : refundsSearch.trim().toLowerCase();
    const filtered =
      !q || embed
        ? rows
        : rows.filter((r) => {
            const num = String(r.refund_number || '').toLowerCase();
            const disp = displayRefundDocNumber(r.refund_number).toLowerCase();
            const cust = String(r.customer_name || '').toLowerCase();
            const st = String(r.status || '').toLowerCase();
            const typ = String(r.refund_type || '').toLowerCase();
            const matchesReceipt =
              receipts.some((rec) => {
                const rn = (rec.receipt_number || '').toLowerCase();
                if (!rn.includes(q)) return false;
                return refundTouchesReceiptRow(r, rec);
              });
            return (
              num.includes(q) ||
              disp.includes(q) ||
              cust.includes(q) ||
              st.includes(q) ||
              typ.includes(q) ||
              matchesReceipt
            );
          });
    return (
    <div className={POS_PAGE_SHELL}>
      {!embed && (
      <>
      <div className="flex items-center gap-2 mb-6">
        <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
          <PosListPageTitleFa kind="refunds" />
          Refunds
        </h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        To record a refund, open a paid invoice from Invoices and choose Refund, or open the matching receipt from Receipts and choose Refund. Partial refunds reduce the invoice&apos;s amount paid; you can refund again until the balance is cleared, then the invoice is marked Refunded.
      </p>
      <div className={POS_SEARCH_CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0 sm:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={refundsSearch}
              onChange={(e) => setRefundsSearch(e.target.value)}
              className={POS_QUICK_SEARCH_INPUT}
              placeholder="Search by refund #, receipt #, customer, type, or status"
              aria-label="Search refunds"
            />
          </div>
          {refundsSearch.trim() ? (
            <button
              type="button"
              onClick={() => setRefundsSearch('')}
              className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      </>
      )}
      <PosResizableTableFrame
        table={refundsTable}
        baseMinWidthRem={POS_REFUNDS_BASE_MIN_WIDTH_REM}
        edgeAriaLabel="Widen or narrow the table from the right edge"
        edgeTitle="Drag right to widen the table; drag left to narrow"
        header={
          <>
            <RefundsPanelHeader table={refundsTable} autoSaveId="pos-refunds-panels-v1" />
            <div
              className="pointer-events-none absolute right-3 top-1/2 z-[5] h-3/4 w-px -translate-y-1/2 bg-gray-200"
              aria-hidden
            />
          </>
        }
      >
          {filtered.map(r => (
            <div
              key={r.id}
              className="grid items-center gap-x-0 border-b border-gray-100 bg-white text-[13px] transition-colors duration-150 hover:bg-gray-50/70"
              style={{ gridTemplateColumns: refundsTable.gridTemplateColumns }}
            >
              <div className="min-w-0 overflow-hidden px-3 py-2.5 pl-4 text-left">
                <span className="block truncate font-semibold text-[#1a2332]">{displayRefundDocNumber(r.refund_number)}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-600">
                <span className="block truncate">{r.customer_name || '-'}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left capitalize text-gray-600">
                <span className="block truncate">{r.refund_type.replace('_', ' ')}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-right font-bold tabular-nums text-red-600">
                <span className="block truncate">{fmtMoney(r.total)}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left tabular-nums text-gray-500">
                <span className="block truncate whitespace-nowrap">{fmtDate(r.created_at)}</span>
              </div>
              <div className="flex min-w-0 items-center justify-center overflow-hidden px-3 py-2.5">
                <StatusBadge status={r.status} />
              </div>
              <div className="flex min-h-0 min-w-0 items-center justify-center self-stretch overflow-hidden px-2 py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-0.5 px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                      >
                        Actions
                        <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[11rem]">
                      <DropdownMenuItem className="gap-2" onClick={() => setViewRefundPopup(r)}>
                        <PosActionsFa icon={POS_MENU_FA.view} />
                        View Refund
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => printDocument(buildRefundPrintDocProps(r, invoices))}
                      >
                        <PosActionsFa icon={POS_MENU_FA.print} />
                        Print Refund
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex h-32 w-full items-center justify-center border-b border-b-gray-100 bg-white px-4 text-center text-sm text-gray-400">
                {rows.length === 0
                  ? embed
                    ? 'No refunds for this customer'
                    : 'No refunds yet'
                  : 'No matches — try a different search'}
            </div>
          )}
      </PosResizableTableFrame>
      <Dialog open={viewRefundPopup != null} onOpenChange={(open) => { if (!open) setViewRefundPopup(null); }}>
        <DialogContent
          hideClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
        >
          {viewRefundPopup && (
            <>
              <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                <div className="min-w-0 flex-1 space-y-1 pr-2">
                  <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">
                    Refund {displayRefundDocNumber(viewRefundPopup.refund_number)}
                  </DialogTitle>
                  <p className="text-xs text-gray-600">
                    {fmtDatePOS(viewRefundPopup.created_at)}
                    {viewRefundPopup.status ? ` · ${viewRefundPopup.status}` : ''}
                    {viewRefundPopup.refund_type ? ` · ${viewRefundPopup.refund_type.replace('_', ' ')}` : ''}
                  </p>
                </div>
                <DialogClose
                  type="button"
                  className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </DialogClose>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                <iframe
                  title={`Refund ${displayRefundDocNumber(viewRefundPopup.refund_number)}`}
                  className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm"
                  srcDoc={viewRefundPopupHtml}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
  };

  // ─── Sent Emails ───
  const renderSentEmails = (embed?: { rows: POSSentEmail[] }) => {
    const rows = embed?.rows ?? sentEmails;
    return (
    <div className={POS_PAGE_SHELL}>
      {!embed && (
      <div className="flex items-center gap-2 mb-6">
        <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
          <PosListPageTitleFa kind="sent-emails" />
          Sent Emails
        </h2>
      </div>
      )}
      <Dialog open={sentEmailPreview != null} onOpenChange={(open) => { if (!open) setSentEmailPreview(null); }}>
        <DialogContent
          hideClose
          overlayClassName="bg-black/60 backdrop-blur-[2px]"
          className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
        >
          {sentEmailPreview && (
            <>
              <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                <div className="min-w-0 flex-1 space-y-2 pr-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">As emailed to customer</p>
                  <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">
                    {sentEmailPreview.subject || 'Sent email'}
                  </DialogTitle>
                  <div className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                    <p>
                      <span className="text-gray-500">To:</span>{' '}
                      <span className="font-medium text-[#1a2332]">
                        {sentEmailPreview.recipient_name ? `${sentEmailPreview.recipient_name} ` : ''}
                        &lt;{sentEmailPreview.recipient_email}&gt;
                      </span>
                    </p>
                    <p>
                      <span className="text-gray-500">Sent:</span> {fmtDate(sentEmailPreview.sent_at)}
                    </p>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-500">Status:</span> <StatusBadge status={sentEmailPreview.status} />
                    </p>
                    {sentEmailPreview.document_number && (
                      <p>
                        <span className="text-gray-500">Document:</span>{' '}
                        <span className="font-medium capitalize">
                          {formatSentEmailDocumentDisplay(
                            sentEmailPreview.document_type,
                            sentEmailPreview.document_number
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <DialogClose
                  type="button"
                  className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </DialogClose>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                <iframe
                  title={sentEmailPreview.subject || 'Email preview'}
                  className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm"
                  srcDoc={sentEmailViewHtml}
                />
              </div>
              <DialogFooter className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    const e = sentEmailPreview;
                    const result = await sendEmail({
                      to: e.recipient_email,
                      toName: e.recipient_name,
                      subject: e.subject,
                      htmlBody: resolveSentEmailHtmlBody(e, quotes),
                      documentType: e.document_type,
                      documentId: e.document_id,
                      documentNumber: e.document_number,
                    });
                    if (result.success) {
                      notify({ variant: 'success', title: 'Email sent', subtitle: 'POS → Sent Emails' });
                      await loadData();
                    } else {
                      notify({ variant: 'error', title: 'Email not sent', subtitle: `POS → Sent Emails — ${result.error || 'Error'}` });
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" /> Resend email
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PosResizableTableFrame
        table={sentEmailsTable}
        baseMinWidthRem={POS_SENT_EMAILS_BASE_MIN_WIDTH_REM}
        edgeAriaLabel="Widen or narrow the table from the right edge"
        edgeTitle="Drag right to widen the table; drag left to narrow"
        header={
          <>
            <SentEmailsPanelHeader table={sentEmailsTable} autoSaveId="pos-sent-emails-panels-v1" />
            <div
              className="pointer-events-none absolute right-3 top-1/2 z-[5] h-3/4 w-px -translate-y-1/2 bg-gray-200"
              aria-hidden
            />
          </>
        }
      >
          {rows.map(e => (
            <div
              key={e.id}
              className="grid items-center gap-x-0 border-b border-gray-100 bg-white text-[13px] transition-colors duration-150 hover:bg-gray-50/70"
              style={{ gridTemplateColumns: sentEmailsTable.gridTemplateColumns }}
            >
              <div className="min-w-0 overflow-hidden px-3 py-2.5 pl-4 text-left">
                <p className="truncate font-semibold leading-snug text-[#1a2332]">{e.recipient_name || e.recipient_email}</p>
                <p className="truncate text-xs leading-snug text-gray-400">{e.recipient_email}</p>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-600">
                <span className="block truncate">{e.subject}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left text-gray-500">
                <span className="block truncate">{formatSentEmailDocumentDisplay(e.document_type, e.document_number) || '-'}</span>
              </div>
              <div className="min-w-0 overflow-hidden px-3 py-2.5 text-left tabular-nums text-gray-500">
                <span className="block truncate whitespace-nowrap">{fmtDate(e.sent_at)}</span>
              </div>
              <div className="flex min-w-0 items-center justify-center overflow-hidden px-3 py-2.5">
                <StatusBadge status={e.status} />
              </div>
              <div className="flex min-h-0 min-w-0 items-center justify-center self-stretch overflow-hidden px-2 py-2.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-0.5 px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                    >
                      Actions
                      <ChevronDown className="w-3.5 h-3.5 opacity-80" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[11rem]">
                    <DropdownMenuItem className="gap-2" onClick={() => setSentEmailPreview(e)}>
                      <PosActionsFa icon={POS_MENU_FA.view} />
                      View Email
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={async () => {
                        const result = await sendEmail({
                          to: e.recipient_email,
                          toName: e.recipient_name,
                          subject: e.subject,
                          htmlBody: resolveSentEmailHtmlBody(e, quotes),
                          documentType: e.document_type,
                          documentId: e.document_id,
                          documentNumber: e.document_number,
                        });
                        if (result.success) {
                          notify({ variant: 'success', title: 'Email sent', subtitle: 'POS → Sent Emails' });
                          await loadData();
                        } else {
                          notify({
                            variant: 'error',
                            title: 'Email not sent',
                            subtitle: `POS → Sent Emails — ${result.error || 'Error'}`,
                          });
                        }
                      }}
                    >
                      <Send className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      Resend Email
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="flex h-32 w-full items-center justify-center border-b border-b-gray-100 bg-white px-4 text-center text-sm text-gray-400">
                {embed ? 'No sent emails for this customer' : 'No emails sent yet'}
            </div>
          )}
      </PosResizableTableFrame>
    </div>
  );
  };

  // ─── SMTP Settings ───
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /** String so the field can be cleared while editing (number state forces 0 on empty). */
  const [billingTaxRateInput, setBillingTaxRateInput] = useState('');
  const [billingSaving, setBillingSaving] = useState(false);

  useEffect(() => {
    if (activePage !== 'pos-settings-billing') return;
    let cancelled = false;
    (async () => {
      const v = await fetchConfig('pos_default_tax_rate');
      const n = typeof v === 'number' ? v : Number(v);
      if (cancelled) return;
      if (v == null || v === '' || Number.isNaN(n)) {
        setBillingTaxRateInput('');
      } else if (n >= 0) {
        setBillingTaxRateInput(String(n));
      } else {
        setBillingTaxRateInput('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePage]);

  // Detect provider from host
  const getProviderInfo = (host: string) => {
    const h = (host || '').toLowerCase();
    if (h.includes('amazonaws.com') || h.includes('aws')) return { name: 'AWS SES', supported: true };
    if (h.includes('sendgrid')) return { name: 'SendGrid', supported: true };
    if (h.includes('mailgun')) return { name: 'Mailgun', supported: true };
    if (h.includes('postmark')) return { name: 'Postmark', supported: true };
    if (h.includes('brevo') || h.includes('sendinblue')) return { name: 'Brevo', supported: true };
    if (h.includes('resend')) return { name: 'Resend', supported: true };
    if (h.includes('mailjet')) return { name: 'Mailjet', supported: true };
    if (h.includes('sparkpost')) return { name: 'SparkPost', supported: true };
    if (h.includes('smtp2go')) return { name: 'SMTP2GO', supported: true };
    return null;
  };

  const providerInfo = getProviderInfo(smtpSettings.host);
  const isAwsSes = providerInfo?.name === 'AWS SES';

  const handleSendTestEmail = async () => {
    if (!testEmailAddr.trim()) {
      notify({ variant: 'error', title: 'Test email not sent', subtitle: 'Settings → Email Configuration — Enter a test email address' });
      return;
    }
    if (!smtpSettings.password?.trim()) {
      const saved = await fetchSmtpSettings();
      if (!saved?.password?.trim()) {
        setTestEmailResult({
          type: 'error',
          message: 'Enter your SMTP password/API key in the form before sending a test (then Save, or send test with the password field filled).',
        });
        notify({
          variant: 'error',
          title: 'Test email not sent',
          subtitle: 'Settings → Email Configuration — Enter SMTP password or API key',
        });
        return;
      }
    }
    setTestEmailSending(true);
    setTestEmailResult(null);
    try {
    const result = await sendEmail({
      smtpFromForm: smtpSettings,
      to: testEmailAddr.trim(),
      toName: 'Test Recipient',
      subject: 'Test Email from Voltz POS',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1a2332; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Voltz Industrial Supply</h1>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1a2332; margin-top: 0;">Test Email Successful!</h2>
            <p style="color: #6b7280;">This is a test email from your Voltz POS system. If you're reading this, your email settings are configured correctly.</p>
            <p style="color: #6b7280; font-size: 14px;">Sent at: ${fmtDatePOS(new Date())}</p>

            <div style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
              <p style="color: #166534; margin: 0; font-weight: bold;">Email configuration is working correctly.</p>
            </div>
          </div>
        </div>
      `,
      documentType: 'test',
      documentId: 'test',
      documentNumber: 'TEST',
    });
    if (result.success) {
      setTestEmailResult({ type: 'success', message: `Test email sent successfully to ${testEmailAddr}!` });
      notify({
        variant: 'success',
        title: 'Test email sent',
        subtitle: `Settings → Email Configuration — ${testEmailAddr.trim()}`,
      });
    } else {
      const errMsg = result.error || 'Failed to send test email';
      setTestEmailResult({ type: 'error', message: errMsg });
      notify({ variant: 'error', title: 'Test email not sent', subtitle: `Settings → Email Configuration — ${errMsg}` });
    }
    } finally {
      setTestEmailSending(false);
    }
  };

  const renderEmailSettings = () => (
    <div className={POS_PAGE_SHELL}>
      <div className="flex items-center gap-2 mb-6">
        <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
          <PosListPageTitleFa kind="email-settings" />
          Email Configuration
        </h2>
      </div>

      {/* Important notice about how email sending works */}
      <div className="mb-6 rounded-2xl border border-blue-200/90 bg-blue-50/90 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-100">
            <Mail className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-blue-800">SMTP</h3>
            <p className="text-xs text-blue-700 mt-1">
              Mail goes out from this server over SMTP (typically port <strong>587</strong> or <strong>465</strong>).
              <strong className="ml-1">Send Test</strong> uses the fields below—you can skip Save if the password is filled.
              <span className="block mt-1">
                <strong>AWS SES:</strong> username = access key ID (<code className="text-[10px] bg-blue-100 px-1 rounded">AKIA…</code>); password = SES SMTP password, not the IAM secret key.
              </span>
              <span className="block mt-1 text-blue-800/90">
                <strong>Resend:</strong> verify your domain at resend.com/domains, then use a <strong>From</strong> address @that domain. Until then, tests may only go to your Resend account email. <strong>Timeout?</strong> Set <code className="text-[10px] bg-blue-100 px-1 rounded">RESEND_API_KEY</code> on the Render API (HTTPS, no SMTP).
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Provider detection badge */}
      {providerInfo && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" /> Detected: {providerInfo.name}
          </span>
        </div>
      )}

      {!providerInfo && smtpSettings.host && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm text-red-800">Unrecognized Email Provider</h3>
              <p className="text-xs text-red-700 mt-1">
                The host "<strong>{smtpSettings.host}</strong>" is not recognized. Supported providers:
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-red-700">
                <span>AWS SES</span>
                <span>SendGrid</span>
                <span>Mailgun</span>
                <span>Postmark</span>
                <span>Brevo/Sendinblue</span>
                <span>Resend</span>
                <span>Mailjet</span>
                <span>SparkPost</span>
                <span>SMTP2GO</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`${POS_SURFACE_RAISED} p-6 max-w-2xl`}>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#1a2332] mb-1">SMTP Host</label>
              <input value={smtpSettings.host} onChange={e => setSmtpSettings({ ...smtpSettings, host: e.target.value })} className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder="email-smtp.us-east-1.amazonaws.com" />
              <p className="text-[11px] text-gray-400 mt-1">e.g. email-smtp.us-east-1.amazonaws.com, smtp.sendgrid.net</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1a2332] mb-1">Port</label>
              <input type="number" value={smtpSettings.port} onChange={e => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value) || 587 })} className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" />
              <p className="text-[11px] text-gray-400 mt-1">Usually 587 (TLS) or 465 (SSL)</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#1a2332] mb-1">
                {isAwsSes ? 'SMTP Username (IAM Access Key ID)' : 'SMTP Username'}
              </label>
              <input value={smtpSettings.username} onChange={e => setSmtpSettings({ ...smtpSettings, username: e.target.value })} className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder={isAwsSes ? 'AKIA...' : 'username or apikey'} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1a2332] mb-1">
                {isAwsSes ? 'SMTP Password' : 'SMTP Password / API Key'}
              </label>
              <input type="password" value={smtpSettings.password} onChange={e => setSmtpSettings({ ...smtpSettings, password: e.target.value })} className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder={isAwsSes ? 'SES SMTP password' : 'password or API key'} />
              {isAwsSes && (
                <p className="text-[11px] text-gray-400 mt-1">SES SMTP password, not the IAM secret key.</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1">Leave blank when saving to keep the current stored password.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-semibold text-[#1a2332] mb-1">From Email</label>
              <input value={smtpSettings.from_email} onChange={e => setSmtpSettings({ ...smtpSettings, from_email: e.target.value })} className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder="sales@voltzsupply.com" />
              <p className="text-[11px] text-gray-400 mt-1">Must be a verified sender email</p>
            </div>
            <div><label className="block text-sm font-semibold text-[#1a2332] mb-1">From Name</label>
              <input value={smtpSettings.from_name} onChange={e => setSmtpSettings({ ...smtpSettings, from_name: e.target.value })} className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors" placeholder="Voltz Industrial Supply" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={smtpSettings.use_tls} onChange={e => setSmtpSettings({ ...smtpSettings, use_tls: e.target.checked })} className="rounded" />
            <label className="text-sm">Use TLS</label>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={async () => { setSmtpSaving(true); const ok = await saveSmtpSettings(smtpSettings); setSmtpSaving(false); notify(ok ? { variant: 'success', title: 'Changes saved', subtitle: 'Settings → Email Configuration (SMTP)' } : { variant: 'error', title: 'Changes not saved', subtitle: 'Settings → Email Configuration (SMTP)' }); }}
              disabled={smtpSaving} className="flex items-center gap-2 px-6 py-2.5 bg-[#1a2332] text-white rounded-lg text-sm font-semibold hover:bg-[#0f1923] disabled:opacity-50">
              <Save className="w-4 h-4" /> {smtpSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Test Email Section */}
      <div className={`${POS_SURFACE_RAISED} p-6 max-w-2xl mt-6`}>
        <h3 className="font-bold text-[#1a2332] mb-3 flex items-center gap-2"><Send className="w-4 h-4 text-blue-600" /> Send Test Email</h3>
        <p className="text-xs text-gray-500 mb-4">Send a test email to verify your settings are working correctly. Make sure to save your settings first.</p>

        {testEmailResult && (
          <div className={`mb-4 rounded-lg border p-3 flex items-start gap-2 ${testEmailResult.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {testEmailResult.type === 'success' ? (
              <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            )}
            <p className={`text-sm whitespace-pre-wrap ${testEmailResult.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {testEmailResult.message}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="email"
            value={testEmailAddr}
            onChange={e => setTestEmailAddr(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors"
            placeholder="Enter email address for test..."
          />
          <button
            onClick={handleSendTestEmail}
            disabled={testEmailSending || !smtpSettings.host || !smtpSettings.username}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> {testEmailSending ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderBillingSettings = () => (
    <div className={POS_PAGE_SHELL}>
      <div className="flex items-center gap-2 mb-6">
        <button type="button" onClick={goBackPage} className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1a2332]">
          <PosListPageTitleFa kind="billing" />
          Billing / Invoicing
        </h2>
      </div>
      <div className={`${POS_SURFACE_RAISED} p-6 max-w-xl`}>
        <label className="block text-sm font-semibold text-[#1a2332] mb-1">Default GCT (%)</label>
        <p className="text-xs text-gray-500 mb-4">
          Applied when you create new quotes, orders, and invoices in the POS. This percentage is used to calculate GCT on each document.
        </p>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={billingTaxRateInput}
          onChange={e => setBillingTaxRateInput(e.target.value)}
          className={`w-full max-w-xs px-3 py-2 border border-gray-200/90 rounded-xl text-sm bg-gray-50/70 focus:bg-white transition-colors ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
        />
        <div className="mt-6">
          <button
            type="button"
            onClick={async () => {
              const raw = billingTaxRateInput.trim();
              const parsed = raw === '' ? 0 : parseFloat(raw.replace(/,/g, ''));
              if (raw !== '' && Number.isNaN(parsed)) {
                notify({ variant: 'error', title: 'GCT rate not saved', subtitle: 'Settings → Billing / Invoicing — Enter a valid number' });
                return;
              }
              if (parsed < 0) {
                notify({ variant: 'error', title: 'GCT rate not saved', subtitle: 'Settings → Billing / Invoicing — Cannot be negative' });
                return;
              }
              setBillingSaving(true);
              const ok = await saveConfig('pos_default_tax_rate', parsed);
              setBillingSaving(false);
              if (ok) setBillingTaxRateInput(String(parsed));
              notify(
                ok
                  ? { variant: 'success', title: 'Changes saved', subtitle: 'Settings → Billing / Invoicing (default GCT)' }
                  : { variant: 'error', title: 'Changes not saved', subtitle: 'Settings → Billing / Invoicing' }
              );
            }}
            disabled={billingSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1a2332] text-white rounded-lg text-sm font-semibold hover:bg-[#0f1923] disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {billingSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Render active page ───
  const renderContent = () => {
    switch (activePage) {
      case 'pos-dashboard': return renderDashboard();
      case 'pos-quotes': return renderDocList('quote');
      case 'pos-orders': return renderDocList('order');
      case 'pos-invoices': return renderDocList('invoice');
      case 'pos-receipts': return renderDocList('receipt');
      case 'pos-customers': return renderCustomers();
      case 'pos-customer-history': return renderCustomerHistoryPage();
      case 'pos-quote-requests': return renderQuoteRequests();
      case 'pos-refunds': return renderRefunds();
      case 'pos-emails': return renderSentEmails();
      case 'pos-settings-email': return renderEmailSettings();
      case 'pos-settings-billing': return renderBillingSettings();
      case 'pos-create-quote': return <POSDocCreate key={`quote-${editDoc?.id ?? prefillData?.websiteRequestId ?? 'new'}`} type="quote" editDoc={editDoc} prefill={prefillData} fromQuoteRequestsPage={quoteEditorReturnPage === 'pos-quote-requests' || quoteEditorReturnPage === 'pos-customer-history'} onSave={() => { loadData(); navTo(quoteEditorReturnPage ?? 'pos-quotes'); }} onAfterWebsiteQuoteEmailSuccess={() => { loadData(); navTo(quoteEditorReturnPage === 'pos-customer-history' ? 'pos-customer-history' : 'pos-quote-requests'); }} onBack={() => navTo(quoteEditorReturnPage ?? 'pos-quotes')} onCheckout={async (payload) => { setCheckoutReturnPage(activePage); setCheckoutSource(payload); await loadData(); setActivePage('pos-checkout'); }} />;
      case 'pos-create-order':
        return (
          <POSDocCreate
            key={`order-${editDoc?.id ?? 'new'}`}
            type="order"
            editDoc={editDoc}
            prefill={prefillData}
            onSave={() => {
              loadData();
              const t = orderEditorReturnPage ?? 'pos-orders';
              setOrderEditorReturnPage(null);
              navTo(t);
            }}
            onBack={() => {
              const t = orderEditorReturnPage ?? 'pos-orders';
              setOrderEditorReturnPage(null);
              navTo(t);
            }}
            onCheckout={async (payload) => {
              setCheckoutReturnPage(activePage);
              setCheckoutSource(payload);
              await loadData();
              setActivePage('pos-checkout');
            }}
          />
        );
      case 'pos-create-invoice':
        return (
          <POSDocCreate
            key={`invoice-${editDoc?.id ?? 'new'}`}
            type="invoice"
            editDoc={editDoc}
            prefill={prefillData}
            onSave={() => {
              loadData();
              const t = invoiceEditorReturnPage ?? 'pos-invoices';
              setInvoiceEditorReturnPage(null);
              navTo(t);
            }}
            onBack={() => {
              const t = invoiceEditorReturnPage ?? 'pos-invoices';
              setInvoiceEditorReturnPage(null);
              navTo(t);
            }}
            onCheckout={async (payload) => {
              setCheckoutReturnPage(activePage);
              setCheckoutSource(payload);
              await loadData();
              setActivePage('pos-checkout');
            }}
          />
        );
      case 'pos-checkout': return (
        <POSCheckout
          key={
            checkoutExchangeHandoff
              ? `ex-${checkoutExchangeNavKey}`
              : checkoutSource
                ? `${checkoutSource.sourceType}-${checkoutSource.sourceDocId}`
                : 'standalone'
          }
          source={checkoutSource}
          exchangeHandoff={checkoutExchangeHandoff}
          onExchangeHandoffConsumed={() => setCheckoutExchangeHandoff(null)}
          onBack={() => {
            setCheckoutExchangeHandoff(null);
            goBackPage();
          }}
          onCustomersRefresh={refreshCustomers}
          onAfterSuccessfulCheckout={async () => {
            try {
              const r = await fetchReceipts();
              setReceipts(asPosRows<POSReceipt>(r));
            } catch (e) {
              console.error('refresh receipts after checkout:', e);
            }
          }}
          onDone={() => {
            setCheckoutSource(null);
            setCheckoutExchangeHandoff(null);
            loadData();
            const target = checkoutReturnPage ?? 'pos-dashboard';
            setCheckoutReturnPage(null);
            setActivePage(target);
            if (target !== 'pos-create-quote' && target !== 'pos-create-order' && target !== 'pos-create-invoice') {
              setEditDoc(null);
              setPrefillData(null);
              setQuoteEditorReturnPage(null);
            }
          }}
        />
      );
      case 'cms-sections': return <SectionManagerTab />;
      case 'cms-products': return <CMSProductManager onBack={goBackPage} />;
      case 'cms-categories': return <CMSCategoryManager onBack={goBackPage} />;
      case 'cms-contact': return <CMSContactManager />;
      case 'cms-profile': return <CMSCompanyProfileManager />;
      default: return renderDashboard();
    }
  };

  return (
    <PosColumnResizeSuspendContext.Provider value={posColumnResizeSuspendRef}>
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeMobileSidebar} />}


      {/* Sidebar - desktop */}
      <div className="hidden lg:flex flex-shrink-0 sticky top-0 h-screen">{renderSidebar()}</div>

      {/* Sidebar - mobile */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>{renderSidebar()}</div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 lg:px-6 h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100"><Menu className="w-5 h-5" /></button>
              <div className="hidden sm:flex items-center gap-2 bg-[#e31e24]/5 rounded-lg px-3 py-1.5">
                <Shield className="w-4 h-4 text-[#e31e24]" />
                <span className="text-xs font-bold text-[#e31e24] uppercase tracking-wider">Admin</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-500 hover:text-[#1a2332] text-sm"><Home className="w-4 h-4" /><span className="hidden sm:inline">View Site</span></button>
              <div className="w-px h-6 bg-gray-200" />
              <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><User className="w-4 h-4 text-gray-500" /></div><span className="text-sm font-medium text-gray-600 hidden md:inline">{username}</span></div>
              <button onClick={handleLogout} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">Logout</span></button>
            </div>
          </div>
        </div>


        {/* Page Content — min-h-0/min-w-0 so nested POS tables can scroll inside flex, not stretch the page */}
        <div className="flex-1 min-h-0 min-w-0 overflow-x-hidden p-4 lg:p-6">
          {renderContent()}
        </div>
      </div>

      {/* Global Document Preview Popups (must be mounted outside page-specific renders) */}
      {activePage !== 'pos-quote-requests' && (
        <>
          <Dialog open={viewQuotePopup != null} onOpenChange={(open) => { if (!open) setViewQuotePopup(null); }}>
            <DialogContent
              hideClose
              overlayClassName="bg-black/60 backdrop-blur-[2px]"
              className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
            >
              {viewQuotePopup && (
                <>
                  <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                    <div className="min-w-0 flex-1 space-y-1 pr-2">
                      <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Quote {viewQuotePopup.quote_number}</DialogTitle>
                      <p className="text-xs text-gray-600">{fmtDatePOS(viewQuotePopup.created_at)}{viewQuotePopup.status ? ` · ${viewQuotePopup.status}` : ''}</p>
                    </div>
                    <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                    <iframe title={`Quote ${viewQuotePopup.quote_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewQuotePopupHtml} />
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={viewOrderPopup != null} onOpenChange={(open) => { if (!open) setViewOrderPopup(null); }}>
            <DialogContent
              hideClose
              overlayClassName="bg-black/60 backdrop-blur-[2px]"
              className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
            >
              {viewOrderPopup && (
                <>
                  <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                    <div className="min-w-0 flex-1 space-y-1 pr-2">
                      <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Order {viewOrderPopup.order_number}</DialogTitle>
                      <p className="text-xs text-gray-600">{fmtDatePOS(viewOrderPopup.created_at)}{viewOrderPopup.status ? ` · ${viewOrderPopup.status}` : ''}</p>
                    </div>
                    <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                    <iframe title={`Order ${viewOrderPopup.order_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewOrderPopupHtml} />
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={viewInvoicePopup != null} onOpenChange={(open) => { if (!open) setViewInvoicePopup(null); }}>
            <DialogContent
              hideClose
              overlayClassName="bg-black/60 backdrop-blur-[2px]"
              className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
            >
              {viewInvoicePopup && (
                <>
                  <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                    <div className="min-w-0 flex-1 space-y-1 pr-2">
                      <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Invoice {viewInvoicePopup.invoice_number}</DialogTitle>
                      <p className="text-xs text-gray-600">{fmtDatePOS(viewInvoicePopup.created_at)}{viewInvoicePopup.status ? ` · ${viewInvoicePopup.status}` : ''}</p>
                    </div>
                    <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                    <iframe title={`Invoice ${viewInvoicePopup.invoice_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewInvoicePopupHtml} />
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={viewReceiptPopup != null} onOpenChange={(open) => { if (!open) setViewReceiptPopup(null); }}>
            <DialogContent
              hideClose
              overlayClassName="bg-black/60 backdrop-blur-[2px]"
              className="max-w-[900px] w-[min(96vw,900px)] max-h-[92vh] gap-0 overflow-hidden p-0 flex flex-col border border-gray-200 shadow-2xl sm:max-w-[900px] rounded-xl bg-white"
            >
              {viewReceiptPopup && (
                <>
                  <DialogHeader className="relative flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b border-gray-200 bg-white px-4 py-3 text-left sm:text-left">
                    <div className="min-w-0 flex-1 space-y-1 pr-2">
                      <DialogTitle className="text-lg font-bold tracking-tight text-[#1a2332]">Receipt {viewReceiptPopup.receipt_number}</DialogTitle>
                      <p className="text-xs text-gray-600">{fmtDatePOS(viewReceiptPopup.created_at)}{viewReceiptPopup.status ? ` · ${viewReceiptPopup.status}` : ''}</p>
                    </div>
                    <DialogClose type="button" className="shrink-0 rounded-full p-2 text-[#1a2332] transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0" aria-label="Close"><X className="h-5 w-5" /></DialogClose>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-hidden bg-white p-3 sm:p-4">
                    <iframe title={`Receipt ${viewReceiptPopup.receipt_number}`} className="h-[min(80vh,760px)] w-full min-h-[440px] rounded-md border border-gray-200 bg-white shadow-sm" srcDoc={viewReceiptPopupHtml} />
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Checkout Modal */}
      {checkoutInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCheckoutInvoice(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#1a2332] mb-4">Checkout - {checkoutInvoice.invoice_number}</h3>
            <p className="text-sm text-gray-500 mb-2">Total: <span className="text-xl font-bold text-[#e31e24]">{fmtMoney(checkoutInvoice.total)}</span></p>
            <p className="text-sm text-gray-500 mb-4">Customer: {checkoutInvoice.customer_name || 'Visitor'}</p>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {['cash', 'card', 'bank_transfer', 'store_credit'].map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-colors capitalize ${paymentMethod === m ? 'bg-[#1a2332] text-white border-[#1a2332]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => {
                try {
                  const result = await markInvoicePaidAndDelivered(checkoutInvoice, paymentMethod);
                  if (result.invoice && result.receipt) {
                    printDocument({ type: 'receipt', docNumber: result.receipt.receipt_number, date: result.receipt.created_at, customerName: result.receipt.customer_name, items: result.receipt.items, subtotal: checkoutInvoice.subtotal, taxRate: checkoutInvoice.tax_rate, taxAmount: checkoutInvoice.tax_amount, total: result.receipt.total, amountPaid: result.receipt.amount_paid, paymentMethod });
                    await loadData();
                  }
                  setCheckoutInvoice(null);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  notify({ variant: 'error', title: 'Could not complete checkout', subtitle: `POS → Invoices — ${msg}` });
                }
              }} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700">Mark Paid & Delivered</button>
              <button onClick={() => setCheckoutInvoice(null)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (refundProcessing) return;
              closeRefundModal();
            }}
          />
          <div
            className="relative bg-white rounded-2xl w-full max-w-xl min-w-0 p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-bold text-[#1a2332] mb-1">
              {refundSourceReceiptNumber
                ? `Process refund — Receipt ${refundSourceReceiptNumber}`
                : `Process Refund — ${refundInvoice.invoice_number}`}
            </h3>
            {refundSourceReceiptNumber && refundReceiptLinkedInvoices && refundReceiptLinkedInvoices.length > 1 && (
              <p className="text-sm text-gray-600 mb-4">
                Set quantities on one invoice, several, or all. A single refund record (one RF number) is created
                for the combined return; each invoice balance is updated accordingly.
              </p>
            )}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Refund Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'store_credit', 'exchange'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRefundType(t)}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold border capitalize ${refundType === t ? 'bg-[#e31e24] text-white border-[#e31e24]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {t.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const namePool = (refundReceiptLinkedInvoices && refundReceiptLinkedInvoices.length > 0)
                ? refundReceiptLinkedInvoices.map((inv) => String(inv.customer_name || '').trim())
                : [String(refundInvoice.customer_name || '').trim()];
              const needsRealCustomer =
                (refundType === 'store_credit' || refundType === 'exchange') &&
                namePool.some((n) => isPlaceholderWalkInCustomerName(n));
              if (!needsRealCustomer) return null;
              return (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Real customer required for {refundType === 'exchange' ? 'Exchange' : 'Store Credit'}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    This refund belongs to Visitor/Guest. Enter the real customer now. On the next click of
                    {' '}<span className="font-semibold">Process Refund & Print</span>, the receipt/invoice will be
                    reassigned and the refund will continue normally.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      value={refundRealCustomerForm.name}
                      onChange={(e) =>
                        setRefundRealCustomerForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white"
                      placeholder="Customer Name *"
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={14}
                      value={refundRealCustomerForm.phone}
                      onChange={(e) =>
                        setRefundRealCustomerForm((prev) => ({
                          ...prev,
                          phone: formatPhoneUsMask(digitsFromPhoneInput(e.target.value)),
                        }))
                      }
                      className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white font-mono tracking-tight"
                      placeholder="(876) 123-4567"
                    />
                    <input
                      value={refundRealCustomerForm.email}
                      onChange={(e) =>
                        setRefundRealCustomerForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white"
                      placeholder="Email"
                    />
                    <input
                      value={refundRealCustomerForm.company}
                      onChange={(e) =>
                        setRefundRealCustomerForm((prev) => ({ ...prev, company: e.target.value }))
                      }
                      className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white"
                      placeholder="Company"
                    />
                    <input
                      value={refundRealCustomerForm.address}
                      onChange={(e) =>
                        setRefundRealCustomerForm((prev) => ({ ...prev, address: e.target.value }))
                      }
                      className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white sm:col-span-2"
                      placeholder="Address"
                    />
                  </div>
                </div>
              );
            })()}
            {refundLinesByInvoiceId && refundReceiptLinkedInvoices && refundReceiptLinkedInvoices.length > 0 ? (
              <div className="mb-4 space-y-5">
                {refundReceiptLinkedInvoices.map((inv) => {
                  const invId = String(inv.id);
                  const canRefund = invoiceCanProcessRefund(inv);
                  const lines =
                    refundLinesByInvoiceId[invId] ?? invoiceLineItemsRemainingForRefund(inv, refunds);
                  return (
                    <div
                      key={invId}
                      className={`rounded-lg border p-3 min-w-0 ${canRefund ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-75'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2 min-w-0">
                        <span className="font-semibold text-[#1a2332] shrink-0">{inv.invoice_number}</span>
                        <div className="flex flex-col items-end gap-0.5 text-right shrink-0 min-w-0">
                          <span className="text-xs font-medium text-gray-700 tabular-nums">
                            Invoice total: {fmtMoney(Number(inv.total) || 0)}
                          </span>
                          {!canRefund && (
                            <span className="text-xs text-gray-500">Nothing left to refund</span>
                          )}
                        </div>
                      </div>
                      {canRefund && (
                        <>
                          <p className="text-xs font-semibold text-gray-500 mb-2">Items to refund</p>
                          {lines.map((item, idx) => (
                            <div
                              key={`${invId}-${idx}`}
                              className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 min-w-0"
                            >
                              <span className="text-sm min-w-0 flex-1 break-words">{item.product_name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  placeholder="0"
                                  value={item.quantity === 0 ? '' : String(item.quantity)}
                                  onChange={(e) => {
                                    const r = e.target.value.replace(/[^\d]/g, '');
                                    const q = r === '' ? 0 : parseInt(r, 10) || 0;
                                    const cap =
                                      invoiceLineItemsRemainingForRefund(inv, refunds)[idx]?.quantity ?? 0;
                                    const clamped = Math.min(Math.max(0, cap), q);
                                    setRefundLinesByInvoiceId((prev) => {
                                      if (!prev) return prev;
                                      const cur = prev[invId];
                                      if (!cur) return prev;
                                      const next = cur.map((ri, i) =>
                                        i === idx
                                          ? { ...ri, quantity: clamped, total: clamped * ri.unit_price }
                                          : ri
                                      );
                                      return { ...prev, [invId]: next };
                                    });
                                  }}
                                  className={`w-16 shrink-0 text-center border border-gray-200 rounded-md py-1 text-sm ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                                />
                                <span className="text-sm font-semibold text-right tabular-nums min-w-[7.5rem]">
                                  {fmtMoney(item.quantity * item.unit_price)}
                                </span>
                              </div>
                            </div>
                          ))}
                          {(() => {
                            const secSub = refundSelectionSubtotal(lines);
                            const secGct = refundTaxForSelection(secSub, inv.tax_rate);
                            const secTot = secSub + secGct;
                            return (
                              <div className="text-right text-sm mt-2 text-[#1a2332] tabular-nums">
                                <p className="font-bold text-[#e31e24] pt-0.5 border-t border-gray-100">
                                  Total: {fmtMoney(secTot)}
                                </p>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  let combinedSub = 0;
                  let combinedGct = 0;
                  for (const inv of refundReceiptLinkedInvoices) {
                    if (!invoiceCanProcessRefund(inv)) continue;
                    const invId = String(inv.id);
                    const lines = refundLinesByInvoiceId[invId] ?? [];
                    const secSub = refundSelectionSubtotal(lines);
                    combinedSub += secSub;
                    combinedGct += refundTaxForSelection(secSub, inv.tax_rate);
                  }
                  const combinedTotal = combinedSub + combinedGct;
                  return (
                    <div className="text-right border-t border-gray-200 pt-3 mt-2 min-w-0">
                      <p className="text-lg font-bold text-[#1a2332] tabular-nums break-words">
                        Total: {fmtMoney(combinedTotal)}
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-gray-200 p-3 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2 min-w-0">
                    <span className="font-semibold text-[#1a2332] shrink-0">{refundInvoice.invoice_number}</span>
                    <span className="text-xs font-medium text-gray-700 tabular-nums text-right shrink-0">
                      Invoice total: {fmtMoney(Number(refundInvoice.total) || 0)}
                    </span>
                  </div>
                  <label className="block text-sm font-semibold mb-2">Items to Refund</label>
                  {refundItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 min-w-0"
                    >
                      <span className="text-sm min-w-0 flex-1 break-words">{item.product_name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="0"
                          value={item.quantity === 0 ? '' : String(item.quantity)}
                          onChange={(e) => {
                            const r = e.target.value.replace(/[^\d]/g, '');
                            const q = r === '' ? 0 : parseInt(r, 10) || 0;
                            const cap =
                              invoiceLineItemsRemainingForRefund(refundInvoice, refunds)[idx]?.quantity ?? 0;
                            const clamped = Math.min(Math.max(0, cap), q);
                            setRefundItems(
                              refundItems.map((ri, i) =>
                                i === idx ? { ...ri, quantity: clamped, total: clamped * ri.unit_price } : ri
                              )
                            );
                          }}
                          className={`w-16 shrink-0 text-center border border-gray-200 rounded-md py-1 text-sm ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                        />
                        <span className="text-sm font-semibold text-right tabular-nums min-w-[7.5rem]">
                          {fmtMoney(item.quantity * item.unit_price)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {(() => {
                    const secSub = refundSelectionSubtotal(refundItems);
                    const secGct = refundTaxForSelection(secSub, refundInvoice.tax_rate);
                    const secTot = secSub + secGct;
                    return (
                      <div className="text-right mt-2 text-sm text-[#1a2332] tabular-nums">
                        <p className="font-bold text-[#e31e24] pt-0.5 border-t border-gray-100">
                          Total: {fmtMoney(secTot)}
                        </p>
                      </div>
                    );
                  })()}
                </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">Reason</label>
              <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" placeholder="Reason for refund..." />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={refundProcessing}
                onClick={async () => {
                  const namePool = (refundReceiptLinkedInvoices && refundReceiptLinkedInvoices.length > 0)
                    ? refundReceiptLinkedInvoices.map((inv) => String(inv.customer_name || '').trim())
                    : [String(refundInvoice?.customer_name || '').trim()];
                  const needsRealCustomer =
                    (refundType === 'store_credit' || refundType === 'exchange') &&
                    namePool.some((n) => isPlaceholderWalkInCustomerName(n));
                  const enteredRealName = refundRealCustomerForm.name.trim();
                  const enteredRealPhone = formatPhoneUsMask(digitsFromPhoneInput(refundRealCustomerForm.phone));
                  const enteredRealEmail = refundRealCustomerForm.email.trim();
                  const hasFullPhone = digitsFromPhoneInput(enteredRealPhone).length === 10;
                  const hasReadyRealCustomerDetails =
                    !!enteredRealName &&
                    !isPlaceholderWalkInCustomerName(enteredRealName) &&
                    hasFullPhone;
                  if (needsRealCustomer && !refundRealCustomerArmed && !hasReadyRealCustomerDetails) {
                    setRefundRealCustomerArmed(true);
                    notify({
                      variant: 'error',
                      title: 'Real customer required',
                      subtitle: 'Enter customer details, then click Process Refund & Print again.',
                    });
                    return;
                  }
                  if (refundSubmitLockRef.current) return;
                  refundSubmitLockRef.current = true;
                  setRefundProcessing(true);
                  let workingRefundInvoice = refundInvoice;
                  let workingLinkedInvoices = refundReceiptLinkedInvoices;
                  try {
                    if (needsRealCustomer) {
                      const realName = refundRealCustomerForm.name.trim();
                      const realEmail = refundRealCustomerForm.email.trim();
                      const realPhone = formatPhoneUsMask(digitsFromPhoneInput(refundRealCustomerForm.phone));
                      const realCompany = refundRealCustomerForm.company.trim();
                      const realAddress = refundRealCustomerForm.address.trim();
                      if (!realName || isPlaceholderWalkInCustomerName(realName)) {
                        notify({
                          variant: 'error',
                          title: 'Refund not processed',
                          subtitle: 'Enter a real customer name (not Visitor/Guest).',
                        });
                        return;
                      }
                      if (digitsFromPhoneInput(realPhone).length !== 10) {
                        notify({
                          variant: 'error',
                          title: 'Refund not processed',
                          subtitle: 'Enter a full phone number (10 digits) for this customer.',
                        });
                        return;
                      }
                      const matchedByTrackedId =
                        refundMatchedCustomerIdRef.current
                          ? customers.find((c) => String(c.id) === refundMatchedCustomerIdRef.current)
                          : undefined;
                      const linked =
                        matchedByTrackedId ??
                        findCustomerByEmailOrPhone(customers, realEmail, realPhone) ??
                        customers.find(
                          (c) =>
                            String(c.name || '').trim().toLowerCase() === realName.toLowerCase() &&
                            !isPlaceholderWalkInCustomerName(c.name)
                        );
                      let savedCust: POSCustomer | null = null;
                      if (linked?.id) {
                        const updatedExisting = await saveCustomer({
                          id: linked.id,
                          name: realName,
                          email: realEmail,
                          phone: realPhone,
                          company: realCompany,
                          address: realAddress,
                          notes: linked.notes || '',
                          store_credit: linked.store_credit || 0,
                        });
                        savedCust =
                          updatedExisting ??
                          {
                            ...linked,
                            name: realName,
                            email: realEmail,
                            phone: realPhone,
                            company: realCompany,
                            address: realAddress,
                          };
                      } else {
                        savedCust = await saveCustomer({
                          name: realName,
                          email: realEmail,
                          phone: realPhone,
                          company: realCompany,
                          address: realAddress,
                          notes: '',
                          store_credit: 0,
                        });
                      }
                      if (!savedCust?.id) {
                        notify({
                          variant: 'error',
                          title: 'Refund not processed',
                          subtitle: 'Could not save or resolve the real customer profile.',
                        });
                        return;
                      }
                      const invoiceIdsToTransfer =
                        refundReceiptLinkedInvoices && refundReceiptLinkedInvoices.length > 0
                          ? refundReceiptLinkedInvoices.map((inv) => String(inv.id))
                          : refundInvoice
                            ? [String(refundInvoice.id)]
                            : [];
                      const updatedInvoices = new Map<string, POSInvoice>();
                      for (const invoiceId of invoiceIdsToTransfer) {
                        const src =
                          invoices.find((x) => String(x.id) === invoiceId) ||
                          refundReceiptLinkedInvoices?.find((x) => String(x.id) === invoiceId) ||
                          (refundInvoice && String(refundInvoice.id) === invoiceId ? refundInvoice : null);
                        if (!src) continue;
                        const savedInv = await saveInvoice({
                          ...src,
                          customer_id: savedCust.id,
                          customer_name: savedCust.name,
                          customer_email: savedCust.email,
                          customer_phone: savedCust.phone,
                          customer_company: savedCust.company,
                        });
                        updatedInvoices.set(invoiceId, savedInv);
                      }
                      if (refundReceiptId) {
                        const rec = receipts.find((r) => String(r.id) === String(refundReceiptId));
                        if (rec) {
                          await saveReceipt({
                            ...rec,
                            customer_id: savedCust.id,
                            customer_name: savedCust.name,
                          });
                        }
                      }
                      if (workingRefundInvoice) {
                        const next = updatedInvoices.get(String(workingRefundInvoice.id));
                        if (next) workingRefundInvoice = next;
                      }
                      if (workingLinkedInvoices && workingLinkedInvoices.length > 0) {
                        workingLinkedInvoices = workingLinkedInvoices.map(
                          (inv) => updatedInvoices.get(String(inv.id)) || inv
                        );
                      }
                      setRefundInvoice(workingRefundInvoice);
                      setRefundReceiptLinkedInvoices(workingLinkedInvoices);
                      setRefundRealCustomerArmed(false);
                    }
                    const isReceiptFlow = Boolean(
                      refundLinesByInvoiceId &&
                        workingLinkedInvoices &&
                        workingLinkedInvoices.length > 0
                    );
                    const ops: { invoice: POSInvoice; items: POSLineItem[] }[] = [];
                    if (isReceiptFlow && workingLinkedInvoices && refundLinesByInvoiceId) {
                    for (const inv of workingLinkedInvoices) {
                      if (!invoiceCanProcessRefund(inv)) continue;
                      const invId = String(inv.id);
                      const lines = refundLinesByInvoiceId[invId];
                      const activeItems = (lines ?? []).filter((i) => i.quantity > 0);
                      if (activeItems.length === 0) continue;
                      ops.push({ invoice: inv, items: activeItems });
                    }
                    if (ops.length === 0) {
                      notify({
                        variant: 'error',
                        title: 'Refund not processed',
                        subtitle: 'POS → Refunds — Enter a quantity on at least one invoice',
                      });
                      return;
                    }
                    } else {
                      const activeItems = refundItems.filter((i) => i.quantity > 0);
                      if (activeItems.length === 0) {
                        notify({
                          variant: 'error',
                          title: 'Refund not processed',
                          subtitle: 'POS → Refunds — Select at least one item',
                        });
                        return;
                      }
                    }
                    let refund: POSRefund | null = null;
                    if (isReceiptFlow) {
                      refund = await processRefundSegments({
                        segments: ops,
                        refundType,
                        reason: refundReason,
                        notes: '',
                        receiptId: refundReceiptId,
                      });
                    } else {
                      const activeItems = refundItems.filter((i) => i.quantity > 0);
                      refund = await processRefund({
                        invoice: workingRefundInvoice!,
                        items: activeItems,
                        refundType,
                        reason: refundReason,
                        notes: '',
                        receiptId: refundReceiptId,
                      });
                    }
                    if (!refund) {
                      notify({
                        variant: 'error',
                        title: 'Refund not saved',
                        subtitle: 'POS → Refunds',
                      });
                      await loadData();
                      return;
                    }
                    printDocument(buildRefundPrintDocProps(refund, invoices));
                    await loadData();
                    notify({
                      variant: 'success',
                      title: 'Refund recorded',
                      subtitle: `POS → Refunds — ${refund.refund_number}`,
                    });
                    if (refundType === 'exchange') {
                      const cid = String(refund.customer_id || '').trim();
                      if (cid) {
                        setCheckoutExchangeNavKey((k) => k + 1);
                        setCheckoutExchangeHandoff({ customerId: cid });
                        setCheckoutSource(null);
                        setActivePage('pos-checkout');
                      }
                    }
                    closeRefundModal();
                  } finally {
                    refundSubmitLockRef.current = false;
                    setRefundProcessing(false);
                  }
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-colors ${
                  refundProcessing
                    ? 'cursor-wait bg-[#e31e24]/50 opacity-80'
                    : 'bg-[#e31e24] hover:bg-[#c91a1f]'
                }`}
              >
                {refundProcessing ? 'Processing…' : 'Process Refund & Print'}
              </button>
              <button
                type="button"
                disabled={refundProcessing}
                onClick={() => {
                  if (refundProcessing) return;
                  closeRefundModal();
                }}
                className={`px-4 py-2.5 border border-gray-200 rounded-lg text-sm ${
                  refundProcessing ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PosColumnResizeSuspendContext.Provider>
  );
};

const CMSDashboard: React.FC = () => (
  <CMSNotificationProvider>
    <CMSDashboardInner />
  </CMSNotificationProvider>
);

export default CMSDashboard;
