import 'dotenv/config';
import { createApp } from './app.mjs';
import { isWhatsAppCloudConfigured } from './whatsapp-env.mjs';

const app = createApp({ storage: 'disk' });
// Render and most hosts set PORT; local dev often uses API_PORT (see .env.example).
const port = Number(process.env.PORT || process.env.API_PORT || 3001);

app.listen(port, () => {
  console.log(`[voltz-api] listening on port ${port}`);
  if (isWhatsAppCloudConfigured()) {
    console.log('[voltz-api] WhatsApp Cloud API: credentials loaded (Save & WhatsApp enabled)');
  } else {
    console.warn(
      '[voltz-api] WhatsApp Cloud API: not configured — set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID in .env (see .env.example) and restart this process'
    );
  }
});
