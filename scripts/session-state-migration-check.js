const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixture } = require('./helpers/session-state-fixture');
const tables = ['sessions','samples','cva_response_revisions','legacy_responses','local_response_streams',
  'local_tasting_completions','sample_feedback_entries','sample_defect_entries','sample_flavour_observations'];
const additions = ['local_tasting_completion_events','local_tasting_revisions','local_legacy_recovery_drafts','local_session_foundations','local_session_state_schema'];
const snapshot = env => Object.fromEntries(tables.map(table => [table,env.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
function removeFoundation(env, version = 4) {
  for (const table of additions) env.sqlite.exec(`DROP TABLE ${table}`);
  env.sqlite.exec(`PRAGMA user_version=${version}`);
}
async function main() {
  const env = fixture(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-migration-')),'migration.db'));
  const sample = await env.create('old-complete');
  await env.save('old-complete',sample); await env.complete('old-complete');
  const originalProfile = env.storage.get('cup_app:user_profile');
  const row = env.sqlite.prepare('SELECT response_json,result_json FROM cva_response_revisions WHERE sample_id=?').get(sample);
  assert.equal(JSON.parse(row.result_json).display_score,'89.50');
  // Preserve unusual but valid raw JSON bytes, original timestamps, pins and adoption data.
  env.sqlite.prepare('UPDATE cva_response_revisions SET response_json=? WHERE sample_id=?').run(`\n ${row.response_json} \n`,sample);
  env.sqlite.prepare('UPDATE local_response_streams SET recovery_source_json=?, adoption_source_token=? WHERE sample_id=?').run(' {"old": "raw"} ','historical-token',sample);
  removeFoundation(env);
  const before = snapshot(env);
  env.failAt('CREATE TABLE local_tasting_revisions'); env.reload();
  await assert.rejects(env.repo.listSessions(),/injected/);
  assert.deepEqual(snapshot(env),before,'failed migration preserves exact original rows');
  assert.equal(env.sqlite.prepare('PRAGMA user_version').get().user_version,4);
  assert.equal(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='local_session_state_schema'").get(),undefined,'DDL rolled back');
  env.failAt(null);
  await env.repo.listSessions();
  assert.deepEqual(snapshot(env),before,'successful migration preserves all historical bytes');
  assert.equal(env.storage.get('cup_app:user_profile'),originalProfile);
  let presentation = await env.repo.getLocalTastingPresentation('old-complete');
  assert.equal(presentation.identityHidden,true,'old unqualified completion cannot automatically reveal');
  assert.equal(presentation.tasting.everCompleted,true);
  assert.equal(presentation.tasting.completed,false);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM local_tasting_completion_events').get().n,0);
  env.restart(); await env.repo.listSessions();
  assert.deepEqual(snapshot(env),before,'restart does not rerun status/data repairs');
  assert.equal(env.sqlite.prepare('PRAGMA user_version').get().user_version,5);
  assert.equal((await env.repo.getCvaResponse('old-complete',sample)).result.display_score,'89.50');
  // An old current actor can explicitly re-complete validated saved owned data;
  // that is a new operation, not migration manufacturing current completion.
  await env.complete('old-complete');
  assert.deepEqual(env.sqlite.prepare('SELECT * FROM local_tasting_completions').all(),before.local_tasting_completions);
  const done = snapshot(env);
  env.sqlite.exec('DROP TABLE local_tasting_revisions'); env.reload();
  await assert.rejects(env.repo.listSessions(),/damaged_schema/,'completed marker with missing table must fail closed');
  assert.deepEqual(snapshot(env),done);
  const partial = fixture();
  await partial.repo.listSessions();
  removeFoundation(partial);
  partial.sqlite.exec('CREATE TABLE local_session_foundations(session_id TEXT PRIMARY KEY)');
  partial.reload(); await assert.rejects(partial.repo.listSessions(),/damaged_schema/,'malformed partial key/type/check table rejected');
  const earlier = fixture();
  const earlierSample = await earlier.create('earlier'); await earlier.save('earlier',earlierSample);
  earlier.sqlite.exec('ALTER TABLE samples ADD COLUMN sample_colour TEXT');
  earlier.sqlite.prepare('UPDATE samples SET sample_colour=?').run('#historical');
  removeFoundation(earlier,0);
  const older = snapshot(earlier);
  earlier.reload(); await earlier.repo.listSessions();
  assert.deepEqual(snapshot(earlier),older,'older version must not drop colour, copy mode or rename saved statuses');
  // Unknown actor and scoring policy are retained, not certified.
  earlier.sqlite.prepare('DELETE FROM local_response_streams').run();
  earlier.sqlite.prepare('UPDATE cva_response_revisions SET calculation_policy=?').run('unknown-original-policy');
  assert.equal((await earlier.repo.getLocalTastingPresentation('earlier')).identityHidden,true);
  await assert.rejects(earlier.repo.getCvaResponse('earlier',earlierSample),/unsupported_saved_policy/);
  console.log('State migration: rollback/retry, raw JSON/89.5/pins/profile/history preservation, repeated/older/partial schemas and fail-closed corruption PASS.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
