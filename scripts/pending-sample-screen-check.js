// Actual screen callbacks + real SQLite. Physical NFC/native Modal are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const generate=require('@babel/generator').default;
const {execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/session-state-fixture');
const load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..');
const screen='src/features/cupping/screens/CuppingSessionDetailsScreen.js';
const source=fs.readFileSync(path.join(root,screen),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v]){const hit=find(c,p);if(hit)return hit;}return null;}
const declaration=name=>find(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name)?.init;
let serial=0;
const constants=load(root,{'../../../utils/secureIdentifiers':{generateDomainId:()=>`sample-${++serial}`,generateSessionReference:()=> 'unused'}})('src/features/cupping/constants/sessionDetails.js');
const {formIdentity}=require('../src/features/forms/sessionFormRoute');
function harness(env,form=1,id='phone-add') {
  const ref=current=>({current});
  const h={env, sessionId:null,sessionUUID:id,sessionName:'Creator draft',sessionType:'4',sessionDate:'20 Oct 2026',sessionDisplayId:'SESSION-TEST',sessionMode:form===2?'open':null,
    sessionStatus:'new',samplesInSession:'',samples:[],selectedForm:form,sessionForm:formIdentity(form),
    isLegacy:form===2,isQuickStartSession:false,canEditSessionSetup:true,isSessionFormSupported:true,hideSavedIdentity:false,
    sheetCoffeeNameOrigin:'Test coffee',sheetProcess:'1',sheetCupNumber:5,sheetCuppingMode:form===2?'open':'blind',
    isAddSheetVisible:true,isNfcWriting:false,isCheckingCup:false,checkingSampleId:null,pendingSaveError:'',checkSampleStatus:'pending',
    setupEpochRef:ref(1),savedSessionIdRef:ref(null),pendingAdditionRef:ref(null),pendingAdditionBusyRef:ref(null),pendingCheckSampleOverridesRef:ref({}),
    pendingQuickStartReadyRef:ref(null),saveOperationRef:ref(null),reopenPendingDrawerRef:ref(false),
    pendingVerifiedQuickStartRef:ref(null),
    savedSetupSnapshotRef:ref(null),savedSetupInputKeyRef:ref(null),writes:[],reads:0,tagId:'TEST-TAG',isSheetCupNumberDefault:false,isSheetCuppingModeDefault:false,
  };
  h.dependencies=()=>{
    const dep={...constants,...h,...env.repo,Platform:{OS:h.platformOS||'android'},Keyboard:{dismiss(){}},CUP_NUMBER_OPTIONS:constants.CUP_NUMBER_OPTIONS,
      isSmartCupHardwareTag:()=>false,classifyNfcTagReadResult:result=>({type:'ntag_cup',metadataPayload:result.parsed.text4}),
      NFC_TAG_TYPES:{NTAG_CUP:'ntag_cup',SMART_CUP:'smart_cup',EMPTY_TAG:'empty',GENERIC_NDEF_TAG:'generic'},
      getNfcTagIdentifier:tag=>tag.id,playNfcFailureFeedback:async()=>{},logAppError:()=>{},
      formState:{sessionUUID:h.sessionUUID,sessionName:h.sessionName,sessionType:h.sessionType,sessionDate:h.sessionDate,sessionDisplayId:h.sessionDisplayId,
        cuppingForm:form,cuppingMode:h.sessionMode,samplesInSession:h.samplesInSession,status:h.sessionStatus,samples:h.samples},
      setupWarningSnapshot:h.setupWarningSnapshot||(()=>({})),requestSetupExit:callback=>callback(),onQuickStartSampleReady:h.onQuickStartSampleReady,
      readAndWriteNdefMinimal:async callback=>{const output=await callback({tag:{id:h.tagId},parsed:{text4:h.physicalPayload||{}}});h.writes.push(output.records);if(h.writeFailure)throw new Error('NFC write failed.');h.physicalPayload=output.records.text4;return {result:output.result};},
      readNdefMinimal:async()=>{h.reads++;if(h.readWait)await h.readWait;return {tag:{id:h.tagId},parsed:{text4:h.physicalPayload||{}}};},
      setSampleVerificationStatus:()=>{},
    };
    for(const name of ['EditingSampleId','SheetCoffeeNameOrigin','SheetProcess','SheetCupNumber','IsSheetCupNumberDefault','SheetCuppingMode','IsSheetCuppingModeDefault',
      'SheetErrors','ScanStatusMessage','CupBlockedMessage','IsAddSheetVisible','IsNfcWriting','SessionStatus','SessionName','SessionType','Samples','IsSessionDirty',
      'CheckingSampleId','CheckSampleStatus','IsCheckingCup','PendingSaveError','VerifyingSampleId','RewritingSampleId','PresentationRevision']) {
      const key=name[0].toLowerCase()+name.slice(1);dep['set'+name]=value=>{h[key]=typeof value==='function'?value(h[key]):value;};
    }
    for(const name of ['validateAddSheet','pendingFieldsUnchanged','restorePendingAdditionFields','handleVerifySample','handleRewriteSample'])dep[name]=(...args)=>h.run(name,...args);
    return dep;
  };
  h.run=(name,...args)=>{
    const dependencies=h.dependencies();const code=generate(declaration(name)).code;
    return new Function(...Object.keys(dependencies),`return (${code});`)(...Object.values(dependencies))(...args);
  };
  return h;
}
async function main(){
  for(const form of [1,2]){
    const env=fixture();let h=harness(env,form);
    env.failAt('INSERT INTO local_pending_sample_additions');await h.run('handleScanCup');env.failAt(null);
    assert.equal(h.writes.length,0,'staging failure precedes physical write');
    await h.run('handleScanCup');assert.equal(h.writes.length,1);assert.equal(h.samples.length,0);assert.equal(h.isAddSheetVisible,false);assert(h.checkingSampleId);
    assert.equal((await env.repo.getOwnedSessionSetup(h.sessionUUID)).samples.length,0);
    const candidateId=h.pendingAdditionRef.current.candidate.id;
    h.platformOS='ios';h.run('handleCloseCheckSample');assert.equal(h.isAddSheetVisible,false,'iOS waits for check Modal dismissal');
    const modal=find(ast,n=>n.type==='JSXOpeningElement'&&n.name?.name==='Modal'&&n.attributes.some(a=>a.name?.name==='onDismiss'));
    const dismiss=modal.attributes.find(a=>a.name?.name==='onDismiss').value.expression;
    const dep=h.dependencies();new Function(...Object.keys(dep),`return (${generate(dismiss).code});`)(...Object.values(dep))();
    assert.equal(h.isAddSheetVisible,true);h.platformOS='android';assert.equal(h.sheetCoffeeNameOrigin,'Test coffee');assert.equal(h.checkingSampleId,null);
    await h.run('handleScanCup');assert.equal(h.writes.length,2,'explicit drawer retry writes again even when details are unchanged');
    assert.equal(h.pendingAdditionRef.current.candidate.id,candidateId);assert.equal(h.samples.length,0);
    h.physicalPayload={...h.physicalPayload,n:'Mismatch'};
    await h.run('handleScanToCheckCup');assert.equal(h.checkSampleStatus,'mismatch');assert.equal(h.samples.length,0);
    h.run('handleCloseCheckSample');assert.equal(h.isAddSheetVisible,true);assert.equal(h.sheetProcess,'1');
    h.sheetCoffeeNameOrigin='Edited coffee';
    await h.run('handleScanCup');assert.equal(h.writes.length,3);assert.equal(h.physicalPayload.n,'Edited coffee');
    assert.equal(h.samples.length,0);assert.equal((await env.repo.getOwnedSessionSetup(h.sessionUUID)).samples.length,0);
    h.physicalPayload={...h.physicalPayload,n:'Mismatch'};
    await h.run('handleScanToCheckCup');assert.equal(h.checkSampleStatus,'mismatch');
    await h.run('handleRewriteFromCheckScreen');assert.equal(h.checkSampleStatus,'pending');assert.equal(h.samples.length,0);assert.equal(h.writes.length,4);
    env.failAt('INSERT INTO samples');await h.run('handleScanToCheckCup');env.failAt(null);
    assert.equal(h.samples.length,0);assert(h.pendingSaveError.includes('no re-write'));assert.equal(h.checkSampleStatus,'pending');
    assert.equal(h.pendingAdditionRef.current.phase,'verified');const reads=h.reads;
    await h.run('handleScanToCheckCup');assert.equal(h.reads,reads,'verified commit retry needs no further NFC read');
    assert.equal(h.samples.length,1);assert.equal(h.samples[0].id,candidateId);assert.equal(h.samples[0].coffeeNameOrigin,'Edited coffee');assert.equal(h.checkingSampleId,null);
    await h.run('handleScanToCheckCup');assert.equal(h.samples.length,1);
    // Every subsequent addition stages a distinct sample and requires a check.
    h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin='Second coffee';h.sheetProcess='2';h.tagId='SECOND-TAG';
    await h.run('handleScanCup');assert.equal(h.samples.length,1);assert(h.checkingSampleId);
    h.run('handleCloseCheckSample');h.run('handleCloseAddSheet');
    const saved=await env.repo.getPendingSampleAddition(h.sessionUUID);
    const reopened=harness(env,form,h.sessionUUID);reopened.samples=h.samples;reopened.savedSessionIdRef.current=h.sessionUUID;reopened.sessionId=h.sessionUUID;
    reopened.pendingAdditionRef.current=saved;reopened.run('restorePendingAdditionFields',saved);reopened.isAddSheetVisible=false;
    reopened.tagId=saved.candidate.cupUUID;
    reopened.run('handleOpenAddSheet');assert.equal(reopened.sheetCoffeeNameOrigin,'Second coffee');
    assert.equal(reopened.writes.length,0,'opening retained drawer does not automatically write');
    await reopened.run('handleScanCup');assert.equal(reopened.writes.length,1,'explicit press after reopen writes before Check Cup');
    // A late successful read from an old screen cannot add a sample.
    reopened.physicalPayload=saved.payload;reopened.tagId=saved.candidate.cupUUID;
    let release;reopened.readWait=new Promise(resolve=>release=resolve);
    const read=reopened.run('handleScanToCheckCup');reopened.setupEpochRef.current++;release();await read;
    assert.equal((await env.repo.getOwnedSessionSetup(h.sessionUUID)).samples.length,1);
    assert(await env.repo.getPendingSampleAddition(h.sessionUUID));
  }
  const closeEnv=fixture(),closed=harness(closeEnv),originalStage=closeEnv.repo.stagePendingSampleAddition;
  closeEnv.repo.stagePendingSampleAddition=async input=>{const pending=await originalStage(input);closed.run('handleCloseAddSheet');return pending;};
  await closed.run('handleScanCup');
  assert.equal(closed.writes.length,0,'closing during staging cancels the physical write');
  assert(closed.pendingAdditionRef.current,'cancelled staging retains access to durable intent');
  closed.sheetCoffeeNameOrigin='';closed.run('handleOpenAddSheet');
  assert.equal(closed.sheetCoffeeNameOrigin,'Test coffee');
  closeEnv.repo.stagePendingSampleAddition=originalStage;
  await closed.run('handleScanCup');assert(closed.checkingSampleId);assert.equal(closed.writes.length,1,'no successful write yet, explicit retry writes before check');
  for(const form of [1,2]){
    const env=fixture(),failed=harness(env,form);failed.writeFailure=true;
    await failed.run('handleScanCup');const sampleId=failed.pendingAdditionRef.current.candidate.id;
    assert.equal(failed.isAddSheetVisible,true);assert.equal(failed.checkingSampleId,null);assert.equal(failed.sheetCoffeeNameOrigin,'Test coffee');
    assert.equal((await env.repo.getPendingSampleAddition(failed.sessionUUID)).writeCompleted,false);
    await failed.run('handleScanCup');assert.equal(failed.writes.length,2,'failed first write retries writer, not check');
    assert.equal(failed.checkingSampleId,null);assert.equal(failed.samples.length,0);
    const recovered=harness(env,form,failed.sessionUUID);recovered.savedSessionIdRef.current=failed.sessionUUID;
    recovered.pendingAdditionRef.current=await env.repo.getPendingSampleAddition(failed.sessionUUID);
    recovered.run('restorePendingAdditionFields',recovered.pendingAdditionRef.current);
    await recovered.run('handleScanCup');assert.equal(recovered.writes.length,1);assert(recovered.checkingSampleId);
    assert.equal(recovered.pendingAdditionRef.current.candidate.id,sampleId);assert.equal(recovered.pendingAdditionRef.current.writeCompleted,true);
    await recovered.run('handleScanToCheckCup');assert.equal(recovered.samples.length,1);assert.equal(recovered.samples[0].id,sampleId);
    const markFail=harness(fixture(),form);markFail.env.failAt('UPDATE local_pending_sample_additions SET content_json');
    await markFail.run('handleScanCup');assert.equal(markFail.isAddSheetVisible,true);assert.equal(markFail.checkingSampleId,null);
    assert.equal(markFail.pendingAdditionRef.current.writeCompleted,false);markFail.env.failAt(null);
    await markFail.run('handleScanCup');assert.equal(markFail.writes.length,2);assert(markFail.checkingSampleId);
  }
  const quickEnv=fixture(),quick=harness(quickEnv);let handedOff=0;
  quick.isQuickStartSession=true;quick.quickStartSessionTypeValue=7;quick.onQuickStartSampleReady=()=>{handedOff++;};
  await quick.run('handleScanCup');assert.equal(handedOff,0);await quick.run('handleScanToCheckCup');assert.equal(handedOff,0);
  const quickEffect=find(ast,n=>n.type==='CallExpression'&&n.callee?.name==='useEffect'&&generate(n.arguments[0]).code.includes('const ready = pendingVerifiedQuickStartRef.current'));
  const dep=quick.dependencies(),effect=new Function(...Object.keys(dep),`return (${generate(quickEffect.arguments[0]).code});`)(...Object.values(dep));
  effect();effect();assert.equal(handedOff,1,'quick start hands off once after committed sample render');
  const baseline=parse(execFileSync('git',['show','2f06364:'+screen],{cwd:root,encoding:'utf8'}),{sourceType:'module',plugins:['jsx']});
  function records(tree,name){const fn=find(tree,n=>n.type==='VariableDeclarator'&&n.id?.name===name).init;const list=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='ObjectProperty'&&n.key?.name==='records')list.push(generate(n.value).code);for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v])walk(c);}walk(fn);return list;}
  for(const name of ['handleScanCup','handleRewriteSample'])assert.deepEqual(records(ast,name),records(baseline,name),'NFC writer record expressions unchanged');
  // All pre-existing named declarations outside the explicit integration scope
  // remain byte-equivalent after parser formatting.
  const owned=new Set(['isSessionLocked','requestSetupExit','leaveSetup','restorePendingAdditionFields','pendingFieldsUnchanged','handleOpenAddSheet','handleCloseAddSheet',
    'handleOpenEditSheet','handleScanCup','handleVerifySample','handleRewriteSample','checkedSample','handleCloseCheckSample',
    'handleScanToCheckCup','handleRewriteFromCheckScreen','handleSave']);
  const oldComponent=find(baseline,n=>n.type==='FunctionDeclaration'&&n.id?.name==='CuppingSessionDetailsScreen');
  const newComponent=find(ast,n=>n.type==='FunctionDeclaration'&&n.id?.name==='CuppingSessionDetailsScreen');
  for(const statement of oldComponent.body.body)if(statement.type==='VariableDeclaration')for(const item of statement.declarations){
    if(item.id.type!=='Identifier'||owned.has(item.id.name))continue;
    const next=find(newComponent,n=>n.type==='VariableDeclarator'&&n.id?.name===item.id.name);
    assert(next,item.id.name);assert.equal(generate(next).code,generate(item).code,'Unassigned declaration '+item.id.name);
  }
  console.log('Pending add screen handlers PASS: stage before write, no early membership, both close states, failure/rewrite/check, verified-save retry, second sample, recovery, stale read and unchanged NFC record expressions.');
}
module.exports={harness,constants};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
