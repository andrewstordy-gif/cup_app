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

const ownerRows = [
  { values: ['8.50', '9.50', '9.25', '7.00', '7.75', '8.50', '10.00'], total: '82.50' },
  { values: ['9.25', '7.75', '8.00', '8.50', '7.75', '7.00', '10.00'], total: '80.25' },
];
const scoreCells = (values, total) => [...empty.quality.map((row, i) => ({ ...row, value: values[i] })), { key: 'total', caption: 'TOTAL', value: total }];
// Native macOS tabular-font corroboration fixtures, not exact iOS font proof.
const glyphWidth = value => value === '-20.00' ? 45.2 : value.length === 6 ? 43.32 : value.length === 5 ? 35.44 : 27.57;
const nativeWidthsFor = (cells, factor = 1) => Object.fromEntries(cells.flatMap(cell => [
  [`${cell.key}:value`, Math.ceil(glyphWidth(cell.value) * factor)],
  [`${cell.key}:caption`, Math.ceil((cell.caption === 'TOTAL' ? 37 : 22) * factor)],
]));
for (const width of [320, 375, 390]) {
  const scale = Math.max(width / 616, 0.58), available = width - 32 - 2 - 12 * scale;
  for (const row of ownerRows) {
    const cells = scoreCells(row.values, row.total), nativeWidths = nativeWidthsFor(cells);
    const layout = legacyCardScoreLayout(available, 1, scale, nativeWidths, 12, cells);
    assert(layout.contentWidth <= available + 0.001, `owner mixed-value row fits ${width}pt with native-font fixture widths`);
    assert(layout.qualityWidths[6] >= 39 && layout.qualityWidths[0] < layout.qualityWidths[6], 'only the displayed 10.00 needs its wider column');
    assert(layout.totalWidth >= 40, 'TOTAL caption width is included even when numeric total is narrower');
    const enlargedWidths = nativeWidthsFor(cells, 2);
    const enlarged = legacyCardScoreLayout(0, 2, scale, enlargedWidths, 12, cells);
    assert.equal(enlarged.totalWidth, enlargedWidths['total:caption'] + 3, 'already OS-scaled measurements are not scaled twice');
    assert(enlarged.contentWidth > available, 'truly impossible enlarged row scrolls');
  }
  assert(legacyCardScoreLayout(available, 1, scale).qualityWidths.every(value => value >= 63), 'delayed measurements use conservative intrinsic fallback');
}
const measureEvent = width => ({ nativeEvent: { lines: [{ width }] } });
let measurement = { key: '1:100.00', widths: {} };
measurement = recordLegacyScoreMeasurement(measurement, measurement.key, 'overall:value', 35.44);
assert.equal(measurement.widths['overall:value'], 36, 'native fractional glyph width rounds upward');
assert.strictEqual(recordLegacyScoreMeasurement(measurement, measurement.key, 'overall:value', 35.44), measurement, 'same native geometry does not create a state loop');
for (const invalid of [NaN, 0, Infinity, 10000, null, measureEvent(20)]) {
  assert.strictEqual(recordLegacyScoreMeasurement(measurement, measurement.key, 'overall:value', invalid), measurement, 'state helper accepts a captured width scalar only');
}
assert.strictEqual(recordLegacyScoreMeasurement(measurement, '2:100.00', 'overall:value', 68), measurement, 'stale native text callbacks cannot overwrite current geometry');

// Execute the real JSX and hooks with native hosts substituted, including
// effect cleanup, async replies and prop changes. This is not device evidence.
let hooks = [], cursor = 0, effects = [], deferUpdaters = false, stateQueue = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial;
    return [hooks[i], next => {
      if (deferUpdaters && typeof next === 'function') stateQueue.push(() => { hooks[i] = next(hooks[i]); });
      else hooks[i] = typeof next === 'function' ? next(hooks[i]) : next;
    }]; },
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
function drainStateQueue() { while (stateQueue.length) stateQueue.shift()(); }
function deliverPooled(handler, width) {
  let released = false;
  const event = { get nativeEvent() { if (released) throw Error('pooled native event accessed after release'); return { lines: [{ width }] }; } };
  handler(event); released = true;
}

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
  const probe = (index, caption = false) => probes()[index * 2 + (caption ? 1 : 0)];
  function measureCurrent(factor = 1) {
    for (let i = 0; i < 8; i++) {
      deliverPooled(probe(i).props.onTextLayout, glyphWidth(probe(i).props.children[0]) * factor);
      deliverPooled(probe(i, true).props.onTextLayout, (i === 7 ? 37 : 22) * factor);
    }
    drainStateQueue(); render();
  }
  assert.equal(probes().length, 16, 'each displayed value and caption has a same-style unconstrained probe');
  const hidden = findAll(tree, node => node.props?.importantForAccessibility === 'no-hide-descendants')[0];
  assert.equal(hidden.props.accessible, false); assert.equal(hidden.props.accessibilityElementsHidden, true);
  assert.equal(hidden.props.pointerEvents, 'none'); assert.equal(hidden.props.style.width, 10000);
  assert.equal(hidden.props.style.opacity, 0, 'probes do not appear or receive interaction');
  const oldQualityCallback = probe(0).props.onTextLayout;
  deferUpdaters = true;
  measureCurrent(); // every event is released BEFORE its queued updater runs
  const qualityCell = findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 8.00')[0];
  assert.equal(qualityCell.props.style.width, 31, 'released pooled events still produce the actual four-character width');
  const stableMeasurement = hooks.find(value => value?.widths);
  deliverPooled(probe(0).props.onTextLayout, 27.57); drainStateQueue();
  assert.strictEqual(hooks.find(value => value?.widths), stableMeasurement, 'queued duplicate native measurements retain state identity');
  probe(0).props.onTextLayout({ nativeEvent: { lines: [{ width: 20 }, { width: 10 }] } }); drainStateQueue();
  assert.strictEqual(hooks.find(value => value?.widths), stableMeasurement, 'multiline pooled input does not become a false narrow measurement');
  deliverPooled(oldQualityCallback, 20); // queued before new scale is rendered
  props = { ...props, fontScale: 2 }; render();
  drainStateQueue(); render();
  assert(findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 8.00')[0].props.style.width >= 99, 'late updater from old text scale cannot shrink current fallback');
  measureCurrent(2);
  assert.equal(findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 8.00')[0].props.style.width, 59);
  deferUpdaters = false;
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
  const oldTotalCallback = probe(7).props.onTextLayout;
  for (const total of ['-20.00', '0.00', '-0.00']) {
    props = { ...props, readSavedAssessment: () => Promise.resolve({ ...maximum, result: { ...maximum.result, display_score: total } }) };
    render(); runEffects(); await flush(); render();
    oldTotalCallback(measureEvent(10)); render();
    const actual = probe(7); assert.equal(actual.props.children[0], total, `${total} is measured without losing signs/zero`);
    measureCurrent();
    assert(strings(tree).includes(`Total score: ${total}`));
    const totalCell = findAll(tree, node => node.props?.accessibilityLabel === `Total score: ${total}`)[0];
    assert(totalCell.props.style.width >= (total === '-20.00' ? 49 : 40), 'actual total or its caption determines the required width');
  }

  // A rating may gain a digit without changing total. Its measurement context
  // must still change, and late width events from the old rating must be inert.
  const sameTotalBase = { ...maximum, response: { ...maximum.response, quality_ratings: { ...maximum.response.quality_ratings, fragrance_aroma: 34 } } };
  sameTotalBase.result = scoreResponse({ profile: PROFILE, f: 2, identity, cup_count: 5, response: sameTotalBase.response }, { profile: PROFILE, f: 2, identity });
  props = { ...props, readSavedAssessment: () => Promise.resolve(sameTotalBase) };
  render(); runEffects(); await flush(); render(); measureCurrent();
  const beforeEdit = probe(0).props.onTextLayout;
  const changed = { ...sameTotalBase, response: { ...sameTotalBase.response, quality_ratings: { ...sameTotalBase.response.quality_ratings, fragrance_aroma: 40, flavor: 34 } } };
  assert.equal(scoreResponse({ profile: PROFILE, f: 2, identity, cup_count: 5, response: changed.response }, { profile: PROFILE, f: 2, identity }).display_score, sameTotalBase.result.display_score, 'rating-length swap really preserves the total');
  props = { ...props, readSavedAssessment: () => Promise.resolve(changed) };
  render(); runEffects(); await flush(); render();
  deferUpdaters = true;
  measureCurrent();
  deliverPooled(beforeEdit, 10); drainStateQueue(); render();
  assert.equal(findAll(tree, node => node.props?.accessibilityLabel === 'Fragrance / Aroma: 10.00')[0].props.style.width, 39, 'same-total value changes reject old narrow queued geometry');
  for (const row of ownerRows) {
    const ownerSnapshot = { ...maximum, response: { ...maximum.response, quality_ratings: Object.fromEntries(fields.map((key, i) => [key, Number(row.values[i]) * 4])) }, result: { ...maximum.result, display_score: row.total } };
    props = { ...props, fontScale: 1, readSavedAssessment: () => Promise.resolve(ownerSnapshot) };
    render(); runEffects(); await flush(); drainStateQueue(); render();
    measureCurrent();
    const scroll = findAll(tree, node => node.type === 'ScrollView')[0];
    scroll.props.onLayout({ nativeEvent: { layout: { width: 279.04 } } }); render();
    assert.equal(findAll(tree, node => node.type === 'ScrollView')[0].props.showsHorizontalScrollIndicator, false, 'actual component owner row fits 320pt once released-event native metrics settle');
    assert(strings(tree).includes(`Total score: ${row.total}`));
  }

  console.log('PASS Legacy sample card: canonical values/lifecycle, per-displayed-value/caption native geometry, deferred updater + released pooled event regression, stale/reordered font/content callbacks, owner3L/05 mixed rows at320/375/390, full10.00/100.00/negative/zero without shrink or clipping. Software only; native owner acceptance pending.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
