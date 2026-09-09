const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  uniquePositiveIds,
  parseAnnouncementRequest,
  validateAnnouncementRequest,
  collectAppTargets,
  MESSAGE_MAX,
} = require('./announcements');

describe('announcement request', () => {
  it('parses ids, channels, and trims the message', () => {
    const parsed = parseAnnouncementRequest({
      message: '  Hello parents  ',
      sendAllClasses: true,
      classIds: [1, '2', 0, -3, 1],
      studentIds: ['9', 9, null],
      channels: { sms: true, app: false },
    });
    assert.equal(parsed.message, 'Hello parents');
    assert.equal(parsed.sendAllClasses, true);
    assert.deepEqual(parsed.classIds, [1, 2]);
    assert.deepEqual(parsed.studentIds, [9]);
    assert.deepEqual(parsed.channels, { sms: true, app: false });
  });

  it('rejects empty message, no channel, and empty audience', () => {
    assert.equal(
      validateAnnouncementRequest(
        parseAnnouncementRequest({ message: '', channels: { sms: true }, sendAllClasses: true })
      ),
      'Message is required.'
    );
    assert.equal(
      validateAnnouncementRequest(
        parseAnnouncementRequest({ message: 'Hi', sendAllClasses: true })
      ),
      'Choose SMS, parent notification, or both.'
    );
    assert.equal(
      validateAnnouncementRequest(
        parseAnnouncementRequest({ message: 'Hi', channels: { sms: true } })
      ),
      'Select classes, students, or All classes.'
    );
    const huge = 'x'.repeat(MESSAGE_MAX + 1);
    assert.match(
      validateAnnouncementRequest(
        parseAnnouncementRequest({ message: huge, channels: { app: true }, sendAllClasses: true })
      ),
      /1000/
    );
  });

  it('accepts class union or extra students', () => {
    assert.equal(
      validateAnnouncementRequest(
        parseAnnouncementRequest({
          message: 'Sports day is Friday.',
          classIds: [4],
          channels: { sms: true, app: true },
        })
      ),
      null
    );
    assert.equal(
      validateAnnouncementRequest(
        parseAnnouncementRequest({
          message: 'Please call the office.',
          studentIds: [12],
          channels: { app: true },
        })
      ),
      null
    );
  });

  it('uniquePositiveIds drops junk', () => {
    assert.deepEqual(uniquePositiveIds(['1', 2, 2, 0, NaN, undefined]), [1, 2]);
  });

  it('collects unique parents and skips unlinked students', () => {
    const students = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = collectAppTargets(students, [
      { student_id: 1, parent_user_id: 10 },
      { student_id: 1, parent_user_id: 11 },
      { student_id: 2, parent_user_id: 10 },
      { student_id: 3, parent_user_id: null },
    ]);
    assert.deepEqual(result.parentIds.sort((a, b) => a - b), [10, 11]);
    assert.deepEqual(result.skipped, [{ studentId: 3, reason: 'no_linked_parents' }]);
  });
});
