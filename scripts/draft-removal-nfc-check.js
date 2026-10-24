const assert=require('node:assert/strict'),path=require('node:path');
const load=require('./helpers/load-project-module'),Ndef=require('react-native-nfc-manager/ndef-lib');
const codec=require('../src/data/draftSampleRemovalCodec');
const root=path.resolve(__dirname,'..'),metadata={n:'Fictional',p:1,y:5,i:3,z:'A4',m:'b',f:1,e:'Test',t:4,d:261024,u:'nfzyy8y0pqizn6'},settings={r:40,a:96,w:240,c:70,x:3600,l:50,k:3};
let tag,capacity=4096,status=2,writes=[],failWrite=false,calls=0;
const manager={isSupported:async()=>true,start:async()=>{},requestTechnology:async()=>{},getTag:async()=>tag,cancelTechnologyRequest:async()=>{},
 ndefHandler:{getNdefStatus:async()=>({capacity,status}),writeNdefMessage:async bytes=>{writes.push([...bytes]);if(failWrite)throw Error('TagUpdateFailure PRIVATE');}}};
const nfc=load(root,{'react-native-nfc-manager':{__esModule:true,default:manager,Ndef,NfcTech:{Ndef:'Ndef'}},'react-native':{Platform:{OS:'android'}}})('src/services/nfcServiceMinimal.js');
const classifier=load(root)('src/services/nfcTagClassifier.js');
const record=raw=>({tnf:1,type:[84],id:[],payload:[2,101,110,...Buffer.from(typeof raw==='string'?raw:JSON.stringify(raw))]});
function reading(values,uid='04ABCD'){tag={id:uid,ndefMessage:values.map(record)};return {tag,recordCount:values.length};}
async function main(){
 for(const kind of ['ntag','smart']){
  const original=kind==='ntag'?[metadata]:[{s:2},{t:270,m:2,b:99,u:'live',v:'0.4.3'},settings,metadata];
  const captured=codec.freezeClear(codec.readRemovalTag(reading(original))),frozen=JSON.stringify(captured);
  const perform=()=>nfc.readAndClearNdefMinimal(async()=>({frozen:captured,beforeWrite:async()=>{calls++;}}));
  writes=[];calls=0;capacity=4096;status=2;failWrite=false;await perform();assert.equal(writes.length,1);assert.equal(calls,1);assert.deepEqual(writes[0],captured.bytes);assert.equal(JSON.stringify(captured),frozen);
  if(kind==='ntag')assert.deepEqual(writes[0],[209,1,5,84,2,101,110,123,125]);
  const decoded=Ndef.decodeMessage(writes[0]).map(r=>({...r,type:[84]}));assert.equal(decoded.length,kind==='ntag'?1:4);
  tag={id:'04ABCD',ndefMessage:decoded};const clear={tag,recordCount:decoded.length};assert.equal(codec.compareRemovalRead(captured,codec.readRemovalTag(clear)),'cleared');assert.equal(classifier.classifyNfcTagReadResult(clear).isCleared,true);
  if(kind==='smart'){
   assert.deepEqual(JSON.parse(Ndef.text.decodePayload(decoded[0].payload)),{s:2});assert.deepEqual(JSON.parse(Ndef.text.decodePayload(decoded[1].payload)),{});assert.deepEqual(JSON.parse(Ndef.text.decodePayload(decoded[2].payload)),settings);
   assert.equal(codec.compareRemovalRead(captured,codec.readRemovalTag(reading([{s:4},{t:290,m:9,b:88,u:'live',v:'0.4.3-alpha.1+build.7'},settings,{}]))),'cleared');
   assert.equal(codec.compareRemovalRead(captured,codec.readRemovalTag(reading([{s:4},{},settings,metadata]))),'mismatch','retry never rewinds evolved state');
  }
  reading(original);writes=[];calls=0;status=3;let prepared=0;await assert.rejects(nfc.readAndClearNdefMinimal(async()=>{prepared++;return {frozen:captured,beforeWrite:async()=>{}};}),/unfinished/);assert.equal(prepared,0);assert.equal(writes.length,0);
  status=2;capacity=captured.bytes.length-1;await assert.rejects(perform());assert.equal(calls,0);capacity=4096;
  await assert.rejects(nfc.readAndClearNdefMinimal(async()=>({frozen:captured})));assert.equal(writes.length,0);
  await assert.rejects(nfc.readAndClearNdefMinimal(async()=>({frozen:captured,beforeWrite:async()=>{throw Error('stale');}})));assert.equal(writes.length,0);
  failWrite=true;await assert.rejects(perform(),/unfinished/);assert.equal(writes.length,1,'uncertain dispatch is never automatically retried');failWrite=false;
 }
 for(const version of ['0.4.3-a..b','0.4.3-01','0.4.3+','01.4.3','0.4.3\n'])assert.throws(()=>codec.readRemovalTag(reading([{s:1},{v:version},settings,{}])));
 for(const bad of [{v:'bad'},{t:'270'},{unknown:1}])assert.throws(()=>classifier.classifyNfcTagReadResult(reading([{s:1},bad,settings,{}])),'malformed clear candidate never falls through to Add/UID recovery');
 for(const bad of ['{"s":1,"s":1}','{"s":"1"}','{"s":1,"alias":1}'])assert.throws(()=>codec.readRemovalTag(reading([bad,{},settings,{}])));
 for(const bad of ['{"u":"a","u":"b"}','{"t":1.5}','{"m":-1}','{"b":101}','{"alias":1}','{"t":{"nested":1}}'])assert.throws(()=>codec.readRemovalTag(reading([{s:1},bad,settings,{}])));
 assert.equal(codec.isClearedRead(reading([])),false);assert.equal(codec.isClearedRead(reading([{} ,{}])),false);
 const whitespace=reading([' { } ']);assert.equal(codec.isClearedRead(whitespace),true);
 console.log('PASS removal actual native dispatcher + strict codec: exact NTAG/Smart bytes, preserved state/settings, live telemetry verification, capacity/status/stale guard, no uncertain auto retry, cleared classifier and malformed/duplicate/version denial. Software only.');
}
const log=console.log;console.log=()=>{};main().then(()=>{console.log=log;log('PASS draft removal native/codec checks (software only).');}).catch(error=>{console.log=log;console.error(error);process.exitCode=1;});
