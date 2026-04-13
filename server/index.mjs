import 'dotenv/config';
import { createApp } from './app.mjs';

const app = createApp({ storage: 'disk' });
// Render and most hosts set PORT; local dev often uses API_PORT (see .env.example).
const port = Number(process.env.PORT || process.env.API_PORT || 3001);

app.listen(port, () => {
  console.log(`[voltz-api] listening on port ${port}`);
});
