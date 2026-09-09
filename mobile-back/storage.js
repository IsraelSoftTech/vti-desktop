if (process.env.ATTENDANCE_RUNTIME === 'desktop') {
  module.exports = require('./storageLocal');
} else {
  module.exports = createFtpStorage();
}

function createFtpStorage() {
  const { Readable } = require('stream');
  const ftp = require('basic-ftp');

  function getFtpPublicBase() {
    const raw =
      process.env.FTP_PUBLIC_BASE_URL ||
      process.env.FTP_BASE_URL ||
      process.env.FTP_PUBLIC_BASE ||
      '';
    return String(raw).trim().replace(/\/$/, '');
  }

  function getFtpBaseDir() {
    let remoteDir = (process.env.FTP_BASE_DIR || process.env.FTP_REMOTE_DIR || '/')
      .trim()
      .replace(/\\/g, '/');
    if (!remoteDir.startsWith('/')) {
      remoteDir = `/${remoteDir}`;
    }
    remoteDir = remoteDir.replace(/\/$/, '') || '/';
    return remoteDir;
  }

  function getFtpPassword() {
    return process.env.FTP_PASS || process.env.FTP_PASSWORD || '';
  }

  function requireFtpConfig() {
    const host = (process.env.FTP_HOST || '').trim();
    if (!host) {
      throw new Error('FTP_HOST is required — files must be stored on FTP, not locally');
    }
    const publicBase = getFtpPublicBase();
    if (!publicBase) {
      throw new Error('Set FTP_PUBLIC_BASE_URL (or FTP_BASE_URL) when FTP_HOST is set');
    }
    const user = (process.env.FTP_USER || '').trim();
    if (!user) {
      throw new Error('FTP_USER is required');
    }
    const password = getFtpPassword();
    if (!password) {
      throw new Error('FTP_PASS (or FTP_PASSWORD) is required');
    }
    return {
      host,
      port: Number(process.env.FTP_PORT || 21),
      user,
      password,
      secure: process.env.FTP_SECURE === 'true',
      publicBase,
      remoteDir: getFtpBaseDir(),
    };
  }

  async function withFtpClient(fn) {
    const config = requireFtpConfig();
    const client = new ftp.Client();
    client.ftp.verbose = process.env.FTP_DEBUG === 'true';
    try {
      await client.access({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        secure: config.secure,
      });
      return await fn(client, config);
    } finally {
      client.close();
    }
  }

  function joinRemotePath(remoteDir, filename) {
    const safeName = String(filename).replace(/^\/+/, '');
    return remoteDir === '/' ? `/${safeName}` : `${remoteDir}/${safeName}`;
  }

  async function uploadBuffer(buffer, filename, subdir = '') {
    if (!buffer?.length) return null;
    const safeName = String(filename).replace(/^\/+/, '');

    return withFtpClient(async (client, config) => {
      let remoteDir = config.remoteDir;
      const folder = String(subdir || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
      if (folder) {
        remoteDir =
          remoteDir === '/' ? `/${folder}` : `${remoteDir}/${folder}`;
      }
      await client.ensureDir(remoteDir);
      const remotePath = joinRemotePath(remoteDir, safeName);
      const stream = Readable.from(buffer);
      await client.uploadFrom(stream, remotePath);

      const publicPath = folder ? `${folder}/${safeName}` : safeName;
      return `${config.publicBase}/${publicPath}`;
    });
  }

  async function deleteByPublicUrl(publicUrl) {
    if (!publicUrl || typeof publicUrl !== 'string') return;
    let publicBase;
    try {
      publicBase = getFtpPublicBase();
    } catch {
      return;
    }
    if (!publicBase || !publicUrl.startsWith(publicBase + '/')) return;

    const relative = publicUrl.slice(publicBase.length).replace(/^\/+/, '');
    if (!relative || relative.includes('..')) return;

    try {
      await withFtpClient(async (client, config) => {
        const remotePath = joinRemotePath(config.remoteDir, relative);
        await client.remove(remotePath);
      });
    } catch {
      /* ignore missing / already deleted */
    }
  }

  function sniffImageContentType(buffer) {
    if (!buffer || buffer.length < 12) return 'image/png';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'image/webp';
    }
    return 'image/png';
  }

  async function readPhotoBuffer(photoUrl) {
    if (!photoUrl) return null;
    const upstream = await fetch(String(photoUrl));
    if (!upstream.ok) return null;
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const headerType = String(upstream.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const contentType = headerType.startsWith('image/')
      ? headerType
      : sniffImageContentType(buffer);
    return { buffer, contentType };
  }

  return {
    uploadBuffer,
    deleteByPublicUrl,
    readPhotoBuffer,
    getFtpPublicBase,
    getFtpBaseDir,
  };
}
