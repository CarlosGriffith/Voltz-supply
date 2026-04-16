/**
 * Parses website quote-request `message` for delivery lines appended by {@link quoteDeliveryPreferenceLine} in QuoteRequest.tsx.
 */
export function parseQuoteRequestDeliveryPreferences(
  message: string | null | undefined
): { sendViaEmail: boolean; sendViaWhatsapp: boolean } {
  const t = (message || '').toLowerCase();
  if (t.includes('whatsapp and email') || t.includes('email and whatsapp')) {
    return { sendViaEmail: true, sendViaWhatsapp: true };
  }
  if (t.includes('receive quote by whatsapp') && !t.includes('email')) {
    return { sendViaEmail: false, sendViaWhatsapp: true };
  }
  if (t.includes('receive quote by email')) {
    return { sendViaEmail: true, sendViaWhatsapp: false };
  }
  return { sendViaEmail: true, sendViaWhatsapp: false };
}
