const { SYNC_TABLES } = require('./tables');
const { rawSqlite } = require('../dbSqlite');

function setApplyingRemote(on) {
  const db = rawSqlite();
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES ('applying_remote', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(on ? '1' : '0');
}

function getMeta(key, fallback = null) {
  const row = rawSqlite()
    .prepare('SELECT value FROM sync_meta WHERE key = ?')
    .get(key);
  return row?.value ?? fallback;
}

function setMeta(key, value) {
  rawSqlite()
    .prepare(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value == null ? null : String(value));
}

function pendingOutbox() {
  return rawSqlite()
    .prepare(
      `SELECT id, op, table_name, uuid, occurred_at, attempts, last_error
       FROM sync_outbox
       ORDER BY id ASC`
    )
    .all();
}

/** Queue every local school row so Upload Online sends a full copy, not only recent edits. */
function enqueueAllLocalRows() {
  const db = rawSqlite();
  const now = new Date().toISOString();
  const del = db.prepare(
    `DELETE FROM sync_outbox WHERE table_name = ? AND uuid = ?`
  );
  const ins = db.prepare(
    `INSERT INTO sync_outbox (op, table_name, uuid, occurred_at)
     VALUES ('upsert', ?, ?, ?)`
  );
  db.transaction(() => {
    for (const table of SYNC_TABLES) {
      const rows = db
        .prepare(
          `SELECT uuid FROM ${table} WHERE uuid IS NOT NULL AND TRIM(uuid) != ''`
        )
        .all();
      for (const row of rows) {
        del.run(table, row.uuid);
        ins.run(table, row.uuid, now);
      }
    }
  })();
}

function deleteOutbox(id) {
  rawSqlite().prepare('DELETE FROM sync_outbox WHERE id = ?').run(id);
}

function markOutboxError(id, message) {
  rawSqlite()
    .prepare(
      `UPDATE sync_outbox
       SET attempts = attempts + 1, last_error = ?
       WHERE id = ?`
    )
    .run(String(message || 'error').slice(0, 500), id);
}

function outboxCount() {
  const row = rawSqlite().prepare('SELECT COUNT(*) AS c FROM sync_outbox').get();
  return Number(row?.c || 0);
}

function isSyncTable(name) {
  return SYNC_TABLES.includes(name);
}

module.exports = {
  setApplyingRemote,
  getMeta,
  setMeta,
  pendingOutbox,
  enqueueAllLocalRows,
  deleteOutbox,
  markOutboxError,
  outboxCount,
  isSyncTable,
};
