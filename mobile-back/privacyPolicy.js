function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function privacyPolicyHtml() {
  const contact = escapeHtml(
    process.env.PRIVACY_CONTACT_EMAIL || 'support@vtispace.com'
  );
  const updated = '21 August 2026';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MPASAT Privacy Policy</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.55; max-width: 720px; margin: 32px auto; padding: 0 20px; color: #111827; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.15rem; margin-top: 1.6rem; }
    p, li { color: #374151; }
  </style>
</head>
<body>
  <h1>MPASAT Privacy Policy</h1>
  <p>Last updated ${updated}.</p>
  <p>MPASAT is a school attendance, messaging, and fee-records app operated for the school that issued you an account. The school is the controller of student records. Izzy Tech Team provides the software and hosting used to process that information for the school.</p>
  <h2>Information we process</h2>
  <ul>
    <li>Staff usernames and password hashes; parent names, phone numbers used as login, and password hashes.</li>
    <li>Student names, classes, barcodes, photos, attendance check-in and check-out times, and school fee ledger amounts recorded by the school.</li>
    <li>Parent–student links created when a parent enters a student barcode.</li>
    <li>Chat messages, photos, voice notes, and files sent between parents and the school.</li>
    <li>In-app notification history for linked students. Lock-screen push uses an Expo/Firebase device token after a parent has opened MPASAT and allowed notifications.</li>
    <li>Device and app technical data needed to keep the service running (for example, IP address on the school server logs).</li>
  </ul>
  <h2>How it is used</h2>
  <p>Information is used only to run school attendance, communicate with parents, and keep fee records the school already maintains. We do not sell personal information, and we do not use it for advertising.</p>
  <h2>Children and students</h2>
  <p>Student profiles may include minors. Those records belong to the school. Parents only see children they have linked with an official barcode. Photos and attendance are not public.</p>
  <h2>Storage and security</h2>
  <p>Passwords are stored as one-way hashes. The mobile app keeps the sign-in token in the device secure store. Access to school data requires an authorised account. Communication with the production school server uses HTTPS.</p>
  <h2>Retention and deletion</h2>
  <p>The school decides how long student and fee records are kept. A parent can delete their parent account in the MPASAT app (Settings → Delete account). That removes the parent login, device tokens, in-app notices, chat thread, and student links. It does not delete the school’s student attendance or fee records.</p>
  <p>You can also request deletion without opening the app: <a href="/delete-account">Request account and data deletion</a>.</p>
  <h2>Your choices</h2>
  <p>Parents may unlink a student, clear in-app notices, and delete their account. Staff accounts are created by the school; contact the school to close a staff login, or use the <a href="/delete-account">deletion request page</a>.</p>
  <h2>Contact</h2>
  <p>Questions about this policy or a deletion request: <a href="mailto:${contact}">${contact}</a>.</p>
</body>
</html>`;
}

function privacyPolicyHandler(_req, res) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  return res.status(200).send(privacyPolicyHtml());
}

module.exports = { privacyPolicyHandler, privacyPolicyHtml };
