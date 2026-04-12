/**
 * Parse `pos_quote_requests.product` + `.quantity` saved from the public quote form
 * (see QuoteRequest.tsx: numbered lines, optional "— Qty: n", pipe-separated quantities).
 */

export type WebsiteRequestLine = {
  name: string;
  qty: number;
};

export function parseWebsiteQuoteRequestLines(
  productField: string,
  quantityField: string
): WebsiteRequestLine[] {
  const blob = (productField || '').trim();
  if (!blob) return [];

  const lines = blob.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const qtyFromPipe = (quantityField || '')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const out: WebsiteRequestLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\d+\.\s*/, '');
    let qty = 1;

    const inline = line.match(/\s*[—–-]\s*Qty:\s*([\d.]+)\s*$/i);
    if (inline) {
      const q = Math.floor(Number(inline[1]));
      if (Number.isFinite(q) && q >= 1) qty = q;
      line = line.replace(/\s*[—–-]\s*Qty:\s*[\d.]+\s*$/i, '').trim();
    } else if (qtyFromPipe.length > i) {
      const q = parseInt(qtyFromPipe[i], 10);
      if (Number.isFinite(q) && q >= 1) qty = q;
    }

    const name = line.trim();
    if (name) out.push({ name, qty });
  }

  return out;
}

/** `category` on the request is comma-separated category slugs (one or more per form). */
export function categorySlugForWebsiteLine(categoryField: string, lineIndex: number): string | undefined {
  const parts = (categoryField || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts[lineIndex] ?? parts[0];
}
