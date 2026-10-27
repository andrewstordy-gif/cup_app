// Actual screen callbacks + real SQLite. Physical NFC/native Modal are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const generate=require('@babel/generator').default;
const {execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/sample-code-fixture');
const load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..');
const {logReassignmentProbe}=load(root)('src/utils/reassignmentProbe.js');
const screen='src/features/cupping/screens/CuppingSessionDetailsScreen.js';
const source=fs.readFileSync(path.join(root,screen),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v]){const hit=find(c,p);if(hit)return hit;}return null;}
const declaration=name=>find(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name)?.init;
let serial=0;
const constants=load(root,{'../../../utils/secureIdentifiers':{generateDomainId:()=>`sample-${++serial}`,generateSessionReference:()=> 'unused'}})('src/features/cupping/constants/sessionDetails.js');
const {formIdentity}=require('../src/features/forms/sessionFormRoute');
function harness(env,form=1,id='nfzyy8y0pqizn6') {
  const ref=current=>({current});
  const h={env, sessionId:null,sessionUUID:id,sessionName:'Creator draft',sessionType:'4',sessionDate:'20 Oct 2026',sessionDisplayId:'SESSION-TEST',sessionMode:form===2?'open':null,
    sessionStatus:'new',samplesInSession:'',samples:[],selectedForm:form,sessionForm:formIdentity(form),
    isLegacy:form===2,isQuickStartSession:false,canEditSessionSetup:true,isSessionFormSupported:true,hideSavedIdentity:false,
    sheetCoffeeNameOrigin:'Test coffee',sheetProcess:'1',sheetCupNumber:5,sheetCuppingMode:form===2?'open':'blind',
    isAddSheetVisible:true,isNfcWriting:false,isCheckingCup:false,checkingSampleId:null,pendingSaveError:'',checkSampleStatus:'pending',
    setupEpochRef:ref(1),savedSessionIdRef:ref(null),pendingAdditionRef:ref(null),pendingAdditionBusyRef:ref(null),pendingCheckSampleOverridesRef:ref({}),
    pendingQuickStartReadyRef:ref(null),saveOperationRef:ref(null),lockOperationRef:ref(null),reopenPendingDrawerRef:ref(false),
    pendingVerifiedQuickStartRef:ref(null),verifiedObservationRef:ref(null),
    draftRemovalRef:ref(null),draftRemovalBusyRef:ref(null),draftRemoval:null,isRemovingDraftSample:false,
    cupReassignmentRef:ref(null),cupReassignmentBusyRef:ref(null),cupReassignmentPromptRef:ref(null),cupReassignmentDialogRef:ref(null),
    cupReassignment:null,cupReassignmentPrompt:null,cupReassignmentDialog:null,isReassigningCup:false,
    savedSetupSnapshotRef:ref(null),savedSetupInputKeyRef:ref(null),writes:[],reads:0,tagId:'TEST-TAG',isSheetCupNumberDefault:false,isSheetCuppingModeDefault:false,
  };
  h.dependencies=()=>{
    const dep={...constants,...h,...env.repo,logReassignmentProbe,readDirectCupEnvelope:require('../src/data/directCupOldEnvelope').read,isBlankDirectCupEnvelope:require('../src/data/directCupOldEnvelope').blank,canonicalize:require('../src/data/sampleCodeProfile').canonicalize,readCodeTagContext:require('../src/data/sampleCodeProfile').tagContext,Platform:{OS:h.platformOS||'android'},Keyboard:{dismiss(){}},CUP_NUMBER_OPTIONS:constants.CUP_NUMBER_OPTIONS,
      isSmartCupHardwareTag:()=>Boolean(h.smart),classifyNfcTagReadResult:result=>({type:h.smart?'smart_cup':'ntag_cup',metadataPayload:Object.keys(result.parsed.text4||{}).length?result.parsed.text4:null}),
      NFC_TAG_TYPES:{NTAG_CUP:'ntag_cup',SMART_CUP:'smart_cup',EMPTY_TAG:'empty',GENERIC_NDEF_TAG:'generic'},
      getNfcTagIdentifier:tag=>tag.id,playNfcFailureFeedback:async()=>{},logAppError:()=>{},
      formState:{sessionUUID:h.sessionUUID,sessionName:h.sessionName,sessionType:h.sessionType,sessionDate:h.sessionDate,sessionDisplayId:h.sessionDisplayId,
        cuppingForm:form,cuppingMode:h.sessionMode,samplesInSession:h.samplesInSession,status:h.sessionStatus,samples:h.samples},
      setupWarningSnapshot:h.setupWarningSnapshot||(()=>({})),requestSetupExit:callback=>callback(),onQuickStartSampleReady:h.onQuickStartSampleReady,
      readAndWriteNdefMinimal:async callback=>{const output=await callback(h.readResult());await output.beforeWrite?.();h.writes.push(output.records);if(h.writeFailure)throw new Error('NFC write failed.');h.physicalPayload=output.records.text4;return {result:output.result};},
      readNdefMinimal:async()=>{h.reads++;if(h.readWait)await h.readWait;return h.readResult();},
      setSampleVerificationStatus:()=>{},
    };
    for(const name of ['EditingSampleId','SheetCoffeeNameOrigin','SheetProcess','SheetCupNumber','IsSheetCupNumberDefault','SheetCuppingMode','IsSheetCuppingModeDefault',
      'SheetErrors','ScanStatusMessage','CupBlockedMessage','IsAddSheetVisible','IsNfcWriting','SessionStatus','SessionName','SessionType','Samples','IsSessionDirty',
      'CheckingSampleId','CheckSampleStatus','IsCheckingCup','PendingSaveError','VerifyingSampleId','RewritingSampleId','PresentationRevision']) {
      const key=name[0].toLowerCase()+name.slice(1);dep['set'+name]=value=>{h[key]=typeof value==='function'?value(h[key]):value;};
    }
    for(const name of ['validateAddSheet','pendingFieldsUnchanged','restorePendingAdditionFields','handleVerifySample','handleRewriteSample','assertPendingCodeDispatch'])dep[name]=(...args)=>h.run(name,...args);
    return dep;
  };
  h.readResult=()=>({tag:{id:h.tagId,ndefMessage:(h.smart?[{s:1},{u:'DIFFERENT-TELEMETRY-UID'},{r:40,a:96,w:240,c:70,x:3600,l:50,k:3},h.physicalPayload||{}]:[h.physicalPayload||{}]).map(v=>({tnf:1,type:[84],payload:[2,101,110,...Buffer.from(JSON.stringify(v))]}))},recordCount:h.smart?4:1,parsed:{text1:h.smart?{s:1}:null,text2:h.smart?{u:'DIFFERENT-TELEMETRY-UID'}:null,text3:h.smart?{r:40,a:96,w:240,c:70,x:3600,l:50,k:3}:null,text4:h.physicalPayload||{},raw:h.smart?{text1:'{"s":1}',text3:'{"r":40,"a":96,"w":240,"c":70,"x":3600,"l":50,"k":3}'}:{}}});
  h.run=(name,...args)=>{
    const dependencies=h.dependencies();const code=generate(declaration(name)).code;
    return new Function(...Object.keys(dependencies),`return (${code});`)(...Object.values(dependencies))(...args);
  };
  return h;
}
async function main(){
 for(const form of [1,2]){
  const smart=harness(fixture(),form);smart.smart=true;smart.tagId='E0HARDWARE';await smart.run('handleScanCup');assert(smart.checkingSampleId);assert.equal(smart.pendingAdditionRef.current.candidate.cupUUID,'E0HARDWARE');
  smart.tagId='E0OTHER';await smart.run('handleScanToCheckCup');assert.equal(smart.samples.length,0,'matching telemetry cannot verify different physical hardware');
  smart.tagId='E0HARDWARE';await smart.run('handleScanToCheckCup');assert.equal(smart.samples.length,1,'same hardware verifies even when telemetry ID differs');
  const env=fixture(),h=harness(env,form);
  await h.run('handleScanCup');assert.equal(h.writes.length,1);assert(h.checkingSampleId);assert.equal(h.samples.length,0);
  const a=h.pendingAdditionRef.current;h.run('handleCloseCheckSample');assert.equal(h.isAddSheetVisible,true);assert.equal(h.sheetCoffeeNameOrigin,'Test coffee');
  h.sheetCoffeeNameOrigin='Edited coffee';h.tagId='DIFFERENT-TAG';await h.run('handleScanCup');
  const b=h.pendingAdditionRef.current;assert.notEqual(a.payload.z,b.payload.z);assert.equal(h.physicalPayload.n,'Edited coffee');assert.equal(h.samples.length,0);
  h.physicalPayload={...h.physicalPayload,n:'Mismatch'};await h.run('handleScanToCheckCup');assert.equal(h.checkSampleStatus,'mismatch');
  await h.run('handleRewriteFromCheckScreen');const c=h.pendingAdditionRef.current;assert.notEqual(b.payload.z,c.payload.z);assert.equal(h.checkSampleStatus,'pending');assert.equal(h.checkingSampleId,c.candidate.id);assert.equal(h.samples.length,0);
  env.failAt('INSERT INTO samples');await h.run('handleScanToCheckCup');env.failAt(null);assert.equal(h.pendingAdditionRef.current.phase,'verified');assert.equal(h.samples.length,0);const reads=h.reads;
  await h.run('handleScanToCheckCup');assert.equal(h.reads,reads);assert.equal(h.samples.length,1);assert.equal(h.samples[0].sampleCode,c.payload.z);assert.equal(h.checkingSampleId,null);
  h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin='Second';h.sheetProcess='2';h.tagId='SECOND';h.physicalPayload=null;await h.run('handleScanCup');assert.equal(h.samples.length,1);assert(h.checkingSampleId);
  h.run('handleCloseCheckSample');assert.equal(h.sheetCoffeeNameOrigin,'Second');h.writeFailure=true;await h.run('handleScanCup');assert.equal(h.isAddSheetVisible,true);assert.equal(h.checkingSampleId,null);assert.equal(h.samples.length,1);
  const failed=h.pendingAdditionRef.current;h.writeFailure=false;await h.run('handleScanCup');assert.notEqual(failed.payload.z,h.pendingAdditionRef.current.payload.z);
  let release;h.readWait=new Promise(resolve=>release=resolve);const reading=h.run('handleScanToCheckCup');h.setupEpochRef.current++;release();await reading;assert.equal((await env.repo.getOwnedSessionSetup(h.sessionUUID)).samples.length,1);
 }
 console.log('PASS R1-103 actual screen callbacks + SQLite: both forms, close->editable drawer, edited A-to-B fresh write, failed check/rewrite fresh code, no early member, save-only retry, second sample, write failure retry, stale callback fence. Native NFC mocked.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
