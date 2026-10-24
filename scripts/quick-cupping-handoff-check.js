// Actual Details/Nav callbacks and isolated SQLite. No radio/device/app data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),os=require('node:os');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default;
const {fixture}=require('./helpers/sample-code-fixture');
const root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6',helper=path.join(__dirname,'sample-code-screen-check.js'),mod=new Module(helper,module);
mod.filename=helper;mod.paths=Module._nodeModulePaths(__dirname);const source=fs.readFileSync(helper,'utf8');mod._compile(source.slice(0,source.indexOf('\nasync function main(){'))+'\nmodule.exports={harness};',helper);const {harness}=mod.exports;
const ast=parse(fs.readFileSync(path.join(root,'src/navigation/AppNavigator.js'),'utf8'),{sourceType:'module',plugins:['jsx']});
function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v]){const x=find(c,p);if(x)return x;}return null;}
const expression=name=>find(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name).init;
const evaluate=(name,deps)=>new Function(...Object.keys(deps),'return ('+generate(expression(name)).code+')')(...Object.values(deps));
function snapshot(env){return JSON.stringify(Object.fromEntries(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])));}
function navigation(env,overrides={}){
 const ui={selected:null,route:null,warnings:[],pending:true};
 const deps={...env.repo,assessmentReadEpoch:{current:0},currentRoute:{current:'Cupping Session Details'},
  buildContextFromSessionSample:(sample,index,total,options)=>({sessionId:options.sessionId,sampleId:sample.id,sampleCode:sample.sampleCode,...options}),
  UNSUPPORTED_MESSAGE:'Unsupported',setSelectedSessionId:id=>ui.id=id,setSelectedCupContext:value=>ui.selected=value,
  setIsQuickCuppingPending:value=>ui.pending=value,setScanStatusMessage:()=>{},goToCupping:value=>ui.route=value,showWarning:(...args)=>ui.warnings.push(args),...overrides};
 deps.projectAssessmentContextForSavedSession=overrides.projectAssessmentContextForSavedSession||evaluate('projectAssessmentContextForSavedSession',deps);
 ui.run=ready=>evaluate('handleQuickStartSampleReady',deps)(ready);ui.deps=deps;return ui;
}
async function prepare(form=1,filename=':memory:'){
 const env=fixture(filename),h=harness(env,form);h.tagId='TAG1';h.isQuickStartSession=true;h.quickStartSessionTypeValue='7';h.sessionName='';h.onQuickStartSampleReady=()=>{};
 await h.run('handleScanCup');assert.equal(h.writes.length,1);assert.equal(h.samples.length,0);
 await h.run('handleScanToCheckCup');assert.equal(h.samples.length,1);assert(h.pendingVerifiedQuickStartRef.current);
 const ready=h.pendingVerifiedQuickStartRef.current;assert.equal((await env.repo.getSessionById(S)).status,'new');
 await assert.rejects(form===1?env.repo.getCvaResponse(S,ready.sample.id):env.repo.getLegacyResponse(S,ready.sample.id),/Save this session/);
 return {env,h,ready};
}
async function main(){
 for(const form of [1,2]){
  const filename=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-quick-handoff-')),'test.db'),{env,h,ready}=await prepare(form,filename),ui=navigation(env);
  const beforeHistory=JSON.stringify(env.sqlite.prepare('SELECT * FROM local_session_foundations').all());
  await ui.run(ready);assert(ui.selected);assert.equal(ui.route,'Cupping Session Details');assert.equal(ui.pending,false);assert.equal(h.reads,1);assert.equal(h.writes.length,1,'no extra NFC');
  let saved=await env.repo.getSessionById(S),p=await env.repo.getLocalTastingPresentation(S);assert.equal(saved.status,'pending');assert.equal(p.session.samples[0].tastingActive,true);assert.equal(p.tasting.started,false);assert.equal(JSON.stringify(env.sqlite.prepare('SELECT * FROM local_session_foundations').all()),beforeHistory,'no start/history event');
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM local_creator_sample_activations').get().n,1);
  if(form===1){const value=await env.repo.getCvaResponse(S,ready.sample.id);assert.equal(value.response,null,'no saved response is fabricated');assert.equal(ui.selected.coffeeNameOrigin,`Sample ${ready.sample.sampleCode}`,'Blind neutral projection retained');const draft=require('../src/features/cupping/data/cvaResponse').createCvaDraft(5),response={...draft,ratings:{...draft.ratings,fragrance:7}};await env.save(S,ready.sample.id,response);}
  else{const value=await env.repo.getLegacyResponse(S,ready.sample.id);assert.equal(value.response,null,'no saved response is fabricated');await env.repo.saveLegacyResponse({sessionId:S,sampleId:ready.sample.id,response:{quality_ratings:{fragrance_aroma:28}},expectedFingerprint:value.savedFingerprint,expectedRemovalGeneration:value.removalGeneration,expectedTastingContextToken:value.tasting.contextToken});}
  assert.equal((await env.repo.getSessionById(S)).status,'in_progress');const scored=snapshot(env);
  await env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true});assert.equal(snapshot(env),scored,'duplicate never resets scores/history');
  env.restart();await env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true});assert.equal(snapshot(env),scored,'lost ack restart replay read-only');
  const permission=(await env.repo.getLocalTastingPresentation(S)).session.samples[0].localRemoval;await env.repo.removeCreatorTastingSample({sessionId:S,sampleId:ready.sample.id,expectedRemovalToken:permission.removalToken});
  const removed=snapshot(env);await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}));assert.equal(snapshot(env),removed,'removed target never reactivated by duplicate');
  console.log(`PASS Quick form${form}: actual write/separate-check/Nav, atomic Lock+sole active/Pending, blank assessment, score/restart/replay preservation and no removed-target resurrection.`);
 }
 for(const field of ['actor','incarnation','operationId','sampleId','code','uid','metadataHash','setupHash','generation']){
  const {env,ready}=await prepare(),before=snapshot(env),handoff={...ready.handoff,[field]:field==='generation'?99:'wrong'};
  await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff,isCurrent:()=>true}));assert.equal(snapshot(env),before,field);
 }
 const normal=fixture(),normalH=harness(normal);await normalH.run('handleScanCup');await normalH.run('handleScanToCheckCup');const op=normal.sqlite.prepare('SELECT operation_id FROM issued_sample_codes').get().operation_id,normalBefore=snapshot(normal);
 await assert.rejects(normal.repo.getVerifiedQuickCuppingHandoff({sessionId:S,operationId:op,isCurrent:()=>true}));assert.equal(snapshot(normal),normalBefore,'normal Draft unchanged');
 for(const failure of ['UPDATE sessions SET local_setup_locked_at','INSERT INTO local_creator_sample_activations']){
  const {env,ready}=await prepare(),before=snapshot(env);env.failAt(failure);await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}),/injected/);env.failAt(null);assert.equal(snapshot(env),before,'Lock/activation rollback together');await env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true});
 }
 {
  const {env,ready}=await prepare();let current=true;env.afterCommit(()=>current=false);await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>current}));assert.equal((await env.repo.getSessionById(S)).status,'pending');const durable=snapshot(env);await env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true});assert.equal(snapshot(env),durable,'postcommit lost ack retry does not write');
 }
 for(const race of ['cancel','actor']){
  const {env,ready}=await prepare(),before=snapshot(env);let current=true,hit=false;
  env.hook(sql=>{if(!hit&&sql.includes('SELECT local_setup_locked_at')){hit=true;if(race==='actor')env.actor(env.actorB);else current=false;}});
  await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>current}));env.hook(null);assert(hit);assert.equal(snapshot(env),before);
 }
 {
  const {env,h,ready}=await prepare(),before=snapshot(env);h.setupEpochRef.current++;const ui=navigation(env);await ui.run(ready);assert.equal(ui.selected,null);assert.equal(snapshot(env),before,'late setup callback cannot lock');
 }
 {
  const {env,ready}=await prepare();const ui=navigation(env,{projectAssessmentContextForSavedSession:async context=>{ui.deps.currentRoute.current='Home';return context;}});await ui.run(ready);assert.equal(ui.selected,null);assert.equal(ui.route,null,'late projection cannot route');
 }
 for(const problem of ['write','mismatch','close','epoch']){
  const env=fixture(),h=harness(env);h.isQuickStartSession=true;h.quickStartSessionTypeValue='7';h.onQuickStartSampleReady=()=>{};
  h.writeFailure=problem==='write';await h.run('handleScanCup');if(problem==='mismatch'){h.physicalPayload={...h.physicalPayload,n:'changed'};await h.run('handleScanToCheckCup');}
  if(problem==='close')h.run('handleCloseCheckSample');if(problem==='epoch'){let release;h.readWait=new Promise(resolve=>release=resolve);const checking=h.run('handleScanToCheckCup');h.setupEpochRef.current++;release();await checking;}
  assert.equal(h.pendingVerifiedQuickStartRef.current,null);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM local_creator_sample_activations').get().n,0);
 }
 {
  const env=fixture(),h=harness(env);h.isQuickStartSession=true;h.quickStartSessionTypeValue='7';h.onQuickStartSampleReady=()=>{};await h.run('handleScanCup');env.failAt('INSERT INTO samples');await h.run('handleScanToCheckCup');env.failAt(null);assert.equal(h.pendingAdditionRef.current.phase,'verified');const reads=h.reads;await h.run('handleScanToCheckCup');assert.equal(h.reads,reads);const ui=navigation(env);await ui.run(h.pendingVerifiedQuickStartRef.current);assert(ui.selected,'verified save-only recovery reaches tasting without another read');
 }
 {
  const {env,ready}=await prepare();await env.repo.deleteSessionById(S);const replacement=harness(env);replacement.isQuickStartSession=true;replacement.quickStartSessionTypeValue='7';replacement.onQuickStartSampleReady=()=>{};await replacement.run('handleScanCup');await replacement.run('handleScanToCheckCup');const before=snapshot(env);
  await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}));assert.equal(snapshot(env),before,'same session ID delete/recreate cannot borrow issuer proof');
 }
 {
  const {env,h,ready}=await prepare();h.isQuickStartSession=false;h.sessionId=S;h.sessionType='7';h.tagId='SECOND';h.physicalPayload=null;await h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin='Second';h.sheetProcess='1';await h.run('handleScanCup');assert(h.pendingAdditionRef.current);let before=snapshot(env);
  await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}));assert.equal(snapshot(env),before,'pending second assignment blocks Quick');
  await h.run('handleScanToCheckCup');assert.equal(h.samples.length,2);before=snapshot(env);await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}));assert.equal(snapshot(env),before,'committed second member blocks Quick');
 }
 {
  const {env,h,ready}=await prepare(),raw=await env.repo.getSessionById(S),sample=raw.samples[0];
  const read=value=>({tag:{id:sample.cupUUID,ndefMessage:[{tnf:1,type:[84],payload:[2,101,110,...Buffer.from(JSON.stringify(value))]}]},recordCount:1});
  await env.repo.stageDraftSampleRemoval({sessionId:S,readResult:read(JSON.parse(sample.metadataJson))});const before=snapshot(env);
  await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}));assert.equal(snapshot(env),before,'pending physical removal blocks Quick');
 }
 {
  const {env,ready}=await prepare();env.afterCommit(()=>env.actor(env.actorB));await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>true}),/actor_changed/);env.actor(env.actorA);assert.equal((await env.repo.getSessionById(S)).status,'pending');
 }
 {
  const {env,ready}=await prepare(),before=snapshot(env);let current=true,hit=false;const transact=env.bridge.withExclusiveTransactionAsync;
  env.bridge.withExclusiveTransactionAsync=callback=>transact(txn=>callback({...txn,runAsync:async(sql,args)=>{const result=await txn.runAsync(sql,args);if(sql.startsWith('UPDATE sessions SET local_setup_locked_at')){hit=true;current=false;}return result;}}));
  await assert.rejects(env.repo.activateVerifiedQuickCupping({handoff:ready.handoff,isCurrent:()=>current}));assert(hit);assert.equal(snapshot(env),before,'UI revocation after Lock SQL rolls back both transition writes');
 }
 console.log('PASS Quick proof/actor/type/epoch negatives, atomic rollback, lost-ack replay, actual stale Nav projection and failed/cancelled/mismatched write/check + save-only recovery. Software only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
