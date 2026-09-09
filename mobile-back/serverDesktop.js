const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { mediaRoot } = require('./runtime');

function ensureEnv(options) {
  process.env.ATTENDANCE_RUNTIME = 'desktop';
  process.env.HOST = '127.0.0.1';
  process.env.SMS_ENABLED = 'false';
  process.env.ATTENDANCE_USER_DATA = options.userData;
  process.env.ATTENDANCE_UI_DIR = options.uiDir || '';
  if (options.jwtSecret) process.env.JWT_SECRET = options.jwtSecret;
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for the desktop server');
  }
}

function startDesktopServer(options) {
  ensureEnv(options);

  const { initSqlite } = require('./initSqlite');
  const attendanceRoutes = require('./routes');
  const desktopRoutes = require('./sync/desktopRoutes');
  const { startSyncLoop } = require('./sync/engine');
  const { startAbsentScheduler, stopAbsentScheduler } = require('./absentScheduler');
  const { closeSqlite } = require('./dbSqlite');

  return initSqlite().then(() => {
    const app = express();
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    app.use(cookieParser());

    const mediaDir = mediaRoot();
    fs.mkdirSync(mediaDir, { recursive: true });
    app.use(
      '/api/attendance/media',
      express.static(mediaDir, { index: false, fallthrough: true })
    );

    app.use('/api/attendance', attendanceRoutes);
    app.use('/api/desktop', desktopRoutes);

    app.get('/health', (req, res) => {
      res.json({ ok: true, module: 'attendance-desktop', node: process.version });
    });

    const uiDir = options.uiDir;
    if (uiDir && fs.existsSync(uiDir)) {
      app.use(express.static(uiDir));
      app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        res.sendFile(path.join(uiDir, 'index.html'));
      });
    }

    app.use((err, req, res, next) => {
      if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'FILE SIZE IS LARGE' });
      }
      return next(err);
    });

    const server = http.createServer(app);
    const host = '127.0.0.1';
    const preferred = Number(options.port) || 47821;

    return new Promise((resolve, reject) => {
      const onListen = () => {
        const addr = server.address();
        const port = addr.port;
        console.log(`Desktop API listening on http://${host}:${port}`);
        startAbsentScheduler();
        startSyncLoop();
        resolve({
          server,
          port,
          url: `http://${host}:${port}`,
          stop: () =>
            new Promise((resStop) => {
              stopAbsentScheduler();
              server.close(() => {
                try {
                  closeSqlite();
                } catch {
                  /* ignore */
                }
                resStop();
              });
            }),
        });
      };

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && !options.portLocked) {
          server.listen(0, host, onListen);
          return;
        }
        reject(err);
      });

      server.listen(preferred, host, onListen);
    });
  });
}

module.exports = { startDesktopServer };
