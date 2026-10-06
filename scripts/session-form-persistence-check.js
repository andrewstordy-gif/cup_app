#!/usr/bin/env node
// Exercises the prototype SQLite migration and Session round-trip without an
// iPhone. A second module load models process restart against the same file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');
const { isPinnedCva, requireCvaRoute } = require('../src/features/forms/sessionFormRoute');

const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
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
};

// A pre-R1-009 prototype Session has no form identity columns.
sqlite.exec(`CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL, session_uuid TEXT NOT NULL UNIQUE,
  session_display_id TEXT NOT NULL, session_name TEXT NOT NULL,
  session_type TEXT NOT NULL, samples_in_session INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new', session_date TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`);
sqlite.prepare(`INSERT INTO sessions (id, session_uuid, session_display_id, session_name,
  session_type, samples_in_session, status, session_date, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'oldprototype01', 'oldprototype01', 'SESSION-OLD', 'Earlier prototype',
  'Quality Control', 0, 'new', '1 Oct 2026', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'
);

function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
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
  generateDomainId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  generateSessionReference: () => 'newprototype01',
};
const details = load('src/features/cupping/constants/sessionDetails.js', {
  '../../../utils/secureIdentifiers': identifiers,
});
function loadRepositoryAfterRestart() {
  const local = load('src/data/localDatabase.js', {
    'expo-sqlite': { openDatabaseAsync: async () => bridge },
  });
  return load('src/data/sessionRepository.js', {
    './localDatabase': local,
    '../utils/secureIdentifiers': identifiers,
    '../features/cupping/constants/sessionDetails': details,
  });
}

async function main() {
  const first = loadRepositoryAfterRestart();
  const old = await first.getSessionById('oldprototype01');
  assert.equal(old.cuppingForm, null, 'migration must not infer f=1');
  assert.equal(old.formKey, null);
  assert.equal(isPinnedCva(old), false);
  assert.throws(() => requireCvaRoute(old, { cuppingForm: 1 }), /unsupported or older prototype/);
  sqlite.prepare(`INSERT INTO samples (id, session_id, cup_uuid, cup_number,
    cupping_form, cupping_mode, sample_number, coffee_name_origin, process,
    position_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'old-sample', 'oldprototype01', 'OLD-CUP', 1, 1, 'blind', 1,
    'Old coffee', '1', 0, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'
  );
  await assert.rejects(first.deleteSampleFromSession('old-sample'), /read-only/);
  await assert.rejects(first.manuallyMarkSessionComplete('oldprototype01'), /read-only/);
  assert.equal((await first.getSessionById('oldprototype01')).samples.length, 1);

  const quickStartId = 'newprototype01';
  await first.saveSessionWithSamples({
    sessionUUID: quickStartId, cuppingForm: 1, sessionName: 'Quick tasting',
    sessionType: 7, status: 'new', sessionDate: '6 Oct 2026',
    samples: [{ id: 'sample-1', cupUUID: 'CUP-1', cupNumber: 1,
      cuppingForm: 1, cuppingMode: 'blind', sampleNumber: 1,
      coffeeNameOrigin: 'Test coffee', process: '1' }],
  });
  const saved = await first.getSessionById(quickStartId);
  assert.equal(isPinnedCva(saved), true);
  assert.equal(saved.samples.length, 1);
  assert.doesNotThrow(() => requireCvaRoute(saved, saved.samples[0]));

  const reopenedRepository = loadRepositoryAfterRestart();
  const reopened = await reopenedRepository.getSessionById(quickStartId);
  assert.equal(isPinnedCva(reopened), true, 'form identity must survive a cold repository/database module load');
  assert.equal(reopened.samples[0].cuppingForm, 1);
  assert.doesNotThrow(() => requireCvaRoute(reopened, reopened.samples[0]));
  await assert.rejects(reopenedRepository.resolveActiveSampleFromCupMetadata({
    cupUUID: 'CUP-1', metadata: {
      f: 1, m: 'o', u: quickStartId, e: 'Untrusted open title',
      n: 'Untrusted coffee', p: 1, y: 1,
    },
  }), /form or cupping mode conflicts/);
  const afterConflictingScan = await reopenedRepository.getSessionById(quickStartId);
  assert.equal(afterConflictingScan.sessionName, 'Quick tasting', 'conflicting tag must not overwrite session metadata');
  assert.equal(afterConflictingScan.samples[0].cuppingMode, 'blind', 'conflicting tag must not reveal a blind sample');
  await assert.rejects(reopenedRepository.resolveActiveSampleFromCupMetadata({
    cupUUID: 'NEW-CUP', metadata: {
      f: 1, m: 'o', u: quickStartId, e: 'Untrusted new-cup title',
      n: 'Untrusted new coffee', p: 1, y: 1,
    },
  }), /form or cupping mode conflicts/);
  const afterNewCupConflict = await reopenedRepository.getSessionById(quickStartId);
  assert.equal(afterNewCupConflict.sessionName, 'Quick tasting', 'new-cup conflict must not update Session');
  assert.equal(afterNewCupConflict.samples.length, 1, 'new-cup conflict must not insert an open sample');
  assert.equal(afterNewCupConflict.samples[0].cuppingMode, 'blind');
  await assert.rejects(reopenedRepository.upsertSessionSampleFromCupMetadata({
    sessionId: quickStartId, cupUUID: 'CUP-1', cuppingForm: 1, cuppingMode: 'open',
  }), /mode conflicts/);
  assert.equal((await reopenedRepository.getSessionById(quickStartId)).samples[0].cuppingMode, 'blind');
  await assert.rejects(reopenedRepository.upsertSessionSampleFromCupMetadata({
    sessionId: quickStartId, cupUUID: 'ANOTHER-CUP', cuppingForm: 1, cuppingMode: 'open',
  }), /mode conflicts/);
  assert.equal((await reopenedRepository.getSessionById(quickStartId)).samples.length, 1);
  const oldReopened = await reopenedRepository.getSessionById('oldprototype01');
  assert.equal(oldReopened.cuppingForm, null, 'old row remains unversioned after restart');
  console.log('Session-form SQLite migration, pin, quick-start save, and simulated reopen passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
