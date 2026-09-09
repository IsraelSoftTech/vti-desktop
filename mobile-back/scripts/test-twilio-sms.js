/**
 * Run on the API server: node scripts/test-twilio-sms.js +237675644383
 * Uses TWILIO_* from .env — does not touch the database.
 */
require('../loadEnv');
const { sendTwilioSms, normalizePhoneNumber } = require('../smsService');

const toArg = process.argv[2] || process.env.SMS_TEST_TO;
const to = normalizePhoneNumber(toArg);

if (!to) {
  console.error('Usage: node scripts/test-twilio-sms.js +237XXXXXXXXX');
  process.exit(1);
}

console.log('TWILIO_ACCOUNT_SID set:', !!process.env.TWILIO_ACCOUNT_SID);
console.log('TWILIO_AUTH_TOKEN set:', !!process.env.TWILIO_AUTH_TOKEN);
console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER || '(missing)');
console.log('Sending test SMS to', to, '...');

sendTwilioSms(to, 'MPASAT test SMS — Twilio is configured.')
  .then((r) => {
    console.log('Result:', r);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('Failed:', err.message || err);
    process.exit(1);
  });
