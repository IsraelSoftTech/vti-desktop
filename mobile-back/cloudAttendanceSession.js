const { isDesktop } = require('./runtime');

function meta() {
  return require('./sync/outbox');
}

function engine() {
  return require('./sync/engine');
}

async function captureFromLogin(username, password) {
  if (!isDesktop()) return;
  try {
    const base = engine().cloudUrl();
    if (!base) return;
    const res = await fetch(`${base}/api/attendance/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.token) {
      meta().setMeta('cloud_attendance_token', data.token);
    }
  } catch (err) {
    console.warn('[chat] cloud login', err?.message || err);
  }
}

async function proxyCloudAttendance(req, res) {
  const token = meta().getMeta('cloud_attendance_token');
  if (!token) {
    return res.status(503).json({
      error: 'Connect this PC to the school server and sign in again to use parent chat.',
    });
  }
  const path = `/api/attendance/admin/chat${req.url || ''}`;
  const url = `${engine().cloudUrl()}${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method: req.method, headers };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.file?.buffer) {
      const form = new FormData();
      if (req.body?.body) form.append('body', String(req.body.body));
      form.append(
        'file',
        new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' }),
        req.file.originalname || 'file'
      );
      init.body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(req.body || {});
    }
  }

  let upstream;
  try {
    upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    return res.status(502).json({
      error: err?.message || 'Could not reach the school server for parent chat.',
    });
  }

  if (upstream.status === 401) {
    meta().setMeta('cloud_attendance_token', '');
    return res.status(401).json({
      error: 'Sign in again to use parent chat from this PC.',
    });
  }

  const contentType = upstream.headers.get('content-type') || '';
  res.status(upstream.status);
  if (contentType.includes('application/json')) {
    const data = await upstream.json().catch(() => ({}));
    return res.json(data);
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (contentType) res.set('Content-Type', contentType);
  const disp = upstream.headers.get('content-disposition');
  if (disp) res.set('Content-Disposition', disp);
  return res.send(buf);
}

module.exports = {
  captureFromLogin,
  proxyCloudAttendance,
};
