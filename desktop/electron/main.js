const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const {
  backendEntry,
  uiDir,
  isInsideDir,
} = require('./payloadPaths');
const {
  checkForSoftwareUpdates,
  getSoftwareStatus,
  applySoftwareUpdates,
  clearJustApplied,
  probeManifestReachable,
} = require('./softwareUpdate');

const desktopRoot = path.join(__dirname, '..');
const nodeModules = path.join(desktopRoot, 'node_modules');
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function patchedModulePaths(from) {
  const paths = origPaths.call(this, from);
  if (!paths.includes(nodeModules)) paths.unshift(nodeModules);
  return paths;
};

let mainWindow = null;
let stopServer = null;
let lastBackendDir = null;
let quitting = false;

function secretsPath() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function loadSecrets() {
  const file = secretsPath();
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed?.jwtSecret) return parsed;
    }
  } catch {
    /* recreate */
  }
  const created = { jwtSecret: crypto.randomBytes(48).toString('hex') };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(created, null, 2));
  return created;
}

function iconPath() {
  const packed = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(packed)) return packed;
  const dev = path.join(__dirname, '..', 'build', 'icon.png');
  return fs.existsSync(dev) ? dev : undefined;
}

function clearBackendRequireCache() {
  const dirs = [];
  if (lastBackendDir) dirs.push(lastBackendDir);
  try {
    dirs.push(path.dirname(backendEntry()));
  } catch {
    /* app not ready */
  }
  if (!dirs.length) return;
  for (const key of Object.keys(require.cache)) {
    if (dirs.some((dir) => isInsideDir(key, dir))) {
      delete require.cache[key];
    }
  }
}

async function stopApi() {
  if (!stopServer) return;
  const stop = stopServer;
  stopServer = null;
  try {
    await Promise.race([
      stop(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    /* ignore */
  }
}

async function startApi() {
  clearBackendRequireCache();
  const entry = backendEntry();
  lastBackendDir = path.dirname(entry);
  const secrets = loadSecrets();
  const { startDesktopServer } = require(entry);
  const started = await startDesktopServer({
    userData: app.getPath('userData'),
    uiDir: uiDir(),
    jwtSecret: secrets.jwtSecret,
    port: 47821,
  });
  stopServer = started.stop;
  return started;
}

async function restartApi() {
  await stopApi();
  const started = await startApi();
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(started.url);
  }
  return started;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    title: 'MPASAT',
    icon: iconPath(),
    backgroundColor: '#F0F1F2',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(url);
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    if (mainWindow) mainWindow.setTitle('MPASAT');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerSoftwareIpc() {
  ipcMain.handle('software:check', async () => checkForSoftwareUpdates());
  ipcMain.handle('software:status', async () => getSoftwareStatus());
  ipcMain.handle('software:apply', async () =>
    applySoftwareUpdates({
      stopApi,
      startApi,
      clearBackendCache: clearBackendRequireCache,
      reloadWindow: async (url) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          await mainWindow.loadURL(url);
        }
      },
    })
  );
  ipcMain.handle('software:probe', async () => ({
    reachable: await probeManifestReachable(4000),
  }));
  ipcMain.handle('software:ackApplied', async () => clearJustApplied());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  registerSoftwareIpc();
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'clipboard-read');
    });

    try {
      const started = await startApi();
      createWindow(started.url);
    } catch (err) {
      dialog.showErrorBox(
        'MPASAT Attendance',
        `Could not start the local attendance service.\n\n${err.message || err}`
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', async (event) => {
    if (quitting || !stopServer) return;
    event.preventDefault();
    quitting = true;
    await stopApi();
    app.exit(0);
  });
}
