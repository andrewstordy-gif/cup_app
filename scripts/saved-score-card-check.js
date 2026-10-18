const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');
const projectLoader = require('./helpers/load-project-module');
const { createCvaDraft, RATINGS } = require('../src/features/cupping/data/cvaResponse');
const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
let id = 0;
const bridge = {
  async execAsync(sql) { sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) { return sqlite.prepare(sql).run(...args); },
  async withTransactionAsync(callback) {
    sqlite.exec('BEGIN');
    try { const result = await callback(); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  async withExclusiveTransactionAsync(callback) { return bridge.withTransactionAsync(() => callback(bridge)); },
};
const ids = { generateDomainId: () => `id-${++id}`, generateSessionReference: () => `ref-${++id}` };
const repo = projectLoader(root, {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
  '../utils/secureIdentifiers': ids, '../../../utils/secureIdentifiers': ids,
})('src/data/sessionRepository.js');

// Execute the actual Card, shared ScoreRow/TotalBox and makeScores, replacing
// native hosts and unrelated leaf components only. Function components really
// execute: a shallow JSX tree would miss the original toFixed crash.
let state = [], cursor = 0, effects = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(value) { const i = cursor++; if (!(i in state)) state[i] = value;
    return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
  useEffect(effect) { effects.push(effect); },
};
const leaf = name => ({ [name]: name });
const mocks = {
  react,
  'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', Text: 'Text', StyleSheet: { create: value => value } },
  '@expo/vector-icons/AntDesign': 'AntDesign',
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../components/ui/AppIcon': leaf('AppIcon'),
  '../../../data/sessionRepository': repo,
  './DefectsSection': { BEAN_DEFECT_OPTIONS: [], ROAST_DEFECT_OPTIONS: [] },
  './KeywordPillRow': leaf('KeywordPillRow'),
  '../../cupping/components/KeywordPillRow': leaf('KeywordPillRow'),
};
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = mod.require.bind(mod);
  mod.require = request => {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    if (request.startsWith('.')) return load(`${path.resolve(path.dirname(filename), request)}.js`);
    return nativeRequire(request);
  };
  cache.set(filename, mod); mod._compile(code, filename); return mod.exports;
}
const { CoffeeSampleCard } = load('src/features/cupping/components/CoffeeSampleCard.js');
const { ScoreRow } = load('src/features/style-guide/components/ScoreRow.js');
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(value => nodes(value, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
const texts = tree => nodes(tree, node => node.type === 'Text').map(node => node.props.children.flat(Infinity).join(''));
function snapshot() {
  return JSON.stringify(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    .map(({ name }) => [name, sqlite.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]));
}
async function card(sample, status, expected) {
  const before = snapshot();
  const assertTotals = (tree, expanded) => {
    const compactLabels = texts(nodes(tree, node => node.props?.accessibilityLabel === 'Open scoring for sample 1')[0]);
    assert.ok(compactLabels.includes(expected), `compact row total stays ${expected}`);
    if (expanded && status.isComplete && expected !== 'P') {
      const finalSection = nodes(tree, node => node.type === 'View' &&
        node.props.children.some(child => child?.type === 'Text' && texts(child).includes('Final Score')))[0];
      assert.ok(finalSection, 'expanded final section is rendered');
      assert.deepEqual(texts(finalSection), ['Final Score', Number(status.finalScore).toFixed(2)],
        'expanded final section preserves two-decimal precision independently of compact row');
    }
  };
  for (const defaultExpanded of [false, true]) {
    state = []; cursor = 0; effects = []; let opened;
    const props = { sample, index: 0, status, defaultExpanded, onOpenSample: (...args) => { opened = args; }, canRemove: true };
    let tree = expand(CoffeeSampleCard(props));
    assert.ok(texts(tree).includes(expected), `real card total ${expected}`);
    assertTotals(tree, defaultExpanded);
    nodes(tree, node => node.props?.accessibilityLabel === 'Open scoring for sample 1')[0].props.onPress();
    assert.deepEqual(opened, [sample, 0], 'original sample/index route callback remains usable');
    for (const effect of effects) effect();
    await new Promise(resolve => setImmediate(resolve));
    cursor = 0; effects = []; tree = expand(CoffeeSampleCard(props));
    assert.ok(texts(tree).includes(expected));
    assertTotals(tree, defaultExpanded);
  }
  assert.equal(snapshot(), before, 'render/detail reads cannot mutate raw rows, pins, results or revision history');
}
async function fixture(name, form = 1) {
  await repo.saveSessionWithSamples({ sessionUUID: name, sessionName: 'Display test', sessionDate: '16 Oct 2026',
    sessionType: 'Training Session', cuppingForm: form, cuppingMode: 'open',
    samples: [{ id: `sample-${name}`, cupUUID: `cup-${name}`, cupNumber: 1, sampleNumber: 1,
      cuppingForm: form, cuppingMode: 'open', coffeeNameOrigin: 'Test', process: '1' }] });
  return (await repo.getSessionById(name)).samples[0];
}
async function main() {
  const sample = await fixture('canonical');
  const context = await repo.getCvaResponse('canonical', sample.id);
  const input = { sessionId: 'canonical', sampleId: sample.id, expectedRevision: 0,
    expectedIdentity: context.trusted.identity, expectedCupCount: 1 };
  const response = { ...createCvaDraft(1),
    ratings: Object.fromEntries(Object.values(RATINGS).map(key => [key, 7])) };
  await repo.saveCvaResponse({ ...input, response: { ...response, ratings: { fragrance: 7 } } });
  await card(sample, (await repo.getSessionSampleFinalStatus('canonical'))[sample.id], 'P');
  await repo.saveCvaResponse({ ...input, expectedRevision: 1, response });
  let status = (await repo.getSessionSampleFinalStatus('canonical'))[sample.id];
  assert.equal(status.finalScore, '89.50');
  // On baseline this actual producer -> Card -> TotalBox path throws
  // TypeError: total.toFixed is not a function.
  await card(sample, status, '89.5');
  await card(sample, { ...status, finalScore: 89.5 }, '89.5');
  await repo.saveCvaResponse({ ...input, expectedRevision: 2,
    response: { ...response, ratings: { ...response.ratings, overall: null } } });
  status = (await repo.getSessionSampleFinalStatus('canonical'))[sample.id];
  assert.equal(status.finalScore, null); assert.equal(status.isComplete, false);
  await card(sample, status, 'P');
  const legacy = await fixture('legacy', 2);
  const saved = await repo.saveLegacyResponse({ sessionId: 'legacy', sampleId: legacy.id, complete: true,
    response: { quality_ratings: Object.fromEntries(['fragrance_aroma', 'flavor', 'aftertaste', 'acidity', 'body', 'balance', 'overall'].map(key => [key, 32])),
      consistent_cups: [1], sweet_cups: [1], clean_cups: [1], scored_defect: null } });
  assert.equal(saved.ok, true);
  await card(legacy, (await repo.getSessionSampleFinalStatus('legacy'))[legacy.id], '86');
  const prototype = await fixture('prototype');
  require('./helpers/prototype-cva-fixture').pinPrototypeCvaFixture(sqlite, 'prototype');
  await repo.saveCvaAssessmentAtomically({ sessionId: 'prototype', sampleId: prototype.id,
    finalFeedback: Object.fromEntries(repo.CUPPING_SCORE_FIELDS.map(field => [field, { score: 7, comments: '' }])),
    defectsEntry: { numberOfCups: 1, isFinal: true, uniformityCups: 0, defectiveCups: 0 } });
  const prototypeStatus = (await repo.getSessionSampleFinalStatus('prototype'))[prototype.id];
  assert.equal(typeof prototypeStatus.finalScore, 'number');
  assert.equal(prototypeStatus.finalScore, 89.5);
  await card(prototype, prototypeStatus, '89.5');
  for (const [value, expected] of [[0, '0'], ['0.00', '0'], [-12.5, '-12.5'], ['-12.50', '-12.5'], [' 89.50 ', '89.5'], [7, '7'], ['7', '7']]) {
    assert.ok(texts(expand(ScoreRow({ scores: [], totalScore: value, scale: 1 }))).includes(expected));
    await card(sample, { isComplete: true, finalScore: value }, expected);
  }
  for (const value of [null, undefined, '', ' ', '\t', '89.5x', 'NaN', 'Infinity', '-Infinity', '0x10', NaN, Infinity, -Infinity, true, false, {}, [], ['7']]) {
    const tree = expand(ScoreRow({ scores: [], totalScore: value, scale: 1 }));
    assert.ok(texts(tree).includes('P'), `invalid ${String(value)} stays pending`);
    await card(sample, { isComplete: true, finalScore: value }, 'P');
  }
  console.log('Saved score actual SQLite -> Card -> ScoreRow checks passed: draft/final/draft, canonical/Legacy, strict display inputs, unchanged rows/pins/history and open callbacks.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
