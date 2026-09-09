const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  renderTemplate,
  pickTemplate,
  clipSms,
  parseTemplates,
  sanitizeTemplates,
  buildTokenVars,
  SMS_MAX,
} = require('./messageTemplates');

describe('message templates', () => {
  it('replaces known tokens and leaves unknown ones', () => {
    const text = renderTemplate(
      'Hello, [guardian-name], [student-name] at [checkin] [unknown] [school-name].',
      {
        'guardian-name': 'Jean',
        'student-name': 'Amina',
        checkin: '7:45 AM',
        'school-name': 'Test School',
      }
    );
    assert.equal(text, 'Hello, Jean, Amina at 7:45 AM [unknown] Test School.');
  });

  it('treats [checkou] as [checkout]', () => {
    const text = renderTemplate('out [checkou] / [checkout]', {
      checkout: '3:30 PM',
    });
    assert.equal(text, 'out 3:30 PM / 3:30 PM');
  });

  it('is case-insensitive', () => {
    const text = renderTemplate('Hi [Guardian-Name]', { 'guardian-name': 'Jean' });
    assert.equal(text, 'Hi Jean');
  });

  it('falls twice-day misser templates back to absence / missed checkout', () => {
    const t = { absence: 'ABSENT', missed_checkout: 'NO OUT', twice_day_misser_in: '', twice_day_misser_out: '' };
    assert.equal(pickTemplate(t, 'twice_day_misser_in'), 'ABSENT');
    assert.equal(pickTemplate(t, 'twice_day_misser_out'), 'NO OUT');
    assert.equal(pickTemplate(t, 'absence'), 'ABSENT');
  });

  it('clips SMS without wrapping', () => {
    const long = 'x'.repeat(SMS_MAX + 20);
    const clipped = clipSms(long);
    assert.equal(clipped.length, SMS_MAX);
    assert.equal(clipped.startsWith('Greetings'), false);
  });

  it('parses JSON strings and objects', () => {
    const fromObj = parseTemplates({ check_in: 'A', extra: 'ignore' });
    assert.equal(fromObj.check_in, 'A');
    assert.equal(fromObj.extra, undefined);
    const fromStr = parseTemplates(JSON.stringify({ pair_summary: 'P' }));
    assert.equal(fromStr.pair_summary, 'P');
    assert.equal(parseTemplates('not-json').check_in, '');
  });

  it('caps template length on sanitize', () => {
    const huge = 'a'.repeat(3000);
    const out = sanitizeTemplates({ check_in: huge });
    assert.equal(out.check_in.length, 2000);
  });

  it('includes smsMax and preview sample in template meta', () => {
    const { templateMeta } = require('./messageTemplates');
    const meta = templateMeta();
    assert.equal(meta.smsMax, SMS_MAX);
    assert.equal(meta.previewSample['guardian-name'], 'Jean');
    assert.equal(meta.fields.length, 9);
  });

  it('fills pair day-2 into date/checkin/checkout', () => {
    const vars = buildTokenVars({
      guardianName: 'Jean',
      studentName: 'Amina',
      schoolName: 'School',
      pair: {
        day1Date: '2026-09-01',
        day2Date: '2026-09-02',
        in1Iso: '2026-09-01T06:45:00.000Z',
        out1Iso: '2026-09-01T14:30:00.000Z',
        in2Iso: '2026-09-02T06:50:00.000Z',
        out2Iso: '2026-09-02T14:28:00.000Z',
      },
    });
    assert.equal(vars.date, vars['date-2']);
    assert.equal(vars.checkin, vars['checkin-2']);
    assert.equal(vars.checkout, vars['checkout-2']);
    assert.equal(vars['guardian-name'], 'Jean');
  });

  it('sets minute-late to 0 when there is no check-in', () => {
    const vars = buildTokenVars({
      date: '2026-09-01',
      schoolStartTime: '07:30',
    });
    assert.equal(vars['minute-late'], '0');
    assert.equal(vars.checkin, '--:--');
  });

  it('leaves empty twice-day keys falling back, and empty check_in as blank', () => {
    const t = parseTemplates({});
    assert.equal(pickTemplate(t, 'check_in'), '');
    assert.equal(pickTemplate(t, 'twice_day_misser_in'), '');
    assert.equal(pickTemplate({ absence: 'A' }, 'twice_day_misser_in'), 'A');
  });
});
