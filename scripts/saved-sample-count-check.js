// Actual screen callbacks/staging and on-disk SQLite; NFC transport is mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {fixture}=require('./helpers/sample-code-fixture'),load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6',screen=path.join(root,'src/features/cupping/screens/CuppingSessionDetailsScreen.js');
if(process.argv.includes('--base')){
  const original=require('node:child_process').execFileSync('git',['show','e1ee719f2ce2474f5251fccee2843ad3b86c9ab3:src/features/cupping/screens/CuppingSessionDetailsScreen.js'],{cwd:root,encoding:'utf8'}),read=fs.readFileSync;
  fs.readFileSync=function(file,...options){return String(file)===screen?original:read.call(this,file,...options);};
}
const filename=path.join(__dirname,'sample-code-screen-check.js'),source=fs.readFileSync(filename,'utf8'),mod=new Module(filename,module);
mod.filename=filename;mod.paths=Module._nodeModulePaths(__dirname);
mod._compile(source.slice(0,source.indexOf('async function main(){'))+'\nmodule.exports={harness,value(h,name){const deps=h.dependencies();return new Function(...Object.keys(deps),`return (${generate(declaration(name)).code});`)(...Object.values(deps));}};',filename);
const {harness,value}=mod.exports,forms=require('../src/features/forms/sessionFormRoute'),projection=load(root)('src/features/cupping/screens/savedSessionIdentity.js');
async function reopen(env,form,stringCount=true){
  env.restart();const presentation=await env.repo.getLocalTastingPresentation(S,{purpose:'setup'}),access=await env.repo.getSessionSetupAccess(S),saved=presentation.session,h=harness(env,form,S),deps=h.dependencies;
  Object.assign(h,{sessionId:S,tastingPresentation:presentation,setupAccess:{sessionId:S,...access},sessionName:saved.sessionName,sessionType:saved.sessionType,sessionDate:saved.sessionDate,sessionMode:saved.cuppingMode,samples:saved.samples,sessionStatus:saved.status,
    samplesInSession:stringCount?String(saved.samplesInSession||''):saved.samplesInSession,
    sessionForm:{loadedSessionId:S,cuppingForm:saved.cuppingForm,formKey:saved.formKey,formVersion:saved.formVersion,formHash:saved.formHash,formLocked:saved.formLocked},savedOpenEvidence:null,isAddSheetVisible:false});
  h.savedSessionIdRef.current=S;h.dependencies=()=>({...deps(),useMemo:factory=>factory(),projectSavedSessionIdentity:projection.projectSavedSessionIdentity,isSessionFormReady:forms.isSessionFormReady});
  for(const name of ['visibleIdentity','hideSavedIdentity','ownsSavedSetup','isSessionFormSupported','canEditSessionSetup'])h[name]=value(h,name);
  assert.equal(h.canEditSessionSetup,true);assert.equal(h.hideSavedIdentity,false);return h;
}
async function begin(h,index){
  h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin=`Fictional coffee ${index}`;h.sheetProcess='1';h.sheetCupNumber=5;h.sheetCuppingMode=h.selectedForm===2?'open':index%2?'blind':'open';h.tagId=`TAG${index}`;h.physicalPayload=null;
  const prior=h.samples.length;await h.run('handleScanCup');assert(h.checkingSampleId,`addition ${index} must write before checking: ${h.scanStatusMessage}`);assert.equal(h.samples.length,prior);
  const pending=h.pendingAdditionRef.current;if(!process.argv.includes('--base'))assert.equal(pending.payload.i,pending.saveInput.samplesInSession);assert.equal(pending.payload.y,5);return pending;
}
async function finish(h){await h.run('handleScanToCheckCup');assert.equal(h.checkingSampleId,null);assert.equal(h.sessionStatus,'new');}
async function main(){
  for(const form of [1,2])for(const stringCount of [true,false]){
    const env=fixture(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-count-')),'test.db'));let h=harness(env,form,S);assert.equal(h.samplesInSession,'');const payloads=[];
    for(let index=1;index<=5;index++){
      if(index===3||index===5){h=await reopen(env,form,stringCount);assert.equal(Number(h.samplesInSession),index-1,'actual persisted positive count is reloaded');}
      const pending=await begin(h,index);assert.equal(pending.payload.i,index,'historical count cannot cap prospective membership');payloads.push(pending.payload);await finish(h);assert.equal(h.samples.length,index);
    }
    const saved=await env.repo.getOwnedSessionSetup(S);assert.equal(new Set(saved.samples.map(row=>row.sampleCode)).size,5);
    for(let index=0;index<5;index++){assert.equal(saved.samples[index].coffeeNameOrigin,`Fictional coffee ${index+1}`);assert.equal(saved.samples[index].sampleCode,payloads[index].z);assert.equal(saved.samples[index].cuppingMode,form===2?'open':index%2?'open':'blind');}
    h=await reopen(env,form,stringCount);h.samplesInSession=stringCount?'12':12;
    const sixth=await begin(h,6);assert.equal(sixth.payload.i,12,'larger advertised total retained');h.run('handleCloseCheckSample');assert.equal(h.samples.length,5);
    h.writeFailure=true;await h.run('handleScanCup');assert.equal(h.checkingSampleId,null);assert.equal(h.samples.length,5);h.writeFailure=false;
    await h.run('handleScanCup');const frozen=h.pendingAdditionRef.current;h.physicalPayload={...h.physicalPayload,i:13};await h.run('handleScanToCheckCup');assert.equal(h.checkSampleStatus,'mismatch');assert.equal(h.samples.length,5,'frozen count mismatch cannot add');
    h.physicalPayload=frozen.payload;env.failAt('INSERT INTO samples');await h.run('handleScanToCheckCup');env.failAt(null);assert.equal(h.pendingAdditionRef.current.phase,'verified');
    const writes=h.writes.length,reads=h.reads;h.samplesInSession='99';await finish(h);assert.equal(h.writes.length,writes);assert.equal(h.reads,reads);assert.equal(h.samples.length,6);assert.equal((await env.repo.getOwnedSessionSetup(S)).samplesInSession,12,'save-only recovery uses frozen count, not changed screen input');
    // The low-level explicitly declared-total guard remains effective.
    const setup=await env.repo.getOwnedSessionSetup(S),candidate={...frozen.candidate,id:'candidate',cupUUID:'NEW-TARGET',coffeeNameOrigin:'Low-level rejected'};
    await assert.rejects(env.repo.stagePendingSampleAddition({sessionId:S,expectedOperationId:null,candidate,tagContext:frozen.tagContext,observedMetadata:null,saveInput:{...frozen.saveInput,samplesInSession:1,samples:[...setup.samples,candidate]}}),/Declared sample total is smaller/);
    assert.equal((await env.repo.getOwnedSessionSetup(S)).samples.length,6);
    for(const payload of payloads){const stored=env.sqlite.prepare('SELECT sample_metadata_json AS metadata FROM samples WHERE sample_code=?').get(payload.z);assert.deepEqual(JSON.parse(stored.metadata),payload,'previous complete immutable tag snapshot unchanged');}
  }
  console.log('PASS R1-106 saved-count actual disk/AST: blank start, two verified then positive-count reopen, third/fourth/fifth both forms/CVA mixed, numeric/string hints, larger hints, cancellation/write failure/frozen mismatch/save-only and low-level guard; no physical NFC.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
