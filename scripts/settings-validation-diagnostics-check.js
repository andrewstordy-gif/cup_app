// Isolated settings validator execution only: no app storage, NFC or payload log.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default,cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),file='src/data/sampleCodeProfile.js';
const current=fs.readFileSync(path.join(root,file),'utf8'),baseline=cp.execFileSync('git',['show','d186d2f:'+file],{cwd:root,encoding:'utf8'});
function declaration(source,name){return parse(source,{sourceType:'unambiguous'}).program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);}
const old=declaration(baseline,'validateSettings'),now=declaration(current,'validateSettings');
assert.equal(generate(old.body.body[1].test).code,generate(now.body.body[1].test).code,'exact predicate unchanged');
assert.equal(generate(old.body.body[2]).code,generate(now.body.body[2]).code,'exact return unchanged');
assert.equal(generate(old.body.body[1].consequent.argument).code,generate(now.body.body[1].consequent.body[1].argument).code,'exact thrown error unchanged');
function validator(dev,logger){const context={console:{log:logger}};if(dev!==undefined)context.__DEV__=dev;return vm.runInNewContext(generate(declaration(current,'logInvalidSettings')).code+'\n'+generate(now).code+'\nvalidateSettings',context);}
const original=vm.runInNewContext(generate(old).code+'\nvalidateSettings');
const valid={r:40,a:96,w:240,c:70,x:3600,l:50,k:3},secret='PRIVATE_COFFEE_UID_0123456789';
const outcome=(fn,input)=>{try{return {value:JSON.stringify(fn(input))};}catch(error){return {error:error.message};}};
const corpus=[valid,{...valid,k:1},Object.fromEntries(Object.entries(valid).filter(([key])=>key!=='k')),null,undefined,[],0,'secret',false];
for(const field of Object.keys(valid)){
 const missing={...valid};delete missing[field];corpus.push(missing);
 for(const value of [secret,null,undefined,{},[],true,1.5,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,0,1,2,3])corpus.push({...valid,[field]:value});
}
corpus.push({...valid,[secret]:secret},{...valid,k:secret},Object.create({r:1}));
for(const dev of [true,false,undefined]){
 let calls=[];const validate=validator(dev,(...args)=>calls.push(args));
 for(const input of corpus){calls=[];const expected=outcome(original,input);assert.deepEqual(outcome(validate,input),expected,'same success/rejection as original');
  assert.equal(calls.length,dev===true&&expected.error?1:0,'only development rejection logs');
  if(calls.length){const [label,report]=calls[0];assert.equal(label,'NFC settings validation rejected');assert(!JSON.stringify(calls).includes(secret));assert.deepEqual(Object.keys(report).sort(),['fields','shape','unexpectedFieldCount']);
   for(const field of report.fields){assert(Object.keys(valid).includes(field.field));assert(['absent','accessor','null','array','undefined','object','boolean','number','bigint','string','symbol','function'].includes(field.type));assert(['optional_absent','missing','unavailable','invalid_type','not_safe_integer','negative','unsupported_led_count','valid'].includes(field.reason));assert.deepEqual(Object.keys(field).sort(),['field','reason','type']);}
  }
 }
}
let report;outcome(validator(true,(_label,value)=>report=value),{...valid,[secret]:secret});assert.equal(report.unexpectedFieldCount,1);assert(!JSON.stringify(report).includes(secret));
for(const failure of [()=>{throw Error(secret);},null]){const validate=validator(true,failure);assert.equal(outcome(validate,{...valid,k:2}).error,'Smart cup settings are invalid. No cup was written.');}
// Diagnostics must not invoke a rejected object's accessor or serialize hooks.
let touched=0;const hostile={...valid,[secret]:true,toJSON(){throw Error(secret);}};Object.defineProperty(hostile,'r',{get(){touched++;throw Error(secret);},enumerable:true});
let logged;assert.equal(outcome(validator(true,(...args)=>logged=args),hostile).error,'Smart cup settings are invalid. No cup was written.');assert.equal(touched,0);assert(!JSON.stringify(logged).includes(secret));
let descriptorReads=0;const proxy=new Proxy({...valid,[secret]:true},{getOwnPropertyDescriptor(target,key){if(++descriptorReads>8)throw Error(secret);return Reflect.getOwnPropertyDescriptor(target,key);}});assert.equal(outcome(validator(true,()=>{}),proxy).error,'Smart cup settings are invalid. No cup was written.');
console.log(`PASS settings diagnostics: exact original predicate/return/error; ${corpus.length} cases × dev/production/undefined equivalence; static field/type/reason only, unknown-key count, hostile values/accessors/logger failures private. No NFC or app storage used.`);
