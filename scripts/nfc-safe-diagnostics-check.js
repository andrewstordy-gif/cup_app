// Actual service, native mock, captured whole console stream and base comparison.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),util=require('node:util');
const load=require('./helpers/load-project-module'),Ndef=require('react-native-nfc-manager/ndef-lib');
const root=path.resolve(__dirname,'..'),file=path.join(root,'src/services/nfcServiceMinimal.js');
const base=require('node:child_process').execFileSync('git',['show','8f1ac700616253eca0ba7274a5063076103f0c98:src/services/nfcServiceMinimal.js'],{cwd:root,encoding:'utf8'});
const secret='PRIVATE_COFFEE_UID_SENTINEL',metadata={n:secret,p:1,y:5,i:1,z:'Q9',m:'b',f:1,e:secret,t:4,d:261022,u:'nfzyy8y0pqizn6'};
const record={tnf:1,type:[84],id:[],payload:[2,101,110,...Buffer.from(JSON.stringify(metadata))]};
const error=stack=>Object.assign(new Error(secret),{stack:`${stack} ${secret}`});
function service(source,manager,platform){
  const read=fs.readFileSync;fs.readFileSync=function(name,...args){return String(name)===file?source+'\nexport const diagnosticTest={logNfcEvent,summarizeTag};':read.call(this,name,...args);};
  try{return load(root,{'react-native-nfc-manager':{__esModule:true,default:manager,Ndef,NfcTech:{Ndef:'Ndef'}},'react-native':{Platform:{OS:platform}}})('src/services/nfcServiceMinimal.js');}finally{fs.readFileSync=read;}
}
async function run(source,scenario){
  const trace=[],logs=[];let index=0,writes=0;
  const manager={isSupported:async()=>{trace.push(['supported']);return true;},start:async()=>trace.push(['start']),requestTechnology:async(...args)=>{trace.push(['request',...args]);if(scenario.requestError)throw error('UserCancel');},getTag:async()=>{trace.push(['getTag']);if(scenario.readError)throw error('NativeReadError');return scenario.tags[Math.min(index++,scenario.tags.length-1)];},
    cancelTechnologyRequest:async()=>trace.push(['cancel']),invalidateSessionIOS:async()=>trace.push(['invalidate']),ndefHandler:{getNdefStatus:async()=>{trace.push(['status']);return {capacity:4096,status:2};},writeNdefMessage:async bytes=>{trace.push(['write',[...bytes]]);if(scenario.writeError||scenario.retry&&writes++===0)throw error(scenario.retry?'TagUpdateFailure':'NativeWriteError');}}};
  const nfc=service(source,manager,scenario.platform||'android'),originalLog=console.log,originalTimer=global.setTimeout;
  console.log=(...args)=>{logs.push(args);if(scenario.brokenConsole)throw error('ConsoleFailure');};global.setTimeout=(callback,ms)=>{trace.push(['delay',ms]);callback();return 0;};
  let outcome;
  try{const result=scenario.write?await nfc.readAndWriteNdefMinimal(async read=>{trace.push(['builder',read]);return {metadataOnly:true,records:{text4:metadata},beforeWrite:async()=>trace.push(['beforeWrite'])};}):await nfc.readNdefMinimal();outcome={result};}
  catch(failure){outcome={error:{message:failure.message,stack:failure.stack?.includes('ConsoleFailure')?'console':undefined}};}
  finally{console.log=originalLog;global.setTimeout=originalTimer;}
  return {trace,logs,outcome};
}
async function main(){
  const current=fs.readFileSync(file,'utf8');
  const cases=[
    {tags:[null],expected:[false,false,false,'unknown',0]},
    {tags:[{}],expected:[true,false,false,'unknown',0]},
    {tags:[{ndefMessage:[record],type:'iso15693'}],expected:[true,false,true,'iso15693',1]},
    {tags:[{id:secret,ndefMessage:[record],type:'mifare',[secret]:secret}],expected:[true,true,true,'mifare',1]},
    {tags:[{id:secret,ndefMessage:[record],tech:'mifare',type:secret}],platform:'ios',expected:[true,true,true,'mifare',1]},
    {tags:[{id:'---',ndefMessage:[],tech:'iso15693'}],expected:[true,false,true,'iso15693',0]},
    {tags:[{id:[1,2,3],ndefMessage:[],techTypes:['android.nfc.tech.Ndef',secret]}],expected:[true,true,true,'android.nfc.tech.Ndef',0]},
    {tags:[{identifier:secret,ndefMessage:[record],type:secret}],expected:[true,true,true,'unknown',1]},
    {tags:[{serialNumber:[7,8],ndefMessage:[],type:secret}],expected:[true,true,true,'unknown',0]},
    {tags:[{id:[],ndefMessage:[],type:{[secret]:secret}}],expected:[true,false,true,'unknown',0]},
    {tags:[{id:secret},{id:secret,ndefMessage:[record]}],reads:2},
    {tags:[{id:secret}],reads:4},
    {tags:[null],platform:'ios'},
    {tags:[{}],readError:true},{tags:[{}],requestError:true},
    {tags:[{id:secret,ndefMessage:[record]}],write:true},
    {tags:[{id:secret,ndefMessage:[record],tech:'iso15693'}],write:true,platform:'ios'},
    {tags:[{id:secret,ndefMessage:[record]}],write:true,retry:true},
    {tags:[{id:secret,ndefMessage:[record]}],write:true,writeError:true},
  ];
  for(const scenario of cases){
    const result=await run(current,scenario),original=await run(base,scenario);
    assert.deepEqual(result.trace,original.trace,'diagnostics cannot alter native calls, delays, callback inputs or exact write bytes');assert.deepEqual(result.outcome,original.outcome,'returns/errors unchanged');
    const stream=util.inspect(result.logs,{depth:null});for(const forbidden of [secret,'Q9','nfzyy8y0pqizn6'])assert(!stream.includes(forbidden),'entire console argument stream must omit private fields');
    if(scenario.expected){const event=result.logs.find(args=>String(args[0]).includes('tag summary'))[1];assert.deepEqual([event.tagPresent,event.identifierPresent,event.ndefArrayPresent,event.tagType,event.recordCount],scenario.expected);}
    if(scenario.reads)assert.equal(result.trace.filter(event=>event[0]==='getTag').length,scenario.reads);
    if(!scenario.write)assert.equal(result.trace.filter(event=>event[0]==='write').length,0);
  }
  // Test the diagnostic boundary directly, including hostile payloads/counts;
  // no arbitrary property names, objects or non-finite/coerced counts escape.
  const nfc=service(current,{},'android'),captured=[],original=console.log;console.log=(...args)=>captured.push(args);
  try{
    nfc.diagnosticTest.logNfcEvent('read tag summary',{tagPresent:secret,identifierPresent:{secret},ndefArrayPresent:true,tagType:secret,recordCount:Infinity,byteLength:-1,[secret]:secret});
    nfc.diagnosticTest.logNfcEvent(secret,{tagPresent:true,tagType:'mifare',recordCount:1.5});
    for(const recordCount of [secret,NaN,-1,65536,Number.MAX_SAFE_INTEGER])nfc.diagnosticTest.logNfcEvent('read result',{recordCount,text4:metadata});
    const malformed={get id(){throw error('Getter');},get type(){throw error('Getter');},ndefMessage:[]};assert.equal(nfc.diagnosticTest.summarizeTag(malformed).identifierPresent,false);
    const bytes=[7];Object.defineProperty(bytes,'0',{get(){throw error('Getter');}});bytes.every=()=>{throw error('Method');};const techs=['mifare'];Object.defineProperty(techs,'0',{get(){throw error('Getter');}});techs.map=()=>{throw error('Method');};assert.equal(nfc.diagnosticTest.summarizeTag({id:bytes,techTypes:techs}).identifierPresent,false);assert.equal(nfc.diagnosticTest.summarizeTag({id:bytes,techTypes:techs}).tagType,'unknown');
  }finally{console.log=original;}
  assert.deepEqual(captured[0][1],{ndefArrayPresent:true,tagType:'unknown'});assert.deepEqual(captured[1][1],{});assert(captured.slice(2).every(args=>Object.keys(args[1]).length===0));assert(!util.inspect(captured,{depth:null}).includes(secret));
  const working=await run(current,{tags:[{id:secret,ndefMessage:[]}],brokenConsole:true});assert(working.outcome.result,'console failure does not interrupt scanner');assert.equal(working.trace.filter(event=>event[0]==='getTag').length,1);
  console.log('PASS R1-107 actual-service safe diagnostic console stream: missing/present/array/alias IDs, closed native types, bounded counts, errors/retries, baseline-identical calls/delays/results/bytes, logging failure isolation. Software only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
