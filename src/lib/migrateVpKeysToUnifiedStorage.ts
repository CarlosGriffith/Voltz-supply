/**
 * One-time merge per session: copy `react-resizable-panels` / expand data from legacy
 * `__vp:m` / `__vp:d` keys into a single key per user (`base__cmsuser:…`) when unified is empty.
 * Prefer the bucket that matches the current viewport so mobile logins pick up mobile-adjusted layouts.
 */

const REACT_PREFIX = 'react-resizable-panels:';
const EXPAND_PREFIX = 'voltz-cms-pos-expand:';

const BASES = [
  'pos-quote-requests-panels-v3',
  'pos-doc-quote-panels-v1',
  'pos-doc-order-panels-v1',
  'pos-doc-invoice-panels-v1',
  'pos-doc-receipt-panels-v1',
  'pos-customers-panels-v1',
  'pos-refunds-panels-v1',
  'pos-sent-emails-panels-v1',
] as const;

const COMPACT_MQ = '(max-width: 1023px)';

function viewportIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(COMPACT_MQ).matches;
}

/**
 * Call during CMS dashboard render before PanelGroup / expand hooks read localStorage.
 */
export function migrateVpKeysToUnifiedStorage(username: string | null): void {
  if (typeof localStorage === 'undefined' || !username) return;
  const u = encodeURIComponent(username);
  const preferM = viewportIsMobile();

  for (const base of BASES) {
    const unifiedId = `${base}__cmsuser:${u}`;
    for (const prefix of [REACT_PREFIX, EXPAND_PREFIX]) {
      try {
        const unifiedKey = `${prefix}${unifiedId}`;
        if (localStorage.getItem(unifiedKey)) continue;

        const mKey = `${prefix}${base}__cmsuser:${u}__vp:m`;
        const dKey = `${prefix}${base}__cmsuser:${u}__vp:d`;
        const m = localStorage.getItem(mKey);
        const d = localStorage.getItem(dKey);
        const pick = preferM ? m || d : d || m;
        if (pick) localStorage.setItem(unifiedKey, pick);
      } catch {
        /* quota / private mode */
      }
    }
  }
}
