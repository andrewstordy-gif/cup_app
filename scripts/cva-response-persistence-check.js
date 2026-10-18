const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const projectLoader = require('./helpers/load-project-module');
const { createCvaDraft, changeCvaMask, RATINGS } = require('../src/features/cupping/data/cvaResponse');
const db = new DatabaseSync(':memory:');
let id = 0, failLate = false, queue = Promise.resolve(), pauseDelete = null;
const bridge = {
  async execAsync(sql) { db.exec(sql); },
  async getFirstAsync(sql, args = []) {
    const result = db.prepare(sql).get(...args) || null;
    if (pauseDelete && sql.startsWith('SELECT revision FROM cva_response_revisions WHERE sample_id')) {
      const hook = pauseDelete; pauseDelete = null; hook.reached(); await hook.wait;
    }
    return result;
  },
  async getAllAsync(sql, args = []) { return db.prepare(sql).all(...args); },
  async runAsync(sql, args = []) {
    if (failLate && sql.includes('INSERT INTO local_tasting_revisions')) throw new Error('injected late failure');
    return db.prepare(sql).run(...args);
  },
  async withTransactionAsync(callback) {
    db.exec('BEGIN'); try { const result = await callback(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
  withExclusiveTransactionAsync(callback) {
    const execution = queue.then(async () => {
      db.exec('BEGIN IMMEDIATE');
      try { const result = await callback(bridge); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    queue = execution.catch(() => {}); return execution;
  },
};
const identifiers = { generateDomainId: () => `id-${++id}`, generateSessionReference: () => `ref${++id}` };
const load = projectLoader(path.resolve(__dirname, '..'), {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
  '../utils/secureIdentifiers': identifiers,
  '../../../utils/secureIdentifiers': identifiers,
});
const repo = load('src/data/sessionRepository.js');
async function fixture(n) {
  const sessionId = `session-${n}`, sampleId = `sample-${n}`;
  await repo.saveSessionWithSamples({ sessionUUID: sessionId, sessionName: 'Test', sessionDate: '16 Oct 2026',
    sessionType: 'Training Session', cuppingForm: 1, cuppingMode: 'open',
    samples: [{ id: sampleId, cupUUID: `CUP-${n}`, cupNumber: n, cuppingForm: 1, cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Coffee', process: '1' }] });
  const saved = await repo.getCvaResponse(sessionId, sampleId);
  return { sessionId, sampleId, expectedRevision: saved.revision, expectedIdentity: saved.trusted.identity, expectedCupCount: n };
}
const final = n => ({ ...createCvaDraft(n), non_uniform_cups: [],
  ratings: Object.fromEntries(Object.values(RATINGS).map(key => [key, 5])),
  general_affective_notes: 'Caramel with silky mouthfeel', affective_notes: { fragrance_aroma: 'Apple', mouthfeel: 'Silky', flavor_aftertaste: 'Caramel' } });
async function main() {
  for (const n of [1, 5, 8]) {
    const input = await fixture(n);
    const response = final(n);
    const first = await repo.saveCvaResponse({ ...input, response });
    assert.equal(first.firstComplete, true); assert.equal(first.result.display_score, '79.00');
    const reopened = await repo.getCvaResponse(input.sessionId, input.sampleId);
    assert.deepEqual(reopened.response, response); assert.equal(reopened.revision, 1);
    const status = (await repo.getSessionSampleFinalStatus(input.sessionId))[input.sampleId];
    assert.equal(status.isComplete, true); assert.equal(status.finalScore, '79.00');
    assert.equal(status.noteGroups.find(group => group.key === 'mouthfeel').notes, 'Silky');
    assert.equal(status.noteGroups.find(group => group.key === 'general_affective_notes').notes, response.general_affective_notes);
    await assert.rejects(repo.saveCvaAssessmentAtomically({ sessionId: input.sessionId, sampleId: input.sampleId,
      feedback: { Fragrance: { score: 8 } }, defectsEntry: { numberOfCups: n } }), /not linked/);
    await assert.rejects(repo.saveCvaResponse({ ...input, expectedRevision: 1, expectedCupCount: String(n), response }), /session_changed/);
    const bad = { ...response, ratings: { ...response.ratings, aroma: '7' } };
    await assert.rejects(repo.saveCvaResponse({ ...input, expectedRevision: 1, response: bad }), /invalid_draft/);
    const draft = { ...response, ratings: { ...response.ratings, overall: null } };
    const savedDraft = await repo.saveCvaResponse({ ...input, expectedRevision: 1, response: draft });
    assert.equal(savedDraft.complete, false); assert.equal(savedDraft.result, null);
    const draftStatus = (await repo.getSessionSampleFinalStatus(input.sessionId))[input.sampleId];
    assert.equal(draftStatus.isComplete, false); assert.equal(draftStatus.finalScore, null);
    await assert.rejects(repo.manuallyMarkSessionComplete(input.sessionId), /incomplete_session/);
    await assert.rejects(repo.markSessionCompleteIfAllSamplesComplete(input.sessionId), /incomplete_session/);
    const final3 = await repo.saveCvaResponse({ ...input, expectedRevision: 2, response });
    assert.equal(final3.firstComplete, false); assert.equal(final3.revision, 3);
    await assert.rejects(repo.saveCvaResponse({ ...input, expectedRevision: 2, response }), /stale_revision/);
    failLate = true;
    await assert.rejects(repo.saveCvaResponse({ ...input, expectedRevision: 3, response: draft }), /injected/);
    failLate = false;
    assert.equal((await repo.getCvaResponse(input.sessionId, input.sampleId)).revision, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cva_response_revisions WHERE sample_id = ?').get(input.sampleId).n, 3);
    const concurrent = await Promise.allSettled([
      repo.saveCvaResponse({ ...input, expectedRevision: 3, response }),
      repo.saveCvaResponse({ ...input, expectedRevision: 3, response: draft }),
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await repo.getCvaResponse(input.sessionId, input.sampleId)).revision, 4);
    await repo.manuallyMarkSessionComplete(input.sessionId);
    await assert.rejects(repo.saveCvaResponse({ ...input, expectedRevision: 4, response }), /session_complete/);
    assert.equal((await repo.getCvaResponse(input.sessionId, input.sampleId)).result.display_score, '79.00');
  }
  const input = await fixture(2);
  let response = final(2);
  response = changeCvaMask(response, 'potato', [1, 2], 2);
  response = changeCvaMask(response, 'phenolic', [1], 2);
  response = changeCvaMask(response, 'otherBean', [2], 2);
  response = changeCvaMask(response, 'baked', [1], 2);
  const unresolved = await repo.saveCvaResponse({ ...input, response });
  assert.equal(unresolved.complete, false); assert.equal(unresolved.result, null);
  response.evenly_defective_all_cups = true;
  const all = await repo.saveCvaResponse({ ...input, expectedRevision: 1, response });
  assert.equal(all.result.display_score, '59.00');
  assert.deepEqual((await repo.getCvaResponse(input.sessionId, input.sampleId)).response, response);
  const defects = await repo.getSampleDefects(input.sampleId);
  assert.equal(defects.latest.defectiveCups, 2); assert.equal(defects.latest.otherBean, true); assert.equal(defects.latest.baked, true);
  const context = await fixture(3);
  db.prepare("UPDATE sessions SET status = 'archived' WHERE id = ?").run(context.sessionId);
  await assert.rejects(repo.saveCvaResponse({ ...context, response: final(3) }), /unsupported_session_state/);
  assert.equal(db.prepare('SELECT status FROM sessions WHERE id = ?').get(context.sessionId).status, 'archived');
  db.prepare("UPDATE sessions SET status = 'pending', form_hash = 'invalid' WHERE id = ?").run(context.sessionId);
  await assert.rejects(repo.saveCvaResponse({ ...context, response: final(3) }), /unsupported_session/);
  db.prepare('UPDATE sessions SET form_hash = ? WHERE id = ?').run(context.expectedIdentity.form_hash, context.sessionId);
  db.prepare('UPDATE samples SET cupping_form = 2 WHERE id = ?').run(context.sampleId);
  await assert.rejects(repo.saveCvaResponse({ ...context, response: final(3) }), /unsupported_session/);
  db.prepare('UPDATE samples SET cupping_form = 1, cup_number = 2 WHERE id = ?').run(context.sampleId);
  await assert.rejects(repo.saveCvaResponse({ ...context, response: final(3) }), /session_changed/);
  db.prepare('UPDATE samples SET cup_number = 3 WHERE id = ?').run(context.sampleId);
  const race = await Promise.allSettled([repo.saveCvaResponse({ ...context, response: final(3) }), repo.saveCvaResponse({ ...context, response: final(3) })]);
  assert.equal(race.filter(entry => entry.status === 'fulfilled' && entry.value.firstComplete).length, 1);
  await assert.rejects(repo.deleteSampleFromSession(context.sampleId), /setup_started/);
  assert.equal((await repo.getCvaResponse(context.sessionId, context.sampleId)).revision, 1);
  // Exact prior finding: pause deletion after its null revision read, then start
  // Save. The corrected exclusive transaction serializes both operations.
  const deletion = await fixture(4);
  let reached, release;
  const reachedPromise = new Promise(resolve => { reached = resolve; });
  pauseDelete = { reached, wait: new Promise(resolve => { release = resolve; }) };
  const deleting = repo.deleteSampleFromSession(deletion.sampleId);
  await reachedPromise;
  const competingSave = repo.saveCvaResponse({ ...deletion, response: final(4) });
  release();
  assert.equal((await deleting).deleted, true);
  await assert.rejects(competingSave, /unsupported_session/);
  // Existing 1.1 sessions remain original-pin editable, including approved
  // empty-session form switching. They never acquire successor certification.
  const prototype = await fixture(6);
  const { pin, pinPrototypeCvaFixture } = require('./helpers/prototype-cva-fixture');
  pinPrototypeCvaFixture(db, prototype.sessionId);
  await repo.saveCvaAssessmentAtomically({ sessionId: prototype.sessionId, sampleId: prototype.sampleId,
    feedback: { Fragrance: { score: 7, comments: 'Original shared note' } }, defectsEntry: { numberOfCups: 6 } });
  const oldSession = await repo.getSessionById(prototype.sessionId);
  await assert.rejects(repo.saveSessionWithSamples({ sessionUUID: prototype.sessionId, existingSessionId: prototype.sessionId,
    sessionName: 'Edited title', cuppingForm: 1, cuppingMode: 'open', samples: oldSession.samples }), /setup_started/);
  assert.equal((await repo.getSessionById(prototype.sessionId)).formHash, pin.form_hash);
  assert.equal((await repo.getSampleFeedback(prototype.sampleId)).Fragrance.at(-1).comments, 'Original shared note');
  await assert.rejects(repo.saveSessionWithSamples({ sessionUUID: prototype.sessionId, existingSessionId: prototype.sessionId,
    sessionName: 'Cannot switch', cuppingForm: 2, cuppingMode: 'open', samples: [] }), /setup_started/);
  await repo.saveSessionWithSamples({ sessionUUID: 'empty-prototype', sessionName: 'Empty', cuppingForm: 1, samples: [] });
  pinPrototypeCvaFixture(db, 'empty-prototype');
  await repo.saveSessionWithSamples({ sessionUUID: 'empty-prototype', existingSessionId: 'empty-prototype',
    sessionName: 'Legacy empty', cuppingForm: 2, cuppingMode: 'open', samples: [] });
  assert.equal((await repo.getSessionById('empty-prototype')).formKey, 'scaa_legacy_2009a_cupapp');
  console.log('CVA actual SQLite/repository checks passed: typed roundtrip, draft supersession, stale/concurrent Save, closure, rollback, old-API exclusion.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
