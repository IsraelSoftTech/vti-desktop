const { pool } = require('./db');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactEmail() {
  return process.env.PRIVACY_CONTACT_EMAIL || 'support@vtispace.com';
}

function pageCss() {
  return `
    body { font-family: system-ui, sans-serif; line-height: 1.55; max-width: 720px; margin: 32px auto; padding: 0 20px; color: #111827; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.15rem; margin-top: 1.6rem; }
    p, li, label { color: #374151; }
    a { color: #1d4ed8; }
    form { margin-top: 1.2rem; display: grid; gap: 12px; }
    label { font-weight: 600; font-size: 0.92rem; display: grid; gap: 6px; }
    input, select, textarea {
      font: inherit; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; width: 100%; box-sizing: border-box;
    }
    textarea { min-height: 88px; resize: vertical; }
    button {
      font: inherit; font-weight: 700; background: #1e3a8a; color: #fff; border: 0; border-radius: 12px; padding: 12px 16px; cursor: pointer;
    }
    .ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 12px 14px; border-radius: 12px; }
    .err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 14px; border-radius: 12px; }
    .hp { position: absolute; left: -9999px; }
  `;
}

function deletionPageHtml({ sent, error } = {}) {
  const contact = escapeHtml(contactEmail());
  const updated = '20 August 2026';
  const banner = sent
    ? `<p class="ok">Your deletion request was received. We will process it within 14 days and email or SMS you when it is done.</p>`
    : error
      ? `<p class="err">${escapeHtml(error)}</p>`
      : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MPASAT — Request account and data deletion</title>
  <style>${pageCss()}</style>
</head>
<body>
  <h1>Request deletion of your MPASAT data</h1>
  <p>Last updated ${updated}.</p>
  ${banner}
  <p>Google Play requires a web page where anyone can ask us to delete their account and associated personal data. You do not need to be signed in to the app to use this page.</p>

  <h2>Delete it yourself in the app (fastest)</h2>
  <ol>
    <li>Open MPASAT and sign in with your parent phone number.</li>
    <li>Go to <strong>Settings</strong>.</li>
    <li>Tap <strong>Delete account</strong> and confirm.</li>
  </ol>
  <p>That immediately removes your parent login, chat, in-app notices, device tokens, and linked-student connections.</p>

  <h2>Request deletion without the app</h2>
  <p>Use the form below, or email <a href="mailto:${contact}">${contact}</a> with your full name and the phone number you use to sign in. Staff / school logins are closed by the school; we will pass those requests to the school that issued the account.</p>

  <form method="post" action="/delete-account">
    <label>Full name
      <input name="full_name" required maxlength="120" autocomplete="name" />
    </label>
    <label>Phone used to sign in
      <input name="phone" maxlength="40" autocomplete="tel" placeholder="e.g. 6XX XX XX XX" />
    </label>
    <label>Email (optional, for our reply)
      <input name="email" type="email" maxlength="120" autocomplete="email" />
    </label>
    <label>Account type
      <select name="account_type" required>
        <option value="parent">Parent</option>
        <option value="staff">Staff / school account</option>
      </select>
    </label>
    <label>Anything we should know
      <textarea name="notes" maxlength="1000" placeholder="School name, username, or other details"></textarea>
    </label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" />
    <button type="submit">Submit deletion request</button>
  </form>

  <h2>What we delete</h2>
  <ul>
    <li>Parent login (name, phone used as username, password hash).</li>
    <li>Parent–student links created in the app.</li>
    <li>Parent chat messages, photos, voice notes, and files.</li>
    <li>In-app notification history and device tokens for that parent.</li>
  </ul>

  <h2>What the school keeps</h2>
  <p>Student attendance, ID photos, and fee records belong to the school. Deleting a parent account does not erase those school records. Ask the school office if you need a student file removed from the school’s own records.</p>

  <h2>How long it takes</h2>
  <p>In-app parent deletion is immediate. Web or email requests are completed within <strong>14 days</strong>.</p>

  <p><a href="/privacy">Privacy Policy</a></p>
</body>
</html>`;
}

function trimField(value, max) {
  return String(value || '').trim().slice(0, max);
}

const recentByIp = new Map();

function tooManyFrom(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const list = (recentByIp.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= 5) {
    recentByIp.set(ip, list);
    return true;
  }
  list.push(now);
  recentByIp.set(ip, list);
  return false;
}

function deletionPageHandler(req, res) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(
    deletionPageHtml({ sent: req.query.sent === '1', error: req.query.error })
  );
}

async function deletionRequestHandler(req, res) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  const send = (query) => res.redirect(303, `/delete-account${query}`);

  if (trimField(req.body?.website, 80)) {
    return send('?sent=1');
  }

  const ip = String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 80);
  if (tooManyFrom(ip)) {
    return send('?error=' + encodeURIComponent('Please wait before sending another request.'));
  }

  const fullName = trimField(req.body?.full_name, 120);
  const phone = trimField(req.body?.phone, 40);
  const email = trimField(req.body?.email, 120);
  const accountType = trimField(req.body?.account_type, 20) === 'staff' ? 'staff' : 'parent';
  const notes = trimField(req.body?.notes, 1000);

  if (!fullName) {
    return send('?error=' + encodeURIComponent('Please enter your full name.'));
  }
  if (!phone && !email) {
    return send('?error=' + encodeURIComponent('Please enter the phone you use to sign in, or an email so we can reply.'));
  }

  try {
    await pool.query(
      `INSERT INTO attendance_deletion_requests
        (full_name, phone, email, account_type, notes, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fullName, phone || null, email || null, accountType, notes || null, ip || null]
    );
  } catch (err) {
    console.error('[deletion-request]', err);
    return send(
      '?error=' +
        encodeURIComponent(`Could not save the form. Email ${contactEmail()} instead.`)
    );
  }

  return send('?sent=1');
}

module.exports = { deletionPageHandler, deletionRequestHandler, deletionPageHtml };
