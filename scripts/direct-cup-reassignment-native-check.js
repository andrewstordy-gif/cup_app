// R1-147 author regression; foundation shared by independent QA with permission.
// Shared fixture foundation is not counted as a second independent review.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(root,'scripts/draft-removal-nfc-check.js'),source=fs.readFileSync(file,'utf8'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source.slice(0,source.indexOf('async function main(){'))+'\nmodule.exports={nfc,manager,setTag:v=>tag=v,configure:v=>{capacity=v.capacity??4096;status=v.status??2;failWrite=!!v.failWrite;writes=[];},writes:()=>writes};',file);
const native=m.exports,{prepare,cmd,read,D,codes}=require('./direct-cup-reassignment-check.js'),originalWriter=native.manager.ndefHandler.writeNdefMessage;
async function main(){for(const kind of ['ntag','smart'])for(const form of [1,2])for(const scenario of ['success','capacity','actor','uncertain','stage']){
 const x=await prepare(kind,form),{env}=x;native.setTag(read(kind,form).tag);native.configure({capacity:scenario==='capacity'?1:4096,failWrite:scenario==='uncertain'});let frozen;
 native.manager.ndefHandler.writeNdefMessage=async bytes=>{assert.equal(env.sqlite.prepare('SELECT phase FROM local_pending_direct_reassignments').get().phase,'write_check');assert.equal(codes(env),1);assert.deepEqual(bytes,frozen.bytes,'native emitted exactly durable full assignment bytes');return originalWriter(bytes);};
 if(scenario==='stage')env.failAt('INSERT INTO local_pending_direct_reassignments');
 const perform=()=>native.nfc.readAndWriteNdefMinimal(async readResult=>{await env.repo.observePendingCupReassignmentRead(readResult,{isReadCurrent:()=>true});const operation=await env.repo.prepareDirectCupReassignmentWrite({...cmd(x),readResult,drawerDraft:x.drawer});x.pending=operation.pending;frozen=operation.frozen;if(scenario==='actor')env.actor(env.actorB);return operation;});
 if(scenario==='success'){await perform();assert.equal(native.writes().length,1);assert.equal(env.sqlite.prepare('SELECT phase FROM local_pending_direct_reassignments').get().phase,'write_check');}
 else{await assert.rejects(perform());assert.equal(native.writes().length,scenario==='uncertain'?2:0,'retained native TagUpdateFailure transport retry uses same frozen bytes/current fence');assert.equal(codes(env),scenario==='stage'?0:1,'prepared failures spend code but stage rollback does not');}
 assert.equal((await env.repo.getSessionById(D)).samples.length,0);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM local_direct_reassignment_receipts').get().n,0);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM local_cup_reassignment_receipts').get().n,0);env.sqlite.close();
 }
 console.log('PASS author actual native readAndWrite dispatcher/repository bothforms/families: happy path exactly1 durable full assignment/no blank clear, capacity/stage/actor zero dispatch, retained native TagUpdateFailure retry reuses exact bytes/current fence/one code, native callback never member/receipt. Software mock only.');}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

