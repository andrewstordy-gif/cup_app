#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { selectAllQualifyingCups, sameCupSelection } = require('../src/features/forms/legacy/legacyCupSelection');
const { PROFILE, resolveForm, scoreResponse } = require('../src/features/forms/contract');

const identity = resolveForm(PROFILE, 2).identity;
const quality = Object.fromEntries(['fragrance_aroma', 'flavor', 'aftertaste', 'acidity', 'body', 'balance', 'overall']
  .map(key => [key, 28]));

for (const n of [1, 5, 8]) {
  const all = Array.from({ length: n }, (_, index) => index + 1);
  assert.deepEqual(selectAllQualifyingCups(n), all, `${n} cups: Sweetness selects all`);
  assert.deepEqual(selectAllQualifyingCups(n, []), all, `${n} cups: no defects means all cups eligible for Clean Cup`);
  assert.equal(sameCupSelection(null, all), false, 'unassessed is not equivalent to all selected');
  assert.equal(sameCupSelection(all, all), true);
  const defective = [1, n];
  const clean = selectAllQualifyingCups(n, defective);
  assert.deepEqual(clean, all.filter(cup => !defective.includes(cup)), `${n} cups: scored defects remain excluded`);
  assert.ok(clean.every(cup => !defective.includes(cup)), 'no Clean Cup/scored-defect overlap');

  const response = {
    quality_ratings: quality, consistent_cups: all, sweet_cups: selectAllQualifyingCups(n),
    clean_cups: clean, scored_defect: { kind: 'taint', affected_cups: [...new Set(defective)] },
    bean_defect_type_masks: { otherBean: [...new Set(defective)] },
  };
  const result = scoreResponse({ profile: PROFILE, f: 2, identity, cup_count: n, response },
    { profile: PROFILE, f: 2, identity });
  assert.equal(result.ok, true, `${n} cups: bulk selection remains scorable: ${result.errors}`);
  assert.equal(result.components.sweetness.numerator / result.components.sweetness.denominator, 10);
  assert.equal(result.components.clean_cup.numerator / result.components.clean_cup.denominator, 10 * clean.length / n);
  assert.deepEqual(selectAllQualifyingCups(n, all), [], `${n} cups: all defective yields assessed zero`);
  assert.equal(sameCupSelection([], []), true, 'assessed zero is a selected state');
}

for (const bad of [0, 9, 1.5, NaN]) assert.deepEqual(selectAllQualifyingCups(bad), []);
const screen = readFileSync(join(__dirname, '../src/features/forms/legacy/LegacyCuppingScreen.js'), 'utf8');
assert.match(screen, /const eligibleCleanCups = selectAllQualifyingCups\(n, \[\.\.\.beanTypeCups, \.\.\.scoredBeanCups\]\)/,
  'Clean Cup excludes bean defect type selections and scored affected cups');
assert.match(screen, /<CupSet label="Clean Cup"[^>]*selectAllCups=\{eligibleCleanCups\}/s);
assert.match(screen, /<CupSet label="Sweetness"[^>]*selectAllCups=\{allSweetCups\}/s);
assert.doesNotMatch(screen, /<CupSet label="Uniformity"[^>]*selectAllCups=/s, 'Uniformity has no bulk action');
assert.match(screen, /<Pressable onPress=\{\(\) => onChange\(selectAllCups\)\} disabled=\{readOnly\}/,
  'bulk action respects read-only state');
assert.match(screen, /selectAllAction: \{ minHeight: 44,/, 'bulk action has a 44-point touch target');
assert.match(screen, /style=\{\[styles\.selectAllAction, \{ paddingHorizontal: spacing\.md \* scale, borderRadius: 8 \* scale \}, readOnly && styles\.choiceDisabled\]\}/,
  'bulk action scales layout padding and radius without scaling typography or the touch-target minimum');
assert.match(screen, /accessibilityLabel=\{`\$\{label\}: \$\{label === 'Clean Cup' \? 'select all eligible cups; cups with bean defects are excluded'/,
  'Clean Cup accessibility name explains the exclusion');
assert.match(screen, /accessibilityState=\{\{ disabled: readOnly, selected: sameCupSelection\(value, selectAllCups\) \}\}/,
  'bulk action exposes read-only and selected states');
console.log('Legacy select-all checks passed.');
