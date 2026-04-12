/**
 * Local: files under server/uploads. Netlify: @netlify/blobs store "voltz-uploads".
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BLOB_STORE = 'voltz-uploads';

export function initDiskUploadDirs() {
  const uploadRoot = path.join(__dirname, 'uploads');
  const productsDir = path.join(uploadRoot, 'products');
  const documentsDir = path.join(uploadRoot, 'documents');
  for (const d of [uploadRoot, productsDir, documentsDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  return { uploadRoot, productsDir, documentsDir };
}

function safeFilename(originalName) {
  const ext = path.extname(originalName || '') || '.bin';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

/** @param {{ buffer: Buffer, originalname?: string, mimetype?: string }} field */
export async function saveUploadedFile(field, folder, useBlobs) {
  const filename = safeFilename(field.originalname);
  const relKey = `${folder}/${filename}`;
  const contentType = field.mimetype || 'application/octet-stream';

  if (useBlobs) {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
    await store.set(relKey, field.buffer, {
      metadata: { contentType },
    });
  } else {
    const { productsDir, documentsDir } = initDiskUploadDirs();
    const dir = folder === 'documents' ? documentsDir : productsDir;
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, field.buffer);
  }

  return { url: `/uploads/${folder}/${filename}`, filename };
}

/** Stream or send file for GET /uploads/products|documents/:filename */
export async function sendUploadedFile(folder, filename, res, useBlobs) {
  const relKey = `${folder}/${filename}`;

  if (useBlobs) {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
    const result = await store.getWithMetadata(relKey, { type: 'arrayBuffer' });
    if (!result || !result.data) {
      res.status(404).end();
      return;
    }
    const ct =
      (result.metadata && (result.metadata.contentType || result.metadata.ContentType)) ||
      'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(result.data));
    return;
  }

  const { productsDir, documentsDir } = initDiskUploadDirs();
  const dir = folder === 'documents' ? documentsDir : productsDir;
  const filePath = path.join(dir, path.basename(filename));
  if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.sendFile(filePath);
}
