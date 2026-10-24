// Render actual preview, shared button/icons and entry with native hosts mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('@babel/core');
const root = path.resolve(__dirname, '..');
let states = [], cursor = 0, appLoads = 0, registered;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(value) { const index = cursor++; if (!(index in states)) states[index] = value;
    return [states[index], next => { states[index] = next; }]; },
};
const native = Object.fromEntries(['Text', 'View', 'Pressable', 'SafeAreaView', 'ScrollView', 'ActivityIndicator'].map(name => [name, name]));
native.StyleSheet = { create: value => value };
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = request => {
    if (request === 'react') return React;
    if (request === 'react-native') return native;
    if (request === 'expo') return { registerRootComponent: component => { registered = component; } };
    if (request === '@expo/vector-icons/Ionicons') return 'Ionicons';
    if (request.endsWith('TypographyAuditText')) return { TypographyAuditText: 'Text' };
    if (request === './App') { appLoads++; return { default: 'ActualApp' }; }
    assert(request.startsWith('.'), `unexpected dependency ${request}`);
    return load(path.relative(root, path.resolve(path.dirname(file), request + '.js')));
  };
  cache.set(file, mod); mod._compile(code, file); return mod.exports;
}
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
function all(node, predicate, output = []) {
  if (Array.isArray(node)) node.forEach(child => all(child, predicate, output));
  else if (node && typeof node === 'object') { if (predicate(node)) output.push(node); all(node.props?.children, predicate, output); }
  return output;
}
const preview = load('r1-118-upload-preview.js');
const { colors } = load('src/theme/colors.js');
const { typography } = load('src/theme/typography.js');
let opened = 0;
const render = () => { cursor = 0; return expand(preview.UploadUiPreview({ onOpenTestApp: () => opened++ })); };
for (let index = 0; index < 3; index++) {
  let tree = render();
  const button = all(tree, node => node.props?.testID === `upload-fixture-${index}`)[0];
  assert(button); button.props.onPress(); tree = render();
  const statuses = all(tree, node => node.props?.accessibilityLabel === `Test data upload status: ${preview.UPLOAD_FIXTURES[index].label}`);
  assert.equal(statuses.length, 2, 'Details and Sessions card show same fixture');
  assert(statuses.every(node => node.props.accessible && node.props.accessibilityRole === 'text'));
  assert.equal(all(tree, node => node.type === 'Text' && node.props.children.includes('COMPLETE')).length, 2, 'tasting badge independent of upload fixture');
  assert.equal(all(tree, node => node.type === 'Ionicons' && node.props.name === 'cloud-done-outline').length, index === 2 ? 2 : 0);
  assert.equal(all(tree, node => node.type === 'Ionicons' && node.props.name === 'time-outline').length, index === 1 ? 2 : 0);
  const inert = all(tree, node => node.type === 'Pressable' && node.props.disabled);
  assert.equal(inert.length, 2);
  for (const control of inert) { assert.equal(control.props.onPress, undefined); assert.match(control.props.accessibilityLabel, /disabled visual preview only/); }
  assert.equal(inert[0].props.style({ pressed: false }).at(-1).backgroundColor, colors.muted);
  assert.equal(inert[1].props.style({ pressed: false }).at(-1).backgroundColor, colors.action, 'disabled scan preserves blue visual treatment');
  const selectors = all(tree, node => node.props?.testID?.startsWith('upload-fixture-'));
  assert.equal(selectors.filter(node => node.props.accessibilityState.selected).length, 1);
  for (const selector of selectors) assert(selector.props.style({ pressed: false })[0].minHeight >= 44);
  assert.equal(opened, 0, 'fixture selection never opens actual App');
}
const tree = render();
all(tree, node => node.props?.accessibilityLabel === 'Open unchanged test app, leaving visual preview')[0].props.onPress();
assert.equal(opened, 1);
for (const text of all(tree, node => node.type === 'Text')) {
  const styles = [text.props.style].flat(Infinity).filter(Boolean);
  const font = styles.find(style => style.fontSize);
  assert(font && Object.values(typography).some(token => token.fontSize === font.fontSize && token.fontWeight === font.fontWeight), 'all text uses standard unscaled token typography');
}
const { AppIcon } = load('src/components/ui/AppIcon.js');
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
for (const name of ['upload', 'cloud-clock', 'cloud-check']) {
  const icon = expand(AppIcon({ name, role: 'icon_status', color: colors.inkSoft }));
  for (const glyph of all(icon, node => node.type === 'Ionicons')) { assert(Object.hasOwn(glyphs, glyph.props.name)); assert.equal(glyph.props.color, colors.inkSoft); assert.equal(glyph.props.accessible, false); }
}
const baselineIcon = require('node:child_process').execFileSync('git', ['show', 'c701234:src/components/ui/AppIcon.js'], { cwd: root, encoding: 'utf8' });
const candidateIcon = fs.readFileSync(path.join(root, 'src/components/ui/AppIcon.js'), 'utf8');
assert(candidateIcon.endsWith(baselineIcon.slice(baselineIcon.indexOf('  if (name === "search")'))), 'all existing named-icon paths unchanged');
for (const file of ['r1-118-upload-preview.js', 'r1-062-phone-verification-entry.js']) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!/useEffect|AsyncStorage|sessionRepository|fetch\s*\(|axios|NfcManager|sqlite|AppNavigator/.test(text));
}
states=[];cursor=0;const entry=load('r1-062-phone-verification-entry.js');assert.equal(registered,entry.TestEntry);assert.equal(appLoads,0);
let mounted=entry.TestEntry();assert.equal(mounted.type,load('r1-122-upload-status-preview.js').UploadStatusPreview);assert.equal(appLoads,0,'new isolated preview does not import App');
mounted.props.onOpenTestApp();cursor=0;mounted=entry.TestEntry();assert.equal(mounted.type,'ActualApp');assert.equal(appLoads,1);
states=[];cursor=0;assert.equal(entry.TestEntry().type,load('r1-122-upload-status-preview.js').UploadStatusPreview,'reload returns to isolated fixture');
console.log('PASS archived R1-118 fixtures/icons/accessibility; R1-122 isolated entry and lazy normal App escape.');
