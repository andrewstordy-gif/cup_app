// Actual repository, navigation/wrapper/header bindings and shared header JSX.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default,{transformSync}=require('@babel/core');
const {fixture}=require('./helpers/sample-code-fixture'),root=path.resolve(__dirname,'..');
const files=['src/features/cupping/screens/CanonicalCvaScreen.js','src/features/forms/legacy/LegacyCuppingScreen.js'];
function read(file){return process.argv.includes('--base')&&files.includes(file)?require('node:child_process').execFileSync('git',['show',`26398e10515143f210756da08a61c3876da464f3:${file}`],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,file),'utf8');}
const ast=file=>parse(read(file),{sourceType:'module',plugins:['jsx']});
function all(node,predicate){if(!node||typeof node!=='object')return[];return [...(predicate(node)?[node]:[]),...Object.values(node).flatMap(value=>(Array.isArray(value)?value:[value]).flatMap(child=>all(child,predicate)))];}
const nav=ast('src/navigation/AppNavigator.js'),decl=name=>all(nav,node=>node.type==='VariableDeclarator'&&node.id?.name===name)[0].init;
function evaluate(node,deps){return new Function(...Object.keys(deps),`return (${generate(node).code});`)(...Object.values(deps));}
const headerTest=path.join(__dirname,'assessment-header-check.js'),hmod=new Module(headerTest,module);hmod.filename=headerTest;hmod.paths=Module._nodeModulePaths(__dirname);const headerSource=fs.readFileSync(headerTest,'utf8');hmod._compile(headerSource.slice(0,headerSource.indexOf('const { AssessmentHeader,'))+'\nmodule.exports=mod.exports;',headerTest);const {AssessmentHeader}=hmod.exports;
const react={createElement:(type,props,...children)=>({type,props:{...props,children}})};
function wrapper(props,session){
  const wrapperNode=all(ast('src/features/cupping/screens/CuppingScreen.js'),node=>node.type==='FunctionDeclaration'&&node.id?.name==='CuppingScreen')[0];
  const js=transformSync(`const actualWrapper = ${generate(wrapperNode).code};`,{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx']}).code;
  const contract=require('../src/features/forms/contract');
  return new Function('React','useState','useEffect','resolvePinnedForm','PROFILE','CanonicalCvaScreen','PrototypeCuppingScreen',`${js};return actualWrapper;`)(react,()=>[{session},()=>{}],()=>{},contract.resolvePinnedForm,contract.PROFILE,'CanonicalCvaScreen','PrototypeCuppingScreen')(props);
}
function bindings(file,name,props){
  const tree=ast(file),fn=all(tree,node=>node.type==='FunctionDeclaration'&&node.id?.name===name)[0],pattern=generate(fn.params[0]).code;
  const headers=all(fn,node=>node.type==='JSXOpeningElement'&&node.name?.name==='AssessmentHeader');assert.equal(headers.length,2,'exercise loading and loaded header bindings');
  return headers.map(header=>{
    const entries=header.attributes.map(attr=>`${JSON.stringify(attr.name.name)}:${generate(attr.value.expression).code}`).join(',');
    // The actual component destructuring is included: a dropped prop cannot be
    // smuggled into this test by supplying an already-correct header fixture.
    return new Function('props',`const ${pattern}=props;const scale=0.7,goBack=props.onBackPress;return ({${entries}});`)(props);
  });
}
function assertHeader(props,expected,back){const rendered=AssessmentHeader(props);assert.equal(rendered.props.titleContent.props.children[0],expected,'actual tasting header shows exact code');assert.equal(rendered.props.titleContent.props.accessibilityLabel,`Sample ${expected}`);assert.equal(rendered.props.onBackPress,back);assert.equal(rendered.props.rightContent.props.accessibilityLabel,'Measured temperature 21 °C');}
async function main(){
  for(const form of [1,2])for(const mode of form===1?['blind','open']:['open'])for(const code of ['IT','00','07','99']){
    const env=fixture(),metadata={n:'SECRET COFFEE',p:5,y:5,i:1,z:code,m:mode==='blind'?'b':'o',f:form,e:'Fictional session',t:4,d:261022,u:'nfzyy8y0pqizn6'};
    const scanned=await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:'TAG',metadata}),session=await env.repo.getSessionById(scanned.sessionId),sample=session.samples[0],before=JSON.stringify(session),back=()=>{};
    const project=evaluate(decl('projectAssessmentContextForSavedSession'),{getLocalTastingPresentation:env.repo.getLocalTastingPresentation,UNSUPPORTED_MESSAGE:'Unsupported'});
    const build=evaluate(decl('buildContextFromSessionSample'),{selectedCupContext:null,sampleRuntimeById:{},looksLikeSmartCupUuid:()=>false,NFC_TAG_TYPES:{NTAG_CUP:'ntag_cup'}});
    for(const context of [build(sample,0,1,{sessionId:session.id}),{...scanned,sampleId:scanned.sampleId,cupIndex:0}]){
      const projected=await project(context);assert.equal(projected.sampleCode,code);assert.equal(projected.cuppingMode,mode);assert.equal(projected.coffeeNameOrigin,mode==='blind'?`Sample ${code}`:metadata.n);
      const routeBinding=all(nav,node=>node.type==='JSXOpeningElement'&&node.name?.name===(form===1?'CuppingScreen':'LegacyCuppingScreen'))[0];
      const codeBinding=routeBinding.attributes.find(attr=>attr.name?.name==='sampleCode').value.expression;
      const screenProps={...projected,sampleCode:evaluate(codeBinding,{selectedCupContext:projected}),onBackPress:back,cupStatus:{temp:21}};
      if(form===1){const route=wrapper(screenProps,session);assert.equal(route.type,'CanonicalCvaScreen','actual active form routes to canonical, not prototype');assert.equal(route.props.sampleCode,code);for(const header of bindings(files[0],'CanonicalCvaScreen',route.props))assertHeader(header,code,back);}
      else for(const header of bindings(files[1],'LegacyCuppingScreen',screenProps))assertHeader(header,code,back);
    }
    assert.equal(JSON.stringify(await env.repo.getSessionById(session.id)),before,'header/route reads do not mutate sample/scoring data');
  }
  for(const file of files){const name=file===files[0]?'CanonicalCvaScreen':'LegacyCuppingScreen';for(const header of bindings(file,name,{sampleNumber:3,cupIndex:0,cupStatus:{temp:21},onBackPress:null}))assertHeader(header,3,null);}
  console.log('PASS R1-109 actual saved/scan repository contexts -> canonical CVA/Legacy loading+loaded header bindings/render: IT/00/07/99, Blind/Open, numeric fallback, unchanged temperature/back/metadata; no radio.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
