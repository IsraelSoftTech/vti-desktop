const express = require('express');
const { status, pullFromCloud, pushToCloud, connectToCloud, online } = require('./engine');
const { outboxCount, getMeta } = require('./outbox');
const { activityLogger } = require('../activityLog');

const router = express.Router();
router.use(activityLogger());

function payload() {
  return {
    desktop: true,
    ...status(),
    pending: outboxCount(),
    deviceId: getMeta('device_id'),
  };
}

function sendSyncError(res, err) {
  if (err.code === 'offline') {
    return res.json({ ok: true, skipped: 'offline', ...payload() });
  }
  const statusCode = err.code === 'busy' ? 409 : err.code === 'unavailable' ? 503 : 400;
  return res.status(statusCode).json({
    error: err.message || 'Sync failed',
    offline: err.code === 'offline',
    skipped: err.code === 'unavailable' ? 'unavailable' : undefined,
  });
}

router.get('/sync-status', (req, res) => {
  return res.json(payload());
});

router.get('/connectivity', async (req, res) => {
  try {
    const netOk = await online();
    return res.json({ online: Boolean(netOk) });
  } catch {
    return res.json({ online: false });
  }
});

function canBootPull(body) {
  if (getMeta('device_token')) return true;
  const username = body?.username;
  const password = body?.password;
  return Boolean(username && password);
}

router.post('/pull-now', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!canBootPull(req.body || {})) {
      return res.json({ ok: true, skipped: 'unpaired', ...payload() });
    }
    const result = await pullFromCloud({ username, password });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendSyncError(res, err);
  }
});

router.post('/upload', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await pushToCloud({ username, password });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendSyncError(res, err);
  }
});

router.post('/sync-now', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await pullFromCloud({ username, password });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendSyncError(res, err);
  }
});

router.post('/connect', async (req, res) => {
  try {
    const { cloudUrl, pairingCode, username, password } = req.body || {};
    const result = await connectToCloud({
      cloudBaseUrl: cloudUrl,
      pairingCode,
      username,
      password,
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not connect' });
  }
});

module.exports = router;
