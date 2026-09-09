const { pool } = require('./db');
const { isDesktop } = require('./runtime');
const { verifyAttendanceToken } = require('./middleware');

const SECRET_KEYS = /password|token|hash|base64|photo|descriptor|file|secret|authorization|pairing/i;

function clientSource(req) {
  const header = String(req.headers['x-mpasat-client'] || '').trim().toLowerCase();
  if (header === 'desktop' || header === 'mobile' || header === 'web') return header;
  if (isDesktop()) return 'desktop';
  const ua = String(req.headers['user-agent'] || '');
  if (/okhttp|expo|cfnetwork|darwin/i.test(ua) && !/mozilla/i.test(ua)) return 'mobile';
  if (/mozilla/i.test(ua)) return 'web';
  return 'api';
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req.socket?.remoteAddress || null;
}

function redact(value) {
  if (value == null) return null;
  if (typeof value !== 'object') {
    const text = String(value);
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  }
  const out = Array.isArray(value) ? [] : {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) {
      out[key] = '[redacted]';
    } else if (item && typeof item === 'object') {
      out[key] = Array.isArray(item) ? `[${item.length} items]` : redact(item);
    } else {
      out[key] = item;
    }
  }
  const json = JSON.stringify(out);
  return json.length > 1800 ? `${json.slice(0, 1800)}…` : json;
}

function summarize(req, status) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || req.url || '').split('?')[0];
  const ok = status < 400;
  const name = req.body?.fullName || req.body?.name || req.body?.username || null;
  const barcode = req.body?.barcode || null;
  const amount = req.body?.amount != null ? String(req.body.amount) : null;

  const mutationCount = Array.isArray(req.body?.mutations) ? req.body.mutations.length : 0;

  const rules = [
    [/\/auth\/login$/, 'login', ok ? 'Signed in' : 'Failed sign-in'],
    [/\/auth\/logout$/, 'logout', 'Signed out'],
    [/\/auth\/register$/, 'register', ok ? 'Registered a parent account' : 'Parent registration failed'],
    [/\/me\/password$/, 'account.update', ok ? 'Updated account credentials' : 'Failed to update account credentials'],
    [/\/academic-years\/\d+\/activate$/, 'year.activate', 'Activated an academic year'],
    [/\/academic-years\/\d+$/, 'year.update', method === 'DELETE' ? 'Deleted an academic year' : 'Updated an academic year'],
    [/\/academic-years$/, 'year.create', 'Created an academic year'],
    [/\/classes\/\d+$/, 'class.update', method === 'DELETE' ? 'Deleted a class' : 'Updated a class'],
    [/\/classes$/, 'class.create', 'Created a class'],
    [/\/students\/bulk/, 'student.bulk', 'Uploaded students from a spreadsheet'],
    [/\/students\/\d+$/, 'student.update', method === 'DELETE' ? 'Deleted a student' : 'Updated a student'],
    [/\/students$/, 'student.write', method === 'DELETE' ? 'Deleted all students' : 'Registered a student'],
    [/\/check$/, 'attendance.check', ok ? 'Recorded attendance' : 'Attendance check failed'],
    [/\/records\/\d+$/, 'attendance.delete', 'Deleted an attendance record'],
    [/\/records$/, 'attendance.clear', 'Cleared attendance records'],
    [/\/settings$/, 'settings.update', 'Updated school settings'],
    [/\/fees\/heads\/\d+\/restore$/, 'fee.head.restore', 'Restored a fee type'],
    [/\/fees\/heads\/\d+$/, 'fee.head.update', method === 'DELETE' ? 'Removed a fee type' : 'Updated a fee type'],
    [/\/fees\/heads$/, 'fee.head.create', 'Created a fee type'],
    [/\/fees\/classes\/bulk$/, 'fee.class.bulk', 'Saved class fees for multiple classes'],
    [/\/fees\/class\/\d+\/bulk$/, 'fee.class.bulk', 'Saved class fee amounts'],
    [/\/fees\/class\/\d+$/, 'fee.class.update', 'Updated a class fee'],
    [/\/fees\/class-fees\/\d+$/, 'fee.class.delete', 'Deleted a class fee'],
    [/\/fees\/payments\/\d+$/, 'fee.payment.update', method === 'DELETE' ? 'Deleted a fee payment' : 'Updated a fee payment'],
    [/\/fees\/payments$/, 'fee.payment.create', 'Recorded a fee payment'],
    [/\/fees\/discounts\/student$/, 'fee.discount.student', 'Saved a student discount'],
    [/\/fees\/discounts\/class$/, 'fee.discount.class', 'Saved a class discount'],
    [/\/fees\/discounts\/\d+$/, 'fee.discount.update', method === 'DELETE' ? 'Deleted a discount' : 'Updated a discount'],
    [/\/parent\/chat\/messages\/.*delete/, 'parent.chat.delete', 'Deleted a parent chat message'],
    [/\/parent\/chat/, 'parent.chat', 'Sent a parent chat message'],
    [/\/parent\/account$/, 'parent.delete', 'Deleted a parent account'],
    [/\/parent\/link$/, 'parent.link', 'Linked a parent to a student'],
    [/\/parent\/students/, 'parent.students', method === 'DELETE' ? 'Unlinked a student from a parent' : 'Linked a student to a parent'],
    [/\/parent\/devices$/, 'parent.device', 'Registered a parent device'],
    [/\/parent\/notifications/, 'parent.notify', 'Updated parent notifications'],
    [/\/parent\//, 'parent.update', 'Updated parent portal data'],
    [/\/admin\/chat\/.*delete/, 'admin.chat.delete', 'Deleted a staff chat message'],
    [/\/admin\/chat/, 'admin.chat', 'Sent a staff chat message'],
    [/\/pair-code$/, 'sync.pair', 'Generated a desktop pairing code'],
    [/\/push$/, 'sync.push', `Desktop uploaded ${mutationCount} change(s)`],
    [/\/media$/, 'sync.media', 'Uploaded media during desktop sync'],
    [/\/register$/, 'sync.register', 'Registered a desktop device'],
    [/\/connect$/, 'sync.connect', 'Connected desktop to the school server'],
    [/\/upload$/, 'sync.upload', 'Uploaded local records to the school server'],
    [/\/pull-now$/, 'sync.pull', 'Pulled records from the school server'],
    [/\/sync-now$/, 'sync.pull', 'Synced records from the school server'],
  ];

  for (const [test, action, summary] of rules) {
    if (test.test(path)) {
      let text = summary;
      if (name) text += `: ${name}`;
      else if (barcode) text += ` (${barcode})`;
      if (amount && /payment|discount/.test(action)) text += ` · ${amount}`;
      if (!ok) text += ` (HTTP ${status})`;
      return { action, summary: text };
    }
  }

  const fallback = `${method} ${path}`;
  return {
    action: `${method.toLowerCase()}.${path.replace(/^\//, '').replace(/\//g, '.') || 'request'}`,
    summary: ok ? fallback : `${fallback} failed (HTTP ${status})`,
  };
}

function skipPath(req) {
  const method = String(req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const path = String(req.path || '').split('?')[0];
  if (path === '/sms/dlr' || path.startsWith('/sms/dlr')) return true;
  if (path === '/activity-logs' || path.startsWith('/activity-logs')) return true;
  if (path === '/parent/account' || path.endsWith('/parent/account')) return true;
  return false;
}

async function logActivity(entry = {}) {
  try {
    const summary = String(entry.summary || '').trim().slice(0, 500);
    if (!summary) return;
    await pool.query(
      `INSERT INTO attendance_activity_logs (
         actor_id, actor_username, actor_role, action, entity, summary, detail,
         method, path, status_code, ip, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.actorId ?? null,
        entry.actorUsername ? String(entry.actorUsername).slice(0, 128) : null,
        entry.actorRole ? String(entry.actorRole).slice(0, 64) : null,
        String(entry.action || 'event').slice(0, 80),
        entry.entity ? String(entry.entity).slice(0, 64) : null,
        summary,
        entry.detail ? String(entry.detail).slice(0, 2000) : null,
        entry.method ? String(entry.method).slice(0, 12) : null,
        entry.path ? String(entry.path).slice(0, 240) : null,
        entry.statusCode ?? null,
        entry.ip ? String(entry.ip).slice(0, 64) : null,
        entry.source ? String(entry.source).slice(0, 24) : null,
      ]
    );
  } catch (err) {
    console.warn('[activity-log]', err.message || err);
  }
}

function activityLogger() {
  return (req, res, next) => {
    res.on('finish', () => {
      if (skipPath(req)) return;
      const tokenUser = req.attendanceUser || verifyAttendanceToken(req);
      const { action, summary } = summarize(req, res.statusCode);
      void logActivity({
        actorId: tokenUser?.sub ?? null,
        actorUsername:
          tokenUser?.username || req.syncDevice?.sub || req.body?.username || null,
        actorRole: tokenUser?.role || (req.syncDevice ? 'sync_device' : null),
        action,
        entity: action.split('.')[0] || null,
        summary,
        detail: redact(req.body),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: clientIp(req),
        source: clientSource(req),
      });
    });
    next();
  };
}

async function listActivityLogs({ limit = 200, offset = 0, q = '' } = {}) {
  const take = Math.min(500, Math.max(1, Number(limit) || 200));
  const skip = Math.max(0, Number(offset) || 0);
  const query = String(q || '').trim();
  const like = `%${query}%`;
  const { rows } = await pool.query(
    `SELECT id, occurred_at, actor_id, actor_username, actor_role, action, entity,
            summary, detail, method, path, status_code, ip, source
     FROM attendance_activity_logs
     WHERE ($1 = '' OR summary ILIKE $2 OR COALESCE(actor_username, '') ILIKE $2
            OR action ILIKE $2 OR COALESCE(path, '') ILIKE $2)
     ORDER BY id DESC
     LIMIT $3 OFFSET $4`,
    [query, like, take, skip]
  );
  const count = await pool.query(
    `SELECT COUNT(*) AS c FROM attendance_activity_logs
     WHERE ($1 = '' OR summary ILIKE $2 OR COALESCE(actor_username, '') ILIKE $2
            OR action ILIKE $2 OR COALESCE(path, '') ILIKE $2)`,
    [query, like]
  );
  return { items: rows, total: Number(count.rows[0]?.c || 0) };
}

async function clearActivityLogs({ actor, source } = {}) {
  await pool.query('DELETE FROM attendance_activity_logs');
  await logActivity({
    actorId: actor?.sub ?? null,
    actorUsername: actor?.username || null,
    actorRole: actor?.role || null,
    action: 'logs.clear',
    entity: 'logs',
    summary: 'Cleared activity logs',
    source: source || 'web',
  });
}

module.exports = {
  logActivity,
  activityLogger,
  listActivityLogs,
  clearActivityLogs,
  clientSource,
};
