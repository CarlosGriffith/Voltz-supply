import { loadContactDetails } from '@/contexts/CMSContext';
import { fmtCurrency, fmtDatePOS, safeNum } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { PrintDocProps } from './posPrintTypes';
import {
  buildQuotationDocumentHtml,
  computeTaxableSplit,
  QUOTATION_DOC_WIDTH_PX,
  wrapQuotationFragmentForPdfMount,
} from './quotationHtml';

function typeTitle(t: PrintDocProps['type']): string {
  return { quote: 'QUOTATION', order: 'SALES ORDER', invoice: 'INVOICE', receipt: 'RECEIPT', refund: 'REFUND' }[t];
}

function typeShort(t: PrintDocProps['type']): string {
  return { quote: 'Quote', order: 'Order', invoice: 'Invoice', receipt: 'Receipt', refund: 'Refund' }[t];
}

function lineFlag(
  item: PrintDocProps['items'][0],
  docTax: number,
  tr: number
): string {
  if (item.taxable === false) return 'B';
  if (item.taxable === true) return 'T';
  return docTax > 0 && tr > 0 ? 'T' : 'B';
}

const INTER_STYLESHEET_ID = 'voltz-quotation-inter-font';

/** Inter must be loaded in the main document before html2canvas, or PDF falls back to system UI fonts. */
async function ensureInterFontsForPdfCapture(): Promise<void> {
  if (!document.getElementById(INTER_STYLESHEET_ID)) {
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = 'anonymous';
    const link = document.createElement('link');
    link.id = INTER_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.append(pre1, pre2, link);
  }
  if (document.fonts?.load) {
    try {
      await Promise.all([
        document.fonts.load('400 12px Inter'),
        document.fonts.load('600 12px Inter'),
        document.fonts.load('700 11px Inter'),
        document.fonts.load('800 22px Inter'),
      ]);
    } catch {
      /* ignore */
    }
  }
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
}

/** Same HTML as View Quote popup / email body (no “Dear Customer” wrapper). */
async function renderQuotationHtmlToPdfDataUri(
  props: PrintDocProps,
  companyName: string
): Promise<string> {
  await ensureInterFontsForPdfCapture();

  const contact = loadContactDetails();
  const fragment = buildQuotationDocumentHtml(props, contact, {
    mode: 'email',
    companyName,
    thinLinesForPdf: true,
  });

  const mount = document.createElement('div');
  const w = `${QUOTATION_DOC_WIDTH_PX}px`;
  mount.style.cssText = `position:fixed;left:-9999px;top:0;width:${w};max-width:${w};margin:0;padding:0;background:#fff;overflow:visible;`;
  mount.innerHTML = wrapQuotationFragmentForPdfMount(fragment);
  document.body.appendChild(mount);

  try {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });

    const node =
      (mount.querySelector('.voltz-qdoc') as HTMLElement | null) ||
      (mount.firstElementChild as HTMLElement) ||
      mount;
    const sw = Math.max(node.scrollWidth, node.offsetWidth);
    const sh = Math.max(node.scrollHeight, node.offsetHeight);

    const canvas = await html2canvas(node, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: sw,
      height: sh,
      windowWidth: sw,
      windowHeight: sh,
      onclone(clonedDoc) {
        const root = clonedDoc.querySelector('.voltz-qdoc') as HTMLElement | null;
        if (root) {
          root.style.setProperty('-webkit-print-color-adjust', 'exact');
          root.style.setProperty('print-color-adjust', 'exact');
        }
      },
    });

    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    /** Side margins so the quote is not stretched full-bleed (matches “document” look). */
    const sideMarginMm = 18;
    const topMarginMm = 11;
    const bottomMarginMm = 13;
    const usablePageHeightMm = pageHeight - topMarginMm - bottomMarginMm;

    const imgWidthMm = pageWidth - 2 * sideMarginMm;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

    let heightLeft = imgHeightMm;

    pdf.addImage(imgData, 'PNG', sideMarginMm, topMarginMm, imgWidthMm, imgHeightMm);
    heightLeft -= usablePageHeightMm;

    while (heightLeft > 0) {
      const position = heightLeft - imgHeightMm;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', sideMarginMm, topMarginMm + position, imgWidthMm, imgHeightMm);
      heightLeft -= usablePageHeightMm;
    }

    return pdf.output('datauristring');
  } finally {
    mount.remove();
  }
}

/** Legacy jsPDF layout if HTML capture fails (e.g. non-browser context). */
function buildDocumentPdfVector(
  props: PrintDocProps,
  options?: { companyName?: string }
): { filename: string; base64: string } {
  const companyName = options?.companyName || 'Voltz Industrial Supply';
  const contact = loadContactDetails();
  const title = typeTitle(props.type);
  const short = typeShort(props.type);
  const tr = safeNum(props.taxRate);
  const ta = safeNum(props.taxAmount);
  const disc = safeNum(props.discountAmount);
  const split = computeTaxableSplit(props);

  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(companyName, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  y += 6;
  const addr = contact.addresses[0]?.address || '';
  const phones = contact.phones.map((p) => p.number).join(' | ');
  const emails = contact.emails.map((e) => e.address).join(' | ');
  doc.text(doc.splitTextToSize(addr, 85), margin, y);
  y += addr ? 10 : 4;
  doc.text(phones, margin, y);
  y += 4;
  doc.text(emails, margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, pageW - margin, margin, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const metaRight = [
    `Date: ${fmtDatePOS(props.date)}`,
    `Page: 1 of 1`,
    `${short} #: ${props.docNumber}`,
    `Printed: ${fmtDatePOS(new Date())}`,
  ];
  if (props.taxRegistrationNo) metaRight.push(`GCT REG: ${props.taxRegistrationNo}`);
  let ry = margin + 7;
  metaRight.forEach((line) => {
    doc.text(line, pageW - margin, ry, { align: 'right' });
    ry += 4;
  });

  y = Math.max(y, ry) + 4;
  doc.setDrawColor(40);
  doc.setLineWidth(0.1);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const bill = [
    props.customerName,
    props.customerCompany,
    props.customerEmail,
    props.customerPhone,
  ]
    .filter(Boolean)
    .join('\n');
  const ship = props.shipToAddress?.trim() || bill;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Bill To', margin, y);
  doc.text('Ship To', margin + pageW / 2 - margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  y += 4;
  doc.text(doc.splitTextToSize(bill, 75), margin, y);
  doc.text(doc.splitTextToSize(ship, 75), margin + pageW / 2 - margin, y);
  y += 22;

  const barY = y;
  doc.setFillColor(248, 249, 250);
  doc.rect(margin, barY - 4, pageW - 2 * margin, 14, 'F');
  doc.setFontSize(7);
  const cols = [
    `${short} Date\n${fmtDatePOS(props.date)}`,
    `PO No.\n${props.poNumber || '—'}`,
    `Cust No.\n${props.customerAccountNo || '—'}`,
    `Terms\n${props.terms || 'Net 30'}`,
    `Entered by\n${props.enteredBy || '—'}`,
    `Salesperson\n${props.salesperson || 'House Account'}`,
  ];
  const cw = (pageW - 2 * margin) / 6;
  cols.forEach((c, i) => {
    doc.text(c, margin + i * cw + 1, barY, { maxWidth: cw - 2 });
  });
  y = barY + 16;

  const body = props.items.map((item) => {
    const sku = item.part_number || item.product_id || '—';
    const uom = item.uom?.trim() || 'EACH';
    const flag = lineFlag(item, ta, tr);
    return [
      String(sku),
      item.product_name,
      safeNum(item.quantity).toFixed(2),
      uom,
      fmtCurrency(item.unit_price),
      `${fmtCurrency(item.total)} ${flag}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Item #', 'Description', 'Qty', 'UOM', 'Unit Price', 'Net Total']],
    body,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 1.5,
      lineColor: [51, 51, 51],
      lineWidth: 0.1,
      textColor: [17, 17, 17],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [26, 35, 50],
      fontStyle: 'bold',
      fontSize: 8,
      lineColor: [51, 51, 51],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 58 },
      2: { halign: 'right', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = ((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;

  let ty = finalY;
  doc.setFontSize(8);
  const rightX = pageW - margin;
  if (ta > 0) {
    doc.text('Taxable Subtotal:', rightX - 40, ty, { align: 'right' });
    doc.text(fmtCurrency(split.taxable), rightX, ty, { align: 'right' });
    ty += 5;
  }
  if (split.nontaxable > 0) {
    doc.text('Non-taxable Subtotal:', rightX - 40, ty, { align: 'right' });
    doc.text(fmtCurrency(split.nontaxable), rightX, ty, { align: 'right' });
    ty += 5;
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal:', rightX - 40, ty, { align: 'right' });
  doc.text(fmtCurrency(props.subtotal), rightX, ty, { align: 'right' });
  ty += 5;
  doc.setFont('helvetica', 'normal');
  if (ta > 0) {
    doc.text(`Total GCT (${tr}%):`, rightX - 40, ty, { align: 'right' });
    doc.text(fmtCurrency(ta), rightX, ty, { align: 'right' });
    ty += 5;
  }
  if (disc > 0) {
    doc.text('Discount:', rightX - 40, ty, { align: 'right' });
    doc.text(`-${fmtCurrency(disc)}`, rightX, ty, { align: 'right' });
    ty += 5;
  }
  doc.setDrawColor(26, 35, 50);
  doc.setLineWidth(0.1);
  doc.line(rightX - 48, ty - 1, rightX, ty - 1);
  ty += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Total Amount:', rightX - 40, ty, { align: 'right' });
  doc.text(`$${fmtCurrency(props.total)}`, rightX, ty, { align: 'right' });

  const noteY = finalY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (props.notes) {
    doc.text('Comments:', margin, noteY);
    doc.text(doc.splitTextToSize(props.notes, 90), margin, noteY + 4);
  }

  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  const safeNumStr = props.docNumber.replace(/[^\w.-]+/g, '_');
  const filename = `Voltz-${short}-${safeNumStr}.pdf`;

  return { filename, base64 };
}

/**
 * PDF that matches the View Quote popup: same `buildQuotationDocumentHtml` (email mode) → rasterized to PDF.
 * Falls back to vector jsPDF if capture fails.
 */
export async function buildDocumentPdfBase64(
  props: PrintDocProps,
  options?: { companyName?: string }
): Promise<{ filename: string; base64: string }> {
  const companyName = options?.companyName || 'Voltz Industrial Supply';
  const safeNumStr = props.docNumber.replace(/[^\w.-]+/g, '_');
  const short = typeShort(props.type);
  const filename = `Voltz-${short}-${safeNumStr}.pdf`;

  try {
    const dataUri = await renderQuotationHtmlToPdfDataUri(props, companyName);
    const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
    return { filename, base64 };
  } catch (e) {
    console.warn('HTML-based PDF failed, using vector fallback:', e);
    return buildDocumentPdfVector(props, options);
  }
}
