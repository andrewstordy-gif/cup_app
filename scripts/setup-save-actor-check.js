// Actual isolated SQLite and actual setup Save; no phone database or NFC radio.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {fixture}=require('./helpers/sample-code-fixture');
const helper=path.join(__dirname,'sample-code-screen-check.js'),mod=new Module(helper,module),source=fs.readFileSync(helper,'utf8');
mod.filename=helper;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(source.slice(0,source.indexOf('\nasync function main(){'))+'\nmodule.exports={harness};',helper);
const {harness}=mod.exports,S='nfzyy8y0pqizn6';
function snapshot(env){return JSON.stringify(Object.fromEntries(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])));}
async function prepare(form,kind){
 const env=fixture();await env.repo.getSessionById(S);
 const input={sessionUUID:S,existingSessionId:null,sessionName:'Fictional setup',sessionType:'4',sessionDate:'24 Oct 2026',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[],intent:'setup',sessionDisplayId:'ORIGINAL'};
 if(kind==='empty'){await env.repo.saveSessionWithSamples(input);return {env,input:{...(await env.repo.getOwnedSessionSetup(S)),existingSessionId:S,intent:'setup',sessionDisplayId:'UPDATED'}};}
 if(kind==='populated'){
  const h=harness(env,form,S);h.tagId='TAG1';await h.run('handleScanCup');await h.run('handleScanToCheckCup');
  return {env,input:{...(await env.repo.getOwnedSessionSetup(S)),existingSessionId:S,intent:'setup',sessionDisplayId:'UPDATED'}};
 }
 return {env,input};
}
async function main(){
 for(const form of [1,2])for(const kind of ['new','empty','populated']){
  const {env,input}=await prepare(form,kind),result=await env.repo.saveSessionWithSamples(input);
  assert.deepEqual(result,{sessionId:S,status:'new',savedSampleCount:kind==='populated'?1:0});
  assert.equal(env.sqlite.prepare('SELECT local_creator_profile_id FROM sessions').get().local_creator_profile_id,env.actorA,'same actor preserves creator provenance');
  for(const boundary of kind==='populated'?['existing-sample','final-aggregate']:['final-aggregate']){
   const test=await prepare(form,kind),before=snapshot(test.env);let flipped=false;
   test.env.hook(sql=>{if(!flipped&&(boundary==='existing-sample'?sql.startsWith('SELECT id, created_at, cup_uuid AS'):sql.startsWith('SELECT 1 FROM local_tasting_revisions'))){flipped=true;test.env.actor(test.env.actorB);}});
   await assert.rejects(test.env.repo.saveSessionWithSamples(test.input),/actor_changed/);test.env.hook(null);assert(flipped,`${kind} reached ${boundary}`);assert.equal(snapshot(test.env),before,'actor switch rolls back every row, ledger, sample and history write');
  }
  const after=await prepare(form,kind);let committed;
  after.env.afterCommit(()=>{committed=snapshot(after.env);after.env.actor(after.env.actorB);});
  await assert.rejects(after.env.repo.saveSessionWithSamples(after.input),/actor_changed/);assert(committed);assert.equal(snapshot(after.env),committed,'postcommit actor switch rejects acknowledgement without undoing committed rows');
  assert.equal(after.env.sqlite.prepare('SELECT session_display_id FROM sessions').get().session_display_id,after.input.sessionDisplayId);
  console.log(`PASS setup SAVE form${form} ${kind}: same-profile success, transaction rollback and postcommit acknowledgement actor fence.`);
 }
 for(const form of [1,2]){
  const {env,input}=await prepare(form,'new'),before=snapshot(env);
  await assert.rejects(env.repo.saveSessionWithSamples({...input,samples:[{id:env.actorB,cupUUID:'TAG1',sampleCode:'A4',cupNumber:5,cuppingForm:form,cuppingMode:form===2?'open':'blind',sampleNumber:1,coffeeNameOrigin:'Fictional',process:'1'}]}),/Check Cup/);
  assert.equal(snapshot(env),before,'new populated creation cannot bypass existing verification requirement');
  const populated=await prepare(form,'populated'),h=harness(populated.env,form,S);h.sessionId=S;h.savedSessionIdRef.current=S;h.samples=(await populated.env.repo.getOwnedSessionSetup(S)).samples;h.tagId='TAG2';h.physicalPayload=null;
  await h.run('handleScanCup');const pending=h.pendingAdditionRef.current;assert(pending);
  await populated.env.repo.markPendingSampleAdditionVerified({sessionId:S,operationId:pending.operationId,physicalUID:pending.candidate.cupUUID,tagContext:pending.tagContext,payload:pending.payload});
  const beforePending=snapshot(populated.env);let flipped=false;populated.env.hook(sql=>{if(!flipped&&sql.startsWith('SELECT id, created_at, cup_uuid AS')){flipped=true;populated.env.actor(populated.env.actorB);}});
  await assert.rejects(populated.env.repo.saveSessionWithSamples({...pending.saveInput,pendingSampleOperationId:pending.operationId}),/actor_changed|profile/);populated.env.hook(null);assert(flipped);assert.equal(snapshot(populated.env),beforePending,'verified pending addition remains recoverable; no early membership/outcome after actor switch');
 }
 const fresh=fixture();fresh.storage.delete('cup_app:user_profile');await fresh.repo.saveSessionWithSamples({sessionUUID:S,sessionName:'Fictional',sessionType:'4',sessionDate:'24 Oct 2026',cuppingForm:1,cuppingMode:null,samples:[],intent:'setup'});
 const profile=JSON.parse(fresh.storage.get('cup_app:user_profile'));assert.equal(fresh.sqlite.prepare('SELECT local_creator_profile_id FROM sessions').get().local_creator_profile_id,profile.uuid,'existing new-profile initialization retained');
 console.log('PASS verified addition rollback, invalid new populated denial and unchanged new-profile initialization; software SQLite only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
