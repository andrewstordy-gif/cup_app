// Actual Home callback + real parser/classifier. No native reads/writes or DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default,load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..'),Ndef=require('react-native-nfc-manager/ndef-lib');
const modules=load(root,{'react-native-nfc-manager':{__esModule:true,default:{},Ndef,NfcTech:{}},'react-native':{Platform:{OS:'ios'}}});
const parser=modules('src/services/nfcServiceMinimal.js'),classifier=modules('src/services/nfcTagClassifier.js');
const ast=parse(fs.readFileSync(path.join(root,'src/navigation/AppNavigator.js'),'utf8'),{sourceType:'module',plugins:['jsx']});
function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v]){const hit=find(c,p);if(hit)return hit;}return null;}
const declaration=name=>find(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name).init;
const evaluate=(name,deps)=>new Function(...Object.keys(deps),'return ('+generate(declaration(name)).code+')')(...Object.values(deps));
const settings={r:40,a:96,w:240,c:70,x:3600,l:50,k:3},base=[{s:0},{t:235,m:0,b:80,u:'TELEMETRY_PRIVATE',v:'0.4.3'},settings,{}];
function read(values=base,uid='E001020304050607',change=()=>{}){
 const records=values.map(value=>({tnf:1,type:[84],payload:[2,101,110,...Buffer.from(typeof value==='string'?value:JSON.stringify(value))]}));change(records);
 return {tag:{id:uid,ndefMessage:records},recordCount:records.length,parsed:parser.parseNdefMessageMinimal(records)};
}
function home(result){
 const state={current:true,sleep:false,warnings:[],events:[],status:null,forbidden:[],readWait:null,observeWait:null,observed:false,observeCount:0,classified:0};
 const forbidden=name=>(..._args)=>{state.forbidden.push(name);throw Error('Unexpected side effect: '+name);};
 const deps={...classifier,SCAN_COOLDOWN_MS:0,lastScanAtRef:{current:0},localTastingRemovalRef:{current:false},scanInProgressRef:{current:false},nfcLaunchGuardRef:{current:false},warningVisibleRef:{current:false},sleepDialogVisibleRef:{current:false},isCupCompleteSessionDialogVisible:false,
  beginNfcAction:()=>1,isCurrentNfcAction:()=>state.current,finishCurrentNfcAction:()=>{},addFlowEvent:(_events,event)=>state.events.push(event),
  readNdefMinimal:async()=>{if(state.readWait)await state.readWait;return result;},
  observePendingCupReassignmentRead:async(_read,{isReadCurrent})=>{assert.equal(isReadCurrent(),state.current);return false;},
  observePendingDraftRemovalRead:async(_read,{isReadCurrent})=>{state.observeCount++;assert.equal(isReadCurrent(),state.current);if(state.observeWait)await state.observeWait;return state.observed;},
  classifyNfcTagReadResult:value=>{state.classified++;return classifier.classifyNfcTagReadResult(value);},
  setScanStatusMessage:value=>state.status=value,setSleepDialogVisible:value=>state.sleep=value,
  setHomeTemperatureC(){},setHomeTimeLabel(){},setHomeElapsedSeconds(){},setHomeBrewTimeSeconds(){},setHomeStateLabel(){},
  playNfcFailureFeedback:async()=>{},mapScanErrorMessage:error=>error.message,isTransientScanMessage:()=>false,logHomeError(){},showWarning:(...args)=>state.warnings.push(args),
  readAndWriteNdefMinimal:forbidden('write'),resolveActiveSampleFromCupMetadata:forbidden('import/activate'),findActiveSampleByCupUUID:forbidden('UID lookup'),activateSession:forbidden('activate'),setSelectedSessionId:forbidden('select session'),selectSavedAssessment:forbidden('open form'),goToCupping:forbidden('navigate'),
 };
 for(const name of ['resolveCupState','resolveElapsedSeconds','resolveBrewTimeSeconds','resolveTemperatureC','formatTime','getStateLabel','normalizeCupUuid','isNtagCupLike'])deps[name]=(...args)=>evaluate(name,deps)(...args);
 deps.scanCupForAssessment=evaluate('scanCupForAssessment',deps);
 return {state,deps,scan:()=>evaluate('handleScanCupFromHome',deps)()};
}
async function denied(result){const h=home(result);await h.scan();assert.equal(h.state.sleep,false);assert(h.state.warnings.length);assert.deepEqual(h.state.forbidden,[]);return h;}
async function main(){
 const valid=read();assert.equal(valid.parsed.text1.state,0);assert.equal(classifier.classifyNfcTagReadResult(valid).isCleared,true);
 const h=home(valid);await h.scan();assert.equal(h.state.sleep,true);assert.equal(h.deps.sleepDialogVisibleRef.current,true);assert.equal(h.state.status,'Cup is sleeping.');assert.deepEqual(h.state.warnings,[]);assert.deepEqual(h.state.forbidden,[]);assert.equal(h.state.observeCount,1);assert.equal(h.state.classified,1);
 assert(h.state.events.includes('STATE_SLEEPING'));assert(!JSON.stringify(h.state.events).includes('E001020304050607'));assert(!JSON.stringify(h.state.events).includes('TELEMETRY_PRIVATE'));
 for(const state of [1,2,3,4])await denied(read([{s:state},base[1],settings,{}]));
 await denied(read([{}],'04ABCD'));
 for(const values of [
  [{s:'0'},base[1],settings,{}],[{s:0,extra:1},base[1],settings,{}],
  [base[0],{...base[1],b:101},settings,{}],[base[0],{...base[1],v:'0.4.3-01'},settings,{}],
  [base[0],{...base[1],PRIVATE_COFFEE_UID:'secret'},settings,{}],
  [base[0],base[1],{...settings,k:2},{}],[base[0],base[1],{...settings,r:'40'},{}],
  [base[0],base[1],settings,{z:2}],[base[0],base[1],settings,'{"z":"AA","z":"BB"}'],
  [base[0],base[1],settings,'{'],[base[0],base[1],settings], [...base,{}],
 ])await denied(read(values));
 await denied(read(base,null));
 await denied(read(base,undefined,records=>records[2].type=[85]));
 await denied(read(base,undefined,records=>records[2].payload=[2,101,110,255]));
 const pending=home(read());pending.state.observed=true;await pending.scan();assert.equal(pending.state.sleep,false);assert.equal(pending.state.classified,0);assert.deepEqual(pending.state.forbidden,[]);assert.match(pending.state.status,/Removal is unfinished/);
 for(const stage of ['read','observe']){
  const stale=home(read());let release;stale.state[stage==='read'?'readWait':'observeWait']=new Promise(resolve=>release=resolve);const work=stale.scan();
  if(stage==='observe')await new Promise(resolve=>setImmediate(resolve));stale.state.current=false;release();await work;
  assert.equal(stale.state.sleep,false);assert.equal(stale.state.classified,0);assert.deepEqual(stale.state.forbidden,[]);assert.deepEqual(stale.state.warnings,[]);
 }
 // The assigned-code branch remains text-identical: only the cleared guard changed.
 const original=require('node:child_process').execFileSync('git',['show','ce8376e:src/navigation/AppNavigator.js'],{cwd:root,encoding:'utf8'});
 const oldGuard="if(tagClassification.isCleared)throw new Error('This cup has no sample assignment. Add it to a draft session first.');";
 const newGuard="if(tagClassification.isCleared&&!(tagClassification.type===NFC_TAG_TYPES.SMART_CUP&&recordCount===4&&resolveCupState(parsed)===0))throw new Error('This cup has no sample assignment. Add it to a draft session first.');";
 const reassignmentImport='  observePendingCupReassignmentRead,\n';
 const reassignmentHome="      if(await observePendingCupReassignmentRead(readResult,{isReadCurrent:()=>isCurrentNfcAction(actionToken)}))throw new Error('Cup reassignment is unfinished. Return to its draft session to continue.');\n      if(!isCurrentNfcAction(actionToken))return;\n";
 const reassignmentMenu="        if(await observePendingCupReassignmentRead(result,{isReadCurrent:()=>nfcActionTokenRef.current===removalReadToken}))throw new Error('reassignment:unfinished');\n";
 assert.equal(fs.readFileSync(path.join(root,'src/navigation/AppNavigator.js'),'utf8').replace(reassignmentImport,'').replace(reassignmentHome,'').replaceAll(reassignmentMenu,''),original.replace(oldGuard,newGuard));
 console.log('PASS Home unassigned OFF Smart choice: actual Home callback/parser/strict classifier, non-OFF/NTAG/malformed/state/settings/telemetry/UID/pending-removal/stale negatives; scan alone no writes/import/activation/navigation; assigned workflow byte-identical. Software only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
