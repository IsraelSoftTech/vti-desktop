const express = require('express');
const multer = require('multer');
const { requireAdminOrAccountant } = require('./middleware');
const { isDesktop } = require('./runtime');
const { proxyCloudAttendance } = require('./cloudAttendanceSession');
const {
  listAdminThreads,
  getAdminThread,
  listMessages,
  sendAdminMessage,
  markRead,
  getMessageFile,
  getThreadById,
  deleteChatMessage,
  deleteChatMessages,
} = require('./parentChat');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function chatUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'This file is still too heavy after shrinking. Send a shorter voice note or a lighter file.',
      });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

function sendFile(res, file) {
  const inline = String(file.contentType || '').startsWith('image/') || String(file.contentType || '').startsWith('audio/');
  const name = String(file.name || 'attachment').replace(/[\r\n"]/g, '_');
  res.set('Content-Type', file.contentType || 'application/octet-stream');
  res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.set('Cache-Control', 'private, max-age=120');
  return res.send(file.buffer);
}

router.use(requireAdminOrAccountant());

router.use((req, res, next) => {
  const ct = String(req.headers['content-type'] || '');
  if (req.method === 'POST' && ct.includes('multipart/form-data')) {
    return chatUpload(req, res, next);
  }
  return next();
});

router.use((req, res, next) => {
  if (!isDesktop()) return next();
  return proxyCloudAttendance(req, res);
});

router.get('/threads', async (req, res) => {
  try {
    const data = await listAdminThreads({
      q: req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return res.json(data);
  } catch (err) {
    console.error('[chat] admin threads', err);
    return res.status(500).json({ error: 'Failed to load conversations' });
  }
});

router.get('/threads/:id/messages', async (req, res) => {
  try {
    const thread = await getThreadById(req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const messages = await listMessages(thread.id, {
      beforeId: req.query.beforeId,
      limit: req.query.limit,
      viewerRole: 'admin',
    });
    return res.json({ messages });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[chat] admin messages', err);
    return res.status(status).json({ error: err.message || 'Failed to load messages' });
  }
});

router.get('/threads/:id', async (req, res) => {
  try {
    const data = await getAdminThread(req.params.id);
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[chat] admin thread', err);
    return res.status(status).json({ error: err.message || 'Failed to load conversation' });
  }
});

router.post('/threads/:id/messages', async (req, res) => {
  try {
    const message = await sendAdminMessage(req.attendanceUser.sub, req.params.id, {
      body: req.body?.body,
      file: req.file,
    });
    return res.json({ message });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[chat] admin send', err);
    return res.status(status).json({ error: err.message || 'Failed to send' });
  }
});

router.post('/threads/:id/messages/bulk-delete', async (req, res) => {
  try {
    const thread = await getThreadById(req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const result = await deleteChatMessages({
      messageIds: req.body?.ids,
      actorRole: 'admin',
      admin: true,
      scope: req.body?.scope,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[chat] admin bulk delete', err);
    return res.status(status).json({ error: err.message || 'Failed to delete messages' });
  }
});

router.post('/threads/:id/messages/:messageId/delete', async (req, res) => {
  try {
    const thread = await getThreadById(req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const result = await deleteChatMessage({
      messageId: req.params.messageId,
      actorRole: 'admin',
      admin: true,
      scope: req.body?.scope,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[chat] admin delete', err);
    return res.status(status).json({ error: err.message || 'Failed to delete message' });
  }
});

router.post('/threads/:id/read', async (req, res) => {
  try {
    const data = await markRead(req.params.id, 'admin');
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[chat] admin read', err);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
});

router.get('/files/:messageId', async (req, res) => {
  try {
    const file = await getMessageFile(req.params.messageId, { admin: true });
    return sendFile(res, file);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[chat] admin file', err);
    return res.status(status).json({ error: err.message || 'Failed to load file' });
  }
});

module.exports = router;
