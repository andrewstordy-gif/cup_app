#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/components/AssessmentSampleIdentity.js');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
});
const mocks = {
  react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  'react-native': { StyleSheet: { create: styles => styles }, View: 'View' },
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../theme/colors': { colors: { surface: '#FFFFFF', quietBorder: '#D7DADD', inkSoft: '#667078' } },
  '../../../theme/spacing': { spacing: { sm: 10 } },
  '../../../theme/typography': { typography: { text_section_title: { fontSize: 20 }, text_secondary_body: { fontSize: 15 } } },
};
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  return Object.hasOwn(mocks, request) ? mocks[request] : originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(code, filename); } finally { Module._load = originalLoad; }
const onLayout = () => {};
const identity = mod.exports.AssessmentSampleIdentity({ name: 'Coffee A', process: 'Washed (Wet)', scale: 0.7, onLayout });
assert.equal(identity.type, 'View');
assert.equal(identity.props.onLayout, onLayout, 'CVA overlay can retain measured fixed-strip height');
assert.equal(identity.props.children[0].props.children[0], 'Coffee A');
assert.equal(identity.props.children[1].props.children[0], 'Washed (Wet)');
assert.equal(identity.props.style[1].paddingHorizontal, 26 * 0.7);

const cva = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
const legacy = readFileSync(path.join(root, 'src/features/forms/legacy/LegacyCuppingScreen.js'), 'utf8');
const nav = readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
assert.match(cva, /usesMockCuppingLayout && isOpenCuppingMode \? \(\s*<AssessmentSampleIdentity/,
  'CVA must retain its existing open-only disclosure gate');
assert.match(cva, /onLayout=\{\(event\) => setCoffeeMetaHeight\(event\.nativeEvent\.layout\.height\)\}/);
assert.match(cva, /isOpenCuppingMode \? coffeeMetaHeight : 0/, 'CVA Defects overlay accounts for the fixed identity strip');
assert.ok(cva.indexOf('<AssessmentSampleIdentity') < cva.indexOf('<KeyboardAvoidingView'),
  'CVA identity is outside the scoring scroll');
assert.match(legacy, /showOpenIdentity = normalizeCuppingModeKey\(cuppingMode\) === 'open'/);
assert.match(legacy, /showOpenIdentity \? <AssessmentSampleIdentity/);
assert.ok(legacy.indexOf('<AssessmentSampleIdentity name=') < legacy.indexOf('<KeyboardAvoidingView'),
  'Legacy identity is outside the scoring scroll');
assert.match(legacy, /<AssessmentFormIntro form=\{2\} cuppingMode=\{cuppingMode\} cupCount=\{n\} \/>/,
  'Legacy form/mode/physical cup count stay in scrolling content');
assert.match(nav, /<LegacyCuppingScreen[\s\S]*?cuppingMode=\{selectedCupContext\.cuppingMode\}/,
  'Legacy receives trusted routed mode for fail-closed identity display');
console.log('Shared fixed sample identity, CVA blind gate/overlay height and Legacy mode gate checks passed.');
