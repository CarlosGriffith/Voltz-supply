import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Minus, Trash2, User, UserPlus, Package, Printer, Send, ArrowLeft, CheckCircle, Mail, Phone, Building2, Globe, MessageSquare } from 'lucide-react';
import { PosDocTitleFa } from '@/components/pos/posActionMenuIcons';
import {
  safeNum,
  fmtCurrency,
  decimalInputToNumber,
  DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS,
  digitsFromPhoneInput,
  formatPhoneUsMask,
  displayUsPhoneFromStored,
  findCustomerByEmailOrPhone,
  isValidEmailFormatForForms,
  POS_DEFAULT_VISITOR_CUSTOMER_NAME,
  gctPercentForCalculation,
  taxAmountFromSubtotalAndGctPercent,
  fmtDatePOS,
  cn,
} from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/mediaUrl';

import { fetchCustomProducts, fetchProductOverrides, fetchConfig } from '@/lib/cmsData';
import { Product } from '@/data/products';
import {
  POSLineItem, POSCustomer, POSQuote, POSOrder, POSInvoice,
  fetchCustomers, fetchInvoices, saveCustomer, saveQuote, saveOrder, saveInvoice,
  generateDocNumber, sendEmail, markQuoteRequestEmailSent, sendQuoteWhatsAppNotification,
  invoiceIsFullyPaid, INVOICE_STATUS_UNPAID,
} from '@/lib/posData';
import { printDocument, generateEmailHTML } from '@/components/pos/POSPrintTemplate';
import { buildDocumentPdfBase64 } from '@/components/pos/documentPdf';
import type { PrintDocProps } from '@/components/pos/posPrintTypes';
import { useCMSNotification } from '@/contexts/CMSNotificationContext';
import { usePOSCustomersListBroadcast, useSyncSelectedCustomerFromList } from '@/hooks/usePOSRealtime';
import {
  parseWebsiteQuoteRequestLines,
  categorySlugForWebsiteLine,
} from '@/lib/websiteQuoteRequestParse';
import { parseQuoteRequestDeliveryPreferences } from '@/lib/quoteRequestDeliveryPrefs';
import { POS_PAGE_MAX, POS_QUICK_SEARCH_INPUT, POS_SEARCH_CARD, POS_SURFACE_RAISED } from '@/components/pos/posPageChrome';

type DocType = 'quote' | 'order' | 'invoice';

/** Text + empty when zero (grey placeholder) + live `onCommit`; keeps `0.` while focused. */
function LineUnitPriceInput({
  unitPrice,
  onCommit,
  className,
}: {
  unitPrice: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => (unitPrice === 0 ? '' : String(unitPrice)));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focusedRef.current) return;
    setText(unitPrice === 0 ? '' : String(unitPrice));
  }, [unitPrice]);
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder="0"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const t = raw.trim().replace(/,/g, '');
        if (t === '' || t === '.' || t === '-' || t === '-.') {
          onCommit(0);
          return;
        }
        const n = parseFloat(t);
        if (!Number.isNaN(n)) onCommit(n);
      }}
      onBlur={() => {
        focusedRef.current = false;
        const fin = decimalInputToNumber(text);
        onCommit(fin);
        setText(fin === 0 ? '' : String(fin));
      }}
      className={`${className || ''} ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`.trim()}
    />
  );
}

function normalizeCatalogName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Sync Quote Requests table product column from line items (quantities stored in `quantity` field, not in product text). */
function buildQuoteRequestProductSummary(items: POSLineItem[], fallbackProduct: string): string {
  const fb = (fallbackProduct || '').trim();
  if (!items.length) return fb;
  if (items.length === 1) {
    return items[0].product_name;
  }
  const head = items.slice(0, 3).map((i) => i.product_name);
  const more = items.length > 3 ? ` (+${items.length - 3} more)` : '';
  return `${head.join('; ')}${more}`;
}

/** Match website quote product text to a catalog row (exact, then category-scoped, then fuzzy). */
function findCatalogProductForPrefill(
  catalog: Product[],
  productName: string,
  categorySlug?: string
): Product | null {
  const n = normalizeCatalogName(productName);
  if (!n) return null;

  const exact = catalog.find(p => normalizeCatalogName(p.name) === n);
  if (exact) return exact;

  const tokens = n.split(' ').filter(Boolean);

  let pool = catalog;
  const cs = (categorySlug || '').trim().toLowerCase();
  if (cs) {
    const scoped = catalog.filter(
      p => (p.categorySlug || '').toLowerCase() === cs
    );
    if (scoped.length > 0) pool = scoped;
  }

  const inPoolExact = pool.find(p => normalizeCatalogName(p.name) === n);
  if (inPoolExact) return inPoolExact;

  const byContains = pool.find(
    p =>
      normalizeCatalogName(p.name).includes(n) ||
      n.includes(normalizeCatalogName(p.name))
  );
  if (byContains) return byContains;

  const byOther = pool.find(p =>
    (p.otherNames || '')
      .toLowerCase()
      .split(/[,;]/)
      .map(a => a.trim())
      .filter(Boolean)
      .some(alt => normalizeCatalogName(alt) === n)
  );
  if (byOther) return byOther;

  if (tokens.length >= 2) {
    const byTokens = pool.find(p => {
      const pn = normalizeCatalogName(p.name);
      return tokens.every(t => pn.includes(t));
    });
    if (byTokens) return byTokens;
  }

  return null;
}

interface POSDocCreateProps {
  type: DocType;
  editDoc?: POSQuote | POSOrder | POSInvoice | null;
  prefill?: {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerCompany?: string;
    productName?: string;
    productCategory?: string;
    productQuantity?: string;
    items?: POSLineItem[];
    notes?: string;
    websiteRequestId?: string;
    /** Snapshot when opening from Quote Requests — avoids overwriting `quoted` / `closed` on Save. */
    websiteQuoteRequestStatus?: string;
    /** Initial Save & Send checkboxes (from quote request message or explicit). */
    sendViaEmail?: boolean;
    sendViaWhatsapp?: boolean;
  };
  onSave: () => void;
  onBack: () => void;
  /** When Save + Email succeeds for a quote opened from a website quote request, run this instead of `onSave` (e.g. return to Quote Requests). */
  onAfterWebsiteQuoteEmailSuccess?: () => void;
  /** True when the quote editor was opened from Website Quote Requests — plain Save marks the request reviewed. */
  fromQuoteRequestsPage?: boolean;
  onCheckout?: (payload: {
    sourceType: DocType;
    sourceDocId: string;
  }) => void | Promise<void>;
}

/** Stable JSON for comparing review form state to last saved / loaded document. */
function reviewLineSnapshot(i: POSLineItem) {
  return {
    product_id: String(i.product_id),
    product_name: (i.product_name || '').trim(),
    quantity: safeNum(i.quantity),
    unit_price: safeNum(i.unit_price),
  };
}

function buildReviewFormSnapshot(args: {
  type: DocType;
  items: POSLineItem[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCompany: string;
  notes: string;
  taxRate: number;
  discountInput: string;
  selectedCustomerId?: string | null;
  sendViaEmail?: boolean;
  sendViaWhatsapp?: boolean;
}): string {
  const itemsPart = args.items.map(reviewLineSnapshot);
  const phoneDigits = digitsFromPhoneInput(args.customerPhone);
  const gct = gctPercentForCalculation(args.taxRate);
  const discount = decimalInputToNumber(args.discountInput);
  const payload: Record<string, unknown> = {
    items: itemsPart,
    customerName: args.customerName.trim(),
    customerEmail: args.customerEmail.trim().toLowerCase(),
    phoneDigits,
    notes: (args.notes || '').trim(),
    gct,
    discount,
    customerId: args.selectedCustomerId ? String(args.selectedCustomerId) : '',
  };
  if (args.type === 'quote') {
    payload.customerCompany = args.customerCompany.trim();
    payload.sendViaEmail = !!args.sendViaEmail;
    payload.sendViaWhatsapp = !!args.sendViaWhatsapp;
  }
  return JSON.stringify(payload);
}

function initialQuoteSendPrefs(
  docType: DocType,
  ed: POSQuote | POSOrder | POSInvoice | null | undefined,
  pf: POSDocCreateProps['prefill']
): { email: boolean; wa: boolean } {
  if (docType !== 'quote') return { email: true, wa: false };
  const eq = ed as POSQuote | undefined;
  if (eq?.id) {
    const rawE = (eq as POSQuote & { send_via_email?: unknown }).send_via_email;
    const rawW = (eq as POSQuote & { send_via_whatsapp?: unknown }).send_via_whatsapp;
    return {
      email: rawE === undefined || rawE === null ? true : rawE !== false && rawE !== 0,
      wa: rawW === true || rawW === 1,
    };
  }
  if (pf?.sendViaEmail != null || pf?.sendViaWhatsapp != null) {
    return {
      email: pf.sendViaEmail !== false,
      wa: !!pf.sendViaWhatsapp,
    };
  }
  if (pf?.websiteRequestId && (pf.notes ?? '').trim()) {
    const p = parseQuoteRequestDeliveryPreferences(pf.notes);
    return { email: p.sendViaEmail, wa: p.sendViaWhatsapp };
  }
  return { email: true, wa: false };
}

function buildBaselineFromEditDoc(type: DocType, doc: POSQuote | POSOrder | POSInvoice): string {
  const q = type === 'quote' ? (doc as POSQuote) : null;
  return buildReviewFormSnapshot({
    type,
    items: doc.items || [],
    customerName: doc.customer_name || '',
    customerEmail: doc.customer_email || '',
    customerPhone: doc.customer_phone || '',
    customerCompany:
      type === 'quote' || type === 'order' || type === 'invoice'
        ? ((doc as POSQuote | POSOrder | POSInvoice).customer_company ?? '') || ''
        : '',
    notes: doc.notes || '',
    taxRate: doc.tax_rate ?? 0,
    discountInput:
      doc.discount_amount != null && Number(doc.discount_amount) !== 0
        ? String(doc.discount_amount)
        : '',
    selectedCustomerId: doc.customer_id ? String(doc.customer_id) : null,
    sendViaEmail: q ? q.send_via_email !== false : undefined,
    sendViaWhatsapp: q ? !!(q.send_via_whatsapp === true || (q as any).send_via_whatsapp === 1) : undefined,
  });
}

const POSDocCreate: React.FC<POSDocCreateProps> = ({
  type,
  editDoc,
  prefill,
  onSave,
  onBack,
  onAfterWebsiteQuoteEmailSuccess,
  fromQuoteRequestsPage = false,
  onCheckout,
}) => {
  const { notify } = useCMSNotification();
  const posDocWhere =
    type === 'quote' ? 'POS → Quotes' : type === 'order' ? 'POS → Orders' : 'POS → Invoices';

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<POSCustomer[]>([]);
  const [invoices, setInvoices] = useState<POSInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedBaseline, setSavedBaseline] = useState<string | null>(() =>
    editDoc ? buildBaselineFromEditDoc(type, editDoc) : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const websitePrefillLineAppliedForRef = useRef<string | null>(null);
  /** When CRM match id changes, sync full customer row into the form (avoid clobbering edits for the same match). */
  const prevMatchedCustomerIdRef = useRef<string | null>(null);
  const prefillRef = useRef(prefill);
  prefillRef.current = prefill;

  // Form state
  const [items, setItems] = useState<POSLineItem[]>(editDoc?.items || prefill?.items || []);
  /** Lets users clear the qty field while typing; committed on blur (min 1). */
  const [qtyInputDraft, setQtyInputDraft] = useState<Record<number, string | undefined>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);
  usePOSCustomersListBroadcast(setCustomers, true);
  useSyncSelectedCustomerFromList(customers, setSelectedCustomer);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState(() => {
    const fromDoc = editDoc?.customer_name?.trim();
    if (fromDoc) return fromDoc;
    const fromPrefill = prefill?.customerName?.trim();
    if (fromPrefill) return fromPrefill;
    return POS_DEFAULT_VISITOR_CUSTOMER_NAME;
  });
  const [customerEmail, setCustomerEmail] = useState(editDoc?.customer_email || prefill?.customerEmail || '');
  const [customerPhone, setCustomerPhone] = useState(editDoc?.customer_phone || prefill?.customerPhone || '');
  const [customerCompany, setCustomerCompany] = useState(() => {
    const co = (editDoc as POSQuote | POSOrder | POSInvoice | undefined)?.customer_company;
    if (co != null && String(co).trim() !== '') return String(co).trim();
    return prefill?.customerCompany || '';
  });
  const sendPrefsInit = initialQuoteSendPrefs(type, editDoc ?? null, prefill);
  const [sendViaEmail, setSendViaEmail] = useState(sendPrefsInit.email);
  const [sendViaWhatsApp, setSendViaWhatsApp] = useState(sendPrefsInit.wa);
  const [notes, setNotes] = useState(editDoc?.notes || prefill?.notes || '');
  const [taxRate, setTaxRate] = useState(editDoc?.tax_rate ?? 0);
  const [discountInput, setDiscountInput] = useState(() => {
    const d = editDoc?.discount_amount;
    return d != null && Number(d) !== 0 ? String(d) : '';
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // If prefill has customer info, default to 'new' customer type so fields are shown
  const isFromWebsite = !!prefill?.websiteRequestId;

  const typeLabel = { quote: 'Quote', order: 'Order', invoice: 'Invoice' }[type];
  const recordNumber =
    editDoc == null
      ? ''
      : type === 'quote'
        ? (editDoc as POSQuote).quote_number ?? ''
        : type === 'order'
          ? (editDoc as POSOrder).order_number ?? ''
          : (editDoc as POSInvoice).invoice_number ?? '';
  const isReviewPage = !!editDoc;

  useEffect(() => {
    prevMatchedCustomerIdRef.current = null;
  }, [editDoc?.id]);

  useEffect(() => {
    if (!editDoc) {
      setSavedBaseline(null);
      return;
    }
    setSavedBaseline(buildBaselineFromEditDoc(type, editDoc));
    // editDoc is intentionally omitted from deps: reset baseline only when document id changes, not when the parent re-creates the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDoc?.id, type]);

  // Link to CRM customer when email or phone matches; on new match, fill all customer fields from the record.
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
    (async () => {
      try {
        const [prods, overrides, custs, invs] = await Promise.all([
          fetchCustomProducts(), fetchProductOverrides(), fetchCustomers(), fetchInvoices(),
        ]);
        const merged = prods.map(p => {
          const o = overrides[p.id];
          if (!o) return p;
          return { ...p, name: o.name ?? p.name, price: o.price ?? p.price, image: o.image ?? p.image, brand: o.brand ?? p.brand };
        });
        setProducts(merged);
        setCustomers(custs);
        setInvoices(invs);
        if (editDoc?.customer_id) {
          const c = custs.find((x) => String(x.id) === String(editDoc.customer_id));
          if (c) {
            setSelectedCustomer(c);
            setIsExistingCustomer(true);
          }
        }
      } catch (e) {
        console.error('POSDocCreate bootstrap load', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const d = editDoc?.discount_amount;
    setDiscountInput(d != null && Number(d) !== 0 ? String(d) : '');
  }, [editDoc?.id]);

  // Website quote request → always mirror customer + message into the form when opening from admin
  useEffect(() => {
    if (editDoc) return;
    const wid = prefill?.websiteRequestId;
    if (!wid) return;
    const p = prefillRef.current;
    if (!p?.websiteRequestId) return;
    setCustomerName(p.customerName?.trim() || POS_DEFAULT_VISITOR_CUSTOMER_NAME);
    setCustomerEmail(p.customerEmail || '');
    setCustomerPhone(displayUsPhoneFromStored(p.customerPhone || ''));
    setCustomerCompany(p.customerCompany || '');
    setNotes(p.notes || '');
  }, [editDoc, prefill?.websiteRequestId]);

  // Add one line item per website request row once catalog is loaded (product field is multi-line; quantity may be pipe-separated)
  useEffect(() => {
    if (loading || editDoc) return;
    const p = prefillRef.current;
    const wid = p?.websiteRequestId;
    if (!wid) return;
    if (products.length === 0) return;
    if (websitePrefillLineAppliedForRef.current === wid) return;

    const parsed = parseWebsiteQuoteRequestLines(p.productName || '', p.productQuantity || '');
    if (parsed.length === 0) {
      websitePrefillLineAppliedForRef.current = wid;
      return;
    }

    const catBlob = p.productCategory || '';
    const newLines: POSLineItem[] = [];
    for (let idx = 0; idx < parsed.length; idx++) {
      const { name, qty } = parsed[idx];
      const catHint = categorySlugForWebsiteLine(catBlob, idx);
      const matched = findCatalogProductForPrefill(products, name, catHint);
      if (matched) {
        newLines.push({
          product_id: matched.id,
          product_name: matched.name,
          product_image: matched.image,
          part_number: matched.partNumber,
          brand: matched.brand,
          category: matched.category,
          quantity: qty,
          unit_price: matched.price,
          total: qty * matched.price,
        });
      } else {
        newLines.push({
          product_id: `web:${wid}:${idx}`,
          product_name: name,
          part_number: '',
          brand: '',
          category: catHint || '',
          quantity: qty,
          unit_price: 0,
          total: 0,
        });
      }
    }

    setItems(newLines);
    websitePrefillLineAppliedForRef.current = wid;
  }, [loading, editDoc, products, prefill?.websiteRequestId]);

  const websiteRequestLinePreview = useMemo(() => {
    if (!isFromWebsite || !prefill?.productName?.trim()) return [];
    return parseWebsiteQuoteRequestLines(prefill.productName, prefill.productQuantity ?? '');
  }, [isFromWebsite, prefill?.productName, prefill?.productQuantity]);

  // Default GCT % from Billing / Invoicing settings (new documents only)
  useEffect(() => {
    if (editDoc) return;
    let cancelled = false;
    (async () => {
      const v = await fetchConfig('pos_default_tax_rate');
      const n = typeof v === 'number' ? v : Number(v);
      if (cancelled || Number.isNaN(n) || n < 0) return;
      setTaxRate(n);
    })();
    return () => {
      cancelled = true;
    };
  }, [editDoc?.id]);

  // Click outside search
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) setShowCustomerDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Search products
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const tokens = q.split(/\s+/);
    const results = products.filter(p => {
      const text = `${p.name} ${p.otherNames || ''} ${p.partNumber || ''} ${p.description} ${p.brand} ${p.category}`.toLowerCase();
      return tokens.every(t => text.includes(t));
    }).slice(0, 20);
    setSearchResults(results);
  }, [searchQuery, products]);

  const addItem = (product: Product) => {
    const existing = items.find(i => i.product_id === product.id);
    if (existing) {
      setItems(items.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unit_price } : i));
    } else {
      setItems([...items, {
        product_id: product.id, product_name: product.name, product_image: product.image,
        part_number: product.partNumber, brand: product.brand, category: product.category,
        quantity: 1, unit_price: product.price, total: product.price,
      }]);
    }
    setSearchQuery('');
    setShowSearch(false);
    setSelectedProduct(null);
  };

  const clearQtyDraft = (idx: number) => {
    setQtyInputDraft((prev) => {
      if (prev[idx] === undefined) return prev;
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const updateItemQty = (idx: number, qty: number) => {
    const q = Math.max(1, Math.floor(Number(qty)) || 1);
    setItems(items.map((item, i) => i === idx ? { ...item, quantity: q, total: q * item.unit_price } : item));
  };

  const updateItemPrice = (idx: number, price: number) => {
    setItems(items.map((item, i) => i === idx ? { ...item, unit_price: price, total: item.quantity * price } : item));
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const gctPercentEffective = gctPercentForCalculation(taxRate);
  const taxAmount = taxAmountFromSubtotalAndGctPercent(subtotal, taxRate);
  const discountAmount = decimalInputToNumber(discountInput);
  const total = subtotal + taxAmount - discountAmount;

  /** Review is read-only for save actions when the (linked) invoice is fully paid. */
  const reviewLockedForPaidInvoice = useMemo(() => {
    if (!editDoc) return false;
    if (type === 'invoice') return invoiceIsFullyPaid(editDoc as POSInvoice);
    const invId =
      type === 'quote'
        ? (editDoc as POSQuote).invoice_id
        : (editDoc as POSOrder).invoice_id;
    if (!invId) return false;
    const inv = invoices.find((i) => String(i.id) === String(invId));
    if (!inv) return false;
    return invoiceIsFullyPaid(inv);
  }, [type, editDoc, invoices]);

  /** Review page: invoice that already has payment on file (partial or full before further edits). */
  const reviewInvoiceForPriorPaymentLine = useMemo(() => {
    if (!editDoc) return null;
    const eps = 0.005;
    if (type === 'invoice') {
      const inv = editDoc as POSInvoice;
      return safeNum(inv.amount_paid) > eps ? inv : null;
    }
    const invId =
      type === 'quote' ? (editDoc as POSQuote).invoice_id : (editDoc as POSOrder).invoice_id;
    if (!invId) return null;
    const inv = invoices.find((i) => String(i.id) === String(invId));
    return inv && safeNum(inv.amount_paid) > eps ? inv : null;
  }, [editDoc, type, invoices]);

  const currentFormSnapshot = useMemo(
    () =>
      buildReviewFormSnapshot({
        type,
        items,
        customerName,
        customerEmail,
        customerPhone,
        customerCompany,
        notes,
        taxRate,
        discountInput,
        selectedCustomerId: selectedCustomer?.id ?? null,
        sendViaEmail: type === 'quote' ? sendViaEmail : undefined,
        sendViaWhatsapp: type === 'quote' ? sendViaWhatsApp : undefined,
      }),
    [
      type,
      items,
      customerName,
      customerEmail,
      customerPhone,
      customerCompany,
      notes,
      taxRate,
      discountInput,
      selectedCustomer?.id,
      sendViaEmail,
      sendViaWhatsApp,
    ]
  );

  const reviewIsClean =
    !!editDoc && savedBaseline != null && currentFormSnapshot === savedBaseline;

  const selectCustomer = (c: POSCustomer) => {
    prevMatchedCustomerIdRef.current = c.id;
    setSelectedCustomer(c);
    setCustomerName(c.name);
    setCustomerEmail(c.email);
    setCustomerPhone(displayUsPhoneFromStored(c.phone));
    setCustomerCompany(c.company);
    setIsExistingCustomer(true);
    setShowCustomerDropdown(false);
    setCustomerSearch('');
  };

  const handleSave = async (opts?: {
    andPrint?: boolean;
    forCheckout?: boolean;
    /** Quote: Save & Send (uses checkboxes). */
    andSend?: boolean;
    /** Order / Invoice: Save & Email Customer. */
    andEmailCustomer?: boolean;
  }): Promise<any | null> => {
    const andPrint = opts?.andPrint ?? false;
    const forCheckout = opts?.forCheckout ?? false;
    const andSend = opts?.andSend ?? false;
    const andEmailCustomer = opts?.andEmailCustomer ?? false;

    if (reviewLockedForPaidInvoice) {
      notify({
        variant: 'error',
        title: 'Invoice paid in full',
        subtitle: `${posDocWhere} — save actions are not available when the invoice is fully paid.`,
      });
      return;
    }
    if (items.length === 0) {
      notify({ variant: 'error', title: 'Add at least one product', subtitle: posDocWhere });
      return;
    }
    if (andSend && type === 'quote') {
      if (!sendViaEmail && !sendViaWhatsApp) {
        notify({
          variant: 'error',
          title: 'Choose how to send',
          subtitle: `${posDocWhere} — select Send via Email and/or Send via WhatsApp.`,
        });
        return;
      }
      if (sendViaEmail && !isValidEmailFormatForForms(customerEmail)) {
        notify({ variant: 'error', title: 'Enter a valid email address', subtitle: posDocWhere });
        return;
      }
      if (sendViaWhatsApp && digitsFromPhoneInput(customerPhone).length !== 10) {
        notify({
          variant: 'error',
          title: 'Enter a valid phone for WhatsApp',
          subtitle: `${posDocWhere} — 10-digit local number required.`,
        });
        return;
      }
    } else if (andEmailCustomer && !isValidEmailFormatForForms(customerEmail)) {
      notify({ variant: 'error', title: 'Enter a valid email address', subtitle: posDocWhere });
      return;
    }
    setSaving(true);
    const suppressSuccessToast = false;
    let skipGenericSuccessNotify = false;
    let baselineUpdate: string | null = null;
    try {
      let customerId = selectedCustomer?.id;

      // If this is a new customer (not existing) and they have a name, auto-save them
      if (!isExistingCustomer && customerName.trim()) {
        const newCust = await saveCustomer({ name: customerName, email: customerEmail, phone: customerPhone, company: customerCompany });
        if (newCust) {
          customerId = newCust.id;
          setSelectedCustomer(newCust);
          setIsExistingCustomer(true);
          // Update local customers list so subsequent saves recognize them
          setCustomers(prev => [...prev, newCust]);
        }
      }

      const docNumber = editDoc ? (editDoc as any)[`${type}_number`] : await generateDocNumber(type);
      const baseDoc = {
        id: editDoc?.id, [`${type}_number`]: docNumber,
        customer_id: customerId, customer_name: customerName, customer_email: customerEmail,
        customer_phone: customerPhone, items, subtotal, tax_rate: gctPercentEffective, tax_amount: taxAmount,
        discount_amount: discountAmount, total, notes,
      };

      /** Persist document only; linked rows + quote-request status update on checkout (or explicit Save with sync). */
      const onInvoicePersistWarning = (subtitle: string) =>
        notify({
          variant: 'warning',
          title: 'Save completed — linked order issue',
          subtitle,
        });
      const saveOptsCheckout = forCheckout
        ? ({
            syncLinked: false,
            skipOrderGeneratedPromotion: true,
            onPersistWarning: onInvoicePersistWarning,
          } as const)
        : { onPersistWarning: onInvoicePersistWarning };

      let saved: any = null;
      if (type === 'quote') {
        const editQ = editDoc as POSQuote | undefined;
        const websiteLinked = !!(prefill?.websiteRequestId || editQ?.website_request_id);
        const lockedPipeline: POSQuote['status'][] = [
          'order_generated',
          'invoice_generated_unpaid',
          'invoice_generated_partially_paid',
          'invoice_generated_paid',
          'processed',
        ];
        let quoteStatus: POSQuote['status'];
        if (editQ?.status === 'dormant') {
          quoteStatus = 'dormant';
        } else if (forCheckout) {
          quoteStatus = editQ?.status || 'reviewed';
        } else {
          quoteStatus = editQ?.status || 'reviewed';
          // "Emailed" is set only after sendEmail succeeds (see below), not on this first save.
          if (websiteLinked && editQ?.status && lockedPipeline.includes(editQ.status)) {
            quoteStatus = editQ.status;
          } else if (websiteLinked) {
            if (andPrint) quoteStatus = 'printed';
            else quoteStatus = 'reviewed';
          }
        }
        saved = await saveQuote(
          {
            ...baseDoc,
            quote_number: docNumber,
            customer_company: customerCompany,
            source: editQ?.source ?? (prefill?.websiteRequestId ? 'website' : 'walk-in'),
            status: quoteStatus,
            website_request_id: editQ?.website_request_id ?? prefill?.websiteRequestId,
            order_id: editQ?.order_id ?? null,
            invoice_id: editQ?.invoice_id ?? null,
            email_sent_at: editQ?.email_sent_at ?? null,
            valid_until: editQ?.valid_until,
            send_via_email: sendViaEmail,
            send_via_whatsapp: sendViaWhatsApp,
          },
          saveOptsCheckout
        );
      } else if (type === 'order') {
        const editO = editDoc as POSOrder | undefined;
        /** Once an invoice exists, order status tracks invoice (Unpaid / Paid / Partially Paid / Refunded), not pre-invoice workflow. */
        const orderInvoiceLocked: POSOrder['status'][] = [
          'invoice_generated_unpaid',
          'invoice_generated_partially_paid',
          'invoice_generated_paid',
          'processed',
          'refunded',
        ];
        const hasInvoiceId = editO?.invoice_id != null && String(editO.invoice_id).trim() !== '';
        let orderStatus: POSOrder['status'];
        if (editO?.status && orderInvoiceLocked.includes(editO.status)) {
          orderStatus = editO.status;
        } else if (forCheckout && editO?.status) {
          orderStatus = editO.status;
        } else if (!hasInvoiceId) {
          // Pre-invoice: Save & Print → Printed; plain Save preserves Reviewed / Printed / Emailed
          if (andPrint) {
            orderStatus = 'printed';
          } else if (
            editO?.status === 'reviewed' ||
            editO?.status === 'printed' ||
            editO?.status === 'emailed'
          ) {
            orderStatus = editO.status;
          } else {
            orderStatus = 'reviewed';
          }
        } else {
          orderStatus = editO?.status ?? 'invoice_generated_unpaid';
        }
        saved = await saveOrder(
          {
            ...baseDoc,
            order_number: docNumber,
            customer_company: customerCompany,
            customer_type: customerId ? 'registered' : 'visitor',
            status: orderStatus,
            quote_id: editO?.quote_id ?? null,
            invoice_id: editO?.invoice_id,
          },
          saveOptsCheckout
        );
      } else {
        const editI = editDoc as POSInvoice | undefined;
        saved = await saveInvoice(
          {
            ...baseDoc,
            invoice_number: docNumber,
            customer_company: customerCompany,
            status: editI?.status || INVOICE_STATUS_UNPAID,
            delivery_status: editI?.delivery_status || 'pending',
            order_id: editI?.order_id,
            quote_id: editI?.quote_id ?? null,
            amount_paid: editI?.amount_paid ?? 0,
            payment_method: editI?.payment_method,
            paid_at: editI?.paid_at,
            delivered_at: editI?.delivered_at,
          },
          saveOptsCheckout
        );
      }

      if (saved) {
        baselineUpdate = buildReviewFormSnapshot({
          type,
          items,
          customerName,
          customerEmail,
          customerPhone,
          customerCompany,
          notes,
          taxRate,
          discountInput,
          selectedCustomerId: customerId ?? selectedCustomer?.id ?? null,
          sendViaEmail: type === 'quote' ? sendViaEmail : undefined,
          sendViaWhatsapp: type === 'quote' ? sendViaWhatsApp : undefined,
        });
      }

      if (saved && andPrint) {
        printDocument({
          type,
          docNumber,
          date: saved.created_at || new Date().toISOString(),
          customerName,
          customerEmail,
          customerPhone,
          customerCompany,
          customerAccountNo: customerId || undefined,
          items,
          subtotal,
          taxRate: gctPercentEffective,
          taxAmount,
          discountAmount,
          total,
          notes,
          status: saved.status,
          validUntil: type === 'quote' ? (saved as POSQuote).valid_until : undefined,
        });
      }

      if (
        saved &&
        andEmailCustomer &&
        type !== 'quote' &&
        isValidEmailFormatForForms(customerEmail)
      ) {
        const mailDoc: PrintDocProps = {
          type,
          docNumber,
          date: saved.created_at || new Date().toISOString(),
          customerName,
          customerEmail,
          customerPhone,
          customerCompany,
          customerAccountNo: customerId || undefined,
          items,
          subtotal,
          taxRate: gctPercentEffective,
          taxAmount,
          discountAmount,
          total,
          notes,
          status: saved.status,
          validUntil: type === 'quote' ? (saved as POSQuote).valid_until : undefined,
        };
        const emailHtml = generateEmailHTML(mailDoc);
        let attachments: { filename: string; contentBase64: string }[] | undefined;
        if (!isReviewPage) {
          try {
            const pdf = await buildDocumentPdfBase64(mailDoc);
            attachments = [{ filename: pdf.filename, contentBase64: pdf.base64 }];
          } catch (pdfErr) {
            console.error('PDF attachment failed:', pdfErr);
          }
        }
        const emailResult = await sendEmail({
          to: customerEmail,
          toName: customerName,
          subject: `Your ${typeLabel} ${docNumber} from Voltz Industrial Supply`,
          htmlBody: emailHtml,
          documentType: type,
          documentId: saved.id,
          documentNumber: docNumber,
          attachments,
        });

        if (emailResult.success) {
          if (type === 'order' && saved) {
            const os = (saved as POSOrder).status;
            const orderInvoiceLocked: POSOrder['status'][] = [
              'invoice_generated_unpaid',
              'invoice_generated_partially_paid',
              'invoice_generated_paid',
              'processed',
              'refunded',
            ];
            if (!orderInvoiceLocked.includes(os)) {
              saved = await saveOrder({ ...(saved as POSOrder), status: 'emailed' }, { syncLinked: false });
            }
          }
          notify({
            variant: 'success',
            title:
              type === 'order'
                ? 'Order saved and Email sent Successfully'
                : 'Invoice saved and Email sent Successfully',
          });
        } else {
          notify({
            variant: 'error',
            title: emailResult.error || 'Email could not be sent',
            subtitle: `${posDocWhere} — ${docNumber} was saved`,
          });
        }
        onSave();
        return saved;
      }

      if (saved && andSend && type === 'quote') {
        skipGenericSuccessNotify = true;
        let emailSent = false;
        let waSent = false;
        let emailErr: string | null = null;
        let waErr: string | null = null;

        if (sendViaEmail) {
          const mailDoc: PrintDocProps = {
            type: 'quote',
            docNumber,
            date: saved.created_at || new Date().toISOString(),
            customerName,
            customerEmail,
            customerPhone,
            customerCompany,
            customerAccountNo: customerId || undefined,
            items,
            subtotal,
            taxRate: gctPercentEffective,
            taxAmount,
            discountAmount,
            total,
            notes,
            status: saved.status,
            validUntil: (saved as POSQuote).valid_until,
          };
          const emailHtml = generateEmailHTML(mailDoc);
          let attachments: { filename: string; contentBase64: string }[] | undefined;
          if (!isReviewPage) {
            try {
              const pdf = await buildDocumentPdfBase64(mailDoc);
              attachments = [{ filename: pdf.filename, contentBase64: pdf.base64 }];
            } catch (pdfErr) {
              console.error('PDF attachment failed:', pdfErr);
            }
          }
          const emailResult = await sendEmail({
            to: customerEmail,
            toName: customerName,
            subject: `Your Quote ${docNumber} from Voltz Industrial Supply`,
            htmlBody: emailHtml,
            documentType: 'quote',
            documentId: saved.id,
            documentNumber: docNumber,
            attachments,
          });
          if (emailResult.success) {
            emailSent = true;
            saved = await saveQuote(
              {
                ...(saved as POSQuote),
                status: 'emailed',
                email_sent_at: new Date().toISOString(),
              },
              { syncLinked: false, skipOrderGeneratedPromotion: true }
            );
            const websiteRequestId =
              prefill?.websiteRequestId || (saved as POSQuote | undefined)?.website_request_id;
            if (websiteRequestId) {
              await markQuoteRequestEmailSent(websiteRequestId);
            }
          } else {
            emailErr = emailResult.error || 'Email could not be sent';
          }
        }

        if (sendViaWhatsApp) {
          const phoneDigits = digitsFromPhoneInput(customerPhone);
          const qn = String((saved as POSQuote).quote_number || docNumber || '').trim();
          if (phoneDigits.length !== 10) {
            waErr = 'Enter a full 10-digit customer phone number.';
          } else {
            const productLines = items
              .filter((i) => (i.product_name || '').trim() !== '')
              .map((i) => `${(i.product_name || '').trim()} × ${Number(i.quantity) || 0}`)
              .join(' • ');
            const qtyTotal = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
            const dateStr = fmtDatePOS((saved as POSQuote).created_at || new Date().toISOString());
            const templateVars = {
              customer_name: customerName.trim() || 'Customer',
              quote_num: qn,
              dateofquote: dateStr,
              product: (productLines || '—').slice(0, 1024),
              qty: String(qtyTotal),
              cost_item: `$${fmtCurrency(subtotal)}`,
              gct: `$${fmtCurrency(taxAmount)}`,
              total: `$${fmtCurrency(total)}`,
            };
            const waBodyFallback = [
              customerName.trim() ? `Hi ${customerName.trim()},` : 'Hello,',
              qn ? `Your quote ${qn} from Voltz Industrial Supply is ready.` : 'Your quote from Voltz Industrial Supply is ready.',
              'Thank you for your business.',
            ].join(' ');
            const wa = await sendQuoteWhatsAppNotification({
              phoneDigits,
              customerName: customerName.trim(),
              quoteNumber: qn,
              body: waBodyFallback,
              templateVars,
            });
            if (wa.ok) {
              waSent = true;
            } else {
              waErr = wa.error || 'WhatsApp send failed';
            }
          }
        }

        const okAny = (sendViaEmail && emailSent) || (sendViaWhatsApp && waSent);
        const triedAny = sendViaEmail || sendViaWhatsApp;
        const parts: string[] = [];
        if (sendViaEmail) {
          parts.push(emailSent ? 'Email sent' : `Email failed${emailErr ? `: ${emailErr}` : ''}`);
        }
        if (sendViaWhatsApp) {
          parts.push(waSent ? 'WhatsApp sent' : `WhatsApp failed${waErr ? `: ${waErr}` : ''}`);
        }
        if (okAny) {
          notify({
            variant: 'success',
            title: 'Quote saved',
            subtitle: parts.length ? parts.join(' · ') : `${posDocWhere} — ${docNumber}`,
          });
        } else if (triedAny) {
          notify({
            variant: 'error',
            title: 'Quote saved — sending had issues',
            subtitle: parts.join(' · ') || `${posDocWhere} — ${docNumber}`,
          });
        }

        if (
          emailSent &&
          prefill?.websiteRequestId &&
          onAfterWebsiteQuoteEmailSuccess
        ) {
          onAfterWebsiteQuoteEmailSuccess();
        } else {
          onSave();
        }
        return saved;
      }

      if (
        !(forCheckout && type === 'quote' && prefill?.websiteRequestId) &&
        !suppressSuccessToast &&
        !skipGenericSuccessNotify
      ) {
        notify({
          variant: 'success',
          title: `${typeLabel} saved`,
          subtitle: `${posDocWhere} — ${docNumber}`,
        });
      }

      if (saved && forCheckout && onCheckout) {
        await onCheckout({
          sourceType: type,
          sourceDocId: saved.id,
        });
      } else {
        onSave();
      }
      return saved;
    } catch (err) {
      console.error('Save error:', err);
      const title =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to save. Please try again.';
      notify({ variant: 'error', title, subtitle: posDocWhere });
      return null;
    } finally {
      setSaving(false);
      if (baselineUpdate !== null) setSavedBaseline(baselineUpdate);
    }
  };


  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => `${c.name} ${c.email} ${c.phone} ${c.company}`.toLowerCase().includes(customerSearch.toLowerCase())).slice(0, 10)
    : customers.slice(0, 10);

  const canSaveAndEmailCustomer = isValidEmailFormatForForms(customerEmail);
  const canSaveAndSend =
    type === 'quote' &&
    (sendViaEmail || sendViaWhatsApp) &&
    (!sendViaEmail || isValidEmailFormatForForms(customerEmail)) &&
    (!sendViaWhatsApp || digitsFromPhoneInput(customerPhone).length === 10);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-gray-200 border-t-[#e31e24] rounded-full animate-spin" /></div>;

  return (
    <div className={`${POS_PAGE_MAX} space-y-6`}>
      {/* Website Quote Request Info Banner */}
      {isFromWebsite && prefill && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-blue-800 mb-1">Website Quote Request</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                {prefill.customerName && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-blue-700 font-medium">{prefill.customerName}</span>
                  </div>
                )}
                {prefill.customerEmail && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-blue-700 font-medium">{prefill.customerEmail}</span>
                  </div>
                )}
                {prefill.customerPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-blue-700 font-medium">{prefill.customerPhone}</span>
                  </div>
                )}
                {prefill.customerCompany && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-blue-700 font-medium">{prefill.customerCompany}</span>
                  </div>
                )}
              </div>
              {websiteRequestLinePreview.length > 0 && (
                <div className="mt-2 text-xs">
                  <div className="flex items-center gap-1.5 text-blue-700 font-medium mb-1">
                    <Package className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    Requested line items
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-blue-800">
                    {websiteRequestLinePreview.map((ln, i) => (
                      <li key={`${ln.name}-${i}`}>
                        <strong>{ln.name}</strong>
                        <span className="text-blue-600"> × {ln.qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header — actions only in full-width row below the grid */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="p-2 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
            aria-busy={saving}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-[#1a2332]">
            <PosDocTitleFa kind={type} mode={editDoc ? 'review' : 'create'} />
            <span className="min-w-0">
              {editDoc ? (
                <>
                  Review {typeLabel}
                  {recordNumber ? (
                    <>
                      :{' '}
                      <span className="text-[18px] font-bold leading-snug text-[#1a2332] tabular-nums">
                        {recordNumber}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                `Create ${typeLabel}`
              )}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-900 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || reviewLockedForPaidInvoice || reviewIsClean}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Product Search + Items */}
        <div className="lg:col-span-2 space-y-4">
          {/* Product Search */}
          <div className={POS_SEARCH_CARD}>
          <div ref={searchRef} className="relative flex gap-2 items-stretch">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
                className={cn(POS_QUICK_SEARCH_INPUT, 'pl-10 pr-4 py-3 rounded-lg')}
                placeholder="Search products by name, barcode, part number, description..." />
            </div>
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setShowSearch(false); }}
                className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
            ) : null}
            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => { setSelectedProduct(p); addItem(p); }}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    {p.image ? <img src={resolveMediaUrl(p.image)} alt="" className="w-12 h-12 rounded-lg object-cover border" /> :
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="w-5 h-5 text-gray-400" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a2332] truncate">{p.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {p.partNumber && <span className="font-mono">{p.partNumber}</span>}
                        {p.brand && <span>{p.brand}</span>}
                        {p.category && <span>{p.category}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#1a2332]">${fmtCurrency(p.price)}</p>
                      <p className={`text-xs ${p.inStock ? 'text-green-600' : 'text-red-500'}`}>{p.inStock ? `In Stock${p.stockCount ? ` (${p.stockCount})` : ''}` : 'Out of Stock'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

          </div>
          </div>

          {/* Line Items Table */}
          <div className={`${POS_SURFACE_RAISED} overflow-hidden`}>
            <div className="bg-[#1a2332] text-white px-4 py-3 grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wider">
              <div className="col-span-5">Product</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No products added yet. Search above to add products.</p>
              </div>
            ) : items.map((item, idx) => (
              <div key={idx} className="px-4 py-3 grid grid-cols-12 gap-2 items-center border-b border-gray-100 last:border-0">
                <div className="col-span-5 flex items-center gap-3">
                  {item.product_image ? <img src={resolveMediaUrl(item.product_image)} alt="" className="w-10 h-10 rounded-lg object-cover border" /> :
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="w-4 h-4 text-gray-400" /></div>}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1a2332] truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-400 truncate">{item.part_number || item.brand || ''}</p>
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      clearQtyDraft(idx);
                      updateItemQty(idx, item.quantity - 1);
                    }}
                    className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Quantity for ${item.product_name}`}
                    value={qtyInputDraft[idx] !== undefined ? qtyInputDraft[idx]! : String(item.quantity)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, '');
                      setQtyInputDraft((d) => ({ ...d, [idx]: v }));
                    }}
                    onBlur={() => {
                      setQtyInputDraft((prev) => {
                        if (prev[idx] === undefined) return prev;
                        const raw = prev[idx]!;
                        const n = raw === '' ? NaN : parseInt(raw, 10);
                        const final = Number.isNaN(n) || n < 1 ? 1 : n;
                        updateItemQty(idx, final);
                        const next = { ...prev };
                        delete next[idx];
                        return next;
                      });
                    }}
                    className="w-12 text-center text-sm font-semibold border border-gray-200 rounded-md py-1 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      clearQtyDraft(idx);
                      updateItemQty(idx, item.quantity + 1);
                    }}
                    className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="col-span-2 text-right">
                  <LineUnitPriceInput
                    key={`${idx}-${item.product_id}`}
                    unitPrice={item.unit_price}
                    onCommit={(n) => updateItemPrice(idx, n)}
                    className="w-20 text-right text-sm font-semibold border border-gray-200 rounded-md py-1 px-2"
                  />
                </div>
                <div className="col-span-2 text-right text-sm font-bold text-[#1a2332]">${fmtCurrency(item.total)}</div>
                <div className="col-span-1 text-right">
                  <button onClick={() => removeItem(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals — payment note left of cost summary when prior payment exists */}
          <div className={`${POS_SURFACE_RAISED} p-4`}>
            <div className="flex flex-col md:flex-row md:items-stretch gap-4">
              <div className="flex-1 min-w-0 flex md:items-center md:justify-start justify-start">
                {isReviewPage && reviewInvoiceForPriorPaymentLine ? (
                  <div className="text-left space-y-0.5 [overflow-wrap:anywhere]">
                    <p className="text-sm font-medium text-[#1a2332]">Payment Already Received</p>
                    <p className="text-sm font-semibold text-[#1a2332] tabular-nums">
                      ${fmtCurrency(safeNum(reviewInvoiceForPriorPaymentLine.amount_paid))}
                      {type !== 'invoice' ? (
                        <span className="text-gray-600 font-normal">
                          {' '}
                          ({reviewInvoiceForPriorPaymentLine.invoice_number})
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="w-full md:w-72 shrink-0 space-y-2 md:ml-auto">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-semibold text-[#1a2332]">${fmtCurrency(subtotal)}</span></div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">GCT</span>
                    <span className="font-semibold text-[#1a2332]">${fmtCurrency(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm items-center gap-2">
                  <span className="text-gray-500">Discount ($)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className={`w-20 text-right text-sm border border-gray-200 rounded-md py-1 px-2 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                  />
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2 mt-2">
                  <span className="text-[#1a2332]">Total</span><span className="text-[#1a2332]">${fmtCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Customer + Message from Customer */}
        <div className="space-y-4">
          {/* Customer Section */}
          <div className={`${POS_SURFACE_RAISED} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#1a2332] flex items-center gap-2"><User className="w-4 h-4" /> Customer</h3>
              {/* New / Existing Customer Badge */}
              {customerEmail.trim() && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  isExistingCustomer
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {isExistingCustomer ? (
                    <><User className="w-3 h-3" /> Existing Customer</>
                  ) : (
                    <><UserPlus className="w-3 h-3" /> New Customer</>
                  )}
                </span>
              )}
            </div>



            {/* Customer Form Fields - Always visible */}
            <div className="space-y-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === POS_DEFAULT_VISITOR_CUSTOMER_NAME) {
                    e.target.select();
                  }
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Customer Name *"
              />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(formatPhoneUsMask(digitsFromPhoneInput(e.target.value)))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono tracking-tight"
                placeholder="(876) 123-4567"
              />
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                autoComplete="email"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Email Address"
              />
              <input
                type="text"
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Company"
              />
            </div>

            {/* Existing Customer Info */}
            {selectedCustomer && isExistingCustomer && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
                <p className="text-xs font-semibold text-blue-700">Linked to: {selectedCustomer.name}</p>
                {selectedCustomer.store_credit > 0 && <p className="text-xs text-blue-600">Store Credit: ${fmtCurrency(selectedCustomer.store_credit)}</p>}
              </div>
            )}

            {/* New Customer Info */}
            {!isExistingCustomer && customerEmail.trim() && customerName.trim() && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <p className="text-xs font-semibold text-amber-700">New customer will be added on save</p>
              </div>
            )}
          </div>

          {/* Message from Customer */}
          <div className={`${POS_SURFACE_RAISED} p-4`}>
            <h3 className="text-sm font-bold text-[#1a2332] mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Message from Customer
            </h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              className="w-full px-3 py-2 border border-gray-200/90 rounded-xl text-sm resize-none bg-gray-50/70 focus:bg-white transition-colors" placeholder="Customer's message or special instructions..." />
          </div>

          {type === 'quote' && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-0.5">
              <label className="flex items-center gap-2 text-sm text-[#1a2332] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendViaWhatsApp}
                  onChange={(e) => setSendViaWhatsApp(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/30"
                />
                <span>Send via WhatsApp</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-[#1a2332] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendViaEmail}
                  onChange={(e) => setSendViaEmail(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500/30"
                />
                <span>Send via Email</span>
              </label>
            </div>
          )}

        </div>

        {/* Full-width action row — not inside the narrow sidebar column */}
        <div className="lg:col-span-3 flex items-center justify-end gap-2 min-w-0 pt-2">
          <button
            type="button"
            onClick={() => handleSave({ forCheckout: true })}
            disabled={saving || reviewLockedForPaidInvoice}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a2332] text-white rounded-lg text-sm font-semibold hover:bg-[#0f1923] disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" /> {saving ? 'Saving...' : 'Save & Checkout'}
          </button>
          <button
            type="button"
            onClick={() => handleSave({ andPrint: true })}
            disabled={saving || reviewLockedForPaidInvoice}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" /> {saving ? 'Saving...' : 'Save & Print'}
          </button>
          {type === 'quote' ? (
            <button
              type="button"
              onClick={() => handleSave({ andSend: true })}
              disabled={saving || !canSaveAndSend || reviewLockedForPaidInvoice}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" /> {saving ? 'Saving...' : 'Save & Send'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave({ andEmailCustomer: true })}
              disabled={saving || !canSaveAndEmailCustomer || reviewLockedForPaidInvoice}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" /> {saving ? 'Saving...' : 'Save & Email Customer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default POSDocCreate;
