#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('@babel/core');
const { cvaSummaryCells, recordCvaSummaryMeasurement, cvaSummaryLayout, CVA_SCORE_PATTERN } = require('../src/features/cupping/components/cvaScoreSummaryPresentation');
const root = path.resolve(__dirname, '..');
const makeScores = values => values.map((score, i) => ({ key: `field-${i}`, label: ['Fr', 'Ar', 'Fl', 'Af', 'Ac', 'Sw', 'Mf', 'Ov'][i], score, isFinal: i % 2 === 0 }));
const scores = makeScores([1, 9, 8, 7, null, '8.00', '', 2]);
scores.forEach(Object.freeze); Object.freeze(scores);
const original = JSON.stringify(scores);
const cells = cvaSummaryCells(scores, 88.75);
assert.deepEqual(cells.map(cell => cell.value), ['1.00', '9.00', '8.00', '7.00', '—', '8.00', '—', '2.00', '88.75']);
assert.deepEqual(cells.slice(0, 8).map(cell => cell.isFinal), scores.map(item => item.isFinal));
assert.equal(JSON.stringify(scores), original, 'formatting never mutates source ratings or flags');
assert.equal(cvaSummaryCells(makeScores([0, 10, 8.25, NaN, undefined, ' ', 'garbage', false]), null).filter(cell => cell.value === '—').length, 8, 'invalid or missing input never becomes a scored zero or quarter-point CVA rating');
for (const [input, text] of [[0, '0.00'], [-0, '-0.00'], [-8.5, '-8.50'], [100, '100.00'], [null, 'P'], [NaN, 'P']]) assert.equal(cvaSummaryCells(scores, input)[8].value, text);

// Corroborating native macOS13-bold/tabular metrics; not exact iOS evidence.
const glyphWidth = (value, factor = 1) => (value === 'P' ? 9 : value === '—' ? 11.71 : value.length === 6 ? 47.71 : value.length === 5 ? 39.06 : 30.40) * factor;
const measuredFor = (rows, factor = 1) => Object.fromEntries(rows.flatMap(cell => [
  [`${cell.key}:value`, { width: Math.ceil(glyphWidth(cell.value, factor)), height: 16 * factor }],
  [`${cell.key}:caption`, { width: Math.ceil((cell.key === 'total' ? 37 : 22) * factor), height: 16 * factor }],
]));
for (const width of [320, 375, 390]) {
  const scale = Math.max(width / 616, 0.58), available = width - 32 - 2 - 32 * scale;
  for (const total of [100, -8.5, 0, null]) {
    const rows = cvaSummaryCells(scores, total), measured = measuredFor(rows);
    const layout = cvaSummaryLayout(available, 1, scale, measured, rows);
    assert(layout.contentWidth <= available + 0.001, `eight+total fit ordinary${width}pt with corroborating glyph metrics`);
    assert.equal(layout.cellHeight, 48); assert.equal(layout.totalWidth, 56);
    for (let i = 0; i < 8; i++) {
      assert(layout.qualityWidth - 2 >= layout.valueBounds[i].height);
      assert(layout.cellHeight - 2 >= layout.valueBounds[i].width);
      assert(layout.qualityWidth - 2 >= measured[`${rows[i].key}:caption`].width);
    }
    const large = cvaSummaryLayout(available, 2, scale, measuredFor(rows, 2), rows);
    assert(large.contentWidth > available, 'genuinely oversized text uses horizontal fallback');
    assert.equal(large.valueBounds[0].height, 33, 'native height is already OS-scaled');
  }
}
let measurement = { key: 'current', bounds: {} };
measurement = recordCvaSummaryMeasurement(measurement, 'current', 'quality-0:value', 30.4, 16);
assert.deepEqual(measurement.bounds['quality-0:value'], { width: 31, height: 16 });
assert.strictEqual(recordCvaSummaryMeasurement(measurement, 'current', 'quality-0:value', 30.4, 16), measurement);
for (const bad of [null, NaN, 0, Infinity, 10000, {}]) {
  assert.strictEqual(recordCvaSummaryMeasurement(measurement, 'current', 'quality-0:value', bad, 16), measurement);
  assert.strictEqual(recordCvaSummaryMeasurement(measurement, 'current', 'quality-0:value', 30.4, bad), measurement);
}
assert.strictEqual(recordCvaSummaryMeasurement(measurement, 'old', 'quality-0:value', 10, 4), measurement);

// Execute actual parent/ScoreRow/new summary JSX, including queued functional
// updates, cleanup and released native synthetic events. No native device claim.
let hooks = [], cursor = 0, effects = [], queue = [], defer = false, fontScale = 1, reads = 0;
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial;
    return [hooks[i], next => { const apply = () => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; };
      if (defer && typeof next === 'function') queue.push(apply); else apply(); }]; },
  useEffect(effect, deps) { const i = cursor++, old = hooks[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) {
    old?.cleanup?.(); const state = { deps }; hooks[i] = state; effects.push(() => { state.cleanup = effect(); }); } },
};
const cache = new Map();
function compile(file, source) {
  const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = request => {
    if (request === 'react') return react;
    if (request === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
      useWindowDimensions: () => ({ width: 390, height: 844, fontScale }), StyleSheet: { create: styles => styles } };
    if (request.endsWith('TypographyAuditText')) return { TypographyAuditText: 'Text' };
    if (request.endsWith('AppIcon')) return { AppIcon: 'AppIcon' };
    if (request.endsWith('IconButton')) return { IconButton: 'IconButton' };
    if (request === '@expo/vector-icons/AntDesign') return 'AntDesign';
    if (request.endsWith('KeywordPillRow')) return { KeywordPillRow: 'KeywordPillRow' };
    if (request.endsWith('sessionDetails')) return { getProcessLabel: () => 'Washed (Wet)' };
    if (request.endsWith('DefectsSection')) return { BEAN_DEFECT_OPTIONS: [], ROAST_DEFECT_OPTIONS: [] };
    if (request.endsWith('sessionRepository')) return { CUPPING_SCORE_FIELDS: ['Fragrance', 'Aroma', 'Flavour', 'Aftertaste', 'Acidity', 'Sweetness', 'Mouthfeel', 'Overall'],
      getSampleFeedback: async () => { reads++; return {}; }, getSampleFlavourObservations: async () => { reads++; return []; }, getSampleDefects: async () => { reads++; return {}; } };
    if (request.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), request + '.js')));
    return require(request);
  };
  mod._compile(transformSync(source, { filename: file, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code, file);
  return mod.exports;
}
function load(relative) {
  const file = path.resolve(root, relative); if (cache.has(file)) return cache.get(file);
  const exports = compile(file, fs.readFileSync(file, 'utf8')); cache.set(file, exports); return exports;
}
const { ScoreRow, normalizeTotalScore } = load('src/features/style-guide/components/ScoreRow.js');
const { CoffeeSampleCard } = load('src/features/cupping/components/CoffeeSampleCard.js');
const rowFile = path.resolve(root, 'src/features/style-guide/components/ScoreRow.js');
const baseline = compile(rowFile, execFileSync('git', ['show', '5c3d2f7:src/features/style-guide/components/ScoreRow.js'], { cwd: root, encoding: 'utf8' }));
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
function all(node, match) {
  if (Array.isArray(node)) return node.flatMap(child => all(child, match));
  if (!node || typeof node !== 'object') return [];
  return [...(match(node) ? [node] : []), ...all(node.props?.children, match)];
}
const style = value => (Array.isArray(value) ? value.flat(Infinity) : [value]).filter(Boolean).reduce((result, next) => ({ ...result, ...next }), {});
const json = node => JSON.stringify(node);
function reset() { hooks = []; cursor = 0; effects = []; queue = []; defer = false; fontScale = 1; }
let props, tree, parent = false;
function render() { cursor = 0; tree = expand(parent ? CoffeeSampleCard(props) : ScoreRow(props)); return tree; }
function drain() { while (queue.length) queue.shift()(); }
function runEffects() { const pending = effects; effects = []; pending.forEach(effect => effect()); }
function pooled(handler, width, height = 16) {
  let released = false;
  const event = { get nativeEvent() { if (released) throw Error('native event reused after release'); return { lines: [{ width, height }] }; } };
  handler(event); released = true;
}
const probes = () => all(tree, node => typeof node.props?.onTextLayout === 'function');
function measure(factor = 1) {
  const items = probes(); assert.equal(items.length, 18);
  items.forEach((node, i) => pooled(node.props.onTextLayout, i % 2 === 0 ? glyphWidth(node.props.children[0], factor) : (i === 17 ? 37 : 22) * factor, 16 * factor));
  drain(); render();
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

async function main() {
  for (const total of [null, '', ' ', 'invalid', '81.25', '1e2', 0, '0', '-8.5', -0]) {
    assert(Object.is(normalizeTotalScore(total), baseline.normalizeTotalScore(total)), 'total normalization remains unchanged');
    const input = { scores, totalScore: total, scale: 0.58 };
    assert.deepEqual(expand(ScoreRow(input)), expand(baseline.ScoreRow(input)), 'absent opt-in preserves exact default rendered tree/styles');
    assert.deepEqual(expand(ScoreRow({ ...input, rotatedSummary: false })), expand(baseline.ScoreRow(input)));
  }
  reset(); props = { scores, totalScore: '88.75', scale: 0.58, rotatedSummary: true };
  render(); defer = true; measure();
  assert.equal(all(tree, node => style(node.props?.style).transform?.some(transform => transform.rotate === '90deg')).length, 8);
  const first = all(tree, node => node.props?.accessibilityLabel === 'Fragrance: 1.00')[0];
  const second = all(tree, node => node.props?.accessibilityLabel === 'Aroma: 9.00')[0];
  const firstBox = all(first, node => style(node.props?.style).borderWidth === 1)[0];
  const secondBox = all(second, node => style(node.props?.style).borderWidth === 1)[0];
  assert.notEqual(style(firstBox.props.style).backgroundColor, style(secondBox.props.style).backgroundColor, 'per-item final fill is preserved');
  const total = all(tree, node => node.props?.accessibilityLabel === 'Total score: 88.75')[0];
  assert.equal(total.props.style.width, 56); assert.equal(all(total, node => style(node.props?.style).transform).length, 0);
  const totalText = all(total, node => node.type === 'Text' && node.props.children[0] === '88.75')[0];
  assert.deepEqual([style(totalText.props.style).fontSize, style(totalText.props.style).fontWeight], [13, '700']);
  assert.equal(style(firstBox.props.style).height, 48);
  const hidden = all(tree, node => node.props?.importantForAccessibility === 'no-hide-descendants')[0];
  assert.equal(hidden.props.accessible, false); assert.equal(hidden.props.accessibilityElementsHidden, true); assert.equal(hidden.props.pointerEvents, 'none');
  const stable = hooks.find(state => state?.bounds);
  pooled(probes()[0].props.onTextLayout, glyphWidth('1.00')); drain(); assert.strictEqual(hooks.find(state => state?.bounds), stable);
  const old = probes()[0].props.onTextLayout; pooled(old, 1, 1);
  fontScale = 2; render(); drain(); render(); measure(2);
  assert.equal(hooks.find(state => state?.bounds).bounds['quality-0:value'].height, 32);
  assert(hooks.find(state => state?.bounds).key.includes(CVA_SCORE_PATTERN));
  for (const raw of ['100.00', '-8.50', '0.00', '-0.00', '', 'invalid']) {
    props = { ...props, totalScore: raw }; render(); pooled(old, 1, 1); drain(); render(); measure(2);
    const expected = cvaSummaryCells(scores, normalizeTotalScore(raw))[8].value;
    assert(json(tree).includes(expected));
  }
  assert(all(tree, node => node.type === 'Text').every(node => node.props.allowFontScaling !== false && !node.props.adjustsFontSizeToFit && node.props.ellipsizeMode == null));

  // Real CoffeeSampleCard, actual opt-in ScoreRow and summary: no new reads or
  // controls, and inactive/blind transitions cannot retain old data in probes.
  reset(); parent = true; let opened = 0, removed = 0;
  const ratings = { Fragrance: 8, Aroma: 7, Flavour: 9, Aftertaste: 8, Acidity: 7, Sweetness: 8, Mouthfeel: 7, Overall: 8 };
  props = { sample: { id: 'sample', sampleCode: 'A1', cupUUID: 'TAG', coffeeNameOrigin: 'A1', identityHidden: true }, index: 0,
    status: { scoresByField: ratings, hasAnyFeedback: true, finalScore: '88.75' }, scale: 0.58, onOpenSample: () => opened++, onRemove: () => removed++, canRemove: true, showRemove: true };
  render(); runEffects(); await flush(); defer = true; measure();
  assert(json(tree).includes('Fragrance: 8.00')); assert(!json(tree).includes('SECRET_COFFEE')); assert.equal(reads, 0, 'collapsed row adds no persistence read');
  const open = all(tree, node => node.props?.accessibilityLabel === 'Open scoring for sample A1')[0]; open.props.onPress(); assert.equal(opened, 1);
  const remove = all(tree, node => node.props?.accessibilityLabel === 'Remove sample A1')[0]; remove.props.onPress({ stopPropagation() {} }); assert.equal(removed, 1);
  const oldParentProbe = probes()[0].props.onTextLayout;
  props = { ...props, inactive: true }; render(); runEffects(); pooled(oldParentProbe, 1, 1); drain(); render(); measure();
  assert(!json(tree).includes('88.75')); assert(!json(tree).includes('8.00')); assert(!json(tree).includes('Fragrance: 8.00'));
  assert.equal(probes()[16].props.children[0], 'P');
  for (let i = 0; i < 8; i++) assert.equal(probes()[i * 2].props.children[0], '—');
  const disabledOpen = all(tree, node => node.type === 'Pressable' && node.props.accessibilityState?.disabled)[0];
  assert(disabledOpen); assert.equal(reads, 0, 'inactive row makes no descriptor/details reads');
  assert.equal(JSON.stringify(scores), original, 'complete render paths leave inputs immutable');
  // Actual header states; status is a committed repository projection, never
  // inferred from note presence or the selected defect/uniformity sets.
  const ordinary = 'Adapted — five-cup-equivalent Cup App CVA interpretation — independent deductions';
  const five = 'Cup App CVA interpretation — independent deductions';
  const textNodes = value => all(tree, node => node.type === 'Text' && node.props.children[0] === value);
  const base = { ...props, inactive: false, onEditSample: () => {}, sample: { ...props.sample, cupNumber: 2 },
    status: { canonicalCva: true, isComplete: true, finalScore: '88.75', resultLabel: ordinary, scoresByField: ratings } };
  for (const n of [1, 2, 5, 8]) {
    reset(); props = { ...base, sample: { ...base.sample, cupNumber: n }, status: { ...base.status, resultLabel: n === 5 ? five : ordinary } };
    render();
    const label = n === 5 ? '5 cups' : `Adapted · ${n} ${n === 1 ? 'cup' : 'cups'}`;
    assert.equal(textNodes(label).length, 1); assert.equal(textNodes('Saved').length, 1);
    assert.equal(style(textNodes(label)[0].props.style).textAlign, 'right');
    assert.equal(textNodes(ordinary).length, 0, 'ordinary provenance is compact until expanded');
    all(tree, node => node.props?.accessibilityLabel === 'Expand sample')[0].props.onPress(); render();
    assert.equal(textNodes(props.status.resultLabel).length, 1, 'full interpretation provenance survives expanded');
    assert.equal(all(tree, node => node.props?.accessibilityLabel === 'Edit sample A1').length, 1);
    assert.equal(all(tree, node => node.props?.accessibilityLabel === 'Remove sample A1').length, 1);
  }
  for (const n of [undefined, null, '2', 0, 9, 2.5]) {
    reset(); props = { ...base, sample: { ...base.sample, cupNumber: n } }; render();
    assert.equal(textNodes(ordinary).length, 1, 'invalid/missing count retains canonical provenance');
    assert(!json(tree).includes('Adapted ·'), 'count never guessed or coerced');
  }
  const warnings = ['Saved under previous Cup App defect rule', 'Saved under previous Cup App rounding calculation',
    'Unsupported saved calculation · total unavailable', `${ordinary} · Unknown future warning`];
  for (const warning of warnings) {
    reset(); props = { ...base, status: { ...base.status, resultLabel: warning } }; render();
    assert.equal(textNodes(warning).length, 1); assert.equal(textNodes('Saved').length, 0);
    props = { ...props, status: { ...props.status, isComplete: false } }; render();
    all(tree, node => node.props?.accessibilityLabel === 'Expand sample')[0].props.onPress(); render();
    assert.equal(textNodes(warning).length, 2, 'warning survives both collapsed header and expanded result before completion');
    props = { ...props, inactive: true }; render();
    assert.equal(textNodes(warning).length, 0); assert.equal(textNodes('Saved').length, 0);
    assert.equal(textNodes('88.75').length, 0);
  }
  for (const state of [
    { ...base.status, finalScore: null, isComplete: false, resultLabel: null },
    { ...base.status, finalScore: '', isComplete: true, resultLabel: null },
    { ...base.status, canonicalCva: false },
    { ...base.status, isComplete: false },
  ]) {
    reset(); props = { ...base, status: state }; render(); assert.equal(textNodes('Saved').length, 0);
  }
  reset(); let edited = 0;
  props = { ...base, status: { ...base.status, isComplete: false }, onEditSample: () => edited++ };
  render();
  const edit = all(tree, node => node.props?.accessibilityLabel === 'Edit sample A1')[0];
  assert.equal(edit.props.disabled, false); edit.props.onPress({ stopPropagation() {} }); assert.equal(edited, 1);
  assert.equal(all(tree, node => node.props?.accessibilityLabel === 'Remove sample A1')[0].props.disabled, false);
  props = { ...props, canRemove: false }; render();
  assert.equal(all(tree, node => node.props?.accessibilityLabel === 'Remove sample A1')[0].props.disabled, true);
  reset(); props = { ...base, defaultExpanded: true, status: { ...base.status, isComplete: false, finalScore: null,
    resultLabel: 'Unsupported saved calculation · total unavailable' } }; render();
  assert.equal(textNodes('Unsupported saved calculation · total unavailable').length, 2);
  assert.equal(textNodes('Final Score').length, 1, 'unavailable total retains expanded safety provenance');
  for (const value of [0, -8.5]) {
    reset(); props = { ...base, status: { ...base.status, finalScore: value } }; render();
    assert.equal(textNodes('Saved').length, 1, 'finite canonical zero/negative final is saved');
  }
  reset(); props = { ...base, status: { ...base.status, isComplete: false }, defaultExpanded: true }; render();
  assert.equal(textNodes(ordinary).length, 1, 'full provenance visible expanded without local completion');
  props = { ...props, sample: { ...props.sample, id: 'other', cupNumber: 5 }, status: { isComplete: false, finalScore: null } }; render();
  assert.equal(textNodes('Saved').length, 0); assert.equal(textNodes(ordinary).length, 0); assert(!json(tree).includes('Adapted ·'));
  console.log('PASS CVA header saved/draft/count1/2/5/8/fallback/warnings/provenance/inactive/controls plus compact summary: two-decimal display-only1–9, immutable/per-item fill, exact default ScoreRow parity, actual parent opt-in/inactive/blind masking, native rotatedW/H bounds,48/56minimums, queued released-event/stale callbacks and normal/enlarged geometry. Software only; owner-phone acceptance pending.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
