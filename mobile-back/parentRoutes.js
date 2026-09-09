const express = require('express');
const { requireParent } = require('./middleware');
const { isDesktop } = require('./runtime');
const {
  listLinkedStudents,
  linkBarcodes,
  addLinkedBarcode,
  unlinkStudent,
  getLinkedStudentDay,
  getLinkedStudentPhotoUrl,
  deleteParentAccount,
} = require('./parentStudents');
const {
  getParentOverview,
  getParentStudentFeeRecord,
  getParentStudentFeeByBarcode,
} = require('./parentOverview');
const multer = require('multer');
const {
  upsertParentDevice,
  listParentNotifications,
  unreadCount,
  markNotificationsRead,
  clearParentNotifications,
  getParentNotificationSettings,
  setParentNotificationSettings,
} = require('./parentNotify');
const {
  getParentChat,
  listMessages,
  sendParentMessage,
  markParentRead,
  getMessageFile,
  parentChatUnread,
  getOrCreateThread,
  deleteChatMessage,
  deleteChatMessages,
} = require('./parentChat');

const chatUploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function chatUpload(req, res, next) {
  chatUploadMw.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'This file is still too heavy after shrinking. Send a shorter voice note or a lighter file.',
      });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

function sendChatFile(res, file) {
  const inline =
    String(file.contentType || '').startsWith('image/') ||
    String(file.contentType || '').startsWith('audio/');
  const name = String(file.name || 'attachment').replace(/[\r\n"]/g, '_');
  res.set('Content-Type', file.contentType || 'application/octet-stream');
  res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.set('Cache-Control', 'private, max-age=120');
  return res.send(file.buffer);
}

const router = express.Router();

router.use((req, res, next) => {
  if (isDesktop()) {
    return res.status(400).json({ error: 'Parent features run on the school server.' });
  }
  return next();
});

router.use(requireParent());

router.delete('/account', async (req, res) => {
  try {
    await deleteParentAccount(req.attendanceUser.sub);
    const { logActivity } = require('./activityLog');
    void logActivity({
      actorRole: 'attendance_parent',
      action: 'parent.delete',
      entity: 'parent',
      summary: 'Deleted a parent account',
      source: 'mobile',
    });
    return res.json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] delete account', err);
    return res.status(status).json({ error: err.message || 'Failed to delete account' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const students = await listLinkedStudents(req.attendanceUser.sub);
    return res.json({ students });
  } catch (err) {
    console.error('[parent] list students', err);
    return res.status(500).json({ error: 'Failed to load students' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const data = await getParentOverview(req.attendanceUser.sub);
    return res.json(data);
  } catch (err) {
    console.error('[parent] overview', err);
    return res.status(500).json({ error: 'Failed to load overview' });
  }
});

router.get('/fees/barcode/:barcode', async (req, res) => {
  try {
    const record = await getParentStudentFeeByBarcode(
      req.attendanceUser.sub,
      req.params.barcode
    );
    return res.json(record);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] fee barcode', err);
    return res.status(status).json({ error: err.message || 'Failed to load fees' });
  }
});

router.get('/students/:id/fees', async (req, res) => {
  try {
    const record = await getParentStudentFeeRecord(req.attendanceUser.sub, req.params.id);
    return res.json(record);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] student fees', err);
    return res.status(status).json({ error: err.message || 'Failed to load fees' });
  }
});

router.post('/link', async (req, res) => {
  try {
    const barcodes = req.body?.barcodes;
    const result = await linkBarcodes(req.attendanceUser.sub, barcodes);
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] link', err);
    return res.status(status).json({ error: err.message || 'Failed to link students' });
  }
});

router.post('/students', async (req, res) => {
  try {
    const barcode = req.body?.barcode;
    const result = await addLinkedBarcode(req.attendanceUser.sub, barcode);
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] add student', err);
    return res.status(status).json({ error: err.message || 'Failed to add student' });
  }
});

router.delete('/students/:id', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const result = await unlinkStudent(req.attendanceUser.sub, studentId);
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] unlink student', err);
    return res.status(status).json({ error: err.message || 'Failed to remove student' });
  }
});

router.get('/students/:id/day', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isFinite(studentId)) {
      return res.status(400).json({ error: 'Invalid student id' });
    }
    const data = await getLinkedStudentDay(req.attendanceUser.sub, studentId);
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] student day', err);
    return res.status(status).json({ error: err.message || 'Failed to load attendance' });
  }
});

router.post('/devices', async (req, res) => {
  try {
    const token = req.body?.token || req.body?.expoPushToken;
    const platform = req.body?.platform;
    const result = await upsertParentDevice({
      parentUserId: req.attendanceUser.sub,
      token,
      platform,
    });
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] device', err);
    return res.status(status).json({ error: err.message || 'Failed to save device' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const parentUserId = req.attendanceUser.sub;
    const [items, unread] = await Promise.all([
      listParentNotifications(parentUserId),
      unreadCount(parentUserId),
    ]);
    return res.json({ items, unreadCount: unread });
  } catch (err) {
    console.error('[parent] notifications', err);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const [count, chatUnread] = await Promise.all([
      unreadCount(req.attendanceUser.sub),
      parentChatUnread(req.attendanceUser.sub),
    ]);
    return res.json({ unreadCount: count, chatUnreadCount: chatUnread });
  } catch (err) {
    console.error('[parent] unread', err);
    return res.status(500).json({ error: 'Failed to load unread count' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await getParentNotificationSettings(req.attendanceUser.sub);
    return res.json(settings);
  } catch (err) {
    console.error('[parent] settings get', err);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    const settings = await setParentNotificationSettings(req.attendanceUser.sub, {
      notificationSound: req.body?.notificationSound,
    });
    return res.json({ ok: true, ...settings });
  } catch (err) {
    console.error('[parent] settings save', err);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const ids = req.body?.ids;
    const result = await markNotificationsRead(req.attendanceUser.sub, ids);
    const count = await unreadCount(req.attendanceUser.sub);
    return res.json({ ok: true, ...result, unreadCount: count });
  } catch (err) {
    console.error('[parent] mark read', err);
    return res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

router.post('/notifications/clear', async (req, res) => {
  try {
    const ids = req.body?.ids;
    const result = await clearParentNotifications(req.attendanceUser.sub, ids);
    const count = await unreadCount(req.attendanceUser.sub);
    return res.json({ ok: true, ...result, unreadCount: count });
  } catch (err) {
    console.error('[parent] clear notifications', err);
    return res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

router.get('/students/:id/photo', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isFinite(studentId)) {
      return res.status(400).json({ error: 'Invalid student id' });
    }
    const photoUrl = await getLinkedStudentPhotoUrl(req.attendanceUser.sub, studentId);
    if (!photoUrl) return res.status(404).json({ error: 'No photo' });

    const { readPhotoBuffer } = require('./storage');
    const photo = await readPhotoBuffer(String(photoUrl));
    if (!photo) {
      return res.status(502).json({ error: 'Photo unavailable' });
    }
    res.set('Content-Type', photo.contentType || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=600');
    return res.send(photo.buffer);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] student photo', err);
    return res.status(status).json({ error: err.message || 'Failed to load photo' });
  }
});

router.get('/chat', async (req, res) => {
  try {
    const data = await getParentChat(req.attendanceUser.sub);
    return res.json(data);
  } catch (err) {
    console.error('[parent] chat', err);
    return res.status(500).json({ error: 'Failed to load chat' });
  }
});

router.get('/chat/messages', async (req, res) => {
  try {
    const thread = await getOrCreateThread(req.attendanceUser.sub);
    const messages = await listMessages(thread.id, {
      beforeId: req.query.beforeId,
      limit: req.query.limit,
      viewerRole: 'parent',
    });
    return res.json({ messages });
  } catch (err) {
    console.error('[parent] chat messages', err);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/chat/messages', chatUpload, async (req, res) => {
  try {
    const message = await sendParentMessage(req.attendanceUser.sub, {
      body: req.body?.body,
      file: req.file,
    });
    return res.json({ message });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] chat send', err);
    return res.status(status).json({ error: err.message || 'Failed to send' });
  }
});

router.post('/chat/read', async (req, res) => {
  try {
    const result = await markParentRead(req.attendanceUser.sub);
    const unread = await unreadCount(req.attendanceUser.sub);
    const chatUnread = await parentChatUnread(req.attendanceUser.sub);
    return res.json({ ok: true, ...result, unreadCount: unread, chatUnreadCount: chatUnread });
  } catch (err) {
    console.error('[parent] chat read', err);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
});

router.post('/chat/messages/bulk-delete', async (req, res) => {
  try {
    const result = await deleteChatMessages({
      messageIds: req.body?.ids,
      actorRole: 'parent',
      parentUserId: req.attendanceUser.sub,
      scope: req.body?.scope,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] chat bulk delete', err);
    return res.status(status).json({ error: err.message || 'Failed to delete messages' });
  }
});

router.post('/chat/messages/:messageId/delete', async (req, res) => {
  try {
    const result = await deleteChatMessage({
      messageId: req.params.messageId,
      actorRole: 'parent',
      parentUserId: req.attendanceUser.sub,
      scope: req.body?.scope,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] chat delete', err);
    return res.status(status).json({ error: err.message || 'Failed to delete message' });
  }
});

router.get('/chat/files/:messageId', async (req, res) => {
  try {
    const file = await getMessageFile(req.params.messageId, {
      parentUserId: req.attendanceUser.sub,
    });
    return sendChatFile(res, file);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[parent] chat file', err);
    return res.status(status).json({ error: err.message || 'Failed to load file' });
  }
});

module.exports = router;
