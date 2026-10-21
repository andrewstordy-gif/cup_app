// Real on-disk SQLite/repository reopen and actual screen guard callbacks.
// No native NFC, phone storage, schemas, UI or working app changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default;
const {fixture}=require('./helpers/sample-code-fixture');
const load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6';
// Repro mode overlays only the pinned original repository source while loading
// actual modules. No checkout, running app, database schema or file is changed.
if(process.argv.includes('--base')){
  const baseline=require('node:child_process').execFileSync('git',['show','0b1dd6498d22eebe01caa36f7a4f4ebae2cfaa72:src/data/sessionRepository.js'],{cwd:root,encoding:'utf8'});
  const read=fs.readFileSync;fs.readFileSync=function(file,...options){return String(file)===path.join(root,'src/data/sessionRepository.js')?baseline:read.call(this,file,...options);};
}
const ast=parse(fs.readFileSync(path.join(root,'src/features/cupping/screens/CuppingSessionDetailsScreen.js'),'utf8'),{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const value of Object.values(node))for(const child of Array.isArray(value)?value:[value]){const found=find(child,predicate);if(found)return found;}return null;}
const expression=name=>find(ast,node=>node.type==='VariableDeclarator'&&node.id?.name===name).init;
const constants=load(root)('src/features/cupping/constants/sessionDetails.js');
const {isSessionFormReady,formIdentity,UNSUPPORTED_MESSAGE}=require('../src/features/forms/sessionFormRoute');
const {projectSavedSessionIdentity}=load(root)('src/features/cupping/screens/savedSessionIdentity.js');
function screen(presentation,access,{sessionId=S,pending=null}={}){
  const saved=presentation.session;
  const h={sessionId,tastingPresentation:presentation,setupAccess:{sessionId,...access},sessionName:saved.sessionName,sessionType:saved.sessionType,
    sessionDate:saved.sessionDate,sessionMode:saved.cuppingMode,samples:saved.samples,sessionForm:{loadedSessionId:sessionId,cuppingForm:saved.cuppingForm,
      formKey:saved.formKey,formVersion:saved.formVersion,formHash:saved.formHash,formLocked:saved.formLocked},
    savedOpenEvidence:null,isLegacy:saved.cuppingForm===2,isAddSheetVisible:false,saveOperationRef:{current:null},pendingAdditionBusyRef:{current:null},pendingAdditionRef:{current:pending}};
  if(!sessionId)h.sessionForm=formIdentity(saved.cuppingForm);
  h.evaluate=name=>{const deps={...constants,...h,useMemo:factory=>factory(),projectSavedSessionIdentity,isSessionFormReady,UNSUPPORTED_MESSAGE};
    for(const name of ['EditingSampleId','SheetCoffeeNameOrigin','SheetProcess','SheetCupNumber','IsSheetCupNumberDefault','SheetCuppingMode','IsSheetCuppingModeDefault','SheetErrors','ScanStatusMessage','CupBlockedMessage','IsAddSheetVisible','SessionName','SessionType'])deps['set'+name]=value=>{h[name[0].toLowerCase()+name.slice(1)]=value;};
    deps.restorePendingAdditionFields=p=>h.evaluate('restorePendingAdditionFields')(p);
    return new Function(...Object.keys(deps),`return (${generate(expression(name)).code});`)(...Object.values(deps));};
  for(const name of ['visibleIdentity','hideSavedIdentity','ownsSavedSetup','isSessionFormSupported','canEditSessionSetup'])h[name]=h.evaluate(name);
  h.open=()=>h.evaluate('handleOpenAddSheet')();return h;
}
async function saveEmpty(env,form=1){await env.repo.saveSessionWithSamples({sessionUUID:S,sessionName:'Empty creator draft',sessionType:'4',sessionDate:'21 Oct 2026',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[],intent:'setup'});}
async function context(env,purpose='setup',pending=null){const presentation=await env.repo.getLocalTastingPresentation(S,{purpose});const access=await env.repo.getSessionSetupAccess(S);return screen(presentation,access,{pending});}
function dump(env){return JSON.stringify(env.sqlite.prepare('SELECT * FROM sessions').all())+JSON.stringify(env.sqlite.prepare('SELECT * FROM samples').all())+JSON.stringify(env.sqlite.prepare('SELECT * FROM issued_sample_codes').all())+JSON.stringify(env.sqlite.prepare('SELECT * FROM local_pending_sample_additions').all());}
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-empty-draft-guard-'));
  const env=fixture(path.join(dir,'reopen.db'));await saveEmpty(env);env.restart();
  const before=dump(env),h=await context(env);
  assert.equal(h.canEditSessionSetup,true);assert.equal(h.tastingPresentation.tasting.isLocalCreator,true);
  h.open();assert.equal(h.isAddSheetVisible,true,'reopened owned empty CVA DRAFT must open Add Coffee Sample without host-only block');
  assert.equal(h.hideSavedIdentity,false);assert(!String(h.scanStatusMessage).includes('host-only'));assert.equal(dump(env),before,'opening drawer changes no saved session/code/member');
  const tasting=await context(env,'tasting');assert.equal(tasting.hideSavedIdentity,true,'empty null-mode tasting purpose stays private');
  tasting.open();assert.equal(tasting.isAddSheetVisible,false,'setup projection exception never leaks into tasting purpose');
  env.actor(env.actorB);const foreign=await context(env);foreign.open();assert.equal(foreign.isAddSheetVisible,false);assert.equal(foreign.hideSavedIdentity,true);
  env.storage.delete('cup_app:r1_103:user_profile');const invalid=await context(env);invalid.open();assert.equal(invalid.canEditSessionSetup,false);assert.equal(invalid.hideSavedIdentity,true);env.actor(env.actorA);
  for(const mutation of [
    "UPDATE sessions SET cupping_mode='broken'",
    "UPDATE sessions SET form_locked=1",
    "UPDATE sessions SET form_hash='unsupported'",
    "UPDATE sessions SET local_creator_profile_id=NULL",
    "UPDATE sessions SET status='pending'",
    "INSERT INTO local_session_foundations(session_id,schema_version,ever_started,ever_completed) SELECT id,1,1,0 FROM sessions",
    "INSERT INTO local_session_foundations(session_id,schema_version,ever_started,ever_completed) SELECT id,1,1,1 FROM sessions",
    "UPDATE sessions SET status='complete'",
  ]){
    const negative=fixture(path.join(dir,`negative-${Math.random()}.db`));await saveEmpty(negative);negative.sqlite.exec(mutation);negative.restart();
    const guarded=await context(negative);guarded.open();assert.equal(guarded.hideSavedIdentity,true,mutation);assert.equal(guarded.isAddSheetVisible,false,mutation);
  }
  const legacy=fixture(path.join(dir,'legacy.db'));await saveEmpty(legacy,2);legacy.restart();const legacyScreen=await context(legacy);legacyScreen.open();assert.equal(legacyScreen.isAddSheetVisible,true,'existing Legacy Open setup remains unchanged');
  legacy.sqlite.exec('UPDATE sessions SET cupping_mode=NULL');legacy.restart();const legacyInvalid=await context(legacy);legacyInvalid.open();assert.equal(legacyInvalid.isAddSheetVisible,false);assert.equal(legacyInvalid.hideSavedIdentity,true,'Legacy never receives CVA null-mode exception');
  const fresh=screen(h.tastingPresentation,{canManageSetup:false},{sessionId:null});fresh.open();assert.equal(fresh.isAddSheetVisible,true,'unsaved new-session route remains unchanged');
  // A failed staged addition writes nothing; saved empty setup must still open.
  const setup=await env.repo.getOwnedSessionSetup(S),candidate={id:'candidate',cupUUID:'TESTTAG',cupNumber:5,cuppingForm:1,cuppingMode:'blind',sampleNumber:1,coffeeNameOrigin:'Fictional coffee',process:'1'};
  const input={sessionId:S,candidate,tagContext:{kind:'ntag'},saveInput:{sessionUUID:S,existingSessionId:S,sessionDisplayId:setup.sessionDisplayId,sessionName:setup.sessionName,sessionType:setup.sessionType,sessionDate:setup.sessionDate,cuppingForm:1,cuppingMode:null,samplesInSession:0,status:'new',samples:[candidate],intent:'setup'}};
  env.failAt('INSERT INTO local_pending_sample_additions');await assert.rejects(env.repo.stagePendingSampleAddition(input),/injected/);env.failAt(null);env.restart();
  const failed=await context(env);failed.open();assert.equal(failed.isAddSheetVisible,true);assert.equal((await env.repo.getOwnedSessionSetup(S)).samples.length,0);
  // A native write failure retains an unconfirmed staged record. Reopening must
  // recover the filled drawer without re-writing, reserving or adding a member.
  await env.repo.stagePendingSampleAddition(input);env.restart();const pending=await env.repo.getPendingSampleAddition(S);assert.equal(pending.writeCompleted,false);
  const pendingBefore=dump(env),recovery=await context(env,'setup',pending);recovery.open();assert.equal(recovery.isAddSheetVisible,true);assert.equal(recovery.sheetCoffeeNameOrigin,'Fictional coffee');assert.equal(dump(env),pendingBefore);
  console.log('PASS R1-104: real on-disk empty CVA DRAFT save/reopen + presentation-derived screen guards, fresh route, Legacy unchanged, stage-failure/recovery nonmutation; negative actor/tasting/started/completed/mode/pin/locked guards. Software only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
