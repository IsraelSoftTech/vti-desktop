/**
 * Run on the API server: node scripts/test-sms.js +237675644383
 * Uses SMS_API_* from .env.
 */
require('../loadEnv');
const { sendSms, normalizePhoneNumber, fetchSmsCredit } = require('../smsService');

const toArg = process.argv[2] || process.env.SMS_TEST_TO;
const to = normalizePhoneNumber(toArg);

if (!to) {
  console.error('Usage: node scripts/test-sms.js +237XXXXXXXXX');
  process.exit(1);
}

console.log('SMS_API_USER set:', !!process.env.SMS_API_USER);
console.log('SMS_SENDER_ID:', process.env.SMS_SENDER_ID || 'waymakerSL');
console.log('Sending test SMS to', to, '...');

fetchSmsCredit()
  .then((c) => console.log('Credit:', c))
  .catch((err) => console.warn('Credit check failed:', err.message || err))
  .then(() => sendSms(to, 'MPASAT test SMS — SMSVAS is configured.', { kind: 'other' }))
  .then((r) => {
    console.log('Result:', r);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('Failed:', err.message || err);
    process.exit(1);
  });
