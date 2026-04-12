/**
 * Push files from server/uploads/{products,documents} into Netlify Blobs (store: voltz-uploads).
 * Run once before/after go-live so images created locally are available in production.
 *
 *   NETLIFY_SITE_ID=xxx NETLIFY_AUTH_TOKEN=xxx node scripts/sync-disk-uploads-to-netlify-blobs.mjs
 *
 * Site ID: Netlify → Site configuration → General → Site details
 * Token: Netlify → User settings → Applications → Personal access tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStore } from '@netlify/blobs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'server', 'uploads');

const siteID = process.env.NETLIFY_SITE_ID || '';
const token = process.env.NETLIFY_AUTH_TOKEN || '';
if (!siteID || !token) {
  console.error('Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN');
  process.exit(1);
}

const store = getStore({
  name: 'voltz-uploads',
  siteID,
  token,
});

async function syncFolder(sub) {
  const dir = path.join(ROOT, sub);
  if (!fs.existsSync(dir)) {
    console.log('skip missing folder', dir);
    return;
  }
  const files = fs.readdirSync(dir);
  for (const name of files) {
    const fp = path.join(dir, name);
    if (!fs.statSync(fp).isFile()) continue;
    const key = `${sub}/${name}`;
    const buf = fs.readFileSync(fp);
    await store.set(key, buf, {
      metadata: { contentType: 'application/octet-stream' },
    });
    console.log('uploaded', key, buf.length, 'bytes');
  }
}

await syncFolder('products');
await syncFolder('documents');
console.log('Done.');
