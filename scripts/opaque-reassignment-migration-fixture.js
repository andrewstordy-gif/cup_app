// R151 author fixture: genuine b946032 v3 runtime via repo-contained git sources.
// Reuses the committed R147 synthetic harness; no /tmp source dependency.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const file=path.join(__dirname,'direct-reassignment-migration-fixture.js'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);
const source=fs.readFileSync(file,'utf8').replace("ref='bd29397'","ref='b946032'").replace("get().user_version,6)","get().user_version,7)");
m._compile(source,file);const old=m.exports,{settings,meta,raw}=require('./direct-cup-reassignment-check');
const read=(uid,kind,metadata,state=3)=>raw(uid,kind==='smart'?[{s:state},{},settings,metadata]:[metadata]);
async function seedAll(env){const previous=await old.seedAll(env),direct=[];let serial=0;
 for(const kind of ['ntag','smart'])for(const form of [1,2])for(const phase of ['consented','write_check','write_verified','committed']){
  const destinationId='dir'+String(++serial).padStart(11,'0'),uid=(kind==='smart'?'E0':'04')+destinationId.toUpperCase(),metadata=meta(form),drawerDraft={coffeeNameOrigin:'Retained v1 direct',process:'2',cupNumber:2,cuppingMode:form===2?'open':'blind'},isCurrent=()=>true;
  await old.empty(env,destinationId,form);const prompt=await env.repo.inspectDirectCupReassignment({destinationId,readResult:read(uid,kind,metadata),isCurrent});let pending=await env.repo.stageDirectCupReassignment({observation:prompt.observation,consentVersion:1,drawerDraft,isCurrent}),frozen;
  const cmd=()=>({destinationId,operationId:pending.operationId,expectedRevision:pending.revision,isCurrent});
  if(phase!=='consented'){const write=await env.repo.prepareDirectCupReassignmentWrite({...cmd(),readResult:read(uid,kind,metadata),drawerDraft});pending=write.pending;frozen=write.frozen;await write.beforeWrite();}
  if(['write_verified','committed'].includes(phase))pending=(await env.repo.inspectDirectCupReassignmentWrite({...cmd(),readResult:read(uid,kind,frozen.payload,1)})).pending;
  if(phase==='committed')await env.repo.commitDirectCupReassignment(cmd());direct.push({destinationId,uid,metadata,drawerDraft,pending,frozen,phase,kind,form});
 }
 assert.equal(env.db.prepare('PRAGMA user_version').get().user_version,7);return {previous,direct};
}
module.exports={...old,seedAll,read};
