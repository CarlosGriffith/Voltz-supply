/**
 * Synchronously persist POS CMS table column % and right-edge expand to localStorage.
 * react-resizable-panels debounces saves (~100ms); flushing avoids losing the last drag on logout / tab close.
 * Keys match {@link CMSDashboard} `cmsPanelAutoSaveId` (per user + `__vp:m` / `__vp:d`).
 */

const REACT_PREFIX = 'react-resizable-panels:';
const EXPAND_PREFIX = 'voltz-cms-pos-expand:';

function colRange(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-col-${i}`);
}

/** Panel `id`s — must match DocListPanelHeader / PosListPanelHeaders / Quote Requests PanelGroup. */
export const POS_CMS_PANEL_IDS = {
  quoteRequests: [
    'pos-qr-col-customer',
    'pos-qr-col-product',
    'pos-qr-col-date',
    'pos-qr-col-status',
    'pos-qr-col-email',
    'pos-qr-col-actions',
  ],
  docQuote: colRange('pos-doc-quote', 7),
  docOrder: colRange('pos-doc-order', 6),
  docInvoice: colRange('pos-doc-invoice', 6),
  docReceipt: colRange('pos-doc-receipt', 8),
  customers: colRange('pos-customers', 6),
  refunds: colRange('pos-refunds', 7),
  sentEmails: colRange('pos-sent-emails', 6),
} as const;

function mergeLayoutForAutoSaveId(
  autoSaveId: string,
  panelIds: readonly string[],
  layout: number[]
): void {
  if (typeof localStorage === 'undefined' || !layout.length) return;
  if (layout.length !== panelIds.length) return;
  const panelKey = [...panelIds].sort((a, b) => a.localeCompare(b)).join(',');
  const storageKey = `${REACT_PREFIX}${autoSaveId}`;
  let state: Record<string, { layout: number[]; expandToSizes?: Record<string, number> }> = {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) state = JSON.parse(raw);
  } catch {
    state = {};
  }
  const prev = state[panelKey];
  state[panelKey] = {
    layout,
    expandToSizes: prev?.expandToSizes ?? {},
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function flushPosCmsTableLayouts(args: {
  tables: { autoSaveId: string; panelIds: readonly string[]; getLayout: () => number[] }[];
  expands: { storageKey: string; expandPx: number }[];
}): void {
  for (const t of args.tables) {
    const layout = t.getLayout();
    if (!layout.length) continue;
    mergeLayoutForAutoSaveId(t.autoSaveId, t.panelIds, layout);
  }
  for (const e of args.expands) {
    try {
      localStorage.setItem(`${EXPAND_PREFIX}${e.storageKey}`, String(e.expandPx));
    } catch {
      /* ignore */
    }
  }
}
