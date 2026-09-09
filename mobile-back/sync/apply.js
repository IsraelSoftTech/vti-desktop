const { assertSafeTable, RECORD_NATURAL_KEY, conflictKeySets } = require('./tables');
const { fromWirePayload } = require('./identity');

const DATE_ONLY_COLS = new Set(['attendance_date', 'start_date', 'end_date', 'dob']);

function toDateOnly(value) {
  if (value == null || value === '') return value;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

const COLUMNS = {
  attendance_users: [
    'username',
    'password_hash',
    'full_name',
    'role',
    'notification_sound',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_academic_years: [
    'name',
    'start_date',
    'end_date',
    'is_active',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_classes: [
    'name',
    'academic_year_id',
    'school_start_time',
    'school_end_time',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_departments: [
    'name',
    'academic_year_id',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_students: [
    'full_name',
    'sex',
    'dob',
    'place_of_birth',
    'guardian_name',
    'department',
    'contact',
    'photo_url',
    'face_descriptor',
    'barcode',
    'class_id',
    'academic_year_id',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_records: [
    'student_id',
    'academic_year_id',
    'check_type',
    'method',
    'attendance_date',
    'recorded_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_student_day_scans: [
    'student_id',
    'academic_year_id',
    'attendance_date',
    'checked_in_at',
    'checked_out_at',
    'missed_checkout_sms_sent_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_absence_days: [
    'student_id',
    'academic_year_id',
    'attendance_date',
    'marked_at',
    'sms_sent_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_settings: [
    'academic_year_id',
    'school_name',
    'school_start_time',
    'school_end_time',
    'check_in_grace_minutes_after_start',
    'allow_checkout_before_end_time',
    'notify_sms_enabled',
    'notify_whatsapp_enabled',
    'guardian_messages_per_day',
    'check_in_opens_at',
    'absent_checkin_reminder_minutes',
    'missed_checkout_reminder_minutes',
    'school_logo_url',
    'school_week_days',
    'notify_app_enabled',
    'notify_sms_normal',
    'guardian_message_templates',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_fee_heads: [
    'name',
    'academic_year_id',
    'trashed_at',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_class_fees: [
    'class_id',
    'fee_head_id',
    'academic_year_id',
    'amount',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_fee_payments: [
    'student_id',
    'fee_head_id',
    'academic_year_id',
    'amount',
    'paid_at',
    'note',
    'channel',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
  attendance_fee_discounts: [
    'academic_year_id',
    'student_id',
    'class_id',
    'amount',
    'note',
    'created_at',
    'uuid',
    'updated_at',
    'row_version',
    'origin_device',
  ],
};

function pickColumns(table, row) {
  const allowed = COLUMNS[table];
  if (!allowed) throw new Error(`No columns for ${table}`);
  const out = {};
  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(row, col)) {
      let value = row[col];
      if (col === 'guardian_message_templates' && value != null && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      out[col] = DATE_ONLY_COLS.has(col) && value != null && value !== '' ? toDateOnly(value) : value;
    }
  }
  return out;
}

function isUniqueError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return (
    code === '23505' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    /UNIQUE constraint failed/i.test(msg)
  );
}

function isNotNullError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return (
    code === '23502' ||
    code === 'SQLITE_CONSTRAINT_NOTNULL' ||
    /NOT NULL constraint failed/i.test(msg)
  );
}

function isSkippableApplyError(err) {
  return err?.code === 'missing_fk' || isNotNullError(err);
}

function skipReason(err) {
  if (err?.code === 'missing_fk') return `missing_fk:${err.fk || ''}`;
  return String(err?.code || err?.message || 'constraint');
}

async function mergeAttendanceRecord(queryFn, incoming) {
  const keyVals = RECORD_NATURAL_KEY.map((k) => incoming[k]);
  if (keyVals.some((v) => v == null)) {
    const err = new Error('missing_fk:student_uuid');
    err.code = 'missing_fk';
    err.fk = 'student_uuid';
    throw err;
  }

  const existing = await queryFn(
    `SELECT * FROM attendance_records
     WHERE student_id = $1 AND academic_year_id = $2
       AND attendance_date = $3 AND check_type = $4
     LIMIT 1`,
    keyVals
  );
  const other = existing.rows[0];
  if (!other || other.uuid === incoming.uuid) {
    return upsertByUuid(queryFn, 'attendance_records', incoming);
  }
  const incomingTs = Date.parse(incoming.recorded_at || '') || 0;
  const otherTs = Date.parse(other.recorded_at || '') || 0;
  if (incomingTs < otherTs) {
    await queryFn(`DELETE FROM attendance_records WHERE uuid = $1`, [other.uuid]);
    return upsertByUuid(queryFn, 'attendance_records', incoming);
  }
  return { skipped: true, winner: other.uuid };
}

async function findRowByKeys(queryFn, table, data) {
  for (const keys of conflictKeySets(table)) {
    if (keys.some((k) => data[k] == null)) continue;
    const where = keys
      .map((c, i) =>
        DATE_ONLY_COLS.has(c)
          ? `substr(CAST(${c} AS TEXT), 1, 10) = $${i + 1}`
          : `${c} = $${i + 1}`
      )
      .join(' AND ');
    const vals = keys.map((c) =>
      DATE_ONLY_COLS.has(c) ? toDateOnly(data[c]) : data[c]
    );
    const hit = await queryFn(
      `SELECT uuid FROM ${table} WHERE ${where} LIMIT 1`,
      vals
    );
    if (hit.rows[0]) return hit.rows[0];
  }
  return null;
}

async function updateExistingRow(queryFn, table, data, targetUuid) {
  const cols = Object.keys(data);
  const updateCols = cols.filter((c) => c !== 'uuid');
  if (data.uuid && data.uuid !== targetUuid) {
    updateCols.push('uuid');
  }
  if (!updateCols.length) return { uuid: data.uuid || targetUuid };
  const sets = updateCols.map((c, i) => `${c} = $${i + 1}`);
  const vals = updateCols.map((c) => data[c]);
  vals.push(targetUuid);
  await queryFn(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE uuid = $${vals.length}`,
    vals
  );
  return {
    uuid: data.uuid || targetUuid,
    aliased: Boolean(data.uuid && data.uuid !== targetUuid),
  };
}

async function upsertByUuid(queryFn, table, row) {
  assertSafeTable(table);
  const data = pickColumns(table, row);
  if (!data.uuid) throw new Error('uuid required');

  const found = await queryFn(`SELECT uuid FROM ${table} WHERE uuid = $1`, [data.uuid]);
  if (found.rows[0]) {
    return updateExistingRow(queryFn, table, data, data.uuid);
  }

  const existing = await findRowByKeys(queryFn, table, data);
  if (existing) {
    return updateExistingRow(queryFn, table, data, existing.uuid);
  }

  const cols = Object.keys(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  try {
    await queryFn(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      cols.map((c) => data[c])
    );
  } catch (err) {
    if (isUniqueError(err)) {
      const hit = await findRowByKeys(queryFn, table, data);
      if (hit) {
        return updateExistingRow(queryFn, table, data, hit.uuid);
      }
      return { uuid: data.uuid, skipped: true };
    }
    throw err;
  }
  return { uuid: data.uuid };
}

async function deleteByUuid(queryFn, table, uuid) {
  assertSafeTable(table);
  await queryFn(`DELETE FROM ${table} WHERE uuid = $1`, [uuid]);
}

async function applyMutation(queryFn, mutation) {
  const table = assertSafeTable(mutation.table);
  if (mutation.op === 'delete') {
    await deleteByUuid(queryFn, table, mutation.uuid);
    return { uuid: mutation.uuid, op: 'delete' };
  }
  const row = await fromWirePayload(queryFn, table, mutation.payload || {});
  row.uuid = mutation.uuid || row.uuid;
  if (table === 'attendance_records') {
    return mergeAttendanceRecord(queryFn, row);
  }
  return upsertByUuid(queryFn, table, row);
}

module.exports = {
  COLUMNS,
  pickColumns,
  upsertByUuid,
  deleteByUuid,
  applyMutation,
  mergeAttendanceRecord,
  isUniqueError,
  isNotNullError,
  isSkippableApplyError,
  skipReason,
};
