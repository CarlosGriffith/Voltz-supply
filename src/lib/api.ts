const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof TypeError) {
      const hint =
        API_BASE === ''
          ? ' Start the API (npm run dev:api) and open the app from the Vite dev server (npm run dev on port 8000), or run npm run dev:full.'
          : ' If you use VITE_API_URL, its host must match how you open the site (e.g. do not mix localhost vs 127.0.0.1 vs a LAN IP), or leave VITE_API_URL unset so /api is proxied.';
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
  const base = import.meta.env.VITE_API_URL ?? '';
  try {
    const r = await fetch(`${base}/api/health?db=1`);
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
        'The API returned the website HTML instead of JSON. Common causes: (1) CloudFront SPA rewrite sending /api/* to index.html — update cloudfront-function.js to skip /api/* and redeploy the function; (2) static hosting with no API — use Netlify (with netlify.toml /api rewrite) or add a CloudFront behavior/origin for /api.'
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
    return {
      reachable: false,
      dbOk: false,
      error: e instanceof Error ? e.message : String(e),
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
