const path = require('path');
const { uploadBuffer, readPhotoBuffer } = require('./storage');

const MAX_BYTES = {
  image: 700 * 1024,
  audio: 1500 * 1024,
  document: 1500 * 1024,
};

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const AUDIO_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/3gpp',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/ogg',
]);

const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function extOf(name, mime) {
  const fromName = path.extname(String(name || '')).toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  if ((mime || '').includes('jpeg') || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if ((mime || '').includes('pdf')) return '.pdf';
  if ((mime || '').includes('audio') || (mime || '').includes('m4a')) return '.m4a';
  if ((mime || '').includes('webm')) return '.webm';
  return '.bin';
}

function classifyAttachment(mime, originalName) {
  const type = String(mime || '').toLowerCase().split(';')[0].trim();
  const name = String(originalName || '').toLowerCase();
  if (IMAGE_TYPES.has(type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(name)) {
    return { kind: 'image', mime: type || 'image/jpeg' };
  }
  if (AUDIO_TYPES.has(type) || /\.(m4a|aac|mp3|wav|ogg|webm|3gp)$/i.test(name)) {
    return { kind: 'audio', mime: type || 'audio/m4a' };
  }
  if (DOCUMENT_TYPES.has(type) || /\.(pdf|docx?|xlsx?|txt)$/i.test(name)) {
    return { kind: 'document', mime: type || 'application/octet-stream' };
  }
  return null;
}

function lightenBuffer(buffer, kind) {
  const max = MAX_BYTES[kind] || MAX_BYTES.document;
  if (!buffer || buffer.length <= max) return buffer;
  if (kind === 'image' && buffer.length <= 2 * 1024 * 1024) {
    return buffer;
  }
  const err = new Error('This file is still too heavy after shrinking. Send a shorter voice note or a lighter file.');
  err.status = 413;
  throw err;
}

function safeFilename(name) {
  return String(name || 'file')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'file';
}

async function storeChatFile({ buffer, mime, originalName, threadId }) {
  const classified = classifyAttachment(mime, originalName);
  if (!classified) {
    const err = new Error('That file type is not allowed. Send a photo, voice note, PDF, or document.');
    err.status = 400;
    throw err;
  }
  const light = lightenBuffer(buffer, classified.kind);
  const ext = extOf(originalName, classified.mime);
  const filename = `t${threadId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const url = await uploadBuffer(light, filename, 'parent-chat');
  if (!url) {
    const err = new Error('Could not store the file.');
    err.status = 500;
    throw err;
  }
  return {
    kind: classified.kind,
    url,
    name: safeFilename(originalName || `attachment${ext}`),
    mime: classified.mime,
    size: light.length,
  };
}

async function readChatFile(url) {
  return readPhotoBuffer(url);
}

module.exports = {
  MAX_BYTES,
  classifyAttachment,
  storeChatFile,
  readChatFile,
};
