require('./loadEnv');

const { pool } = require('./db');
const { initAttendanceTables, seedBootstrapAdmin } = require('./initDb');
const { ensureBootstrapAccountant } = require('./attendanceAuth');

async function main() {
  await initAttendanceTables();
  await seedBootstrapAdmin();
  await ensureBootstrapAccountant();
  console.log('[attendance] seed OK — admin and accountant accounts ready');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
