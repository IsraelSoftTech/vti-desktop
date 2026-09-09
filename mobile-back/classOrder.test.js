const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sortClasses, formRank, streamRank } = require('./classOrder');

describe('class order', () => {
  it('orders forms then streams', () => {
    const names = [
      'Form Five Grammar',
      'Form One Technical',
      'Form One Grammar',
      'Upper Sixth Science',
      'Lower Sixth Arts',
      'Nursery',
      'Form 2 Commercial',
    ];
    const sorted = sortClasses(names.map((name, id) => ({ id, name }))).map((c) => c.name);
    assert.deepEqual(sorted, [
      'Form One Grammar',
      'Form One Technical',
      'Form 2 Commercial',
      'Form Five Grammar',
      'Lower Sixth Arts',
      'Upper Sixth Science',
      'Nursery',
    ]);
  });

  it('ranks upper sixth before leftover names', () => {
    assert.equal(formRank('Upper 6 Science'), 70);
    assert.equal(formRank('Lower Sixth'), 60);
    assert.equal(formRank('Form 1 Technical'), 10);
    assert.equal(streamRank('Form One Grammar'), 1);
    assert.equal(streamRank('Unknown'), 9);
  });
});
