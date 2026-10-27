// Real SQLite: acknowledgment is exact current authority, not merely a receipt.
const assert=require('node:assert/strict');
const {prepare,cmd,write,check,snapshot,D}=require('./direct-cup-reassignment-check');
async function append(env,form){
 const setup=await env.repo.getOwnedSessionSetup(D),candidate={id:'temporary',cupUUID:'DIFFERENTUID',cupNumber:2,cuppingForm:form,cuppingMode:form===2?'open':'blind',sampleNumber:2,coffeeNameOrigin:'Another sample',process:'1'};
 const p=await env.repo.stagePendingSampleAddition({sessionId:D,candidate,tagContext:{kind:'ntag'},saveInput:{...setup,sessionUUID:D,existingSessionId:D,samplesInSession:2,samples:[...setup.samples,candidate],intent:'setup'}});
 await env.repo.markPendingSampleAdditionWritten({sessionId:D,operationId:p.operationId});await env.repo.markPendingSampleAdditionVerified({sessionId:D,operationId:p.operationId,payload:p.payload,physicalUID:candidate.cupUUID,tagContext:p.tagContext});await env.repo.commitPendingSampleAddition({sessionId:D,operationId:p.operationId});
}
async function main(){for(const form of [1,2]){
 for(const attack of ['newMember','sameCountReplacement','missingOutcome','changedIssued']){
  const x=await prepare('ntag',form);await write(x);await check(x);const saved=await x.env.repo.commitDirectCupReassignment(cmd(x));
  if(attack==='newMember')await append(x.env,form);
  if(attack==='sameCountReplacement')x.env.sqlite.prepare('UPDATE samples SET id=? WHERE id=?').run(x.env.actorB,saved.sampleId);
  if(attack==='missingOutcome')x.env.sqlite.prepare('DELETE FROM sample_code_commit_outcomes WHERE operation_id=?').run(saved.attemptId);
  if(attack==='changedIssued')x.env.sqlite.prepare('UPDATE issued_sample_codes SET operation_id=? WHERE code=? AND session_id=?').run(x.env.actorB,saved.sampleCode,D);
  const before=snapshot(x.env);await assert.rejects(x.env.repo.commitDirectCupReassignment(cmd(x)));assert.equal(snapshot(x.env),before,attack+' replay is nonmutating');x.env.sqlite.close();
 }
 for(const attack of ['outcome','issued','actor']){
  const x=await prepare('ntag',form);await write(x);await check(x);
  x.env.afterCommit(()=>{if(attack==='outcome')x.env.sqlite.exec('DELETE FROM sample_code_commit_outcomes');if(attack==='issued')x.env.sqlite.exec('DELETE FROM issued_sample_codes');if(attack==='actor')x.env.actor(x.env.actorB);});
  await assert.rejects(x.env.repo.commitDirectCupReassignment(cmd(x)));
  assert.equal(x.env.sqlite.prepare('SELECT COUNT(*) n FROM samples').get().n,1,'postcommit denial does not claim rollback');assert.equal(x.env.sqlite.prepare('SELECT COUNT(*) n FROM local_direct_reassignment_receipts').get().n,1);x.env.sqlite.close();
 }
 }
 console.log('PASS direct exact replay/final acknowledgment both forms: new member/same-count replacement, missing outcome/issued proof and changed actor deny; committed history preserved after acknowledgment loss.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
