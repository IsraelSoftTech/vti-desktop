const bcrypt = require('./bcryptCompat');
const { pool } = require('./db');
const { runDdl, tableHasRows, userExists, loadSnapshot } = require('./schemaGuard');

const BOOTSTRAP_USERNAME =
  process.env.ATTENDANCE_BOOTSTRAP_ADMIN_USERNAME || 'admin1234';
const BOOTSTRAP_PASSWORD =
  process.env.ATTENDANCE_BOOTSTRAP_ADMIN_PASSWORD || 'admin4321';
const BOOTSTRAP_ACCOUNTANT_USERNAME =
  process.env.ATTENDANCE_BOOTSTRAP_ACCOUNTANT_USERNAME || 'accountant@!';
const BOOTSTRAP_ACCOUNTANT_PASSWORD =
  process.env.ATTENDANCE_BOOTSTRAP_ACCOUNTANT_PASSWORD || 'accountant!';

async function seedBootstrapAdmin() {
  if (await userExists(BOOTSTRAP_USERNAME)) return;
  const hash = await bcrypt.hash(BOOTSTRAP_PASSWORD, 12);
  await pool.query(
    `INSERT INTO attendance_users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO NOTHING`,
    [BOOTSTRAP_USERNAME, hash, 'Attendance Admin', 'attendance_admin']
  );
}

async function seedBootstrapAccountant() {
  if (await userExists(BOOTSTRAP_ACCOUNTANT_USERNAME)) return;
  const hash = await bcrypt.hash(BOOTSTRAP_ACCOUNTANT_PASSWORD, 12);
  await pool.query(
    `INSERT INTO attendance_users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO NOTHING`,
    [
      BOOTSTRAP_ACCOUNTANT_USERNAME,
      hash,
      'Accountant',
      'attendance_accountant',
    ]
  );
}

async function ensureAttendanceMigrations() {
  await runDdl(`
    ALTER TABLE attendance_users
    ADD COLUMN IF NOT EXISTS role VARCHAR(64) NOT NULL DEFAULT 'attendance_admin'
  `);

  await runDdl(`
    ALTER TABLE attendance_users
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)
  `);

  await runDdl(`
    ALTER TABLE attendance_academic_years
    ADD COLUMN IF NOT EXISTS start_date DATE
  `);
  await runDdl(`
    ALTER TABLE attendance_academic_years
    ADD COLUMN IF NOT EXISTS end_date DATE
  `);
  await runDdl(`
    ALTER TABLE attendance_academic_years
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await runDdl(`
    ALTER TABLE attendance_academic_years
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await runDdl(`
    ALTER TABLE attendance_classes
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER
  `);
  await runDdl(`
    ALTER TABLE attendance_classes
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS sex VARCHAR(16)
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS dob DATE
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(255)
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS contact VARCHAR(64)
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS photo_url TEXT
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS face_descriptor JSONB
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS barcode VARCHAR(64)
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS class_id INTEGER
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await runDdl(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS academic_year_id INTEGER
  `);
  await runDdl(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS check_type VARCHAR(16)
  `);
  await runDdl(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS method VARCHAR(16)
  `);
  await runDdl(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS attendance_date DATE DEFAULT CURRENT_DATE
  `);
  await runDdl(`
    ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS school_name VARCHAR(255) DEFAULT 'Izzy Tech Team School'
  `);

  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS notify_sms_enabled BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS notify_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS guardian_messages_per_day SMALLINT NOT NULL DEFAULT 2
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS check_in_grace_minutes_after_start SMALLINT NOT NULL DEFAULT 480
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS allow_checkout_before_end_time BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS check_in_opens_at TIME
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS absent_checkin_reminder_minutes SMALLINT NOT NULL DEFAULT 60
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS missed_checkout_reminder_minutes SMALLINT NOT NULL DEFAULT 60
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS school_logo_url TEXT
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS school_week_days TEXT NOT NULL DEFAULT '1,2,3,4,5'
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS notify_app_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS notify_sms_normal BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await runDdl(`
    ALTER TABLE attendance_settings
    ADD COLUMN IF NOT EXISTS guardian_message_templates JSONB
  `);
  await runDdl(`
    ALTER TABLE attendance_student_day_scans
    ADD COLUMN IF NOT EXISTS missed_checkout_sms_sent_at TIMESTAMPTZ
  `);
  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_sms_pairs (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      pair_id INTEGER NOT NULL,
      day1_date DATE NOT NULL,
      day2_date DATE NOT NULL,
      broken BOOLEAN NOT NULL DEFAULT FALSE,
      summary_sms_sent_at TIMESTAMPTZ,
      PRIMARY KEY (student_id, academic_year_id, pair_id)
    )
  `);

  /** Legacy prototype schema — classes had barcode/updated_at columns we no longer use. */
  await runDdl(`
    ALTER TABLE attendance_classes DROP COLUMN IF EXISTS barcode
  `);
  await runDdl(`
    ALTER TABLE attendance_classes DROP COLUMN IF EXISTS updated_at
  `);
  await runDdl(`
    ALTER TABLE attendance_classes DROP COLUMN IF EXISTS description
  `);
  await runDdl(`
    ALTER TABLE attendance_classes
    ADD COLUMN IF NOT EXISTS school_start_time TIME
  `);
  await runDdl(`
    ALTER TABLE attendance_classes
    ADD COLUMN IF NOT EXISTS school_end_time TIME
  `);

  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255)
  `);
  await runDdl(`
    ALTER TABLE attendance_students
    ADD COLUMN IF NOT EXISTS department VARCHAR(255)
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_absence_days (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sms_sent_at TIMESTAMPTZ,
      PRIMARY KEY (student_id, academic_year_id, attendance_date)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_student_day_scans (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      checked_in_at TIMESTAMPTZ,
      checked_out_at TIMESTAMPTZ,
      PRIMARY KEY (student_id, academic_year_id, attendance_date)
    )
  `);

  /** Backfill rows created before academic-year scoping existed. */
  const { rows: yearRows } = await pool.query(
    `SELECT id FROM attendance_academic_years ORDER BY is_active DESC, id ASC LIMIT 1`
  );
  let defaultYearId = yearRows[0]?.id ?? null;
  if (!defaultYearId) {
    const { rows: created } = await pool.query(
      `INSERT INTO attendance_academic_years (name, is_active)
       VALUES ('Legacy', TRUE)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    defaultYearId = created[0]?.id ?? null;
    if (!defaultYearId) {
      const { rows: again } = await pool.query(
        `SELECT id FROM attendance_academic_years WHERE name = 'Legacy' LIMIT 1`
      );
      defaultYearId = again[0]?.id ?? null;
    }
  }

  if (defaultYearId && !(await tableHasRows('attendance_settings'))) {
    await pool.query(
      `UPDATE attendance_classes SET academic_year_id = $1 WHERE academic_year_id IS NULL`,
      [defaultYearId]
    );
    await pool.query(
      `UPDATE attendance_students SET academic_year_id = $1 WHERE academic_year_id IS NULL`,
      [defaultYearId]
    );
    await pool.query(
      `UPDATE attendance_records r
       SET academic_year_id = s.academic_year_id
       FROM attendance_students s
       WHERE r.student_id = s.id AND r.academic_year_id IS NULL`
    );
    await pool.query(
      `UPDATE attendance_records SET academic_year_id = $1 WHERE academic_year_id IS NULL`,
      [defaultYearId]
    );
    await pool.query(
      `INSERT INTO attendance_settings (academic_year_id)
       VALUES ($1)
       ON CONFLICT (academic_year_id) DO NOTHING`,
      [defaultYearId]
    );
  }

  /** Add FK constraints when missing (ignore if already present). */
  try {
    await runDdl(`
      ALTER TABLE attendance_classes
      ADD CONSTRAINT attendance_classes_academic_year_id_fkey
      FOREIGN KEY (academic_year_id) REFERENCES attendance_academic_years(id) ON DELETE CASCADE
    `);
  } catch (e) {
    if (e.code !== '42710' && e.code !== '42P16') throw e;
  }
  try {
    await runDdl(`
      ALTER TABLE attendance_students
      ADD CONSTRAINT attendance_students_academic_year_id_fkey
      FOREIGN KEY (academic_year_id) REFERENCES attendance_academic_years(id) ON DELETE CASCADE
    `);
  } catch (e) {
    if (e.code !== '42710' && e.code !== '42P16') throw e;
  }
  try {
    await runDdl(`
      CREATE UNIQUE INDEX IF NOT EXISTS attendance_classes_name_year_uidx
      ON attendance_classes (name, academic_year_id)
    `);
  } catch (_) {
    /* ignore duplicate index name conflicts */
  }

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_sms_messages (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      kind VARCHAR(40) NOT NULL DEFAULT 'other',
      student_id INTEGER REFERENCES attendance_students(id) ON DELETE SET NULL,
      academic_year_id INTEGER REFERENCES attendance_academic_years(id) ON DELETE SET NULL,
      mobile VARCHAR(32),
      body TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      provider_status VARCHAR(64),
      message_id VARCHAR(128),
      sms_client_id VARCHAR(128),
      error_code VARCHAR(32),
      error_description TEXT,
      submitted_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_sms_messages_created
     ON attendance_sms_messages (created_at DESC)`
  );
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_sms_messages_message_id
     ON attendance_sms_messages (message_id)`
  );

  await runDdl(`
    ALTER TABLE attendance_users
    ADD COLUMN IF NOT EXISTS first_run_completed BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await runDdl(`
    ALTER TABLE attendance_users
    ADD COLUMN IF NOT EXISTS notification_sound VARCHAR(32) NOT NULL DEFAULT 'chime'
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_parent_students (
      parent_user_id INTEGER NOT NULL REFERENCES attendance_users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      barcode VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (parent_user_id, student_id)
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_parent_students_parent
     ON attendance_parent_students (parent_user_id)`
  );

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_parent_devices (
      id SERIAL PRIMARY KEY,
      parent_user_id INTEGER NOT NULL REFERENCES attendance_users(id) ON DELETE CASCADE,
      expo_push_token TEXT NOT NULL UNIQUE,
      platform VARCHAR(32),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_parent_devices_parent
     ON attendance_parent_devices (parent_user_id)`
  );

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_parent_notifications (
      id SERIAL PRIMARY KEY,
      parent_user_id INTEGER NOT NULL REFERENCES attendance_users(id) ON DELETE CASCADE,
      kind VARCHAR(40) NOT NULL,
      title VARCHAR(120) NOT NULL,
      body TEXT NOT NULL,
      student_id INTEGER REFERENCES attendance_students(id) ON DELETE SET NULL,
      thread_id INTEGER,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      dedupe_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_parent_notifications_parent
     ON attendance_parent_notifications (parent_user_id, created_at DESC)`
  );
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_parent_notifications_unread
     ON attendance_parent_notifications (parent_user_id)
     WHERE read_at IS NULL`
  );

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_parent_threads (
      id SERIAL PRIMARY KEY,
      parent_user_id INTEGER NOT NULL UNIQUE REFERENCES attendance_users(id) ON DELETE CASCADE,
      last_message_at TIMESTAMPTZ,
      last_message_preview TEXT,
      last_sender_role VARCHAR(16),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_parent_messages (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES attendance_parent_threads(id) ON DELETE CASCADE,
      sender_role VARCHAR(16) NOT NULL,
      sender_user_id INTEGER REFERENCES attendance_users(id) ON DELETE SET NULL,
      body TEXT NOT NULL DEFAULT '',
      attachment_kind VARCHAR(16),
      attachment_url TEXT,
      attachment_name VARCHAR(255),
      attachment_mime VARCHAR(120),
      attachment_size INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_parent_messages_thread
     ON attendance_parent_messages (thread_id, id DESC)`
  );
  await runDdl(
    `ALTER TABLE attendance_parent_messages
     ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await runDdl(
    `ALTER TABLE attendance_parent_messages
     ADD COLUMN IF NOT EXISTS hidden_for_parent BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await runDdl(
    `ALTER TABLE attendance_parent_messages
     ADD COLUMN IF NOT EXISTS hidden_for_admin BOOLEAN NOT NULL DEFAULT FALSE`
  );
}

async function initAttendanceTables() {
  console.log('Pinging Postgres…');
  await pool.query('SELECT 1');
  console.log('Postgres reachable.');
  await loadSnapshot();
  console.log('Schema catalog loaded.');

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(128) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(255),
      role VARCHAR(64) NOT NULL DEFAULT 'attendance_admin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_academic_years (
      id SERIAL PRIMARY KEY,
      name VARCHAR(64) NOT NULL UNIQUE,
      start_date DATE,
      end_date DATE,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_classes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (name, academic_year_id)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (name, academic_year_id)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_students (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      sex VARCHAR(16),
      dob DATE,
      place_of_birth VARCHAR(255),
      guardian_name VARCHAR(255),
      department VARCHAR(255),
      contact VARCHAR(64),
      photo_url TEXT,
      face_descriptor JSONB,
      barcode VARCHAR(64) NOT NULL UNIQUE,
      class_id INTEGER REFERENCES attendance_classes(id) ON DELETE SET NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      check_type VARCHAR(16) NOT NULL CHECK (check_type IN ('check_in', 'check_out')),
      method VARCHAR(16) NOT NULL CHECK (method IN ('barcode', 'face')),
      attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_attendance_records_date
    ON attendance_records (academic_year_id, attendance_date)
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_settings (
      academic_year_id INTEGER PRIMARY KEY REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      school_name VARCHAR(255) NOT NULL DEFAULT 'Izzy Tech Team School',
      school_start_time TIME NOT NULL DEFAULT '07:30',
      school_end_time TIME NOT NULL DEFAULT '15:30',
      check_in_grace_minutes_after_start SMALLINT NOT NULL DEFAULT 480,
      allow_checkout_before_end_time BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_fee_heads (
      id SERIAL PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      trashed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (name, academic_year_id)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_class_fees (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES attendance_classes(id) ON DELETE CASCADE,
      fee_head_id INTEGER NOT NULL REFERENCES attendance_fee_heads(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (class_id, fee_head_id)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_fee_payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      fee_head_id INTEGER NOT NULL REFERENCES attendance_fee_heads(id) ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    ALTER TABLE attendance_fee_payments
    ADD COLUMN IF NOT EXISTS channel VARCHAR(8) NOT NULL DEFAULT 'cash'
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_attendance_fee_payments_student
    ON attendance_fee_payments (student_id, academic_year_id)
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_attendance_fee_payments_channel
    ON attendance_fee_payments (academic_year_id, channel, paid_at)
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_fee_discounts (
      id SERIAL PRIMARY KEY,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES attendance_students(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES attendance_classes(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (
        (student_id IS NOT NULL AND class_id IS NULL) OR
        (student_id IS NULL AND class_id IS NOT NULL)
      )
    )
  `);

  await runDdl(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_fee_discounts_student
    ON attendance_fee_discounts (student_id, academic_year_id)
    WHERE student_id IS NOT NULL
  `);

  await runDdl(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_fee_discounts_class
    ON attendance_fee_discounts (class_id, academic_year_id)
    WHERE class_id IS NOT NULL
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_absence_days (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sms_sent_at TIMESTAMPTZ,
      PRIMARY KEY (student_id, academic_year_id, attendance_date)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_student_day_scans (
      student_id INTEGER NOT NULL REFERENCES attendance_students(id) ON DELETE CASCADE,
      academic_year_id INTEGER NOT NULL REFERENCES attendance_academic_years(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      checked_in_at TIMESTAMPTZ,
      checked_out_at TIMESTAMPTZ,
      PRIMARY KEY (student_id, academic_year_id, attendance_date)
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_activity_logs (
      id SERIAL PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    )
  `);
  await runDdl(
    `CREATE INDEX IF NOT EXISTS idx_attendance_activity_logs_occurred
     ON attendance_activity_logs (occurred_at DESC)`
  );

  await runDdl(`
    CREATE TABLE IF NOT EXISTS attendance_deletion_requests (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      account_type TEXT NOT NULL,
      notes TEXT,
      ip TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await ensureAttendanceMigrations();
  console.log('Attendance schema checked.');
  if (!(await tableHasRows('attendance_student_day_scans'))) {
    const { backfillDayScansFromRecords } = require('./attendanceDayScans');
    await backfillDayScansFromRecords();
  }
  await seedBootstrapAdmin();
  const { ensureBootstrapAccountant } = require('./attendanceAuth');
  await ensureBootstrapAccountant();
  try {
    console.log('Checking sync schema…');
    const { migrateCloudSync } = require('./sync/cloudMigrate');
    await migrateCloudSync();
    console.log('Sync schema OK.');
  } catch (err) {
    console.error('Sync schema migration failed:', err?.message || err);
  }
}

module.exports = {
  initAttendanceTables,
  seedBootstrapAdmin,
  seedBootstrapAccountant,
};
