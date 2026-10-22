// Actual canonical save, SQLite history, repository DTO and screen/card badge.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {fixture,createCvaDraft}=require('./helpers/sample-code-fixture'),{RATINGS}=require('../src/features/cupping/data/cvaResponse'),root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6';
if(process.argv.includes('--base')){
  const original=fs.readFileSync,sources=new Map(['src/data/sessionRepository.js','src/features/cupping/data/cvaResponseStore.js'].map(file=>[path.join(root,file),require('node:child_process').execFileSync('git',['show',`c78a20cbd74a237fac54882963d3e89630a5f407:${file}`],{cwd:root,encoding:'utf8'})]));
  fs.readFileSync=function(file,...args){return sources.has(String(file))?sources.get(String(file)):original.call(this,file,...args);};
}
const helper=path.join(__dirname,'pending-blind-card-check.js'),text=fs.readFileSync(helper,'utf8'),mod=new Module(helper,module);mod.filename=helper;mod.paths=Module._nodeModulePaths(__dirname);const argv=process.argv;process.argv=argv.filter(value=>value!=='--base');try{mod._compile(text.slice(0,text.indexOf('\nasync function main(){'))+'\nmodule.exports={view,harness,save,card};',helper);}finally{process.argv=argv;}const {view,harness,save,card}=mod.exports;
const full=()=>({...createCvaDraft(5),ratings:Object.fromEntries(Object.values(RATINGS).map(key=>[key,7]))});
function history(env){return env.sqlite.prepare('SELECT ever_started,ever_completed FROM local_session_foundations WHERE session_id=?').get(S);}
function startedAt(env){return env.sqlite.prepare('SELECT local_tasting_started_at AS time FROM sessions WHERE id=?').get(S).time;}
function snapshot(env){return JSON.stringify(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));}
async function current(env,label,{locked=false,complete=false,raw=label==='Pending'?'pending':label==='In Progress'?'in_progress':undefined}={}){
  const h=await view(env);assert.equal(h.sessionStatusBadgeLabel,label,'actual card status follows latest saved ratings');assert.equal(h.tastingPresentation.session.status,label==='Complete'?'complete':label==='Draft'?'new':label==='Pending'?'pending':'in_progress');
  if(raw)assert.equal((await env.repo.getSessionById(S)).status,raw,'explicit-save stored progress agrees');
  if(locked){assert.equal(h.tastingPresentation.tasting.started,true);assert.equal(h.canEditSessionSetup,false,'Pending must not regain setup');assert.equal((await env.repo.getSessionSetupAccess(S)).canManageSetup,false);assert.equal(history(env).ever_started,1);await assert.rejects(env.repo.getOwnedSessionSetup(S),/setup_started/);
    const stored=await env.repo.getSessionById(S),candidate={...stored.samples[0],id:'new-candidate',cupUUID:'NEW-TAG',sampleNumber:stored.samples.length+1};await assert.rejects(env.repo.stagePendingSampleAddition({sessionId:S,candidate,tagContext:{kind:'ntag'},saveInput:{...stored,existingSessionId:S,intent:'setup',samples:[...stored.samples,candidate]}}),/setup_started/);
  }
  for(let index=0;index<h.samples.length;index++){const sample=h.samples[index],display=card(h,sample,index).display;assert.equal(display.identityHidden,sample.cuppingMode==='blind'&&label!=='Draft'&&!complete,'Blind stays hidden after last score clears');if(label==='Pending')assert.equal(h.sampleStatusById[sample.id].hasAnyFeedback,false);}
  return h;
}
async function main(){
  for(const modes of [['blind'],['open'],['blind','open']]){
    const env=fixture(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-rating-progress-')),'test.db')),h=harness(env,1,S);
    for(let index=0;index<modes.length;index++){h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin=`SECRET_${index}`;h.sheetProcess='5';h.sheetCuppingMode=modes[index];h.tagId=`TAG${index}`;h.physicalPayload=null;await h.run('handleScanCup');await h.run('handleScanToCheckCup');}
    const draft=await current(env,'Draft');await save(draft);let pending=await current(env,'Pending'),ids=pending.samples.map(sample=>sample.id);
    await env.save(S,ids[0],createCvaDraft(5));if(!process.argv.includes('--base'))await current(env,'Pending');assert.equal(history(env).ever_started,0,'defaults-only Save never starts tasting');
    await env.save(S,ids[0],{...createCvaDraft(5),ratings:{fragrance:7}});await current(env,'In Progress',{locked:true});const firstStarted=startedAt(env),revisionBefore=(await env.repo.getCvaResponse(S,ids[0])).revision;
    const unsaved=createCvaDraft(5);assert.deepEqual(unsaved.ratings,{});await current(env,'In Progress',{locked:true});
    await env.save(S,ids[0],unsaved);await current(env,'Pending',{locked:true});assert.equal(startedAt(env),firstStarted);assert.equal((await env.repo.getCvaResponse(S,ids[0])).revision,revisionBefore+1,'clearing appends history');
    env.restart();await current(env,'Pending',{locked:true});await env.save(S,ids[0],{...createCvaDraft(5),ratings:{aroma:6}});await current(env,'In Progress',{locked:true});
    await env.save(S,ids[0],full());if(ids[1])await env.save(S,ids[1],{...createCvaDraft(5),ratings:{fragrance:5}});
    await env.save(S,ids[0],createCvaDraft(5));await current(env,ids[1]?'In Progress':'Pending',{locked:true});if(ids[1])await env.save(S,ids[1],createCvaDraft(5));await current(env,'Pending',{locked:true});
    for(const response of [{...createCvaDraft(5),general_affective_notes:'Saved notes'}, {...createCvaDraft(5),affective_notes:{fragrance_aroma:'Notes'}}, {...createCvaDraft(5),non_uniform_cups:[1],defect_description:'Observation'},createCvaDraft(5)]){await env.save(S,ids[0],response);await current(env,'Pending',{locked:true});}
    assert.equal(startedAt(env),firstStarted);assert(env.sqlite.prepare('SELECT COUNT(*) AS n FROM cva_response_revisions WHERE session_id=?').get(S).n>5);
    for(const id of ids)await env.save(S,id,full());await env.complete(S);await current(env,'Complete',{locked:true,complete:true});assert.equal(history(env).ever_completed,1);
    for(const id of ids)await env.save(S,id,createCvaDraft(5));await current(env,'Pending',{locked:true});assert.equal(history(env).ever_completed,1,'clearing retains completion history');assert.equal(startedAt(env),firstStarted);
    // Represent existing already-cleared data from the old implementation.
    env.sqlite.prepare("UPDATE sessions SET status='in_progress' WHERE id=?").run(S);env.restart();const before=snapshot(env);await current(env,'Pending',{locked:true,raw:'in_progress'});assert.equal(snapshot(env),before,'old-cleared display correction is read-only');
    await env.save(S,ids[0],createCvaDraft(5));await current(env,'Pending',{locked:true});
    env.sqlite.prepare('UPDATE local_session_foundations SET ever_started=0 WHERE session_id=?').run(S);const damaged=snapshot(env);await assert.rejects(env.repo.recomputeSessionProgressStatus(S),/damaged_history/);assert.equal(snapshot(env),damaged,'rating recomputation retains corrupt-history fail-closed guard');env.sqlite.prepare('UPDATE local_session_foundations SET ever_started=1 WHERE session_id=?').run(S);
    // Unsupported pin must not gain setup/reveal through the new display path.
    env.sqlite.prepare("UPDATE sessions SET form_hash='unsupported' WHERE id=?").run(S);const unsupported=await env.repo.getLocalTastingPresentation(S,{purpose:'setup'});assert.equal(unsupported.tasting.canManageSetup,false);assert(unsupported.session.samples.every(sample=>sample.identityHidden));await assert.rejects(env.save(S,ids[0],full()));
    const manifest=require('../src/features/forms/contract/manifests/cva-v2.json'),pin={form_key:manifest.form_key,form_version:manifest.form_version,form_hash:require('../src/features/forms/contract/canonical').sha256(require('../src/features/forms/contract/canonical').canonicalize(manifest))},store=require('../src/features/cupping/data/cvaResponseStore');
    env.sqlite.prepare('UPDATE sessions SET form_key=?,form_version=?,form_hash=? WHERE id=?').run(pin.form_key,pin.form_version,pin.form_hash,S);
    env.sqlite.prepare('UPDATE cva_response_revisions SET form_key=?,form_version=?,form_hash=? WHERE session_id=?').run(pin.form_key,pin.form_version,pin.form_hash,S);
    const historical=await store.readWithDb(env.bridge,S,ids[0]);assert.equal(historical.historicalReadOnly,true);assert.equal((await store.statusesWithDb(env.bridge,S))[ids[0]].hasAnyFeedback,true,'historical read-only status retains prior contract');
    await assert.rejects(store.saveWithDb(env.bridge,{sessionId:S,sampleId:ids[0],response:createCvaDraft(5),expectedRevision:historical.revision,expectedIdentity:pin,expectedCupCount:5},()=> 'unused'),/historical_read_only/);
  }
  const old=fixture(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-implicit-start-')),'test.db')),draft=harness(old,1,S);await draft.run('handleScanCup');await draft.run('handleScanToCheckCup');await save(await view(old));const id=(await old.repo.getSessionById(S)).samples[0].id;
  await old.save(S,id,{...createCvaDraft(5),ratings:{fragrance:7}});await old.save(S,id,createCvaDraft(5));
  old.sqlite.prepare('DELETE FROM local_session_foundations WHERE session_id=?').run(S);old.sqlite.prepare("UPDATE sessions SET status='in_progress',local_tasting_started_at=NULL WHERE id=?").run(S);
  assert.equal(await old.repo.recomputeSessionProgressStatus(S),'pending');assert.equal(history(old).ever_started,1,'explicit recompute preserves implicit old start before lowering status');assert.equal(startedAt(old),null,'no fabricated timestamp');await current(old,'Pending',{locked:true});old.restart();await current(old,'Pending',{locked:true});
  console.log('PASS R1-111 actual canonical saved ratings/card badge/SQLite: defaults, partial/full clear, other samples, notes/defects, rescore, restart, explicit completion/reopen, durable history/setup lock/Blind privacy, old cleared read-only projection, implicit history preservation and unsupported pins.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
