// Real saved data/screen bindings/card JSX; native hosts/radio are mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default,{transformSync}=require('@babel/core');
const {fixture}=require('./helpers/sample-code-fixture'),load=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..'),S='nfzyy8y0pqizn6',file=path.join(root,'src/features/cupping/screens/CuppingSessionDetailsScreen.js');
if(process.argv.includes('--base')){
  const original=require('node:child_process').execFileSync('git',['show','6b5ed4b2ab017f6ea85afef56d9dedf27555cc00:src/features/cupping/screens/CuppingSessionDetailsScreen.js'],{cwd:root,encoding:'utf8'}),read=fs.readFileSync;
  fs.readFileSync=function(name,...args){return String(name)===file?original:read.call(this,name,...args);};
}
const harnessFile=path.join(__dirname,'sample-code-screen-check.js'),source=fs.readFileSync(harnessFile,'utf8'),mod=new Module(harnessFile,module);mod.filename=harnessFile;mod.paths=Module._nodeModulePaths(__dirname);
mod._compile(source.slice(0,source.indexOf('async function main(){'))+'\nmodule.exports={harness,value(h,name){const deps=h.dependencies();return new Function(...Object.keys(deps),`return (${generate(declaration(name)).code});`)(...Object.values(deps));}};',harnessFile);
const {harness,value}=mod.exports,identity=load(root)('src/features/cupping/screens/savedSessionIdentity.js'),forms=require('../src/features/forms/sessionFormRoute');
const ast=parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const item of Object.values(node))for(const child of Array.isArray(item)?item:[item]){const result=find(child,predicate);if(result)return result;}return null;}
const binding=find(ast,node=>node.type==='JSXOpeningElement'&&node.name.name==='CoffeeSampleCard');
function prop(h,sample,index,name){const expression=binding.attributes.find(attr=>attr.name?.name===name).value.expression,deps={...h.dependencies(),...identity,sample,index,showInProgressFooter:h.sessionStatusBadgeLabel==='In Progress',handleOpenEditSheet:sample=>h.run('handleOpenEditSheet',sample)};return new Function(...Object.keys(deps),`return (${generate(expression).code});`)(...Object.values(deps));}
async function view(env){
  const presentation=await env.repo.getLocalTastingPresentation(S,{purpose:'setup'}),access=await env.repo.getSessionSetupAccess(S),saved=presentation.session,h=harness(env,1,S),deps=h.dependencies;
  Object.assign(h,{sessionId:S,tastingPresentation:presentation,setupAccess:{sessionId:S,...access},sessionName:saved.sessionName,sessionType:saved.sessionType,sessionDate:saved.sessionDate,sessionMode:saved.cuppingMode,samples:saved.samples,sessionStatus:saved.status,samplesInSession:saved.samplesInSession,sampleStatusById:await env.repo.getSessionSampleFinalStatus(S),isSessionDirty:false,isSessionComplete:saved.status==='complete',
    sessionForm:{loadedSessionId:S,cuppingForm:saved.cuppingForm,formKey:saved.formKey,formVersion:saved.formVersion,formHash:saved.formHash,formLocked:saved.formLocked},savedOpenEvidence:null,isAddSheetVisible:false});
  h.savedSessionIdRef.current=S;h.dependencies=()=>({...deps(),...identity,useMemo:factory=>factory(),isSessionFormReady:forms.isSessionFormReady});
  for(const name of ['visibleIdentity','hideSavedIdentity','ownsSavedSetup','isSessionFormSupported','canEditSessionSetup','sessionStatusBadgeLabel'])h[name]=value(h,name);
  return h;
}
// Execute actual expanded Card with existing hidden identity rendering; leave
// score-row/defect leaves and native effects outside this presentation check.
const cardFile=path.join(root,'src/features/cupping/components/CoffeeSampleCard.js'),cardMod=new Module(cardFile,module);cardMod.filename=cardFile;cardMod.paths=Module._nodeModulePaths(path.dirname(cardFile));
const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[initial,()=>{}],useEffect:()=>{}},mocks={react,'react-native':{Pressable:'Pressable',View:'View',StyleSheet:{create:x=>x}},'@expo/vector-icons/AntDesign':'AntDesign',
  '../../../components/ui/TypographyAuditText':{TypographyAuditText:'Text'},'../../../components/ui/AppIcon':{AppIcon:'AppIcon'},'../../../components/ui/IconButton':{IconButton:'IconButton'},'../../../data/sessionRepository':{CUPPING_SCORE_FIELDS:[],getSampleFeedback:()=>{},getSampleDefects:()=>{},getSampleFlavourObservations:()=>{}},
  '../../style-guide/components/SampleCard':{EMPTY_SCORES:[],makeScores:x=>x},'../../style-guide/components/ScoreRow':{normalizeTotalScore:x=>x??null,ScoreRow:'ScoreRow'},'../constants/sessionDetails':load(root)('src/features/cupping/constants/sessionDetails.js'),'./DefectsSection':{BEAN_DEFECT_OPTIONS:[],ROAST_DEFECT_OPTIONS:[]},'./KeywordPillRow':{KeywordPillRow:'KeywordPillRow'}};
const nativeRequire=cardMod.require.bind(cardMod);cardMod.require=request=>Object.hasOwn(mocks,request)?mocks[request]:request.startsWith('.')?load(root)(path.relative(root,path.resolve(path.dirname(cardFile),request+'.js'))):nativeRequire(request);
cardMod._compile(transformSync(fs.readFileSync(cardFile,'utf8'),{filename:cardFile,babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code,cardFile);
function card(h,sample,index){const display=prop(h,sample,index,'sample'),onEditSample=prop(h,sample,index,'onEditSample');return {display,tree:cardMod.exports.CoffeeSampleCard({sample:display,index,defaultExpanded:true,onEditSample,canRemove:true}),onEditSample};}
function snapshot(env){return JSON.stringify(env.sqlite.prepare('SELECT * FROM samples ORDER BY rowid').all());}
async function save(h){h.setupContinuationRef={current:false};h.currentSetupInputKeyRef={current:''};const deps=h.dependencies;h.dependencies=()=>({...deps(),setIsSaving:()=>{},setupContinuationRef:h.setupContinuationRef,currentSetupInputKeyRef:h.currentSetupInputKeyRef,onSaveSuccess:()=>{}});await h.run('handleSave');}
async function main(){
  for(const sampleCode of [undefined,null,'a4','XYZ','']){const sample={sampleCode,sampleNumber:2,cuppingMode:'blind',coffeeNameOrigin:'SECRET',process:'5'};assert.equal(identity.projectSessionDetailsCard(sample,'Pending',0).coffeeNameOrigin,'Sample 2','invalid/missing code preserves shared safe fallback');}
  assert.equal(identity.savedSampleLabel({sampleCode:'IT'},0),'Sample IT','other shared surfaces keep existing label');
  for(const modes of [['blind','open'],['open','blind']]){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-card-')),env=fixture(path.join(dir,'creator.db')),draft=harness(env,1,S),payloads=[];
    for(let index=0;index<2;index++){draft.run('handleOpenAddSheet');draft.sheetCoffeeNameOrigin=`SECRET_COFFEE_${index}`;draft.sheetProcess='5';draft.sheetCuppingMode=modes[index];draft.tagId=`TAG${index}`;draft.physicalPayload=null;await draft.run('handleScanCup');payloads.push(draft.pendingAdditionRef.current.payload);await draft.run('handleScanToCheckCup');}
    let h=await view(env);assert.equal(h.sessionStatusBadgeLabel,'Draft');assert.equal(h.canEditSessionSetup,true);
    for(let index=0;index<2;index++)assert.strictEqual(prop(h,h.samples[index],index,'sample'),h.visibleIdentity.samples[index],'DRAFT exact existing card sample retained');
    // Invoke actual Save against unredacted formState and reload the real DB.
    await save(h);env.restart();h=await view(env);assert.equal(h.sessionStatusBadgeLabel,'Pending');assert.equal(h.canEditSessionSetup,true);assert.equal(h.hideSavedIdentity,false,'global preparation permission unchanged');
    for(let reload=0;reload<2;reload++){
      const before=snapshot(env),internal=JSON.stringify(h.samples);
      for(let index=0;index<2;index++){
        const sample=h.samples[index],output=card(h,sample,index),hidden=modes[index]==='blind';
        assert.equal(output.display.identityHidden,hidden,'actual Pending binding hides only Blind');assert.equal(output.display.coffeeNameOrigin,hidden?sample.sampleCode:sample.coffeeNameOrigin);assert.equal(output.display.process,hidden?null:sample.process);
        const rendered=JSON.stringify(output.tree);if(hidden){assert(!rendered.includes(sample.coffeeNameOrigin));assert(!rendered.includes('Yellow Honey'));assert(rendered.includes('Hidden during blind cupping'));assert(!rendered.includes(`Sample ${sample.sampleCode}`));assert(rendered.includes(`"${sample.sampleCode}"`));}else{assert(rendered.includes(sample.coffeeNameOrigin));assert(rendered.includes('Yellow Honey'));}
        // Actual Card's edit handler receives redacted props, but the screen's
        // closure must forward the original permitted setup row to the drawer.
        const edit=find(output.tree,node=>node.props?.accessibilityLabel===`Edit sample ${sample.sampleCode}`);assert(edit);edit.props.onPress({stopPropagation(){}});assert.equal(h.sheetCoffeeNameOrigin,sample.coffeeNameOrigin);assert.equal(h.sheetProcess,sample.process);
      }
      assert.equal(JSON.stringify(h.samples),internal);assert.equal(snapshot(env),before,'card render/edit must not persist placeholders');env.restart();h=await view(env);assert.equal(h.sessionStatusBadgeLabel,'Pending');
    }
    await save(h);const savedAgain=await env.repo.getOwnedSessionSetup(S);assert.deepEqual(savedAgain.samples.map(row=>[row.coffeeNameOrigin,row.process]),h.samples.map(row=>[row.coffeeNameOrigin,row.process]),'Save after hidden cards keeps raw identity');
    // A further actual write still uses real coffee metadata, never card labels.
    h.run('handleOpenAddSheet');h.sheetCoffeeNameOrigin='SECRET_THIRD';h.sheetProcess='5';h.sheetCuppingMode='blind';h.tagId='THIRD';h.physicalPayload=null;await h.run('handleScanCup');assert.equal(h.physicalPayload.n,'SECRET_THIRD');assert.equal(h.physicalPayload.p,5);h.run('handleCloseCheckSample');
    const participant=fixture(path.join(dir,'participant.db'));for(let index=0;index<2;index++)await participant.repo.resolveActiveSampleFromCupMetadata({cupUUID:`JOIN${index}`,metadata:payloads[index]});
    for(const target of [participant]){target.restart();let joined=await view(target);assert.equal(joined.sessionStatusBadgeLabel,'Pending');assert.equal(joined.canEditSessionSetup,false);for(let index=0;index<2;index++)assert.equal(card(joined,joined.samples[index],index).display.identityHidden,modes[index]==='blind');
      for(const sample of joined.samples)await target.save(S,sample.id,{...require('../src/features/cupping/data/cvaResponse').createCvaDraft(5),ratings:Object.fromEntries(Object.values(require('../src/features/cupping/data/cvaResponse').RATINGS).map(key=>[key,7]))});
      joined=await view(target);assert.equal(joined.sessionStatusBadgeLabel,'In Progress');for(let index=0;index<2;index++)assert.strictEqual(prop(joined,joined.samples[index],index,'sample'),joined.visibleIdentity.samples[index],'In Progress exact prior projection');
      await target.complete(S);joined=await view(target);assert.equal(joined.sessionStatusBadgeLabel,'Complete');for(let index=0;index<2;index++){assert.strictEqual(prop(joined,joined.samples[index],index,'sample'),joined.visibleIdentity.samples[index]);assert.equal(joined.samples[index].identityHidden,false);}
    }
    for(const payload of payloads){const row=env.sqlite.prepare('SELECT sample_metadata_json AS json FROM samples WHERE sample_code=?').get(payload.z);assert.deepEqual(JSON.parse(row.json),payload);}
  }
  console.log('PASS R1-108 actual SQLite + screen card binding/expanded JSX: Pending Blind redacted/Open visible both orders/roles, Draft/InProgress/Complete unchanged, raw edit/save/NFC data preserved, reload/back unscored; software only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
