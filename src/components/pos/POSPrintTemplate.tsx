import { loadContactDetails } from '@/contexts/CMSContext';
import { buildQuotationDocumentHtml, buildEmailWrapperHtml } from '@/components/pos/quotationHtml';
import type { PrintDocProps } from '@/components/pos/posPrintTypes';

export type { PrintDocProps };

const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_720a7df.png';

export function printDocument(props: PrintDocProps) {
  const contact = loadContactDetails();
  const html = buildQuotationDocumentHtml(props, contact, {
    mode: 'print',
    companyName: 'Voltz Industrial Supply',
  });

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function generateEmailHTML(props: PrintDocProps): string {
  const contact = loadContactDetails();
  const short =
    { quote: 'Quote', order: 'Order', invoice: 'Invoice', receipt: 'Receipt', refund: 'Refund' }[
      props.type
    ];
  const inner = buildQuotationDocumentHtml(props, contact, {
    mode: 'email',
    companyName: 'Voltz Industrial Supply',
  });
  return buildEmailWrapperHtml(inner, short);
}

export { LOGO_URL };
