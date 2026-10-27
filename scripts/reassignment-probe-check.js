// R154 temporary diagnostics: original source differential + real SQLite/handlers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/sample-code-fixture'),load=require('./helpers/load-project-module'),{D,read,current,snapshot}=require('./direct-cup-reassignment-check'),{ui,start}=require('./direct-cup-reassignment-screen-check');
const root=path.resolve(__dirname,'..'),repoFile=path.join(root,'src/data/sessionRepository.js'),originalRepo=execFileSync('git',['show','fc04589:src/data/sessionRepository.js'],{cwd:root,encoding:'utf8'}),log=console.log,NativeDate=Date;
const PRIVATE='PRIVATE_SENTINEL_NEVER_LOG',probe=load(root)('src/utils/reassignmentProbe.js').logReassignmentProbe;
function capture(dev,throwing=false){const output=[],original=console.log;if(dev===undefined)delete global.__DEV__;else global.__DEV__=dev;console.log=(...args)=>{if(throwing)throw Error(PRIVATE);output.push(args);};return {output,restore(){console.log=original;delete global.__DEV__;}};}
async function scenario(baseline,dev,attack,throwing=false){
 const c=capture(dev,throwing),readFile=fs.readFileSync,random=crypto.randomFillSync;let env,error,result,command,originalError;
 global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-27T12:00:00.000Z']));}static now(){return 1793102400000;}};crypto.randomFillSync=bytes=>bytes.fill(0);
 try{
  if(baseline)fs.readFileSync=function(file,...args){return file===repoFile?originalRepo:readFile.call(fs,file,...args);};
  try{env=fixture();}finally{fs.readFileSync=readFile;}
  await env.create(D,1,null,false);const observed=read('ntag'),prompt=await env.repo.inspectDirectCupReassignment({destinationId:D,readResult:observed,isCurrent:current}),drawerDraft={coffeeNameOrigin:PRIVATE,process:'2',cupNumber:2,cuppingMode:'blind'};
  const pending=await env.repo.stageDirectCupReassignment({observation:prompt.observation,consentVersion:1,drawerDraft,isCurrent:current}),trace=[];
  for(const key of ['getFirstAsync','getAllAsync','runAsync','execAsync']){const fn=env.bridge[key];env.bridge[key]=(...args)=>{trace.push([key,...args]);return fn(...args);};}
  const tx=env.bridge.withExclusiveTransactionAsync;env.bridge.withExclusiveTransactionAsync=callback=>{trace.push(['transaction']);return tx(async db=>{const wrapped={};for(const key of ['getFirstAsync','getAllAsync','runAsync','execAsync'])wrapped[key]=(...args)=>{trace.push([key,...args]);return db[key](...args);};return callback(wrapped);});};
  let physical=observed,revision=pending.revision,operationId=pending.operationId;
  if(attack==='envelope')physical={...observed,recordCount:3};if(attack==='uid')physical=read('ntag',1,{uid:'PRIVATEUID'});if(attack==='assignment')physical=read('ntag',1,{payload:{...require('./direct-cup-reassignment-check').meta(1),n:PRIVATE}});if(attack==='revision')revision--;
  if(attack==='context')operationId='99999999-9999-4999-8999-999999999999';if(attack==='stage')env.failAt('INSERT INTO local_pending_direct_reassignments');
  if(attack==='sentinel'){originalError=Error(PRIVATE);Object.defineProperty(originalError,'message',{get(){throw Error('MUST_NOT_READ');}});env.hook(sql=>{if(sql.includes('SELECT * FROM local_pending_direct_reassignments'))throw originalError;});}
  c.output.length=0;
  try{command=await env.repo.prepareDirectCupReassignmentWrite({destinationId:D,operationId,expectedRevision:revision,readResult:physical,drawerDraft,isCurrent:current});await command.beforeWrite();result={pending:command.pending,frozen:command.frozen,records:command.records,metadataOnly:command.metadataOnly};}catch(e){error=e;}
  env.hook(null);env.failAt(null);if(attack==='sentinel')assert.strictEqual(error,originalError);
  return {result,error:attack==='sentinel'?'same-error':error?.message||null,snapshot:snapshot(env),trace,output:c.output};
 }finally{fs.readFileSync=readFile;crypto.randomFillSync=random;global.Date=NativeDate;c.restore();env?.sqlite.close();}
}
async function main(){
 for(const dev of [false,undefined,1,'true']){const c=capture(dev);probe('prepare','envelope',true);assert.equal(c.output.length,0);c.restore();}
 {const c=capture(true);probe(PRIVATE,'envelope');probe('prepare',PRIVATE);probe('prepare','envelope',PRIVATE);probe({toString(){throw Error(PRIVATE);}},'envelope');assert.equal(c.output.length,0);probe('prepare','envelope',true);assert.deepEqual(c.output,[['NFC reassignment probe',{stage:'prepare',category:'envelope',rejected:true}]]);c.restore();}
 {const c=capture(true,true);assert.doesNotThrow(()=>probe('prepare','envelope',true));c.restore();const original=global.console;delete global.console;global.__DEV__=true;try{probe('prepare','envelope',true);}finally{global.console=original;delete global.__DEV__;}}
 for(const attack of ['success','envelope','uid','assignment','revision','context','stage','sentinel']){
  const baseline=await scenario(true,false,attack),off=await scenario(false,false,attack),on=await scenario(false,true,attack),broken=await scenario(false,true,attack,true);
  const strip=x=>({result:x.result,error:x.error,snapshot:x.snapshot,trace:x.trace});assert.deepEqual(strip(off),strip(baseline),attack+' exact base result/DB/SQL-transaction order');assert.deepEqual(strip(on),strip(baseline));assert.deepEqual(strip(broken),strip(baseline),'throwing console cannot change behavior');assert.equal(off.output.length,0);assert.equal(broken.output.length,0);
  assert(!JSON.stringify(on.output).includes(PRIVATE));assert(!JSON.stringify(on.output).includes('PRIVATEUID'));for(const [prefix,data]of on.output){assert.equal(prefix,'NFC reassignment probe');assert.deepEqual(Object.keys(data),['stage','category','rejected']);assert.equal(typeof data.rejected,'boolean');}
  if(['envelope','uid','assignment','revision','stage'].includes(attack))assert(on.output.some(([,v])=>v.category===({uid:'cup-uid',assignment:'assignment',stage:'staging-or-ack'}[attack]||attack)&&v.rejected),attack+' discriminating static label');
 }
 for(const form of [1,2])for(const smart of [false,true]){
  const c=capture(true),{env,h}=await start(form,smart);c.output.length=0;await h.run('handleDirectCupReassignmentAction');const labels=c.output.filter(([prefix])=>prefix==='NFC reassignment probe').map(([,v])=>v.category);for(const label of ['native-request','read-callback','prepare-call','prepared','authorized','native-return'])assert(labels.includes(label));assert.equal(h.writes.length,1);assert.equal(h.samples.length,0);assert(!JSON.stringify(c.output).includes('PROTECTED OLD'));env.sqlite.close();c.restore();
 }
 // Actual UI keeps the existing misleading Check recovery on pre-dispatch failure.
 {const c=capture(true),{env,h}=await start(1,false);await h.run('handleDirectCupReassignmentAction');await h.run('handleCloseCupReassignment',h.cupReassignmentDialog);h.tagId='OTHER';c.output.length=0;await h.run('handleScanCup');assert.equal(h.writes.length,1,'rejected restart adds no write');assert.equal(h.cupReassignmentDialog.mode,'check');assert(c.output.some(([,v])=>v.stage==='ui-write'&&v.category==='prepare-call'&&v.rejected));env.sqlite.close();c.restore();}
 log('PASS R154 strict dev-only fixed-label privacy/nonthrowing; exact fc04589 repo result/error/SQL/transaction/frozen-byte differential success+failures incl sentinel identity, throwing logger; actual UI stages and unchanged Check recovery bothforms/families.');
}
main().catch(e=>{console.log=log;console.error(e);process.exitCode=1;});
