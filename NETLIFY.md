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

If the SPA is on **`www`** (CloudFront) and the API on **Netlify**, **prefer same-origin API URLs** (`/api/...` on `www`) and **proxy `/api/*` in CloudFront** to `https://voltz-supply.netlify.app`. That avoids **Content-Security-Policy** blocking cross-origin `fetch` to `*.netlify.app` (**Failed to fetch**). Step-by-step: **`CLOUDFRONT_API.md`**.

**Pick one:**

1. **Simplest — host the whole site on Netlify**  
   Point your domain (or `www`) to Netlify and deploy this repo. Keep `VITE_API_URL` unset and **`voltz-api-origin` meta empty**. `netlify.toml` rewrites `/api/*` to the serverless function.

2. **CloudFront + S3 SPA, API on Netlify (recommended for AWS)**  
   Leave **`voltz-api-origin` empty** in `index.html`. Add a CloudFront **origin** (Netlify host) and a **behavior** for `/api/*` → that origin. See **`CLOUDFRONT_API.md`**. Do not rewrite `/api/*` to `index.html` in `cloudfront-function.js`.

3. **Cross-origin only if you relax CSP** — build with **`VITE_API_URL=https://voltz-supply.netlify.app`** or set **`votz-api-origin`** to that URL. Your page **`connect-src`** must allow that host, or the browser will block requests.

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
