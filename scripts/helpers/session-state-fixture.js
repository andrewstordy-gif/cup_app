const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const projectLoader = require('./load-project-module');
const { createCvaDraft, RATINGS } = require('../../src/features/cupping/data/cvaResponse');
const actorA = '11111111-1111-4111-8111-111111111111';
const actorB = '22222222-2222-4222-8222-222222222222';
function fixture(filename = ':memory:') {
  let sqlite = new DatabaseSync(filename), active = false, tail = Promise.resolve(), serial = 0;
  let failure = null, hook = null;
  const storage = new Map([['cup_app:user_profile', JSON.stringify({ uuid: actorA, name: 'Taster' })]]);
  const handle = outer => ({
    async getFirstAsync(sql, args = []) {
      if (outer) assert.equal(active, false);
      if (hook) hook(sql);
      return sqlite.prepare(sql).get(...args) || null;
    },
    async getAllAsync(sql, args = []) { if (outer) assert.equal(active, false); return sqlite.prepare(sql).all(...args); },
    async runAsync(sql, args = []) {
      if (outer) assert.equal(active, false);
      const value = sqlite.prepare(sql).run(...args);
      if (failure && sql.includes(failure)) throw Error('injected transaction failure');
      return value;
    },
    async execAsync(sql) {
      if (outer) assert.equal(active, false);
      sqlite.exec(sql);
      if (failure && sql.includes(failure)) throw Error('injected transaction failure');
    },
  });
  const bridge = { ...handle(true), withExclusiveTransactionAsync(callback) {
    const pending = tail.then(async () => {
      sqlite.exec('BEGIN IMMEDIATE'); active = true;
      try { const value = await callback(handle(false)); sqlite.exec('COMMIT'); return value; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; } finally { active = false; }
    }); tail = pending.catch(() => {}); return pending;
  } };
  const mocks = {
    'expo-sqlite': { openDatabaseAsync: async () => bridge },
    '@react-native-async-storage/async-storage': {
      async getItem(key) { return storage.get(key) ?? null; }, async setItem(key, value) { storage.set(key, value); },
    },
    '../utils/secureIdentifiers': { generateDomainId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++serial).padStart(12, '0')}` },
  };
  const root = path.resolve(__dirname, '../..');
  const value = { bridge, storage, actorA, actorB,
    get sqlite() { return sqlite; },
    actor(actor) { storage.set('cup_app:user_profile', JSON.stringify({ uuid: actor, name: 'Taster' })); },
    failAt(text) { failure = text; }, hook(fn) { hook = fn; },
    reload() { value.repo = projectLoader(root, mocks)('src/data/sessionRepository.js'); return value.repo; },
    restart() { sqlite.close(); sqlite = new DatabaseSync(filename); return value.reload(); },
    async create(id, form = 1, mode = form === 1 ? 'blind' : 'open', samples = true) {
      const sampleId = `${id}-sample`;
      await value.repo.saveSessionWithSamples({ sessionUUID: id, sessionName: 'Visible session', sessionType: 'Training Session',
        sessionDate: '18 Oct 2026', cuppingForm: form, cuppingMode: mode,
        samples: samples ? [{ id: sampleId, cupUUID: `TAG-${sampleId}`, cupNumber: 1, cuppingForm: form,
          cuppingMode: mode, sampleNumber: 7, coffeeNameOrigin: 'Secret coffee', process: '1' }] : [] });
      return sampleId;
    },
    async save(id, sampleId, response = value.response()) {
      const loaded = await value.repo.getCvaResponse(id, sampleId);
      return value.repo.saveCvaResponse({ sessionId: id, sampleId, response, expectedRevision: loaded.revision,
        expectedIdentity: loaded.trusted.identity, expectedCupCount: loaded.n });
    },
    async complete(id) {
      const presentation = await value.repo.getLocalTastingPresentation(id);
      return value.repo.completeLocalTasting(id, { expectedContextToken: presentation.tasting.contextToken });
    },
    response() { return { ...createCvaDraft(1), ratings: Object.fromEntries(Object.values(RATINGS).map(key => [key, 7])) }; },
    legacy() { return { quality_ratings: Object.fromEntries(['fragrance_aroma','flavor','aftertaste','acidity','body','balance','overall'].map(key => [key,28])),
      consistent_cups:[1],clean_cups:[1],sweet_cups:[1] }; },
  };
  value.reload(); return value;
}
module.exports = { fixture, actorA, actorB, createCvaDraft };
