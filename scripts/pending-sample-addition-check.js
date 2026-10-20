const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const load=require('./helpers/load-project-module');
const {fixture}=require('./helpers/session-state-fixture');
const root=path.resolve(__dirname,'..');
const {buildCompactSessionMetadata,normalizePositiveInteger}=load(root,{
  '../../../utils/secureIdentifiers':{generateDomainId:()=> 'test-id',generateSessionReference:()=> 'test-session'},
})('src/features/cupping/constants/sessionDetails.js');
async function prepare(env,id='session',form=1) {
  await env.repo.saveSessionWithSamples({sessionUUID:id,sessionName:'Test session',sessionType:'4',sessionDate:'20 Oct 2026',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[],intent:'setup'});
}
async function request(env,id='session',overrides={}) {
  const setup=await env.repo.getOwnedSessionSetup(id);
  const candidate={id:'new-sample',cupUUID:'TAG-PENDING',cupNumber:5,cuppingForm:setup.cuppingForm,cuppingMode:setup.cuppingForm===2?'open':'blind',sampleNumber:setup.samples.length+1,coffeeNameOrigin:'Test coffee',process:'1',...overrides};
  const index=setup.samples.findIndex(s=>s.cupUUID===candidate.cupUUID);
  const samples=setup.samples.slice(); if(index>=0)samples[index]=candidate;else samples.push(candidate);
  const saveInput={sessionUUID:id,existingSessionId:id,sessionDisplayId:setup.sessionDisplayId,sessionName:setup.sessionName,sessionType:setup.sessionType,
    sessionDate:setup.sessionDate,cuppingForm:setup.cuppingForm,cuppingMode:setup.cuppingMode,samplesInSession:setup.samplesInSession,status:setup.status,samples,intent:'setup'};
  const payload=buildCompactSessionMetadata({...candidate,sessionUUID:id,sessionName:saveInput.sessionName,sessionType:saveInput.sessionType,sessionDate:saveInput.sessionDate,
    samplesInSession:normalizePositiveInteger(saveInput.samplesInSession,Math.max(setup.samples.length,candidate.sampleNumber))});
  return {sessionId:id,candidate,saveInput,payload};
}
async function main() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-pending-add-'));
  const env=fixture(path.join(dir,'recovery.db')); await prepare(env);
  let input=await request(env); env.failAt('INSERT INTO local_pending_sample_additions');
  await assert.rejects(env.repo.stagePendingSampleAddition(input),/injected/);env.failAt(null);
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,0);
  assert.equal(await env.repo.getPendingSampleAddition('session'),null);
  let pending=await env.repo.stagePendingSampleAddition(input);
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,0,'staging is not membership');
  await assert.rejects(env.repo.saveSessionWithSamples(input.saveInput),/pending cup check/);
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId}),/changed/);
  env.restart();
  let recovered=await env.repo.getPendingSampleAddition('session');
  assert.equal(recovered.candidate.coffeeNameOrigin,'Test coffee');assert.equal(recovered.phase,'check');
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,0);
  env.actor(env.actorB);await assert.rejects(env.repo.getPendingSampleAddition('session'),/local profile/);env.actor(env.actorA);
  await assert.rejects(env.repo.markPendingSampleAdditionVerified({sessionId:'session',operationId:pending.operationId,payload:{...pending.payload,n:'Changed'}}),/changed/);
  const oldToken=pending.operationId;
  pending=await env.repo.stagePendingSampleAddition({...input,expectedOperationId:oldToken});
  assert.notEqual(pending.operationId,oldToken);
  await assert.rejects(env.repo.markPendingSampleAdditionVerified({sessionId:'session',operationId:oldToken,payload:pending.payload}),/changed/);
  await env.repo.markPendingSampleAdditionVerified({sessionId:'session',operationId:pending.operationId,payload:pending.payload});
  env.failAt('INSERT INTO samples');
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId}),/injected/);env.failAt(null);
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,0);
  assert.equal((await env.repo.getPendingSampleAddition('session')).phase,'verified','local commit failure retains verified evidence');
  env.restart();
  const originalTransaction=env.bridge.withExclusiveTransactionAsync;
  env.bridge.withExclusiveTransactionAsync=callback=>originalTransaction(async txn=>callback({...txn,
    runAsync:async(sql,args)=>{const result=await txn.runAsync(sql,args);if(sql.startsWith('DELETE FROM local_pending_sample_additions'))env.actor(env.actorB);return result;},
  }));
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId}),/actor_changed/);
  env.actor(env.actorA);env.bridge.withExclusiveTransactionAsync=originalTransaction;
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,0,'actor change during delete rolls back membership');
  assert.equal((await env.repo.getPendingSampleAddition('session')).phase,'verified');
  env.afterCommit(()=>env.afterCommit(()=>env.actor(env.actorB)));
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId}),/actor_changed/);
  env.actor(env.actorA);
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,1);
  assert.equal(await env.repo.getPendingSampleAddition('session'),null);
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId}),/changed/);
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples.length,1);
  // A duplicate-cup replacement preserves old membership until verified commit.
  input=await request(env,'session',{id:'new-sample',sampleNumber:1,coffeeNameOrigin:'Replacement'});
  pending=await env.repo.stagePendingSampleAddition(input);
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples[0].coffeeNameOrigin,'Test coffee');
  await env.repo.markPendingSampleAdditionVerified({sessionId:'session',operationId:pending.operationId,payload:pending.payload});
  await env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId});
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples[0].id,'new-sample');
  assert.equal((await env.repo.getOwnedSessionSetup('session')).samples[0].coffeeNameOrigin,'Replacement');
  // Global target reservation and whole-session delete cascade.
  await prepare(env,'another'); input=await request(env,'session',{id:'second-sample',cupUUID:'OTHER-TAG'}); pending=await env.repo.stagePendingSampleAddition(input);
  await assert.rejects(env.repo.stagePendingSampleAddition(await request(env,'another',{id:'another-sample',cupUUID:'OTHER-TAG'})),/unfinished assignment/);
  await env.repo.deleteSessionById('session');
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM local_pending_sample_additions').get().n,0);
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:'session',operationId:pending.operationId}));
  assert.equal(await env.repo.getSessionById('session'),null);
  // A changed setup fingerprint cannot be blessed by a new read or commit.
  input=await request(env,'another'); pending=await env.repo.stagePendingSampleAddition(input);
  env.sqlite.prepare("UPDATE sessions SET session_name='Newer setup' WHERE id='another'").run();
  await assert.rejects(env.repo.getPendingSampleAddition('another'),/changed or is unavailable/);
  await env.repo.deleteSessionById('another');
  await prepare(env,'legacy',2); input=await request(env,'legacy');pending=await env.repo.stagePendingSampleAddition(input);
  await env.repo.markPendingSampleAdditionVerified({sessionId:'legacy',operationId:pending.operationId,payload:pending.payload});
  await env.repo.commitPendingSampleAddition({sessionId:'legacy',operationId:pending.operationId});
  assert.equal((await env.repo.getOwnedSessionSetup('legacy')).samples[0].cuppingForm,2);
  // Corrupt recovery is unavailable, ordinary saved sessions remain readable.
  input=await request(env,'legacy',{id:'legacy-second',cupUUID:'SECOND-LEGACY'});await env.repo.stagePendingSampleAddition(input);
  env.sqlite.prepare("UPDATE local_pending_sample_additions SET content_json='damaged' WHERE session_id='legacy'").run();
  await assert.rejects(env.repo.getPendingSampleAddition('legacy'),/changed or is unavailable/);
  assert.equal((await env.repo.getSessionById('legacy')).samples.length,1);
  console.log('Pending sample SQLite checks PASS: stage isolation, restart/verified recovery, actor/token/payload/fingerprint guards, replacement, rollback, delete cascade, reservation and two forms.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
