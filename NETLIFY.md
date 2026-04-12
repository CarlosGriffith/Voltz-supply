# Deploy on Netlify

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

### Split hosting (SPA on S3 / CloudFront, API on Netlify)

If visitors load **HTML/JS from AWS** (or any static host) but you want **only the API on Netlify**, the browser must call your Netlify origin explicitly. Same-origin `/api` on `www.yoursite.com` hits S3 and returns HTML — not the Netlify function.

**Pick one:**

1. **Simplest — host the whole site on Netlify**  
   Point your domain (or `www`) to Netlify and deploy this repo. Keep `VITE_API_URL` unset. `netlify.toml` already rewrites `/api/*` to the serverless function.

2. **Keep static frontend on CloudFront/S3** — point API calls at Netlify:
   - In Netlify: note your site URL, e.g. `https://voltz-supply.netlify.app` (or the ***.netlify.app** URL from **Site settings → Domain management**).
   - Either:
     - Set **`VITE_API_URL`** to that URL (no trailing slash) in the environment where you **build** the SPA, then rebuild and upload `dist/` to S3, **or**
     - Edit **`index.html`** in the built output and set  
       `<meta name="voltz-api-origin" content="https://voltz-supply.netlify.app" />`  
       (same URL; no rebuild needed if you only change the meta).
   - Ensure **CloudFront** does not rewrite `/api/*` to `index.html` (see `cloudfront-function.js` in this repo).
   - The API sends **`Access-Control-Allow-Origin: *`** so browsers can call it from any HTTPS origin.
   - If the browser shows **“Failed to fetch”** (network error), check **Content-Security-Policy** on your main site: `connect-src` must include **`https://voltz-supply.netlify.app`** (and `https:` generally). A policy of only `'self'` blocks `fetch()` to Netlify. Adjust in CloudFront response headers or remove the restrictive `connect-src` for testing.

3. **Advanced** — CloudFront **second origin** for `/api/*` to Netlify (no `VITE_API_URL` needed if the viewer URL path is still `/api` on the same domain). Requires AWS behavior/origin configuration beyond this repo.

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

## Limits

- Serverless payload limit (~6 MB buffered) caps large uploads; product image uploads use a 4 MB limit in blob mode.
- Function timeout (default 60s) applies to long admin exports.
