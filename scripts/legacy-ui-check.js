#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  ORDINARY_MARKS, LOWER_MARKS, visibleMarks, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText,
} = require('../src/features/forms/legacy/legacyQualityPresentation');

assert.equal(ORDINARY_MARKS.length, 17);
assert.deepEqual([ORDINARY_MARKS[0], ORDINARY_MARKS.at(-1)], [24, 40]);
assert.equal(LOWER_MARKS.length, 24);
assert.deepEqual([LOWER_MARKS[0], LOWER_MARKS.at(-1)], [0, 23]);
assert.equal(new Set([...ORDINARY_MARKS, ...LOWER_MARKS]).size, 41);
assert.deepEqual(visibleMarks(false), ORDINARY_MARKS, 'default selector shows only 6.00–10.00');
assert.deepEqual(visibleMarks(true), Array.from({ length: 41 }, (_, mark) => mark), 'revealed selector is one ascending 0.00–10.00 sequence');
assert.equal(visibleMarks(revealLowerForSelected(23))[23], 23, 'selected 5.75 remains in revealed grid on reopen');
assert.equal(visibleMarks(revealLowerForSelected(0))[0], 0, 'selected 0.00 remains in revealed grid on reopen');
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
const screen = readFileSync(join(__dirname, '../src/features/forms/legacy/LegacyCuppingScreen.js'), 'utf8');
assert.match(screen, /<View style=\{styles\.grid\}>\{visibleMarks\(showLowerScores\)\.map\(/, 'one grid renders the visible mark sequence');
assert.match(screen, /scoreChoiceWidth = Math\.max\(44, \(width - 4 \* spacing\.md - 3 \* spacing\.xs\) \/ 4\)/, 'selector choices derive four columns from available phone width and spacing tokens');
assert.match(screen, /rulerSelectedTick: \{[^}]*width: 5[^}]*borderRadius: 3[^}]*backgroundColor: colors\.action/, 'selected ruler tick is thicker, rounded and blue');
assert.match(screen, /QUALITY\.map\(\(\[key, label\]\) => <View key=\{key\}>/, 'all seven quality rows remain visible');
assert.doesNotMatch(screen, /<Text style=\{styles\.sectionTitle\}>Quality ratings<\/Text>/, 'no redundant quality heading');
assert.match(screen, /<CupSet label="Defective cups"/, 'drawer begins with numbered defective-cup controls');
assert.match(screen, /<NotesField label="Flavour Notes"[^>]*response\.notes/, 'flavour notes use the immutable notes field');
assert.match(screen, /<Text style=\{styles\.sectionTitle\}>Overall score<\/Text>/, 'overall score is consistently located near footer');
assert.match(readFileSync(join(__dirname, '../src/navigation/AppNavigator.js'), 'utf8'), /onScanPress=\{handleScanNextCupFromCupping\}/, 'Legacy scan footer uses existing navigator callback');
console.log('Legacy selector, always-visible rows, notes, drawer, overall score and scan wiring checks passed.');
