import 'dotenv/config';
import { createApp } from './app.mjs';

const app = createApp({ storage: 'disk' });
const PORT = Number(process.env.API_PORT || 3001);

app.listen(PORT, () => {
  console.log(`[voltz-api] listening on http://127.0.0.1:${PORT}`);
});
