const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const outDir = path.join(desktopRoot, 'release-payload');
const stagingDir = path.join(outDir, 'staging');
const zipScript = path.join(__dirname, 'zip-payload.py');

function argValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return String(process.argv[index + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function isEnvFile(name) {
  return name === '.env' || name.startsWith('.env.');
}

function copyMobileBackJs(srcRoot, destRoot) {
  const scriptsRoot = path.join(srcRoot, 'scripts');
  function walk(src) {
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const from = path.join(src, ent.name);
      if (ent.isDirectory()) {
        if (path.resolve(from) === path.resolve(scriptsRoot)) continue;
        walk(from);
        continue;
      }
      if (isEnvFile(ent.name) || !ent.name.endsWith('.js')) continue;
      const rel = path.relative(srcRoot, from);
      const to = path.join(destRoot, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
  walk(srcRoot);
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const stream = fs.readFileSync(file);
  hash.update(stream);
  return hash.digest('hex');
}

function firstBin(names) {
  for (const name of names) {
    const probe = spawnSync(name, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return name;
  }
  return '';
}

function createZip(staging, zipPath) {
  fs.rmSync(zipPath, { force: true });
  const python = firstBin(['python3', 'python']);
  if (python) {
    execFileSync(python, [zipScript, staging, zipPath], { stdio: 'inherit' });
    return;
  }
  if (process.platform === 'win32') {
    const stagingEsc = staging.replace(/'/g, "''");
    const zipEsc = zipPath.replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath '${stagingEsc}' -Force).FullName -DestinationPath '${zipEsc}' -Force`,
      ],
      { stdio: 'inherit' }
    );
    return;
  }
  execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], {
    cwd: staging,
    stdio: 'inherit',
  });
}

function payloadLooksComplete(root) {
  return (
    fs.existsSync(path.join(root, 'ui', 'index.html')) &&
    fs.existsSync(path.join(root, 'mobile-back', 'serverDesktop.js')) &&
    fs.existsSync(path.join(root, 'software-manifest.json'))
  );
}

function appendGithubOutput(pairs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(pairs).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(file, `${lines.join('\n')}\n`);
}

function buildUi() {
  execFileSync('npm', ['--prefix', path.join(repoRoot, 'web-front'), 'run', 'build:desktop'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function main() {
  const skipUi = hasFlag('--skip-ui');
  const writeManifest = hasFlag('--write-manifest');
  const repo = argValue('--repo', process.env.GITHUB_REPOSITORY || 'IzzyTechTeam/smart-attendance');
  const commit = argValue('--commit', process.env.GITHUB_SHA || '').replace(/[^0-9a-f]/gi, '');
  const manifestPath = path.join(desktopRoot, 'software-manifest.json');
  const manifest = readJson(manifestPath);
  const version = String(manifest.version || '').trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error('desktop/software-manifest.json is missing a semver version');
  }

  if (!skipUi) buildUi();

  const dist = path.join(repoRoot, 'web-front', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('web-front/dist/index.html is missing. Run the desktop UI build first.');
  }

  emptyDir(stagingDir);
  copyDir(dist, path.join(stagingDir, 'ui'));
  copyMobileBackJs(path.join(repoRoot, 'mobile-back'), path.join(stagingDir, 'mobile-back'));

  const tag = `desktop-${version}`;
  const zipName = `mpasat-desktop-payload-${version}.zip`;
  const payloadUrl = `https://github.com/${repo}/releases/download/${tag}/${zipName}`;
  const stagedManifest = {
    ...manifest,
    commit: commit || String(manifest.commit || ''),
    releasedAt: new Date().toISOString(),
    payload: {
      ...(manifest.payload || {}),
      url: payloadUrl,
    },
  };
  writeJson(path.join(stagingDir, 'software-manifest.json'), stagedManifest);

  if (!payloadLooksComplete(stagingDir)) {
    throw new Error('Payload staging is incomplete (need ui/, mobile-back/serverDesktop.js, software-manifest.json)');
  }

  const zipPath = path.join(outDir, zipName);
  createZip(stagingDir, zipPath);
  const sha256 = sha256File(zipPath);
  const sizeBytes = fs.statSync(zipPath).size;

  const published = {
    ...stagedManifest,
    payload: {
      ...stagedManifest.payload,
      sha256,
      sizeBytes,
    },
  };
  writeJson(path.join(outDir, 'software-manifest.json'), published);
  if (writeManifest) writeJson(manifestPath, published);

  const meta = {
    version,
    tag,
    zip: zipPath,
    zipName,
    sha256,
    sizeBytes,
    payloadUrl,
    notes: Array.isArray(manifest.notes) ? manifest.notes : [],
  };
  writeJson(path.join(outDir, 'payload-meta.json'), meta);
  const noteLines = meta.notes.length
    ? meta.notes.map((line) => `- ${line}`)
    : [`MPASAT desktop software payload ${version}`];
  fs.writeFileSync(path.join(outDir, 'release-notes.md'), `${noteLines.join('\n')}\n`);
  appendGithubOutput({
    version,
    tag,
    zip: zipPath,
    zip_name: zipName,
    sha256,
    size_bytes: String(sizeBytes),
  });

  console.log(`Payload ${zipName}`);
  console.log(`sha256 ${sha256}`);
  console.log(`size   ${sizeBytes}`);
  console.log(`url    ${payloadUrl}`);
}

main();
