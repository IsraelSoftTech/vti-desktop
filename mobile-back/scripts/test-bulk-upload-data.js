const fs = require('fs');
const path = require('path');

async function main() {
  const base = process.argv[2] || 'http://localhost:4000';
  const loginRes = await fetch(`${base}/api/attendance/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin1234', password: 'admin4321' }),
  });
  const login = await loginRes.json();
  console.log('login', loginRes.status, login.error || 'ok');
  if (!login.token) process.exit(1);

  const filePath = path.join(__dirname, '..', 'test-upload.xlsx');
  const base64 = fs.readFileSync(filePath).toString('base64');

  const uploadRes = await fetch(`${base}/api/attendance/students/bulk-upload-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${login.token}`,
    },
    body: JSON.stringify({ fileBase64: base64 }),
  });
  const text = await uploadRes.text();
  console.log('upload-data', uploadRes.status, text.slice(0, 800));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
