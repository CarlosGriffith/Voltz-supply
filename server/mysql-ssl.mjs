/**
 * TLS options for Aiven MySQL (and other providers that require VERIFY_CA).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default CA path checked when AIVEN_CA_PATH is unset */
export const defaultCaPath = path.join(__dirname, '..', 'scripts', 'aiven-ca.pem');

/**
 * @returns {import('mysql2').SslOptions | undefined}
 */
export function getMysqlSslConfig() {
  if (process.env.AIVEN_MYSQL_SSL_DISABLE === '1') {
    return undefined;
  }

  const caPath = process.env.AIVEN_CA_PATH || defaultCaPath;
  const caEnv = process.env.AIVEN_MYSQL_SSL_CA?.trim();

  if (caEnv) {
    if (caEnv.includes('-----BEGIN')) {
      return { ca: caEnv, rejectUnauthorized: true };
    }
    if (fs.existsSync(caEnv)) {
      return { ca: fs.readFileSync(caEnv), rejectUnauthorized: true };
    }
  }

  if (fs.existsSync(caPath)) {
    return { ca: fs.readFileSync(caPath), rejectUnauthorized: true };
  }

  const host = process.env.AIVEN_MYSQL_HOST || '';
  if (host.includes('aivencloud.com')) {
    console.warn(
      '[mysql] Aiven host set but no CA found. Add scripts/aiven-ca.pem or set AIVEN_CA_PATH / AIVEN_MYSQL_SSL_CA (PEM or file path). TLS handshake will likely fail.'
    );
  }

  return undefined;
}
