#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');
const { formIdentity, requireFormRoute, requireFormTag } = require('../src/features/forms/sessionFormRoute');

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
const identifiers = { generateDomainId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', generateSessionReference: () => 'sessionlegacy1' };
const details = load('src/features/cupping/constants/sessionDetails.js', { '../../../utils/secureIdentifiers': identifiers });
const tagMetadata = details.buildCompactSessionMetadata({ coffeeNameOrigin: 'Legacy test', process: 1,
  cupNumber: 8, samplesInSession: 1, sampleNumber: 1, cuppingMode: 'open', cuppingForm: 2,
  sessionName: 'Legacy test', sessionType: 1, sessionDate: '7 Oct 2026', sessionUUID: 'legacy-count-8' });
assert.equal(tagMetadata.f, 2);
assert.equal(tagMetadata.m, 'o');
assert.equal(tagMetadata.y, 8);
assert.equal(details.doesMetadataMatchExpected(tagMetadata, tagMetadata), true);
function repositoryAfterRestart() {
  const local = load('src/data/localDatabase.js', { 'expo-sqlite': { openDatabaseAsync: async () => bridge } });
  return load('src/data/sessionRepository.js', {
    './localDatabase': local, '../utils/secureIdentifiers': identifiers,
    '../features/cupping/constants/sessionDetails': details,
  });
}
function sample(id, n) {
  return { id: `sample-${id}`, cupUUID: `CUP-${id}`, cupNumber: n, cuppingForm: 2,
    cuppingMode: 'open', sampleNumber: 1, coffeeNameOrigin: `Coffee ${id}`, process: '1' };
}
function completedResponse(n) {
  const cups = Array.from({ length: n }, (_, i) => i + 1);
  return { quality_ratings: Object.fromEntries(['fragrance_aroma','flavor','aftertaste','acidity','body','balance','overall'].map(key => [key, 32])),
    consistent_cups: cups, sweet_cups: cups, clean_cups: cups, scored_defect: null };
}
async function main() {
  const repo = repositoryAfterRestart();
  await assert.rejects(repo.saveSessionWithSamples({ sessionUUID: 'blindlegacy001', cuppingForm: 2,
    cuppingMode: 'blind', sessionName: 'No blind Legacy', samples: [] }), /requires Open Cupping/);
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").get(), undefined,
    'Legacy blind must reject before even opening the database');

  await repo.saveSessionWithSamples({ sessionUUID: 'empty-cva', cuppingForm: 1,
    sessionName: 'Empty CVA', sessionDate: '7 Oct 2026', samples: [] });
  assert.equal((await repo.getSessionById('empty-cva')).samples.length, 0);
  assert.equal((await repo.getSessionById('empty-cva')).cuppingForm, 1);
  await repo.saveSessionWithSamples({ sessionUUID: 'switchable', cuppingForm: 1,
    sessionName: 'Switchable', sessionDate: '7 Oct 2026', samples: [] });
  await repo.saveSessionWithSamples({ sessionUUID: 'switchable', existingSessionId: 'switchable',
    cuppingForm: 2, cuppingMode: 'open', sessionName: 'Switchable', sessionDate: '7 Oct 2026', samples: [] });
  assert.equal((await repo.getSessionById('switchable')).cuppingForm, 2,
    'form may change before any cup has ever been assigned');
  await repo.saveSessionWithSamples({ sessionUUID: 'empty-cva', existingSessionId: 'empty-cva', cuppingForm: 1,
    sessionName: 'Empty CVA', sessionDate: '7 Oct 2026', samples: [{ ...sample('temporary', 1), cuppingForm: 1, cuppingMode: 'open' }] });
  await repo.deleteSampleFromSession('sample-temporary');
  assert.equal((await repo.getSessionById('empty-cva')).samples.length, 0);
  assert.equal((await repo.getSessionById('empty-cva')).formLocked, 1);
  await assert.rejects(repo.saveSessionWithSamples({ sessionUUID: 'empty-cva', existingSessionId: 'empty-cva',
    cuppingForm: 2, cuppingMode: 'open', sessionName: 'Illicit form change', sessionDate: '7 Oct 2026', samples: [] }),
    /cannot be changed after cup assignment/);

  const pin = formIdentity(2);
  await repo.saveSessionWithSamples({ sessionUUID: 'emptylegacy001', cuppingForm: 2, cuppingMode: 'open',
    sessionName: 'Empty Legacy', sessionDate: '7 Oct 2026', samples: [] });
  let empty = await repo.getSessionById('emptylegacy001');
  assert.equal(empty.samples.length, 0);
  assert.equal(empty.cuppingMode, 'open');
  assert.deepEqual([empty.cuppingForm, empty.formKey, empty.formVersion, empty.formHash],
    [2, pin.form_key, pin.form_version, pin.form_hash]);
  const reopened = repositoryAfterRestart();
  empty = await reopened.getSessionById('emptylegacy001');
  assert.equal(empty.cuppingMode, 'open', 'zero-sample trusted mode survives module reopen');
  await assert.rejects(reopened.resolveActiveSampleFromCupMetadata({ cupUUID: 'CUP-NEW', metadata: {
    u: 'emptylegacy001', f: 2, m: 'b', y: 1,
  } }), /Open mode/);
  assert.equal((await reopened.getSessionById('emptylegacy001')).samples.length, 0);

  await reopened.saveSessionWithSamples({ sessionUUID: 'emptylegacy001', existingSessionId: 'emptylegacy001',
    cuppingForm: 2, cuppingMode: 'open', sessionName: 'Empty Legacy', sessionDate: '7 Oct 2026', samples: [sample('one', 1)] });
  const saved = await reopened.getSessionById('emptylegacy001');
  assert.equal(requireFormRoute(saved, saved.samples[0], { f: 2, m: 'o' }), 2);
  assert.throws(() => requireFormRoute(saved, saved.samples[0], { f: 1, m: 'o' }), /unsupported or older/);
  for (const metadata of [{}, { f: '2' }, { f: 3 }, { f: 2, cuppingForm: 1 }]) {
    assert.throws(() => requireFormTag(metadata), /missing, unsupported/);
  }
  await assert.rejects(reopened.saveSessionWithSamples({ sessionUUID: 'emptylegacy001', existingSessionId: 'emptylegacy001',
    cuppingForm: 1, sessionName: 'Wrong', samples: [] }), /cannot be changed after cup assignment/);
  assert.equal((await reopened.getSessionById('emptylegacy001')).cuppingForm, 2);
  await assert.rejects(reopened.resolveActiveSampleFromCupMetadata({ cupUUID: 'CUP-one', metadata: {
    u: 'emptylegacy001', f: 1, m: 'o', y: 1,
  } }), /older or unsupported prototype session/);
  await assert.rejects(reopened.resolveActiveSampleFromCupMetadata({ cupUUID: 'CUP-one', metadata: {
    u: 'emptylegacy001', f: 2, m: 'b', y: 1,
  } }), /Open mode/);
  await assert.rejects(reopened.upsertSessionSampleFromCupMetadata({ sessionId: 'emptylegacy001',
    cupUUID: 'CUP-OTHER', cupNumber: 1, cuppingForm: 2, cuppingMode: 'blind' }), /Blind Cupping/);
  assert.equal((await reopened.getSessionById('emptylegacy001')).samples.length, 1);
  const resolved = await reopened.resolveActiveSampleFromCupMetadata({ cupUUID: 'CUP-one', metadata: {
    u: 'emptylegacy001', f: 2, m: 'o', y: 1, n: 'Coffee one', p: 1, e: 'Empty Legacy', t: 1, d: 261007,
  } });
  assert.equal(resolved.cuppingForm, 2);
  assert.equal((await reopened.getSessionById('emptylegacy001')).samples.length, 1);

  const draft = { quality_ratings: { fragrance_aroma: 32 }, consistent_cups: [1],
    sweet_cups: null, clean_cups: null, scored_defect: { kind: 'taint', description: '', affected_cups: [] } };
  const draftSaved = await reopened.saveLegacyResponse({ sessionId: 'emptylegacy001', sampleId: 'sample-one', response: draft });
  assert.equal(draftSaved.ok, true);
  assert.equal(draftSaved.result, null);
  const draftReopened = await repositoryAfterRestart().getLegacyResponse('emptylegacy001', 'sample-one');
  assert.equal(draftReopened.complete, false);
  assert.equal(draftReopened.response.scored_defect.kind, 'taint');
  assert.equal(draftReopened.result, null);
  const premature = await reopened.saveLegacyResponse({ sessionId: 'emptylegacy001', sampleId: 'sample-one', response: draft, complete: true });
  assert.equal(premature.ok, false);
  assert.equal((await reopened.getLegacyResponse('emptylegacy001', 'sample-one')).complete, false);

  for (const n of [1, 3, 5, 8]) {
    const id = n === 1 ? 'emptylegacy001' : `legacy-count-${n}`;
    const entry = n === 1 ? sample('one', 1) : sample(String(n), n);
    if (n !== 1) await reopened.saveSessionWithSamples({ sessionUUID: id, cuppingForm: 2, cuppingMode: 'open',
      sessionName: `Legacy ${n}`, sessionDate: '7 Oct 2026', samples: [entry] });
    const result = await reopened.saveLegacyResponse({ sessionId: id, sampleId: entry.id, response: completedResponse(n), complete: true });
    assert.equal(result.ok, true);
    assert.equal(result.result.display_score, '86.00');
    assert.equal(result.result.adapted, n !== 5);
    assert.equal(result.result.label, n === 5 ? 'SCAA Legacy five-cup score' : 'Adapted — five-cup-equivalent Cup App score');
    const reopenedResult = await repositoryAfterRestart().getLegacyResponse(id, entry.id);
    assert.equal(reopenedResult.result.display_score, '86.00');
    const status = await reopened.getSessionSampleFinalStatus(id);
    assert.equal(status[entry.id].finalScore, '86.00');
    assert.equal(status[entry.id].resultLabel, result.result.label);
  }
  const tainted = { ...completedResponse(3), clean_cups: [2, 3],
    scored_defect: { kind: 'taint', description: 'Fermented cup', affected_cups: [1] },
    roast_shade_tick: 2, roast_level_note: 'Medium-looking', aroma_qualities: 'Citrus', notes: 'Dry finish',
    dry_aroma_intensity: 2, break_aroma_intensity: 3, wet_aroma_intensity: 4,
    acidity_intensity: 5, body_level: 1 };
  const taintResult = await reopened.saveLegacyResponse({ sessionId: 'legacy-count-3', sampleId: 'sample-3', response: tainted, complete: true });
  assert.equal(taintResult.ok, true);
  assert.equal(taintResult.result.display_score, '79.33');
  const taintReopened = await repositoryAfterRestart().getLegacyResponse('legacy-count-3', 'sample-3');
  assert.deepEqual(taintReopened.response.scored_defect, tainted.scored_defect);
  assert.equal(taintReopened.response.wet_aroma_intensity, 4);
  assert.equal(taintReopened.result.display_score, '79.33');
  const conflicting = { ...tainted, clean_cups: [1, 2, 3] };
  const rejected = await reopened.saveLegacyResponse({ sessionId: 'legacy-count-3', sampleId: 'sample-3', response: conflicting, complete: true });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.includes('scored_defect.affected_cups:marked_clean'));
  assert.equal((await reopened.getLegacyResponse('legacy-count-3', 'sample-3')).result.display_score, '79.33');
  console.log('Legacy empty pin, Open-only mode, fail-closed scan, draft/reopen, 1/3/5/8-cup scoring passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
