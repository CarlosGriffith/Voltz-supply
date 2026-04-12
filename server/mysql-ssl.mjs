/**
 * TLS options for Aiven MySQL (and other providers that require VERIFY_CA).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default CA path checked when AIVEN_CA_PATH is unset */
export const defaultCaPath = path.join(__dirname, '..', 'scripts', 'aiven-ca.pem');

function readCaFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Netlify bundles functions so `__dirname` may not sit next to `scripts/`.
 * `included_files` in netlify.toml still ships `scripts/aiven-ca.pem` — try cwd + Lambda paths.
 * @returns {import('mysql2').SslOptions | undefined}
 */
function resolveSslOptionsFromFiles() {
  const caEnv = process.env.AIVEN_MYSQL_SSL_CA?.trim();
  if (caEnv) {
    if (caEnv.includes('-----BEGIN')) {
      return { ca: caEnv, rejectUnauthorized: true };
    }
    const fromPath = readCaFileIfExists(caEnv);
    if (fromPath) return { ca: fromPath, rejectUnauthorized: true };
  }

  const candidates = [
    process.env.AIVEN_CA_PATH,
    defaultCaPath,
    path.join(process.cwd(), 'scripts', 'aiven-ca.pem'),
    path.join(process.cwd(), 'aiven-ca.pem'),
    path.join('/var/task', 'scripts', 'aiven-ca.pem'),
    path.join('/var/task', 'aiven-ca.pem'),
  ].filter(Boolean);

  for (const p of candidates) {
    const buf = readCaFileIfExists(p);
    if (buf) return { ca: buf, rejectUnauthorized: true };
  }

  return undefined;
}

/**
 * @returns {import('mysql2').SslOptions | undefined}
 */
export function getMysqlSslConfig() {
  if (process.env.AIVEN_MYSQL_SSL_DISABLE === '1') {
    return undefined;
  }

  const resolved = resolveSslOptionsFromFiles();
  if (resolved) return resolved;

  const host = process.env.AIVEN_MYSQL_HOST || '';
  if (host.includes('aivencloud.com')) {
    console.warn(
      '[mysql] Aiven host set but no CA found. Add scripts/aiven-ca.pem (or set AIVEN_CA_PATH / AIVEN_MYSQL_SSL_CA). TLS handshake will likely fail.'
    );
  }

  return undefined;
}
