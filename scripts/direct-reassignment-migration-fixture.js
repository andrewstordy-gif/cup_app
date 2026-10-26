// R1-147 author migration fixture; QA-shared foundation, synthetic databases only.
// Original v2 runtime and harness are read from pinned bd29397 via git show.
// No dependency on another checkout or external /tmp fixture.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),baseline=path.resolve(__dirname,'..'),ref='bd29397';
const originalRead=fs.readFileSync,cache=new Map();
function selectSource(historical){if(!historical)return ()=>{};fs.readFileSync=function(file,...args){
 if(typeof file==='string'&&file.startsWith(path.join(baseline,'src')+path.sep)){const relative=path.relative(baseline,file);if(!cache.has(relative))cache.set(relative,execFileSync('git',['show',ref+':'+relative],{cwd:baseline}));const bytes=cache.get(relative);return args[0]==='utf8'?bytes.toString('utf8'):bytes;}return originalRead.call(fs,file,...args);
 };return ()=>{fs.readFileSync=originalRead;};}
const file=path.join(baseline,'scripts/integrated-bootstrap-check.js');
let text=execFileSync('git',['show',ref+':scripts/integrated-bootstrap-check.js'],{cwd:baseline,encoding:'utf8'}).split('async function main(){')[0];
text=text.replace('let load;const env=','let load,qaSerial=0;const env=')
 .replace("generateDomainId:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'","generateDomainId:()=> `aaaaaaaa-aaaa-4aaa-8aaa-${String(++qaSerial).padStart(12,'0')}`")
 .replace('reload(){load=projectLoader(root,mocks);','reload(nextRoot){const restore=selectSource(!nextRoot);try{load=projectLoader(root,mocks);')
 .replace("env.profile=load('src/data/userProfileRepository.js');},","env.profile=load('src/data/userProfileRepository.js');}finally{restore();}},");
global.__r147SelectSource=selectSource;text='const selectSource=global.__r147SelectSource;\\n'.replace('\\n','\n')+text;
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(text+'\\nmodule.exports={harness,snapshot};'.replace('\\n','\n'),file);
const {harness,snapshot}=m.exports;
const raw=(uid,metadata)=>({tag:{id:uid,ndefMessage:[{tnf:1,type:[84],payload:[2,101,110,...Buffer.from(JSON.stringify(metadata))]}]},recordCount:1});
async function empty(env,id,form=1){await env.repo.saveSessionWithSamples({sessionUUID:id,sessionName:'Migration synthetic',sessionType:'4',sessionDate:'26 Oct 2026',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[],intent:'setup'});}
async function addition(env,id,form=1,phase='committed'){
 await empty(env,id,form);const setup=await env.repo.getOwnedSessionSetup(id),sample={id:'temporary',cupUUID:'UID'+id.toUpperCase(),cupNumber:2,cuppingForm:form,cuppingMode:form===2?'open':'blind',sampleNumber:1,coffeeNameOrigin:'Synthetic secret',process:'1'};
 const p=await env.repo.stagePendingSampleAddition({sessionId:id,candidate:sample,tagContext:{kind:'ntag'},saveInput:{...setup,sessionUUID:id,existingSessionId:id,samples:[sample],intent:'setup'}});
 if(phase==='staged')return p;
 await env.repo.markPendingSampleAdditionWritten({sessionId:id,operationId:p.operationId});if(phase==='written')return p;
 await env.repo.markPendingSampleAdditionVerified({sessionId:id,operationId:p.operationId,payload:p.payload,physicalUID:sample.cupUUID,tagContext:p.tagContext});if(phase==='verified')return p;
 await env.repo.commitPendingSampleAddition({sessionId:id,operationId:p.operationId});return p;
}
async function removal(env,id,phase='written'){
 const p=await addition(env,id),pending=await env.repo.stageDraftSampleRemoval({sessionId:id,readResult:raw(p.candidate.cupUUID,p.payload)});
 if(phase==='staged')return pending;
 await env.repo.beginDraftSampleRemovalWrite({sessionId:id,operationId:pending.operationId,expectedBytesHash:pending.frozen.bytesHash});if(phase==='writing')return pending;
 await env.repo.markDraftSampleRemovalWritten({sessionId:id,operationId:pending.operationId});if(phase==='written')return pending;
 await env.repo.inspectDraftSampleRemovalRead({sessionId:id,operationId:pending.operationId,readResult:raw(p.candidate.cupUUID,{})});if(phase==='verified')return pending;
 await env.repo.commitDraftSampleRemoval({sessionId:id,operationId:pending.operationId});return pending;
}
async function legacyReassignment(env,id,phase='staged'){
 await empty(env,id);const uid='OLD'+id.toUpperCase(),metadata={n:'Protected legacy',p:1,y:2,i:1,z:'A4',m:'b',f:1,e:'Foreign',t:4,d:261026,u:'abcdefghijklmn'},current=()=>true;
 const prompt=await env.repo.inspectCupReassignment({destinationId:id,readResult:raw(uid,metadata),isCurrent:current});let pending=await env.repo.stageCupReassignment({observation:prompt.observation,consentVersion:1,drawerDraft:{coffeeNameOrigin:'Editable legacy',process:'2',cupNumber:2,cuppingMode:'blind'},isCurrent:current});
 const command=()=>({destinationId:id,operationId:pending.operationId,expectedRevision:pending.revision,isCurrent:current});
 if(phase==='staged')return {pending,uid,metadata};
 pending=(await env.repo.beginCupReassignmentClear({...command(),readResult:raw(uid,metadata)})).pending;if(phase==='clear_check')return {pending,uid,metadata};
 pending=(await env.repo.inspectCupReassignmentClear({...command(),readResult:raw(uid,{})})).pending;if(phase==='clear_verified')return {pending,uid,metadata};
 await env.repo.commitCupReassignmentClear(command());return {pending,uid,metadata};
}
async function seedAll(env){
 const additions=[],removals=[],legacy=[];
 for(const form of [1,2]){
  const id=`save000000000${form}`,p=await addition(env,id,form),ready=await env.repo.getSessionLockReadiness(id);await env.repo.lockSessionSetup({sessionId:id,expectedSnapshot:ready.snapshot});await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:p.candidate.cupUUID,metadata:p.payload});
  if(form===1){const value=await env.repo.getCvaResponse(id,p.candidate.id),response=require(path.join(baseline,'src/features/cupping/data/cvaResponse')).createCvaDraft(2);response.ratings.fragrance=7;response.general_affective_notes='Saved synthetic Ω';await env.repo.saveCvaResponse({sessionId:id,sampleId:p.candidate.id,response,expectedRevision:value.revision,expectedIdentity:value.trusted.identity,expectedCupCount:value.n,expectedTastingContextToken:value.tasting.contextToken});}
  else{const value=await env.repo.getLegacyResponse(id,p.candidate.id);await env.repo.saveLegacyResponse({sessionId:id,sampleId:p.candidate.id,response:{quality_ratings:{fragrance_aroma:28},notes:'Legacy synthetic Ω'},expectedFingerprint:value.savedFingerprint,expectedRemovalGeneration:value.removalGeneration,expectedTastingContextToken:value.tasting.contextToken});}
 }
 for(const [i,phase] of ['staged','written','verified'].entries())additions.push(await addition(env,`add0000000000${i}`,i===1?2:1,phase));
 for(const [i,phase] of ['staged','writing','written','verified','committed'].entries())removals.push(await removal(env,`rem0000000000${i}`,phase));
 for(const [i,phase] of ['staged','clear_check','clear_verified','committed'].entries())legacy.push(await legacyReassignment(env,`leg0000000000${i}`,phase));
 assert.equal(env.db.prepare('PRAGMA user_version').get().user_version,6);
 assert.equal(env.db.prepare('SELECT COUNT(*) n FROM local_pending_cup_reassignments').get().n,3);
 assert.equal(env.db.prepare('SELECT COUNT(*) n FROM local_cup_reassignment_receipts').get().n,1);
 return {additions,removals,legacy};
}
module.exports={baseline,harness,snapshot,raw,empty,addition,removal,legacyReassignment,seedAll};
if(require.main===module)(async()=>{const env=harness();await seedAll(env);env.unchangedOld();console.log('PASS actual v2 on-disk seeds: all addition/removal/legacy-reassignment phases and committed retirement receipts, synthetic profile and old-store sentinels.');})().catch(e=>{console.error(e);process.exitCode=1;});

