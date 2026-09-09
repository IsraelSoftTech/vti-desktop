const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { sqlitePath } = require('./runtime');
const { convertPgToSqlite, coerceRow, mapSqliteError } = require('./dialect');

let db = null;

function getDb() {
  if (db) return db;
  const file = sqlitePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

function isSelectLike(sql) {
  const trim = String(sql).trim();
  return /^(select|with|pragma|returning)\b/i.test(trim) || /\breturning\b/i.test(trim);
}

function runSql(sql, params) {
  const converted = convertPgToSqlite(sql, params);
  const text = converted.sql.trim();
  const values = converted.params;
  const sqlite = getDb();

  try {
    if (/^begin\b/i.test(text)) {
      sqlite.exec('BEGIN');
      return { rows: [], rowCount: 0 };
    }
    if (/^commit\b/i.test(text)) {
      sqlite.exec('COMMIT');
      return { rows: [], rowCount: 0 };
    }
    if (/^rollback\b/i.test(text)) {
      sqlite.exec('ROLLBACK');
      return { rows: [], rowCount: 0 };
    }

    const stmt = sqlite.prepare(converted.sql);
    if (isSelectLike(converted.sql)) {
      const rows = stmt.all(...values).map(coerceRow);
      return { rows, rowCount: rows.length };
    }
    const info = stmt.run(...values);
    return { rows: [], rowCount: info.changes };
  } catch (err) {
    throw mapSqliteError(err);
  }
}

async function query(sql, params) {
  return runSql(sql, params);
}

function connect() {
  return {
    query: async (sql, params) => runSql(sql, params),
    release() {},
  };
}

function closeSqlite() {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}

function rawSqlite() {
  return getDb();
}

const pool = {
  query,
  connect,
  end: async () => closeSqlite(),
};

module.exports = {
  pool,
  getDb,
  rawSqlite,
  closeSqlite,
  query,
};
