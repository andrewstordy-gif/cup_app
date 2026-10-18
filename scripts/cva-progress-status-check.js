const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const loadProject = require('./helpers/load-project-module');
const { createCvaDraft, RATINGS } = require('../src/features/cupping/data/cvaResponse');
const { pinPrototypeCvaFixture } = require('./helpers/prototype-cva-fixture');

// Actual repository/schema against real SQLite; only the Expo transport and IDs
// are replaced. --expect-regression proves both original failing entry points.
const expectRegression = process.argv.includes('--expect-regression');
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
  async withExclusiveTransactionAsync(callback) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = await callback(bridge); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const identifiers = { generateDomainId: () => `progress-id-${++id}`, generateSessionReference: () => `progress-ref-${++id}` };
function repository() {
  return loadProject(path.resolve(__dirname, '..'), {
    './userProfileRepository': require('./helpers/local-profile-fixture'),
    'expo-sqlite': { openDatabaseAsync: async () => bridge },
    '../utils/secureIdentifiers': identifiers,
    '../../../utils/secureIdentifiers': identifiers,
  })('src/data/sessionRepository.js');
}
const repo = repository();
const status = sessionId => sqlite.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId).status;
const revisions = sessionId => sqlite.prepare('SELECT * FROM cva_response_revisions WHERE session_id = ? ORDER BY sample_id, revision').all(sessionId);
const pins = sessionId => sqlite.prepare('SELECT form_key, form_version, form_hash FROM sessions WHERE id = ?').get(sessionId);
const linkage = sessionId => sqlite.prepare('SELECT id, session_id, cup_uuid, cup_number, cupping_form, cupping_mode FROM samples WHERE session_id = ? ORDER BY id').all(sessionId);
async function fixture(name, n, form = 1, withSample = true) {
  const sessionId = `progress-${name}`;
  const sampleId = `sample-${name}`;
  await repo.saveSessionWithSamples({ sessionUUID: sessionId, sessionName: 'Progress test', sessionDate: '16 Oct 2026',
    sessionType: 'Training Session', samplesInSession: withSample ? 1 : 0, cuppingForm: form, cuppingMode: 'open',
    samples: withSample ? [{ id: sampleId, cupUUID: `CUP-${name}`, cupNumber: n, cuppingForm: form,
      cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Test coffee', process: '1' }] : [] });
  return { sessionId, sampleId, n, form, cupUUID: `CUP-${name}` };
}
async function detailsSave(f) {
  const current = await repo.getSessionById(f.sessionId);
  return repo.saveSessionWithSamples({ sessionUUID: f.sessionId, existingSessionId: f.sessionId,
    sessionName: current.sessionName, sessionDate: current.sessionDate, sessionType: current.sessionType,
    samplesInSession: current.samplesInSession,
    cuppingForm: f.form, cuppingMode: 'open', samples: current.samples });
}
async function scan(f) {
  return repo.resolveActiveSampleFromCupMetadata({ cupUUID: f.cupUUID, metadata: {
    u: f.sessionId, f: f.form, m: 'o', y: f.n, n: 'Test coffee', p: '1', z: 1,
    e: 'Progress test', t: 4, d: 261016, i: 1,
  } });
}
async function save(f, response) {
  const current = await repo.getCvaResponse(f.sessionId, f.sampleId);
  return repo.saveCvaResponse({ sessionId: f.sessionId, sampleId: f.sampleId, response,
    expectedRevision: current.revision, expectedIdentity: current.trusted.identity, expectedCupCount: f.n });
}
const final = n => ({ ...createCvaDraft(n), non_uniform_cups: [],
  ratings: Object.fromEntries(Object.values(RATINGS).map(key => [key, 7])),
  general_affective_notes: 'Silky caramel', affective_notes: { fragrance_aroma: 'Apple' } });
async function exercise(f, expected = 'in_progress') {
  const before = { revisions: revisions(f.sessionId), pins: pins(f.sessionId), linkage: linkage(f.sessionId) };
  for (const [name, action] of [['Details Save', () => detailsSave(f)], ['repeat scan', () => scan(f)],
    ['direct recomputation', () => repo.recomputeSessionProgressStatus(f.sessionId)],
    ['fresh repository reopen', () => repository().getSessionById(f.sessionId)]]) {
    if (['in_progress', 'complete'].includes(expected) && name === 'Details Save') {
      await assert.rejects(action(), /setup_started/);
    } else {
      await action();
    }
    assert.equal(status(f.sessionId), expected, `${name}: ${f.sessionId}`);
    assert.deepEqual(revisions(f.sessionId), before.revisions, `${name} changed persisted response bytes/result/provenance`);
    assert.deepEqual(pins(f.sessionId), before.pins, `${name} changed pin`);
    assert.deepEqual(linkage(f.sessionId), before.linkage, `${name} changed linkage`);
  }
}
async function main() {
  if (expectRegression) {
    for (const [name, action] of [['Details Save', detailsSave], ['repeat scan', scan]]) {
      const f = await fixture(name.replaceAll(' ', '-'), 1);
      await save(f, createCvaDraft(1));
      assert.equal(status(f.sessionId), 'in_progress');
      const before = revisions(f.sessionId);
      await action(f);
      assert.equal(status(f.sessionId), 'pending', `${name} no longer reproduces the original regression`);
      assert.deepEqual(revisions(f.sessionId), before);
      console.log(`Reproduced before fix: ${name} changes in_progress to pending with saved draft intact.`);
    }
    return;
  }
  const empty = await fixture('empty', 1, 1, false);
  assert.equal(status(empty.sessionId), 'new');
  await detailsSave(empty);
  assert.equal(await repo.recomputeSessionProgressStatus(empty.sessionId), 'new');
  const untouched = await fixture('untouched', 5);
  await exercise(untouched, 'pending');
  for (const n of [1, 5, 8]) {
    const f = await fixture(`canonical-${n}`, n);
    await save(f, { ...createCvaDraft(n), general_affective_notes: 'Draft observation' });
    await exercise(f);
    await assert.rejects(repo.manuallyMarkSessionComplete(f.sessionId), /incomplete_session/);
    await save(f, final(n));
    await exercise(f); // Final readiness is not Session completion.
    await save(f, { ...final(n), ratings: { ...final(n).ratings, overall: null } });
    await exercise(f); // Latest draft supersedes final without losing started state.
    const latest = await repo.getCvaResponse(f.sessionId, f.sampleId);
    assert.equal(latest.revision, 3);
    assert.equal(latest.complete, false);
    assert.equal(latest.result, null);
    assert.equal(status(untouched.sessionId), 'pending', 'another Session must remain isolated');
    assert.equal(revisions(untouched.sessionId).length, 0);
    assert.equal(status(empty.sessionId), 'new');
    await save(f, final(n));
    await repo.manuallyMarkSessionComplete(f.sessionId);
    await exercise(f, 'complete');
  }
  const prototype = await fixture('prototype', 5);
  pinPrototypeCvaFixture(sqlite, prototype.sessionId);
  await repo.saveCvaAssessmentAtomically({ sessionId: prototype.sessionId, sampleId: prototype.sampleId,
    feedback: { Fragrance: { score: 7, comments: 'Original note' } }, defectsEntry: { numberOfCups: 5 } });
  const originalFeedback = sqlite.prepare('SELECT * FROM sample_feedback_entries WHERE session_id = ?').all(prototype.sessionId);
  await exercise(prototype);
  assert.deepEqual(sqlite.prepare('SELECT * FROM sample_feedback_entries WHERE session_id = ?').all(prototype.sessionId), originalFeedback);
  const legacy = await fixture('legacy', 5, 2);
  const saved = await repo.saveLegacyResponse({ sessionId: legacy.sessionId, sampleId: legacy.sampleId,
    response: { quality_ratings: { fragrance_aroma: 28 } } });
  assert.equal(saved.ok, true);
  const originalLegacy = sqlite.prepare('SELECT * FROM legacy_responses WHERE session_id = ?').all(legacy.sessionId);
  await exercise(legacy);
  assert.deepEqual(sqlite.prepare('SELECT * FROM legacy_responses WHERE session_id = ?').all(legacy.sessionId), originalLegacy);
  console.log('CVA progress status checks passed: actual Details Save/scan/reopen, 1/5/8 drafts/finals/supersession, explicit closure, isolation, unchanged bytes/pins/results, prototype and Legacy.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
