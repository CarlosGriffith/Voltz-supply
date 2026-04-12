import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display timezone for POS / CMS: Colombia (GMT-5, no DST). DB stores UTC; we convert here for UI. */
export const POS_TIMEZONE = 'America/Bogota';

/**
 * Parse API / DB datetimes into a correct `Date` instant. The database stores **UTC**; naive
 * `YYYY-MM-DD HH:mm:ss[.fff]` from MySQL (`dateStrings`) is interpreted as **UTC** (append `Z`), not
 * browser local time. ISO strings that already include `Z` or `±hh:mm` are unchanged.
 */
export function parsePosDateInput(d: string | Date): Date {
  if (d instanceof Date) return d;
  const s = String(d).trim();
  if (!s) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(s)) {
    return new Date(s);
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?/);
  if (m) {
    return new Date(`${m[1]}T${m[2]}${m[3] || ''}Z`);
  }
  return new Date(s);
}

/**
 * Format an instant to "YYYY-MM-DD HH:MM AM/PM" in {@link POS_TIMEZONE}. Pass UTC strings from the DB
 * or a `Date`; output is always Bogota local time for staff/customer-facing copy.
 */
export function fmtDatePOS(d: string | Date): string {
  if (!d) return '';
  const date = typeof d === 'string' ? parsePosDateInput(d) : d;
  if (isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: POS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPart['type']) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const yyyy = get('year');
  const mo = get('month');
  const dd = get('day');
  const hh = get('hour');
  const min = get('minute');
  const dp = (get('dayPeriod') || '').toUpperCase();
  if (!yyyy) return '';
  return `${yyyy}-${mo}-${dd} ${hh}:${min} ${dp}`;
}

/**
 * Safely convert any value to a number. Returns 0 for NaN, null, undefined, or non-numeric strings.
 * Use this before calling .toFixed() or passing values to recharts to prevent
 * "(e || 0).toFixed is not a function" errors when database returns strings instead of numbers.
 */
export function safeNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/** USD for display: thousands separators, two decimal places (e.g. 1,234.56) */
export function fmtCurrency(val: unknown): string {
  return safeNum(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** String is only zero (0, 00, 0.0, -0, …) — not 0.5 or empty. */
const NUMERIC_ZERO_ONLY_RE = /^-?0+\.?0*$/;

/**
 * On focus, select the whole value when the field shows only zero so the next keystroke replaces it.
 * Prefer {@link DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS} + empty string value for zero (Billing / GCT pattern).
 */
export function selectIfNumericZeroOnly(e: { target: HTMLInputElement }) {
  const v = e.target.value.trim();
  if (v !== '' && NUMERIC_ZERO_ONLY_RE.test(v)) {
    requestAnimationFrame(() => e.target.select());
  }
}

/** Tailwind: grey placeholder text (matches Settings → Billing Default GCT). */
export const DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS = 'placeholder:text-gray-400';

/**
 * Parse a decimal text field for live totals; incomplete typing (`.`, `-`, ``) → 0.
 */
export function decimalInputToNumber(raw: string): number {
  const t = raw.trim().replace(/,/g, '');
  if (t === '' || t === '.' || t === '-' || t === '-.') return 0;
  const n = parseFloat(t);
  return Number.isNaN(n) ? 0 : n;
}

/** Digits only, max 10; strips a single leading US country code 1. (matches Request a Quote form.) */
export function digitsFromPhoneInput(value: string): string {
  let d = value.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Display mask: (xxx) xxx-xxxx — same as website Request a Quote. */
export function formatPhoneUsMask(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Normalize stored phone strings to masked display for POS forms. */
export function displayUsPhoneFromStored(raw: string | null | undefined): string {
  return formatPhoneUsMask(digitsFromPhoneInput(raw || ''));
}

/** Walk-in default for POS checkout & quote/order/invoice review when no customer name is provided. */
export const POS_DEFAULT_VISITOR_CUSTOMER_NAME = 'Visitor';

/**
 * Loose format check aligned with the website Request a Quote form (`validate` / email lookup).
 */
export function isValidEmailFormatForForms(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim();
  return e.length > 0 && /\S+@\S+\.\S+/.test(e);
}

/** Empty, "Visitor", or "Guest" (case-insensitive) — not sufficient alone for partial/overpayment. */
export function isPlaceholderWalkInCustomerName(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim().toLowerCase();
  return n === '' || n === POS_DEFAULT_VISITOR_CUSTOMER_NAME.toLowerCase() || n === 'guest';
}

/** Valid email or 10-digit US phone on the form — required with a real name for partial/overpayment. */
export function hasPosCheckoutContactChannel(email: string, phoneInput: string): boolean {
  return isValidEmailFormatForForms(email) || digitsFromPhoneInput(phoneInput).length === 10;
}

/** Partial and overpayments require a non-placeholder name plus email or phone. */
export function hasIdentityForPartialOrOverpayment(
  customerName: string,
  customerEmail: string,
  customerPhone: string
): boolean {
  if (isPlaceholderWalkInCustomerName(customerName)) return false;
  return hasPosCheckoutContactChannel(customerEmail, customerPhone);
}

/**
 * Match a CRM customer from checkout / document fields:
 * - Phone only (no email): match by 10-digit US phone.
 * - Email only (no contact number): match by email.
 * - Both phone (any digits) and email: match by phone only (10 digits required); email is ignored for lookup.
 */
export function findCustomerByEmailOrPhone<T extends { email?: string; phone?: string }>(
  customers: T[],
  email: string,
  phoneInput: string
): T | undefined {
  const em = (email || '').trim().toLowerCase();
  const hasEmail = em.length > 0;
  const pd = digitsFromPhoneInput(phoneInput);
  const hasAnyPhoneDigits = pd.length > 0;
  const hasFullPhone = pd.length === 10;

  if (hasEmail && hasAnyPhoneDigits) {
    if (!hasFullPhone) return undefined;
    return customers.find((c) => digitsFromPhoneInput(c.phone || '') === pd);
  }
  if (!hasEmail && hasFullPhone) {
    return customers.find((c) => digitsFromPhoneInput(c.phone || '') === pd);
  }
  if (hasEmail && !hasAnyPhoneDigits) {
    return customers.find((c) => (c.email || '').trim().toLowerCase() === em);
  }
  return undefined;
}

/**
 * Sent-email logs (and some UIs) store a label before the real doc number, e.g. "quote QT-001".
 * Strip repeated type words and stray leading words before codes like `XX-123` or `XX–456`.
 */
export function stripLeadingDocumentNumberVerbiage(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  const original = String(raw).trim();

  // Prefer explicit POS-style reference (QT-, OR-, INV-, RT-, REF-, REC-)
  const tokenMatch = original.match(/\b((?:QT|OR|INV|RT|REF|REC)[-–#]\s*[\w.-]+)/i);
  if (tokenMatch) {
    return tokenMatch[1].replace(/\s*([-–#])\s*/g, '$1').trim();
  }

  let s = original;
  for (let i = 0; i < 16; i++) {
    const next = s
      .replace(
        /^(quote|quotation|order|invoice|receipt|refund|document|doc|your|the|for)\s*[:-–.]?\s*/i,
        ''
      )
      .trim();
    if (next === s) break;
    s = next;
  }
  // Stray label words before a token that looks like XX-… (two+ letters then hyphen)
  s = s.replace(/^([a-z]+\s+)+(?=[A-Za-z]{2,}[-–#])/i, '').trim();
  // Leading word(s) before an all-digit tail
  s = s.replace(/^[a-z]+\s+(?=\d)/i, '').trim();
  return s || original;
}

/**
 * Sent Emails "Document" column: show only the record number (e.g. `QT-1000021`), not the doc-type
 * label. Any leading words in `document_number` (e.g. `quote QT-…`) are stripped via
 * {@link stripLeadingDocumentNumberVerbiage}.
 */
export function formatSentEmailDocumentDisplay(
  _documentType: string | null | undefined,
  documentNumber: string | null | undefined
): string {
  return stripLeadingDocumentNumberVerbiage(documentNumber || '');
}

/** Max decimal places when using GCT % and derived tax in raw calculation chains. */
export const GCT_CALC_DECIMAL_PLACES = 4;

/**
 * Round a value used in GCT math (rate and tax amounts). No more than {@link GCT_CALC_DECIMAL_PLACES} decimals.
 */
export function roundForGctCalculation(value: number): number {
  const p = 10 ** GCT_CALC_DECIMAL_PLACES;
  return Math.round((Number(value) || 0) * p) / p;
}

/** Effective GCT % for formulas (same rounding as other GCT values). */
export function gctPercentForCalculation(taxRatePercent: number): number {
  return roundForGctCalculation(taxRatePercent);
}

/**
 * Tax = subtotal × (GCT% ÷ 100), with rate and result rounded per {@link roundForGctCalculation}.
 */
export function taxAmountFromSubtotalAndGctPercent(subtotal: number, taxRatePercent: number): number {
  const pct = gctPercentForCalculation(taxRatePercent);
  return roundForGctCalculation((Number(subtotal) || 0) * (pct / 100));
}

/**
 * Receipt `payment_type` "full": treat as full payment when received amount is within ± this many cents of balance due (default $1).
 */
export const RECEIPT_FULL_PAYMENT_TOLERANCE_CENTS = 100;
