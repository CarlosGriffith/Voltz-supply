type VoltzWindow = Window & { __VOLTZ_API_ORIGIN__?: string };

/** Default Netlify API host when the page is not on *.netlify.app (custom domain may still serve /api as HTML until DNS is correct). */
const DEFAULT_NETLIFY_API_FALLBACK = 'https://voltz-supply.netlify.app';

/** True when we should prefer the Netlify *.netlify.app host for /api (custom domain / wrong routing). */
function shouldUseNetlifyFallbackHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return false;
  if (h.endsWith('.netlify.app')) return false;
  return true;
}

/**
 * Optional second meta: when set (default), same-origin /api is skipped for API calls on custom domains
 * so requests hit Netlify Functions. Set `content=""` on that meta to opt out (e.g. same-origin /api proxy).
 */
function resolvedNetlifyFallbackOrigin(): string {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector('meta[name="voltz-api-fallback-origin"]');
  if (el) {
    const raw = el.getAttribute('content');
    if (raw !== null && String(raw).trim() === '') return '';
    const t = String(raw ?? '').trim();
    if (t) return t.replace(/\/$/, '');
  }
  return DEFAULT_NETLIFY_API_FALLBACK.replace(/\/$/, '');
}

/**
 * Base URL for API calls (no trailing slash). Empty = same origin.
 * Use when the SPA is on a different host than the API (e.g. AWS S3 + Amazon CloudFront → Netlify API):
 * 1) Build with `VITE_API_URL=https://your-site.netlify.app`, or
 * 2) Set `<meta name="voltz-api-origin" content="https://your-site.netlify.app" />` in index.html, or
 * 3) `window.__VOLTZ_API_ORIGIN__ = 'https://your-site.netlify.app'` before the app bundle loads.
 *
 * On a **custom domain** (not `*.netlify.app`), if `voltz-api-origin` is empty, we use
 * `voltz-api-fallback-origin` (default `https://voltz-supply.netlify.app`) so `/api` hits Netlify even when
 * the apex domain still returns the SPA for `/api/*`. Opt out with `<meta name="voltz-api-fallback-origin" content="" />`.
 */
export function getApiBaseUrl(): string {
  const fromVite = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (fromVite) return fromVite.replace(/\/$/, '');

  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="voltz-api-origin"]');
    const c = meta?.getAttribute('content')?.trim();
    if (c) return c.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const w = window as VoltzWindow;
    const o = String(w.__VOLTZ_API_ORIGIN__ ?? '').trim();
    if (o) return o.replace(/\/$/, '');
  }

  if (shouldUseNetlifyFallbackHost()) {
    const fb = resolvedNetlifyFallbackOrigin();
    if (fb) return fb;
  }

  return '';
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  try {
    return await fetch(url, {
      ...init,
      mode: 'cors',
      credentials: 'omit',
    });
  } catch (e) {
    if (e instanceof TypeError) {
      const hint =
        base === ''
          ? ' Start the API (npm run dev:api) and open the app from the Vite dev server (npm run dev on port 8000), or run npm run dev:full.'
          : ' Cross-origin: ensure the API (Netlify) allows CORS (redeploy server), and your site’s Content-Security-Policy includes connect-src https://voltz-supply.netlify.app (or remove CSP connect-src restrictions). Ad blockers can also block *.netlify.app.';
      throw new Error(`Cannot reach the server (${url}).${hint}`);
    }
    throw e;
  }
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const t = await res.text();
    let msg = t || res.statusText || String(res.status);
    try {
      const j = JSON.parse(t) as { error?: string };
      if (typeof j?.error === 'string' && j.error.trim()) msg = j.error;
    } catch {
      /* plain text / HTML error body */
    }
    throw new Error(msg);
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return res.json();
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/** Use when apiGet must yield a JSON array; null / non-array bodies become []. */
export function ensureArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['data', 'rows', 'results', 'items']) {
      const v = o[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

/** Lightweight check for CMS/POS bootstrap — does not throw. */
export async function getApiHealthDb(): Promise<{
  reachable: boolean;
  dbOk: boolean;
  error?: string;
}> {
  const base = getApiBaseUrl();
  try {
    const r = await fetch(`${base}/api/health?db=1`, { mode: 'cors', credentials: 'omit' });
    const text = await r.text();
    let j: {
      ok?: boolean;
      db?: string;
      error?: string;
      code?: string;
      errno?: number;
      sqlState?: string;
    } = {};
    try {
      j = JSON.parse(text) as typeof j;
    } catch {
      /* non-JSON body (e.g. HTML error page) */
    }
    const looksLikeHtml =
      /^\s*<!DOCTYPE/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500));
    const dbOk = r.ok && j.ok !== false && j.db === 'ok' && !looksLikeHtml;
    const parts: string[] = [];
    if (typeof j.error === 'string' && j.error.trim()) parts.push(j.error.trim());
    if (j.code && j.code !== 'ENV_MISSING_PASSWORD') parts.push(`(${j.code})`);
    if (!dbOk && looksLikeHtml) {
      parts.push(
        'Same-origin /api returned the SPA (HTML) instead of JSON — the hostname you opened is not routing /api to Netlify Functions. Point the domain to Netlify (Domain management + DNS), or rely on voltz-api-fallback-origin in index.html (defaults to https://voltz-supply.netlify.app).'
      );
    } else if (!dbOk && parts.length === 0 && text.trim()) {
      parts.push(text.trim().slice(0, 400));
    }
    if (!dbOk && parts.length === 0) {
      parts.push(`HTTP ${r.status} ${r.statusText || ''}`.trim());
    }
    return {
      reachable: true,
      dbOk,
      error: !dbOk ? parts.join(' ') : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNetwork =
      /failed to fetch|networkerror|load failed/i.test(msg) || e instanceof TypeError;
    const crossOrigin = Boolean(base);
    let detail = msg;
    if (isNetwork && crossOrigin) {
      detail = `${msg}. Likely causes: CSP on your page (add connect-src ${base} https:), CORS (redeploy after server update), mixed HTTP/HTTPS, or an ad blocker blocking netlify.app.`;
    } else if (isNetwork && !crossOrigin) {
      detail = `${msg}. Start the API (npm run dev:api) and use the Vite dev server, or open the app on Netlify.`;
    }
    return {
      reachable: false,
      dbOk: false,
      error: detail,
    };
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return handleResponse(await apiFetch(path)) as Promise<T>;
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  return handleResponse(await apiFetch(path, init)) as Promise<T>;
}

export async function apiPatch<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  return handleResponse(
    await apiFetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  ) as Promise<T>;
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  return handleResponse(await apiFetch(path, { method: 'DELETE' })) as Promise<T>;
}

/** Multipart upload; field name must match server (`file` or `document`). */
export async function apiUploadFile(
  path: string,
  file: File | Blob,
  fieldName: string,
  fileName?: string
): Promise<{ url: string }> {
  const fd = new FormData();
  if (file instanceof Blob && !(file instanceof File) && fileName) {
    fd.append(fieldName, file, fileName);
  } else {
    fd.append(fieldName, file as File);
  }
  return handleResponse(await apiFetch(path, { method: 'POST', body: fd })) as Promise<{
    url: string;
  }>;
}
