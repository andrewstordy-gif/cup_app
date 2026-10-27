const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'cup-reassignment-eligibility-check.js'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m._compile(fs.readFileSync(file,'utf8').split('(async()=>{')[0]+'\nmodule.exports={fixture,creator,score,complete,empty};',file);
const {fixture,creator,score,complete,empty}=m.exports,{reading,cases}=require('./opaque-cup-reassignment-check'),{snapshot,D,U}=require('./direct-cup-reassignment-check');
const current=()=>true,drawerDraft=form=>({coffeeNameOrigin:'New current',process:'2',cupNumber:2,cuppingMode:form===2?'open':'blind'});
async function main(){for(const form of [1,2]){
 const e=fixture(),p=await creator(e,form);await empty(e,D,form);const read=reading(false,cases[0],'04AA'),inspect=()=>e.repo.inspectDirectCupReassignment({destinationId:D,readResult:read,isCurrent:current});
 const active=snapshot(e);await assert.rejects(inspect(),/active/);assert.equal(snapshot(e),active,'opaque on-cup does not bypass known UID active source');
 await score(e,p.candidate.id,form);await complete(e);const completeSnapshot=snapshot(e),prompt=await inspect();assert.match(prompt.message,/can't check/);assert.equal(snapshot(e),completeSnapshot);
 const pending=await e.repo.stageDirectCupReassignment({observation:prompt.observation,consentVersion:1,drawerDraft:drawerDraft(form),isCurrent:current}),command={destinationId:D,operationId:pending.operationId,expectedRevision:pending.revision,isCurrent:current};
 await e.repo.cancelDirectCupReassignment(command);e.sqlite.prepare('UPDATE samples SET sample_metadata_json=? WHERE session_id=?').run('{"old":"corrupt local"}',U);const corrupt=snapshot(e);await assert.rejects(inspect());assert.equal(snapshot(e),corrupt,'physical opaque exception never relaxes LOCAL corrupt metadata');e.sqlite.close();
 const own=fixture();await empty(own,D,form);const setup=await own.repo.getOwnedSessionSetup(D),candidate={id:'temporary',cupUUID:'04AA',cupNumber:2,cuppingForm:form,cuppingMode:form===2?'open':'blind',sampleNumber:1,coffeeNameOrigin:'Own member',process:'1'};
 const add=await own.repo.stagePendingSampleAddition({sessionId:D,candidate,tagContext:{kind:'ntag'},saveInput:{...setup,sessionUUID:D,existingSessionId:D,samples:[candidate],intent:'setup'}});
 const unfinished=snapshot(own);await assert.rejects(own.repo.inspectDirectCupReassignment({destinationId:D,readResult:read,isCurrent:current}));assert.equal(snapshot(own),unfinished,'ordinary pending addition remains exclusive');
 await own.repo.markPendingSampleAdditionWritten({sessionId:D,operationId:add.operationId});await own.repo.markPendingSampleAdditionVerified({sessionId:D,operationId:add.operationId,payload:add.payload,physicalUID:'04AA',tagContext:add.tagContext});await own.repo.commitPendingSampleAddition({sessionId:D,operationId:add.operationId});
 const committed=snapshot(own);await assert.rejects(own.repo.inspectDirectCupReassignment({destinationId:D,readResult:read,isCurrent:current}),/already/);assert.equal(snapshot(own),committed,'opaque destination duplicate stays blocked');
 const removal=await own.repo.stageDraftSampleRemoval({sessionId:D,readResult:require('./direct-cup-reassignment-check').raw('04AA',[add.payload])});const removalSnapshot=snapshot(own);await assert.rejects(own.repo.inspectDirectCupReassignment({destinationId:D,readResult:read,isCurrent:current}));assert.equal(snapshot(own),removalSnapshot);assert(removal.operationId);own.sqlite.close();
 }
 console.log('PASS opaque physical old does not bypass BOTH-form known active UID, destination duplicate, pending Add/removal; completed source requires unknown warning, corrupt LOCAL metadata denies unchanged.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
