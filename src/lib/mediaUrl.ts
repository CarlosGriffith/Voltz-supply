import { getApiBaseUrl } from '@/lib/api';

/**
 * Turn API-relative upload paths (`/uploads/...`) into absolute URLs when the SPA is on another
 * origin (e.g. Netlify + API on Render). Leaves `https:`, `data:`, `blob:` unchanged.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (url == null) return '';
  const s = String(url).trim();
  if (s === '') return '';
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  const base = getApiBaseUrl().replace(/\/$/, '');
  if (s.startsWith('/uploads/') || s.startsWith('/api/')) {
    return base ? `${base}${s}` : s;
  }
  return s;
}
