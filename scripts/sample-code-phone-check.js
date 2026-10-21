const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,createCvaDraft}=require('./helpers/sample-code-fixture');
const {POOL,parseMetadata,validateMetadata}=require('../src/data/sampleCodeProfile');
const S='nfzyy8y0pqizn6';
async function prepare(env,form=1){await env.repo.saveSessionWithSamples({sessionUUID:S,sessionName:'Test session',sessionType:'4',sessionDate:'21 Oct 2026',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[],intent:'setup'});}
async function attempt(env,uid='CUPA',name='Coffee A',expectedOperationId=null){
  const setup=await env.repo.getOwnedSessionSetup(S);
  const candidate={id:'candidate',cupUUID:uid,cupNumber:5,cuppingForm:setup.cuppingForm,cuppingMode:setup.cuppingForm===2?'open':'blind',sampleNumber:setup.samples.length+1,coffeeNameOrigin:name,process:'1'};
  return env.repo.stagePendingSampleAddition({sessionId:S,expectedOperationId,candidate,tagContext:{kind:'ntag'},saveInput:{sessionUUID:S,existingSessionId:S,sessionDisplayId:setup.sessionDisplayId,sessionName:setup.sessionName,sessionType:setup.sessionType,sessionDate:setup.sessionDate,cuppingForm:setup.cuppingForm,cuppingMode:setup.cuppingMode,samplesInSession:setup.samplesInSession,status:setup.status,samples:[...setup.samples,candidate],intent:'setup'}});
}
async function written(env,p){return env.repo.markPendingSampleAdditionWritten({sessionId:S,operationId:p.operationId});}
async function verified(env,p,overrides={}){return env.repo.markPendingSampleAdditionVerified({sessionId:S,operationId:p.operationId,payload:p.payload,physicalUID:p.candidate.cupUUID,tagContext:p.tagContext,...overrides});}
async function main(){
  for(const form of [1,2]){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-code-phone-')),env=fixture(path.join(dir,'test.db'));
    await prepare(env,form);
    const duplicate=fixture();await prepare(duplicate,form);const concurrent=await Promise.allSettled([attempt(duplicate),attempt(duplicate)]);
    assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);assert.equal(duplicate.sqlite.prepare('SELECT COUNT(*) AS n FROM issued_sample_codes').get().n,1,'concurrent stale commands cannot reserve twice');
    env.failAt('INSERT INTO local_pending_sample_additions');await assert.rejects(attempt(env),/injected/);env.failAt(null);
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM issued_sample_codes').get().n,0,'stage failure rolls reservation back before write');
    let a=await attempt(env);assert.equal((await env.repo.getOwnedSessionSetup(S)).samples.length,0);
    await assert.rejects(verified(env,a),/changed/,'write acknowledgement is required before check');
    a=await written(env,a);env.restart();assert.equal((await env.repo.getPendingSampleAddition(S)).payload.z,a.payload.z);
    const b=await attempt(env,'CUPB','Edited coffee',a.operationId);assert.notEqual(a.payload.z,b.payload.z);assert.notEqual(a.candidate.id,b.candidate.id);
    assert.equal(b.payload.n,'Edited coffee');assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM issued_sample_codes').get().n,2);
    await assert.rejects(written(env,a),/changed/);await assert.rejects(verified(env,a),/changed/);
    const c=await attempt(env,'CUPB','Edited coffee',b.operationId);assert.notEqual(c.payload.z,b.payload.z,'rewrite gets fresh code');
    await written(env,c);await assert.rejects(verified(env,c,{physicalUID:'CUPA'}),/changed/);
    await assert.rejects(verified(env,c,{payload:{...c.payload,z:a.payload.z}}),/changed/);
    await assert.rejects(verified(env,c,{payload:{...c.payload,i:c.payload.i+1}}),/changed/);
    env.actor(env.actorB);await assert.rejects(verified(env,c),/local profile/);env.actor(env.actorA);
    await verified(env,c);env.failAt('INSERT INTO samples');await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:S,operationId:c.operationId}),/injected/);env.failAt(null);
    env.restart();assert.equal((await env.repo.getPendingSampleAddition(S)).phase,'verified');
    await env.repo.commitPendingSampleAddition({sessionId:S,operationId:c.operationId});await env.repo.commitPendingSampleAddition({sessionId:S,operationId:c.operationId});
    const setup=await env.repo.getOwnedSessionSetup(S);assert.equal(setup.samples.length,1);assert.equal(setup.samples[0].sampleCode,c.payload.z);assert.equal(setup.status,'new');
    assert.equal(setup.samples[0].coffeeNameOrigin,'Edited coffee');assert.equal(await env.repo.getPendingSampleAddition(S),null);
    await assert.rejects(attempt(env,'CUPB'),/committed/);
    const d=await attempt(env,'CUPD');await written(env,d);await verified(env,d);await env.repo.commitPendingSampleAddition({sessionId:S,operationId:d.operationId});
    assert.equal((await env.repo.getOwnedSessionSetup(S)).samples.length,2);
    assert.equal(await env.repo.findActiveSampleByCupUUID('CUPB'),null,'UID-only fallback never opens scores');
    // A separate participant store observes two different codes on one physical UID.
    const participant=fixture();const scored=await participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:'SAMEUID',metadata:a.payload});
    if(form===1){const loaded=await participant.repo.getCvaResponse(S,scored.sampleId);const response={...createCvaDraft(5),ratings:{...createCvaDraft(5).ratings,fragrance:7}};await participant.repo.saveCvaResponse({sessionId:S,sampleId:scored.sampleId,response,expectedRevision:loaded.revision,expectedIdentity:loaded.trusted.identity,expectedCupCount:5});}
    else {const loaded=await participant.repo.getLegacyResponse(S,scored.sampleId);const saved=await participant.repo.saveLegacyResponse({sessionId:S,sampleId:scored.sampleId,response:{quality_ratings:{fragrance_aroma:28}},expectedFingerprint:loaded.savedFingerprint});assert.equal(saved.ok,true);}
    let p=await participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:'SAMEUID',metadata:c.payload});
    assert.equal((await participant.repo.getSessionById(S)).samples.length,2);assert.notEqual(p.sampleId,(await participant.repo.getSessionById(S)).samples[0].id);
    const first=await participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:'SAMEUID',metadata:a.payload});
    assert.equal((await participant.repo.getSessionById(S)).samples.length,2);
    assert.notEqual(first.sampleId,p.sampleId);
    if(form===1){assert.equal((await participant.repo.getCvaResponse(S,first.sampleId)).response.ratings.fragrance,7);assert.equal((await participant.repo.getCvaResponse(S,p.sampleId)).response,null);}
    else {assert.equal((await participant.repo.getLegacyResponse(S,first.sampleId)).response.quality_ratings.fragrance_aroma,28);assert.equal((await participant.repo.getLegacyResponse(S,p.sampleId)).response,null);}
    await assert.rejects(participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:'SAMEUID',metadata:{...a.payload,y:4}}),/conflicts/);
    await assert.rejects(participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:'SAMEUID',metadata:{...a.payload,z:2}}),/Unsupported/);
    // Losing issuer provenance must not restart the pool on a scanned session.
    await assert.rejects(participant.repo.stagePendingSampleAddition({sessionId:S,candidate:c.candidate,saveInput:c.saveInput,tagContext:{kind:'ntag'}}),/local profile/);
    const ack=fixture();ack.hook(sql=>{if(sql.startsWith('SELECT sample_code AS code FROM samples'))ack.actor(ack.actorB);});
    await assert.rejects(ack.repo.resolveActiveSampleFromCupMetadata({cupUUID:'ACK-TAG',metadata:a.payload}),/actor_changed/,'final acknowledgement read cannot return another actor context');
    const exhaustion=fixture();await prepare(exhaustion,form);
    for(let index=0;index<POOL.length;index++)exhaustion.sqlite.prepare('INSERT INTO issued_sample_codes(session_id,code,operation_id) VALUES (?,?,?)').run(S,POOL[index],`op-${index}`);
    await assert.rejects(attempt(exhaustion),/1,296/);assert.equal(exhaustion.sqlite.prepare('SELECT COUNT(*) AS n FROM issued_sample_codes').get().n,1296);
    exhaustion.sqlite.prepare('DELETE FROM issued_sample_codes WHERE code=?').run('00');
    const zero=await attempt(exhaustion);assert.equal(zero.payload.z,'00');assert.equal(typeof zero.payload.z,'string');
    const metadata=validateMetadata({...zero.payload,n:'Coffee "z": \\ 🙂'});assert.deepEqual(parseMetadata(JSON.stringify(metadata)),metadata);
    await written(exhaustion,zero);await verified(exhaustion,zero);await exhaustion.repo.commitPendingSampleAddition({sessionId:S,operationId:zero.operationId});assert.equal((await exhaustion.repo.getOwnedSessionSetup(S)).samples[0].sampleCode,'00');
  }
  console.log('PASS R1-103: actual repository + SQLite stage rollback, durable codes/restart, A-to-B edits, fresh rewrite, stale/actor/target/payload rejection, verified save-only recovery/idempotent insert, both forms, same-UID distinct code identities, strict numeric rejection, exhaustion and code 00. Software-only; no physical NFC.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
