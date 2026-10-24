#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../src/features/cupping/components/DefectsSection.js'), 'utf8');
const dialog = source.slice(source.indexOf('export function DefectTypeDialog('), source.indexOf('function DesignCDefectItem('));

assert.match(dialog, /<View style=\{\[styles\.dialogCard, \{ borderRadius: 18 \* scale \}\]\}>[\s\S]*?<View style=\{styles\.dialogHeader\}>/,
  'the bounded card keeps its header outside the scrolling choices');
assert.match(source, /dialogCard: \{[\s\S]*?maxHeight: "100%",/,
  'the modal card cannot grow past the available backdrop height');
assert.match(dialog, /<ScrollView\s+style=\{styles\.dialogOptionScroll\}\s+contentContainerStyle=\{styles\.dialogOptionList\}/,
  'the choices scroll within the card');
assert.match(source, /dialogOptionScroll: \{\s*flexShrink: 1,\s*minHeight: 0,/,
  'the choices can yield space to the fixed header and Done button');
assert.match(source, /dialogHeader: \{[\s\S]*?flexShrink: 0,/,
  'the title and Close do not shrink when choices are long');
assert.match(source, /dialogAddButton: \{[\s\S]*?flexShrink: 0,/,
  'Done does not shrink when choices are long');
assert.ok(dialog.indexOf('</ScrollView>') < dialog.indexOf('accessibilityLabel="Done choosing defect types"'),
  'Done stays outside the scrolling choices');
assert.match(dialog, /<CloseButton[\s\S]*?onPress=\{onClose\}[\s\S]*?accessibilityLabel="Close defect selector"/,
  'the explicit close control remains');
assert.match(dialog, /onPress=\{\(\) => onSelect\(option\.key\)\}[\s\S]*?accessibilityRole="checkbox"\s+accessibilityState=\{\{ checked: isSelected \}\}/,
  'choice selection and accessible checked state remain');
assert.match(dialog, /style=\{styles\.dialogAddButton\}\s+onPress=\{onClose\}/,
  'Done only closes the dialog');
for (const key of ['moldy', 'phenolic', 'potato', 'otherBean', 'underdeveloped', 'baked', 'unevenRoast', 'overdeveloped']) {
  assert.match(source, new RegExp(`key: "${key}"`), `${key} option remains available`);
}

console.log('Shared defect dialog reachability and choice wiring checks passed.');
