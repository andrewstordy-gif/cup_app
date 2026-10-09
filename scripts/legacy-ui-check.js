#!/usr/bin/env node
const assert = require('node:assert/strict');
const {
  ORDINARY_MARKS, LOWER_MARKS, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText,
} = require('../src/features/forms/legacy/legacyQualityPresentation');

assert.equal(ORDINARY_MARKS.length, 17);
assert.deepEqual([ORDINARY_MARKS[0], ORDINARY_MARKS.at(-1)], [24, 40]);
assert.equal(LOWER_MARKS.length, 24);
assert.deepEqual([LOWER_MARKS[0], LOWER_MARKS.at(-1)], [0, 23]);
assert.equal(new Set([...ORDINARY_MARKS, ...LOWER_MARKS]).size, 41);
for (const mark of [0, 23, 24, 39, 40]) assert.equal(scoreText(mark), (mark / 4).toFixed(2));
assert.equal(isExtendedMark(null), false);
assert.equal(isExtendedMark(0), true);
assert.equal(isExtendedMark(23), true);
assert.equal(isExtendedMark(24), false);
assert.equal(isExtendedMark(39), false);
assert.equal(isExtendedMark(40), true);
assert.equal(revealLowerForSelected(undefined), false, 'unset must not open as a selected low score');
assert.equal(revealLowerForSelected(0), true, 'selected low mark remains visible on reopen');
assert.equal(revealLowerForSelected(23), true);
assert.equal(revealLowerForSelected(24), false);
assert.equal(defectDeductionText({ numerator: 0, denominator: 1 }), '0.00');
assert.equal(defectDeductionText({ numerator: 10, denominator: 3 }), '−3.33');
console.log('Legacy quality selector boundaries, lower reveal and no-negative-zero checks passed.');
