if (process.env.ATTENDANCE_RUNTIME === 'desktop') {
  module.exports = require('./dbSqlite');
} else {
  const { Pool } = require('pg');

  const connectionString = process.env.DATABASE_URL || '';
  const useSsl =
    process.env.DB_SSL === 'true' ||
    /[?&]sslmode=(require|verify-ca|verify-full)/i.test(connectionString);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    ...(useSsl && {
      ssl: { rejectUnauthorized: false },
    }),
  });

  module.exports = { pool };
}
