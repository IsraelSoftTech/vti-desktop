const { pool } = require('./db');

const KIND_LABELS = {
  check_in: 'Check-in',
  check_out: 'Check-out',
  pair_summary: 'Pair summary',
  daily_summary: 'Daily summary',
  absence: 'Absence',
  missed_checkout: 'Missed checkout',
  announcement: 'Announcement',
  other: 'Other',
};

function mapSmsRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    kindLabel: KIND_LABELS[row.kind] || row.kind,
    studentId: row.student_id,
    studentName: row.student_name || null,
    academicYearId: row.academic_year_id,
    mobile: row.mobile,
    body: row.body,
    status: row.status,
    providerStatus: row.provider_status,
    messageId: row.message_id,
    smsClientId: row.sms_client_id,
    errorCode: row.error_code,
    errorDescription: row.error_description,
    submittedAt: row.submitted_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
  };
}

async function insertSmsLog({
  kind = 'other',
  studentId = null,
  academicYearId = null,
  mobile,
  body,
  status = 'queued',
}) {
  const { rows } = await pool.query(
    `INSERT INTO attendance_sms_messages
      (kind, student_id, academic_year_id, mobile, body, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [kind, studentId, academicYearId, mobile || null, body || '', status]
  );
  return rows[0];
}

async function updateSmsLog(id, patch) {
  const fields = [];
  const values = [];
  const map = {
    status: 'status',
    providerStatus: 'provider_status',
    messageId: 'message_id',
    smsClientId: 'sms_client_id',
    errorCode: 'error_code',
    errorDescription: 'error_description',
    submittedAt: 'submitted_at',
    sentAt: 'sent_at',
    deliveredAt: 'delivered_at',
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      values.push(patch[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }
  if (!fields.length) return null;
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE attendance_sms_messages SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function applyDeliveryReports(dlrlist) {
  const items = Array.isArray(dlrlist) ? dlrlist : [];
  const applied = [];
  for (const item of items) {
    const messageId = String(item?.messageid || item?.messageId || '').trim();
    if (!messageId) {
      applied.push({ ...item, status: 0 });
      continue;
    }
    const rawStatus = item?.status;
    const delivered =
      rawStatus === 1 ||
      rawStatus === '1' ||
      String(rawStatus || '').toUpperCase() === 'DELIVRD';
    const undelivered =
      rawStatus === 0 ||
      rawStatus === '0' ||
      String(rawStatus || '').toUpperCase() === 'UNDELIV';
    const status = delivered ? 'delivered' : undelivered ? 'undelivered' : 'sent';
    const { rowCount } = await pool.query(
      `UPDATE attendance_sms_messages
       SET status = $2,
           provider_status = $3,
           submitted_at = COALESCE($4, submitted_at),
           sent_at = COALESCE($5, sent_at),
           delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE($6, NOW()) ELSE delivered_at END
       WHERE message_id = $1`,
      [
        messageId,
        status,
        String(rawStatus ?? ''),
        item.submittime || null,
        item.senttime || null,
        item.deliverytime || null,
      ]
    );
    applied.push({
      ...item,
      status: rowCount ? 1 : 0,
    });
  }
  return applied;
}

async function listSmsMessages({
  page = 1,
  pageSize = 25,
  status = '',
  kind = '',
  q = '',
} = {}) {
  const where = [];
  const params = [];
  if (status) {
    params.push(status);
    where.push(`m.status = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    where.push(`m.kind = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where.push(
      `(LOWER(COALESCE(m.mobile, '')) LIKE $${params.length} OR LOWER(COALESCE(m.body, '')) LIKE $${params.length} OR LOWER(COALESCE(s.full_name, '')) LIKE $${params.length})`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await pool.query(
    `SELECT COUNT(*) AS total
     FROM attendance_sms_messages m
     LEFT JOIN attendance_students s ON s.id = m.student_id
     ${whereSql}`,
    params
  );
  const total = Number(countRes.rows[0]?.total || 0);
  const size = Math.min(100, Math.max(5, Number(pageSize) || 25));
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  params.push(size, (safePage - 1) * size);
  const { rows } = await pool.query(
    `SELECT m.*, s.full_name AS student_name
     FROM attendance_sms_messages m
     LEFT JOIN attendance_students s ON s.id = m.student_id
     ${whereSql}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    items: rows.map(mapSmsRow),
    total,
    page: safePage,
    pageSize: size,
  };
}

async function smsDashboardStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN created_at >= CURRENT_DATE THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN status IN ('sent', 'delivered') AND created_at >= CURRENT_DATE THEN 1 ELSE 0 END) AS sent_today,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN status IN ('failed', 'undelivered') THEN 1 ELSE 0 END) AS failed
    FROM attendance_sms_messages
  `);
  const r = rows[0] || {};
  return {
    total: Number(r.total || 0),
    today: Number(r.today || 0),
    sentToday: Number(r.sent_today || 0),
    delivered: Number(r.delivered || 0),
    failed: Number(r.failed || 0),
  };
}

module.exports = {
  KIND_LABELS,
  mapSmsRow,
  insertSmsLog,
  updateSmsLog,
  applyDeliveryReports,
  listSmsMessages,
  smsDashboardStats,
};
