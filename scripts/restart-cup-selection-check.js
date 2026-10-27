// R155 actual persisted Details/SQLite/native-mock restart selection and fencing.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {fixture}=require('./helpers/sample-code-fixture'),{seed,loadUi,read,prop}=require('./unverified-drawer-restart-check'),{prepare,write,check,cmd,D,current,meta,snapshot,codes}=require('./direct-cup-reassignment-check');
const S='recoveryload01',canonical=require('../src/data/sampleCodeProfile').canonicalize,sha=require('../src/data/sampleCodeProfile').sha256;
function stored(env){return JSON.stringify(Object.fromEntries(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'local_pending_direct_reassignments' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])));}
async function main(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-r155-'));
 for(const [form,mode]of [[1,'blind'],[1,'open'],[2,'open']])for(const smart of [false,true])for(const target of ['sameA','blankB','assignedB']){
  const env=fixture(path.join(dir,`${form}-${mode}-${smart}-${target}.db`)),a=await seed(env,form,smart,mode);env.restart();const h=await loadUi(env,form,smart,a.frozen.payload),oldRoot=a.pending.operationId,oldCode=a.pending.candidate.sampleCode;
  h.sheetCoffeeNameOrigin='CURRENT EDITS';h.sheetProcess='3';h.sheetCupNumber=3;h.sheetCuppingMode=mode;
  h.tagId=target==='sameA'?'04AA':'04BB';h.physicalPayload=target==='sameA'?a.frozen.payload:target==='blankB'?{}:meta(form);
  await h.run('handleScanCup');assert.equal(h.reads,0);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM local_pending_direct_reassignments WHERE operation_id=?').get(oldRoot).n,0);assert.equal(h.sheetCoffeeNameOrigin,'CURRENT EDITS');assert.equal(h.sheetCuppingMode,mode);assert.equal(h.isSheetCuppingModeDefault,false);
  if(target==='assignedB'){
   assert(h.cupReassignmentPrompt,'B assigned needs NEW warning');assert.equal(h.writes.length,0);assert.equal(codes(env),1);await h.run('handleConfirmCupReassignment',h.cupReassignmentPrompt);assert.notEqual(h.cupReassignment.operationId,oldRoot);await h.run('handleCupReassignmentModalDismiss',h.cupReassignmentLaunch);assert.equal(h.writes.length,1);assert.equal(h.samples.length,0);await h.run('handleDirectCupReassignmentAction',h.cupReassignmentDialog);
  }else{assert.equal(h.cupReassignmentPrompt,null);assert.equal(h.writes.length,1);assert(h.pendingAdditionRef.current);await h.run('handleScanToCheckCup');}
  assert.equal(codes(env),2);assert.equal(h.samples.length,1);assert.notEqual(h.samples[0].sampleCode,oldCode);assert.equal(h.samples[0].coffeeNameOrigin,'CURRENT EDITS');assert.equal(h.samples[0].cupUUID,target==='sameA'?'04AA':'04BB');assert.equal(h.sessionStatus,'new');assert.equal(h.writes[0].text4.p,3);assert.equal(h.writes[0].text4.y,3);assert.equal(h.writes[0].text4.m,mode==='blind'?'b':'o');assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM local_direct_reassignment_receipts').get().n,target==='assignedB'?1:0);env.sqlite.close();
 }
 console.log('PASS actual on-disk A unfinished→restart→sameA/blankB/assignedB BOTH families/CVA Blind+Open/Legacy Open: edits retained, fresh B consent, fresh spent code, separate Check1/DRAFT, no fabricated A receipt.');
 for(const kind of ['ntag','smart'])for(const form of [1,2]){
  const x=await prepare(kind,form),held=await write(x),before=stored(x.env),oldCommand=cmd(x);
  await x.env.repo.abandonUnverifiedDirectCupReassignment(oldCommand);assert.equal(stored(x.env),before);assert.equal(await x.env.repo.getDirectCupReassignment({destinationId:D}),null);assert.equal(codes(x.env),1);
  for(const run of [()=>x.env.repo.prepareDirectCupReassignmentWrite({...oldCommand,readResult:require('./direct-cup-reassignment-check').read(kind,form),drawerDraft:x.drawer}),()=>held.beforeWrite(),()=>x.env.repo.inspectDirectCupReassignmentWrite({...oldCommand,readResult:require('./direct-cup-reassignment-check').read(kind,form,{payload:x.frozen.payload,state:1})}),()=>x.env.repo.commitDirectCupReassignment(oldCommand),()=>x.env.repo.stageDirectCupReassignment({observation:x.prompt.observation,consentVersion:1,drawerDraft:x.drawer,isCurrent:current})])await assert.rejects(run());
  assert.equal(stored(x.env),before);assert.equal(await x.env.repo.getDirectCupReassignment({destinationId:D}),null);x.env.sqlite.close();
  const verified=await prepare(kind,form);await write(verified);await check(verified);const snap=snapshot(verified.env);await assert.rejects(verified.env.repo.abandonUnverifiedDirectCupReassignment(cmd(verified)));assert.equal(snapshot(verified.env),snap);verified.env.sqlite.close();
 }
 // A stage callback captured before abandonment cannot recreate consent later.
 {const x=await prepare();await write(x);const transaction=x.env.bridge.withExclusiveTransactionAsync;let hold=true,entered,release;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
  x.env.bridge.withExclusiveTransactionAsync=callback=>{if(hold){hold=false;entered();return wait.then(()=>transaction(callback));}return transaction(callback);};
  const stale=x.env.repo.stageDirectCupReassignment({observation:x.prompt.observation,consentVersion:1,drawerDraft:x.drawer,isCurrent:current});await ready;await x.env.repo.abandonUnverifiedDirectCupReassignment(cmd(x));release();await assert.rejects(stale);assert.equal(await x.env.repo.getDirectCupReassignment({destinationId:D}),null);x.env.sqlite.close();
 }
 // Postcommit acknowledgement cannot claim empty state over newer pending work.
 {const x=await prepare();await write(x);const old=x.env.sqlite.prepare('SELECT * FROM local_pending_direct_reassignments').get();x.env.afterCommit(()=>{const p=JSON.parse(old.content_json);p.operationId='99999999-9999-4999-8999-999999999999';p.revision=1;p.attempt=null;p.priorAttempts=[];p.verification=null;const json=canonical(p);x.env.sqlite.prepare('INSERT INTO local_pending_direct_reassignments VALUES(?,?,?,?,?,?,?,?,?)').run(D,p.operationId,p.actor,p.incarnation,p.original.uid,p.version,'consented',json,sha(json));});await assert.rejects(x.env.repo.abandonUnverifiedDirectCupReassignment(cmd(x)));assert.equal((await x.env.repo.getDirectCupReassignment({destinationId:D})).operationId,'99999999-9999-4999-8999-999999999999');x.env.sqlite.close();}
 console.log('PASS abandonment exact actor/context/revision/verified safeguards, immutable ledger/history, stale prepare/beforeWrite/check/commit/consent deny; held captured consent and replacement-pending ack races.');
 for(const attack of ['actor','revision','current','deleteABA','rollback']){
  const x=await prepare();await write(x);const command=cmd(x);
  if(attack==='actor')x.env.actor(x.env.actorB);if(attack==='revision')command.expectedRevision--;if(attack==='current')command.isCurrent=()=>false;
  if(attack==='deleteABA'){await x.env.repo.deleteSessionById(D);await x.env.create(D,1,null,false);}if(attack==='rollback')x.env.failAt('DELETE FROM local_pending_direct_reassignments');const before=snapshot(x.env);
  await assert.rejects(x.env.repo.abandonUnverifiedDirectCupReassignment(command));x.env.failAt(null);assert.equal(snapshot(x.env),before,attack+' exact nonmutation');x.env.sqlite.close();
 }
 for(const failure of ['stage','exhausted']){
  const env=fixture(),a=await seed(env,1,false,'blind'),h=await loadUi(env,1,false,a.frozen.payload);h.tagId='04BB';h.physicalPayload={};
  if(failure==='stage')env.failAt('INSERT INTO local_pending_sample_additions');else{const insert=env.sqlite.prepare('INSERT OR IGNORE INTO issued_sample_codes VALUES(?,?,?)');for(const [i,code]of require('../src/data/sampleCodeProfile').POOL.entries())insert.run(S,code,`88888888-8888-4888-8888-${String(i).padStart(12,'0')}`);}
  const spent=codes(env);await h.run('handleScanCup');env.failAt(null);assert.equal(h.writes.length,0);assert.equal(h.samples.length,0);assert.equal(h.checkingSampleId,null);assert.equal(h.cupReassignmentDialog,null);assert.equal(h.isAddSheetVisible,true);assert.equal(codes(env),spent);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM local_pending_direct_reassignments').get().n,0,'explicit abandonment persists without a fake receipt/member');env.sqlite.close();
 }
 console.log('PASS new abandonment wrong actor/revision/current/deleteABA/DELETE rollback exact nonmutation; fresh Add stage failure/exhaustion no write/member/Check, spent codes retained.');
 // Definite preflight failure stays editable, while a possibly dispatched error
 // keeps Check. No successful command/receipt/member is inferred from a failure.
 for(const failure of ['read','prepare','beforeWrite','uncertain']){
  const x=await prepare(),{env}=x;const h=await loadUiForDirect(env,x);const deps=h.dependencies;h.dependencies=()=>({...deps(),readAndWriteNdefMinimal:async callback=>{if(failure==='read')throw Error('cancelled');const prepared=await callback(h.readResult());if(failure==='prepare')throw Error('capacity');if(failure==='beforeWrite'){env.actor(env.actorB);await prepared.beforeWrite();}else{await prepared.beforeWrite();h.writes.push(prepared.records);throw Error('uncertain dispatch');}}});await h.run('handleDirectCupReassignmentAction');
  assert.equal(h.samples.length,0);if(failure==='uncertain'){assert.equal(h.writes.length,1);assert.equal(h.cupReassignmentDialog.mode,'check');}else if(failure!=='beforeWrite'){assert.equal(h.writes.length,0);assert.equal(h.cupReassignmentDialog,null);assert.equal(h.isAddSheetVisible,true);}env.sqlite.close();
 }
 console.log('PASS direct definite read/capacity/preflight failure does not show Check; uncertain authorized dispatch retains Check; no early member.');
}
async function loadUiForDirect(env,x){const {ui}=require('./direct-cup-reassignment-screen-check'),template=ui(x.form,x.kind==='smart').h;template.env.sqlite.close();const previous=template.dependencies;template.sessionUUID=D;template.savedSessionIdRef.current=D;template.cupReassignment=x.pending;template.cupReassignmentRef.current=x.pending;template.physicalPayload=meta(x.form);template.tagId='04AABB';template.isAddSheetVisible=true;template.dependencies=()=>({...previous(),...env.repo});return template;}
main().catch(e=>{console.error(e);process.exitCode=1;});
