const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { mediaRoot } = require('./runtime');

const MEDIA_PREFIX = '/api/attendance/media/';

function ensureMediaRoot() {
  const root = mediaRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function publicUrl(relPath) {
  return `${MEDIA_PREFIX}${String(relPath).replace(/\\/g, '/')}`;
}

function urlToAbsPath(publicUrlValue) {
  if (!publicUrlValue || typeof publicUrlValue !== 'string') return null;
  let rel = publicUrlValue.trim();
  if (rel.startsWith(MEDIA_PREFIX)) {
    rel = rel.slice(MEDIA_PREFIX.length);
  } else if (rel.startsWith('local://')) {
    rel = rel.slice('local://'.length);
  } else {
    return null;
  }
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return null;
  return path.join(ensureMediaRoot(), rel);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}

async function uploadBuffer(buffer, filename, subdir = '') {
  if (!buffer?.length) return null;
  const safeName = String(filename).replace(/^\/+/, '');
  const folder = String(subdir || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const rel = folder ? `${folder}/${safeName}` : safeName;
  const abs = path.join(ensureMediaRoot(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return publicUrl(rel);
}

async function deleteByPublicUrl(publicUrlValue) {
  const abs = urlToAbsPath(publicUrlValue);
  if (!abs) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    /* missing */
  }
}

async function readPhotoBuffer(publicUrlValue) {
  if (!publicUrlValue) return null;
  const abs = urlToAbsPath(publicUrlValue);
  if (abs && fs.existsSync(abs)) {
    return {
      buffer: fs.readFileSync(abs),
      contentType: contentTypeFor(abs),
    };
  }
  if (/^https?:\/\//i.test(publicUrlValue)) {
    const cacheRel = `remote/${crypto
      .createHash('sha1')
      .update(publicUrlValue)
      .digest('hex')}`;
    const cacheAbs = path.join(ensureMediaRoot(), cacheRel);
    if (fs.existsSync(cacheAbs)) {
      return {
        buffer: fs.readFileSync(cacheAbs),
        contentType: contentTypeFor(cacheAbs),
      };
    }
    try {
      const upstream = await fetch(String(publicUrlValue));
      if (!upstream.ok) return null;
      const buf = Buffer.from(await upstream.arrayBuffer());
      fs.mkdirSync(path.dirname(cacheAbs), { recursive: true });
      fs.writeFileSync(cacheAbs, buf);
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      return { buffer: buf, contentType };
    } catch {
      return null;
    }
  }
  return null;
}

function getFtpPublicBase() {
  return '';
}

function getFtpBaseDir() {
  return '/';
}

module.exports = {
  uploadBuffer,
  deleteByPublicUrl,
  readPhotoBuffer,
  getFtpPublicBase,
  getFtpBaseDir,
  MEDIA_PREFIX,
  urlToAbsPath,
  ensureMediaRoot,
  publicUrl,
};
