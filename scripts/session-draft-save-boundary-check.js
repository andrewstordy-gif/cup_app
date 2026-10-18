// Executes the actual post-NFC assignment persistence statements with real
// SQLite. No native scan/write or physical verification is claimed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const { fixture } = require('./helpers/session-state-fixture');
const badgeSource=fs.readFileSync(path.join(__dirname,'../src/features/cupping/constants/sessionDetails.js'),'utf8');
const getSessionStatusBadgeLabel = new Function(`${badgeSource.match(/export function hasLocalSessionCompletion[\s\S]*?\n}/)[0].replace('export ','')} ${badgeSource.match(/export function getSessionStatusBadgeLabel[\s\S]*?\n}/)[0].replace('export ','')} return getSessionStatusBadgeLabel;`)();
const source = fs.readFileSync(path.join(__dirname,'../src/features/cupping/screens/CuppingSessionDetailsScreen.js'),'utf8');
const ast = parse(source,{sourceType:'module',plugins:['jsx']});
function find(node,predicate) {
  if (!node || typeof node!=='object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value)?value:[value]) {
    const match=find(child,predicate); if (match) return match;
  }
  return null;
}
async function persistActualAdd(env,id,samples,form=1,status='new') {
  const handler=find(ast,node=>node.type==='VariableDeclarator'&&node.id?.name==='handleScanCup').init;
  const block=handler.body.body.find(node=>node.type==='TryStatement').block.body;
  const start=block.findIndex(node=>node.type==='VariableDeclaration'&&node.declarations[0].id?.name==='saved');
  assert.ok(start>=0);
  const body=block.slice(start,start+3).map(node=>generate(node).code).join('\n');
  const dependencies={sessionUUID:id,sessionForm:{cuppingForm:form},sessionMode:form===2?'open':null,
    existingSessionId:id,savedSessionIdRef:{current:id},sessionDisplayId:'',sessionDate:'18 Oct 2026',
    effectiveSessionName:'Creator draft',effectiveSessionType:'Training Session',samplesInSession:samples.length,
    sessionStatus:status,nextSamples:samples,setupEpoch:1,setupEpochRef:{current:1},
    savedSetupSnapshotRef:{current:null},savedSetupInputKeyRef:{current:null},
    formState:{},setupWarningSnapshot:()=>({}),setSessionStatus:value=>{dependencies.ack=value;},
    saveSessionWithSamples:env.repo.saveSessionWithSamples};
  await new Function(...Object.keys(dependencies),`return(async()=>{${body}})();`)(...Object.values(dependencies));
  assert.equal(dependencies.ack,'new','actual Add applies durable Draft acknowledgement');
}
async function main() {
  for (const form of [1,2]) {
  const env=fixture(); const id=`already-saved-empty-${form}`;
  await env.create(id,form,form===2?'open':'blind',false);
  const sample={id:'added-sample',cupUUID:'PHYSICAL-IDENTITY',cupNumber:1,cuppingForm:form,cuppingMode:form===2?'open':'blind',
    sampleNumber:1,coffeeNameOrigin:'Secret coffee',process:'1'};
  await persistActualAdd(env,id,[sample],form);
  assert.equal((await env.repo.getSessionById(id)).status,'new','automatic Add persistence must remain DRAFT before explicit Session Save');
  const presentation=await env.repo.getLocalTastingPresentation(id,{purpose:'setup'});
  assert.equal(presentation.tasting.canManageSetup,true);
  assert.equal(presentation.tasting.canComplete,false);
  assert.equal(getSessionStatusBadgeLabel({sessionId:id,tastingPresentation:presentation,samples:[sample]}),'Draft');
  await assert.rejects(env.repo.activateSession(id),/Save this session/);
  await assert.rejects(form===1?env.repo.getCvaResponse(id,sample.id):env.repo.getLegacyResponse(id,sample.id),/Save this session/);
  env.reload();
  assert.equal((await env.repo.getSessionById(id)).status,'new','reload cannot promote setup');
  const save=()=>env.repo.saveSessionWithSamples({sessionUUID:id,existingSessionId:id,sessionName:'Creator draft',sessionType:'Training Session',cuppingForm:form,cuppingMode:form===2?'open':null,samples:[sample]});
  assert.equal((await save()).status,'pending');
  assert.equal((await env.repo.getSessionById(id)).status,'pending');
  await (form===1?env.repo.getCvaResponse(id,sample.id):env.repo.getLegacyResponse(id,sample.id));
  await persistActualAdd(env,id,[sample],form,'pending');
  assert.equal((await env.repo.getSessionById(id)).status,'new','Pending setup change returns to Draft');
  env.failAt('INSERT INTO sessions');
  await assert.rejects(save(),/injected/); env.failAt(null);
  assert.equal((await env.repo.getSessionById(id)).status,'new','failed explicit Save cannot mark ready');
  assert.equal((await save()).status,'pending');
  assert.equal(getSessionStatusBadgeLabel({status:'pending',sessionId:id,tastingPresentation:presentation,samples:[sample]}),'Pending','explicit Save acknowledgement supersedes stale Draft presentation');
  }
  console.log('Draft until explicit Session Save PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
