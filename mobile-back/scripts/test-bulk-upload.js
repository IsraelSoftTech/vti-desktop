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
  console.log('login', loginRes.status, login);
  if (!login.token) process.exit(1);

  const filePath = path.join(__dirname, '..', 'test-upload.xlsx');
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'test-upload.xlsx'
  );

  const uploadRes = await fetch(`${base}/api/attendance/students/bulk-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.token}` },
    body: form,
  });
  const text = await uploadRes.text();
  console.log('upload', uploadRes.status, text.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
