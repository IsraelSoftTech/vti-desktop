const bcrypt = require('./bcryptCompat');
const { rawSqlite } = require('./dbSqlite');
const { SYNC_TABLES } = require('./sync/tables');

const BOOTSTRAP_USERNAME =
  process.env.ATTENDANCE_BOOTSTRAP_ADMIN_USERNAME || 'admin1234';
const BOOTSTRAP_PASSWORD =
  process.env.ATTENDANCE_BOOTSTRAP_ADMIN_PASSWORD || 'admin4321';
const BOOTSTRAP_ACCOUNTANT_USERNAME =
  process.env.ATTENDANCE_BOOTSTRAP_ACCOUNTANT_USERNAME || 'accountant@!';
const BOOTSTRAP_ACCOUNTANT_PASSWORD =
  process.env.ATTENDANCE_BOOTSTRAP_ACCOUNTANT_PASSWORD || 'accountant!';

const UUID_DEFAULT = `(lower(hex(randomblob(16))))`;
const NOW_DEFAULT = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

function syncCols() {
  return `
    uuid TEXT NOT NULL UNIQUE DEFAULT ${UUID_DEFAULT},
    updated_at TEXT DEFAULT ${NOW_DEFAULT},
    row_version INTEGER NOT NULL DEFAULT 1,
    origin_device TEXT
  `;
}

function createSyncTriggers(db) {
  for (const table of SYNC_TABLES) {
    const safe = table.replace(/[^a-z_]/g, '');
    db.exec(`DROP TRIGGER IF EXISTS ${safe}_sync_ai`);
    db.exec(`DROP TRIGGER IF EXISTS ${safe}_sync_au`);
    db.exec(`DROP TRIGGER IF EXISTS ${safe}_sync_ad`);
    const skip = `COALESCE((SELECT value FROM sync_meta WHERE key = 'applying_remote'), '0') != '1'`;
    db.exec(`
      CREATE TRIGGER ${safe}_sync_ai AFTER INSERT ON ${safe}
      WHEN ${skip}
      BEGIN
        DELETE FROM sync_outbox WHERE table_name = '${safe}' AND uuid = NEW.uuid;
        INSERT INTO sync_outbox (op, table_name, uuid, occurred_at)
        VALUES ('upsert', '${safe}', NEW.uuid, ${NOW_DEFAULT});
      END;
    `);
    db.exec(`
      CREATE TRIGGER ${safe}_sync_au AFTER UPDATE ON ${safe}
      WHEN ${skip}
      BEGIN
        DELETE FROM sync_outbox WHERE table_name = '${safe}' AND uuid = NEW.uuid;
        INSERT INTO sync_outbox (op, table_name, uuid, occurred_at)
        VALUES ('upsert', '${safe}', NEW.uuid, ${NOW_DEFAULT});
      END;
    `);
    db.exec(`
      CREATE TRIGGER ${safe}_sync_ad AFTER DELETE ON ${safe}
      WHEN ${skip}
      BEGIN
        DELETE FROM sync_outbox WHERE table_name = '${safe}' AND uuid = OLD.uuid;
        INSERT INTO sync_outbox (op, table_name, uuid, occurred_at)
        VALUES ('delete', '${safe}', OLD.uuid, ${NOW_DEFAULT});
      END;
    `);
  }
}

async function seedBootstrapUsers(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM attendance_users').get().c;
  if (count > 0) return;

  const adminHash = await bcrypt.hash(BOOTSTRAP_PASSWORD, 12);
  const accHash = await bcrypt.hash(BOOTSTRAP_ACCOUNTANT_PASSWORD, 12);
  db.prepare(
    `INSERT INTO attendance_users (username, password_hash, full_name, role)
     VALUES (?, ?, ?, ?)`
  ).run(BOOTSTRAP_USERNAME, adminHash, 'Attendance Admin', 'attendance_admin');
  db.prepare(
    `INSERT INTO attendance_users (username, password_hash, full_name, role)
     VALUES (?, ?, ?, ?)`
  ).run(
    BOOTSTRAP_ACCOUNTANT_USERNAME,
    accHash,
    'Accountant',
    'attendance_accountant'
  );
}

function ensureColumn(db, table, column, typeSql) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  if (rows.some((r) => r.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
}

async function initSqlite() {
  const db = rawSqlite();

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
      table_name TEXT NOT NULL,
      uuid TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'attendance_admin',
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()}
    );

    CREATE TABLE IF NOT EXISTS attendance_academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()}
    );

    CREATE TABLE IF NOT EXISTS attendance_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      school_start_time TEXT,
      school_end_time TEXT,
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()},
      UNIQUE (name, academic_year_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()},
      UNIQUE (name, academic_year_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      sex TEXT,
      dob TEXT,
      place_of_birth TEXT,
      guardian_name TEXT,
      department TEXT,
      contact TEXT,
      photo_url TEXT,
      face_descriptor TEXT,
      barcode TEXT NOT NULL UNIQUE,
      class_id INTEGER REFERENCES attendance_classes(id) ON DELETE SET NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()}
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      check_type TEXT NOT NULL CHECK (check_type IN ('check_in', 'check_out')),
      method TEXT NOT NULL CHECK (method IN ('barcode', 'face')),
      attendance_date TEXT NOT NULL DEFAULT (date('now')),
      recorded_at TEXT NOT NULL DEFAULT ${NOW_DEFAULT},
      ${syncCols()}
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_records_date
      ON attendance_records (academic_year_id, attendance_date);

    CREATE TABLE IF NOT EXISTS attendance_settings (
      academic_year_id INTEGER PRIMARY KEY REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      school_name TEXT NOT NULL DEFAULT 'Izzy Tech Team School',
      school_start_time TEXT NOT NULL DEFAULT '07:30',
      school_end_time TEXT NOT NULL DEFAULT '15:30',
      check_in_grace_minutes_after_start INTEGER NOT NULL DEFAULT 480,
      allow_checkout_before_end_time INTEGER NOT NULL DEFAULT 1,
      notify_sms_enabled INTEGER NOT NULL DEFAULT 1,
      notify_whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
      guardian_messages_per_day INTEGER NOT NULL DEFAULT 2,
      check_in_opens_at TEXT,
      absent_checkin_reminder_minutes INTEGER NOT NULL DEFAULT 60,
      missed_checkout_reminder_minutes INTEGER NOT NULL DEFAULT 60,
      school_logo_url TEXT,
      school_week_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
      notify_app_enabled INTEGER NOT NULL DEFAULT 0,
      notify_sms_normal INTEGER NOT NULL DEFAULT 0,
      guardian_message_templates TEXT,
      ${syncCols()}
    );

    CREATE TABLE IF NOT EXISTS attendance_fee_heads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      trashed_at TEXT,
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()},
      UNIQUE (name, academic_year_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_class_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES attendance_classes(id) ON DELETE CASCADE,
      fee_head_id INTEGER NOT NULL REFERENCES attendance_fee_heads(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      amount TEXT NOT NULL DEFAULT '0',
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()},
      UNIQUE (class_id, fee_head_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      fee_head_id INTEGER NOT NULL REFERENCES attendance_fee_heads(id) ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      amount TEXT NOT NULL,
      paid_at TEXT NOT NULL DEFAULT ${NOW_DEFAULT},
      note TEXT,
      channel TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()}
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_fee_payments_student
      ON attendance_fee_payments (student_id, academic_year_id);

    CREATE TABLE IF NOT EXISTS attendance_fee_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES attendance_students(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES attendance_classes(id) ON DELETE CASCADE,
      amount TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT ${NOW_DEFAULT},
      ${syncCols()},
      CHECK (
        (student_id IS NOT NULL AND class_id IS NULL) OR
        (student_id IS NULL AND class_id IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_fee_discounts_student
      ON attendance_fee_discounts (student_id, academic_year_id)
      WHERE student_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_fee_discounts_class
      ON attendance_fee_discounts (class_id, academic_year_id)
      WHERE class_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS attendance_absence_days (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      marked_at TEXT NOT NULL DEFAULT ${NOW_DEFAULT},
      sms_sent_at TEXT,
      ${syncCols()},
      PRIMARY KEY (student_id, academic_year_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS attendance_student_day_scans (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      checked_in_at TEXT,
      checked_out_at TEXT,
      missed_checkout_sms_sent_at TEXT,
      ${syncCols()},
      PRIMARY KEY (student_id, academic_year_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS attendance_sms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT ${NOW_DEFAULT},
      kind TEXT NOT NULL DEFAULT 'other',
      student_id INTEGER,
      academic_year_id INTEGER,
      mobile TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      provider_status TEXT,
      message_id TEXT,
      sms_client_id TEXT,
      error_code TEXT,
      error_description TEXT,
      submitted_at TEXT,
      sent_at TEXT,
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_sms_messages_created
      ON attendance_sms_messages (created_at);
    CREATE INDEX IF NOT EXISTS idx_attendance_sms_messages_message_id
      ON attendance_sms_messages (message_id);

    CREATE TABLE IF NOT EXISTS attendance_sms_pairs (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      pair_id INTEGER NOT NULL,
      day1_date TEXT NOT NULL,
      day2_date TEXT NOT NULL,
      broken INTEGER NOT NULL DEFAULT 0,
      summary_sms_sent_at TEXT,
      PRIMARY KEY (student_id, academic_year_id, pair_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL DEFAULT ${NOW_DEFAULT},
      actor_id INTEGER,
      actor_username TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      method TEXT,
      path TEXT,
      status_code INTEGER,
      ip TEXT,
      source TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_activity_logs_occurred
      ON attendance_activity_logs (occurred_at);
  `);

  ensureColumn(
    db,
    'attendance_settings',
    'school_week_days',
    "TEXT NOT NULL DEFAULT '1,2,3,4,5'"
  );
  ensureColumn(
    db,
    'attendance_settings',
    'notify_app_enabled',
    'INTEGER NOT NULL DEFAULT 0'
  );
  ensureColumn(
    db,
    'attendance_settings',
    'notify_sms_normal',
    'INTEGER NOT NULL DEFAULT 0'
  );
  ensureColumn(
    db,
    'attendance_settings',
    'guardian_message_templates',
    'TEXT'
  );
  ensureColumn(
    db,
    'attendance_users',
    'notification_sound',
    "TEXT NOT NULL DEFAULT 'chime'"
  );
  ensureColumn(
    db,
    'attendance_fee_payments',
    'channel',
    "TEXT NOT NULL DEFAULT 'cash'"
  );
  ensureColumn(db, 'attendance_students', 'department', 'TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attendance_fee_payments_channel
      ON attendance_fee_payments (academic_year_id, channel, paid_at);
  `);

  db.exec(`
    INSERT INTO sync_meta (key, value) VALUES ('schema_version', '1')
    ON CONFLICT (key) DO NOTHING;
    INSERT INTO sync_meta (key, value) VALUES ('applying_remote', '0')
    ON CONFLICT (key) DO NOTHING;
  `);

  createSyncTriggers(db);
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES ('applying_remote', '1')
     ON CONFLICT (key) DO UPDATE SET value = '1'`
  ).run();
  try {
    await seedBootstrapUsers(db);
  } finally {
    db.prepare(`UPDATE sync_meta SET value = '0' WHERE key = 'applying_remote'`).run();
  }
  const { ensureBootstrapAccountant } = require('./attendanceAuth');
  await ensureBootstrapAccountant();
}

module.exports = {
  initSqlite,
};
