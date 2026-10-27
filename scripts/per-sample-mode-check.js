const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const load=require('./helpers/load-project-module'),{fixture,createCvaDraft}=require('./helpers/sample-code-fixture');
const {RATINGS}=require('../src/features/cupping/data/cvaResponse');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default;
const root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6';
if(process.argv.includes('--base')){
  const source=require('node:child_process').execFileSync('git',['show','1239d7d5fbefc79248027db074c1df903ef58566:src/data/sessionRepository.js'],{cwd:root,encoding:'utf8'});
  const read=fs.readFileSync;fs.readFileSync=function(file,...options){return String(file)===path.join(root,'src/data/sessionRepository.js')?source:read.call(this,file,...options);};
}
// Reuse only the existing actual-handler/native-mock harness, not its main or
// hardcoded permissions. Every saved-screen permission is derived below.
const harnessFile=path.join(__dirname,'sample-code-screen-check.js'),harnessSource=fs.readFileSync(harnessFile,'utf8');
const harnessModule=new Module(harnessFile,module);harnessModule.filename=harnessFile;harnessModule.paths=Module._nodeModulePaths(__dirname);
harnessModule._compile(harnessSource.slice(0,harnessSource.indexOf('async function main(){'))+'\nmodule.exports={harness,value(h,name){const deps=h.dependencies();return new Function(...Object.keys(deps),`return (${generate(declaration(name)).code});`)(...Object.values(deps));}};',harnessFile);
const {harness,value}=harnessModule.exports;
const projections=load(root)('src/features/cupping/screens/savedSessionIdentity.js'),active=load(root)('src/features/cupping/screens/activeSessionIdentity.js');
const formRoute=require('../src/features/forms/sessionFormRoute');
async function savedScreen(env){
  const presentation=await env.repo.getLocalTastingPresentation(S,{purpose:'setup'}),access=await env.repo.getSessionSetupAccess(S),saved=presentation.session;
  const h=harness(env,1,S),deps=h.dependencies;
  Object.assign(h,{sessionId:S,tastingPresentation:presentation,setupAccess:{sessionId:S,...access},sessionName:saved.sessionName,sessionType:saved.sessionType,sessionDate:saved.sessionDate,sessionMode:saved.cuppingMode,samples:saved.samples,sessionStatus:saved.status,samplesInSession:saved.samplesInSession,
    sessionForm:{loadedSessionId:S,cuppingForm:saved.cuppingForm,formKey:saved.formKey,formVersion:saved.formVersion,formHash:saved.formHash,formLocked:saved.formLocked},savedOpenEvidence:null,isAddSheetVisible:false});
  h.savedSessionIdRef.current=S;
  h.dependencies=()=>({...deps(),useMemo:factory=>factory(),projectSavedSessionIdentity:projections.projectSavedSessionIdentity,isSessionFormReady:formRoute.isSessionFormReady});
  for(const name of ['visibleIdentity','hideSavedIdentity','ownsSavedSetup','isSessionFormSupported','canEditSessionSetup'])h[name]=value(h,name);
  return h;
}
const navAst=parse(fs.readFileSync(path.join(root,'src/navigation/AppNavigator.js'),'utf8'),{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const v of Object.values(node))for(const c of Array.isArray(v)?v:[v]){const found=find(c,predicate);if(found)return found;}return null;}
const targetProjection=find(navAst,node=>node.type==='VariableDeclarator'&&node.id?.name==='projectAssessmentContextForSavedSession').init;
async function target(env,context){return new Function('getLocalTastingPresentation','UNSUPPORTED_MESSAGE',`return (${generate(targetProjection).code});`)(env.repo.getLocalTastingPresentation,formRoute.UNSUPPORTED_MESSAGE)(context);}
async function saveEmpty(env){await env.repo.saveSessionWithSamples({sessionUUID:S,sessionName:'Mixed fictional test',sessionType:'4',sessionDate:'21 Oct 2026',cuppingForm:1,cuppingMode:null,samples:[],intent:'setup'});}
function assertRows(rows,raw,revealed=false){
  for(const original of raw){const row=rows.find(row=>row.id===original.id),show=original.cuppingMode==='open'||revealed;assert(row);assert.equal(row.identityHidden,!show);assert.equal(row.coffeeNameOrigin,show?original.coffeeNameOrigin:`Sample ${original.sampleCode}`);assert.equal(row.process,show?original.process:null);}
}
async function main(){
  for(const modes of [['blind','open','blind','open'],['open','blind','open','blind']]){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-mixed-modes-')),env=fixture(path.join(dir,'creator.db'));await saveEmpty(env);
    const payloads=[];
    for(let index=0;index<4;index++){
      if(index===2)env.restart();
      const h=await savedScreen(env);assert.equal(h.canEditSessionSetup,true,`creator setup survives ${modes.slice(0,index).join('+')} and reopen`);assert.equal(h.hideSavedIdentity,false);
      h.run('handleOpenAddSheet');assert.equal(h.isAddSheetVisible,true);
      h.sheetCoffeeNameOrigin=`Fictional ${modes[index]} ${index}`;h.sheetProcess='1';h.sheetCuppingMode=modes[index];h.tagId=`FRESH${index}`;h.physicalPayload=null;
      const prior=h.samples.map(row=>({...row}));await h.run('handleScanCup');assert(h.checkingSampleId);assert.equal(h.samples.length,index);assert.equal(h.physicalPayload.m,modes[index]==='blind'?'b':'o');
      if(index===2){const old=h.pendingAdditionRef.current;h.run('handleCloseCheckSample');assert.equal(h.sheetCoffeeNameOrigin,`Fictional ${modes[index]} ${index}`);h.tagId=`RETRY${index}`;h.physicalPayload=null;await h.run('handleScanCup');assert.notEqual(h.pendingAdditionRef.current.payload.z,old.payload.z);const correct=h.tagId;h.tagId='WRONG';await h.run('handleScanToCheckCup');assert.equal(h.samples.length,index);h.run('handleCloseCheckSample');h.tagId=correct;await h.run('handleScanCup');}
      const pending=h.pendingAdditionRef.current;await h.run('handleScanToCheckCup');assert.equal(h.samples.length,index+1);payloads.push(pending.payload);
      for(const row of prior){const retained=h.samples.find(sample=>sample.id===row.id);assert.equal(retained.sampleCode,row.sampleCode);assert.equal(retained.coffeeNameOrigin,row.coffeeNameOrigin);assert.equal(retained.cuppingMode,row.cuppingMode);}
    }
    env.restart();const owned=await env.repo.getOwnedSessionSetup(S);assert.equal(new Set(owned.samples.map(row=>row.sampleCode)).size,4);assert.deepEqual(owned.samples.map(row=>row.cuppingMode),modes);
    assert.equal((await env.repo.getSessionSetupAccess(S)).canManageSetup,true);
    assertRows((await env.repo.getLocalTastingPresentation(S,{purpose:'setup'})).session.samples,owned.samples,true);
    assertRows((await env.repo.getLocalTastingPresentation(S,{purpose:'tasting'})).session.samples,owned.samples);
    // Static fallbacks have no completion authority; valid session-level legacy
    // modes cannot override the actual per-target stored sample modes.
    for(const globalMode of [null,'blind','open']){
      const raw={...owned,cuppingMode:globalMode};assertRows(projections.projectSavedSessionIdentity(raw,{allowOpen:true}).samples,raw.samples);
      assertRows(active.projectActiveSessionIdentity(raw,raw.samples,{allowOpen:true}).cups,raw.samples);
      for(const sample of raw.samples){const context={sessionId:S,sampleId:sample.id,sampleCode:sample.sampleCode,sampleNumber:sample.sampleNumber,cupIndex:0,cuppingMode:sample.cuppingMode==='blind'?'open':'blind',coffeeNameOrigin:'FORGED',process:'FORGED'};
        const safe=projections.projectSavedAssessmentContext(raw,context);assert.equal(safe.cuppingMode,sample.cuppingMode);assert.equal(safe.coffeeNameOrigin,sample.cuppingMode==='open'?sample.coffeeNameOrigin:`Sample ${sample.sampleCode}`);
      }
    }
    for(const mutation of [{cuppingMode:'broken'},{formHash:'bad'},{samples:owned.samples.map((sample,index)=>index?sample:{...sample,cuppingMode:null})}]){
      const bad={...owned,...mutation};assert(projections.projectSavedSessionIdentity(bad,{allowOpen:true}).samples.every(row=>row.identityHidden));assert(active.projectActiveSessionIdentity(bad,bad.samples,{allowOpen:true}).cups.every(row=>row.identityHidden));
    }
    // Participant imports both modes in order using real resolver and real
    // response APIs; no creator roster/authority is inherited.
    const participant=fixture(path.join(dir,'participant.db'));
    for(let index=0;index<2;index++)await participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:`PARTICIPANT${index}`,metadata:payloads[index]});
    participant.restart();const joined=await participant.repo.getSessionById(S);assert.equal(joined.samples.length,2);assert.equal((await participant.repo.getSessionSetupAccess(S)).canManageSetup,false);
    assertRows((await participant.repo.getLocalTastingPresentation(S)).session.samples,joined.samples);
    for(const sample of joined.samples){const response=await participant.repo.getCvaResponse(S,sample.id);assert.equal(response.identity.visible,sample.cuppingMode==='open');const context=await target(participant,{sessionId:S,sampleId:sample.id,cuppingMode:'open',coffeeNameOrigin:'FORGED',process:'FORGED'});assert.equal(context.coffeeNameOrigin,sample.cuppingMode==='open'?sample.coffeeNameOrigin:`Sample ${sample.sampleCode}`);
      const draft={...createCvaDraft(5),ratings:Object.fromEntries(Object.values(RATINGS).map(key=>[key,7]))};await participant.repo.saveCvaResponse({sessionId:S,sampleId:sample.id,response:draft,expectedRevision:response.revision,expectedIdentity:response.trusted.identity,expectedCupCount:5,expectedTastingContextToken:response.tasting.contextToken});}
    assert.equal((await participant.complete(S)).status,'complete');assertRows((await participant.repo.getLocalTastingPresentation(S)).session.samples,joined.samples,true);
    assert.equal((await participant.complete(S)).status,'complete','completion acknowledgement remains idempotent');
    const selected=joined.samples[0],saved=await participant.repo.getCvaResponse(S,selected.id);await participant.repo.saveCvaResponse({sessionId:S,sampleId:selected.id,response:{...saved.response,ratings:{...saved.response.ratings,fragrance:8}},expectedRevision:saved.revision,expectedIdentity:saved.trusted.identity,expectedCupCount:5,expectedTastingContextToken:saved.tasting.contextToken});
    assertRows((await participant.repo.getLocalTastingPresentation(S)).session.samples,joined.samples);
    const permission=await participant.repo.getParticipantSampleRemovalContext(S,joined.samples[1].id);assert.equal(permission.canRemove,true);await participant.repo.removeParticipantSample({sessionId:S,sampleId:joined.samples[1].id,expectedRemovalToken:permission.removalToken});const retained=(await participant.repo.getLocalTastingPresentation(S)).session.samples;assert.equal(retained.length,2);assert.equal(retained[1].id,joined.samples[1].id);assert.equal(retained[1].sampleCode,joined.samples[1].sampleCode);assert.equal(retained[1].tastingActive,false);
    env.actor(env.actorB);assert.equal((await env.repo.getSessionSetupAccess(S)).canManageSetup,false);env.actor(env.actorA);
    env.storage.delete('cup_app:user_profile');assert.equal((await env.repo.getSessionSetupAccess(S)).canManageSetup,false);env.actor(env.actorA);
    env.sqlite.exec('INSERT OR REPLACE INTO local_session_foundations(session_id,schema_version,ever_started,ever_completed) SELECT id,1,1,0 FROM sessions');
    assert.equal((await env.repo.getSessionSetupAccess(S)).canManageSetup,false,'started mixed session loses creator setup authority');
    assertRows((await env.repo.getLocalTastingPresentation(S,{purpose:'setup'})).session.samples,owned.samples);
  }
  console.log('PASS R1-105: real mixed CVA both orders, 3rd/4th verified additions/reopen, actual permission/drawer/write/check callbacks, fresh cancel/retry/wrong cup, per-target saved/active/nav/response visibility, participant mixed imports, completion/reopen/removal; no radio.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
