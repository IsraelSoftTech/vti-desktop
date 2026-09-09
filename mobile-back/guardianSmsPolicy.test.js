const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  decideMisserSms,
  decideMisserCheckoutSms,
  decideCompleterSms,
  decideImmediateCheckSms,
} = require('./guardianSmsPolicy');

const CHECKIN_DUE = 8 * 60 + 30;
const CHECKOUT_DUE = 16 * 60 + 30;

function misser(overrides) {
  return decideMisserSms({
    nowMin: CHECKIN_DUE,
    checkinThresholdMin: CHECKIN_DUE,
    checkoutThresholdMin: CHECKOUT_DUE,
    hasCheckIn: false,
    hasCheckOut: false,
    messagesPerDay: 2,
    notifySmsEnabled: true,
    ...overrides,
  });
}

describe('misser SMS — twice per day', () => {
  it('sends check-in miss SMS at the check-in reminder if they never checked in', () => {
    const d = misser({ nowMin: CHECKIN_DUE, messagesPerDay: 2, hasCheckIn: false });
    assert.equal(d.sendAbsenceSms, true);
    assert.equal(d.sendMissedCheckoutSms, false);
    assert.equal(d.sendDailySummarySms, false);
    assert.equal(d.notifyAppAbsence, true);
  });

  it('does not send a checkout-miss SMS when they never checked in', () => {
    const d = misser({ nowMin: CHECKOUT_DUE, messagesPerDay: 2, hasCheckIn: false });
    assert.equal(d.sendAbsenceSms, true);
    assert.equal(d.sendMissedCheckoutSms, false);
    assert.equal(d.notifyAppMissedCheckout, false);
  });

  it('sends checkout-miss SMS at the checkout reminder if they checked in but not out', () => {
    const d = misser({
      nowMin: CHECKOUT_DUE,
      messagesPerDay: 2,
      hasCheckIn: true,
      hasCheckOut: false,
    });
    assert.equal(d.sendAbsenceSms, false);
    assert.equal(d.sendMissedCheckoutSms, true);
    assert.equal(d.notifyAppMissedCheckout, true);
  });

  it('sends no misser SMS if the day is complete', () => {
    const d = misser({
      nowMin: CHECKOUT_DUE,
      messagesPerDay: 2,
      hasCheckIn: true,
      hasCheckOut: true,
    });
    assert.equal(d.sendAbsenceSms, false);
    assert.equal(d.sendMissedCheckoutSms, false);
    assert.equal(d.sendDailySummarySms, false);
  });
});

describe('misser SMS — once per day', () => {
  it('does not send SMS at the check-in reminder; app miss still fires', () => {
    const d = misser({ nowMin: CHECKIN_DUE, messagesPerDay: 1, hasCheckIn: false });
    assert.equal(d.sendAbsenceSms, false);
    assert.equal(d.sendDailySummarySms, false);
    assert.equal(d.notifyAppAbsence, true);
  });

  it('sends one summary at the checkout reminder if they never checked in', () => {
    const d = misser({ nowMin: CHECKOUT_DUE, messagesPerDay: 1, hasCheckIn: false });
    assert.equal(d.sendDailySummarySms, true);
    assert.equal(d.sendAbsenceSms, false);
    assert.equal(d.sendMissedCheckoutSms, false);
  });

  it('sends one summary at the checkout reminder if they missed only checkout', () => {
    const d = misser({
      nowMin: CHECKOUT_DUE,
      messagesPerDay: 1,
      hasCheckIn: true,
      hasCheckOut: false,
    });
    assert.equal(d.sendDailySummarySms, true);
    assert.equal(d.sendMissedCheckoutSms, false);
    assert.equal(d.notifyAppMissedCheckout, true);
  });

  it('sends no summary if they completed both checks before the checkout reminder', () => {
    const d = misser({
      nowMin: CHECKOUT_DUE,
      messagesPerDay: 1,
      hasCheckIn: true,
      hasCheckOut: true,
    });
    assert.equal(d.sendDailySummarySms, false);
  });
});

describe('app miss alerts ignore SMS frequency', () => {
  it('notifies missed check-in at the check-in reminder even when SMS is once per day', () => {
    const d = misser({
      nowMin: CHECKIN_DUE,
      messagesPerDay: 1,
      notifySmsEnabled: false,
      hasCheckIn: false,
    });
    assert.equal(d.notifyAppAbsence, true);
    assert.equal(d.sendAbsenceSms, false);
    assert.equal(d.sendDailySummarySms, false);
  });

  it('notifies missed checkout at the checkout reminder even when SMS is off', () => {
    const d = misser({
      nowMin: CHECKOUT_DUE,
      messagesPerDay: 1,
      notifySmsEnabled: false,
      hasCheckIn: true,
      hasCheckOut: false,
    });
    assert.equal(d.notifyAppMissedCheckout, true);
    assert.equal(d.sendMissedCheckoutSms, false);
    assert.equal(d.sendDailySummarySms, false);
  });
});

describe('misser checkout SMS (twice per day, on scan)', () => {
  it('sends checkout SMS when a misser checks out and twice-per-day is on', () => {
    const d = decideMisserCheckoutSms({
      checkType: 'check_out',
      pairBroken: true,
      notifySmsEnabled: true,
      messagesPerDay: 2,
    });
    assert.equal(d.action, 'send');
  });

  it('does not send checkout SMS for completers (pair not broken)', () => {
    const d = decideMisserCheckoutSms({
      checkType: 'check_out',
      pairBroken: false,
      notifySmsEnabled: true,
      messagesPerDay: 2,
    });
    assert.equal(d.reason, 'not_misser');
  });

  it('does not send checkout SMS when once-per-day is set', () => {
    const d = decideMisserCheckoutSms({
      checkType: 'check_out',
      pairBroken: true,
      notifySmsEnabled: true,
      messagesPerDay: 1,
    });
    assert.equal(d.reason, 'once_per_day');
  });
});

describe('completer (non-misser) pair-summary SMS', () => {
  const complete = {
    pairBroken: false,
    day1Complete: true,
    day2Complete: true,
    notifySmsEnabled: true,
    summaryAlreadySent: false,
  };

  it('stays silent on check-in and on Day-1 checkout', () => {
    assert.equal(
      decideCompleterSms({ ...complete, checkType: 'check_in', pairSlot: 0 }).reason,
      'completer_silence'
    );
    assert.equal(
      decideCompleterSms({ ...complete, checkType: 'check_out', pairSlot: 0 }).reason,
      'completer_silence'
    );
  });

  it('sends one pair summary on Day-2 checkout for both once and twice per day', () => {
    const d = decideCompleterSms({ ...complete, checkType: 'check_out', pairSlot: 1 });
    assert.equal(d.action, 'send');
    assert.equal(d.reason, 'pair_summary');
  });

  it('does not send pair summary if the pair was broken by a miss', () => {
    const d = decideCompleterSms({
      ...complete,
      pairBroken: true,
      checkType: 'check_out',
      pairSlot: 1,
    });
    assert.equal(d.reason, 'pair_broken');
  });

  it('skips SMS when Send SMS is off', () => {
    const d = decideCompleterSms({
      ...complete,
      notifySmsEnabled: false,
      checkType: 'check_out',
      pairSlot: 1,
    });
    assert.equal(d.action, 'skip');
    assert.equal(d.reason, 'sms_disabled');
  });

  it('does not send pair summary when Normal SMS Sending is on', () => {
    const d = decideCompleterSms({
      ...complete,
      notifySmsNormal: true,
      checkType: 'check_out',
      pairSlot: 1,
    });
    assert.equal(d.reason, 'sms_normal');
  });
});

describe('Normal SMS Sending', () => {
  it('sends check-in and check-out SMS immediately', () => {
    assert.equal(
      decideImmediateCheckSms({
        checkType: 'check_in',
        notifySmsEnabled: true,
        notifySmsNormal: true,
      }).action,
      'send'
    );
    assert.equal(
      decideImmediateCheckSms({
        checkType: 'check_out',
        notifySmsEnabled: true,
        notifySmsNormal: true,
      }).action,
      'send'
    );
  });

  it('does not send immediate check SMS when Normal is off', () => {
    assert.equal(
      decideImmediateCheckSms({
        checkType: 'check_in',
        notifySmsEnabled: true,
        notifySmsNormal: false,
      }).reason,
      'not_normal'
    );
  });

  it('sends each miss at its own reminder even if once-per-day is set', () => {
    const morning = misser({
      nowMin: CHECKIN_DUE,
      messagesPerDay: 1,
      notifySmsNormal: true,
      hasCheckIn: false,
    });
    assert.equal(morning.sendAbsenceSms, true);
    assert.equal(morning.sendDailySummarySms, false);

    const evening = misser({
      nowMin: CHECKOUT_DUE,
      messagesPerDay: 1,
      notifySmsNormal: true,
      hasCheckIn: true,
      hasCheckOut: false,
    });
    assert.equal(evening.sendMissedCheckoutSms, true);
    assert.equal(evening.sendDailySummarySms, false);
  });

  it('does not also send misser-checkout SMS (immediate check-out already covers it)', () => {
    const d = decideMisserCheckoutSms({
      checkType: 'check_out',
      pairBroken: true,
      notifySmsEnabled: true,
      messagesPerDay: 2,
      notifySmsNormal: true,
    });
    assert.equal(d.reason, 'sms_normal');
  });
});
