const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const loader = require('./helpers/load-project-module');
const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
const storage = new Map();
let serial = 0, storageFailure = false;
let exclusiveActive = false;
const profileId = () => `11111111-1111-4111-8111-${String(++serial).padStart(12, '0')}`;
const bridge = {
  async execAsync(sql) { assert.equal(exclusiveActive, false, 'outer handle used during exclusive transaction'); sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { assert.equal(exclusiveActive, false, 'outer handle used during exclusive transaction'); return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { assert.equal(exclusiveActive, false, 'outer handle used during exclusive transaction'); return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) { assert.equal(exclusiveActive, false, 'outer handle used during exclusive transaction'); return sqlite.prepare(sql).run(...args); },
  async withExclusiveTransactionAsync(callback) {
    sqlite.exec('BEGIN IMMEDIATE');
    exclusiveActive = true;
    const txn = {
      async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
      async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
      async runAsync(sql, args = []) { return sqlite.prepare(sql).run(...args); },
    };
    try { const result = await callback(txn); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    finally { exclusiveActive = false; }
  },
  async withTransactionAsync(callback) { return bridge.withExclusiveTransactionAsync(callback); },
};
const native = {
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
  '@react-native-async-storage/async-storage': {
    async getItem(key) { if (storageFailure) throw Error('storage unavailable'); return storage.get(key) ?? null; },
    async setItem(key, value) { if (storageFailure) throw Error('storage unavailable'); storage.set(key, value); },
  },
  '../utils/secureIdentifiers': { generateDomainId: profileId },
};
let load = loader(root, native);
let profile = load('src/data/userProfileRepository.js');
let repo = load('src/data/sessionRepository.js');
const key = 'cup_app:user_profile';
const sample = form => ({ id: `sample-${form}`, cupUUID: `cup-${form}`, cupNumber: 1,
  cuppingForm: form, cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: 'Private Coffee', process: '1' });
const create = (id, form = 1, samples = []) => repo.saveSessionWithSamples({ sessionUUID: id,
  sessionName: 'Private Session', sessionType: 'Quality Control', sessionDate: '17 Oct 2026',
  cuppingForm: form, cuppingMode: 'open', samples, creatorProfileId: 'forged' });
const snapshot = () => JSON.stringify(sqlite.prepare('SELECT * FROM sessions ORDER BY id').all()) +
  JSON.stringify(sqlite.prepare('SELECT * FROM samples ORDER BY id').all());

(async () => {
  const ids = await Promise.all(Array.from({ length: 12 }, () => profile.getOrCreateLocalProfileIdentity()));
  assert.equal(new Set(ids).size, 1);
  const owner = ids[0];
  await Promise.all([profile.saveUserProfile({ name: 'Andrew' }), profile.getOrCreateLocalProfileIdentity()]);
  assert.equal(await profile.getLocalProfileIdentity(), owner);
  await profile.saveUserProfile({ name: 'Changed', organisation: 'Not authority', uuid: 'forged' });
  assert.equal(await profile.getLocalProfileIdentity(), owner);
  for (const form of [1, 2]) {
    await create(`local-owner-${form}`, form);
    assert.equal((await repo.getOwnedSessionSetup(`local-owner-${form}`)).samples.length, 0);
    await repo.saveSessionWithSamples({ sessionUUID: `local-owner-${form}`, existingSessionId: `local-owner-${form}`,
      sessionName: 'Private Session', sessionType: 'Quality Control', sessionDate: '17 Oct 2026',
      cuppingForm: form, cuppingMode: 'open', samples: [sample(form)], localCreatorProfileId: 'forged' });
    assert.equal(sqlite.prepare('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?').get(`local-owner-${form}`).creator, owner);
  }
  // Cold JS module restart reruns the additive migration without claiming rows.
  sqlite.prepare("UPDATE sessions SET local_creator_profile_id = NULL WHERE id = 'local-owner-2'").run();
  load = loader(root, native); repo = load('src/data/sessionRepository.js'); profile = load('src/data/userProfileRepository.js');
  assert.equal((await repo.getSessionSetupAccess('local-owner-1')).canManageSetup, true);
  assert.equal((await repo.getSessionSetupAccess('local-owner-2')).canManageSetup, false);
  const { projectSavedSessionIdentity, projectSavedAssessmentContext, projectOwnedSetupIdentity } = load('src/features/cupping/screens/savedSessionIdentity.js');
  const owned = await repo.getOwnedSessionSetup('local-owner-1');
  owned.samples[0].cuppingMode = 'blind';
  assert.equal(projectOwnedSetupIdentity(owned).sessionName, 'Private Session');
  assert.equal(projectSavedSessionIdentity(owned, { allowOpen: true }).sessionName, 'Private Session');
  assert.equal(projectSavedSessionIdentity(owned, { allowOpen: true }).identityHidden, true,
    'visible session name does not reveal coffee identity even for the owner');
  assert.equal(projectSavedAssessmentContext(owned, { coffeeNameOrigin: 'Private Coffee', sampleNumber: 1 }).coffeeNameOrigin, 'Sample 1');
  await repo.activateSession('local-owner-1');
  const current = await repo.getCvaResponse('local-owner-1', 'sample-1');
  const { RATINGS, createCvaDraft } = require('../src/features/cupping/data/cvaResponse');
  await repo.saveCvaResponse({ sessionId: 'local-owner-1', sampleId: 'sample-1',
    expectedRevision: current.revision, expectedIdentity: current.trusted.identity, expectedCupCount: 1,
    response: { ...createCvaDraft(1), ratings: Object.fromEntries(Object.values(RATINGS).map(name => [name, 7])) } });
  await repo.manuallyMarkSessionComplete('local-owner-1');
  await repo.resetSessionToPending('local-owner-1');
  assert.equal((await repo.getSessionById('local-owner-1')).status, 'pending', 'guarded owner lifecycle uses only the exclusive handle');
  const before = snapshot();
  await assert.rejects(repo.upsertSessionSampleFromCupMetadata({ sessionId: 'local-owner-1', ...sample(1), coffeeNameOrigin: 'Tampered' }), /conflicts/);
  const unchangedHeader = await repo.upsertSessionFromCupMetadata({ sessionUUID: 'local-owner-1', cuppingForm: 1, sessionName: 'Stale header' });
  assert.equal(unchangedHeader.sessionName, 'Private Session', 'tag header cannot overwrite owned setup');
  await repo.upsertSessionSampleFromCupMetadata({ sessionId: 'local-owner-1', ...sample(1) });
  assert.equal(snapshot(), before, 'matching scans read; conflicting scans cannot mutate owned setup');
  const first = { ...sample(1), id: 'multi-first', cupUUID: 'multi-first' };
  const second = { ...sample(1), id: 'multi-second', cupUUID: 'multi-second', sampleNumber: 2, coffeeNameOrigin: 'Second Coffee' };
  await create('local-multi-1', 1, [first]);
  const earlierTag = { f: 1, m: 'o', u: 'local-multi-1', e: 'Private Session', t: 2,
    d: 261017, i: 1, z: 1, y: 1, n: 'Private Coffee', p: 1 };
  await repo.saveSessionWithSamples({ sessionUUID: 'local-multi-1', existingSessionId: 'local-multi-1',
    sessionName: 'Updated organiser title', sessionType: 'Training Session', sessionDate: '18 Oct 2026',
    samplesInSession: 2, cuppingForm: 1, cuppingMode: 'open', samples: [first, second] });
  const eight = { ...sample(1), id: 'owned-eight', cupUUID: 'owned-eight', cupNumber: 8 };
  await create('local-eight-1', 1, [eight]);
  const beforeEarlierTag = snapshot();
  const resolvedEarlier = await repo.resolveActiveSampleFromCupMetadata({ cupUUID: first.cupUUID, metadata: earlierTag });
  assert.equal(resolvedEarlier.sampleId, first.id, 'first cup remains usable after adding a second sample');
  assert.equal(resolvedEarlier.cupTotal, 2);
  assert.equal(snapshot(), beforeEarlierTag, 'stale total/header scan cannot change owned setup or timestamps');
  for (const patch of [{ n: 'Wrong Coffee' }, { p: 2 }, { y: 2 }, { z: 2 }, { m: 'b' }, { f: 2 }]) {
    await assert.rejects(repo.resolveActiveSampleFromCupMetadata({ cupUUID: first.cupUUID, metadata: { ...earlierTag, ...patch } }));
    assert.equal(snapshot(), beforeEarlierTag, 'assignment identity conflicts still reject without changes');
  }
  const eightTag = { ...earlierTag, u: 'local-eight-1', y: 8 };
  for (const cupNumber of [9, 0, -1, 8.5, '', '8x', '8.5', '0x8', null, undefined, NaN, Infinity, true, false, {}, [], [8]]) {
    await assert.rejects(repo.upsertSessionSampleFromCupMetadata({ sessionId: 'local-eight-1', ...eight, cupNumber }));
    await assert.rejects(repo.resolveActiveSampleFromCupMetadata({ cupUUID: eight.cupUUID, metadata: { ...eightTag, y: cupNumber } }));
    assert.equal(snapshot(), beforeEarlierTag, 'invalid raw count cannot clamp/fallback into an owned assignment');
  }
  for (const sampleNumber of [0, -1, 1.5, '', '1x', '1.5', '0x1', null, NaN, Infinity, true, false, {}, [], [1]]) {
    await assert.rejects(repo.upsertSessionSampleFromCupMetadata({ sessionId: 'local-eight-1', ...eight, sampleNumber }));
    await assert.rejects(repo.resolveActiveSampleFromCupMetadata({ cupUUID: eight.cupUUID, metadata: { ...eightTag, z: sampleNumber } }));
    assert.equal(snapshot(), beforeEarlierTag, 'supplied invalid position cannot fall back to the stored position');
  }
  await repo.upsertSessionSampleFromCupMetadata({ sessionId: 'local-eight-1', ...eight, cupNumber: '8', sampleNumber: '1' });
  await repo.resolveActiveSampleFromCupMetadata({ cupUUID: eight.cupUUID, metadata: { ...eightTag, z: undefined } });
  await repo.upsertSessionSampleFromCupMetadata({ sessionId: 'local-eight-1', ...eight, sampleNumber: undefined });
  assert.equal(snapshot(), beforeEarlierTag, 'valid decimal integer strings retain compatibility without writes');
  storage.set(key, JSON.stringify({ uuid: profileId(), name: 'Other profile' }));
  for (const sessionId of ['local-owner-1', 'local-owner-2']) {
    for (const command of [
      () => repo.getOwnedSessionSetup(sessionId),
      () => repo.saveSessionWithSamples({ sessionUUID: sessionId, existingSessionId: sessionId,
        sessionName: 'Take over', cuppingForm: 1, samples: [] }),
      () => repo.activateSession(sessionId), () => repo.resetSessionToPending(sessionId),
      () => repo.manuallyMarkSessionComplete(sessionId), () => repo.markSessionCompleteIfAllSamplesComplete(sessionId),
      () => repo.deleteSampleFromSession(`sample-${sessionId.endsWith('1') ? 1 : 2}`),
    ]) await assert.rejects(command(), /local profile that created/);
  }
  assert.equal(snapshot(), beforeEarlierTag, 'all denied commands leave setup unchanged');
  await repo.upsertSessionFromCupMetadata({ sessionUUID: 'importedref123', cuppingForm: 1, sessionName: 'Imported' });
  assert.equal((await repo.getSessionSetupAccess('importedref123')).canManageSetup, false);
  await assert.rejects(create('importedref123'), /reference is already in use/);
  for (const corrupt of ['{', '{}', JSON.stringify({ uuid: '' }), JSON.stringify({ uuid: 'forged' })]) {
    storage.set(key, corrupt);
    await assert.rejects(profile.getOrCreateLocalProfileIdentity(), /unavailable/);
    await assert.rejects(profile.saveUserProfile({ name: 'Must not reset' }), /unavailable/);
    assert.equal(storage.get(key), corrupt);
    assert.equal((await repo.getSessionSetupAccess('local-owner-1')).canManageSetup, false);
  }
  storage.delete(key);
  assert.equal((await repo.getSessionSetupAccess('local-owner-1')).canManageSetup, false);
  storageFailure = true;
  await assert.rejects(profile.getOrCreateLocalProfileIdentity(), /storage unavailable/);
  assert.equal((await repo.getSessionSetupAccess('local-owner-1')).canManageSetup, false);
  console.log('PASS local session ownership: actual profile queue, migration/restart, owned drafts, direct mutation denials, import conflicts and blind projections');
})().catch(error => { console.error(error); process.exitCode = 1; });
