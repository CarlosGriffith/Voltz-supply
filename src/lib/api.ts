type VoltzWindow = Window & { __VOLTZ_API_ORIGIN__?: string };

/** True when optional cross-origin fallback meta may apply (non-localhost, not already on *.netlify.app). */
function shouldUseNetlifyFallbackHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return false;
  if (h.endsWith('.netlify.app')) return false;
  return true;
}

/** Only if `<meta name="voltz-api-fallback-origin" content="https://...">` is set (e.g. split AWS + Netlify). */
function resolvedNetlifyFallbackOrigin(): string {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector('meta[name="voltz-api-fallback-origin"]');
  if (!el) return '';
  const raw = el.getAttribute('content');
  if (raw !== null && String(raw).trim() === '') return '';
  const t = String(raw ?? '').trim();
  return t ? t.replace(/\/$/, '') : '';
}

/**
 * When `VITE_API_URL` points at `*.netlify.app` but the page is on another host (custom domain),
 * ignore it so `/api` stays same-origin — Netlify routes `/api` on that domain too (avoids CSP / Failed to fetch).
 */
function shouldIgnoreViteApiUrlForSameNetlifySite(): boolean {
  if (typeof window === 'undefined') return false;
  const v = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (!v) return false;
  try {
    const api = new URL(v);
    if (!api.hostname.endsWith('.netlify.app')) return false;
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return false;
    // Any hostname that is not already the netlify.app API host should use same-origin /api.
    return api.hostname !== h;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  const fromVite = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (fromVite && !shouldIgnoreViteApiUrlForSameNetlifySite()) {
    return fromVite.replace(/\/$/, '');
  }

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

  // Custom domains: meta fallback when /api is not routed on the marketing host. Must not be gated by
  // shouldIgnoreViteApiUrlForSameNetlifySite — if VITE_API_URL points at *.netlify.app we skip the Vite
  // branch above but still need this fallback (otherwise base stays '' and /api returns the SPA HTML).
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
          ? ' Start the API (npm run dev:api) and use npm run dev:full, or open /api/health on your deployed host (JSON).'
          : ' Cross-origin fetch blocked? Your page CSP connect-src must include this API host, or use same-origin /api (clear voltz-api-fallback-origin and attach the domain in Netlify). Check CORS, ad blockers, HTTPS.';
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
        'Same-origin /api returned the SPA (HTML) instead of JSON — this host is not routing /api to Netlify Functions. Point the domain to Netlify (DNS), or set voltz-api-fallback-origin in index.html to your *.netlify.app URL (repo default: https://voltz-supply.netlify.app).'
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
      detail = `${msg}. Likely CSP connect-src: allow this API origin, or leave voltz-api-fallback-origin empty and use same-origin /api (Netlify custom domain + DNS). Ad blockers / HTTPS can also cause this.`;
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
