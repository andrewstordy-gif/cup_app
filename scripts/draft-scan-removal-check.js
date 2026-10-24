// Actual isolated SQLite; raw NFC records are fictional software fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {fixture}=require('./helpers/sample-code-fixture');
const helper=path.join(__dirname,'sample-code-screen-check.js'),source=fs.readFileSync(helper,'utf8'),mod=new Module(helper,module);
mod.filename=helper;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(source.slice(0,source.indexOf('\nasync function main(){'))+'\nmodule.exports={harness};',helper);
const {harness}=mod.exports,codec=require('../src/data/draftSampleRemovalCodec'),{canonicalize,sha256}=require('../src/data/sampleCodeProfile');
const navHelper=path.join(__dirname,'creator-scan-activation-check.js'),navMod=new Module(navHelper,module),navSource=fs.readFileSync(navHelper,'utf8');navMod.filename=navHelper;navMod.paths=Module._nodeModulePaths(__dirname);navMod._compile(navSource.slice(0,navSource.indexOf('\nasync function main(){'))+'\nmodule.exports={navigation};',navHelper);
function read(uid,values){return {tag:{id:uid,ndefMessage:values.map(value=>({tnf:1,type:[84],payload:[2,101,110,...Buffer.from(JSON.stringify(value))]}))},recordCount:values.length};}
function dialogRender(){
 const file=path.join(__dirname,'../src/features/cupping/components/CheckRemovalDialog.js'),dialog=new Module(file,module),{transformSync}=require('@babel/core');
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}})};
 const load=require('./helpers/load-project-module')(path.resolve(__dirname,'..'));
 const mocks={react,'react-native':{SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',View:'View',StyleSheet:{create:value=>value}},
  '../../../components/ui/IconButton':{CloseButton:'CloseButton'},'../../../components/ui/full_page_button':{full_page_button:'Button'},'../../../components/ui/TypographyAuditText':{TypographyAuditText:'Text'},
  '../../../theme/colors':load('src/theme/colors.js'),'../../../theme/spacing':load('src/theme/spacing.js'),'../../../theme/typography':load('src/theme/typography.js')};
 dialog.require=name=>mocks[name];dialog._compile(transformSync(fs.readFileSync(file,'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code,file);
 const find=(node,type)=>!node?null:node.type===type?node:(node.props?.children||[]).map(child=>find(child,type)).find(Boolean);
 for(const [mode,label]of [['verify','RESCAN TO VERIFY'],['retry','RETRY CLEAR'],['save','RETRY SAVE']]){
  const action=()=>{},close=()=>{},tree=dialog.exports.CheckRemovalDialog({mode,busy:true,onAction:action,onClose:close}),button=find(tree,'Button'),dismiss=find(tree,'CloseButton');
  assert.equal(button.props.label,label);assert.equal(button.props.disabled,true);assert.strictEqual(button.props.onPress,action);assert.equal(dismiss.props.disabled,true);assert.strictEqual(dismiss.props.onPress,close);
  assert.equal(button.props.style?.backgroundColor,mode==='save'?undefined:mocks['../../../theme/colors'].colors.action);
 }
}
async function uiRemoval(){
 const env=fixture(),h=harness(env,1),S=h.sessionUUID;
 h.tagId='TAG1';
 await h.run('handleScanCup');await h.run('handleScanToCheckCup');
 h.sessionId=S;h.ownsSavedSetup=true;h.sessionStatus='new';h.isSessionDirty=false;h.isAddSheetVisible=false;h.isDeleting=false;
 h.nativeClears=0;h.removalReads=0;h.revocations=[];h.draftRemovalDialog=null;
 h.draftRemovalDialogRef={current:null};
 const previous=h.dependencies;
 h.dependencies=()=>({...previous(),...h,draftRemovalRenderEpoch:h.setupEpochRef.current,onLocalTastingRemovalStart:(sessionId,sampleId)=>{assert.equal(sessionId,S);h.revocations.push(sampleId);return ()=>{};},
  setDraftRemoval:value=>h.draftRemoval=value,setDraftRemovalDialog:value=>h.draftRemovalDialog=value,setIsRemovingDraftSample:value=>h.isRemovingDraftSample=value,
  setSetupAccess:value=>h.setupAccess=value,
  readAndClearNdefMinimal:async prepare=>{try{const command=await prepare(read(h.tagId,[h.physicalPayload]));await command.beforeWrite();h.nativeClears++;if(h.clearFailure)throw Error('uncertain');h.physicalPayload={};}catch(error){h.uiError=error;throw error;}},
  readNdefMinimal:async()=>{h.removalReads++;return read(h.tagId,[h.physicalPayload]);}});
 await h.run('handleDraftRemoval');assert.equal(h.nativeClears,1,h.uiError?.stack||h.scanStatusMessage);assert.equal(h.draftRemovalRef.current.phase,'written');assert.equal(h.draftRemovalDialog.mode,'verify');
 assert.equal((await env.repo.getSessionById(S)).samples.length,1,'write is not verification');
 const retainedSave=h.run.bind(h,'handleSave');await retainedSave();assert.equal(h.nativeClears,1,'held save cannot overlap pending clear');
 const oldDialog=h.draftRemovalDialog;h.run('handleCloseDraftRemoval',oldDialog);assert.equal(h.draftRemovalDialog,null);
 await h.run('handleDraftRemoval',true,oldDialog);assert.equal(h.nativeClears,1,'closed old retry action cannot start another operation');
 env.failAt('DELETE FROM samples');await h.run('handleDraftRemoval');env.failAt(null);
 assert.equal(h.draftRemovalDialog.mode,'save');assert.equal(h.removalReads,1);assert.equal(h.draftRemovalRef.current.phase,'verified');
 await h.run('handleDraftRemoval');assert.equal(h.nativeClears,1);assert.equal(h.removalReads,1,'verified save retry never reads or writes');assert.equal(h.draftRemovalRef.current,null);assert.equal((await env.repo.getSessionById(S)).samples.length,0);
 console.log('PASS actual Details removal callbacks: direct clear, separate read, Close retains journal, pending Save blocked, commit rollback and save-only retry, navigation revocation signature.');
}
async function survivorAndNav(){
 const env=fixture(),h=harness(env,1),S=h.sessionUUID;
 for(let index=1;index<=3;index++){h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin=`Fictional${index}`;h.sheetProcess='1';h.tagId=`TAG${index}`;h.physicalPayload=null;await h.run('handleScanCup');await h.run('handleScanToCheckCup');}
 const original=await env.repo.getOwnedSessionSetup(S),target=original.samples[0],metadata=JSON.parse(target.metadataJson);
 const pending=await env.repo.stageDraftSampleRemoval({sessionId:S,readResult:read(target.cupUUID,[metadata])});
 const verify=()=>env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:pending.operationId,readResult:read(target.cupUUID,[{}])});
 const runtime=navMod.exports.navigation(env);let observed=read(target.cupUUID,[{}]),classifications=0;
 runtime.deps.readNdefMinimal=async()=>observed;runtime.deps.classifyNfcTagReadResult=()=>{classifications++;throw Error('unexpected');};
 await runtime.scan(metadata);assert.equal((await env.repo.getDraftSampleRemoval(S)).phase,'staged','Home clear observation never grants verification');assert.equal(classifications,0);
 for(const values of [[metadata],[{broken:1}],[{} ,{}]]){
  await verify();observed=read(target.cupUUID,values);await runtime.scan(metadata);assert.equal((await env.repo.getDraftSampleRemoval(S)).phase,'writing','actual Nav commits contradiction before rejecting scan');
  await assert.rejects(env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),/context_changed/);
 }
 await verify();await env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId});
 const survivorIssue=env.sqlite.prepare('SELECT operation_id FROM issued_sample_codes WHERE code=?').get(original.samples[1].sampleCode);
 await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:S,operationId:survivorIssue.operation_id}),/context_changed/,'old survivor add acknowledgement cannot borrow a post-removal generation even when counts match');
 const remaining=await env.repo.getOwnedSessionSetup(S);assert.deepEqual(remaining.samples.map(row=>JSON.parse(row.metadataJson)),original.samples.slice(1).map(row=>JSON.parse(row.metadataJson)),'neighbour wire assignments are untouched');
 const second=remaining.samples[0],middle=await env.repo.stageDraftSampleRemoval({sessionId:S,readResult:read(second.cupUUID,[JSON.parse(second.metadataJson)])});
 await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:middle.operationId,readResult:read(second.cupUUID,[{}])});await env.repo.commitDraftSampleRemoval({sessionId:S,operationId:middle.operationId});
 const ready=await env.repo.getSessionLockReadiness(S);await env.repo.lockSessionSetup({sessionId:S,expectedSnapshot:ready.snapshot});
 const survivor=original.samples[2],resolved=await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:survivor.cupUUID,metadata:JSON.parse(survivor.metadataJson)});assert.equal(resolved.cupIndex,0);assert.equal(resolved.cupTotal,1);assert.equal(resolved.sampleCode,survivor.sampleCode);assert.equal(resolved.cupNumber,survivor.cupNumber);
 console.log('PASS actual Nav raw observation denies assessment and revokes same-UID contradictions without auto-verification; first/middle removal preserves neighbour metadata and survivor current-array routing.');
}
async function main(){
 for(const form of [1,2]){
  const env=fixture(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-removal-')),'test.db')),h=harness(env,form),S=h.sessionUUID;
  h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin='Fictional';h.sheetProcess='1';h.tagId='TAG1';h.physicalPayload=null;
  await h.run('handleScanCup');await h.run('handleScanToCheckCup');
  const saved=await env.repo.getOwnedSessionSetup(S),sample=saved.samples[0],old=JSON.parse(sample.metadataJson);
  const pending=await env.repo.stageDraftSampleRemoval({sessionId:S,readResult:read(sample.cupUUID,[old])});
  const journal=env.sqlite.prepare('SELECT * FROM local_pending_draft_removals').get(),damaged=JSON.parse(journal.content_json);damaged.additionOperationId=env.actorB;
  const damagedJson=canonicalize(damaged);env.sqlite.prepare('UPDATE local_pending_draft_removals SET content_json=?,content_hash=?').run(damagedJson,sha256(damagedJson));
  await assert.rejects(env.repo.beginDraftSampleRemovalWrite({sessionId:S,operationId:pending.operationId,expectedBytesHash:pending.frozen.bytesHash}),/context_changed/);
  await assert.rejects(env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),/context_changed/);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM samples').get().n,1);
  env.sqlite.prepare('UPDATE local_pending_draft_removals SET content_json=?,content_hash=?').run(journal.content_json,journal.content_hash);
  await assert.rejects(env.repo.resolveActiveSampleFromCupMetadata({cupUUID:sample.cupUUID,metadata:{...old,u:'other012345678'}}),/unfinished/);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM sessions').get().n,1,'reserved UID cannot import another session');
  assert.deepEqual(pending.frozen.bytes,[209,1,5,84,2,101,110,123,125]);
  await assert.rejects(env.repo.saveSessionWithSamples({...saved,existingSessionId:S,intent:'setup'}),/unfinished/);
  await assert.rejects(env.repo.getSessionLockReadiness(S),/unfinished/);
  await env.repo.beginDraftSampleRemovalWrite({sessionId:S,operationId:pending.operationId,expectedBytesHash:pending.frozen.bytesHash});
  env.restart();assert.equal((await env.repo.getDraftSampleRemoval(S)).phase,'writing');
  const original=await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:pending.operationId,readResult:read(sample.cupUUID,[old])});assert.equal(original.disposition,'original');
  await assert.rejects(env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),/context_changed/);
  const checked=await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:pending.operationId,readResult:read(sample.cupUUID,[{}])});assert.equal(checked.pending.phase,'verified');
  let current=true;env.hook(sql=>{if(sql.includes('sample_code_issuers'))current=false;});
  await assert.rejects(env.repo.observePendingDraftRemovalRead(read(sample.cupUUID,[old]),{isReadCurrent:()=>current}),/context_changed/);env.hook(null);
  assert.equal((await env.repo.getDraftSampleRemoval(S)).phase,'verified','revoked old observation cannot downgrade newer proof');
  env.failAt('DELETE FROM samples');await assert.rejects(env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),/injected/);env.failAt(null);
  assert.equal((await env.repo.getDraftSampleRemoval(S)).phase,'verified');
  const wrong=await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:pending.operationId,readResult:read('OTHER',[{}])});assert.equal(wrong.pending.phase,'verified');
  const contradicted=await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:pending.operationId,readResult:read(sample.cupUUID,[old])});assert.equal(contradicted.pending.phase,'writing');
  await assert.rejects(env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),/context_changed/);
  await env.repo.inspectDraftSampleRemovalRead({sessionId:S,operationId:pending.operationId,readResult:read(sample.cupUUID,[{}])});
  const result=await env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId});assert.equal(result.removed,true);
  assert.deepEqual(await env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),result);
  const receipt=env.sqlite.prepare('SELECT * FROM local_draft_removal_receipts').get(),badReceipt={...JSON.parse(receipt.receipt_json),schema:2},badJson=canonicalize(badReceipt);
  env.sqlite.prepare('UPDATE local_draft_removal_receipts SET receipt_json=?,receipt_hash=?').run(badJson,sha256(badJson));
  await assert.rejects(env.repo.commitDraftSampleRemoval({sessionId:S,operationId:pending.operationId}),/context_changed/);
  env.sqlite.prepare('UPDATE local_draft_removal_receipts SET receipt_json=?,receipt_hash=?').run(receipt.receipt_json,receipt.receipt_hash);
  const empty=await env.repo.getOwnedSessionSetup(S);assert.equal(empty.status,'new');assert.equal(empty.samples.length,0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM issued_sample_codes').get().n,1);
  await assert.rejects(env.repo.saveSessionWithSamples({...saved,existingSessionId:S,intent:'setup'}),/retired/);
  const issued=env.sqlite.prepare('SELECT operation_id FROM issued_sample_codes').get();await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:S,operationId:issued.operation_id}),/retired/);
  // Fresh addition must maintain the post-removal aggregate, not strand a
  // valid roster on a stale blank revision before Lock/activation/Save.
  const fresh=harness(env,form,S);fresh.samples=[];fresh.savedSessionIdRef.current=S;fresh.sessionId=S;
  fresh.sheetCoffeeNameOrigin='Fresh';fresh.tagId=sample.cupUUID;fresh.physicalPayload=old;
  await fresh.run('handleScanCup');assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM issued_sample_codes').get().n,1,'retired old payload is not a reusable abandoned attempt');assert.equal(fresh.pendingAdditionRef.current,null);
  fresh.physicalPayload={};
  await fresh.run('handleScanCup');await fresh.run('handleScanToCheckCup');
  const readded=await env.repo.getOwnedSessionSetup(S);assert.equal(readded.samples.length,1);assert.notEqual(readded.samples[0].sampleCode,sample.sampleCode);
  const freshIssue=env.sqlite.prepare('SELECT operation_id FROM issued_sample_codes WHERE code=?').get(readded.samples[0].sampleCode);
  assert.deepEqual(await env.repo.commitPendingSampleAddition({sessionId:S,operationId:freshIssue.operation_id}),{sessionId:S,status:'new',savedSampleCount:1},'fresh post-removal addition replay retains public DTO and is idempotent');
  const raceReady=await env.repo.getSessionLockReadiness(S);let interleaved=false;
  env.hook(sql=>{if(!interleaved&&sql.startsWith('SELECT actor_id,outcome_json FROM sample_code_commit_outcomes')){
    interleaved=true;env.sqlite.prepare("UPDATE sessions SET local_setup_locked_at=?,local_setup_lock_snapshot=?,status='pending' WHERE id=?").run(new Date().toISOString(),raceReady.snapshot,S);
  }});
  await assert.rejects(env.repo.commitPendingSampleAddition({sessionId:S,operationId:freshIssue.operation_id}),/locked/,'Lock between initial pending getter and replay is rechecked in replay transaction');env.hook(null);assert(interleaved);
  env.sqlite.prepare("UPDATE sessions SET local_setup_locked_at=NULL,local_setup_lock_snapshot=NULL,status='new' WHERE id=?").run(S);
  const readiness=await env.repo.getSessionLockReadiness(S);await env.repo.lockSessionSetup({sessionId:S,expectedSnapshot:readiness.snapshot});
  const target=readded.samples[0];await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:target.cupUUID,metadata:JSON.parse(target.metadataJson)});
  if(form===1){const response=require('../src/features/cupping/data/cvaResponse').createCvaDraft(target.cupNumber);response.ratings.fragrance=7;await env.save(S,target.id,response);}
  else{const response=env.legacy();response.consistent_cups=response.clean_cups=response.sweet_cups=[1,2,3,4,5];const prior=await env.repo.getLegacyResponse(S,target.id);await env.repo.saveLegacyResponse({sessionId:S,sampleId:target.id,response,expectedFingerprint:prior.savedFingerprint,expectedRemovalGeneration:prior.removalGeneration,expectedTastingContextToken:prior.tasting.contextToken});}
  assert.equal((await env.repo.getLocalTastingPresentation(S)).session.status,'in_progress');
 }
 dialogRender();await uiRemoval();await survivorAndNav();
 console.log('PASS draft scan removal SQLite both forms: frozen NTAG bytes, durable writing, separate verification, rollback/contradiction, immediate target deletion, receipt replay, spent code, stale Save/add acknowledgement denial and fresh readd->Lock->activation->score.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
