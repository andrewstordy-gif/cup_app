// Actual Details JSX/styles, no app mount, persistence or NFC calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default,{transformSync}=require('@babel/core');
const root=path.resolve(__dirname,'..'),file='src/features/cupping/screens/CuppingSessionDetailsScreen.js';
const current=parse(fs.readFileSync(path.join(root,file),'utf8'),{sourceType:'module',plugins:['jsx']}),baseline=parse(execFileSync('git',['show','1f4b278:'+file],{cwd:root,encoding:'utf8'}),{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const value of Object.values(node))for(const child of Array.isArray(value)?value:[value]){const hit=find(child,predicate);if(hit)return hit;}return null;}
const control=tree=>find(tree,node=>node.type==='ConditionalExpression'&&node.consequent?.type==='JSXElement'&&node.consequent.openingElement.attributes.some(attr=>attr.name?.name==='accessibilityLabel'&&attr.value?.value==='Scan cup to remove sample'));
const next=control(current),prior=control(baseline);assert(next&&prior);
const attr=(node,name)=>node.openingElement.attributes.find(value=>value.name?.name===name)?.value;
for(const name of ['disabled','onPress','accessibilityLabel'])assert.equal(generate(attr(next.consequent,name)).code,generate(attr(prior.consequent,name)).code,`${name} unchanged`);
assert.equal(generate(next.test).code,generate(prior.test).code,'visibility unchanged');assert.equal(next.consequent.openingElement.name.name,'Pressable');
const styleDeclaration=tree=>find(tree,node=>node.type==='VariableDeclarator'&&node.id?.name==='styles');
const allowedStyles=new Set(['removeSampleAction','removeSampleActionPressed','removeSampleActionText','removeSampleActionTextDisabled']);
const styleNode=styleDeclaration(current),load=require('./helpers/load-project-module')(root),colors=load('src/theme/colors.js').colors,spacing=load('src/theme/spacing.js').spacing,typography=load('src/theme/typography.js').typography;
const styles=new Function('StyleSheet','colors','spacing','typography',`return (${generate(styleNode.init).code});`)({create:value=>value},colors,spacing,typography);
const expression=transformSync(generate(next).code,{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx']}).code.replace(/;$/,'');
const flatten=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));let calls=0;
const defaults={sessionId:'saved',sessionStatus:'new',sessionStatusBadgeLabel:'Draft',ownsSavedSetup:true,isSessionFormSupported:true,samples:[{id:'sample'}],draftRemoval:null,isRemovingDraftSample:false,isSaving:false,isLockingSession:false,isNfcWriting:false,pendingAdditionRef:{current:null},pendingAdditionBusyRef:{current:null},handleDraftRemoval:()=>calls++,styles,Text:'Text',Pressable:'Pressable',React:{createElement:(type,props,...children)=>({type,props:{...props,children}})}};
function render(changes={}){const values={...defaults,...changes};return new Function(...Object.keys(values),`return (${expression});`)(...Object.values(values));}
const tree=render(),text=tree.props.children[0];assert.equal(tree.type,'Pressable');assert.equal(tree.props.accessibilityRole,'button');assert.equal(tree.props.disabled,false);assert.deepEqual(tree.props.accessibilityState,{disabled:false});assert.equal(text.props.children[0],'Remove sample');
const normal=flatten(tree.props.style({pressed:false})),pressed=flatten(tree.props.style({pressed:true})),label=flatten(text.props.style);
assert(normal.minHeight>=44);assert.equal(normal.alignItems,'center');assert.equal(normal.justifyContent,'center');assert.equal(normal.marginTop,spacing.md);assert(pressed.opacity<1&&pressed.opacity>=0.8);
for(const key of ['backgroundColor','borderColor','borderWidth','borderRadius'])assert.equal(normal[key],undefined,'no filled/bordered pill');
assert.equal(label.color,colors.action);assert.equal(label.fontSize,typography.text_secondary_body.fontSize);assert.equal(label.fontWeight,typography.text_secondary_body.fontWeight);assert.equal(label.textAlign,'center');tree.props.onPress();assert.equal(calls,1,'same direct callback');
for(const changes of [{isRemovingDraftSample:true},{isSaving:true},{isLockingSession:true},{isNfcWriting:true},{pendingAdditionRef:{current:{}}},{pendingAdditionBusyRef:{current:{}}}]){const disabled=render(changes);assert.equal(disabled.props.disabled,true);assert.equal(disabled.props.accessibilityState.disabled,true);assert.equal(flatten(disabled.props.children[0].props.style).color,colors.muted);}
for(const changes of [{sessionId:null},{sessionStatus:'pending'},{sessionStatusBadgeLabel:'Pending'},{ownsSavedSetup:false},{isSessionFormSupported:false},{samples:[]}])assert.equal(render(changes),null,'original negative visibility preserved');
assert(render({samples:[],draftRemoval:{phase:'writing'}}),'unfinished removal retains existing resume action');
// Normalize only the declared JSX/style change, then compare the complete AST:
// handlers, copy, imports, layout and every surrounding control stay unchanged.
next.consequent=prior.consequent;styleNode.init.arguments[0].properties=styleNode.init.arguments[0].properties.filter(value=>!allowedStyles.has(value.key?.name));
assert.equal(generate(current).code,generate(baseline).code,'only removal control appearance and its styles changed');
console.log('PASS actual Remove sample JSX: original callback/visibility/busy rules, centered blue token text, pressed/muted/44pt accessibility states, no pill, all surrounding source unchanged.');
