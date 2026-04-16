/**
 * Resolve WhatsApp Cloud API credentials from env.
 * Meta / dashboards use various names; we accept several aliases so `.env` matches copy-paste from docs.
 */
export function resolveWhatsAppCloudCredentials() {
  const token = (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_CLOUD_API_TOKEN ||
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN ||
    process.env.META_WHATSAPP_ACCESS_TOKEN ||
    process.env.WABA_ACCESS_TOKEN ||
    ''
  ).trim();
  const phoneNumberId = (
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ||
    process.env.WABA_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_FROM_PHONE_NUMBER_ID ||
    ''
  ).trim();
  return { token, phoneNumberId };
}

export function isWhatsAppCloudConfigured() {
  const { token, phoneNumberId } = resolveWhatsAppCloudCredentials();
  return Boolean(token && phoneNumberId);
}
