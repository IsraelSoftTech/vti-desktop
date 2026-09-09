require('../loadEnv');
const ftp = require('basic-ftp');
const { pool } = require('../db');

async function moveDir(client, fromDir, toDir) {
  await client.ensureDir(toDir);
  await client.cd('/');
  let entries = [];
  try {
    entries = await client.list(fromDir);
  } catch {
    return [];
  }
  const moved = [];
  for (const e of entries) {
    if (e.type !== 1) continue;
    const src = `${fromDir}/${e.name}`;
    const dest = `${toDir}/${e.name}`;
    try {
      await client.rename(src, dest);
      moved.push(e.name);
      console.log('moved', src, '->', dest);
    } catch (err) {
      console.log('rename fail', src, err.message);
    }
  }
  return moved;
}

async function main() {
  const client = new ftp.Client();
  await client.access({
    host: process.env.FTP_HOST,
    port: Number(process.env.FTP_PORT || 21),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS || process.env.FTP_PASSWORD,
    secure: process.env.FTP_SECURE === 'true',
  });

  await moveDir(client, '/web', '/public_html/web');
  await client.cd('/');
  await moveDir(client, '/attendance', '/public_html/attendance');
  client.close();

  const oldBase = 'https://st69310.ispot.cc/vtispace';
  const newBase = 'https://st69310.ispot.cc';
  const tables = [
    ['attendance_students', 'photo_url'],
    ['web_site_settings', 'logo_url'],
    ['web_home_content', 'intro_image_url'],
    ['web_home_content', 'hero_banner_url'],
    ['web_hero_slides', 'image_url'],
    ['web_departments', 'image_url'],
    ['web_programs', 'cover_image_url'],
    ['web_uniqueness_items', 'icon_url'],
  ];

  for (const [table, col] of tables) {
    try {
      const r = await pool.query(
        `UPDATE ${table}
         SET ${col} = REPLACE(${col}, $1, $2)
         WHERE ${col} LIKE $3`,
        [oldBase, newBase, `${oldBase}/%`]
      );
      console.log(`db ${table}.${col} updated`, r.rowCount);
    } catch (e) {
      console.log(`db skip ${table}.${col}`, e.message);
    }
  }

  await pool.end();

  const checks = [
    'https://st69310.ispot.cc/web/pub-check.png',
    'https://st69310.ispot.cc/attendance/display-check.png',
    'https://st69310.ispot.cc/web/display-check.png',
  ];
  for (const url of checks) {
    const res = await fetch(url);
    console.log('verify', res.status, url);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
