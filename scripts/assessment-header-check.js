#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/components/AssessmentHeader.js');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
});
const mockReact = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const mocks = {
  react: mockReact,
  'react-native': { StyleSheet: { create: styles => styles }, View: 'View' },
  '../../../components/ui/Header': { Header: 'Header' },
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../theme/colors': { colors: { ink: '#3F4852', inkSoft: '#667078', surface: '#FFFFFF' } },
  '../../../theme/spacing': { spacing: { xs: 6 } },
  '../../../theme/typography': { typography: { text_screen_title: { fontSize: 22 } } },
};
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  return Object.hasOwn(mocks, request) ? mocks[request] : originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(code, filename); } finally { Module._load = originalLoad; }

const { AssessmentHeader, assessmentSampleNumber, measuredTemperatureLabel } = mod.exports;
assert.equal(assessmentSampleNumber(3, 0), 3);
assert.equal(assessmentSampleNumber(null, 2), 3);
assert.equal(assessmentSampleNumber(null, null), 1);
for (const value of [21, '21', '21 C', '21°C', '20.7 °C']) {
  assert.equal(measuredTemperatureLabel(value), '21 °C');
}
for (const value of [null, undefined, '', 'N/A', '-- °C', '21 bad', {}, Infinity]) {
  assert.equal(measuredTemperatureLabel(value), null, `unmeasured ${String(value)} must not appear as a reading`);
}
const back = () => {};
const measured = AssessmentHeader({ sampleNumber: 2, cupIndex: 0, temperature: '21 C', onBackPress: back, scale: 0.7 });
assert.equal(measured.type, 'Header');
assert.equal(measured.props.onBackPress, back);
assert.equal(measured.props.titleContent.props.children[0], 2);
assert.equal(measured.props.rightContent.props.accessibilityLabel, 'Measured temperature 21 °C');
const unavailable = AssessmentHeader({ sampleNumber: 1, cupIndex: 0, temperature: 'N/A', onBackPress: back });
assert.equal(unavailable.props.rightContent.props.accessibilityLabel, 'Temperature unavailable');
assert.equal(unavailable.props.rightContent.props.children[1].props.children[0], '— °C');

const cva = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
const legacy = readFileSync(path.join(root, 'src/features/forms/legacy/LegacyCuppingScreen.js'), 'utf8');
assert.match(cva, /<AssessmentHeader[\s\S]*?temperature=\{cupStatus\?\.temp\}/);
assert.match(legacy, /<AssessmentHeader[^>]*temperature=\{cupStatus\?\.temp\}/);
assert.doesNotMatch(cva, /debugTag="CuppingScreen"/);
assert.doesNotMatch(legacy, /headerUnavailable|temperatureText \?/);
console.log('Shared assessment header sample, measured/unavailable temperature, navigation and both-form wiring checks passed.');
