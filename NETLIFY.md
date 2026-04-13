# Deploy the frontend on Netlify

The **API runs on Render** — see **`RENDER.md`**. Netlify serves the **static Vite build** (`dist/`) only; it does **not** run the Express server. The browser calls your Render URL for `/api` and `/uploads` (set **`VITE_API_URL`** below).

## One-time setup

1. **Create a site** from this Git repo (recommended).
2. **Build settings** (in `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Environment variables** (Site → Environment variables):

| Variable | Required | Notes |
|----------|----------|--------|
| **`VITE_API_URL`** | **Yes** | Your Render API origin, e.g. `https://voltz-api.onrender.com` — **no trailing slash**. Rebuild after changing. |
| `AIVEN_*` | **No** | Not used by the static site; set those on **Render** for the API. |

**Or** set **`voltz-api-origin`** in `index.html` to the same URL if you prefer not to use env-based builds.

4. **Content-Security-Policy:** allow **`connect-src`** (and **`img-src`** if you load upload URLs) to your **Render** hostname, or the browser will block requests.

5. **Optional meta:** leave **`voltz-api-fallback-origin`** empty unless you use the split-DNS workaround described in `src/lib/api.ts`.

## After deploy

- Open your site and confirm the CMS/POS loads data.
- On Render, check `https://<your-service>.onrender.com/api/health?db=1` returns JSON with `db: ok`.

## Amazon CloudFront + S3 (optional)

If the SPA is served from **AWS** CloudFront + S3 while the API is on **Render**, point **`VITE_API_URL`** at Render, or proxy `/api/*` on CloudFront to your Render service (see **`AWS_CLOUDFRONT_API.md`** and adapt origins to Render).

## Legacy: Netlify Functions + Blobs

Older revisions used a Netlify serverless API and Netlify Blobs for uploads. That path is removed from `netlify.toml`. Product images created under **`npm run netlify:sync-blobs`** applied only to that setup; on Render, uploads live on **disk** (see **`RENDER.md`** — add a persistent disk or external storage for production).
