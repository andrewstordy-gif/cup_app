#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('@babel/core');
const { PROFILE, resolveForm, scoreResponse } = require('../src/features/forms/contract');
const { legacyCardPresentation, legacyCardScoreLayout, recordLegacyScoreMeasurement } = require('../src/features/forms/legacy/legacyCardPresentation');
const root = path.resolve(__dirname, '..');
const fields = ['fragrance_aroma', 'flavor', 'aftertaste', 'acidity', 'body', 'balance', 'overall'];
const cups = n => Array.from({ length: n }, (_, i) => i + 1);
function saved(count = 1) {
  const response = { quality_ratings: Object.fromEntries(fields.map(key => [key, 32])),
    consistent_cups: cups(count), sweet_cups: cups(count), clean_cups: cups(count), scored_defect: null,
    aroma_qualities: 'Floral aroma', notes: 'Mixed tasting notes', roast_level_note: 'Even roast', defect_description: 'Shared defect note' };
  const identity = resolveForm(PROFILE, 2).identity;
  const result = scoreResponse({ profile: PROFILE, f: 2, identity, cup_count: count, response }, { profile: PROFILE, f: 2, identity });
  assert.equal(result.ok, true);
  return { response, result, complete: true, recoveryDraft: { notes: 'UNCOMMITTED_SECRET' } };
}

for (const n of [1, 5, 8]) {
  const snapshot = saved(n), view = legacyCardPresentation(snapshot);
  assert.equal(view.total, snapshot.result.display_score, 'canonical result is passed through');
  assert.equal(view.resultLabel, snapshot.result.label);
  assert.deepEqual(view.quality.map(field => field.value), Array(7).fill('8.00'));
  assert.equal(view.checks[0].value, '10.00');
  assert.equal(view.aromaNotes, 'Floral aroma');
  assert.equal(view.generalNotes, 'Mixed tasting notes');
  assert.equal(view.roastNotes, 'Even roast');
  assert.equal(view.defectNotes, 'Shared defect note');
  assert(!JSON.stringify(view).includes('UNCOMMITTED_SECRET'));
}
const empty = legacyCardPresentation(null);
assert.equal(empty.total, null); assert(empty.quality.every(row => row.value === null));
const draft = legacyCardPresentation({ response: { quality_ratings: { fragrance_aroma: 0, flavor: 39 } }, complete: false, result: saved().result });
assert.equal(draft.quality[0].value, '0.00'); assert.equal(draft.quality[1].value, '9.75');
assert.equal(draft.total, null); assert(draft.checks.every(row => row.value === null), 'unscored cup checks stay unscored');
for (const affected_cups of [null, undefined, [], '1', [null], [99]]) {
  const incomplete = legacyCardPresentation({ response: { scored_defect: { kind: 'taint', affected_cups } }, complete: false });
  assert.equal(incomplete.scoredDefect, 'Taint · Cups not assessed', 'incomplete defect judgments never crash or invent a cup');
  assert.equal(incomplete.total, null);
}
assert.equal(legacyCardPresentation({ response: { scored_defect: { kind: 'unknown', affected_cups: [1] } } }).scoredDefect, '', 'unknown severity is never guessed as Fault');
const zero = saved(5);
zero.response.quality_ratings = Object.fromEntries(fields.map(key => [key, 0]));
zero.response.consistent_cups = []; zero.response.sweet_cups = []; zero.response.clean_cups = [];
const identity = resolveForm(PROFILE, 2).identity;
zero.result = scoreResponse({ profile: PROFILE, f: 2, identity, cup_count: 5, response: zero.response }, { profile: PROFILE, f: 2, identity });
assert.equal(legacyCardPresentation(zero).total, '0.00');
assert(legacyCardPresentation(zero).extendedNote.includes('Cup App'), 'extended-quality provenance remains visible');
const typed = saved();
typed.response.bean_defect_type_masks = { phenolic: [1] };
typed.response.roast_defect_type_masks = { baked: [1] };
typed.response.scored_defect = { kind: 'taint', affected_cups: [1] };
assert.deepEqual(legacyCardPresentation(typed).beanDefects, ['Phenolic · Cup 1']);
assert.deepEqual(legacyCardPresentation(typed).roastDefects, ['Baked · Cup 1']);

const nativeWidths = { quality: 36, totalLimit: 44, totalActual: 42 };
for (const width of [320, 375, 390]) {
  const scale = Math.max(width / 616, 0.58), available = width - 32 - 2 - 12 * scale;
  const layout = legacyCardScoreLayout(available, 1, scale, nativeWidths);
  assert(layout.qualityWidth >= 39, 'native five-character 10.00 width has both borders and rounding allowance');
  assert(layout.totalWidth >= 47, 'native six-character 100.00 width retains all digits');
  assert(width === 320 ? layout.contentWidth > available : layout.contentWidth <= available + 0.001,
    `${width}pt keeps an exact single row, scrolling only if measured native cells cannot fit`);
  const enlargedWidths = { quality: 68, totalLimit: 83, totalActual: 80 };
  const enlarged = legacyCardScoreLayout(available, 2, scale, enlargedWidths);
  assert.equal(enlarged.totalWidth, 86, 'native measurements are already font-scaled; never multiply them twice');
  assert(enlarged.contentWidth > available, 'larger text gets scrollable width');
  assert(legacyCardScoreLayout(available, 1, scale).qualityWidth >= 63, 'delayed measurements use generous scrollable bootstrap, not old 32pt guess');
}
const measureEvent = width => ({ nativeEvent: { lines: [{ width }] } });
let measurement = { key: '1:100.00', widths: {} };
measurement = recordLegacyScoreMeasurement(measurement, measurement.key, 'quality', measureEvent(35.44));
assert.equal(measurement.widths.quality, 36, 'native fractional glyph width rounds upward');
assert.strictEqual(recordLegacyScoreMeasurement(measurement, measurement.key, 'quality', measureEvent(35.44)), measurement, 'same native geometry does not create a state loop');
for (const invalid of [measureEvent(NaN), measureEvent(0), measureEvent(Infinity), measureEvent(10000), { nativeEvent: { lines: [{ width: 20 }, { width: 10 }] } }, null]) {
  assert.strictEqual(recordLegacyScoreMeasurement(measurement, measurement.key, 'quality', invalid), measurement);
}
assert.strictEqual(recordLegacyScoreMeasurement(measurement, '2:100.00', 'quality', measureEvent(68)), measurement, 'stale native text callbacks cannot overwrite current geometry');

// Execute the real JSX and hooks with native hosts substituted, including
// effect cleanup, async replies and prop changes. This is not device evidence.
let hooks = [], cursor = 0, effects = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial;
    return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
  useEffect(effect, deps) { const i = cursor++, previous = hooks[i];
    if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
      previous?.cleanup?.(); const record = { deps }; hooks[i] = record;
      effects.push(() => { record.cleanup = effect(); });
    }
  },
};
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file)); cache.set(file, mod);
  mod.require = request => {
    if (request === 'react') return react;
    if (request === 'react-native') return { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: value => value } };
    if (request.endsWith('TypographyAuditText')) return { TypographyAuditText: 'Text' };
    if (request.endsWith('AppIcon')) return { AppIcon: 'AppIcon' };
    if (request.endsWith('IconButton')) return { IconButton: 'IconButton' };
    if (request.endsWith('sessionDetails')) return { getProcessLabel: () => 'Washed (Wet)' };
    if (request.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), request + '.js')));
    return require(request);
  };
  mod._compile(transformSync(fs.readFileSync(file, 'utf8'), { filename: file, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code, file);
  return mod.exports;
}
const { LegacySampleCard } = load('src/features/forms/legacy/LegacySampleCard.js');
function expandFunctions(node) {
  if (Array.isArray(node)) return node.map(expandFunctions);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expandFunctions(node.type(node.props));
  return { ...node, props: { ...node.props, children: expandFunctions(node.props.children) } };
}
function findAll(node, test) {
  if (Array.isArray(node)) return node.flatMap(child => findAll(child, test));
  if (!node || typeof node !== 'object') return [];
  return [...(test(node) ? [node] : []), ...findAll(node.props?.children, test)];
}
const strings = tree => JSON.stringify(tree);
let props, tree;
function render() { cursor = 0; tree = expandFunctions(LegacySampleCard(props)); return tree; }
function runEffects() { const pending = effects; effects = []; pending.forEach(effect => effect()); }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const findButton = label => findAll(tree, node => node.props?.accessibilityLabel === label)[0];

async function main() {
  let reads = 0, opens = 0, removes = 0;
  const first = deferred();
  props = { sample: { id: 'sample-a', sampleCode: 'A1', coffeeNameOrigin: 'Test Coffee' }, index: 0,
    status: { hasAnyFeedback: true }, sessionId: 'session-a', refreshKey: 0, scale: 0.58,
    onPress: () => opens++, onRemove: id => { assert.equal(id, 'sample-a'); removes++; }, canRemove: true, showRemove: true,
    readSavedAssessment: () => { reads++; return first.promise; } };
  render(); assert(strings(tree).includes('Loading saved assessment')); runEffects(); await flush(); assert.equal(reads, 1);
  first.resolve(saved()); await flush(); render();
  assert(strings(tree).includes('Total score: 86.00'));
  const probes = () => findAll(tree, node => node.type === 'Text' && typeof node.props.onTextLayout === 'function');
  const probe = value => probes().find(node => node.props.children[0] === value);
  assert.equal(probes().length, 3, 'same native Text style measures max quality, max total and actual total');
  const hidden = findAll(tree, node => node.props?.importantForAccessibility === 'no-hide-descendants')[0];
  assert.equal(hidden.props.accessible, false); assert.equal(hidden.props.accessibilityElementsHidden, true);
  assert.equal(hidden.props.pointerEvents, 'none'); assert.equal(hidden.props.style.width, 10000);
  assert.equal(hidden.props.style.opacity, 0, 'probes do not appear or receive interaction');
  const oldQualityCallback = probe('10.00').props.onTextLayout;
  probe('10.00').props.onTextLayout(measureEvent(35.44));
  probe('100.00').props.onTextLayout(measureEvent(43.32));
  probe('86.00').props.onTextLayout(measureEvent(35.44)); render();
  const qualityCell = findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 8.00')[0];
  assert.equal(qualityCell.props.style.width, 39, 'actual card applies measured native glyph width plus borders');
  props = { ...props, fontScale: 2 }; render();
  oldQualityCallback(measureEvent(20)); render();
  assert(findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 8.00')[0].props.style.width >= 123, 'old font-scale callback cannot shrink current fallback');
  probe('10.00').props.onTextLayout(measureEvent(67.37));
  probe('100.00').props.onTextLayout(measureEvent(82.5));
  probe('86.00').props.onTextLayout(measureEvent(67.37)); render();
  assert.equal(findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 8.00')[0].props.style.width, 71);
  const allText = findAll(tree, node => node.type === 'Text');
  assert(allText.every(node => node.props.allowFontScaling !== false && !node.props.adjustsFontSizeToFit && node.props.ellipsizeMode == null), 'no scaling disable, shrink-to-fit or clipping/ellipsis remedy');
  const header = findAll(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel?.startsWith('Open Legacy sample'));
  assert.equal(header.length, 2, 'header and score row can open tasting'); header.forEach(button => button.props.onPress()); assert.equal(opens, 2);
  findButton('Expand sample A1').props.onPress(); render(); runEffects();
  assert.equal(reads, 1, 'expanding does not reread or write'); assert.equal(opens, 2);
  const rendered = strings(tree);
  for (const label of ['Coffee / Process', 'Fragrance / Aroma', 'General notes', 'Defect notes', 'Cup assessment', 'Roast notes', 'Final score']) assert(rendered.includes(label), label);
  assert(rendered.indexOf('Roast notes') < rendered.indexOf('Final score'));
  assert(!rendered.includes('UNCOMMITTED_SECRET'));
  findButton('Remove sample A1').props.onPress(); assert.equal(removes, 1); assert.equal(opens, 2, 'removal does not open tasting');

  const old = deferred(), newer = deferred(); let call = 0;
  props = { ...props, readSavedAssessment: () => (++call === 1 ? old.promise : newer.promise), status: { hasAnyFeedback: true } };
  render(); assert(!strings(tree).includes('Floral aroma'), 'changed source hides old snapshot immediately'); runEffects(); await flush();
  props = { ...props, status: { hasAnyFeedback: true } }; // same ratings, new note-only snapshot
  render(); runEffects(); await flush();
  const edited = saved(); edited.response.aroma_qualities = 'NEW_NOTE'; newer.resolve(edited); await flush(); render();
  assert(strings(tree).includes('NEW_NOTE'));
  old.resolve(saved()); await flush(); render(); assert(strings(tree).includes('NEW_NOTE'), 'late reply cannot overwrite newer response');

  props = { ...props, inactive: true }; render(); runEffects();
  assert(strings(tree).includes('Scan cup to include in your tasting'));
  assert(!strings(tree).includes('NEW_NOTE')); assert(!strings(tree).includes('Total score'));
  assert.equal(findAll(tree, node => node.props?.accessibilityState?.expanded != null).length, 0);
  const before = call; await flush(); assert.equal(call, before, 'inactive card never starts a read');

  props = { ...props, inactive: false, sessionId: 'session-b', sample: { ...props.sample, id: 'sample-b' }, readSavedAssessment: () => Promise.reject(Error('PRIVATE_DIAGNOSTIC')) };
  render(); runEffects(); await flush(); render();
  assert(strings(tree).includes('Saved assessment unavailable.')); assert(!strings(tree).includes('PRIVATE_DIAGNOSTIC')); assert(!strings(tree).includes('NEW_NOTE'));
  const retryButton = findAll(tree, node => node.type === 'Pressable' && strings(node).includes('Retry'))[0];
  props = { ...props, readSavedAssessment: () => Promise.resolve({ response: { notes: 'Recovered committed note' }, complete: false }) };
  retryButton.props.onPress(); render(); runEffects(); await flush(); render();
  assert(strings(tree).includes('Recovered committed note')); assert(!strings(tree).includes('Final score'));
  props = { ...props, sessionId: null }; render(); runEffects(); assert(!strings(tree).includes('Recovered committed note'), 'unsaved/DRAFT read suppression clears loaded data');

  const maximum = saved(5); maximum.response.quality_ratings = Object.fromEntries(fields.map(key => [key, 40]));
  maximum.result = scoreResponse({ profile: PROFILE, f: 2, identity, cup_count: 5, response: maximum.response }, { profile: PROFILE, f: 2, identity });
  props = { ...props, sessionId: 'session-max', fontScale: 1, readSavedAssessment: () => Promise.resolve(maximum) };
  render(); runEffects(); await flush(); render();
  assert.equal(findAll(tree, node => node.props?.accessibilityLabel?.match(/^(Fragrance \/ Aroma|Flavour|Aftertaste|Acidity|Body|Balance|Overall): 10\.00$/)).length, 7);
  assert(strings(tree).includes('Total score: 100.00'), 'all longest values remain exact');
  const oldTotalCallback = probe('100.00').props.onTextLayout;
  for (const total of ['-20.00', '0.00', '-0.00']) {
    props = { ...props, readSavedAssessment: () => Promise.resolve({ ...maximum, result: { ...maximum.result, display_score: total } }) };
    render(); runEffects(); await flush(); render();
    oldTotalCallback(measureEvent(10)); render();
    const actual = probe(total); assert(actual, `${total} is measured without losing signs/zero`);
    actual.props.onTextLayout(measureEvent(total === '-20.00' ? 45.2 : 29));
    probe('100.00').props.onTextLayout(measureEvent(43.32));
    probe('10.00').props.onTextLayout(measureEvent(35.44)); render();
    assert(strings(tree).includes(`Total score: ${total}`));
    const totalCell = findAll(tree, node => node.props?.accessibilityLabel === `Total score: ${total}`)[0];
    assert(totalCell.props.style.width >= (total === '-20.00' ? 49 : 47), 'actual longer negative total drives its cell width');
  }

  console.log('PASS Legacy sample card: canonical 1/5/8-cup values, zero/draft/empty, provenance, notes mapping, native glyph measurement callback/context guards, full10.00/100.00/negative/zero values, normal/enlarged scrolling geometry, actual JSX/hooks open/expand/remove separation, note-only refresh, stale replies, inactive suppression and generic errors/retry. Software only; native owner acceptance pending.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
