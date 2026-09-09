const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { getJwtSecret, requireAdmin } = require('../middleware');
const {
  SYNC_TABLES,
  UPSERT_ORDER,
  DELETE_ORDER,
  assertSafeTable,
} = require('./tables');
const { toWirePayload, shouldOmitWiredRow } = require('./identity');
const { applyMutation, isSkippableApplyError, skipReason } = require('./apply');
const { notifyGuardianOnCheck } = require('../smsService');
const { dispatchParentAppNotification } = require('../parentNotify');

const PAIR_TTL_MS = 10 * 60 * 1000;
const DEVICE_TOKEN_DAYS = 365;

function signDeviceToken(deviceId) {
  return jwt.sign(
    { typ: 'sync_device', sub: deviceId },
    getJwtSecret(),
    { expiresIn: `${DEVICE_TOKEN_DAYS}d` }
  );
}

function verifyDeviceToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(auth.slice(7).trim(), getJwtSecret());
    if (payload.typ !== 'sync_device') return null;
    return payload;
  } catch {
    return null;
  }
}

function requireDevice(req, res, next) {
  const payload = verifyDeviceToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized device' });
  req.syncDevice = payload;
  return next();
}

async function logNotify(kind, studentId, yearId, date) {
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO sync_notify_log (kind, student_id, academic_year_id, attendance_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (kind, student_id, academic_year_id, attendance_date) DO NOTHING`,
      [kind, studentId, yearId, date]
    );
    return (rowCount || 0) > 0;
  } catch {
    return false;
  }
}

async function maybeNotifyNewRecord(uuid) {
  const { rows } = await pool.query(
    `SELECT r.*, s.full_name, s.guardian_name, s.contact, s.class_id, s.id AS student_pk
     FROM attendance_records r
     JOIN attendance_students s ON s.id = r.student_id
     WHERE r.uuid = $1`,
    [uuid]
  );
  const record = rows[0];
  if (!record) return;
  const kind = record.check_type;
  const first = await logNotify(
    kind,
    record.student_id,
    record.academic_year_id,
    record.attendance_date
  );
  if (!first) return;
  const student = {
    id: record.student_pk,
    full_name: record.full_name,
    guardian_name: record.guardian_name,
    contact: record.contact,
    class_id: record.class_id,
  };
  notifyGuardianOnCheck({
    student,
    record,
    academicYearId: record.academic_year_id,
  }).catch((err) => console.error('[sync] notify', err.message || err));
  dispatchParentAppNotification({
    academicYearId: record.academic_year_id,
    student,
    kind: kind,
    recordedAt: record.recorded_at,
    attendanceDate: record.attendance_date,
  }).catch((err) => console.error('[sync] parent app notify', err.message || err));
}

function createCloudSyncRouter() {
  const express = require('express');
  const { activityLogger } = require('../activityLog');
  const router = express.Router();
  router.use(activityLogger());

  router.post('/pair-code', requireAdmin(), async (req, res) => {
    try {
      const code = String(crypto.randomInt(100000, 999999));
      const expires = new Date(Date.now() + PAIR_TTL_MS).toISOString();
      await pool.query(
        `INSERT INTO sync_pair_codes (code, expires_at, created_by)
         VALUES ($1, $2, $3)`,
        [code, expires, req.attendanceUser?.sub || null]
      );
      return res.json({
        code,
        expiresAt: expires,
        ttlSeconds: PAIR_TTL_MS / 1000,
      });
    } catch (err) {
      console.error('[sync] pair-code', err);
      return res.status(500).json({ error: 'Could not create pairing code' });
    }
  });

  router.post('/register', async (req, res) => {
    try {
      const { deviceId, deviceName, pairingCode, appVersion, username, password } =
        req.body || {};
      const id = String(deviceId || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'deviceId required' });
      }

      const code = String(pairingCode || '').trim();
      const userName = String(username || '').trim();
      if (code) {
        const { rows } = await pool.query(
          `SELECT id FROM sync_pair_codes
           WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
           ORDER BY id DESC LIMIT 1`,
          [code]
        );
        if (!rows[0]) {
          return res.status(401).json({ error: 'Invalid or expired pairing code' });
        }
        await pool.query(`UPDATE sync_pair_codes SET used_at = NOW() WHERE id = $1`, [
          rows[0].id,
        ]);
      } else if (userName && password) {
        const bcrypt = require('../bcryptCompat');
        const { rows } = await pool.query(
          'SELECT * FROM attendance_users WHERE username = $1',
          [userName]
        );
        const user = rows[0];
        const ok = user && (await bcrypt.compare(String(password), user.password_hash));
        if (!ok) {
          return res.status(401).json({
            error:
              'This username and password do not exist on the school server. Use the same login as the online attendance app.',
          });
        }
      } else {
        return res.status(400).json({ error: 'Login credentials required' });
      }

      await pool.query(
        `INSERT INTO sync_devices (device_id, device_name, app_version, last_seen_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           device_name = EXCLUDED.device_name,
           app_version = EXCLUDED.app_version,
           last_seen_at = NOW()`,
        [id, String(deviceName || 'Desktop').slice(0, 120), String(appVersion || '').slice(0, 40)]
      );
      const token = signDeviceToken(id);
      return res.json({
        deviceToken: token,
        serverTime: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[sync] register', err);
      return res.status(500).json({ error: 'Registration failed' });
    }
  });

  router.get('/snapshot', requireDevice, async (req, res) => {
    try {
      const tables = {};
      for (const table of SYNC_TABLES) {
        const { rows } = await pool.query(`SELECT * FROM ${assertSafeTable(table)}`);
        const wired = [];
        for (const row of rows) {
          const payload = await toWirePayload((sql, p) => pool.query(sql, p), table, row);
          if (shouldOmitWiredRow(table, payload)) {
            console.warn(`[sync] skip ${table} ${row.uuid} unresolved parent uuid`);
            continue;
          }
          wired.push({
            uuid: row.uuid,
            serverId: row.id ?? null,
            payload,
          });
        }
        tables[table] = wired;
      }
      const cursorRow = await pool.query(
        `SELECT COALESCE(MAX(id), 0)::int AS cursor FROM sync_change_log`
      );
      return res.json({
        tables,
        cursor: String(cursorRow.rows[0]?.cursor || 0),
        serverTime: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[sync] snapshot', err);
      return res.status(500).json({ error: 'Snapshot failed' });
    }
  });

  router.post('/push', requireDevice, async (req, res) => {
    try {
      const mutations = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
      const accepted = [];
      const rejected = [];
      const q = (sql, p) => pool.query(sql, p);

      const deletes = mutations.filter((m) => m.op === 'delete');
      const upserts = mutations.filter((m) => m.op !== 'delete');
      const ordered = [
        ...upserts.sort(
          (a, b) => UPSERT_ORDER.indexOf(a.table) - UPSERT_ORDER.indexOf(b.table)
        ),
        ...deletes.sort(
          (a, b) => DELETE_ORDER.indexOf(a.table) - DELETE_ORDER.indexOf(b.table)
        ),
      ];

      const overflow = ordered.slice(200);
      for (const m of overflow) {
        rejected.push({
          uuid: m?.uuid,
          table: m?.table,
          code: 'batch_limit',
          message: 'Too many changes in one request; retry the rest',
        });
      }

      for (const m of ordered.slice(0, 200)) {
        try {
          if (!m?.uuid || !m?.table) {
            rejected.push({ uuid: m?.uuid, code: 'invalid', message: 'Missing uuid/table' });
            continue;
          }
          const result = await applyMutation(q, m);
          accepted.push({
            uuid: m.uuid,
            table: m.table,
            aliased: result?.aliased || false,
          });
          if (m.table === 'attendance_records' && m.op !== 'delete') {
            await maybeNotifyNewRecord(m.uuid);
          }
        } catch (err) {
          if (isSkippableApplyError(err)) {
            console.warn(`[sync] skip ${m.table} ${m.uuid} ${skipReason(err)}`);
          }
          rejected.push({
            uuid: m.uuid,
            code: err.code || 'error',
            message: err.message || 'apply failed',
          });
        }
      }

      await pool.query(
        `UPDATE sync_devices SET last_seen_at = NOW() WHERE device_id = $1`,
        [req.syncDevice.sub]
      );
      return res.json({ accepted, rejected });
    } catch (err) {
      console.error('[sync] push', err);
      return res.status(500).json({ error: 'Push failed' });
    }
  });

  router.get('/pull', requireDevice, async (req, res) => {
    try {
      const cursor = Number(req.query.cursor || 0) || 0;
      const { rows } = await pool.query(
        `SELECT id, table_name, uuid, op, row_version, at
         FROM sync_change_log
         WHERE id > $1
         ORDER BY id ASC
         LIMIT 300`,
        [cursor]
      );
      const changes = [];
      const q = (sql, p) => pool.query(sql, p);
      for (const log of rows) {
        if (!SYNC_TABLES.includes(log.table_name)) continue;
        let payload = null;
        if (log.op !== 'delete') {
          const { rows: found } = await pool.query(
            `SELECT * FROM ${assertSafeTable(log.table_name)} WHERE uuid = $1`,
            [log.uuid]
          );
          if (found[0]) {
            payload = await toWirePayload(q, log.table_name, found[0]);
            if (shouldOmitWiredRow(log.table_name, payload)) {
              console.warn(`[sync] skip ${log.table_name} ${log.uuid} unresolved parent uuid`);
              continue;
            }
          }
        }
        changes.push({
          cursor: log.id,
          table: log.table_name,
          uuid: log.uuid,
          op: log.op === 'DELETE' ? 'delete' : log.op === 'delete' ? 'delete' : 'upsert',
          payload,
        });
      }
      const nextCursor = rows.length ? String(rows[rows.length - 1].id) : String(cursor);
      return res.json({ changes, cursor: nextCursor, hasMore: rows.length === 300 });
    } catch (err) {
      console.error('[sync] pull', err);
      return res.status(500).json({ error: 'Pull failed' });
    }
  });

  router.post('/media', requireDevice, async (req, res) => {
    try {
      const { uuid, kind, dataBase64, mime } = req.body || {};
      if (!uuid || !dataBase64) {
        return res.status(400).json({ error: 'uuid and dataBase64 required' });
      }
      const { saveImageBuffer } = require('../helpers');
      const buf = Buffer.from(String(dataBase64), 'base64');
      const ext = String(mime || '').includes('png') ? 'png' : 'jpg';
      const url = await saveImageBuffer(buf, ext, kind === 'school_logo' ? 'logo' : 'student');
      if (kind === 'school_logo') {
        await pool.query(
          `UPDATE attendance_settings SET school_logo_url = $1, updated_at = NOW()
           WHERE uuid = $2`,
          [url, uuid]
        );
      } else {
        await pool.query(
          `UPDATE attendance_students SET photo_url = $1 WHERE uuid = $2`,
          [url, uuid]
        );
      }
      return res.json({ ok: true, url });
    } catch (err) {
      console.error('[sync] media', err);
      return res.status(500).json({ error: 'Media upload failed' });
    }
  });

  router.get('/media/:uuid', requireDevice, async (req, res) => {
    try {
      const uuid = req.params.uuid;
      const { rows: students } = await pool.query(
        `SELECT photo_url FROM attendance_students WHERE uuid = $1`,
        [uuid]
      );
      let url = students[0]?.photo_url;
      if (!url) {
        const { rows: settings } = await pool.query(
          `SELECT school_logo_url FROM attendance_settings WHERE uuid = $1`,
          [uuid]
        );
        url = settings[0]?.school_logo_url;
      }
      if (!url) return res.status(404).json({ error: 'No media' });
      const { readPhotoBuffer } = require('../storage');
      const photo = await readPhotoBuffer(url);
      if (!photo) return res.status(502).json({ error: 'Photo unavailable' });
      res.set('Content-Type', photo.contentType);
      return res.send(photo.buffer);
    } catch (err) {
      console.error('[sync] media get', err);
      return res.status(500).json({ error: 'Media download failed' });
    }
  });

  return router;
}

module.exports = {
  createCloudSyncRouter,
};
