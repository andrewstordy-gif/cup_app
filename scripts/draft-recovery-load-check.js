// FULL actual Details load effect + actual repository/on-disk synthetic SQLite.
// No React mounting, phone data, native NFC or automatic physical operations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {execFileSync}=require('node:child_process'),{parse}=require('@babel/parser'),generate=require('@babel/generator').default;
const {fixture}=require('./helpers/sample-code-fixture'),load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..'),screen=path.join(root,'src/features/cupping/screens/CuppingSessionDetailsScreen.js');
const source=fs.readFileSync(screen,'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v]){const r=find(c,p);if(r)return r;}return null;}
const effect=structuredClone(find(ast,n=>n.type==='CallExpression'&&n.callee?.name==='useEffect'&&find(n.arguments[0],x=>x.type==='VariableDeclarator'&&x.id?.name==='loadSessionForEditing')).arguments[0]);
// Capture only the existing invocation's Promise; every load branch remains actual.
const invocation=find(effect,n=>n.type==='ExpressionStatement'&&n.expression?.callee?.name==='loadSessionForEditing');
invocation.expression={type:'CallExpression',callee:{type:'Identifier',name:'trackLoad'},arguments:[invocation.expression]};
const helper=path.join(__dirname,'sample-code-screen-check.js'),mod=new Module(helper,module),helperText=fs.readFileSync(helper,'utf8');mod.filename=helper;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(helperText.slice(0,helperText.indexOf('\nasync function main(){'))+'\nmodule.exports={harness};',helper);
const identity=load(root)('src/features/cupping/screens/savedSessionIdentity.js'),S='recoveryload01';
const raw=(uid,metadata)=>({tag:{id:uid,ndefMessage:[{tnf:1,type:[84],payload:[2,101,110,...Buffer.from(JSON.stringify(metadata))]}]},recordCount:1});
function snapshot(env){return JSON.stringify(Object.fromEntries(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])));}
function fullLoad(env,form){
 const h=mod.exports.harness(env,form,S),previous=h.dependencies;h.sessionId=S;let promise;
 h.dependencies=()=>{const deps={...previous(),...identity,quickStartSessionTypeValue:null,presentationRevision:0,trackLoad:p=>{promise=p;},logAppError:()=>{}};
  for(const name of ['SetupAccess','TastingPresentation','SessionUUID','SessionDisplayId','SessionDate','SamplesInSession','SessionForm','SessionMode','SavedOpenEvidence','SessionTypeAnchor','CupReassignment','DraftRemoval'])deps['set'+name]=value=>{h[name[0].toLowerCase()+name.slice(1)]=value;};
  deps.restoreCupReassignmentFields=p=>{h.restoredReassignment=p;};return deps;};
 const deps=h.dependencies(),cleanup=new Function(...Object.keys(deps),'return ('+generate(effect).code+')')(...Object.values(deps))();
 return {h,cleanup,done:()=>promise};
}
async function empty(env,form){await env.repo.saveSessionWithSamples({sessionUUID:S,sessionName:'Recovery fixture',sessionType:'4',sessionDate:'26 Oct 2026',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[],intent:'setup'});}
async function addition(env,form,phase){const setup=await env.repo.getOwnedSessionSetup(S),candidate={id:'temporary',cupUUID:'04AA',cupNumber:2,cuppingForm:form,cuppingMode:form===2?'open':'blind',sampleNumber:1,coffeeNameOrigin:'Restored coffee',process:'2'};
 const p=await env.repo.stagePendingSampleAddition({sessionId:S,candidate,tagContext:{kind:'ntag'},saveInput:{...setup,sessionUUID:S,existingSessionId:S,samples:[candidate],intent:'setup'}});
 if(phase!=='staged')await env.repo.markPendingSampleAdditionWritten({sessionId:S,operationId:p.operationId});
 if(['verified','committed'].includes(phase))await env.repo.markPendingSampleAdditionVerified({sessionId:S,operationId:p.operationId,payload:p.payload,physicalUID:'04AA',tagContext:p.tagContext});
 if(phase==='committed')await env.repo.commitPendingSampleAddition({sessionId:S,operationId:p.operationId});return p;}
async function removal(env,form,phase){const added=await addition(env,form,'committed'),p=await env.repo.stageDraftSampleRemoval({sessionId:S,readResult:raw('04AA',added.payload)});
 if(phase!=='staged')await env.repo.beginDraftSampleRemovalWrite({sessionId:S,operationId:p.operationId,expectedBytesHash:p.frozen.bytesHash});
 if(['written','verified'].includes(phase))await env.repo.markDraftSampleRemovalWritten({sessionId:S,operationId:p.operationId});
 if(phase==='verified')await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:p.operationId,readResult:raw('04AA',{})});return p;}
function baseline(env){const original=fs.readFileSync,repository=path.join(root,'src/data/sessionRepository.js'),old=execFileSync('git',['show','44acf87:src/data/sessionRepository.js'],{cwd:root,encoding:'utf8'});fs.readFileSync=function(file,...args){return file===repository?old:original.call(fs,file,...args);};try{env.reload();}finally{fs.readFileSync=original;}}
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-recovery-load-'));
 for(const form of [1,2]){
  const red=fixture(path.join(dir,`red-${form}.db`));await empty(red,form);await addition(red,form,'staged');baseline(red);const broken=fullLoad(red,form);await broken.done();assert.equal(broken.h.setupAccess.failed,true,'baseline actual whole effect reproduces false ownership failure');assert.equal(broken.h.scanStatusMessage,'Failed to load session.');assert(await red.repo.getPendingSampleAddition(S));red.sqlite.close();
  for(const [kind,phases]of [['plain',['none']],['addition',['staged','check','verified']],['removal',['staged','writing','written','verified']]])for(const phase of phases){
   const env=fixture(path.join(dir,`${form}-${kind}-${phase}.db`));await empty(env,form);let pending=null;
   if(kind==='addition')pending=await addition(env,form,phase);if(kind==='removal')pending=await removal(env,form,phase);
   for(const restart of [false,true]){if(restart)env.restart();const before=snapshot(env),loaded=fullLoad(env,form);await loaded.done();
    assert.equal(loaded.h.setupAccess.canManageSetup,true,`${form}/${kind}/${phase} restored setup ownership`);assert.notEqual(loaded.h.setupAccess.failed,true);assert.equal(loaded.h.scanStatusMessage,'Loaded saved session.');assert.equal(loaded.h.sessionStatus,'new');assert.equal(loaded.h.writes.length,0);assert.equal(loaded.h.reads,0);assert.equal(loaded.h.cupReassignment,null);assert.equal(snapshot(env),before,'full reopen performs no member/code/history/journal writes');
    if(kind==='addition'){assert.equal(loaded.h.pendingAdditionRef.current.operationId,pending.operationId);assert.equal(loaded.h.pendingAdditionRef.current.phase,phase==='verified'?'verified':'check');assert.equal(loaded.h.pendingAdditionRef.current.writeCompleted,phase!=='staged');assert.equal(loaded.h.sheetCoffeeNameOrigin,'Restored coffee');assert.equal(loaded.h.sheetProcess,'2');assert.equal(loaded.h.sheetCupNumber,2);assert.equal(loaded.h.sheetCuppingMode,form===2?'open':'blind');}
    if(kind==='removal'){assert.equal(loaded.h.draftRemovalRef.current.operationId,pending.operationId);assert.equal(loaded.h.draftRemoval.phase,phase);assert.equal(loaded.h.pendingAdditionRef.current,null);}
   }env.sqlite.close();
  }
 }
 // Existing reassignment still follows its strict validated recovery branch.
 const {metadata}=require('./cup-reassignment-check');
 async function staged(env,form=1){const observation=await env.repo.inspectCupReassignment({destinationId:S,readResult:raw('04AA',metadata(form)),isCurrent:()=>true});return env.repo.stageCupReassignment({observation:observation.observation,consentVersion:1,drawerDraft:{coffeeNameOrigin:'Reassignment draft',process:'2',cupNumber:2,cuppingMode:form===2?'open':'blind'},isCurrent:()=>true});}
 for(const form of [1,2]){const env=fixture(path.join(dir,`reassign-${form}.db`));await empty(env,form);const pending=await staged(env,form);env.restart();const before=snapshot(env),loaded=fullLoad(env,form);await loaded.done();assert.equal(loaded.h.setupAccess.canManageSetup,true);assert.equal(loaded.h.cupReassignment.operationId,pending.operationId);assert.equal(loaded.h.restoredReassignment.operationId,pending.operationId);assert.equal(snapshot(env),before);env.sqlite.close();}
 // No null acknowledgement can silently cross actor/incarnation/row changes.
 for(const attack of ['actor','foreign','missingActor','current','finalActor','finalCurrent','deleted','deleteABA','rowAppears','rowReplaced','rowDeleted','malformed']){
  const env=fixture(path.join(dir,`race-${attack}.db`));await empty(env,1);let current=true;
  if(['rowAppears','rowReplaced','rowDeleted','malformed'].includes(attack))await staged(env);
  const row=env.sqlite.prepare('SELECT * FROM local_pending_cup_reassignments').get();
  const sessionRow=env.sqlite.prepare('SELECT * FROM sessions WHERE id=?').get(S),issuerRow=env.sqlite.prepare('SELECT * FROM sample_code_issuers WHERE session_id=?').get(S);
  const restoreRow=(table,value)=>env.sqlite.prepare(`INSERT INTO ${table} (${Object.keys(value).map(key=>'"'+key+'"').join(',')}) VALUES (${Object.keys(value).map(()=>'?').join(',')})`).run(...Object.values(value));
  const insert=()=>env.sqlite.prepare('INSERT INTO local_pending_cup_reassignments VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
  if(attack==='rowAppears')env.sqlite.exec('DELETE FROM local_pending_cup_reassignments');
  if(attack==='malformed')env.sqlite.exec("UPDATE local_pending_cup_reassignments SET content_hash='broken'");
  if(attack==='missingActor')env.storage.delete('cup_app:user_profile');
  else if(attack==='foreign')env.actor(env.actorB);
  else if(attack!=='malformed')env.afterCommit(()=>{
   if(attack==='actor')env.actor(env.actorB);
   if(attack==='current')current=false;
   if(attack==='finalActor')env.afterCommit(()=>env.actor(env.actorB));
   if(attack==='finalCurrent')env.afterCommit(()=>{current=false;});
   if(attack==='deleted')env.sqlite.exec('DELETE FROM sessions');
   if(attack==='deleteABA'){env.sqlite.exec('DELETE FROM sessions');restoreRow('sessions',sessionRow);restoreRow('sample_code_issuers',{...issuerRow,incarnation:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});}
   if(attack==='rowAppears')insert();
   if(attack==='rowReplaced')env.sqlite.exec("UPDATE local_pending_cup_reassignments SET operation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'");
   if(attack==='rowDeleted')env.sqlite.exec('DELETE FROM local_pending_cup_reassignments');
  });
  await assert.rejects(env.repo.getCupReassignment({destinationId:S,isCurrent:()=>current}),undefined,attack);
  if(attack==='missingActor')assert.equal(env.storage.has('cup_app:user_profile'),false,'read never initializes missing identity');
  env.sqlite.close();
 }
 {const env=fixture(path.join(dir,'cancel-load.db'));await empty(env,1);await addition(env,1,'staged');const before=snapshot(env),get=env.repo.getCupReassignment;let view;
  env.repo.getCupReassignment=async args=>{env.afterCommit(()=>view.cleanup());return get(args);};view=fullLoad(env,1);await view.done();assert.notEqual(view.h.setupAccess?.failed,true);assert.notEqual(view.h.scanStatusMessage,'Loaded saved session.');assert.equal(snapshot(env),before);assert.equal(view.h.writes.length,0);env.sqlite.close();}
 console.log('PASS red baseline/full actual Details effect then both-form plain/addition staged/written/verified/removal staged/writing/written/verified recovery before+after disk restart; no false ownership, duplicate/member/code/history or native effects; strict reassignment recovery and actor/current/incarnation/appearance/replacement/damaged-row races denied.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fullLoad,empty,addition,removal,raw,snapshot,S};
