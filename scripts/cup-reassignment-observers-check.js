// Actual screen/navigation read callbacks + synthetic SQLite. No hardware/data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {parse}=require('@babel/parser'),traverse=require('@babel/traverse').default,generate=require('@babel/generator').default;
const {prepare,begin,check,read,D}=require('./cup-reassignment-check');
const root=path.resolve(__dirname,'..');
function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const v of Object.values(n))for(const c of Array.isArray(v)?v:[v]){const r=find(c,p);if(r)return r;}return null;}
function callback(file,name,overrides){
 const ast=parse(fs.readFileSync(path.join(root,file),'utf8'),{sourceType:'module',plugins:['jsx']}),expression=find(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name).init;
 const code=generate(expression).code,isolated=parse('const callback='+code),free=new Set();
 traverse(isolated,{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name)&&!Object.hasOwn(global,p.node.name))free.add(p.node.name);}});
 const dependencies=Object.fromEntries([...free].map(name=>[name,()=>{}]));Object.assign(dependencies,overrides);
 return new Function(...Object.keys(dependencies),'return ('+code+')')(...Object.values(dependencies));
}
async function observedCallback(file,name){
 const x=await prepare(),{env}=x;await begin(x);await check(x);const result={...read('ntag'),parsed:{text4:{}}},writes=[];
 const forbidden=()=>assert.fail('contradictory pending read must be blocked before data use/write/classification');
 const ref={current:1};
 const overrides={...env.repo,readEpochRef:{current:0},nfcActionTokenRef:ref,HOME_WRITE_HANDOFF_MS:0,delay:async()=>{},
  readNdefMinimal:async()=>result,readAndWriteNdefMinimal:async build=>{const command=await build(result);writes.push(command);},
  validateFields:()=>({}),fields:{},lastReadCupState:0,settingsPayload:{},setFields:forbidden,setDraft:forbidden,
  buildFieldsFromParsed:forbidden,buildDraftFromParsed:forbidden,playNfcFailureFeedback:async()=>{},triggerFailureFeedback:async()=>{},
  logAppError:()=>{},logHomeError:()=>{},scanInProgressRef:{current:false},BREWING_STATE:2};
 await callback(file,name,overrides)();assert.equal(writes.length,0,name+' no write');
 assert.equal((await env.repo.getCupReassignment({destinationId:D})).phase,'clear_check',name+' durably revokes proof before reporting error');env.sqlite.close();
}
async function main(){
 for(const [file,name]of [
  ['src/navigation/AppNavigator.js','handleResetCupToOffFromMenu'],['src/navigation/AppNavigator.js','handleSwitchCupToBrewingFromMenu'],
  ['src/features/cup-settings/screens/CupSettingsScreen.js','handleReadSettings'],['src/features/cup-settings/screens/CupSettingsScreen.js','handleWriteSettings'],
  ['src/features/nfc/screens/NfcServiceTestScreen.js','handleRead'],
 ])await observedCallback(file,name);
 const helper=path.join(root,'scripts/creator-scan-activation-check.js'),mod=new Module(helper,module),source=fs.readFileSync(helper,'utf8');mod.filename=helper;mod.paths=Module._nodeModulePaths(path.dirname(helper));mod._compile(source.slice(0,source.indexOf('\nasync function main(){'))+'\nmodule.exports={navigation};',helper);
 const x=await prepare(),{env}=x;await begin(x);await check(x);const h=mod.exports.navigation(env);
 h.deps.readNdefMinimal=async()=>({...read('ntag'),parsed:{text4:{}}});h.deps.classifyNfcTagReadResult=()=>assert.fail('observer precedes classification');
 await h.scan({});assert.equal((await env.repo.getCupReassignment({destinationId:D})).phase,'clear_check');assert.equal(h.state.selected,null);assert.equal(h.state.route,null);env.sqlite.close();
 console.log('PASS actual Home/reset/brewing/Settings read+write/diagnostic read callbacks durably revoke contradictory pending proof before use/write/import; no automatic verification. Existing diagnostic direct writes remain explicitly outside read-observation scope.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
