const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {parse}=require('@babel/parser');
const {component,render}=require('./runtime.cjs');
const root=path.resolve(__dirname,'../..');
function elements(node,result=[]) {
  if(!node || typeof node!=='object')return result;
  if(node.type)result.push(node);
  for(const child of [node.props?.children].flat(Infinity))elements(child,result);
  return result;
}
for(const status of ['pending','mismatch','unknown',undefined])for(const loading of [false,true]) {
  const onScanToCheck=()=>{},onRewrite=()=>{},onClose=()=>{};
  const props={status,loading,onScanToCheck,onRewrite,onClose,sampleNumber:'PRIVATE IDENTIFIER'};
  const nodes=elements(component(props));
  const action=nodes.find(n=>n.type?.name==='full_page_button');
  const close=nodes.find(n=>n.type?.name==='CloseButton');
  assert(action && close);assert.equal(close.props.onPress,onClose);
  assert.equal(action.props.onPress,status==='mismatch'?onRewrite:onScanToCheck);
  assert.equal(action.props.loading,loading);assert.equal(action.props.disabled,loading);
  const html=render(props);
  assert(!html.includes('PRIVATE IDENTIFIER'));assert(!html.includes('Sample A4'));
  assert(html.includes(status==='mismatch'?'Re-write Sample':'Check Cup'));
  assert(html.includes(status==='mismatch'?'Verification failed. Re-write the same cup, then check again.':'Scan the same cup again to verify its details.'));
}
const file='src/features/cupping/screens/CuppingSessionDetailsScreen.js';
const baseline=execFileSync('git',['show','eac6fa7:'+file],{cwd:root,encoding:'utf8'});
const ast=s=>parse(s,{sourceType:'module',plugins:['jsx']});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const val of Object.values(node))for(const child of Array.isArray(val)?val:[val]){const match=find(child,predicate);if(match)return match;}return null;}
const isVerification=n=>n.type==='JSXElement'&&n.openingElement?.name.name==='Modal'&&n.children.some(c=>c.type==='JSXElement'&&c.openingElement.name.name==='CheckSampleScreen');
const before=ast(baseline),after=ast(fs.readFileSync(path.join(root,file),'utf8'));
const oldModal=find(before,isVerification),newModal=find(after,isVerification);
assert(oldModal && newModal);
const attrs=newModal.openingElement.attributes;
assert(attrs.some(a=>a.name.name==='transparent'&&a.value===null));
assert.equal(attrs.find(a=>a.name.name==='animationType').value.value,'fade');
assert(!attrs.some(a=>a.name.name==='presentationStyle'));
// Restore only visual modal attributes. Everything else, including handlers,
// callback props, add-sheet visibility, saving and NFC code must be identical.
newModal.openingElement.attributes=attrs.filter(a=>!['transparent','animationType','presentationStyle'].includes(a.name.name));
newModal.openingElement.attributes.splice(1,0,...oldModal.openingElement.attributes.filter(a=>['animationType','presentationStyle'].includes(a.name.name)));
function canonical(n){if(Array.isArray(n))return n.filter(x=>!(x?.type==='JSXText'&&!x.value.trim())).map(canonical);if(!n||typeof n!=='object')return n;return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(k)).map(([k,v])=>[k,canonical(v)]));}
assert.deepEqual(canonical(after),canonical(before));
const source=fs.readFileSync(path.join(root,'src/features/cupping/components/CheckSampleScreen.js'),'utf8');
assert(!/useState|useEffect|services\/|repositories\/|fontSize:|fontWeight:/.test(source));
assert(source.includes('title: { ...typography.text_section_title, flexShrink: 1 }'));
assert(source.includes('message: { ...typography.text_secondary_body }'));
assert(source.includes('scanButton: { backgroundColor: colors.action }'));
console.log('PASS: exact state/callback/loading mapping, approved copy and tokens, identity absent, parent AST unchanged except three visual Modal props.');
