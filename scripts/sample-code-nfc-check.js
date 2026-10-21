const assert=require('node:assert/strict'),path=require('node:path');
const load=require('./helpers/load-project-module');
const Ndef=require('react-native-nfc-manager/ndef-lib');
const root=path.resolve(__dirname,'..');
const metadata={n:'Café 🍒 — Coffee',p:1,y:5,i:1,z:'00',m:'b',f:1,e:'Test',t:4,d:261021,u:'nfzyy8y0pqizn6'};
let tag={id:'04ABCD',ndefMessage:[]},capacity=4096,status=2,writes=[],retry=0;
const manager={isSupported:async()=>true,start:async()=>{},requestTechnology:async()=>{},getTag:async()=>tag,cancelTechnologyRequest:async()=>{},ndefHandler:{getNdefStatus:async()=>({capacity,status}),writeNdefMessage:async bytes=>{writes.push([...bytes]);if(retry-->0){const error=new Error('Transport failure');error.stack='TagUpdateFailure';throw error;}}}};
const nfc=load(root,{'react-native-nfc-manager':{__esModule:true,default:manager,Ndef,NfcTech:{Ndef:'Ndef'}},'react-native':{Platform:{OS:'android'}}})('src/services/nfcServiceMinimal.js');
const classifier=load(root)('src/services/nfcTagClassifier.js');
async function main(){
  for(const kind of ['ntag','smart']){
    const settings={r:40,a:96,w:240,c:70,x:3600,l:50,k:3};
    const records=kind==='ntag'?{text4:metadata}:{text1:{s:1},text2:{},text3:settings,text4:metadata};
    const perform=()=>nfc.readAndWriteNdefMinimal(async()=>({metadataOnly:kind==='ntag',records,beforeWrite:async()=>{}}));
    capacity=4096;status=2;writes=[];await perform();assert.equal(writes.length,1);
    const decoded=Ndef.decodeMessage(writes[0]);assert.equal(decoded.length,kind==='ntag'?1:4);
    const nativeRecords=decoded.map(record=>({...record,type:[84]}));
    assert.deepEqual(nativeRecords.at(-1).payload.slice(3),require('../src/data/sampleCodeProfile').wireProof(metadata).wireMetadataBytes,'durable metadata bytes equal actual emitted bytes');
    const actualRead=nfc.parseNdefMessageMinimal(nativeRecords);
    assert.deepEqual(classifier.classifyNfcTagReadResult({recordCount:decoded.length,tag:{id:'04ABCD',ndefMessage:nativeRecords},parsed:actualRead}).metadataPayload,metadata,'actual service preserves supplementary UTF-8');
    const observed=JSON.parse(Ndef.text.decodePayload(decoded.at(-1).payload));assert.equal(observed.z,'00');assert.equal(observed.u,metadata.u);assert.equal(observed.y,5);
    if(kind==='smart'){assert.deepEqual(JSON.parse(Ndef.text.decodePayload(decoded[1].payload)),{});assert.deepEqual(JSON.parse(Ndef.text.decodePayload(decoded[2].payload)),settings);}
    const exact=writes[0].length;capacity=exact;writes=[];await perform();assert.equal(writes.length,1);
    capacity=exact-1;writes=[];await assert.rejects(perform(),/capacity/);assert.equal(writes.length,0);
    capacity=4096;status=3;await assert.rejects(perform(),/writable/);assert.equal(writes.length,0);
    status=2;retry=1;await perform();assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1],'internal transport retry freezes bytes/code');
    writes=[];await assert.rejects(nfc.readAndWriteNdefMinimal(async()=>({metadataOnly:kind==='ntag',records,beforeWrite:async()=>{throw new Error('stale context');}})),/stale context/);assert.equal(writes.length,0,'context rechecked immediately before dispatch');
  }
  const record=raw=>({...Ndef.decodeMessage(Ndef.encodeMessage([Ndef.record(Ndef.TNF_WELL_KNOWN,Ndef.RTD_TEXT,[],[2,101,110,...require('../src/data/sampleCodeProfile').encodeUtf8(raw)])]))[0],type:[84]});
  for(const raw of [JSON.stringify({...metadata,z:2}),JSON.stringify({...metadata,z:'a4'}),JSON.stringify({...metadata,u:undefined}),'{"n":"Coffee","z":"A4"}',JSON.stringify({...metadata,coffeeName:'alias'}),'{"n":',JSON.stringify(metadata).replace('"z":"00"','"z":"00","z":"A4"')]){
    const parsed=nfc.parseNdefMessageMinimal([record(raw)]);
    assert.throws(()=>classifier.classifyNfcTagReadResult({recordCount:1,tag:{id:'04ABCD'},parsed}),undefined,raw);
  }
  for(const code of require('../src/data/sampleCodeProfile').POOL){const parsed=nfc.parseNdefMessageMinimal([record(JSON.stringify({...metadata,z:code}))]);assert.equal(classifier.classifyNfcTagReadResult({recordCount:1,tag:{id:'04ABCD'},parsed}).metadataPayload.z,code);}
  console.log('PASS R1-103 actual NFC serializer/dispatcher + native adapter: 1,296 classifier codes, string 00/u/y, NTAG1/Smart4, NDEF2{}, settings/k preserved, exact capacity/readOnly failure beforewrite, identical retry bytes, malformed/numeric/duplicate/alias rejection. No hardware.');
}
const originalLog=console.log;console.log=()=>{};main().then(()=>{console.log=originalLog;originalLog('PASS R1-103 native-adapter checks (software only).');}).catch(error=>{console.log=originalLog;console.error(error);process.exitCode=1;});
