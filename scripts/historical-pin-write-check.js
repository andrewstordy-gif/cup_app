#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
let writeCount = 0;
let nextId = 0;
const bridge = {
  async execAsync(sql) { sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) { writeCount += 1; return sqlite.prepare(sql).run(...args); },
  async withTransactionAsync(callback) {
    sqlite.exec('BEGIN');
    try { const value = await callback(); sqlite.exec('COMMIT'); return value; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  async withExclusiveTransactionAsync(callback) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { await callback(bridge); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(mocks, request) ? mocks[request] : original.call(this, request, parent, isMain);
  };
  try { mod._compile(code, filename); } finally { Module._load = original; }
  return mod.exports;
}

const identifiers = { generateDomainId: () => `test-id-${++nextId}` };
const details = load('src/features/cupping/constants/sessionDetails.js', {
  '../../../utils/secureIdentifiers': identifiers,
});
const local = load('src/data/localDatabase.js', { 'expo-sqlite': { openDatabaseAsync: async () => bridge } });
const repo = load('src/data/sessionRepository.js', {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  './localDatabase': local,
  '../utils/secureIdentifiers': identifiers,
  '../features/cupping/constants/sessionDetails': details,
});
const historical = {
  form_key: 'sca_cva_affective_104_2024',
  form_version: '1.0.0',
  form_hash: '0a840b335b4af50d18db3cf210d503b870285c1706710ff803e7633103ad310d',
};
const sessionId = 'historical-cva-session';
const sampleId = 'historical-cva-sample';
const cupUUID = 'CUP-HISTORICAL';
const savedSample = {
  id: sampleId, cupUUID, cupNumber: 1, cuppingForm: 1,
  cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Original coffee', process: '1',
};
function snapshot() {
  return {
    session: sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId),
    sample: sqlite.prepare('SELECT * FROM samples WHERE id = ?').get(sampleId),
    responses: sqlite.prepare('SELECT * FROM sample_feedback_entries WHERE sample_id = ? ORDER BY id').all(sampleId),
    observations: sqlite.prepare('SELECT * FROM sample_flavour_observations WHERE sample_id = ? ORDER BY id').all(sampleId),
    defects: sqlite.prepare('SELECT * FROM sample_defect_entries WHERE sample_id = ?').all(sampleId),
  };
}

async function main() {
  await repo.saveSessionWithSamples({ sessionUUID: sessionId, cuppingForm: 1,
    sessionName: 'Historical CVA', sessionDate: '13 Oct 2026', samples: [savedSample] });
  require('./helpers/prototype-cva-fixture').pinPrototypeCvaFixture(sqlite, sessionId);
  await repo.saveSampleDefectsEntry({ sessionId, sampleId, defects: { moldy: true },
    defectCupSlots: { moldy: [1] }, defectiveCupSlots: [1],
    defectDescription: 'Existing successor description', numberOfCups: 1 });
  await repo.saveSampleFlavourObservations({ sessionId, sampleId, observations: [{
    keyword: 'peach', label: 'Peach', sourceField: 'Fragrance', colour: '#abcdef',
  }] });
  sqlite.prepare(`INSERT INTO sample_feedback_entries
    (id, session_id, sample_id, field_name, is_final, score, comments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'saved-response', sessionId, sampleId, 'Fragrance', 1, 8, 'original response bytes',
      '2026-10-13T10:00:00.000Z', '2026-10-13T10:00:00.000Z'
    );
  sqlite.prepare('UPDATE sessions SET form_key = ?, form_version = ?, form_hash = ? WHERE id = ?').run(
    historical.form_key, historical.form_version, historical.form_hash, sessionId
  );
  const original = snapshot();
  const { isPinnedCva } = require('../src/features/forms/sessionFormRoute');
  assert.equal(isPinnedCva(await repo.getSessionById(sessionId)), true, 'historical pin stays readable');

  let before = writeCount;
  await assert.rejects(repo.saveSessionWithSamples({ sessionUUID: sessionId, existingSessionId: sessionId,
    cuppingForm: 1, sessionName: 'Renamed coffee', sessionDate: '13 Oct 2026',
    samples: [{ ...savedSample, coffeeNameOrigin: 'Changed coffee' }] }), /historical form version is read-only|setup_started/);
  assert.equal(writeCount, before, 'session edit rejects before any database write');
  assert.deepEqual(snapshot(), original, 'session edit cannot alter pin, sample or response bytes');

  before = writeCount;
  await assert.rejects(repo.upsertSessionFromCupMetadata({ sessionUUID: sessionId,
    cuppingForm: 1, sessionName: 'Imported replacement', sessionDate: '14 Oct 2026' }),
    /read-only historical form version/);
  assert.equal(writeCount, before, 'NFC metadata upsert rejects before any database write');
  assert.deepEqual(snapshot(), original, 'NFC rescan cannot alter pin or response bytes');

  before = writeCount;
  await assert.rejects(repo.saveSampleDefectsEntry({ sessionId, sampleId,
    defectDescription: 'New unsupported description', numberOfCups: 1 }),
    /not linked to the active CVA form version/);
  assert.equal(writeCount, before, 'historical side-table insert rejects before any write');
  assert.deepEqual(snapshot(), original, 'historical side-table row and response bytes remain unchanged');

  await assert.rejects(repo.saveSampleDefectsEntry({ sessionId, sampleId: 'missing-sample',
    defectDescription: 'Wrong sample', numberOfCups: 1 }), /not linked to the active CVA form version/);
  assert.deepEqual(snapshot(), original, 'a missing or mismatched sample cannot receive a side-table row');

  const writerCases = [
    ['feedback save', () => repo.saveSampleFeedbackBatch({ sessionId, sampleId,
      feedback: { Fragrance: { score: 9, comments: 'changed' } } })],
    ['final feedback save', () => repo.saveSampleFeedbackBatch({ sessionId, sampleId,
      feedback: { Fragrance: { score: 9, comments: 'changed' } }, isFinal: true })],
    ['feedback clear', () => repo.clearSampleFeedbackFields({ sampleId, fields: ['Fragrance'] })],
    ['final feedback clear', () => repo.clearSampleFinalFeedbackFields({ sampleId, fields: ['Fragrance'] })],
    ['flavour save', () => repo.saveSampleFlavourObservations({ sessionId, sampleId,
      observations: [{ keyword: 'apple', label: 'Apple', sourceField: 'Fragrance' }] })],
    ['flavour prune', () => repo.pruneSampleFlavourObservations({ sampleId,
      pruneGroups: [{ includeSourceFields: ['Fragrance'], keepKeywords: [] }] })],
    ['sample metadata upsert', () => repo.upsertSessionSampleFromCupMetadata({ sessionId, cupUUID,
      cupNumber: 1, cuppingForm: 1, cuppingMode: 'open', coffeeNameOrigin: 'Changed coffee', process: '1' })],
    ['sample delete', () => repo.deleteSampleFromSession(sampleId)],
  ];
  for (const [name, operation] of writerCases) {
    before = writeCount;
    await assert.rejects(operation(), /read-only|not linked to the active CVA form version|setup_started/, name);
    assert.equal(writeCount, before, `${name} rejects before any repository write`);
    assert.deepEqual(snapshot(), original, `${name} preserves the historical aggregate`);
  }
  before = writeCount;
  await assert.rejects(repo.saveCvaAssessmentAtomically({ sessionId, sampleId,
    emptyFieldsToClear: ['Fragrance'],
    defectsEntry: { defects: {}, numberOfCups: 1 },
  }), /not linked to the active CVA form version/);
  assert.equal(writeCount, before, 'atomic CVA Save rejects a historical pin before any write');
  assert.deepEqual(snapshot(), original, 'atomic CVA Save preserves historical assessment bytes');

  const otherSessionId = 'active-other-session';
  const otherSampleId = 'active-other-sample';
  await repo.saveSessionWithSamples({ sessionUUID: otherSessionId, cuppingForm: 1,
    sessionName: 'Active CVA', sessionDate: '13 Oct 2026', samples: [{ ...savedSample,
      id: otherSampleId, cupUUID: 'CUP-ACTIVE', coffeeNameOrigin: 'Active coffee' }] });
  require('./helpers/prototype-cva-fixture').pinPrototypeCvaFixture(sqlite, otherSessionId);
  await assert.rejects(repo.saveSampleDefectsEntry({ sessionId: otherSessionId,
    sampleId, defectDescription: 'Cross-session', numberOfCups: 1 }),
    /not linked to the active CVA form version/);
  await assert.rejects(repo.saveSampleFeedbackBatch({ sessionId: otherSessionId,
    sampleId, feedback: { Fragrance: { score: 9 } } }),
    /not linked to the active CVA form version/);
  assert.deepEqual(snapshot(), original, 'active session ID cannot be paired with another session’s sample');
  await repo.saveSampleFeedbackBatch({ sessionId: otherSessionId, sampleId: otherSampleId,
    feedback: { Fragrance: { score: 8, comments: 'active write' } } });
  await repo.clearSampleFeedbackFields({ sampleId: otherSampleId, fields: ['Fragrance'] });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sample_feedback_entries WHERE sample_id = ?')
    .get(otherSampleId).count, 0, 'active CVA feedback save and clear remain functional');

  const cvaUi = fs.readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
  assert.match(cvaUi, /HISTORICAL_CVA_MESSAGE.*read-only/);
  assert.match(cvaUi, /const isFieldEnabled = \(field\) => isFormWritable/);
  assert.match(cvaUi, /disabled=\{!isFormWritable \|\| \(isFinalMode && isFinalSaved\)\}/);
  assert.match(cvaUi, /await saveCvaAssessmentAtomically\(\{/,
    'CVA explicit Save uses the transaction-guarded repository operation');
  console.log('Historical CVA session, NFC rescan, and defect side-table write guards passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
