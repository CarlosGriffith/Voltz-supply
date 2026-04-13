import type { ContactDetails } from '@/contexts/CMSContext';
import { fmtCurrency, fmtDatePOS, safeNum } from '@/lib/utils';
import type { PrintDocProps } from './posPrintTypes';

/** CSS px per inch (CSSValues / browser coordinate space for print-related sizing). */
const CSS_PX_PER_IN = 96;
/** US Letter width 8.5in — popup, email body, and PDF capture use the same box width. */
export const QUOTATION_DOC_WIDTH_PX = Math.round(8.5 * CSS_PX_PER_IN);
/** Horizontal inset so tables and text do not run edge-to-edge (letter-style margins). */
export const QUOTATION_DOC_PADDING_H_PX = 40;
/** Bottom padding so footer line is not clipped in PDF capture. */
export const QUOTATION_DOC_PADDING_BOTTOM_PX = 48;
/**
 * US Letter height 11in at {@link CSS_PX_PER_IN} px/inch (~1056px).
 * Short quotes stretch the line-items block so the document reads as one page.
 */
export const QUOTATION_DOC_LETTER_MIN_HEIGHT_PX = Math.round(11 * CSS_PX_PER_IN);

/** Browser print (`mode: 'print'`): target page fill; line-items min derived after reserving header/footer. */
const PRINT_PAGE_FRACTION_SHORT = 0.75;
const PRINT_PAGE_FRACTION_LONG = 0.9;
/** Line count at or above this uses the long-list (90% letter) print target. */
const PRINT_LONG_LIST_MIN_ITEMS = 11;
const PRINT_HEADER_FOOTER_RESERVE_PX = 400;

/** Hairline rules (sub‑px where supported) — pure black. */
const BD = '#000000';
/** Light rule above signature block only (no box around approvals). */
const BD_MUTED = '#d1d5db';
/** Navy accent for title block + total rule (reference: dark headings). */
const NAVY = '#1a2332';

/** Same stack in preview, email body parent, and PDF capture. Inter loaded via preview head / PDF loader. */
export const QUOTATION_FONT_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeTitle(t: PrintDocProps['type']): string {
  return { quote: 'QUOTATION', order: 'SALES ORDER', invoice: 'INVOICE', receipt: 'RECEIPT', refund: 'REFUND' }[t];
}

function typeLabelShort(t: PrintDocProps['type']): string {
  return { quote: 'Quote', order: 'Order', invoice: 'Invoice', receipt: 'Receipt', refund: 'Refund' }[t];
}

function lineTaxFlag(
  item: PrintDocProps['items'][0],
  docTaxAmount: number,
  taxRate: number
): 'T' | 'B' {
  if (item.taxable === false) return 'B';
  if (item.taxable === true) return 'T';
  return docTaxAmount > 0 && taxRate > 0 ? 'T' : 'B';
}

function receiptDocLabelSortKey(label: string): [number, string] {
  const s = String(label || '').trim();
  const m = /^INV-(\d+)$/i.exec(s);
  if (m) return [parseInt(m[1], 10), s];
  if (!s) return [Number.POSITIVE_INFINITY, ''];
  return [Number.MAX_SAFE_INTEGER, s.toLowerCase()];
}

function compareReceiptDocLabelsForSort(a: string, b: string): number {
  const ka = receiptDocLabelSortKey(a);
  const kb = receiptDocLabelSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  return ka[1].localeCompare(kb[1]);
}

export function computeTaxableSplit(props: PrintDocProps): { taxable: number; nontaxable: number } {
  const tr = safeNum(props.taxRate);
  const ta = safeNum(props.taxAmount);
  const sub = safeNum(props.subtotal);
  const items = Array.isArray(props.items) ? props.items : [];
  if (items.some(i => i.taxable === true || i.taxable === false)) {
    let taxable = 0;
    let nontaxable = 0;
    for (const i of items) {
      if (i.taxable === false) nontaxable += safeNum(i.total);
      else taxable += safeNum(i.total);
    }
    return { taxable, nontaxable };
  }
  if (ta > 0 && tr > 0) return { taxable: sub, nontaxable: 0 };
  return { taxable: 0, nontaxable: sub };
}

function billBlock(p: PrintDocProps): string {
  const lines = [p.customerName, p.customerCompany, p.customerEmail, p.customerPhone].filter(
    (x) => x && String(x).trim()
  );
  return lines.map((l) => esc(String(l))).join('<br/>');
}

function shipBlock(p: PrintDocProps): string {
  if (p.shipToAddress?.trim()) return esc(p.shipToAddress.trim()).replace(/\n/g, '<br/>');
  return billBlock(p);
}

export function buildQuotationDocumentHtml(
  props: PrintDocProps,
  contact: ContactDetails,
  options: {
    mode: 'email' | 'print';
    companyName?: string;
    thinLinesForPdf?: boolean;
    /** POS modal iframe only: shorter page + line-items stretch (PDF always uses full letter). */
    previewLayout?: 'compact' | 'full';
  }
): string {
  const thinPdf = options.thinLinesForPdf === true;
  const previewCompact = !thinPdf && options.previewLayout === 'compact';
  /** Sent email HTML (`generateEmailHTML`) — not modal iframe (`previewLayout: 'compact'`) or PDF (`thinPdf`). */
  const isEmailBodyLineItems = !thinPdf && options.mode === 'email' && !previewCompact;
  const isPrint = options.mode === 'print';
  const lineItems = Array.isArray(props.items) ? props.items : [];
  const itemCount = lineItems.length;
  const printPageFraction =
    isPrint && !thinPdf
      ? itemCount >= PRINT_LONG_LIST_MIN_ITEMS
        ? PRINT_PAGE_FRACTION_LONG
        : PRINT_PAGE_FRACTION_SHORT
      : null;
  /** Hairline rules — one width everywhere so PDF (html2canvas) / email / print match. */
  const bw = '0.5px';
  /** Muted rules (e.g. above signatures) — same width as grid (color only differs). */
  const btMuted = bw;
  /** PDF: no grey fill (print-friendly); email/screen: subtle grey bar. */
  const metaBarCellBg = thinPdf ? '#ffffff' : '#f8f9fa';
  /** PDF quotes only: items table gets a `bw` outer frame; row/column rules use a finer line. */
  const isPdfQuote = thinPdf && props.type === 'quote';
  const bwItemsGrid = isPdfQuote ? '0.25px' : bw;

  const companyName = options.companyName || 'Voltz Industrial Supply';
  const title = typeTitle(props.type);
  const shortLabel = typeLabelShort(props.type);
  const addrLines = (contact.addresses ?? []).map((a) => esc(a.address)).join('<br/>');
  const phoneLine = (contact.phones ?? []).map((p) => esc(p.number)).join(' | ');
  const emailLine = (contact.emails ?? []).map((e) => esc(e.address)).join(' | ');
  const printed = fmtDatePOS(new Date());
  const quoteDateBar = fmtDatePOS(props.date);
  const split = computeTaxableSplit(props);
  const tr = safeNum(props.taxRate);
  const ta = safeNum(props.taxAmount);
  const disc = safeNum(props.discountAmount);
  const isReceipt = props.type === 'receipt';
  const receiptSettlement = props.receiptSettlementInvoices;
  const showReceiptSettlement =
    isReceipt && Array.isArray(receiptSettlement) && receiptSettlement.length > 1;

  const receiptLineInv = props.receiptLineInvoiceNumbers;
  const receiptRowsOrdered = (() => {
    const pairs = lineItems.map((item, rowIdx) => {
      const invLabel =
        isReceipt &&
        Array.isArray(receiptLineInv) &&
        receiptLineInv.length === lineItems.length
          ? String(receiptLineInv[rowIdx] ?? '').trim()
          : '';
      return { item, invLabel };
    });
    if (
      isReceipt &&
      Array.isArray(receiptLineInv) &&
      receiptLineInv.length === lineItems.length &&
      lineItems.length > 0
    ) {
      return [...pairs].sort((x, y) => compareReceiptDocLabelsForSort(x.invLabel, y.invLabel));
    }
    return pairs;
  })();

  const rows = receiptRowsOrdered
    .map(({ item, invLabel }) => {
      const flag = lineTaxFlag(item, ta, tr);
      const sku = item.part_number || item.product_id || '—';
      const itemNumInner = invLabel
        ? `<div style="line-height:1.25">${esc(invLabel)}:</div><div style="padding-left:12px;line-height:1.25">${esc(String(sku))}</div>`
        : esc(String(sku));
      const uom = item.uom?.trim() || 'EACH';
      const desc = esc(item.product_name);
      const c = 'class="voltz-qdoc-lineitem-cell"';
      return `<tr>
        <td ${c} style="padding:5px 6px;font-size:9px">${itemNumInner}</td>
        <td ${c} style="padding:5px 6px;font-size:9px">${desc}</td>
        <td ${c} style="padding:5px 6px;font-size:9px;text-align:right">${safeNum(item.quantity).toFixed(2)}</td>
        <td ${c} style="padding:5px 6px;font-size:9px;text-align:center">${esc(uom)}</td>
        <td ${c} style="padding:5px 6px;font-size:9px;text-align:right">${fmtCurrency(item.unit_price)}</td>
        <td ${c} style="padding:5px 6px;font-size:9px;text-align:right">${fmtCurrency(item.total)} <strong>${flag}</strong></td>
      </tr>`;
    })
    .join('');

  const termsDefault =
    'Prices valid for 14 days unless noted. Returns may be subject to restocking fees; custom-cut or special-order items may be non-returnable.';

  const outer =
    options.mode === 'print'
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)} ${esc(props.docNumber)}</title>`
      : '';

  const styles =
    options.mode === 'print'
      ? `<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box}
    body{font-family:${QUOTATION_FONT_STACK};color:#000;font-size:10px;margin:0;padding:24px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    @media print{@page{size:letter;margin:12mm}body{padding:0}}
    </style></head><body>`
      : '';

  const lineItemFillerCells = [1, 2, 3, 4, 5, 6]
    .map(
      () =>
        `<td class="voltz-qdoc-lineitem-filler-cell" style="padding:0;vertical-align:top;line-height:0;font-size:0">&nbsp;</td>`
    )
    .join('');

  /** PDF raster: fill td height and flex-center so short cells align when one column (e.g. Terms) wraps. */
  const pdfMetaCell = (html: string) =>
    thinPdf && !isPdfQuote
      ? `<div style="min-height:50px;height:100%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;line-height:1.35">${html}</div>`
      : html;

  /** PDF quote meta bar: shorter row, label/value stacked tight. */
  const pdfMetaCellQuote = (html: string) =>
    `<div style="min-height:34px;height:100%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box">${html}</div>`;

  const metaBarPair = (label: string, valueHtml: string) =>
    isPdfQuote
      ? pdfMetaCellQuote(
          `<strong style="display:block;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0;padding:0;line-height:1">${esc(label)}</strong><span style="display:block;font-size:9px;margin:0;padding:0;line-height:1.15;margin-top:1px">${valueHtml}</span>`
        )
      : pdfMetaCell(`<strong>${esc(label)}</strong><br/>${valueHtml}`);

  /** Email / modal / print: line-items block min height; print = ¾ letter (short list) or 90% (long list). PDF uses {@link thinLinesForPdf}. */
  const docLetterMinPx = thinPdf
    ? QUOTATION_DOC_LETTER_MIN_HEIGHT_PX
    : previewCompact
      ? Math.round(QUOTATION_DOC_LETTER_MIN_HEIGHT_PX / 2)
      : printPageFraction != null
        ? Math.round(QUOTATION_DOC_LETTER_MIN_HEIGHT_PX * printPageFraction)
        : QUOTATION_DOC_LETTER_MIN_HEIGHT_PX;
  const screenLineItemsBlockMinPx = previewCompact
    ? Math.max(180, Math.round((QUOTATION_DOC_LETTER_MIN_HEIGHT_PX - 400) / 2))
    : printPageFraction != null
      ? Math.max(
          120,
          Math.round(QUOTATION_DOC_LETTER_MIN_HEIGHT_PX * printPageFraction - PRINT_HEADER_FOOTER_RESERVE_PX)
        )
      : Math.max(320, QUOTATION_DOC_LETTER_MIN_HEIGHT_PX - 400);
  const screenItemsSectionStyle = `box-sizing:border-box;width:100%;display:grid;grid-template-rows:auto 1fr;align-content:stretch;flex:1 1 0;min-height:${screenLineItemsBlockMinPx}px;overflow:visible`;

  /** Desktop email body line-items min (before mobile ½-height override). */
  const emailBodyLineItemsMinDesktopPx = Math.max(320, QUOTATION_DOC_LETTER_MIN_HEIGHT_PX - 400);
  /** Sent-email items block: one hairline stroke on the outer TD only (four sides; inner grid stays inside). */
  const emailItemsOuterHairline = `0.5px solid ${BD}`;

  const itemsStretchStyle = thinPdf
    ? 'flex:1 1 0;min-height:160px;margin-bottom:14px;display:flex;flex-direction:column;width:100%;overflow:hidden'
    : 'flex:1 1 0;min-height:0;margin-bottom:14px;display:flex;flex-direction:column;width:100%;overflow:hidden';

  const inner = `
<div class="voltz-qdoc${thinPdf ? ' voltz-qdoc--pdf' : ''}${isPdfQuote ? ' voltz-qdoc--pdf-quote' : ''}${isPrint ? ' voltz-qdoc--print' : ''}${isEmailBodyLineItems ? ' voltz-qdoc--email-html' : ''}" style="box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;font-family:${QUOTATION_FONT_STACK};color:#000;font-size:10px;max-width:${QUOTATION_DOC_WIDTH_PX}px;min-height:${docLetterMinPx}px;margin:0 auto;line-height:1.4;padding:0 ${QUOTATION_DOC_PADDING_H_PX}px ${QUOTATION_DOC_PADDING_BOTTOM_PX}px;background:#fff;display:flex;flex-direction:column">
  <style type="text/css">
  /* Screen/modal line-items frame: 1px box. Email uses .voltz-qdoc-lineitems-email-wrap td for the frame (see below). */
  .voltz-qdoc-lineitems-section--screen {
    border: 1px solid ${BD} !important;
  }
  /* Gmail/desktop clients often drop the bottom edge of borders on grid/flex divs; outer TD keeps all four sides. */
  .voltz-qdoc-lineitems-email-wrap .voltz-qdoc-lineitems-section--screen {
    border: none !important;
  }
  /* Email body (desktop + mobile): single hairline frame — TD only; no second box from inner div/table. */
  .voltz-qdoc--email-html .voltz-qdoc-lineitems-email-wrap {
    border: 0 !important;
    margin: 0 !important;
  }
  .voltz-qdoc--email-html .voltz-qdoc-lineitems-email-wrap td.voltz-qdoc-lineitems-email-frame {
    border: ${emailItemsOuterHairline} !important;
  }
  .voltz-qdoc--email-html .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems {
    border: 0 !important;
  }
  /* Line items: vertical rules only — no horizontal rules between item rows (Quotes / Orders / Invoices / Receipts). */
  .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell {
    border-top: none !important;
    border-bottom: none !important;
    border-left: ${bwItemsGrid} solid ${BD} !important;
    border-right: ${bwItemsGrid} solid ${BD} !important;
  }
  .voltz-qdoc-lineitems tbody tr:last-child td.voltz-qdoc-lineitem-cell {
    border-bottom: ${bwItemsGrid} solid ${BD} !important;
  }
  /* PDF (all doc types): bottom rule is the frame — not a line under the last item row. */
  .voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems tbody tr:last-child td.voltz-qdoc-lineitem-cell {
    border-bottom: none !important;
  }
  /* Email + modal: one outer box — inner cells do not draw the outer edge (wrapper border = full right + bottom). */
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems tbody tr:last-child td.voltz-qdoc-lineitem-cell {
    border-bottom: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems thead th {
    border-top: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems thead th:first-child {
    border-left: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems thead th:last-child {
    border-right: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell:first-child {
    border-left: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell:last-child {
    border-right: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell {
    border-bottom: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell:first-child {
    border-left: none !important;
  }
  .voltz-qdoc-lineitems-section--screen .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell:last-child {
    border-right: none !important;
  }
  .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell {
    border-top: none !important;
    border-bottom: none !important;
    border-left: ${bwItemsGrid} solid ${BD} !important;
    border-right: ${bwItemsGrid} solid ${BD} !important;
  }
  .voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell {
    border-left: none !important;
    border-right: ${bwItemsGrid} solid ${BD} !important;
  }
  .voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell:last-child {
    border-right: none !important;
  }
  ${thinPdf && !isPdfQuote ? `.voltz-qdoc--pdf .voltz-qdoc-meta-row > tbody > tr > td { vertical-align: middle !important; padding-top: 6px !important; padding-bottom: 6px !important; }` : ''}
  ${isPdfQuote ? `.voltz-qdoc--pdf-quote .voltz-qdoc-meta-row > tbody > tr > td { vertical-align: middle !important; padding: 4px 6px !important; }` : ''}
  ${
    thinPdf
      ? `.voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems thead th {
    border-top: none !important;
    border-left: none !important;
    border-right: ${bwItemsGrid} solid ${BD} !important;
    border-bottom: ${bwItemsGrid} solid ${BD} !important;
  }
  .voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems thead th:last-child {
    border-right: none !important;
  }
  .voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell {
    border-left: none !important;
    border-right: ${bwItemsGrid} solid ${BD} !important;
  }
  .voltz-qdoc--pdf .voltz-qdoc-lineitems-frame .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell:last-child {
    border-right: none !important;
  }`
      : ''
  }
  ${
    isEmailBodyLineItems
      ? `@media only screen and (max-width: 600px) {
    .voltz-qdoc--email-html {
      min-height: ${Math.round(QUOTATION_DOC_LETTER_MIN_HEIGHT_PX / 2)}px !important;
    }
    .voltz-qdoc--email-html .voltz-qdoc-lineitems-section--screen {
      min-height: ${Math.max(160, Math.round(emailBodyLineItemsMinDesktopPx / 2))}px !important;
    }
  }
  @media only screen and (min-width: 601px) {
    /* Desktop email: no left border on any inner cell (avoids stacked lines with the frame). */
    .voltz-qdoc--email-html .voltz-qdoc-lineitems thead th,
    .voltz-qdoc--email-html .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell,
    .voltz-qdoc--email-html .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell {
      border-left: none !important;
      border-left-width: 0 !important;
    }
    /* Interior column rules use right edges only so the left outline is solely the outer TD. */
    .voltz-qdoc--email-html .voltz-qdoc-lineitems thead th:not(:last-child),
    .voltz-qdoc--email-html .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell:not(:last-child),
    .voltz-qdoc--email-html .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell:not(:last-child) {
      border-right: ${bwItemsGrid} solid ${BD} !important;
    }
    .voltz-qdoc--email-html .voltz-qdoc-lineitems thead th:last-child,
    .voltz-qdoc--email-html .voltz-qdoc-lineitems tbody td.voltz-qdoc-lineitem-cell:last-child,
    .voltz-qdoc--email-html .voltz-qdoc-lineitems-filler td.voltz-qdoc-lineitem-filler-cell:last-child {
      border-right: none !important;
    }
    /* Single left (and full) frame — one stroke on four sides from the wrapper cell only. */
    .voltz-qdoc--email-html .voltz-qdoc-lineitems-email-wrap td.voltz-qdoc-lineitems-email-frame {
      border-left: ${emailItemsOuterHairline} !important;
      border-right: ${emailItemsOuterHairline} !important;
      border-top: ${emailItemsOuterHairline} !important;
      border-bottom: ${emailItemsOuterHairline} !important;
    }
  }`
      : ''
  }
  </style>
  <div style="flex:0 0 auto">
  <table style="width:100%;table-layout:fixed;border-collapse:collapse;margin-bottom:12px">
    <tr>
      <td style="vertical-align:top;width:58%">
        <table role="presentation" align="left" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;width:auto;max-width:100%">
          <tr>
            <td style="padding:0;vertical-align:top;font-size:18px;font-weight:800;color:${NAVY};letter-spacing:-0.02em;text-align:left;line-height:1.2">${esc(companyName)}</td>
          </tr>
          <tr>
            <td style="padding:2px 0 0 0;vertical-align:top;font-size:14px;font-weight:800;font-style:italic;color:${NAVY};line-height:1.25;letter-spacing:0.02em;opacity:0.95;text-align:center">\u201CPlugg into Us\u201D</td>
          </tr>
          <tr>
            <td style="padding:14px 0 0 6px;vertical-align:top;text-align:left;font-size:9px;color:#000;line-height:1.5;opacity:0.92">${addrLines}<br/>${phoneLine}<br/>${emailLine}</td>
          </tr>
        </table>
      </td>
      <td style="vertical-align:top;text-align:right;width:42%">
        <div style="font-size:20px;font-weight:800;color:${NAVY};letter-spacing:-0.02em">${title}</div>
        <table style="margin-left:auto;margin-top:6px;font-size:9px;color:#000">
          <tr><td style="text-align:right;padding:2px 8px">Date:</td><td style="text-align:left">${esc(quoteDateBar)}</td></tr>
          <tr><td style="text-align:right;padding:2px 8px">Page:</td><td style="text-align:left">Page 1 of 1</td></tr>
          <tr><td style="text-align:right;padding:2px 8px">${esc(shortLabel)} #:</td><td style="text-align:left;font-weight:700">${esc(props.docNumber)}</td></tr>
          <tr><td style="text-align:right;padding:2px 8px;white-space:nowrap">Printed:</td><td style="text-align:left">${esc(printed)}</td></tr>
          ${props.taxRegistrationNo ? `<tr><td style="text-align:right;padding:2px 8px">GCT REG:</td><td style="text-align:left">${esc(props.taxRegistrationNo)}</td></tr>` : ''}
        </table>
      </td>
    </tr>
  </table>

  <table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;margin:0;padding:0">
    <tr>
      <td width="48%" style="width:48%;vertical-align:top;border:${bw} solid ${BD};padding:8px 10px">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px;color:#000">Bill To</div>
        <div style="font-size:9px">${billBlock(props)}</div>
      </td>
      <td width="14" style="width:14px;min-width:14px;border:0;padding:0;font-size:0;line-height:0;vertical-align:top">&nbsp;</td>
      <td width="48%" style="width:48%;vertical-align:top;border:${bw} solid ${BD};padding:8px 10px">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px;color:#000">Ship To</div>
        <div style="font-size:9px">${shipBlock(props)}</div>
      </td>
    </tr>
  </table>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0;padding:0"><tr><td style="height:14px;line-height:14px;font-size:0;border:0;padding:0">&nbsp;</td></tr></table>

  <table class="voltz-qdoc-meta-row" style="width:100%;table-layout:fixed;border-collapse:collapse;margin:0;font-size:9px">
    <tr>
      <td style="border:${bw} solid ${BD};padding:8px 6px;background:${metaBarCellBg};vertical-align:middle">${metaBarPair(`${shortLabel} Date`, esc(quoteDateBar))}</td>
      <td style="border:${bw} solid ${BD};padding:8px 6px;background:${metaBarCellBg};vertical-align:middle">${metaBarPair('PO No.', props.poNumber ? esc(props.poNumber) : '—')}</td>
      <td style="border:${bw} solid ${BD};padding:8px 6px;background:${metaBarCellBg};vertical-align:middle">${metaBarPair('Cust No.', props.customerAccountNo ? esc(props.customerAccountNo) : '—')}</td>
      <td style="border:${bw} solid ${BD};padding:8px 6px;background:${metaBarCellBg};vertical-align:middle">${metaBarPair('Terms', esc(props.terms || 'Net 30'))}</td>
      <td style="border:${bw} solid ${BD};padding:8px 6px;background:${metaBarCellBg};vertical-align:middle">${metaBarPair('Entered by', props.enteredBy ? esc(props.enteredBy) : '—')}</td>
      <td style="border:${bw} solid ${BD};padding:8px 6px;background:${metaBarCellBg};vertical-align:middle">${metaBarPair('Salesperson', props.salesperson ? esc(props.salesperson) : 'House Account')}</td>
    </tr>
  </table>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0;padding:0"><tr><td style="height:14px;line-height:14px;font-size:0;border:0;padding:0">&nbsp;</td></tr></table>
  </div>

  <div class="voltz-qdoc-items-stretch" style="${itemsStretchStyle}">
  ${thinPdf ? `<div class="voltz-qdoc-lineitems-frame" style="flex:1 1 0;min-height:0;display:grid;grid-template-rows:auto 1fr;align-content:stretch;width:100%;box-sizing:border-box;border:${bw} solid ${BD};overflow:hidden">` : ''}
  ${!thinPdf && isEmailBodyLineItems ? `<table class="voltz-qdoc-lineitems-email-wrap" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;table-layout:fixed;border:0;margin:0"><tr><td class="voltz-qdoc-lineitems-email-frame" style="padding:0;vertical-align:top;border:${emailItemsOuterHairline}">` : ''}
  ${!thinPdf ? `<div class="voltz-qdoc-lineitems-section voltz-qdoc-lineitems-section--screen" style="${screenItemsSectionStyle}">` : ''}
  <table class="voltz-qdoc-lineitems" style="width:100%;table-layout:fixed;border-collapse:collapse;margin:0">
    <colgroup>
      <col style="width:11%" />
      <col style="width:38%" />
      <col style="width:9%" />
      <col style="width:9%" />
      <col style="width:15%" />
      <col style="width:18%" />
    </colgroup>
    <thead>
      <tr style="background:#fff;color:${NAVY}">
        <th style="padding:6px 5px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;border:${bwItemsGrid} solid ${BD}">Item #</th>
        <th style="padding:6px 5px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;border:${bwItemsGrid} solid ${BD}">Description</th>
        <th style="padding:6px 5px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:right;border:${bwItemsGrid} solid ${BD}">Qty</th>
        <th style="padding:6px 5px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:center;border:${bwItemsGrid} solid ${BD}">UOM</th>
        <th style="padding:6px 5px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:right;border:${bwItemsGrid} solid ${BD}">Unit Price</th>
        <th style="padding:6px 5px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:right;border:${bwItemsGrid} solid ${BD}">Net Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="min-height:0;height:100%;width:100%;box-sizing:border-box">
  <table class="voltz-qdoc-lineitems-filler" style="width:100%;height:100%;table-layout:fixed;border-collapse:collapse;margin:0">
    <colgroup>
      <col style="width:11%" />
      <col style="width:38%" />
      <col style="width:9%" />
      <col style="width:9%" />
      <col style="width:15%" />
      <col style="width:18%" />
    </colgroup>
    <tbody>
      <tr style="height:100%">
        ${lineItemFillerCells}
      </tr>
    </tbody>
  </table>
  </div>
  ${!thinPdf ? `</div>` : ''}
  ${!thinPdf && isEmailBodyLineItems ? `</td></tr></table>` : ''}
  ${thinPdf ? `</div>` : ''}
  </div>

  <div style="flex:0 0 auto">
  <table style="width:100%;table-layout:fixed;margin-bottom:12px;border-collapse:collapse"><tr>
    <td style="width:55%;vertical-align:top;padding:0 14px 0 0;box-sizing:border-box">
      <div style="min-height:64px;padding:8px 10px;font-size:9px;border:${bw} solid ${BD};box-sizing:border-box;background:#fff">
        <strong>Comments:</strong><br/>${props.notes ? esc(props.notes).replace(/\n/g, '<br/>') : '&nbsp;'}
      </div>
      <div style="margin-top:10px;font-size:8px;color:#000;line-height:1.45;opacity:0.9;padding:0 2px 0 0">
        <strong>Terms &amp; conditions</strong><br/>
        ${esc(termsDefault)}<br/><br/>
        <strong>Legend:</strong> <strong>B</strong> = non-taxable line, <strong>T</strong> = taxable line (GCT).
      </div>
    </td>
    <td style="width:45%;vertical-align:top;padding:8px 0 0 0;box-sizing:border-box">
      <table style="width:100%;font-size:9px;border-collapse:collapse;table-layout:fixed;color:#000">
        ${ta > 0 ? `<tr><td style="padding:3px 0;text-align:right">Taxable Subtotal:</td><td style="padding:3px 0;text-align:right;width:38%">${fmtCurrency(split.taxable)}</td></tr>` : ''}
        ${split.nontaxable > 0 ? `<tr><td style="padding:3px 0;text-align:right">Non-taxable Subtotal:</td><td style="padding:3px 0;text-align:right">${fmtCurrency(split.nontaxable)}</td></tr>` : ''}
        <tr><td style="padding:3px 0;text-align:right;border-top:${bw} solid ${BD}"><strong>Subtotal</strong></td><td style="padding:3px 0;text-align:right;border-top:${bw} solid ${BD}"><strong>${fmtCurrency(props.subtotal)}</strong></td></tr>
        ${ta > 0 ? `<tr><td style="padding:3px 0;text-align:right">Total GCT (${tr}%):</td><td style="padding:3px 0;text-align:right">${fmtCurrency(ta)}</td></tr>` : ''}
        ${disc > 0 ? `<tr><td style="padding:3px 0;text-align:right">Discount:</td><td style="padding:3px 0;text-align:right">-${fmtCurrency(disc)}</td></tr>` : ''}
        <tr><td style="padding:6px 0 3px;text-align:right;font-size:12px;font-weight:700;border-top:${bw} solid ${NAVY}"><strong>Total Amount</strong></td><td style="padding:6px 0 3px;text-align:right;font-size:12px;font-weight:700;border-top:${bw} solid ${NAVY}"><strong>$${fmtCurrency(props.total)}</strong></td></tr>
        ${
          showReceiptSettlement
            ? receiptSettlement!
                .map((row, idx) => {
                  const invLabel = esc(String(row.invoiceNumber || 'Invoice'));
                  const ord = row.orderNumber ? ` · Order ${esc(String(row.orderNumber))}` : '';
                  const meta =
                    idx > 0
                      ? `<div style="font-size:8px;line-height:1.35;margin-top:4px;color:#000;opacity:0.95;text-align:right">${[
                          row.customerName,
                          row.customerEmail,
                          row.customerPhone,
                        ]
                          .filter((x) => x && String(x).trim())
                          .map((x) => esc(String(x).trim()))
                          .join(' · ')}</div>`
                      : '';
                  return `<tr><td style="padding:4px 0 0;text-align:right;font-size:9px;vertical-align:top"><strong>${invLabel}</strong>${ord}<br/><span style="font-size:8px;font-weight:400">Document total</span></td><td style="padding:4px 0 0;text-align:right;font-size:9px;vertical-align:top"><strong>$${fmtCurrency(safeNum(row.documentTotal))}</strong>${meta}</td></tr>
                  <tr><td style="padding:2px 0 4px;text-align:right;font-size:8px;border-bottom:${bw} solid ${BD_MUTED}">Applied on this receipt</td><td style="padding:2px 0 4px;text-align:right;font-size:8px;border-bottom:${bw} solid ${BD_MUTED}">$${fmtCurrency(safeNum(row.amountAppliedThisReceipt))}</td></tr>`;
                })
                .join('')
            : ''
        }
        ${
          isReceipt
            ? `<tr><td style="padding:5px 0 2px;text-align:right;font-size:16px;font-weight:700;line-height:1.2"><strong>Amount Received</strong></td><td style="padding:5px 0 2px;text-align:right;font-size:16px;font-weight:700;line-height:1.2"><strong>$${fmtCurrency(safeNum(props.amountReceivedTender ?? props.amountPaid))}</strong></td></tr>`
            : ''
        }
      </table>
    </td>
  </tr></table>

  <table style="width:100%;table-layout:fixed;font-size:8px;margin-top:20px;border-top:${btMuted} solid ${BD_MUTED};padding-top:18px;border-collapse:separate;border-spacing:10px 0">
    <tr>
      <td style="width:33%;vertical-align:top;padding:0 4px">
        <div style="font-weight:700;margin-bottom:5px">Approved By:</div>
        <div style="min-height:26px;border-bottom:${bw} solid ${BD}"></div>
      </td>
      <td style="width:33%;vertical-align:top;padding:0 4px">
        <div style="font-weight:700;margin-bottom:5px">Checked By:</div>
        <div style="min-height:26px;border-bottom:${bw} solid ${BD}"></div>
      </td>
      <td style="width:34%;vertical-align:top;padding:0 4px">
        <div style="font-weight:700;margin-bottom:5px">Received By:</div>
        <div style="min-height:26px;border-bottom:${bw} solid ${BD}"></div>
      </td>
    </tr>
  </table>
  <div style="text-align:center;font-size:8px;color:#000;margin-top:16px;padding:0 4px 12px;line-height:1.45;word-wrap:break-word;opacity:0.75">${esc(companyName)} — ${esc(phoneLine)}</div>
  </div>
</div>`;

  const printScript =
    options.mode === 'print'
      ? `<script>window.onload=function(){window.print()}</script></body></html>`
      : '';

  if (options.mode === 'print') return outer + styles + inner + printScript;
  return inner;
}

/**
 * Full document for iframe `srcDoc` so the preview matches a real page (margins, font smoothing cascade).
 * Pass the fragment from `buildQuotationDocumentHtml` (email mode).
 */
export function buildQuotationPreviewSrcDoc(fragmentHtml: string): string {
  const outer = `<div class="voltz-qdoc-outer" style="box-sizing:border-box;margin:0;padding:0;background:#fff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;font-family:${QUOTATION_FONT_STACK}">${fragmentHtml}</div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"/><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${outer}</body></html>`;
}

/** Same outer shell as the iframe body, for off-screen PDF capture in the main document (pair with `.voltz-qdoc`). */
export function wrapQuotationFragmentForPdfMount(fragmentHtml: string): string {
  return `<div class="voltz-qdoc-outer" style="box-sizing:border-box;margin:0;padding:0;background:#fff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;font-family:${QUOTATION_FONT_STACK}">${fragmentHtml}</div>`;
}

export function buildEmailWrapperHtml(documentBodyHtml: string, shortLabel: string): string {
  return `<div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f4f5;padding:20px 16px">
  <div style="max-width:${QUOTATION_DOC_WIDTH_PX}px;margin:0 auto;background:#fff;padding:24px 28px 28px;border:1px solid #e5e7eb;border-radius:8px">
    <p style="font-size:14px;color:#333;margin:0 0 16px">Dear Customer,</p>
    <p style="font-size:13px;color:#555;margin:0 0 16px">Please find your <strong>${esc(shortLabel)}</strong> below. A PDF copy is attached for your records.</p>
    <div style="border-top:1px solid #eee;padding-top:16px;margin-top:8px">
      ${documentBodyHtml}
    </div>
  </div>
</div>`;
}
