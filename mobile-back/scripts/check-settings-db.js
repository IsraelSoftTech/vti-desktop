require('../loadEnv');
const { pool } = require('../db');

(async () => {
  try {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'attendance_settings' ORDER BY 1`
    );
    console.log('columns:', cols.rows.map((r) => r.column_name).join(', '));
    const year = await pool.query(
      'SELECT id, name FROM attendance_academic_years WHERE is_active = TRUE LIMIT 1'
    );
    console.log('active year:', year.rows[0]);
    if (year.rows[0]) {
      const s = await pool.query(
        'SELECT * FROM attendance_settings WHERE academic_year_id = $1',
        [year.rows[0].id]
      );
      console.log('settings row:', s.rows[0]);
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
})();
