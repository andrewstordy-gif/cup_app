#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { cupSelectorRows } = require('../src/features/cupping/components/assessmentCupLayout');

const read = path => readFileSync(join(__dirname, '..', path), 'utf8');
const shared = read('src/features/cupping/components/AssessmentCupSelector.js');
const cva = read('src/features/cupping/components/DefectsSection.js');
const legacy = read('src/features/forms/legacy/LegacyCuppingScreen.js');

assert.match(cva, /import \{ AssessmentCupSelector \} from "\.\/AssessmentCupSelector";/);
assert.equal((cva.match(/<AssessmentCupSelector/g) || []).length, 2, 'both CVA cup-wise rows use the shared selector');
assert.match(legacy, /import \{ AssessmentCupSelector \} from '\.\.\/\.\.\/cupping\/components\/AssessmentCupSelector';/);
assert.match(legacy, /<AssessmentCupSelector label=\{label\} selectedSlots=\{selected\} maxCount=\{count\} onChange=\{onChange\} disabled=\{fixed \|\| readOnly\} scale=\{scale\}/);
for (const label of ['Uniformity', 'Sweetness', 'Clean Cup']) {
  assert.match(legacy, new RegExp(`<CupSet label="${label}"[\\s\\S]*?scale=\\{scale\\}`), `${label} uses the shared scaled cup row`);
}
assert.match(legacy, /<DesignCDefectTypeItem title="Bean defects"[\s\S]*?selectedSlots=\{beanTypeCups\} maxCount=\{n\}[\s\S]*?scale=\{scale\}/,
  'Legacy defective cups use the shared typed-cup selector at the same scale');
assert.match(legacy, /const disabledBeanCups = unavailableBeanCups\(response\.clean_cups\);/,
  'Legacy derives the per-cup Bean defects lockout from Clean Cup selections');
assert.match(legacy, /<DesignCDefectTypeItem title="Bean defects"[\s\S]*?disabledSlots=\{disabledBeanCups\} disabledReason="marked Clean Cup"/,
  'Legacy Bean defects passes an accessible per-cup lockout');
const roastItem = legacy.slice(legacy.indexOf('<DesignCDefectTypeItem title="Roast defects"'),
  legacy.indexOf('/>', legacy.indexOf('<DesignCDefectTypeItem title="Roast defects"')));
assert.doesNotMatch(roastItem, /disabledSlots=/, 'Roast defects remains selectable as an observation');
assert.match(cva, /disabledSlots=\{disabledSlots\}[\s\S]*?disabledReason=\{disabledReason\}/,
  'shared typed defect item forwards optional per-cup lockout');
assert.match(shared, /const visibleCupSize = 46 \* scale;/, 'visible cup retains the scaled CVA design');
assert.match(shared, /const touchTargetSize = Math\.max\(44, visibleCupSize\);/, 'physical cup hit box never shrinks below 44 points');
assert.match(shared, /width: touchTargetSize, height: touchTargetSize/, 'Pressable uses the accessible hit box');
assert.match(shared, /width: visibleCupSize, height: visibleCupSize/, 'visible circle remains centred inside the hit box');
assert.match(shared, /const columnGap = totalCups === 8 \? 0 : spacing\.xs \* scale/, 'eight-cup rows do not spend width on decorative gaps');
assert.match(shared, /cupSelectorRows\(totalCups, touchTargetSize, columnGap, availableWidth\)/,
  'shared selector uses the tested width-aware row layout');
assert.match(shared, /onLayout=\{event => setMeasuredWidth\(event\.nativeEvent\.layout\.width\)\}/,
  'selector uses its actual available width as a bound');
for (const scale of [0.58, 0.61, 0.8, 1, 1.05]) {
  const touchTargetSize = Math.max(44, 46 * scale);
  assert.ok(touchTargetSize >= 44, `44-point minimum at scale ${scale}`);
}
const miniScale = Math.min(Math.max(375 / 616, 0.58), 1.05);
const miniTarget = Math.max(44, 46 * miniScale);
const miniLegacyWidth = 375 - 2 * 24 * miniScale;
assert.deepEqual(cupSelectorRows(8, miniTarget, 0, miniLegacyWidth), [[1, 2, 3, 4], [5, 6, 7, 8]],
  'eight cups form balanced rows on a 375-point Legacy screen with actual side padding');
assert.deepEqual(cupSelectorRows(5, miniTarget, 6 * miniScale, miniLegacyWidth), [[1, 2, 3, 4, 5]],
  'five cups remain on one row on the same screen');
assert.deepEqual(cupSelectorRows(8, 46, 0, 616 - 2 * 24), [[1, 2, 3, 4, 5, 6, 7, 8]],
  'eight cups fit in one row when sufficient width is available');
assert.deepEqual(cupSelectorRows(7, 44, 6 * 0.58, 320 - 2 * 24 * 0.58), [[1, 2, 3, 4], [5, 6, 7]],
  'seven cups wrap as a balanced group on a narrower phone');
assert.match(shared, /width: 39 \* scale, height: 39 \* scale/, 'inner rim matches the CVA scaled circle');
assert.match(shared, /accessibilityRole="checkbox"/);
assert.match(shared, /accessibilityState=\{\{ checked: selected, disabled: cupDisabled \}\}/);
assert.match(shared, /accessibilityLabel=\{`\$\{label\} cup \$\{cup\}\$\{unavailable && disabledReason \? `, \$\{disabledReason\}` : ''\}`\}/);
assert.match(shared, /disabled=\{cupDisabled\}/, 'an unavailable cup cannot respond to presses');
assert.match(shared, /cupDisabled && styles\.cupDisabled/, 'unavailable cups use the existing muted cup appearance');
assert.match(shared, /onSlotPress\(cup, selected\)/, 'CVA slot-press callbacks keep their prior contract');
assert.match(shared, /onChange\?\.\(selected \? selectedCups\.filter/, 'Legacy changes remain selected-cup arrays');
assert.doesNotMatch(legacy, /cupChoice:/, 'Legacy no longer renders its larger numbered cup buttons');

console.log('Shared CVA/Legacy physical-cup selector checks passed.');
