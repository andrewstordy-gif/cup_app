// R151 real on-disk SQLite: original format1 evidence remains operational.
const assert=require('node:assert/strict'),path=require('node:path');
const f=require('./opaque-reassignment-migration-fixture'),root=path.resolve(__dirname,'..'),schema=require('../src/data/integratedSessionSchema');
const rows=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('cup_session_store_schema','sqlite_sequence') ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
async function main(){
 const env=f.harness(),seed=await f.seedAll(env),before=rows(env.db),storage=[...env.storage],originalReceipts=env.db.prepare('SELECT receipt_json,receipt_hash FROM local_direct_reassignment_receipts ORDER BY operation_id').all();
 env.restart();env.reload(root);await env.database.getLocalDatabase();assert.equal(env.db.prepare('PRAGMA user_version').get().user_version,8);assert.equal(env.db.prepare('SELECT version FROM cup_session_store_schema').get().version,4);
 const after=rows(env.db);for(const [table,values]of Object.entries(before))assert.deepEqual(after[table],table==='local_direct_reassignment_receipts'?values.map(v=>Object.assign(Object.create(null),v,{old_assignment_hash:null})):values,table+' original values preserved');assert.deepEqual([...env.storage],storage);env.unchangedOld();
 assert.deepEqual(env.db.prepare('SELECT receipt_json,receipt_hash FROM local_direct_reassignment_receipts ORDER BY operation_id').all(),originalReceipts);
 const stable=f.snapshot(env.db);env.restart();env.reload(root);await env.database.getLocalDatabase();assert.equal(f.snapshot(env.db),stable);
 // Every genuine old direct phase resumes with its old semantic proof. Reordered
 // JSON is deliberately accepted for v1; no raw-byte evidence is retrofitted.
 for(const old of seed.direct){let pending=await env.repo.getDirectCupReassignment({destinationId:old.destinationId}),frozen=old.frozen;
  const command=()=>({destinationId:old.destinationId,operationId:(pending||old.pending).operationId,expectedRevision:(pending||old.pending).revision,isCurrent:()=>true});
  if(old.phase==='committed'){await env.repo.commitDirectCupReassignment(command());continue;}
  assert.equal(pending.phase,old.phase);if(pending.phase==='consented'){const reversed=Object.fromEntries(Object.entries(old.metadata).reverse()),write=await env.repo.prepareDirectCupReassignmentWrite({...command(),readResult:f.read(old.uid,old.kind,reversed),drawerDraft:old.drawerDraft});pending=write.pending;frozen=write.frozen;await write.beforeWrite();}
  if(pending.phase==='write_check')pending=(await env.repo.inspectDirectCupReassignmentWrite({...command(),readResult:f.read(old.uid,old.kind,frozen.payload,1)})).pending;
  await env.repo.commitDirectCupReassignment(command());assert.equal(await env.repo.getDirectCupReassignment({destinationId:old.destinationId}),null);
 }
 assert.equal(env.db.prepare('SELECT COUNT(*) n FROM local_direct_reassignment_receipts WHERE format_version=1').get().n,16);assert.equal(env.db.prepare('SELECT COUNT(*) n FROM local_direct_reassignment_receipts WHERE format_version=2').get().n,0);
 for(const [i,old]of seed.previous.legacy.slice(0,3).entries()){const destinationId=`leg0000000000${i}`;let p=await env.repo.getCupReassignment({destinationId});const cmd=()=>({destinationId,operationId:p.operationId,expectedRevision:p.revision,isCurrent:()=>true});if(p.phase==='staged')p=(await env.repo.beginCupReassignmentClear({...cmd(),readResult:f.raw(old.uid,old.metadata)})).pending;if(p.phase==='clear_check')p=(await env.repo.inspectCupReassignmentClear({...cmd(),readResult:f.raw(old.uid,{})})).pending;await env.repo.commitCupReassignmentClear(cmd());}
 console.log('PASS genuine v3→v4: all rows/profile/hash/vector evidence preserved; all format1 direct phases BOTH forms/families and legacy clear phases resume operationally, old semantic comparison retained, read-only reopen.');
 for(const fault of ['ALTER TABLE local_pending_direct_reassignments','CREATE TABLE local_pending_direct_reassignments','INSERT INTO local_direct_reassignment_receipts SELECT','DROP TABLE r151_receipts_v3','INSERT INTO cup_session_store_schema VALUES(4)']){
  const bad=f.harness();await f.addition(bad,'rollback000001',1,'written');const initial=f.snapshot(bad.db);bad.restart();bad.reload(root);bad.failAt(fault);await assert.rejects(bad.database.getLocalDatabase(),/injected/,fault);assert.equal(f.snapshot(bad.db),initial,fault+' entire v3 unchanged');bad.failAt(null);await bad.database.getLocalDatabase();assert.equal(bad.db.prepare('PRAGMA user_version').get().user_version,8);bad.unchangedOld();
 }
 // The old v1 fixture exercises a failure after intermediate upgrades too.
 for(const fault of ['CREATE TABLE local_pending_direct_reassignments','INSERT INTO cup_session_store_schema VALUES(4)']){
  const original=require('./direct-reassignment-migration-fixture'),old=original.harness();await original.addition(old,'rollback000001',1,'written');const initial=original.snapshot(old.db);old.restart();old.reload(root);old.failAt(fault);await assert.rejects(old.database.getLocalDatabase(),/injected/);assert.equal(original.snapshot(old.db),initial);old.failAt(null);await old.database.getLocalDatabase();assert.equal(old.db.prepare('PRAGMA user_version').get().user_version,8);
 }
 const fresh=f.harness();fresh.reload(root);await fresh.database.getLocalDatabase();assert.equal(schema.fingerprint(fresh.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name").all()),schema.SCHEMA_HASH);assert.equal(fresh.db.prepare('PRAGMA user_version').get().user_version,8);
 console.log('PASS v4 static fingerprint/fresh, v3 rebuild fault rollback+retry, v2 whole-chain rollback+retry; genuine v1 chain covered by retained schema suite.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
