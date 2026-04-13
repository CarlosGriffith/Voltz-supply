# Deploy the API on Render

The SPA can stay on **Netlify** (or anywhere static). Run the **Express API** as a **Web Service** on [Render](https://render.com/) using the same `server/` code as local `npm run dev:api`.

## 1. Create a Web Service

1. **New** → **Web Service** → connect this Git repository.
2. **Root directory:** repo root (default).
3. **Runtime:** Node.
4. **Build command:** `npm install`
5. **Start command:** `npm start` (runs `node server/index.mjs`)
6. **Instance type:** Free tier is fine to try (services **spin down** when idle — first request may be slow). Upgrade for always-on traffic.

Optional: use the **`render.yaml`** Blueprint in this repo (**New** → **Blueprint**).

## 2. Environment variables

Set the same database variables you used on Netlify (see `.env.example`):

| Variable | Required |
|----------|----------|
| `AIVEN_MYSQL_HOST` | Yes |
| `AIVEN_MYSQL_PORT` | Yes |
| `AIVEN_MYSQL_USER` | Yes |
| `AIVEN_MYSQL_PASSWORD` | Yes |
| `AIVEN_MYSQL_DATABASE` | Yes |
| `AIVEN_CA_PATH` | If the default CA bundle is not found (repo includes `scripts/aiven-ca.pem`) |

Render injects **`PORT`** and **`RENDER`** automatically — do not set `PORT` yourself.

### Email (POS / CMS)

**Option A — Resend (recommended if SMTP times out)**  
Uses **HTTPS** only (no outbound SMTP from Render). [Resend](https://resend.com/) signup → API key → verify your domain / sender.

On the **Render** Web Service (not Netlify), set:

- **`RESEND_API_KEY`** = `re_...` (this alone enables Resend for sending)

Optional: **`EMAIL_TRANSPORT=smtp`** if you must force **SMTP** even when `RESEND_API_KEY` is set.

In **Email Configuration**, set **From email** (and name) to an address/domain allowed in Resend. **SMTP host** can be empty in the DB when using only Resend; **From** must be saved.

**Option B — SMTP (nodemailer)**  
If **Send Test** shows **connection timeout**:

- The API sets **IPv4-first DNS** and **IPv4 sockets** on Render by default. Set **`SMTP_USE_IPV6=1`** only if you need IPv6.
- Try **port 465** vs **587**, and match **Use TLS** to your provider.
- Optional: **`SMTP_CONNECTION_TIMEOUT_MS`**, **`SMTP_SOCKET_TIMEOUT_MS`**.
- **Gmail** often blocks cloud SMTP; prefer **SES**, **SendGrid**, **SMTP2GO**, or use **Option A**.

## 3. Point the frontend at Render

The built Vite app must know the API **origin** (no path prefix: the client calls `https://your-api.onrender.com/api/...`).

**Netlify (recommended):** Site → **Environment variables**

- Set **`VITE_API_URL`** = `https://your-service.onrender.com` (no trailing slash).
- Redeploy the site so the bundle picks it up.

**Or** without rebuilding: in `index.html`, set:

```html
<meta name="voltz-api-origin" content="https://your-service.onrender.com" />
```

## 4. CORS and CSP

The API already allows **`origin: *`** in `server/app.mjs`. Your **marketing site** Content-Security-Policy must allow:

- **`connect-src`** — API `fetch` / XHR to your Render hostname (or **Failed to fetch**).
- **`img-src`** — product and upload images load from `https://your-service.onrender.com/uploads/...` (the app resolves `/uploads/...` to the API origin in `src/lib/mediaUrl.ts`). Include that origin in **`img-src`** or images will not appear.

## 5. Uploads and disk

`npm start` uses **disk** storage under `server/uploads/` (not Netlify Blobs). On Render the filesystem is **ephemeral** unless you add a **persistent disk**. For production uploads, either:

- Attach a [Render Disk](https://render.com/docs/disks) mounted where `server/uploads` lives, or  
- Move to external object storage (future work).

## 6. Health checks

Render’s default health check path in `render.yaml` is **`/api/health`**. For DB status: `GET /api/health?db=1`.

## 7. Netlify changes in this repo

With the API on Render, Netlify serves **only the static SPA** — `netlify.toml` no longer rewrites `/api` to a Netlify Function. The old function file was removed; API traffic goes to Render.

See **`NETLIFY.md`** for the static-site env vars and build settings.
