#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const { pinPrototypeCvaFixture } = require('./helpers/prototype-cva-fixture');
const sqlite = new DatabaseSync(':memory:');
let nextId = 0;
let failOnDefect = false;
const bridge = {
  async execAsync(sql) { sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) {
    if (failOnDefect && sql.includes('INSERT INTO sample_defect_entries')) {
      throw new Error('injected late defect write failure');
    }
    return sqlite.prepare(sql).run(...args);
  },
  async withTransactionAsync(callback) {
    sqlite.exec('BEGIN');
    try { const result = await callback(); sqlite.exec('COMMIT'); return result; }
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
const identifiers = {
  generateDomainId: () => `test-id-${++nextId}`,
  generateSessionReference: () => 'session-atomic-test',
};
const details = load('src/features/cupping/constants/sessionDetails.js', {
  '../../../utils/secureIdentifiers': identifiers,
});
const cvaDefectPolicy = load('src/features/cupping/data/cvaDefectPolicy.js');
assert.deepEqual(cvaDefectPolicy.getCvaScoredDefectSlots({ otherBean: [1] }, 1), [],
  'one-cup Other-only observation has no scored defect');
assert.deepEqual(cvaDefectPolicy.getCvaScoredDefectSlots({ otherBean: [1, 2], potato: [1], moldy: [1], phenolic: [1] }, 5), [1],
  'five-cup mixed classification deduplicates scored cup one');
assert.equal(cvaDefectPolicy.resolveCvaDefectiveCupCount({ scoredSlots: [], savedPolicy: null, hasSavedEntry: true, savedCount: 1 }), 1,
  'merely reopening an old Other-only row retains its stored deduction');
assert.equal(cvaDefectPolicy.resolveCvaDefectiveCupCount({ scoredSlots: [], savedPolicy: null, hasSavedEntry: true,
  savedCount: 1, hasUnsavedChanges: true }), 0,
  'any deliberate edit, including rating-only edits, previews the corrected rule');
const local = load('src/data/localDatabase.js', {
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
});
const repo = load('src/data/sessionRepository.js', {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  './localDatabase': local,
  '../utils/secureIdentifiers': identifiers,
  '../features/cupping/constants/sessionDetails': details,
});
const screen = fs.readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
assert.equal((screen.match(/await saveCvaAssessmentAtomically\(\{/g) || []).length, 2,
  'both normal and final-mode CVA Save use the atomic repository operation');
assert.ok(screen.indexOf('await saveCvaAssessmentAtomically({') < screen.indexOf('setSavedFeedback(nextSavedFeedback)'),
  'normal Save acknowledges saved feedback only after the transaction resolves');
const sampleId = 'sample-atomic';
const sessionId = 'session-atomic';
const common = {
  sessionId, sampleId, tempSnapshot: '', timeSnapshot: '',
  defectsEntry: { defects: { otherBean: true }, defectiveCupSlots: [1],
    defectCupSlots: { otherBean: [1] }, numberOfCups: 1, defectDescription: 'petrol' },
};
const count = (table) => Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE sample_id = ?`).get(sampleId).count);
async function main() {
  await repo.saveSessionWithSamples({ sessionUUID: sessionId, cuppingForm: 1, cuppingMode: 'open',
    sessionName: 'Atomic CVA', sessionDate: '14 Oct 2026',
    samples: [{ id: sampleId, cupUUID: 'CUP-ATOMIC', cupNumber: 1, cuppingForm: 1,
      cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Coffee', process: '1' }] });

  pinPrototypeCvaFixture(sqlite, sessionId);
  await repo.saveCvaAssessmentAtomically({ ...common,
    feedback: { Fragrance: { score: 8, comments: 'apple' } },
    finalFeedback: { Fragrance: { score: 8, comments: 'apple' } },
    observations: [{ keyword: 'apple', label: 'apple', sourceField: 'Fragrance' }],
  });
  assert.equal(count('sample_feedback_entries'), 2);
  assert.equal(count('sample_flavour_observations'), 1);
  assert.equal(count('sample_defect_entries'), 1);
  assert.deepEqual(
    { ...sqlite.prepare('SELECT defective_cups, defective_mask, score_policy, defect_description FROM sample_defect_entries WHERE sample_id = ?').get(sampleId) },
    { defective_cups: 0, defective_mask: '[]', score_policy: 'sca104-three-types-v1', defect_description: 'petrol' },
    'Other remains described but carries no CVA deduction');
  assert.equal((await repo.getSessionById(sessionId)).status, 'in_progress');
  await assert.rejects(repo.saveCvaAssessmentAtomically({ ...common, sessionId: 'wrong-session' }),
    /not linked to the active CVA form version/);
  assert.equal(count('sample_defect_entries'), 1, 'a cross-session request cannot add a defect row');
  sqlite.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('complete', sessionId);
  await assert.rejects(repo.saveCvaAssessmentAtomically(common), /session is complete/);
  assert.equal(count('sample_defect_entries'), 1, 'a completed session remains read-only inside the transaction');
  sqlite.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('in_progress', sessionId);

  const before = ['sample_feedback_entries', 'sample_flavour_observations', 'sample_defect_entries']
    .map((table) => sqlite.prepare(`SELECT * FROM ${table} WHERE sample_id = ? ORDER BY id`).all(sampleId));
  const beforeStatus = sqlite.prepare('SELECT status, updated_at FROM sessions WHERE id = ?').get(sessionId);
  failOnDefect = true;
  await assert.rejects(repo.saveCvaAssessmentAtomically({ ...common,
    emptyFieldsToClear: ['Fragrance'], finalFieldsToReplace: ['Fragrance'],
    feedback: { Flavour: { score: 9, comments: 'jasmine' } },
    finalFeedback: { Flavour: { score: 9, comments: 'jasmine' } },
    pruneGroups: [{ includeSourceFields: ['Fragrance'], keepKeywords: [] }],
    observations: [{ keyword: 'jasmine', label: 'jasmine', sourceField: 'Flavour' }],
  }), /injected late defect write failure/);
  failOnDefect = false;
  const after = ['sample_feedback_entries', 'sample_flavour_observations', 'sample_defect_entries']
    .map((table) => sqlite.prepare(`SELECT * FROM ${table} WHERE sample_id = ? ORDER BY id`).all(sampleId));
  assert.deepEqual(after, before, 'a late failure rolls back clears, feedback, prune, and observations');
  assert.deepEqual(sqlite.prepare('SELECT status, updated_at FROM sessions WHERE id = ?').get(sessionId), beforeStatus);

  await repo.saveCvaAssessmentAtomically({ ...common,
    emptyFieldsToClear: ['Fragrance'], finalFieldsToReplace: ['Fragrance'],
    feedback: { Flavour: { score: 9, comments: 'jasmine' } },
    finalFeedback: { Flavour: { score: 9, comments: 'jasmine' } },
    pruneGroups: [{ includeSourceFields: ['Fragrance'], keepKeywords: [] }],
    observations: [{ keyword: 'jasmine', label: 'jasmine', sourceField: 'Flavour' }],
  });
  assert.deepEqual(sqlite.prepare('SELECT field_name, is_final FROM sample_feedback_entries WHERE sample_id = ? ORDER BY is_final').all(sampleId).map((row) => ({ ...row })),
    [{ field_name: 'Flavour', is_final: 0 }, { field_name: 'Flavour', is_final: 1 }]);
  assert.deepEqual(sqlite.prepare('SELECT keyword FROM sample_flavour_observations WHERE sample_id = ?').all(sampleId).map((row) => ({ ...row })), [{ keyword: 'jasmine' }]);
  assert.equal(count('sample_defect_entries'), 2);

  await repo.saveCvaAssessmentAtomically({ ...common, defectsEntry: {
    ...common.defectsEntry, numberOfCups: 5, defectiveCups: 2, defectiveCupSlots: [1, 2],
    defects: { otherBean: true, potato: true, phenolic: true, moldy: true },
    defectCupSlots: { otherBean: [1, 2], potato: [1], phenolic: [1], moldy: [1] },
  } });
  let latestDefect = (await repo.getSampleDefects(sampleId)).final.at(-1);
  assert.equal(latestDefect.defectiveCups, 1, 'three scored types on the same cup deduct once');
  assert.deepEqual(latestDefect.defectiveCupSlots, [1]);
  assert.deepEqual(latestDefect.defectCupSlots.otherBean, [1, 2]);
  assert.equal(latestDefect.scorePolicy, 'sca104-three-types-v1');
  await repo.saveCvaAssessmentAtomically({ ...common, defectsEntry: {
    ...common.defectsEntry, numberOfCups: 5, defectiveCups: 2, defectiveCupSlots: [1, 2],
    defects: { otherBean: true }, defectCupSlots: { otherBean: [1, 2] },
  } });
  latestDefect = (await repo.getSampleDefects(sampleId)).final.at(-1);
  assert.equal(latestDefect.defectiveCups, 0, 'removing the sole scored type removes the deduction');
  assert.deepEqual(latestDefect.defectCupSlots.otherBean, [1, 2]);

  sqlite.prepare(`INSERT INTO sample_defect_entries
    (id, session_id, sample_id, is_final, defective_cups, defective_mask, defect_type_masks,
     defect_description, number_of_cups, created_at, updated_at)
    VALUES (?, ?, ?, 1, 1, '[1]', '{"otherBean":[1]}', 'old petrol note', 1, ?, ?)`)
    .run('historical-other', sessionId, sampleId, '2099-10-14T00:00:00.000Z', '2099-10-14T00:00:00.000Z');
  const historical = (await repo.getSampleDefects(sampleId)).final.at(-1);
  assert.equal(historical.scorePolicy, null, 'existing rows remain identified by null provenance');
  assert.equal(historical.defectiveCups, 1, 'old deduction remains stored, not migrated on read');
  assert.deepEqual(historical.defectiveCupSlots, [1]);
  assert.equal(historical.defectDescription, 'old petrol note');

  const chronologySession = 'session-defect-chronology';
  const chronologySample = 'sample-defect-chronology';
  await repo.saveSessionWithSamples({ sessionUUID: chronologySession, cuppingForm: 1, cuppingMode: 'open',
    sessionName: 'Defect chronology', sessionDate: '14 Oct 2026',
    samples: [{ id: chronologySample, cupUUID: 'CUP-CHRONOLOGY', cupNumber: 1, cuppingForm: 1,
      cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Coffee', process: '1' }] });
  pinPrototypeCvaFixture(sqlite, chronologySession);
  for (const [index, field] of ['Fragrance', 'Aroma', 'Flavour', 'Aftertaste', 'Acidity', 'Sweetness', 'Mouthfeel', 'Overall'].entries()) {
    sqlite.prepare(`INSERT INTO sample_feedback_entries
      (id, session_id, sample_id, field_name, is_final, score, comments, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 8, '', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`)
      .run(`historical-feedback-${index}`, chronologySession, chronologySample, field);
  }
  sqlite.prepare(`INSERT INTO sample_defect_entries
    (id, session_id, sample_id, is_final, other_bean, defective_cups, defective_mask, defect_type_masks,
     defect_description, number_of_cups, created_at, updated_at)
    VALUES (?, ?, ?, 0, 1, 1, '[1]', '{"otherBean":[1]}', 'petrol', 1,
            '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')`)
    .run('old-nonfinal-other', chronologySession, chronologySample);
  let chronology = await repo.getSampleDefects(chronologySample);
  assert.equal(chronology.latest.scorePolicy, null);
  assert.equal(chronology.latest.defectiveCups, 1);
  assert.equal((await repo.getSessionSampleFinalStatus(chronologySession))[chronologySample].finalScore, 74.75);
  await repo.saveCvaAssessmentAtomically({ sessionId: chronologySession, sampleId: chronologySample,
    defectsEntry: { defects: { otherBean: true }, defectCupSlots: { otherBean: [1] },
      defectiveCupSlots: [1], defectDescription: 'petrol', numberOfCups: 1 } });
  chronology = await repo.getSampleDefects(chronologySample);
  assert.equal(chronology.nonFinal.length, 1, 'the previous observation remains in history');
  assert.equal(chronology.final.length, 1, 'corrected Save appends a final row');
  assert.equal(chronology.latest.scorePolicy, 'sca104-three-types-v1',
    'CVA form and Session Details can select the same latest row across final/non-final');
  assert.equal(chronology.latest.defectiveCups, 0);
  assert.deepEqual(chronology.latest.defectCupSlots.otherBean, [1]);
  assert.equal((await repo.getSessionSampleFinalStatus(chronologySession))[chronologySample].finalScore, 94.75,
    'Session Details summary uses the corrected latest score');
  console.log('CVA explicit Save success and late-failure SQLite rollback passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
