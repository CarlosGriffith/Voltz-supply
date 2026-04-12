# CloudFront + S3 frontend, Netlify API (same-origin `/api`)

If `www.yoursite.com` is served from **S3 + CloudFront** and your API lives on **Netlify**, **do not** point the browser at `https://*.netlify.app` from JavaScript when your site uses a strict **Content-Security-Policy** (`connect-src 'self'`). The browser will block those requests (**Failed to fetch**) before CORS matters.

**Recommended approach:** Keep API calls **same-origin** — `fetch('/api/...')` on `https://www.yoursite.com` — and configure **CloudFront** to forward `/api/*` to your Netlify site. Then CSP only needs to allow `'self'` for `connect-src`, which it already does.

## 1. CloudFront: add a second origin (Netlify)

1. AWS Console → **CloudFront** → your distribution → **Origins** → **Create origin**.
2. **Origin domain**: `voltz-supply.netlify.app` (your Netlify subdomain; no `https://`).
3. **Protocol**: **HTTPS only**.
4. **Origin path**: leave **empty** (Netlify serves `/api/...` at the root of that host).
5. **Minimum origin SSL protocol**: TLSv1.2 or higher.
6. Save (name will be something like `voltz-supply.netlify.app`).

## 2. CloudFront: add a behavior for `/api/*`

1. **Behaviors** → **Create behavior**.
2. **Path pattern**: `/api/*`
3. **Origin**: select the Netlify origin created above.
4. **Viewer protocol policy**: **Redirect HTTP to HTTPS**.
5. **Allowed HTTP methods**: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE** (needed for CMS/POS).
6. **Cache policy**: **CachingDisabled** (or a custom policy with **TTL 0** for `/api/*` — APIs should not be cached like static assets).
7. **Origin request policy**: **AllViewerExceptHostHeader** is often wrong for Netlify; prefer **AllViewer** or **CORS-S3Origin**-style forwarding. If you get **502** or wrong site, try **AllViewer** so query strings and headers reach Netlify. (Netlify expects the `Host` it knows; CloudFront usually sets `Host` to the **origin domain** for custom origins — verify in a single request trace.)
8. **Response headers policy**: optional; your API sets CORS.
9. **Precedence**: **0** or any number **lower** than your default `*` behavior so `/api/*` is matched **before** the SPA rule.

## 3. SPA rewrite function must not touch `/api/*`

Ensure your viewer-request CloudFront Function (see `cloudfront-function.js` in this repo) **returns the request unchanged** for paths starting with `/api/` — do not rewrite them to `/index.html`.

## 4. Frontend: same-origin API (no Netlify URL in the browser)

In this repo:

- Leave **`VITE_API_URL`** unset for this setup.
- In **`index.html`**, keep  
  `<meta name="voltz-api-origin" content="" />`  
  **empty** so the app uses relative URLs (`/api/...`) on whatever host loads the SPA (`www`).

Rebuild the SPA, upload `dist/` to S3, invalidate CloudFront.

## 5. Verify

- Open `https://www.yoursite.com/api/health?db=1` — expect JSON (`db: ok` if MySQL env is set on Netlify).
- Open `https://voltz-supply.netlify.app/api/health?db=1` — should still work when hit **directly** on Netlify.

If `/api/*` on `www` returns **403 from S3**, the behavior order or path pattern is wrong. If **502**, check origin SSL and **Origin request policy** / **Host** header behavior for Netlify.
