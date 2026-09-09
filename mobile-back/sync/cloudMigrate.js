const { pool } = require('../db');
const { runDdl, getSnapshot } = require('../schemaGuard');
const { SYNC_TABLES } = require('./tables');

const TABLES = [
  'attendance_users',
  'attendance_academic_years',
  'attendance_classes',
  'attendance_departments',
  'attendance_students',
  'attendance_records',
  'attendance_student_day_scans',
  'attendance_absence_days',
  'attendance_settings',
  'attendance_fee_heads',
  'attendance_class_fees',
  'attendance_fee_payments',
  'attendance_fee_discounts',
];

async function ensureSyncColumns() {
  for (const table of TABLES) {
    const hadUuid = (await getSnapshot()).columns.has(`${table}.uuid`);
    await runDdl(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS uuid TEXT`);
    await runDdl(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1`
    );
    await runDdl(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS origin_device TEXT`);
    await runDdl(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
    );
    const { rows: missingUuid } = await pool.query(
      `SELECT 1 FROM ${table} WHERE uuid IS NULL LIMIT 1`
    );
    if (missingUuid.length) {
      await pool.query(
        `UPDATE ${table}
         SET uuid = md5(random()::text || clock_timestamp()::text || ctid::text)
         WHERE uuid IS NULL`
      );
    }
    try {
      await runDdl(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_uuid_uidx ON ${table} (uuid)`
      );
    } catch (e) {
      if (e.code !== '23505' && e.code !== '42P07') throw e;
    }
    if (!hadUuid) {
      try {
        await pool.query(
          `ALTER TABLE ${table} ALTER COLUMN uuid SET DEFAULT md5(random()::text || clock_timestamp()::text)`
        );
      } catch {
        /* ignore */
      }
    }
  }
}

async function ensureSyncInfra() {
  await runDdl(`
    CREATE TABLE IF NOT EXISTS sync_change_log (
      id BIGSERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      uuid TEXT NOT NULL,
      op TEXT NOT NULL,
      row_version INTEGER,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_sync_change_log_id ON sync_change_log (id)`
  );

  await runDdl(`
    CREATE TABLE IF NOT EXISTS sync_pair_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(16) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS sync_devices (
      device_id TEXT PRIMARY KEY,
      device_name TEXT,
      app_version TEXT,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS sync_notify_log (
      kind TEXT NOT NULL,
      student_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (kind, student_id, academic_year_id, attendance_date)
    )
  `);

  await runDdl(`
    CREATE OR REPLACE FUNCTION attendance_sync_log_row() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        INSERT INTO sync_change_log (table_name, uuid, op, row_version)
        VALUES (TG_TABLE_NAME, OLD.uuid, 'delete', COALESCE(OLD.row_version, 1));
        RETURN OLD;
      ELSE
        INSERT INTO sync_change_log (table_name, uuid, op, row_version)
        VALUES (TG_TABLE_NAME, NEW.uuid, 'upsert', COALESCE(NEW.row_version, 1));
        RETURN NEW;
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const table of SYNC_TABLES) {
    try {
      await runDdl(`
        CREATE TRIGGER ${table}_sync_log
        AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE PROCEDURE attendance_sync_log_row()
      `);
    } catch {
      await runDdl(`
        CREATE TRIGGER ${table}_sync_log
        AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION attendance_sync_log_row()
      `);
    }
  }
}

async function migrateCloudSync() {
  await ensureSyncColumns();
  await ensureSyncInfra();
}

module.exports = { migrateCloudSync };
