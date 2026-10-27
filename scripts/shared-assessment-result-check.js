#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/components/AssessmentResultSection.js');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
});
const mocks = {
  react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  'react-native': { Pressable: 'Pressable', StyleSheet: { create: styles => styles }, View: 'View' },
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../theme/colors': { colors: { quietBorder: '#ddd', ink: '#333', inkSoft: '#666', action: '#3478f6' } },
  '../../../theme/spacing': { spacing: { xs: 6, sm: 10, md: 16, lg: 24 } },
  '../../../theme/typography': { typography: { text_section_title: {}, text_secondary_body: {}, text_body: {} } },
};
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  return Object.hasOwn(mocks, request) ? mocks[request] : originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(code, filename); } finally { Module._load = originalLoad; }

const flatten = node => Array.isArray(node) ? node.flatMap(flatten) :
  !node || typeof node !== 'object' ? [] : [node, ...flatten(node.props?.children || [])];
const rows = [{ key: 'rating', label: 'Flavour', value: '8.00' }, { key: 'total', label: 'Total score', value: '80.00', total: true }];
const base = { formLabel: 'SCA CVA · Affective', provenance: 'SCA-104 Affective score', rows, scale: 0.7, onToggle: () => {} };
const collapsed = mod.exports.AssessmentResultSection({ ...base, expanded: false });
const collapsedNodes = flatten(collapsed);
assert.equal(collapsedNodes.filter(node => node.type === 'Pressable').length, 1);
assert.deepEqual(collapsedNodes.find(node => node.type === 'Pressable').props.accessibilityState, { expanded: false });
assert.ok(collapsedNodes.some(node => node.type === 'Text' && node.props.children[0] === 'Show score breakdown'));
assert.ok(!collapsedNodes.some(node => node.type === 'Text' && node.props.children[0] === '80.00'), 'the total row starts collapsed');

const expanded = mod.exports.AssessmentResultSection({ ...base, expanded: true, details: ['version 1.1.0'] });
const expandedNodes = flatten(expanded);
assert.deepEqual(expandedNodes.find(node => node.type === 'Pressable').props.accessibilityState, { expanded: true });
for (const expected of ['Result', 'SCA CVA · Affective', 'SCA-104 Affective score', 'version 1.1.0', 'Hide score breakdown', 'Flavour', '8.00', 'Total score', '80.00']) {
  assert.ok(expandedNodes.some(node => node.type === 'Text' && node.props.children[0] === expected), `${expected} is visible in the expanded shared result`);
}
console.log('Shared Result collapsed/expanded content and accessible toggle checks passed.');
