const os = require('os');
const fs = require('fs');
const { rawSqlite } = require('../dbSqlite');
const { pool } = require('../db');
const { UPSERT_ORDER, DELETE_ORDER, SYNC_TABLES, assertSafeTable } = require('./tables');
const { toWirePayload } = require('./identity');
const { applyMutation, isUniqueError, isSkippableApplyError, skipReason } = require('./apply');
const {
  setApplyingRemote,
  getMeta,
  setMeta,
  pendingOutbox,
  enqueueAllLocalRows,
  deleteOutbox,
  markOutboxError,
  outboxCount,
} = require('./outbox');
const { urlToAbsPath } = require('../storageLocal');
const DEFAULT_CLOUD_URL = (
  process.env.DESKTOP_CLOUD_URL || 'https://api.vtispace.com'
).replace(/\/$/, '');

let inFlight = false;
let pullJob = null;
let pushJob = null;
let lastStatus = {
  state: 'offline',
  message: 'Not connected to the school server',
  lastSyncAt: null,
  pending: 0,
  error: null,
  paired: false,
};

function status() {
  return {
    ...lastStatus,
    pending: outboxCount(),
    paired: Boolean(getMeta('device_token')),
    cloudUrl: getMeta('cloud_url') || '',
  };
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch, pending: outboxCount() };
}

function cloudUrl() {
  return String(getMeta('cloud_url') || DEFAULT_CLOUD_URL).replace(/\/$/, '');
}

function authHeaders() {
  const token = getMeta('device_token');
  return {
    'Content-Type': 'application/json',
    'X-MPASAT-Client': 'desktop',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function cloudFetch(pathname, options = {}) {
  const { timeoutMs = 20000, ...fetchOpts } = options;
  const base = cloudUrl();
  const url = `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  let res;
  try {
    res = await fetch(url, {
      ...fetchOpts,
      headers: { ...authHeaders(), ...(fetchOpts.headers || {}) },
      signal: fetchOpts.signal || AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      const wrapped = new Error('The school server took too long to respond.');
      wrapped.code = 'timeout';
      throw wrapped;
    }
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 && String(pathname).includes('/api/sync')) {
      const err = new Error(
        'The school server is not ready for desktop sync yet. You can keep working on this PC.'
      );
      err.status = 404;
      err.code = 'unavailable';
      err.data = data;
      throw err;
    }
    if (res.status === 401) {
      const err = new Error(
        data.error ||
          'This login does not exist on the school server. Use the same username and password as the online app.'
      );
      err.status = 401;
      err.code = 'auth';
      err.data = data;
      throw err;
    }
    if (res.status >= 500) {
      const err = new Error(
        'The school server is down or restarting. Try again in a moment.'
      );
      err.status = res.status;
      err.code = 'unavailable';
      err.data = data;
      throw err;
    }
    const err = new Error(data.error || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function online() {
  const base = cloudUrl();
  try {
    await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    /* try attendance root */
  }
  try {
    await fetch(`${base}/api/attendance/`, { signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

function isLocalMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const value = url.trim();
  return (
    value.startsWith('/api/attendance/media/') || value.startsWith('local://')
  );
}

async function uploadPendingMedia(row) {
  const urls = {};
  if (row.op !== 'upsert') return urls;
  if (row.table_name === 'attendance_students') {
    const student = rawSqlite()
      .prepare('SELECT uuid, photo_url FROM attendance_students WHERE uuid = ?')
      .get(row.uuid);
    const abs = student ? urlToAbsPath(student.photo_url) : null;
    if (abs && fs.existsSync(abs)) {
      const buf = fs.readFileSync(abs);
      const data = await cloudFetch('/api/sync/media', {
        method: 'POST',
        timeoutMs: 120000,
        body: JSON.stringify({
          uuid: student.uuid,
          kind: 'student_photo',
          mime: 'image/jpeg',
          dataBase64: buf.toString('base64'),
        }),
      });
      if (data.url) urls.photo_url = data.url;
    }
  }
  if (row.table_name === 'attendance_settings') {
    const settings = rawSqlite()
      .prepare('SELECT uuid, school_logo_url FROM attendance_settings WHERE uuid = ?')
      .get(row.uuid);
    const abs = settings ? urlToAbsPath(settings.school_logo_url) : null;
    if (abs && fs.existsSync(abs)) {
      const buf = fs.readFileSync(abs);
      const data = await cloudFetch('/api/sync/media', {
        method: 'POST',
        timeoutMs: 120000,
        body: JSON.stringify({
          uuid: settings.uuid,
          kind: 'school_logo',
          mime: 'image/png',
          dataBase64: buf.toString('base64'),
        }),
      });
      if (data.url) urls.school_logo_url = data.url;
    }
  }
  return urls;
}

function applyMediaUrls(table, payload, mediaUrls) {
  if (!payload) return payload;
  const next = { ...payload };
  if (table === 'attendance_students') {
    if (mediaUrls.photo_url) next.photo_url = mediaUrls.photo_url;
    else if (isLocalMediaUrl(next.photo_url)) delete next.photo_url;
  }
  if (table === 'attendance_settings') {
    if (mediaUrls.school_logo_url) next.school_logo_url = mediaUrls.school_logo_url;
    else if (isLocalMediaUrl(next.school_logo_url)) delete next.school_logo_url;
  }
  return next;
}

async function buildMutation(outboxRow, mediaUrls = {}) {
  assertSafeTable(outboxRow.table_name);
  const q = (sql, p) => pool.query(sql, p);
  if (outboxRow.op === 'delete') {
    return {
      op: 'delete',
      table: outboxRow.table_name,
      uuid: outboxRow.uuid,
    };
  }
  const found = await pool.query(
    `SELECT * FROM ${outboxRow.table_name} WHERE uuid = $1`,
    [outboxRow.uuid]
  );
  const row = found.rows[0];
  if (!row) {
    return { op: 'delete', table: outboxRow.table_name, uuid: outboxRow.uuid };
  }
  const payload = applyMediaUrls(
    outboxRow.table_name,
    await toWirePayload(q, outboxRow.table_name, row),
    mediaUrls
  );
  return {
    op: 'upsert',
    table: outboxRow.table_name,
    uuid: outboxRow.uuid,
    payload,
  };
}

function mutationKey(table, uuid) {
  return `${table}:${uuid}`;
}

function acceptedKeySet(accepted) {
  const rows = accepted || [];
  const hasTable = rows.some((a) => a.table);
  return {
    hasTable,
    keys: new Set(
      rows.map((a) => (hasTable ? mutationKey(a.table, a.uuid) : a.uuid))
    ),
  };
}

function wasAccepted(acceptedSet, item) {
  const key = acceptedSet.hasTable
    ? mutationKey(item.mutation.table, item.mutation.uuid)
    : item.mutation.uuid;
  return acceptedSet.keys.has(key);
}

async function pushOutbox() {
  enqueueAllLocalRows();
  const rows = pendingOutbox();
  if (!rows.length) return;
  const upsertRows = [];
  const deleteRows = [];
  for (const row of rows) {
    if (row.op === 'delete') deleteRows.push(row);
    else upsertRows.push(row);
  }
  upsertRows.sort(
    (a, b) => UPSERT_ORDER.indexOf(a.table_name) - UPSERT_ORDER.indexOf(b.table_name)
  );
  deleteRows.sort(
    (a, b) => DELETE_ORDER.indexOf(a.table_name) - DELETE_ORDER.indexOf(b.table_name)
  );
  const ordered = [...upsertRows, ...deleteRows];
  const total = ordered.length;
  for (let i = 0; i < ordered.length; i += 80) {
    const slice = ordered.slice(i, i + 80);
    setStatus({
      state: 'syncing',
      message: `Uploading ${Math.min(i + slice.length, total)} of ${total}…`,
      error: null,
    });
    const chunk = [];
    for (const row of slice) {
      try {
        const mediaUrls = await uploadPendingMedia(row);
        const mutation = await buildMutation(row, mediaUrls);
        chunk.push({ row, mutation });
      } catch (err) {
        markOutboxError(row.id, err.message);
      }
    }
    if (!chunk.length) continue;
    const data = await cloudFetch('/api/sync/push', {
      method: 'POST',
      timeoutMs: 60000,
      body: JSON.stringify({
        deviceId: getMeta('device_id'),
        mutations: chunk.map((c) => c.mutation),
      }),
    });
    const acceptedSet = acceptedKeySet(data.accepted);
    const rejected = data.rejected || [];
    for (const item of chunk) {
      if (wasAccepted(acceptedSet, item)) {
        deleteOutbox(item.row.id);
      }
    }
    for (const r of rejected) {
      const hit = chunk.find(
        (c) =>
          c.mutation.uuid === r.uuid &&
          (!r.table || c.mutation.table === r.table)
      );
      if (hit) markOutboxError(hit.row.id, r.message || r.code);
    }
  }
}

async function applyMutationSafe(q, mutation, { logSkip = false } = {}) {
  rawSqlite().exec('SAVEPOINT sync_row');
  try {
    const result = await applyMutation(q, mutation);
    rawSqlite().exec('RELEASE SAVEPOINT sync_row');
    return { ok: true, result };
  } catch (err) {
    try {
      rawSqlite().exec('ROLLBACK TO SAVEPOINT sync_row');
    } catch {
      /* ignore */
    }
    if (isUniqueError(err)) {
      return { ok: true, unique: true };
    }
    if (isSkippableApplyError(err)) {
      const retry = err.code === 'missing_fk';
      if (logSkip || !retry) {
        console.warn(`[sync] skip ${mutation.table} ${mutation.uuid} ${skipReason(err)}`);
      }
      return { ok: false, retry, err };
    }
    throw err;
  }
}

async function applyMutationsWithRetry(q, mutations) {
  const retry = [];
  let skipped = 0;
  for (const mutation of mutations) {
    const outcome = await applyMutationSafe(q, mutation, { logSkip: false });
    if (outcome.retry) retry.push(mutation);
    else if (!outcome.ok) skipped += 1;
  }
  for (const mutation of retry) {
    const outcome = await applyMutationSafe(q, mutation, { logSkip: true });
    if (!outcome.ok) skipped += 1;
  }
  if (skipped) {
    console.warn(`[sync] skipped ${skipped} orphan row(s)`);
  }
  return skipped;
}

async function applySnapshot(snapshot) {
  const q = (sql, p) => pool.query(sql, p);
  setApplyingRemote(true);
  try {
    rawSqlite().exec('BEGIN');
    for (const table of UPSERT_ORDER) {
      const items = snapshot.tables?.[table] || [];
      await applyMutationsWithRetry(
        q,
        items.map((item) => ({
          op: 'upsert',
          table,
          uuid: item.uuid,
          payload: item.payload,
        }))
      );
    }
    rawSqlite().exec('COMMIT');
  } catch (err) {
    try {
      rawSqlite().exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    setApplyingRemote(false);
  }
  if (snapshot.cursor != null) setMeta('last_pull_cursor', String(snapshot.cursor));
  setMeta('snapshot_applied', '1');
}

async function pullChanges() {
  const q = (sql, p) => pool.query(sql, p);
  let cursor = getMeta('last_pull_cursor') || '0';
  let hasMore = true;
  while (hasMore) {
    const data = await cloudFetch(`/api/sync/pull?cursor=${encodeURIComponent(cursor)}`);
    const changes = data.changes || [];
    setApplyingRemote(true);
    try {
      rawSqlite().exec('BEGIN');
      await applyMutationsWithRetry(
        q,
        changes
          .filter((change) => SYNC_TABLES.includes(change.table))
          .map((change) => ({
            op: change.op === 'delete' ? 'delete' : 'upsert',
            table: change.table,
            uuid: change.uuid,
            payload: change.payload,
          }))
      );
      rawSqlite().exec('COMMIT');
    } catch (err) {
      try {
        rawSqlite().exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      setApplyingRemote(false);
    }
    cursor = data.cursor || cursor;
    setMeta('last_pull_cursor', String(cursor));
    hasMore = Boolean(data.hasMore);
    if (!changes.length) hasMore = false;
  }
}

function isPristine() {
  const students = rawSqlite().prepare('SELECT COUNT(*) AS c FROM attendance_students').get().c;
  const pending = outboxCount();
  return Number(students) === 0 && pending === 0;
}

function needsSnapshot() {
  if (getMeta('snapshot_applied') === '1') return false;
  const cursor = getMeta('last_pull_cursor');
  if (cursor && cursor !== '0') {
    setMeta('snapshot_applied', '1');
    return false;
  }
  return true;
}

function busyError(action) {
  const err = new Error(`Please wait until the current ${action} finishes.`);
  err.code = 'busy';
  throw err;
}

async function pullFromCloud(opts = {}) {
  if (pushJob) busyError('upload');
  if (pullJob) return pullJob;
  pullJob = (async () => {
    inFlight = true;
    setStatus({ state: 'syncing', message: 'Syncing updates', error: null });
    try {
      await assertOnline();
      await ensurePaired(opts);
      if (needsSnapshot()) {
        const snapshot = await cloudFetch('/api/sync/snapshot', { timeoutMs: 120000 });
        await applySnapshot(snapshot);
      } else {
        await pullChanges();
      }
      setMeta('last_sync_at', new Date().toISOString());
      setStatus({
        state: 'idle',
        message: 'Sync Done',
        lastSyncAt: getMeta('last_sync_at'),
        error: null,
        paired: true,
      });
      return status();
    } catch (err) {
      console.error('[desktop-sync] pull failed:', err.code || '', err.message);
      failStatus(err);
      throw err;
    } finally {
      inFlight = false;
      pullJob = null;
    }
  })();
  return pullJob;
}

async function pushToCloud(opts = {}) {
  if (pullJob) busyError('sync');
  if (pushJob) return pushJob;
  pushJob = (async () => {
    inFlight = true;
    setStatus({ state: 'syncing', message: 'Uploading…', error: null });
    try {
      await assertOnline();
      await ensurePaired(opts);
      await pushOutbox();
      const pending = outboxCount();
      setMeta('last_push_at', new Date().toISOString());
      setMeta('last_sync_at', getMeta('last_push_at'));
      const message =
        pending > 0
          ? `Uploaded, but ${pending} record(s) still need attention`
          : 'Uploaded to the school server';
      setStatus({
        state: pending > 0 ? 'error' : 'idle',
        message,
        lastSyncAt: getMeta('last_sync_at'),
        error: pending > 0 ? message : null,
        paired: true,
      });
      return status();
    } catch (err) {
      console.error('[desktop-sync] upload failed:', err.code || '', err.message);
      failStatus(err);
      throw err;
    } finally {
      inFlight = false;
      pushJob = null;
    }
  })();
  return pushJob;
}

async function assertOnline() {
  const netOk = await online();
  if (netOk) return;
  const message = 'No internet connection. Changes stay on this PC.';
  setStatus({
    state: 'offline',
    message,
    error: message,
    paired: Boolean(getMeta('device_token')),
  });
  const err = new Error(message);
  err.code = 'offline';
  throw err;
}

async function ensurePaired({ username, password, pairingCode, cloudBaseUrl } = {}) {
  if (cloudBaseUrl) {
    setMeta('cloud_url', String(cloudBaseUrl).replace(/\/$/, ''));
  }
  if (!getMeta('device_id')) {
    setMeta('device_id', require('crypto').randomUUID());
  }
  if (getMeta('device_token')) return;

  if (!pairingCode && (!username || !password)) {
    const err = new Error('Log in again, then click Upload Online.');
    err.code = 'auth';
    throw err;
  }

  const data = await cloudFetch('/api/sync/register', {
    method: 'POST',
    timeoutMs: 15000,
    body: JSON.stringify({
      deviceId: getMeta('device_id'),
      deviceName: os.hostname() || 'MPASAT Desktop',
      pairingCode: pairingCode ? String(pairingCode).trim() : undefined,
      username: username ? String(username).trim() : undefined,
      password: password || undefined,
      appVersion: process.env.npm_package_version || '1.0.0',
    }),
  });
  if (!data.deviceToken) throw new Error('Server did not return a device token');
  setMeta('device_token', data.deviceToken);
  setStatus({ paired: true });
}

function failStatus(err) {
  setStatus({
    state: err.code === 'offline' ? 'offline' : 'error',
    message: err.message || 'Sync failed',
    error: err.message || 'Sync failed',
  });
}

async function connectToCloud({ cloudBaseUrl, pairingCode, username, password } = {}) {
  const base = String(cloudBaseUrl || DEFAULT_CLOUD_URL).replace(/\/$/, '');
  setMeta('cloud_url', base);
  setStatus({ paired: false, state: 'syncing', message: 'Syncing updates', error: null });
  await ensurePaired({ cloudBaseUrl: base, pairingCode, username, password });
  if (isPristine() || needsSnapshot()) {
    const snapshot = await cloudFetch('/api/sync/snapshot', { timeoutMs: 120000 });
    await applySnapshot(snapshot);
  } else {
    await pushOutbox();
    await pullChanges();
  }
  setMeta('last_sync_at', new Date().toISOString());
  setStatus({
    state: 'idle',
    message: 'Sync Done',
    lastSyncAt: getMeta('last_sync_at'),
    error: null,
    paired: true,
  });
  return status();
}

async function syncOnce(opts = {}) {
  return pullFromCloud(opts);
}

function startSyncLoop() {
  if (!getMeta('device_id')) {
    setMeta('device_id', require('crypto').randomUUID());
  }
  if (!getMeta('cloud_url')) {
    setMeta('cloud_url', DEFAULT_CLOUD_URL);
  }
}

module.exports = {
  status,
  syncOnce,
  pullFromCloud,
  pushToCloud,
  connectToCloud,
  startSyncLoop,
  cloudUrl,
  online,
};
