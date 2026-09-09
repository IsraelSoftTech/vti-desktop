const { pool } = require('./db');

let snapshot = null;

async function loadSnapshot() {
  const [tables, columns, indexes, triggers, constraints] = await Promise.all([
    pool.query(
      `SELECT c.relname AS name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`
    ),
    pool.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'`
    ),
    pool.query(
      `SELECT indexname AS name
       FROM pg_indexes
       WHERE schemaname = 'public'`
    ),
    pool.query(
      `SELECT tgname AS name
       FROM pg_trigger
       WHERE NOT tgisinternal`
    ),
    pool.query(
      `SELECT conname AS name
       FROM pg_constraint`
    ),
  ]);
  snapshot = {
    tables: new Set(tables.rows.map((r) => r.name)),
    columns: new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`)),
    indexes: new Set(indexes.rows.map((r) => r.name)),
    triggers: new Set(triggers.rows.map((r) => r.name)),
    constraints: new Set(constraints.rows.map((r) => r.name)),
  };
  return snapshot;
}

async function getSnapshot() {
  if (!snapshot) await loadSnapshot();
  return snapshot;
}

function rememberTable(name) {
  snapshot?.tables.add(name);
}

function rememberColumn(table, column) {
  snapshot?.columns.add(`${table}.${column}`);
}

function rememberIndex(name) {
  snapshot?.indexes.add(name);
}

function rememberTrigger(name) {
  snapshot?.triggers.add(name);
}

function rememberConstraint(name) {
  snapshot?.constraints.add(name);
}

/**
 * Run CREATE/ALTER/INDEX/TRIGGER only when the catalog says it is missing.
 * Avoids ACCESS EXCLUSIVE waits on a live shared database.
 */
async function runDdl(sql) {
  const text = String(sql);
  const snap = await getSnapshot();

  const createTable = text.match(/CREATE TABLE IF NOT EXISTS\s+"?([a-z0-9_]+)"?/i);
  if (createTable) {
    if (snap.tables.has(createTable[1])) return;
    await pool.query(sql);
    rememberTable(createTable[1]);
    return;
  }

  const addCol = text.match(
    /ALTER TABLE\s+"?([a-z0-9_]+)"?\s+ADD COLUMN IF NOT EXISTS\s+"?([a-z0-9_]+)"?/i
  );
  if (addCol) {
    if (snap.columns.has(`${addCol[1]}.${addCol[2]}`)) return;
    await pool.query(sql);
    rememberColumn(addCol[1], addCol[2]);
    return;
  }

  const dropCol = text.match(
    /ALTER TABLE\s+"?([a-z0-9_]+)"?\s+DROP COLUMN IF EXISTS\s+"?([a-z0-9_]+)"?/i
  );
  if (dropCol) {
    if (!snap.columns.has(`${dropCol[1]}.${dropCol[2]}`)) return;
    await pool.query(sql);
    snapshot.columns.delete(`${dropCol[1]}.${dropCol[2]}`);
    return;
  }

  const addConstraint = text.match(/ADD CONSTRAINT\s+"?([a-z0-9_]+)"?/i);
  if (addConstraint && /ALTER TABLE/i.test(text)) {
    if (snap.constraints.has(addConstraint[1])) return;
    await pool.query(sql);
    rememberConstraint(addConstraint[1]);
    return;
  }

  const createIndex = text.match(
    /CREATE\s+(?:UNIQUE\s+)?INDEX IF NOT EXISTS\s+"?([a-z0-9_]+)"?/i
  );
  if (createIndex) {
    if (snap.indexes.has(createIndex[1])) return;
    await pool.query(sql);
    rememberIndex(createIndex[1]);
    return;
  }

  const dropTrigger = text.match(/DROP TRIGGER IF EXISTS\s+"?([a-z0-9_]+)"?/i);
  if (dropTrigger) {
    // Recreating triggers takes ACCESS EXCLUSIVE on live tables. Leave them.
    return;
  }

  const createTrigger = text.match(/CREATE TRIGGER\s+"?([a-z0-9_]+)"?/i);
  if (createTrigger) {
    if (snap.triggers.has(createTrigger[1])) return;
    await pool.query(sql);
    rememberTrigger(createTrigger[1]);
    return;
  }

  const createFn = text.match(/CREATE OR REPLACE FUNCTION\s+"?([a-z0-9_]+)"?/i);
  if (createFn) {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_proc WHERE proname = $1 LIMIT 1`,
      [createFn[1]]
    );
    if (rows.length) return;
  }

  await pool.query(sql);
}

async function tableHasRows(name) {
  const snap = await getSnapshot();
  if (!snap.tables.has(name)) return false;
  const { rows } = await pool.query(`SELECT 1 FROM ${name} LIMIT 1`);
  return rows.length > 0;
}

async function userExists(username) {
  const snap = await getSnapshot();
  if (!snap.tables.has('attendance_users')) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM attendance_users WHERE username = $1 LIMIT 1`,
    [username]
  );
  return rows.length > 0;
}

module.exports = {
  loadSnapshot,
  getSnapshot,
  runDdl,
  tableHasRows,
  userExists,
};
