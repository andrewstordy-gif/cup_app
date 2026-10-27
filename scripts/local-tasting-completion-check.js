const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const projectLoader = require('./helpers/load-project-module');
const { createCvaDraft, RATINGS } = require('../src/features/cupping/data/cvaResponse');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cup-local-tasting-'));
const filename = path.join(dir, 'test.db');
let sqlite = new DatabaseSync(filename), inTxn = false, tail = Promise.resolve(), failure = null, serial = 0, queryHook = null;
const storage = new Map();
const actorA = '11111111-1111-4111-8111-111111111111', actorB = '22222222-2222-4222-8222-222222222222';
const key = 'cup_app:user_profile';
const setActor = actor => storage.set(key, JSON.stringify({ uuid: actor, name: 'Taster' }));
setActor(actorA);
const handle = outer => ({
  async getFirstAsync(sql, args = []) {
    if (outer) assert.equal(inTxn, false);
    if (queryHook && queryHook(sql)) queryHook = null;
    return sqlite.prepare(sql).get(...args) || null;
  },
  async getAllAsync(sql, args = []) { if (outer) assert.equal(inTxn, false); return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) {
    if (outer) assert.equal(inTxn, false);
    const result = sqlite.prepare(sql).run(...args);
    if (failure && sql.includes(failure)) throw Error('injected late failure');
    return result;
  },
});
const bridge = { ...handle(true), async execAsync(sql) { assert.equal(inTxn, false); sqlite.exec(sql); },
  withExclusiveTransactionAsync(callback) {
    const pending = tail.then(async () => {
      sqlite.exec('BEGIN IMMEDIATE'); inTxn = true;
      try { const result = await callback(handle(false)); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; } finally { inTxn = false; }
    }); tail = pending.catch(() => {}); return pending;
  },
};
const mocks = {
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
  '@react-native-async-storage/async-storage': { async getItem(k) { return storage.get(k) ?? null; }, async setItem(k, v) { storage.set(k, v); } },
  '../utils/secureIdentifiers': { generateDomainId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++serial).padStart(12, '0')}` },
};
const reload = () => projectLoader(path.resolve(__dirname, '..'), mocks)('src/data/sessionRepository.js');
let repo = reload();
const sample = (id, form = 1, mode = 'blind') => ({ id, cupUUID: `TAG-${id}`, cupNumber: 1,
  cuppingForm: form, cuppingMode: mode, sampleNumber: 1, coffeeNameOrigin: 'Secret Ethiopia', process: '1' });
async function fixture(id, form = 1, mode = 'blind') {
  await repo.saveSessionWithSamples({ sessionUUID: id, sessionName: 'Visible session name', sessionType: 'Training Session',
    sessionDate: '18 Oct 2026', cuppingForm: form, cuppingMode: mode, samples: [sample(`${id}-sample`, form, mode)] });
  return `${id}-sample`;
}
const response = () => ({ ...createCvaDraft(1), ratings: Object.fromEntries(Object.values(RATINGS).map(key => [key, 7])) });
async function save(id, sampleId, value = response()) {
  const loaded = await repo.getCvaResponse(id, sampleId);
  return repo.saveCvaResponse({ sessionId: id, sampleId, response: value, expectedRevision: loaded.revision,
    expectedIdentity: loaded.trusted.identity, expectedCupCount: loaded.n });
}
async function complete(id) {
  const presentation = await repo.getLocalTastingPresentation(id);
  return repo.completeLocalTasting(id, { expectedContextToken: presentation.tasting.contextToken });
}

(async () => {
  const sampleId = await fixture('blind');
  assert.equal((await repo.getLocalTastingPresentation('blind', { purpose: 'setup' })).identityHidden, false);
  assert.equal((await repo.getLocalTastingPresentation('blind')).identityHidden, true);
  const partial = createCvaDraft(1); partial.ratings.fragrance = 7;
  await save('blind', sampleId, partial);
  assert.equal((await repo.getLocalTastingPresentation('blind', { purpose: 'setup' })).identityHidden, true);
  assert.equal((await complete('blind')).status, 'incomplete');
  await assert.rejects(repo.saveSessionWithSamples({ sessionUUID: 'blind', existingSessionId: 'blind', sessionName: 'Changed',
    cuppingForm: 1, samples: [sample(sampleId)] }), /setup_started/);
  await assert.rejects(repo.deleteSampleFromSession(sampleId), /setup_started/);
  await save('blind', sampleId);
  const before = sqlite.prepare('SELECT * FROM cva_response_revisions').all();
  failure = 'INSERT INTO local_tasting_completion_events';
  await assert.rejects(complete('blind'), /injected/); failure = null;
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM local_tasting_completions').get().n, 0);
  assert.deepEqual(sqlite.prepare('SELECT * FROM cva_response_revisions').all(), before);
  const done = await complete('blind'); assert.equal(done.status, 'complete');
  assert.equal((await repo.getSessionById('blind')).status, 'in_progress');
  assert.equal((await repo.getLocalTastingPresentation('blind')).identityHidden, false);
  assert.equal((await repo.getCvaResponse('blind', sampleId)).identity.visible, true);
  await save('blind', sampleId, partial);
  assert.equal((await repo.getLocalTastingPresentation('blind')).identityHidden, true, 'changed Save re-hides');
  assert.equal((await complete('blind')).status, 'incomplete');
  await save('blind', sampleId);
  const redone = await complete('blind');
  assert.equal(sqlite.prepare('SELECT completed_at FROM local_tasting_completions WHERE session_id=?').get('blind').completed_at, done.tasting.completedAt);
  setActor(actorB);
  assert.equal((await repo.getLocalTastingPresentation('blind')).identityHidden, true);
  assert.equal((await repo.getCvaResponse('blind', sampleId)).access.state, 'foreign');
  await assert.rejects(save('blind', sampleId), /foreign_stream/);
  assert.equal((await complete('blind')).status, 'incomplete');
  await assert.rejects(repo.completeLocalTasting('blind', { expectedContextToken: done.tasting.contextToken }), /stale_context/);
  setActor(actorA);
  // Actual file-backed database close plus fresh module migration/profile load.
  sqlite.close(); sqlite = new DatabaseSync(filename); repo = reload();
  assert.equal((await repo.getLocalTastingPresentation('blind')).identityHidden, false);
  assert.equal((await complete('blind')).tasting.completedAt, redone.tasting.completedAt);
  storage.set(key, '{broken');
  assert.equal((await repo.getLocalTastingPresentation('blind')).identityHidden, true);
  setActor(actorA);

  const old = await fixture('old'); await save('old', old, partial);
  sqlite.prepare('DELETE FROM local_response_streams WHERE session_id = ?').run('old');
  // Simulate a pre-foundation unversioned source, not corruption of a tracked aggregate.
  sqlite.prepare('DELETE FROM local_tasting_revisions WHERE session_id = ?').run('old');
  const original = sqlite.prepare('SELECT * FROM cva_response_revisions WHERE session_id = ?').get('old');
  const reviewed = await repo.getCvaResponse('old', old);
  assert.equal(reviewed.access.state, 'unattributed'); assert.equal(reviewed.access.canAdopt, true);
  await assert.rejects(save('old', old), /review_required/);
  setActor(actorB);
  await assert.rejects(repo.adoptSavedTasting({ sessionId: 'old', sampleId: old, expectedSourceToken: reviewed.access.sourceToken }), /stale_review/);
  setActor(actorA);
  failure = 'INSERT INTO local_tasting_revisions';
  await assert.rejects(repo.adoptSavedTasting({ sessionId: 'old', sampleId: old, expectedSourceToken: reviewed.access.sourceToken }), /injected/);
  failure = null;
  assert.equal((await repo.getCvaResponse('old', old)).access.state, 'unattributed');
  assert.equal((await repo.getCvaResponse('old', old)).revision, 1);
  const adopted = await repo.adoptSavedTasting({ sessionId: 'old', sampleId: old, expectedSourceToken: reviewed.access.sourceToken });
  assert.equal(adopted.revision, 2); assert.equal(adopted.access.state, 'mine');
  assert.deepEqual(adopted.response, partial); assert.equal(adopted.tasting.revealed, false);
  assert.deepEqual(sqlite.prepare('SELECT * FROM cva_response_revisions WHERE id = ?').get(original.id), original);
  await save('old', old);
  const duplicate = await repo.adoptSavedTasting({ sessionId: 'old', sampleId: old, expectedSourceToken: reviewed.access.sourceToken });
  assert.equal(duplicate.revision, 3); assert.deepEqual(duplicate.response, response());
  await complete('old');
  // A newly discovered participant-local sample does not inherit an assessment.
  sqlite.prepare('UPDATE sessions SET local_creator_profile_id = NULL WHERE id = ?').run('old');
  const later = await repo.upsertSessionSampleFromCupMetadata({ sessionId:'old',cupUUID:'LATER',cupNumber:1,
    cuppingForm:1,cuppingMode:'blind',sampleNumber:2,coffeeNameOrigin:'Later coffee',process:'2' });
  assert.equal((await repo.getLocalTastingPresentation('old')).session.samples[1].coffeeNameOrigin, 'Sample 2');
  assert.equal((await repo.getCvaResponse('old', later.id)).revision, 0);
  assert.equal((await repo.getSessionSampleFinalStatus('old'))[later.id].isComplete, false);

  // A fully populated old draft is still a draft until an ordinary explicit
  // Save certifies it. Adoption preserves finality rather than scoring it.
  const draftId = await fixture('unscored-draft'); await save('unscored-draft', draftId);
  sqlite.prepare('DELETE FROM local_response_streams WHERE session_id = ?').run('unscored-draft');
  sqlite.prepare('DELETE FROM local_tasting_revisions WHERE session_id = ?').run('unscored-draft');
  sqlite.prepare('UPDATE cva_response_revisions SET is_complete = 0, result_json = NULL WHERE session_id = ?').run('unscored-draft');
  const completeDraft = await repo.getCvaResponse('unscored-draft', draftId);
  const preservedDraft = await repo.adoptSavedTasting({ sessionId: 'unscored-draft', sampleId: draftId, expectedSourceToken: completeDraft.access.sourceToken });
  assert.equal(preservedDraft.complete, false); assert.equal(preservedDraft.result, null);
  assert.equal((await complete('unscored-draft')).status, 'incomplete');
  assert.equal((await save('unscored-draft', draftId)).complete, true);

  // Mutable public input cannot retarget the provenance hook after the storage
  // adapter has captured its SQL target. This previously crossed stream owners.
  setActor(actorB); const foreign = await fixture('foreign'); await save('foreign', foreign);
  setActor(actorA); const decoy = await fixture('decoy');
  const foreignSaved = await repo.getCvaResponse('foreign', foreign);
  const command = { sessionId: 'foreign', sampleId: foreign, response: response(), expectedRevision: foreignSaved.revision,
    expectedIdentity: foreignSaved.trusted.identity, expectedCupCount: 1 };
  queryHook = sql => {
    if (!sql.includes('AS sessionForm')) return false;
    command.sessionId = 'decoy'; command.sampleId = decoy; command.response.ratings.fragrance = 9;
    return true;
  };
  await assert.rejects(repo.saveCvaResponse(command), /foreign_stream/);
  assert.equal((await repo.getCvaResponse('foreign', foreign)).revision, 1);
  assert.equal((await repo.getCvaResponse('decoy', decoy)).revision, 0);

  // The response shown to the user and the adoption token share one SQLite read
  // snapshot: a real second connection cannot replace source between queries.
  const snapshotId = await fixture('snapshot'); await save('snapshot', snapshotId, partial);
  sqlite.prepare('DELETE FROM local_response_streams WHERE session_id = ?').run('snapshot');
  sqlite.prepare('DELETE FROM local_tasting_revisions WHERE session_id = ?').run('snapshot');
  const otherConnection = new DatabaseSync(filename); let competingBlocked = false;
  queryHook = sql => {
    if (!sql.includes('is_complete = 1 LIMIT 1')) return false;
    try { otherConnection.prepare('UPDATE cva_response_revisions SET response_json = ? WHERE sample_id = ?')
      .run(JSON.stringify({ ...partial, ratings: { fragrance: 8 } }), snapshotId); }
    catch (error) { competingBlocked = /locked/.test(error.message); }
    return true;
  };
  const snapshotRead = await repo.getCvaResponse('snapshot', snapshotId);
  otherConnection.close(); assert.equal(competingBlocked, true);
  const snapshotAdopted = await repo.adoptSavedTasting({ sessionId: 'snapshot', sampleId: snapshotId, expectedSourceToken: snapshotRead.access.sourceToken });
  assert.equal(snapshotRead.response.ratings.fragrance, 7);
  assert.equal(snapshotAdopted.response.ratings.fragrance, 7);

  const legacy = await fixture('legacy', 2, 'open');
  const legacyValue = { quality_ratings: Object.fromEntries(['fragrance_aroma','flavor','aftertaste','acidity','body','balance','overall'].map(key => [key, 28])),
    consistent_cups: [1], clean_cups: [1], sweet_cups: [1], scored_defect: null };
  assert.equal((await repo.saveLegacyResponse({ sessionId: 'legacy', sampleId: legacy, response: legacyValue, complete: true })).ok, true);
  sqlite.prepare('DELETE FROM local_response_streams WHERE session_id = ?').run('legacy');
  sqlite.prepare('DELETE FROM local_tasting_revisions WHERE session_id = ?').run('legacy');
  const legacyOriginal = sqlite.prepare('SELECT * FROM legacy_responses WHERE sample_id = ?').get(legacy);
  const legacyReview = await repo.getLegacyResponse('legacy', legacy);
  const legacyAdopted = await repo.adoptSavedTasting({ sessionId: 'legacy', sampleId: legacy, expectedSourceToken: legacyReview.access.sourceToken });
  assert.deepEqual(legacyAdopted.response, legacyValue);
  const snapshot = JSON.parse(sqlite.prepare('SELECT recovery_source_json FROM local_response_streams WHERE sample_id = ?').get(legacy).recovery_source_json);
  assert.deepEqual({ ...legacyOriginal }, snapshot);
  assert.equal((await complete('legacy')).status, 'complete');
  sqlite.prepare("UPDATE local_tasting_completions SET completed_at = '2026-02-30T00:00:00.000Z', identity_revealed_at = '2026-02-30T00:00:00.000Z' WHERE session_id = 'legacy'").run();
  await assert.rejects(repo.getLocalTastingPresentation('legacy'), /damaged_completion/);
  console.log('PASS local tasting: file restart, strict transactions, creator start redaction, own completion/reveal, actor guards, rollback, CVA/Legacy adoption and late discovery');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { sqlite.close(); });
