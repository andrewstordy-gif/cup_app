// Actual saved/reopened data, screen expressions and compact title rendering.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default,{transformSync}=require('@babel/core'),load=require('./helpers/load-project-module');
const {fixture}=require('./helpers/sample-code-fixture'),root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6';
const file='src/features/cupping/screens/CuppingSessionDetailsScreen.js',source=process.argv.includes('--base')?require('node:child_process').execFileSync('git',['show',`fd0e83916fa81bfbb8dc18432d8c2c79687fca0e:${file}`],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,file),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function all(node,predicate){if(!node||typeof node!=='object')return[];return [...(predicate(node)?[node]:[]),...Object.values(node).flatMap(value=>(Array.isArray(value)?value:[value]).flatMap(child=>all(child,predicate)))];}
const evaluate=(node,deps)=>new Function(...Object.keys(deps),`return (${generate(node).code});`)(...Object.values(deps));
const helper=path.join(__dirname,'pending-blind-card-check.js'),helperSource=fs.readFileSync(helper,'utf8'),mod=new Module(helper,module);mod.filename=helper;mod.paths=Module._nodeModulePaths(__dirname);
// Only this test's binding AST is overlaid; do not activate the reused card
// harness's unrelated historical --base reproduction.
const argv=process.argv;process.argv=argv.filter(value=>value!=='--base');try{mod._compile(helperSource.slice(0,helperSource.indexOf('\nasync function main(){'))+'\nmodule.exports={view,harness,card,save};',helper);}finally{process.argv=argv;}const {view,harness,card,save}=mod.exports;
const titleBinding=all(ast,node=>node.type==='JSXOpeningElement'&&node.name?.name==='SessionTitleSummary')[0];
const metadata=all(ast,node=>node.type==='JSXElement'&&node.openingElement.name?.name==='Text'&&node.openingElement.attributes.some(attr=>attr.name?.name==='accessibilityLabel'&&generate(attr).code.includes('Session code')))[0];
const loadedCode=all(ast,node=>node.type==='CallExpression'&&node.callee?.name==='setSessionDisplayId'&&generate(node.arguments[0]).code.includes('loaded.sessionDisplayId'))[0].arguments[0];
const constants=load(root)('src/features/cupping/constants/sessionDetails.js');
const titleFile=path.join(root,'src/features/cupping/components/SessionTitleSummary.js'),titleMod=new Module(titleFile,module);titleMod.filename=titleFile;titleMod.paths=Module._nodeModulePaths(path.dirname(titleFile));
const mocks={react:{createElement:(type,props,...children)=>({type,props:{...props,children}})},'react-native':{View:'View',StyleSheet:{create:x=>x,hairlineWidth:1}},'../../../components/ui/TypographyAuditText':{TypographyAuditText:'Text'},'../../style-guide/components/SessionStatusBadge':{SessionStatusBadge:'SessionStatusBadge'}};
const nativeRequire=titleMod.require.bind(titleMod);titleMod.require=request=>Object.hasOwn(mocks,request)?mocks[request]:request.startsWith('.')?load(root)(path.relative(root,path.resolve(path.dirname(titleFile),request+'.js'))):nativeRequire(request);
titleMod._compile(transformSync(fs.readFileSync(titleFile,'utf8'),{filename:titleFile,babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code,titleFile);const {SessionTitleSummary}=titleMod.exports;
function snapshot(env){return JSON.stringify(env.sqlite.prepare('SELECT * FROM samples ORDER BY rowid').all());}
async function check(env,expectedStatus){
  env.restart();const before=snapshot(env),h=await view(env),raw=await env.repo.getSessionById(S),permission=await env.repo.getSessionSetupAccess(S);assert.equal(h.sessionStatusBadgeLabel,expectedStatus);
  h.sessionDisplayId=evaluate(loadedCode,{loaded:raw,loadedUuid:raw.sessionUUID,...constants});assert.equal(h.sessionDisplayId,raw.sessionDisplayId,'real stored display ID, not a fabricated reference');
  const deps={...h.dependencies(),...constants,isSessionFormLoading:false};
  const code=evaluate(titleBinding.attributes.find(attr=>attr.name?.name==='sessionCode').value.expression,deps);assert.equal(code,raw.sessionDisplayId,'public code must not disappear with Blind coffee identity');
  const metadataLabel=evaluate(metadata.openingElement.attributes.find(attr=>attr.name?.name==='accessibilityLabel').value.expression,deps),metadataText=evaluate(metadata.children.find(child=>child.type==='JSXExpressionContainer').expression,deps);assert.equal(metadataLabel,`Session code ${raw.sessionDisplayId}`);assert.equal(metadataText,raw.sessionDisplayId);
  if(expectedStatus!=='Draft'){
    const props=Object.fromEntries(titleBinding.attributes.map(attr=>[attr.name.name,evaluate(attr.value.expression,deps)])),tree=SessionTitleSummary(props);assert(tree);assert(JSON.stringify(tree).includes(raw.sessionDisplayId));assert(!JSON.stringify(tree).includes('Session code unavailable'));
  }
  for(let index=0;index<h.samples.length;index++){const sample=h.samples[index],display=card(h,sample,index).display,hidden=sample.cuppingMode==='blind'&&expectedStatus!=='Complete'&&expectedStatus!=='Draft';assert.equal(display.identityHidden,hidden,'coffee privacy unaffected by public reference');if(hidden){assert.notEqual(display.coffeeNameOrigin,raw.samples[index].coffeeNameOrigin);assert.equal(display.process,null);}}
  assert.deepEqual(await env.repo.getSessionSetupAccess(S),permission);assert.equal(snapshot(env),before,'title display does not mutate metadata/scores');return h;
}
async function main(){
  for(const modes of [['blind'],['open'],['blind','open'],['open','blind']]){
    const env=fixture(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cup-public-code-')),'test.db')),h=harness(env,1,S);
    for(let index=0;index<modes.length;index++){h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin=`SECRET_COFFEE_${index}`;h.sheetProcess='5';h.sheetCuppingMode=modes[index];h.tagId=`TAG${index}`;h.physicalPayload=null;await h.run('handleScanCup');await h.run('handleScanToCheckCup');}
    const draft=await check(env,'Draft');await save(draft);await check(env,'Pending');await check(env,'Pending');
    const raw=await env.repo.getSessionById(S);for(const sample of raw.samples)await env.save(S,sample.id,{...require('../src/features/cupping/data/cvaResponse').createCvaDraft(5),ratings:Object.fromEntries(Object.values(require('../src/features/cupping/data/cvaResponse').RATINGS).map(key=>[key,7]))});
    await check(env,'In Progress');await env.complete(S);await check(env,'Complete');
  }
  // Existing loading/fallback expression remains unchanged, not a new code generator.
  assert.equal(evaluate(loadedCode,{loaded:{},loadedUuid:S,...constants}),constants.formatSessionDisplayId(S));
  console.log('PASS R1-110 real SQLite reopen + actual screen/title binding/render: public session code in Draft/Pending/InProgress/Complete Blind/Open/mixed, accessible metadata, protected coffee masking and state/permissions unchanged.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
