// R1-147 author regression; QA-shared foundation, not separate independent evidence.
const assert=require('node:assert/strict'),path=require('node:path');
const candidate=path.resolve(__dirname,'..'),{harness,snapshot,seedAll,addition}=require('./direct-reassignment-migration-fixture.js');
const rows=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('cup_session_store_schema','sqlite_sequence') ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
async function main(){
 // Independent target construction: retained v2 DDL plus explicitly reviewed
 // two-table extension, not the candidate bootstrap or candidate hash inputs.
 const target=harness();await target.database.getLocalDatabase();target.db.exec(`
 DROP TABLE cup_session_store_schema;
 CREATE TABLE cup_session_store_schema (version INTEGER PRIMARY KEY CHECK(version=3));
 CREATE TABLE local_pending_direct_reassignments (
 destination_session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL, destination_incarnation TEXT NOT NULL,
 cup_uuid TEXT NOT NULL UNIQUE, format_version INTEGER NOT NULL CHECK(format_version=1),
 phase TEXT NOT NULL CHECK(phase IN ('consented','write_check','write_verified')),
 content_json TEXT NOT NULL, content_hash TEXT NOT NULL);
 CREATE TABLE local_direct_reassignment_receipts (
 operation_id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, destination_session_id TEXT NOT NULL,
 destination_incarnation TEXT NOT NULL, cup_uuid TEXT NOT NULL,
 direct_generation INTEGER NOT NULL CHECK(direct_generation>=1), old_session_reference TEXT NOT NULL,
 old_sample_code TEXT NOT NULL, old_binding_hash TEXT NOT NULL, new_sample_id TEXT NOT NULL,
 new_sample_code TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE,
 format_version INTEGER NOT NULL CHECK(format_version=1), receipt_json TEXT NOT NULL, receipt_hash TEXT NOT NULL,
 UNIQUE(cup_uuid,direct_generation));`);
 const oldSchema=require(path.join(require('./direct-reassignment-migration-fixture.js').baseline,'src/data/integratedSessionSchema'));
 const independentHash=oldSchema.fingerprint(target.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name").all());
 assert.equal(independentHash,'3d46cbe6f32dac3b83ad944856cf76643b7c89fe22f6aed6b9f0538ea80222fe');
 assert.equal(require(path.join(candidate,'src/data/integratedSessionSchema')).SCHEMA_HASH,independentHash);
 const env=harness(),seeded=await seedAll(env),before=rows(env.db),profile=[...env.storage];env.restart();env.reload(candidate);await env.database.getLocalDatabase();
 assert.equal(env.db.prepare('PRAGMA user_version').get().user_version,7);assert.equal(env.db.prepare('SELECT version FROM cup_session_store_schema').get().version,3);
 const after=rows(env.db);for(const [table,values]of Object.entries(before))assert.deepEqual(after[table],values,table+' existing rows byte-equivalent');assert.deepEqual([...env.storage],profile);env.unchangedOld();
 assert.deepEqual(Object.keys(after).filter(k=>!(k in before)).sort(),['local_direct_reassignment_receipts','local_pending_direct_reassignments']);
 const stable=snapshot(env.db);env.restart();env.reload(candidate);await env.database.getLocalDatabase();assert.equal(snapshot(env.db),stable,'v3 reopen read-only');
 for(const p of seeded.additions)assert.equal((await env.repo.getPendingSampleAddition(p.sessionId)).operationId,p.operationId);
 for(const [i]of seeded.removals.slice(0,4).entries())assert.equal((await env.repo.getDraftSampleRemoval(`rem0000000000${i}`)).operationId,seeded.removals[i].operationId);
 for(const [i]of seeded.legacy.slice(0,3).entries())assert.equal((await env.repo.getCupReassignment({destinationId:`leg0000000000${i}`})).operationId,seeded.legacy[i].pending.operationId);
 assert.equal(snapshot(env.db),stable,'legacy recovery getters do not mutate upgraded evidence');
 env.restart();await assert.rejects(env.database.getLocalDatabase(),/storage/);assert.equal(snapshot(env.db),stable,'v2 rejects v3 without downgrade');
 // Operational legacy recovery, not just preserved JSON/getter snapshots.
 env.restart();env.reload(candidate);await env.database.getLocalDatabase();
 const spentBefore=env.db.prepare('SELECT COUNT(*) n FROM issued_sample_codes').get().n;
 for(const [i,old]of seeded.legacy.slice(0,3).entries()){
  const destinationId=`leg0000000000${i}`;let pending=await env.repo.getCupReassignment({destinationId});const command=()=>({destinationId,operationId:pending.operationId,expectedRevision:pending.revision,isCurrent:()=>true});
  if(pending.phase==='staged'){const operation=await env.repo.beginCupReassignmentClear({...command(),readResult:require('./direct-reassignment-migration-fixture.js').raw(old.uid,old.metadata)});pending=operation.pending;await operation.beforeWrite();}
  if(pending.phase==='clear_check')pending=(await env.repo.inspectCupReassignmentClear({...command(),readResult:require('./direct-reassignment-migration-fixture.js').raw(old.uid,{})})).pending;
  await env.repo.commitCupReassignmentClear(command());assert.equal(await env.repo.getCupReassignment({destinationId}),null);
 }
 assert.equal(env.db.prepare('SELECT COUNT(*) n FROM local_cup_reassignment_receipts').get().n,4);assert.equal(env.db.prepare('SELECT COUNT(*) n FROM local_direct_reassignment_receipts').get().n,0);assert.equal(env.db.prepare('SELECT COUNT(*) n FROM issued_sample_codes').get().n,spentBefore,'legacy recovery no direct code issuance');
 for(const mutate of [db=>db.exec('DELETE FROM cup_session_store_schema'),db=>db.exec('ALTER TABLE samples ADD COLUMN corrupt TEXT'),db=>db.exec('PRAGMA user_version=7'),db=>db.exec("PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql=replace(sql,'sample_code TEXT NOT NULL CHECK','sample_code TEXTNOTNULL CHECK') WHERE name='samples'; PRAGMA writable_schema=OFF;")]){
  const bad=harness();await bad.database.getLocalDatabase();mutate(bad.db);const original=snapshot(bad.db);bad.restart();bad.reload(candidate);await assert.rejects(bad.database.getLocalDatabase(),/storage/);assert.equal(snapshot(bad.db),original);bad.unchangedOld();
 }
 for(const fault of ['CREATE TABLE local_pending_direct_reassignments','CREATE TABLE local_direct_reassignment_receipts','DROP TABLE cup_session_store_schema','INSERT INTO cup_session_store_schema VALUES(3)']){
  const bad=harness();await addition(bad,'rollback000001',1,'written');const original=snapshot(bad.db),profile=[...bad.storage];bad.restart();bad.reload(candidate);bad.failAt(fault);await assert.rejects(bad.database.getLocalDatabase(),/injected/,fault);assert.equal(snapshot(bad.db),original,fault+' complete rollback');assert.deepEqual([...bad.storage],profile);bad.failAt(null);await bad.database.getLocalDatabase();assert.equal(bad.db.prepare('PRAGMA user_version').get().user_version,7);bad.unchangedOld();
 }
 const fresh=harness();fresh.reload(candidate);const [left,right]=await Promise.all([fresh.database.getLocalDatabase(),fresh.database.getLocalDatabase()]);assert.strictEqual(left,right);assert.equal(fresh.opened.length,1);assert.equal(fresh.db.prepare('PRAGMA user_version').get().user_version,7);fresh.unchangedOld();
 const schema=require(path.join(candidate,'src/data/integratedSessionSchema'));assert.equal(schema.fingerprint(fresh.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name").all()),schema.SCHEMA_HASH);
 console.log('PASS author genuine on-disk v2→v3: bothform scores/notes/history/profile/ledgers plus every legacy pending phase and receipts unchanged, getters/reopen read-only, downgrade/corrupt/weak-token rejects unchanged, direct table/marker faults rollback+retry, fresh/concurrent v3/static target fingerprint.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

