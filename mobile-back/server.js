require('./loadEnv');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const attendanceRoutes = require('./routes');
const { getSmsConfigStatus } = require('./smsService');
const { routes: webRoutes, initWebTables } = require('./web');
const { initAttendanceTables } = require('./initDb');
const { startAbsentScheduler } = require('./absentScheduler');

const app = express();
const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || '0.0.0.0';

function buildCorsOrigin() {
  const raw = process.env.WEB_CORS_ORIGINS || process.env.CORS_ORIGINS || '';
  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.length) {
    return true;
  }
  return (origin, callback) => {
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

app.use(
  cors({
    origin: buildCorsOrigin(),
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

const { privacyPolicyHandler } = require('./privacyPolicy');
const { deletionPageHandler, deletionRequestHandler } = require('./accountDeletion');
app.get('/privacy', privacyPolicyHandler);
app.get('/privacy.html', privacyPolicyHandler);
app.get('/delete-account', deletionPageHandler);
app.get('/delete-account.html', deletionPageHandler);
app.get('/account-deletion', deletionPageHandler);
app.post('/delete-account', deletionRequestHandler);
app.post('/account-deletion', deletionRequestHandler);

app.use('/api/attendance', attendanceRoutes);
app.post('/api/sms/dlr', (req, res, next) => {
  req.url = '/sms/dlr';
  attendanceRoutes(req, res, next);
});
app.use('/api/web', webRoutes);
try {
  app.use('/api/sync', require('./sync/cloudRoutes').createCloudSyncRouter());
} catch (err) {
  console.error('Failed to mount /api/sync — attendance API will still run:', err);
  app.use('/api/sync', (_req, res) => {
    res.status(503).json({ error: 'Sync API failed to start' });
  });
}

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'FILE SIZE IS LARGE' });
  }
  return next(err);
});

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    module: 'attendance',
    node: process.version,
    sms: getSmsConfigStatus(),
  });
});

async function start() {
  try {
    console.log('Connecting to Postgres and checking tables…');
    await initAttendanceTables();
    console.log('Attendance DB tables OK.');
    await initWebTables();
    console.log('Web DB tables OK.');
  } catch (e) {
    console.error('Attendance DB init failed:', e?.message || e);
    if (process.env.REQUIRE_DB_ON_START === 'true') {
      process.exit(1);
    }
    console.warn(
      'Server will start anyway; set REQUIRE_DB_ON_START=true to exit on failure.'
    );
  }

  app.listen(port, host, () => {
    const sms = getSmsConfigStatus();
    console.log(`Attendance API listening on http://${host}:${port}`);
    console.log(
      '[sms] SMSVAS',
      sms.configured ? `configured (sender ${sms.senderId || 'waymakerSL'})` : 'NOT configured — check SMS_API_USER / SMS_API_PASSWORD'
    );
    startAbsentScheduler();
  });
}

start();
