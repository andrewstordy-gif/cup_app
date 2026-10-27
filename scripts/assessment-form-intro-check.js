#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/components/AssessmentFormIntro.js');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
});
const mocks = {
  react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  'react-native': { StyleSheet: { create: styles => styles } },
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../theme/colors': { colors: { inkSoft: '#667078' } },
  '../../../theme/typography': { typography: { text_secondary_body: { fontSize: 15 } } },
  '../constants/sessionDetails': {
    getCuppingFormLabel: form => ({ 1: 'SCA CVA — Affective Assessment', 2: 'SCA Legacy (2004–2023)' })[form] || String(form),
    getCuppingModeLabel: mode => mode === 'open' ? 'Open Cupping' : 'Blind Cupping',
  },
};
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  return Object.hasOwn(mocks, request) ? mocks[request] : originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(code, filename); } finally { Module._load = originalLoad; }
const intro = mod.exports.AssessmentFormIntro;
assert.equal(intro({ form: 1, cuppingMode: 'open', cupCount: 1 }).props.children[0],
  'SCA CVA — Affective Assessment · Open Cupping · 1 cup');
assert.equal(intro({ form: 2, cuppingMode: 'open', cupCount: 5 }).props.children[0],
  'SCA Legacy (2004–2023) · Open Cupping · 5 cups');
assert.equal(intro({ form: 'Future form', cuppingMode: 'blind', cupCount: undefined }).props.children[0],
  'Future form · Blind Cupping', 'unknown physical cup count is omitted rather than guessed');

const cva = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
const legacy = readFileSync(path.join(root, 'src/features/forms/legacy/LegacyCuppingScreen.js'), 'utf8');
assert.match(cva, /<AssessmentFormIntro form=\{1\} cuppingMode=\{cuppingMode\} cupCount=\{defectsCupTotal\} \/>/);
assert.doesNotMatch(cva, /<AssessmentFormIntro[^>]*cupCount=\{cupTotal\}/,
  'the Session sample pager count is not the physical cup count');
assert.match(legacy, /<AssessmentFormIntro form=\{2\} cuppingMode=\{cuppingMode\} cupCount=\{n\} \/>/);
assert.doesNotMatch(legacy, /Tap a ruler to choose/, 'the Legacy score-entry instruction is removed');
assert.ok(cva.indexOf('<AssessmentFormIntro') < cva.indexOf('{renderCuppingForm()}'),
  'CVA intro is rendered by the form content inside its ScrollView');
assert.match(cva, /<ScrollView[\s\S]*?\{renderCuppingForm\(\)\}/,
  'CVA form content remains in the scrolling region');
assert.ok(legacy.indexOf('<ScrollView') < legacy.indexOf('<AssessmentFormIntro'), 'Legacy intro scrolls below fixed identity');
console.log('Shared scrolling form title/mode/physical-cup intro and removed Legacy instructions checks passed.');
