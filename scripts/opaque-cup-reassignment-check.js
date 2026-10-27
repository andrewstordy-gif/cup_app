// R151 author regression: actual Details callbacks, parser/native mock and SQLite.
const assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/sample-code-fixture'),load=require('./helpers/load-project-module');
const {ui}=require('./direct-cup-reassignment-screen-check'),{meta,settings,D,current,snapshot,codes,raw}=require('./direct-cup-reassignment-check');
const root=path.resolve(__dirname,'..'),codec=require('../src/data/directCupReassignmentCodec'),envelope=require('../src/data/directCupOldEnvelope');
const Ndef=require('react-native-nfc-manager/ndef-lib');
const cases=[JSON.stringify({...meta(1),z:1}),'{"coffeeName":"OLD PRIVATE","sampleNumber":4}', '{"u":"older","z":', 'plain old coffee',JSON.stringify({...meta(1),unknown:'PRIVATE'}),JSON.stringify({...meta(1),f:99})];
const record=text=>({tnf:1,type:[84],id:[],payload:[2,101,110,...Buffer.from(text)]});
function reading(smart,text,uid='04AABB',state=3,custom=settings){return {tag:{id:uid,ndefMessage:(smart?[JSON.stringify({s:state}),'{}',JSON.stringify(custom),text]:[text]).map(record)},recordCount:smart?4:1};}
let tag,writes=[],starts=0,capacity=4096,status=2,rejectRead=false;
const manager={isSupported:async()=>true,start:async()=>{},requestTechnology:async()=>{starts++;if(rejectRead)throw Error('cancelled');},getTag:async()=>tag,cancelTechnologyRequest:async()=>{},ndefHandler:{getNdefStatus:async()=>({capacity,status}),writeNdefMessage:async bytes=>{writes.push([...bytes]);tag={...tag,ndefMessage:Ndef.decodeMessage(bytes).map(r=>({...r,type:[84]}))};}}};
const native=load(root,{'react-native-nfc-manager':{__esModule:true,default:manager,Ndef,NfcTech:{Ndef:'Ndef'}},'react-native':{Platform:{OS:'ios'}}})('src/services/nfcServiceMinimal.js');
const classifier=load(root)('src/services/nfcTagClassifier.js');
async function prepared(smart,text,form=1){const env=fixture();await env.create(D,form,form===2?'open':null,false);const original=reading(smart,text),prompt=await env.repo.inspectDirectCupReassignment({destinationId:D,readResult:original,isCurrent:current}),drawerDraft={coffeeNameOrigin:'NEW CURRENT',process:'1',cupNumber:2,cuppingMode:form===2?'open':'blind'};assert(prompt.message.includes("can't check"));let pending=await env.repo.stageDirectCupReassignment({observation:prompt.observation,consentVersion:1,drawerDraft,isCurrent:current});const x={env,original,pending,drawerDraft};x.cmd=()=>({destinationId:D,operationId:x.pending.operationId,expectedRevision:x.pending.revision,isCurrent:current});return x;}
async function main(){
 for(const form of [1,2])for(const smart of [false,true])for(const text of cases){
  const {env,h}=ui(form,smart);h.platformOS='ios';tag=reading(smart,text).tag;writes=[];starts=0;capacity=4096;status=2;rejectRead=false;
  const deps=h.dependencies;h.dependencies=()=>({...deps(),NFC_TAG_TYPES:classifier.NFC_TAG_TYPES,classifyNfcTagReadResult:classifier.classifyNfcTagReadResult,readAndWriteNdefMinimal:native.readAndWriteNdefMinimal,readNdefMinimal:native.readNdefMinimal});
  await h.run('handleScanCup');assert(h.cupReassignmentPrompt,'opaque old reaches actual warning BEFORE strict classifier');assert.equal(starts,1);assert.equal(writes.length,0);assert.equal(codes(env),0);assert(!JSON.stringify(h.cupReassignmentPrompt).includes('PRIVATE'));
  await h.run('handleConfirmCupReassignment',h.cupReassignmentPrompt);assert.equal(starts,1);assert.equal(h.cupReassignment.phase,'consented');
  await h.run('handleCupReassignmentModalDismiss',h.cupReassignmentLaunch);assert.equal(starts,2);assert.equal(writes.length,1);assert.equal(codes(env),1);assert.equal(h.samples.length,0);assert.equal(h.cupReassignment.phase,'write_check');
  const newPayload=JSON.parse(Ndef.text.decodePayload(tag.ndefMessage.at(-1).payload));assert.equal(newPayload.n,'Test coffee');assert.equal(typeof newPayload.z,'string');require('../src/data/sampleCodeProfile').validateMetadata(newPayload);
  if(smart){assert.deepEqual(JSON.parse(Ndef.text.decodePayload(tag.ndefMessage[0].payload)),{s:1});assert.deepEqual(JSON.parse(Ndef.text.decodePayload(tag.ndefMessage[1].payload)),{});assert.deepEqual(JSON.parse(Ndef.text.decodePayload(tag.ndefMessage[2].payload)),settings);}
  rejectRead=true;for(let n=0;n<2;n++){await h.run('handleDirectCupReassignmentAction',h.cupReassignmentDialog);assert.equal(h.cupReassignment.phase,'write_check');assert.equal(codes(env),1);assert.equal(writes.length,1);assert.equal(h.samples.length,0);}rejectRead=false;
  await h.run('handleDirectCupReassignmentAction',h.cupReassignmentDialog);assert.equal(h.samples.length,1);assert.equal(writes.length,1);assert.equal(h.sessionStatus,'new');
  const receipt=JSON.parse(env.sqlite.prepare('SELECT receipt_json FROM local_direct_reassignment_receipts').get().receipt_json);assert.equal(receipt.version,2);assert.equal(receipt.oldSession,null);assert.equal(receipt.oldCode,null);assert.equal(receipt.oldMetadataHash,null);assert.equal(receipt.oldAssignmentHash,envelope.read(reading(smart,text)).assignment.payloadHash);assert(!JSON.stringify(receipt).includes('PRIVATE'));
  env.sqlite.close();
 }
 console.log('PASS opaque old actual Details→warning→native-dismiss→fresh ordinary bytes→separate Check→atomic member bothforms/families; numeric/partial/unknown/plain old never imported, read retry same code, minimal raw retirement.');
 for(const smart of [false,true]){
  const x=await prepared(smart,cases[0]),before=snapshot(x.env);
  for(const changed of [reading(smart,cases[0]+' '),reading(smart,cases[0],'OTHER'),...(smart?[reading(true,cases[0],'04AABB',4),reading(true,cases[0],'04AABB',3,{...settings,k:1})]:[])]){await assert.rejects(x.env.repo.prepareDirectCupReassignmentWrite({...x.cmd(),readResult:changed,drawerDraft:x.drawerDraft}));assert.equal(snapshot(x.env),before);}
  const operation=await x.env.repo.prepareDirectCupReassignmentWrite({...x.cmd(),readResult:x.original,drawerDraft:x.drawerDraft});x.pending=operation.pending;await operation.beforeWrite();assert.equal(codes(x.env),1);
  const newRead=reading(smart,JSON.stringify(operation.frozen.payload),'04AABB',1);x.pending=(await x.env.repo.inspectDirectCupReassignmentWrite({...x.cmd(),readResult:newRead})).pending;
  x.env.failAt('INSERT INTO samples');await assert.rejects(x.env.repo.commitDirectCupReassignment(x.cmd()));x.env.failAt(null);x.env.reload();x.pending=await x.env.repo.getDirectCupReassignment({destinationId:D});assert.equal(x.pending.phase,'write_verified');
  await x.env.repo.observePendingCupReassignmentRead(x.original,{isReadCurrent:current});x.pending=await x.env.repo.getDirectCupReassignment({destinationId:D});assert.equal(x.pending.phase,'write_check');await assert.rejects(x.env.repo.commitDirectCupReassignment(x.cmd()));
  x.pending=(await x.env.repo.inspectDirectCupReassignmentWrite({...x.cmd(),readResult:newRead})).pending;await x.env.repo.commitDirectCupReassignment(x.cmd());
  const other='other000000001';await x.env.create(other,1,null,false);await assert.rejects(x.env.repo.inspectDirectCupReassignment({destinationId:other,readResult:x.original,isCurrent:current}),/retired/);x.env.sqlite.close();
 }
 console.log('PASS exact old bytes/state/settings/UID fences, rollback/reload save-only, observer revocation, opaque old replay retirement, no code on check.');
 for(const text of ['', '   ','{}',' { } '])for(const smart of [false,true])assert.equal(envelope.blank(envelope.read(reading(smart,text))),true);
 const good=reading(true,cases[0]);for(const mutate of [r=>r.tag.id=null,r=>r.recordCount=3,r=>r.tag.ndefMessage[0]=record('{"s":9}'),r=>r.tag.ndefMessage[1]=record('{"b":101}'),r=>r.tag.ndefMessage[2]=record('{"r":1}'),r=>r.tag.ndefMessage[3].tnf=2,r=>r.tag.ndefMessage[3].payload=[2,101,110,255],r=>r.tag.ndefMessage[3].payload=[2,102,114,123,125],r=>r.tag.ndefMessage[3].payload=Array(262145).fill(32)]){const r=JSON.parse(JSON.stringify(good));mutate(r);assert.throws(()=>envelope.read(r));}
 assert.throws(()=>codec.original({...envelope.read(good),assignment:{...envelope.read(good).assignment,typedMetadata:meta(1)}}),'typed evidence cannot be injected');
 assert.equal(envelope.read(reading(false,JSON.stringify({...meta(1),n:'\ud800'}))).assignment.typedMetadata,null,'old escaped invalid semantic text is opaque, not valid new evidence');
 // Existing import/removal remain strict even though explicit replacement accepts old.
 for(const text of cases){const r=reading(false,text);r.parsed=native.parseNdefMessageMinimal(r.tag.ndefMessage);let classified=null;try{classified=classifier.classifyNfcTagReadResult(r);}catch{}assert(!classified?.metadataPayload,'ordinary classifier never imports opaque old metadata');assert.throws(()=>require('../src/data/draftSampleRemovalCodec').readRemovalTag(r));}
 console.log('PASS protected envelope/encoding/size negatives, recomputed typed evidence, emptyText/{} ordinary classification and unchanged strict import/removal.');
 await blanks();
}
async function blanks(){
 for(const smart of [false,true])for(const text of ['', '   ','{}',' { } ']){
  const {env,h}=ui(1,smart);tag=reading(smart,text).tag;writes=[];starts=0;rejectRead=false;const deps=h.dependencies;h.dependencies=()=>({...deps(),NFC_TAG_TYPES:classifier.NFC_TAG_TYPES,classifyNfcTagReadResult:classifier.classifyNfcTagReadResult,readAndWriteNdefMinimal:native.readAndWriteNdefMinimal,readNdefMinimal:native.readNdefMinimal});
  await h.run('handleScanCup');assert.equal(h.cupReassignmentPrompt,null);assert.equal(h.cupReassignment,null);assert.equal(writes.length,1,`blank Text ordinary Add: smart=${smart} text=${JSON.stringify(text)} status=${h.scanStatusMessage}`);assert.equal(h.samples.length,0);assert(h.pendingAdditionRef.current);env.sqlite.close();
 }
}
module.exports={reading,prepared,cases,native,record,blanks};if(require.main===module){const log=console.log;console.log=()=>{};(process.argv.includes('--blank-only')?blanks():main()).then(()=>{console.log=log;log('PASS R151 opaque old actual UI/native/SQLite bothforms/families, exact bytes/recovery/retirement and strict protected/new contract negatives (software only).');}).catch(e=>{console.log=log;console.error(e);process.exitCode=1;});}
