const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const electronDir = __dirname;
const packagedAppRoot = path.join(electronDir, '..');
const repoRoot = path.join(electronDir, '..', '..');

function softwareDir() {
  return path.join(app.getPath('userData'), 'software');
}

function overlayCurrentDir() {
  return path.join(softwareDir(), 'current');
}

function overlayPreviousDir() {
  return path.join(softwareDir(), 'previous');
}

function overlayStagingDir() {
  return path.join(softwareDir(), 'staging');
}

function overlayIsComplete(root) {
  if (!root) return false;
  return (
    fs.existsSync(path.join(root, 'ui', 'index.html')) &&
    fs.existsSync(path.join(root, 'mobile-back', 'serverDesktop.js'))
  );
}

function payloadLooksComplete(root) {
  return (
    overlayIsComplete(root) &&
    fs.existsSync(path.join(root, 'software-manifest.json'))
  );
}

function bundledRoot() {
  return app.isPackaged ? packagedAppRoot : repoRoot;
}

function payloadRoot() {
  if (app.isPackaged) {
    const overlay = overlayCurrentDir();
    if (overlayIsComplete(overlay)) return overlay;
    return packagedAppRoot;
  }
  return repoRoot;
}

function usingOverlay() {
  return app.isPackaged && overlayIsComplete(overlayCurrentDir());
}

function backendEntry() {
  if (app.isPackaged) {
    return path.join(payloadRoot(), 'mobile-back', 'serverDesktop.js');
  }
  return path.join(repoRoot, 'mobile-back', 'serverDesktop.js');
}

function uiDir() {
  if (app.isPackaged) {
    return path.join(payloadRoot(), 'ui');
  }
  return path.join(repoRoot, 'web-front', 'dist');
}

function isInsideDir(file, dir) {
  let f = path.normalize(file);
  let d = path.normalize(dir);
  if (process.platform === 'win32') {
    f = f.toLowerCase();
    d = d.toLowerCase();
  }
  return f === d || f.startsWith(d + path.sep);
}

module.exports = {
  softwareDir,
  overlayCurrentDir,
  overlayPreviousDir,
  overlayStagingDir,
  overlayIsComplete,
  payloadLooksComplete,
  bundledRoot,
  payloadRoot,
  usingOverlay,
  backendEntry,
  uiDir,
  isInsideDir,
};
