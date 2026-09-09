/**
 * Guardian SMS rules when "Send SMS to guardians" is on.
 * Parent-app alerts are separate and always fire as each check or miss happens.
 *
 * Normal SMS Sending: every event SMS immediately (check-in, check-out, each miss
 * at its reminder). No pair wait, no once-per-day batch. Frequency is ignored.
 *
 * Completers (Normal off): one pair-summary SMS after Day-2 checkout.
 *
 * Missers, twice per day (Normal off):
 *   - check-in miss SMS at the check-in reminder
 *   - checkout SMS when they do check out (pair already broken)
 *   - checkout-miss SMS at the checkout reminder if they checked in but never out
 *   - never-checked-in: check-in miss SMS only
 *
 * Missers, once per day (Normal off):
 *   - one summary SMS at the checkout reminder, listing check-in and/or checkout miss times
 */

function decideMisserSms({
  nowMin,
  checkinThresholdMin,
  checkoutThresholdMin,
  hasCheckIn,
  hasCheckOut,
  messagesPerDay,
  notifySmsEnabled = true,
  notifySmsNormal = false,
}) {
  const smsOn = notifySmsEnabled !== false;
  const normal = !!notifySmsNormal;
  const twice = Number(messagesPerDay) !== 1;
  const checkinDue = nowMin >= checkinThresholdMin;
  const checkoutDue = nowMin >= checkoutThresholdMin;
  const missingIn = !hasCheckIn;
  const missingOut = !!hasCheckIn && !hasCheckOut;
  const stillMissing = missingIn || missingOut;

  return {
    twice,
    normal,
    checkinDue,
    checkoutDue,
    notifyAppAbsence: missingIn && checkinDue,
    notifyAppMissedCheckout: missingOut && checkoutDue,
    sendAbsenceSms: smsOn && (normal || twice) && missingIn && checkinDue,
    sendMissedCheckoutSms: smsOn && (normal || twice) && missingOut && checkoutDue,
    sendDailySummarySms: smsOn && !normal && !twice && stillMissing && checkoutDue,
  };
}

function decideImmediateCheckSms({
  checkType,
  notifySmsEnabled,
  notifySmsNormal,
}) {
  if (!notifySmsEnabled) return { action: 'skip', reason: 'sms_disabled' };
  if (!notifySmsNormal) return { action: 'skip', reason: 'not_normal' };
  if (checkType !== 'check_in' && checkType !== 'check_out') {
    return { action: 'skip', reason: 'not_check' };
  }
  return { action: 'send', reason: 'normal_check' };
}

function decideMisserCheckoutSms({
  checkType,
  pairBroken,
  notifySmsEnabled,
  messagesPerDay,
  notifySmsNormal = false,
}) {
  if (notifySmsNormal) return { action: 'skip', reason: 'sms_normal' };
  if (checkType !== 'check_out') return { action: 'skip', reason: 'not_checkout' };
  if (!pairBroken) return { action: 'skip', reason: 'not_misser' };
  if (!notifySmsEnabled) return { action: 'skip', reason: 'sms_disabled' };
  if (Number(messagesPerDay) === 1) return { action: 'skip', reason: 'once_per_day' };
  return { action: 'send', reason: 'misser_checkout' };
}

function decideCompleterSms({
  checkType,
  pairSlot,
  pairBroken,
  day1Complete,
  day2Complete,
  notifySmsEnabled,
  summaryAlreadySent,
  notifySmsNormal = false,
}) {
  if (notifySmsNormal) return { action: 'skip', reason: 'sms_normal' };
  if (pairBroken) return { action: 'skip', reason: 'pair_broken' };
  if (checkType !== 'check_out' || Number(pairSlot) !== 1) {
    return { action: 'skip', reason: 'completer_silence' };
  }
  if (!day1Complete || !day2Complete) {
    return { action: 'skip', reason: 'pair_incomplete' };
  }
  if (!notifySmsEnabled) return { action: 'skip', reason: 'sms_disabled' };
  if (summaryAlreadySent) return { action: 'skip', reason: 'summary_already_sent' };
  return { action: 'send', reason: 'pair_summary' };
}

module.exports = {
  decideMisserSms,
  decideImmediateCheckSms,
  decideMisserCheckoutSms,
  decideCompleterSms,
};
