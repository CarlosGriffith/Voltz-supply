/**
 * Download product images still pointing at legacy hosts (e.g. DatabasePad / old Supabase storage),
 * save under server/uploads/products, and rewrite MySQL (cms_custom_products, cms_product_overrides,
 * and product_image URLs inside pos_quotes / pos_orders / pos_invoices JSON items).
 *
 * Usage:
 *   node scripts/migrate-legacy-product-images.mjs
 *
 * Env (from .env): AIVEN_MYSQL_*
 * Optional:
 *   LEGACY_IMAGE_HOST_SUBSTR=databasepad   (comma-separated substrings; URL must match one to be fetched)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getMysqlSslConfig } from '../server/mysql-ssl.mjs';
import { initDiskUploadDirs } from '../server/storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_LEGACY_SUBSTR = ['databasepad.com', 'qnsdnbqyayczyrkicevb'];

function legacySubstrings() {
  const env = process.env.LEGACY_IMAGE_HOST_SUBSTR;
  if (env && env.trim()) {
    return env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return DEFAULT_LEGACY_SUBSTR.map((s) => s.toLowerCase());
}

function isLegacyImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('/uploads/')) return false;
  const u = url.toLowerCase();
  return legacySubstrings().some((s) => u.includes(s));
}

function extFromUrlAndType(url, contentType) {
  const p = url.split('?')[0].toLowerCase();
  if (p.endsWith('.png')) return '.png';
  if (p.endsWith('.webp')) return '.webp';
  if (p.endsWith('.gif')) return '.gif';
  if (p.endsWith('.jpeg') || p.endsWith('.jpg')) return '.jpg';
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  return '.jpg';
}

async function downloadToUploads(absUrl, urlCache) {
  if (!isLegacyImageUrl(absUrl)) return absUrl;
  if (urlCache.has(absUrl)) return urlCache.get(absUrl);

  try {
    const res = await fetch(absUrl, {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error('response too small');
    const ext = extFromUrlAndType(absUrl, res.headers.get('content-type'));
    const { productsDir } = initDiskUploadDirs();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const dest = path.join(productsDir, filename);
    fs.writeFileSync(dest, buf);
    const local = `/uploads/products/${filename}`;
    urlCache.set(absUrl, local);
    console.log('  saved', absUrl.slice(0, 72) + '... →', local);
    return local;
  } catch (e) {
    console.warn('  FAILED', absUrl.slice(0, 80), e.message);
    urlCache.set(absUrl, '');
    return '';
  }
}

async function migrateItemsJson(itemsStr, urlCache) {
  if (!itemsStr || typeof itemsStr !== 'string') return itemsStr;
  let arr;
  try {
    arr = JSON.parse(itemsStr);
  } catch {
    return itemsStr;
  }
  if (!Array.isArray(arr)) return itemsStr;

  let changed = false;
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.product_image === 'string' && isLegacyImageUrl(row.product_image)) {
      const n = await downloadToUploads(row.product_image, urlCache);
      row.product_image = n;
      changed = true;
    }
  }
  return changed ? JSON.stringify(arr) : itemsStr;
}


async function main() {
  const password = process.env.AIVEN_MYSQL_PASSWORD || '';
  if (!password) {
    console.error('Set AIVEN_MYSQL_PASSWORD');
    process.exit(1);
  }
  const pool = mysql.createPool({
    host: process.env.AIVEN_MYSQL_HOST || 'localhost',
    port: Number(process.env.AIVEN_MYSQL_PORT || 3306),
    user: process.env.AIVEN_MYSQL_USER || 'root',
    password,
    database: process.env.AIVEN_MYSQL_DATABASE || 'defaultdb',
    ssl: getMysqlSslConfig(),
    connectTimeout: Number(process.env.AIVEN_MYSQL_CONNECT_TIMEOUT_MS || 30_000),
    dateStrings: true,
    charset: 'utf8mb4',
  });

  const urlCache = new Map();

  try {
    const [products] = await pool.query('SELECT id, image, additional_images FROM cms_custom_products');
    for (const p of products) {
      let image = p.image;
      let addl = p.additional_images;
      let touched = false;

      if (typeof image === 'string' && isLegacyImageUrl(image)) {
        image = await downloadToUploads(image, urlCache);
        touched = true;
      }
      if (typeof addl === 'string' && addl.trim()) {
        try {
          const urls = JSON.parse(addl);
          if (Array.isArray(urls)) {
            const next = [];
            let addlChanged = false;
            for (const u of urls) {
              if (typeof u === 'string' && isLegacyImageUrl(u)) {
                next.push(await downloadToUploads(u, urlCache));
                addlChanged = true;
              } else {
                next.push(u);
              }
            }
            if (addlChanged) {
              addl = JSON.stringify(next);
              touched = true;
            }
          }
        } catch {
          /* keep */
        }
      }
      if (touched) {
        await pool.query('UPDATE cms_custom_products SET image = ?, additional_images = ? WHERE id = ?', [
          image || null,
          typeof addl === 'string' ? addl : '[]',
          p.id,
        ]);
        console.log('updated product', p.id);
      }
    }

    const [overrides] = await pool.query(
      `SELECT id, image FROM cms_product_overrides WHERE image IS NOT NULL AND image <> ''`
    );
    for (const o of overrides) {
      if (typeof o.image === 'string' && isLegacyImageUrl(o.image)) {
        const img = await downloadToUploads(o.image, urlCache);
        await pool.query('UPDATE cms_product_overrides SET image = ? WHERE id = ?', [img || null, o.id]);
        console.log('updated override', o.id);
      }
    }

    for (const { table, idcol } of [
      { table: 'pos_quotes', idcol: 'id' },
      { table: 'pos_orders', idcol: 'id' },
      { table: 'pos_invoices', idcol: 'id' },
    ]) {
      const [rows] = await pool.query(`SELECT ${idcol} AS id, items FROM ${table} WHERE items LIKE '%databasepad%' OR items LIKE '%qnsdnbqyayczyrkicevb%'`);
      for (const r of rows) {
        const newItems = await migrateItemsJson(r.items, urlCache);
        if (newItems !== r.items) {
          await pool.query(`UPDATE ${table} SET items = ? WHERE ${idcol} = ?`, [newItems, r.id]);
          console.log('updated', table, r.id);
        }
      }
    }

    console.log('Done. Local files are under server/uploads/products — serve via API /uploads');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
