const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const { app } = require('electron');
const {
  softwareDir,
  overlayCurrentDir,
  overlayPreviousDir,
  overlayStagingDir,
  overlayIsComplete,
  payloadLooksComplete,
  isInsideDir,
} = require('./payloadPaths');
const {
  checkTimeoutMs,
  downloadTimeoutMs,
  maxPayloadBytes,
  defaultManifestUrl,
} = require('./softwareConfig');

const SHA256_HEX = /^[a-f0-9]{64}$/i;

function statePath() {
  return path.join(softwareDir(), 'state.json');
}

function secretsPath() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function readJsonFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* missing or malformed */
  }
  return null;
}

function readOptionalSecrets() {
  return readJsonFile(secretsPath()) || {};
}

function readState() {
  return readJsonFile(statePath()) || {};
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  fs.mkdirSync(softwareDir(), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(next, null, 2));
  return next;
}

function parseSemver(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function shellVersion() {
  return String(app.getVersion() || '0.0.0');
}

function installedVersion(state = readState()) {
  return String(state.installedVersion || shellVersion());
}

function installedCommit(state = readState()) {
  return state.installedCommit ? String(state.installedCommit) : '';
}

function manifestUrlFromConfig() {
  const envUrl = String(process.env.MPASAT_SOFTWARE_MANIFEST_URL || '').trim();
  if (envUrl) return envUrl;
  const secrets = readOptionalSecrets();
  const secretUrl = String(secrets.softwareManifestUrl || '').trim();
  if (secretUrl) return secretUrl;
  return defaultManifestUrl;
}

function githubToken() {
  const envToken = String(process.env.MPASAT_GITHUB_TOKEN || '').trim();
  if (envToken) return envToken;
  const secrets = readOptionalSecrets();
  return String(secrets.githubToken || '').trim();
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function notesFrom(manifest) {
  if (Array.isArray(manifest.notes)) {
    return manifest.notes.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof manifest.notes === 'string' && manifest.notes.trim()) {
    return [manifest.notes.trim()];
  }
  return [];
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Malformed software manifest');
  }
  if (Number(manifest.schema) !== 1) {
    throw new Error('Unsupported software manifest schema');
  }
  if (!parseSemver(manifest.version)) {
    throw new Error('Software manifest is missing a version');
  }
  const payload = manifest.payload;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Software manifest is missing payload');
  }
  if (!isHttpsUrl(payload.url)) {
    throw new Error('Software payload URL must be https');
  }
  if (!SHA256_HEX.test(String(payload.sha256 || ''))) {
    throw new Error('Software payload checksum is missing');
  }
  if (manifest.minShellVersion && !parseSemver(manifest.minShellVersion)) {
    throw new Error('Software manifest minShellVersion is invalid');
  }
  return manifest;
}

function checkResult(status, extra = {}) {
  const state = readState();
  return {
    status,
    currentVersion: installedVersion(state),
    remoteVersion: extra.remoteVersion || '',
    shellVersion: shellVersion(),
    notes: extra.notes || [],
    message: extra.message || '',
    manifestUrl: extra.manifestUrl || manifestUrlFromConfig(),
  };
}

function requestHeaders() {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'MPASAT-Attendance-Desktop',
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchManifest(url, timeoutMs = checkTimeoutMs) {
  if (!isHttpsUrl(url)) {
    throw new Error('Software manifest URL must be https');
  }
  const res = await fetch(url, {
    headers: requestHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Software manifest HTTP ${res.status}`);
  }
  const body = await res.json();
  return validateManifest(body);
}

async function probeManifestReachable(timeoutMs = 4000) {
  const url = manifestUrlFromConfig();
  try {
    if (!isHttpsUrl(url)) return false;
    await fetch(url, {
      method: 'GET',
      headers: requestHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

function remoteIsNewer(manifest, state) {
  const cmp = compareSemver(manifest.version, installedVersion(state));
  if (cmp == null) throw new Error('Could not compare software versions');
  if (cmp > 0) return true;
  if (cmp < 0) return false;
  const remoteCommit = String(manifest.commit || '');
  const localCommit = installedCommit(state);
  return Boolean(remoteCommit && localCommit && remoteCommit !== localCommit);
}

function needsNewInstaller(manifest) {
  if (!manifest.minShellVersion) return false;
  const cmp = compareSemver(manifest.minShellVersion, shellVersion());
  return cmp != null && cmp > 0;
}

async function checkForSoftwareUpdates() {
  const url = manifestUrlFromConfig();
  try {
    const manifest = await fetchManifest(url);
    const state = readState();
    writeState({ lastCheckAt: new Date().toISOString() });

    if (!remoteIsNewer(manifest, state)) {
      return checkResult('upToDate', {
        remoteVersion: manifest.version,
        notes: notesFrom(manifest),
        manifestUrl: url,
      });
    }
    if (needsNewInstaller(manifest)) {
      return checkResult('installerRequired', {
        remoteVersion: manifest.version,
        notes: notesFrom(manifest),
        manifestUrl: url,
        message: 'This update needs a new MPASAT installer.',
      });
    }
    return checkResult('updatesFound', {
      remoteVersion: manifest.version,
      notes: notesFrom(manifest),
      manifestUrl: url,
    });
  } catch (err) {
    return checkResult('checkFailed', {
      manifestUrl: url,
      message: err instanceof Error ? err.message : 'Could not check for software updates',
    });
  }
}

function getSoftwareStatus() {
  const state = readState();
  return {
    currentVersion: installedVersion(state),
    shellVersion: shellVersion(),
    installedCommit: installedCommit(state),
    justApplied: Boolean(state.justApplied),
    lastCheckAt: state.lastCheckAt ? String(state.lastCheckAt) : null,
    manifestUrl: manifestUrlFromConfig(),
  };
}

function clearJustApplied() {
  const state = readState();
  if (!state.justApplied) return getSoftwareStatus();
  writeState({ justApplied: false });
  return getSoftwareStatus();
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function resetDir(dir) {
  removeDir(dir);
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetry(from, to) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      lastErr = err;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastErr;
}

function nextOverlayDir() {
  return path.join(softwareDir(), 'current.next');
}

function hashesMatch(actualHex, expectedHex) {
  const actual = Buffer.from(String(actualHex || '').toLowerCase(), 'hex');
  const expected = Buffer.from(String(expectedHex || '').toLowerCase(), 'hex');
  if (actual.length !== 32 || expected.length !== 32) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function findPayloadRoot(unpacked) {
  if (payloadLooksComplete(unpacked)) return unpacked;
  let entries = [];
  try {
    entries = fs.readdirSync(unpacked, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(unpacked, entry.name);
    if (payloadLooksComplete(nested)) return nested;
  }
  return null;
}

function isUnsafeZipName(name) {
  const normalized = String(name || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return true;
  }
  return normalized.split('/').some((part) => part === '..');
}

async function extractZipSafely(zipPath, destDir) {
  const destRoot = path.resolve(destDir);
  resetDir(destRoot);
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const names = Object.keys(zip.files);
  if (!names.length) throw new Error('The update archive is empty');

  for (const name of names) {
    if (isUnsafeZipName(name)) {
      throw new Error('Update archive had an unsafe path');
    }
    const target = path.resolve(destRoot, name.replace(/\\/g, '/'));
    if (!isInsideDir(target, destRoot)) {
      throw new Error('Update archive had an unsafe path');
    }
    const entry = zip.files[name];
    if (entry.dir || name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const data = await entry.async('nodebuffer');
    fs.writeFileSync(target, data);
  }
}

async function downloadPayload(url, dest, timeoutMs, maxBytes) {
  if (!isHttpsUrl(url)) {
    throw new Error('Software payload URL must be https');
  }
  const res = await fetch(url, {
    headers: {
      ...requestHeaders(),
      Accept: 'application/octet-stream',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Could not download the update (HTTP ${res.status})`);
  }
  if (!res.body) {
    throw new Error('Could not download the update');
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    throw new Error('Update file is too large');
  }

  const reader = res.body.getReader();
  const out = fs.createWriteStream(dest);
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > maxBytes) {
        throw new Error('Update file is too large');
      }
      if (!out.write(Buffer.from(value))) {
        await new Promise((resolve) => out.once('drain', resolve));
      }
    }
    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    out.destroy();
    try {
      fs.rmSync(dest, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function rotateOverlay(payloadRoot) {
  const current = overlayCurrentDir();
  const previous = overlayPreviousDir();
  const next = nextOverlayDir();
  removeDir(next);
  await renameWithRetry(payloadRoot, next);

  if (fs.existsSync(previous)) removeDir(previous);
  if (fs.existsSync(current)) {
    await renameWithRetry(current, previous);
  }
  await renameWithRetry(next, current);

  if (!overlayIsComplete(current)) {
    throw new Error('The update did not contain a complete desktop payload');
  }
}

function restorePreviousOverlay() {
  const current = overlayCurrentDir();
  const previous = overlayPreviousDir();
  removeDir(nextOverlayDir());
  if (fs.existsSync(previous)) {
    if (fs.existsSync(current)) removeDir(current);
    fs.renameSync(previous, current);
    return;
  }
  removeDir(current);
}

let applyInFlight = false;

async function applySoftwareUpdates(hooks = {}) {
  if (applyInFlight) {
    return { ok: false, error: 'An update is already in progress.' };
  }
  if (!app.isPackaged) {
    return {
      ok: false,
      error: 'Software updates apply only in the installed MPASAT app.',
    };
  }
  if (typeof hooks.stopApi !== 'function' || typeof hooks.startApi !== 'function') {
    return { ok: false, error: 'Could not apply software updates' };
  }

  applyInFlight = true;
  const staging = overlayStagingDir();
  let apiStopped = false;
  let swapped = false;
  let started = null;

  try {
    const manifest = await fetchManifest(manifestUrlFromConfig());
    const state = readState();
    if (!remoteIsNewer(manifest, state)) {
      return { ok: false, error: 'This PC is already up to date.' };
    }
    if (needsNewInstaller(manifest)) {
      return { ok: false, error: 'This update needs a new MPASAT installer.' };
    }

    resetDir(staging);
    removeDir(nextOverlayDir());
    const zipPath = path.join(staging, 'payload.zip');
    const unpacked = path.join(staging, 'unpacked');
    await downloadPayload(
      manifest.payload.url,
      zipPath,
      downloadTimeoutMs,
      Number(manifest.payload.sizeBytes) > 0
        ? Math.min(maxPayloadBytes, Number(manifest.payload.sizeBytes) * 1.1)
        : maxPayloadBytes
    );

    const digest = await sha256File(zipPath);
    if (!hashesMatch(digest, manifest.payload.sha256)) {
      throw new Error('The update file did not match its checksum. Nothing was changed.');
    }

    await extractZipSafely(zipPath, unpacked);
    const payloadRoot = findPayloadRoot(unpacked);
    if (!payloadRoot) {
      throw new Error('The update file is missing the desktop app files.');
    }

    await hooks.stopApi();
    apiStopped = true;
    if (typeof hooks.clearBackendCache === 'function') hooks.clearBackendCache();

    await rotateOverlay(payloadRoot);
    swapped = true;
    removeDir(staging);

    started = await hooks.startApi();
    apiStopped = false;
    writeState({
      installedVersion: manifest.version,
      installedCommit: String(manifest.commit || ''),
      justApplied: true,
      lastAppliedAt: new Date().toISOString(),
    });
    try {
      if (typeof hooks.reloadWindow === 'function' && started?.url) {
        await hooks.reloadWindow(started.url);
      }
    } catch {
      /* overlay is already live */
    }
    return { ok: true, version: manifest.version };
  } catch (err) {
    removeDir(staging);
    if (swapped && !started) {
      try {
        restorePreviousOverlay();
      } catch {
        /* keep going so the bundled app can start */
      }
    } else if (!swapped) {
      removeDir(nextOverlayDir());
    }
    if (apiStopped) {
      try {
        started = await hooks.startApi();
        apiStopped = false;
        if (typeof hooks.reloadWindow === 'function' && started?.url) {
          await hooks.reloadWindow(started.url);
        }
      } catch {
        /* window may still show the apply error */
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not apply software updates',
    };
  } finally {
    applyInFlight = false;
  }
}

module.exports = {
  checkForSoftwareUpdates,
  getSoftwareStatus,
  clearJustApplied,
  applySoftwareUpdates,
  probeManifestReachable,
  compareSemver,
  validateManifest,
};
