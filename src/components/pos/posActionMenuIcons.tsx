import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faPenToSquare,
  faEye,
  faPrint,
  faMoon,
  faSun,
  faCartPlus,
  faCartShopping,
  faComments,
  faFileCircleCheck,
  faFileInvoice,
  faFileLines,
  faCashRegister,
  faRotateLeft,
  faReceipt,
  faUserPlus,
  faUserPen,
  faUsers,
  faClockRotateLeft,
  faTrashCan,
  faFileCirclePlus,
  faEnvelopeOpenText,
  faServer,
  faPercent,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

/** Inline Font Awesome icon for POS Actions dropdown items (CMS + lists). */
export function PosActionsFa({
  icon,
  className,
}: {
  icon: IconDefinition;
  className?: string;
}) {
  return (
    <FontAwesomeIcon
      icon={icon}
      fixedWidth
      className={cn('h-3.5 w-3.5 shrink-0 text-[#5c6573]', className)}
      aria-hidden
    />
  );
}

/** Solid icons used across POS Actions menus — import once per screen. */
export const POS_MENU_FA = {
  review: faPenToSquare,
  view: faEye,
  print: faPrint,
  setDormant: faMoon,
  restoreDormant: faSun,
  generateOrder: faCartShopping,
  generateInvoice: faFileInvoice,
  checkout: faCashRegister,
  refund: faRotateLeft,
  viewReceipt: faReceipt,
  editCustomer: faUserPen,
  viewHistory: faClockRotateLeft,
  deleteCustomer: faTrashCan,
  createOrGenerateQuote: faFileCirclePlus,
} as const;

/** Quote / order / invoice editor page titles (Create vs Review). */
export type PosDocTitleKind = 'quote' | 'order' | 'invoice';

function iconForDocPageTitle(kind: PosDocTitleKind, mode: 'create' | 'review') {
  if (mode === 'create') {
    if (kind === 'quote') return faFileCirclePlus;
    if (kind === 'order') return faCartPlus;
    return faFileInvoice;
  }
  if (kind === 'quote') return faFileLines;
  if (kind === 'order') return faCartShopping;
  return faFileCircleCheck;
}

/** Large icon to the left of “Create Quote” / “Review Order” headings in {@link POSDocCreate}. */
export function PosDocTitleFa({
  kind,
  mode,
  className,
}: {
  kind: PosDocTitleKind;
  mode: 'create' | 'review';
  className?: string;
}) {
  return (
    <FontAwesomeIcon
      icon={iconForDocPageTitle(kind, mode)}
      className={cn('h-7 w-7 shrink-0 text-[#4a5568]', className)}
      aria-hidden
    />
  );
}

/** New vs edit customer form title (Customers page). */
export function PosCustomerFormTitleFa({ edit, className }: { edit: boolean; className?: string }) {
  return (
    <FontAwesomeIcon
      icon={edit ? faUserPen : faUserPlus}
      className={cn('h-7 w-7 shrink-0 text-[#4a5568]', className)}
      aria-hidden
    />
  );
}

/** POS list / settings page titles (Quotes, Orders, Email Configuration, etc.). */
export type PosListPageTitleKind =
  | 'quote-requests'
  | 'quotes'
  | 'orders'
  | 'invoices'
  | 'receipts'
  | 'refunds'
  | 'customers'
  | 'sent-emails'
  | 'email-settings'
  | 'billing'
  | 'customer-history';

function iconForPosListPage(kind: PosListPageTitleKind) {
  const map: Record<PosListPageTitleKind, IconDefinition> = {
    'quote-requests': faComments,
    quotes: faFileLines,
    orders: faCartShopping,
    invoices: faFileInvoice,
    receipts: faReceipt,
    refunds: faRotateLeft,
    customers: faUsers,
    'sent-emails': faEnvelopeOpenText,
    'email-settings': faServer,
    billing: faPercent,
    'customer-history': faClockRotateLeft,
  };
  return map[kind];
}

/** Icon to the left of main POS list / settings headings in {@link CMSDashboard}. */
export function PosListPageTitleFa({
  kind,
  className,
}: {
  kind: PosListPageTitleKind;
  className?: string;
}) {
  return (
    <FontAwesomeIcon
      icon={iconForPosListPage(kind)}
      className={cn('h-8 w-8 shrink-0 text-[#4a5568]', className)}
      aria-hidden
    />
  );
}

export function posListPageKindFromDocType(
  docType: 'quote' | 'order' | 'invoice' | 'receipt'
): PosListPageTitleKind {
  return { quote: 'quotes', order: 'orders', invoice: 'invoices', receipt: 'receipts' }[docType];
}
