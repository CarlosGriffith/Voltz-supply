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
  const ct = res.headers.get('content-type');
  if (ct?.includes('application/json')) return res.json();
  const text = await res.text();
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

/** Use when apiGet must yield a JSON array; null / non-array bodies become []. */
export function ensureArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
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
