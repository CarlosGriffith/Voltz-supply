# Deploy on Netlify

This project’s **API is a Netlify serverless function** (`netlify/functions/api.mjs`). The **Vite frontend** is built to `dist/` and served by Netlify; `netlify.toml` rewrites `/api/*` to that function at **Netlify’s edge** (Netlify’s built-in global CDN — not Amazon CloudFront unless you add AWS separately).

### Full stack on Netlify (most common)

If **both** the SPA and the API are served from the **same Netlify site** (e.g. `voltz-supply.netlify.app` or your custom domain in Netlify):

- Leave **`VITE_API_URL`** unset in Netlify environment variables.
- Keep **`voltz-api-origin`** empty in `index.html` (default in this repo).
- The browser normally calls **`/api/...` on the same host**. If your **custom domain** still serves the SPA for `/api/*` (HTML instead of JSON), `index.html` includes **`voltz-api-fallback-origin`** (default `https://voltz-supply.netlify.app`) so API calls hit Netlify until DNS is fully correct — see `src/lib/api.ts`.
- You do **not** need **`AWS_CLOUDFRONT_API.md`** unless you use optional **AWS** CloudFront + S3 for the static app.

Use **Split hosting** below only if static assets are hosted **outside** Netlify (e.g. **AWS** S3 + **Amazon** CloudFront) while the API stays on Netlify.

## One-time setup

1. **Create a site** from a Git repo (recommended), or upload a **zip of the project without `node_modules` and `dist`**—Netlify runs a clean install and build. If you drag the whole folder including `node_modules`, builds are slower and can hit size limits. Set environment variables in the Netlify UI either way.
2. **Build settings** (already in `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Environment variables** (Site configuration → Environment variables). Use the same values as local `.env` for Aiven:

| Variable | Required | Notes |
|----------|----------|--------|
| `AIVEN_MYSQL_HOST` | Yes | |
| `AIVEN_MYSQL_PORT` | Yes | |
| `AIVEN_MYSQL_USER` | Yes | |
| `AIVEN_MYSQL_PASSWORD` | Yes | Secret |
| `AIVEN_MYSQL_DATABASE` | Yes | e.g. `defaultdb` |
| `AIVEN_CA_PATH` | If CA not bundled | Default bundle includes `scripts/aiven-ca.pem` via `included_files` |
| `VITE_API_URL` | No | Leave **empty** when the site is served from Netlify so `/api` is same-origin. See **Split hosting** below if the SPA is elsewhere. |

Do **not** set `VOLTZ_STORAGE=blobs` manually unless you change code—the Netlify function already uses blob storage.

**CSP / `Failed to fetch`:** If you set `VITE_API_URL` to `https://voltz-supply.netlify.app`, the browser calls that host from your custom domain (cross-origin). A strict **Content-Security-Policy** without `connect-src` for `*.netlify.app` blocks `fetch`. This repo adds **`[[headers]]` `Content-Security-Policy`** in `netlify.toml` to allow those calls—redeploy after pull. Alternatively, **unset `VITE_API_URL`** and fix DNS so **`/api` on your domain** is served by Netlify (same origin, no cross-origin CSP issue).

### Split hosting (SPA on AWS S3 / Amazon CloudFront, API on Netlify)

If the SPA is on **`www`** via **Amazon CloudFront + S3** and the API on **Netlify**, **prefer same-origin API URLs** (`/api/...` on `www`) and **proxy `/api/*` in CloudFront** to `https://voltz-supply.netlify.app`. That avoids **Content-Security-Policy** blocking cross-origin `fetch` to `*.netlify.app` (**Failed to fetch**). Step-by-step: **`AWS_CLOUDFRONT_API.md`**.

**Pick one:**

1. **Simplest — host the whole site on Netlify**  
   Point your domain (or `www`) to Netlify and deploy this repo. Keep `VITE_API_URL` unset and **`voltz-api-origin` meta empty**. `netlify.toml` rewrites `/api/*` to the serverless function at Netlify’s edge.

2. **Amazon CloudFront + S3 SPA, API on Netlify (AWS-only split)**  
   Leave **`voltz-api-origin` empty** in `index.html`. Add an **AWS CloudFront** **origin** (Netlify host) and a **behavior** for `/api/*` → that origin. See **`AWS_CLOUDFRONT_API.md`**. Do not rewrite `/api/*` to `index.html` in `cloudfront-function.js`.

3. **Cross-origin only if you relax CSP** — build with **`VITE_API_URL=https://voltz-supply.netlify.app`** or set **`voltz-api-origin`** to that URL. Your page **`connect-src`** must allow that host, or the browser will block requests.

4. **Product images (Blobs)**  
   Local files under `server/uploads/` are **not** deployed. After importing data or saving images locally, push binaries to Netlify Blobs **once** (per site):

   ```bash
   set NETLIFY_SITE_ID=your-site-id
   set NETLIFY_AUTH_TOKEN=your-personal-access-token
   npm run netlify:sync-blobs
   ```

   Or re-upload images through the CMS on production (they go straight to Blobs).

5. **MySQL schema**  
   Run `db:bootstrap:aiven` and `db:bootstrap:cms` from your machine (or any CI) against Aiven **before** relying on production—Netlify build does not run these.

## After deploy

- Open `https://<your-site>.netlify.app/api/health?db=1` and confirm `db` is `ok`.
- If `/uploads/...` images 404, confirm blob sync ran and check **Functions** logs.

### `/api/health` returns 404 on your custom domain (e.g. voltzsupply.com)

`netlify.toml` only applies to traffic that **Netlify’s CDN** serves. A **404** on `https://voltzsupply.com/api/...` almost always means **`voltzsupply.com` is not going through Netlify** for that request (or the domain is not attached to this site).

1. **Compare with the Netlify default host**  
   Open `https://voltz-supply.netlify.app/api/health?db=1` (use your real `*.netlify.app` name from **Site settings → Domain management**).  
   - If this **works** but **`voltzsupply.com`** does not → DNS for the custom domain is not pointing at **Netlify**, or the domain still hits **another host** (e.g. AWS S3 / **Amazon** CloudFront) that has no `/api` route.

2. **Serve the whole site (including `/api`) from Netlify**  
   In Netlify: **Domain management** → add **`voltzsupply.com`** and **`www.voltzsupply.com`** to this site → follow Netlify’s **DNS** instructions at your registrar (often A/AAAA for apex, CNAME for `www`). Wait for DNS to propagate, then test again.

3. **If the domain must stay on Amazon CloudFront + S3**  
   `/api` will 404 until you add an **AWS CloudFront** **behavior** that forwards `/api/*` to your Netlify origin. See **`AWS_CLOUDFRONT_API.md`**.

## Limits

- Serverless payload limit (~6 MB buffered) caps large uploads; product image uploads use a 4 MB limit in blob mode.
- Function timeout (default 60s) applies to long admin exports.
