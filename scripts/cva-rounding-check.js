#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');
const { PROFILE, resolveForm, scoreResponse } = require('../src/features/forms/contract');
const root = path.resolve(__dirname, '..');
function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const mod = new Module(filename, module); mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = Module._load;
  Module._load = function(request, parent, main) {
    return Object.hasOwn(mocks, request) ? mocks[request] : original.call(this, request, parent, main);
  };
  try { mod._compile(code, filename); } finally { Module._load = original; }
  return mod.exports;
}
const calculation = load('src/features/cupping/data/cvaScoreCalculation.js');
const { calculateCvaScore, CVA_EXACT_CALCULATION_POLICY: exactPolicy, getCvaScoreUpdate } = calculation;
const fields = ['Fragrance', 'Aroma', 'Flavour', 'Aftertaste', 'Acidity', 'Sweetness', 'Mouthfeel', 'Overall'];
const canonicalFields = ['fragrance', 'aroma', 'flavor', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel', 'overall'];
function ratingsForSum(sum) {
  let remaining = sum - 8;
  return fields.map(() => { const extra = Math.min(8, remaining); remaining -= extra; return 1 + extra; });
}
const slots = count => Array.from({ length: count }, (_, i) => i + 1);
const { pin: identity, pinPrototypeCvaFixture } = require('./helpers/prototype-cva-fixture');
let swept = 0;
for (let n = 1; n <= 8; n++) for (let sum = 8; sum <= 72; sum++) {
  const ratings = ratingsForSum(sum);
  for (let u = 0; u <= n; u++) for (let d = 0; d <= n; d++) {
    // Canonical coherence: defective cups must be non-uniform unless all cups
    // are evenly defective; a single cup cannot be non-uniform.
    if ((n === 1 && u !== 0) || (d > u && d !== n)) continue;
    const input = { sumHi: sum, numberOfCups: n, nonUniformCups: u, defectiveCups: d };
    const contract = scoreResponse({ profile: PROFILE, f: 1, identity, cup_count: n,
      response: { ratings: Object.fromEntries(canonicalFields.map((key, i) => [key, ratings[i]])),
        non_uniform_cups: slots(u), defective_cups: slots(d), defect_type: d ? 'potato' : null,
        evenly_defective_all_cups: d === n } }, { profile: PROFILE, f: 1, identity });
    assert.equal(contract.ok, true, JSON.stringify(contract));
    assert.equal(calculateCvaScore(input), Number(contract.display_score), `exact ${JSON.stringify(input)}`);
    const old = 0.65625 * sum + 52.75 - 2 * ((u / n) * 5) - 4 * ((d / n) * 5);
    assert.equal(calculateCvaScore({ ...input, calculationPolicy: null }), Math.round((old + Number.EPSILON) / .25) * .25);
    swept++;
  }
}
const cases = [
  { sumHi: 20, numberOfCups: 6, nonUniformCups: 1, defectiveCups: 1, expected: 61 },
  { sumHi: 28, numberOfCups: 6, nonUniformCups: 4, defectiveCups: 1, expected: 61.25 },
  { sumHi: 28, numberOfCups: 7, nonUniformCups: 3, defectiveCups: 2, expected: 61.25 },
];
for (const input of cases) {
  assert.equal(calculateCvaScore(input), input.expected);
  const update = getCvaScoreUpdate({ savedInput: input, draftInput: input, savedPolicy: null });
  assert.equal(update.requiresConfirmation, true);
  assert.equal(update.newScore - update.oldScore, .25);
}
for (const policy of ['', 'unknown', 1, {}, false]) {
  assert.equal(calculation.isSupportedCvaCalculationPolicy(policy), false);
  assert.equal(calculateCvaScore({ ...cases[0], calculationPolicy: policy }), null);
}
assert.equal(getCvaScoreUpdate({ draftInput: cases[0], savedPolicy: null }).requiresConfirmation, false,
  'first completion without a prior displayed total does not ask to convert a saved score');
const saved = { sumHi: 64, numberOfCups: 1, nonUniformCups: 0, defectiveCups: 1 };
const draft = { ...saved, sumHi: 65, defectiveCups: 0 };
const combined = getCvaScoreUpdate({ savedInput: saved, draftInput: draft, savedPolicy: null, defectPolicyWillChange: true });
assert.equal(combined.requiresConfirmation, true);
assert.equal(combined.oldScore, 74.75, 'old total uses actual saved ratings/count, not current draft');
assert.equal(combined.newScore, 95.5);

// Execute each real screen Save's pre-write boundary. The alert's Cancel path
// performs no mutation; only its explicit confirmation callback reaches a write.
const screen = fs.readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
async function verifySaveBoundary(name) {
  const start = screen.indexOf(`const ${name} = async`);
  const stop = screen.indexOf('explicitSavePendingRef.current = true;', start);
  assert.ok(start > 0 && stop > start);
  let writes = 0; let alerts = [];
  const context = {
    canCaptureFeedback: true, isFormWritable: true, sessionId: 'session', sampleId: 'sample',
    explicitSavePendingRef: { current: false }, scoreUpdate: { requiresConfirmation: true },
    previousRuleConfirmationMessage: () => 'Saved total 60.75 → 61.00',
    Alert: { alert: (...args) => alerts.push(args) }, setStatusMessage: () => {},
    onWrite: () => writes++,
  };
  vm.createContext(context);
  vm.runInContext(`${screen.slice(start, stop)}onWrite(); }; globalThis.save = ${name};`, context);
  await context.save();
  assert.equal(writes, 0); assert.equal(alerts.length, 1);
  assert.equal(alerts[0][2][0].text, 'Cancel');
  assert.equal(alerts[0][2][0].onPress, undefined, 'Cancel has no mutation callback');
  await alerts[0][2][1].onPress();
  assert.equal(writes, 1); assert.equal(alerts.length, 1, 'confirmation proceeds without duplicate prompts');
  context.isFormWritable = false;
  await context.save(); assert.equal(writes, 1, 'read-only state never reaches mutation');
}

const sqlite = new DatabaseSync(':memory:');
let nextId = 0, failLate = false;
const bridge = {
  async execAsync(sql) { sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) {
    if (failLate && sql.includes('INSERT INTO sample_defect_entries')) throw new Error('late failure');
    return sqlite.prepare(sql).run(...args);
  },
  async withTransactionAsync(callback) {
    sqlite.exec('BEGIN'); try { const result = await callback(); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  async withExclusiveTransactionAsync(callback) {
    sqlite.exec('BEGIN IMMEDIATE'); try { await callback(bridge); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const ids = { generateDomainId: () => `id-${++nextId}` };
const details = load('src/features/cupping/constants/sessionDetails.js', { '../../../utils/secureIdentifiers': ids });
const local = load('src/data/localDatabase.js', { 'expo-sqlite': { openDatabaseAsync: async () => bridge } });
const repo = load('src/data/sessionRepository.js', { './localDatabase': local, '../utils/secureIdentifiers': ids,
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  '../features/cupping/constants/sessionDetails': details });
const activeSource = fs.readFileSync(path.join(root, 'src/features/cupping/screens/ActiveSessionScreen.js'), 'utf8');
const activeAst = require('@babel/parser').parse(activeSource, { sourceType: 'module', plugins: ['jsx'] });
const activeContext = { SCORE_FIELDS: fields, SCORE_LABELS: canonicalFields, calculateCvaScore,
  CVA_EXACT_CALCULATION_POLICY: exactPolicy };
vm.createContext(activeContext);
for (const name of ['getLatestEntry', 'toNumericOrZero', 'calculateCurrentScore', 'buildScoreItems']) {
  const node = activeAst.program.body.find(item => item.type === 'FunctionDeclaration' && item.id.name === name);
  assert.ok(node, name);
  vm.runInContext(activeSource.slice(node.start, node.end), activeContext);
}
const activeIdentity = load('src/features/cupping/screens/activeSessionIdentity.js', { '../constants/sessionDetails': details });
function activeScore(input, policy) {
  return activeContext.calculateCurrentScore({
    scores: fields.map((key, i) => ({ key, score: ratingsForSum(input.sumHi)[i] })),
    defects: { ...input, calculationPolicy: policy }, numberOfCups: input.numberOfCups,
  });
}
for (const input of cases) {
  assert.equal(activeScore(input, exactPolicy), input.expected);
  assert.equal(activeScore(input, null), calculateCvaScore({ ...input, calculationPolicy: null }));
  assert.equal(activeScore(input, 'unknown'), null);
}
async function seed(index, input, policy = null) {
  const sessionId = `round-session-${index}`, sampleId = `round-sample-${index}`;
  await repo.saveSessionWithSamples({ sessionUUID: sessionId, sessionName: 'Rounding fixture',
    cuppingForm: 1, cuppingMode: 'open', sessionDate: '16 Oct 2026',
    samples: [{ id: sampleId, cupUUID: `ROUND-CUP-${index}`, cupNumber: input.numberOfCups,
      cuppingForm: 1, cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Coffee', process: '1' }] });
  pinPrototypeCvaFixture(sqlite, sessionId);
  const ratings = ratingsForSum(input.sumHi);
  for (const [i, field] of fields.entries()) sqlite.prepare(`INSERT INTO sample_feedback_entries
    (id, session_id, sample_id, field_name, is_final, score, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`)
    .run(`rating-${index}-${i}`, sessionId, sampleId, field, ratings[i]);
  sqlite.prepare(`INSERT INTO sample_defect_entries
    (id, session_id, sample_id, is_final, non_uniform_cups, defective_cups, number_of_cups,
     calculation_policy, score_policy, defect_type_masks, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'sca104-three-types-v1', ?, '2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z')`)
    .run(`defects-${index}`, sessionId, sampleId, input.nonUniformCups, input.defectiveCups,
      input.numberOfCups, policy, JSON.stringify({ potato: slots(input.defectiveCups) }));
  return { sessionId, sampleId, defectsEntry: { defects: { potato: true },
    nonUniformCupSlots: slots(input.nonUniformCups), defectCupSlots: { potato: slots(input.defectiveCups) },
    numberOfCups: input.numberOfCups } };
}
async function main() {
  await verifySaveBoundary('handleSave'); await verifySaveBoundary('handleSaveFinalScore');
  for (const [index, input] of cases.entries()) {
    const request = await seed(index, input);
    const status = async () => (await repo.getSessionSampleFinalStatus(request.sessionId))[request.sampleId];
    assert.equal((await status()).finalScore, calculateCvaScore({ ...input, calculationPolicy: null }));
    assert.equal((await repo.getSampleDefects(request.sampleId)).latest.calculationPolicy, null);
    assert.match((await status()).resultLabel, /previous Cup App rounding/);
    const snapshot = sqlite.prepare('SELECT * FROM sample_defect_entries WHERE sample_id = ?').all(request.sampleId);
    failLate = true;
    await assert.rejects(repo.saveCvaAssessmentAtomically({ ...request,
      finalFieldsToReplace: ['Fragrance'], finalFeedback: { Fragrance: { score: 9 } } }), /late failure/);
    failLate = false;
    assert.deepEqual(sqlite.prepare('SELECT * FROM sample_defect_entries WHERE sample_id = ?').all(request.sampleId), snapshot);
    assert.equal((await status()).finalScore, calculateCvaScore({ ...input, calculationPolicy: null }), 'failed adoption preserves old score');
    await repo.saveCvaAssessmentAtomically(request);
    const history = await repo.getSampleDefects(request.sampleId);
    assert.equal(history.final.length, 2); assert.equal(history.final[0].calculationPolicy, null);
    assert.equal(history.latest.calculationPolicy, exactPolicy, 'later append wins despite older timestamp');
    assert.equal((await status()).finalScore, input.expected);
    assert.match((await status()).resultLabel, /Adapted/);
    assert.doesNotMatch((await status()).resultLabel, /previous/);
    const numericStatus = await status();
    const visible = activeIdentity.projectActiveSessionIdentity(
      { sessionName: 'Rounding regression session', sessionType: '3', sessionDate: '16 Oct 2026', cuppingMode: 'blind' },
      [{ id: request.sampleId, coffeeNameOrigin: 'SECRET COFFEE', cuppingMode: 'blind',
        sampleNumber: 1, finalScore: numericStatus.finalScore, currentScore: activeScore(input, exactPolicy),
        resultLabel: numericStatus.resultLabel }]);
    const shared = activeIdentity.buildActiveSessionShareMessage(visible.session, visible.cups);
    assert.match(shared, new RegExp(input.expected.toFixed(2).replace('.', '\\.')));
    assert.match(shared, /Adapted/); assert.doesNotMatch(shared, /SECRET/);
    sqlite.prepare("UPDATE sessions SET status = 'complete' WHERE id = ?").run(request.sessionId);
    await assert.rejects(repo.saveCvaAssessmentAtomically(request), /session is complete/);
  }
  const unknown = await seed('unknown', cases[0], 'future-unknown-rule');
  let unknownStatus = (await repo.getSessionSampleFinalStatus(unknown.sessionId))[unknown.sampleId];
  assert.equal(unknownStatus.finalScore, null); assert.match(unknownStatus.resultLabel, /Unsupported/);
  const unknownShare = activeIdentity.buildActiveSessionShareMessage({}, [{ sampleNumber: 1,
    finalScore: null, currentScore: activeScore(cases[0], 'unknown'), resultLabel: unknownStatus.resultLabel }]);
  assert.match(unknownShare, /—/); assert.match(unknownShare, /Unsupported/);
  await assert.rejects(repo.saveCvaAssessmentAtomically(unknown), /unsupported calculation rule/);
  await assert.rejects(repo.saveSampleDefectsEntry(unknown), /unsupported calculation rule/);
  const historical = await seed('historical', cases[0]);
  sqlite.prepare("UPDATE sessions SET form_hash = 'unsupported' WHERE id = ?").run(historical.sessionId);
  await assert.rejects(repo.saveCvaAssessmentAtomically(historical), /active CVA form version/);
  const other = await seed('other', saved);
  sqlite.prepare("UPDATE sample_defect_entries SET score_policy = NULL, defect_type_masks = '{\"otherBean\":[1]}', potato = 0, other_bean = 1 WHERE sample_id = ?")
    .run(other.sampleId);
  assert.equal((await repo.getSessionSampleFinalStatus(other.sessionId))[other.sampleId].finalScore, 74.75);
  await repo.saveCvaAssessmentAtomically({ ...other, defectsEntry: {
    defects: { otherBean: true }, defectCupSlots: { otherBean: [1] }, numberOfCups: 1 } });
  const otherHistory = await repo.getSampleDefects(other.sampleId);
  assert.equal(otherHistory.final[0].defectiveCups, 1);
  assert.equal(otherHistory.latest.defectiveCups, 0);
  assert.equal(otherHistory.latest.calculationPolicy, exactPolicy);
  assert.equal((await repo.getSessionSampleFinalStatus(other.sessionId))[other.sampleId].finalScore, 94.75);
  const tie = await seed('tie', cases[0]);
  sqlite.prepare(`INSERT INTO sample_feedback_entries
    (id, session_id, sample_id, field_name, is_final, score, created_at, updated_at)
    VALUES ('later-same-time', ?, ?, 'Fragrance', 1, 6, '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`)
    .run(tie.sessionId, tie.sampleId);
  assert.equal((await repo.getSampleFeedback(tie.sampleId)).Fragrance.at(-1).score, 6);
  assert.equal((await repo.getSessionSampleFinalStatus(tie.sessionId))[tie.sampleId].scoresByField.Fragrance, 6);
  const skew = await seed('clock-skew', cases[0]);
  sqlite.prepare("UPDATE sample_feedback_entries SET is_final = 0, score = 2, created_at = '2099-01-01T00:00:00Z' WHERE sample_id = ? AND field_name = 'Fragrance'").run(skew.sampleId);
  await repo.saveCvaAssessmentAtomically({ ...skew,
    finalFeedback: { Fragrance: { score: 9, comments: 'New final score' } } });
  const skewFeedback = await repo.getSampleFeedback(skew.sampleId);
  const skewStatus = (await repo.getSessionSampleFinalStatus(skew.sessionId))[skew.sampleId];
  const skewItems = activeContext.buildScoreItems(skewFeedback, exactPolicy);
  assert.equal(skewFeedback.Fragrance.at(-1).score, 9, 'CVA reopen uses explicit Save append despite older timestamp');
  assert.equal(skewStatus.scoresByField.Fragrance, 9, 'summary selects the same newly saved rating');
  assert.equal(skewItems.find(item => item.key === 'Fragrance').score, 9, 'Active selects same latest append');
  assert.equal(activeContext.calculateCurrentScore({ scores: skewItems,
    defects: (await repo.getSampleDefects(skew.sampleId)).latest }), skewStatus.finalScore);
  // An old timestamp-selected rating must not change merely by opening, nor
  // disappear when another field is saved and adopts append-order arithmetic.
  const untouched = await seed('untouched', cases[0]);
  sqlite.prepare(`INSERT INTO sample_feedback_entries
    (id, session_id, sample_id, field_name, is_final, score, created_at, updated_at)
    VALUES ('older-clock-append', ?, ?, 'Fragrance', 0, 2, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`)
    .run(untouched.sessionId, untouched.sampleId);
  const oldRating = (await repo.getSampleFeedback(untouched.sampleId)).Fragrance.at(-1).score;
  const oldTotal = (await repo.getSessionSampleFinalStatus(untouched.sessionId))[untouched.sampleId].finalScore;
  assert.equal(oldRating, 9, 'historical reopen retains timestamp-selected rating');
  assert.equal(oldTotal, calculateCvaScore({ ...cases[0], calculationPolicy: null }));
  await repo.saveCvaAssessmentAtomically({ ...untouched, finalFeedback: { Aroma: { score: 5 } } });
  const convertedRows = await repo.getSampleFeedback(untouched.sampleId);
  const convertedStatus = (await repo.getSessionSampleFinalStatus(untouched.sessionId))[untouched.sampleId];
  assert.equal(convertedRows.Fragrance.at(-1).score, oldRating, 'untouched historical selection is retained in new append projection');
  assert.equal(convertedStatus.finalScore, cases[0].expected, 'only confirmed arithmetic changes the total');
  assert.equal(activeContext.calculateCurrentScore({ scores: activeContext.buildScoreItems(convertedRows, exactPolicy),
    defects: (await repo.getSampleDefects(untouched.sampleId)).latest }), convertedStatus.finalScore);
  // Simulate the previous schema, then reopen migrations twice. Historical rows
  // receive NULL provenance; every pre-existing cell remains unchanged.
  sqlite.exec('ALTER TABLE sample_defect_entries DROP COLUMN calculation_policy');
  const beforeMigration = sqlite.prepare('SELECT * FROM sample_defect_entries ORDER BY rowid').all();
  for (let repeat = 0; repeat < 2; repeat++) {
    const reopened = load('src/data/localDatabase.js', { 'expo-sqlite': { openDatabaseAsync: async () => bridge } });
    await reopened.getLocalDatabase();
    const afterMigration = sqlite.prepare('SELECT * FROM sample_defect_entries ORDER BY rowid').all()
      .map(row => { assert.equal(row.calculation_policy, null); const { calculation_policy, ...rest } = row; return rest; });
    assert.deepEqual(afterMigration.map(row => ({ ...row })), beforeMigration.map(row => ({ ...row })));
  }
  console.log(`CVA exact and historical parity: ${swept} valid combinations; history, confirmation callbacks, rollback and unsupported provenance passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
