const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {parse} = require('@babel/parser');
const generate = require('@babel/generator').default;
const { fixture } = require('./helpers/session-state-fixture');
const source=fs.readFileSync(path.join(__dirname,'../src/features/cupping/screens/CuppingSessionScreen.js'),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function find(node,predicate) {
  if(!node||typeof node!=='object')return null;
  if(predicate(node))return node;
  for(const value of Object.values(node))for(const child of Array.isArray(value)?value:[value]){const found=find(child,predicate);if(found)return found;}
  return null;
}
const compile=(name,deps)=>new Function(...Object.keys(deps),`return (${generate(find(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name).init).code});`)(...Object.values(deps));
function seedDependents(env,id,sample) {
  const tables=env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    .map(row=>row.name).filter(name=>env.sqlite.prepare(`PRAGMA table_info(${name})`).all().some(column=>column.name==='session_id'));
  const values={session_id:id,sample_id:sample,local_profile_id:env.actorA,schema_version:1,ever_started:0,ever_completed:0,
    operation_id:`pending-${id}`,actor_id:env.actorA,cup_uuid:`PENDING-${id}`,format_version:1,phase:'check',
    saved_revision:1,revision:1,cup_count:1,is_complete:0,completed_at:'2026-10-18T12:00:00.000Z',identity_revealed_at:'2026-10-18T12:00:00.000Z'};
  for(const table of tables){
    const columns=env.sqlite.prepare(`PRAGMA table_info(${table})`).all().filter(column=>column.notnull&&column.dflt_value==null||column.pk);
    const args=columns.map(column=>column.name==='id'?`${table}-${id}`:values[column.name]??(column.type==='INTEGER'?0:'retained raw value'));
    env.sqlite.prepare(`INSERT OR IGNORE INTO ${table} (${columns.map(column=>column.name).join(',')}) VALUES (${args.map(()=>'?').join(',')})`).run(...args);
    assert.ok(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id=?`).get(id).n,`${table} fixture populated`);
  }
  return tables;
}
async function main() {
  for(const status of ['new','pending','in_progress','complete'])for(const provenance of ['creator','participant','missing','foreign']){
    const env=fixture(); const id='local-copy'; const sample=await env.create(id);
    const neighbour=await env.create('same-name-neighbour');
    const tables=seedDependents(env,id,sample);
    env.sqlite.prepare('UPDATE sessions SET status=?,local_creator_profile_id=? WHERE id=?').run(status,provenance==='missing'?null:provenance==='foreign'?env.actorB:env.actorA,id);
    if(provenance==='participant')env.actor(env.actorB);
    const profile=[...env.storage];
    const untouched=env.sqlite.prepare('SELECT * FROM sessions WHERE id=?').get('same-name-neighbour');
    assert.deepEqual(await env.repo.deleteSessionById(id), {deleted:true});
    for(const table of tables)assert.equal(env.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id=?`).get(id).n,0,`${status}/${provenance}/${table} cascades`);
    assert.deepEqual(env.sqlite.prepare('SELECT * FROM sessions WHERE id=?').get('same-name-neighbour'),untouched);
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM samples WHERE id=?').get(neighbour).n,1);
    assert.deepEqual([...env.storage],profile);
    assert.deepEqual(await env.repo.deleteSessionById(id),{deleted:false});
    await assert.rejects(env.repo.saveSessionWithSamples({sessionUUID:id,existingSessionId:id,sessionName:'Late save',cuppingForm:1,samples:[]}),/missing|unavailable/);
    await assert.rejects(env.repo.getCvaResponse(id,sample));
    await assert.rejects(env.repo.completeLocalTasting(id,{expectedContextToken:'stale'}));
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id=?').get(id).n,0);
  }
  const filename=path.join(os.tmpdir(),`cup-r1-065-${process.pid}-${Date.now()}.sqlite`);
  const env=fixture(filename);const sample=await env.create('rollback');await env.create('neighbour');
  env.sqlite.exec('CREATE TABLE sample_feedback AS SELECT id,session_id,sample_id,field_name,score,comments,temp_snapshot,time_snapshot,created_at,updated_at FROM sample_feedback_entries');
  for(const [id,sampleId]of[['rollback',sample],['neighbour','neighbour-sample']])env.sqlite.prepare("INSERT INTO sample_feedback VALUES(?,?,?,'Fragrance',7,'retained notes',NULL,NULL,'now','now')").run(`old-${id}`,id,sampleId);
  env.failAt('DELETE FROM sessions');await assert.rejects(env.repo.deleteSessionById('rollback'),/injected/);env.failAt(null);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sample_feedback').get().n,2,'rollback preserves legacy rows');
  env.storage.set('cup_app:user_profile','{damaged');
  await env.repo.deleteSessionById('rollback');
  assert.deepEqual(env.sqlite.prepare('SELECT session_id FROM sample_feedback').all().map(row=>row.session_id),['neighbour']);
  await env.repo.deleteSessionById('neighbour');env.restart();await env.repo.listSessions();
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sample_feedback_entries').get().n,0,'restart cannot backfill deleted legacy rows');
  await assert.rejects(env.repo.deleteSessionById('   '),/required/);
  assert.deepEqual(await env.repo.deleteSessionById("' OR 1=1 --"),{deleted:false});
  env.sqlite.close();fs.unlinkSync(filename);
  for(const participant of [false,true]){
    const race=fixture(),id='abcdefghijklmn';await race.create(id);
    if(participant)race.sqlite.prepare('UPDATE sessions SET local_creator_profile_id=NULL WHERE id=?').run(id);
    const original=race.bridge.getFirstAsync;let interleaved=false;
    race.bridge.getFirstAsync=async(sql,args)=>{
      const row=await original(sql,args);
      if(!interleaved&&sql==='SELECT status, local_creator_profile_id AS creator FROM sessions WHERE id = ?'){
        interleaved=true;await race.repo.deleteSessionById(id);
      }
      return row;
    };
    const metadata={u:id,f:1,m:'b',e:'Visible session',t:4,d:261018,n:'Secret coffee',p:1,y:1,z:7,i:1};
    await assert.rejects(race.repo.resolveActiveSampleFromCupMetadata({cupUUID:`TAG-${id}-sample`,metadata}),/removed or changed/);
    assert.equal(interleaved,true);assert.equal(race.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id=?').get(id).n,0,'stale known-session scan cannot resurrect deletion');
    race.bridge.getFirstAsync=original;
    assert.ok(await race.repo.resolveActiveSampleFromCupMetadata({cupUUID:`TAG-${id}-sample`,metadata}),'a deliberate fresh scan may import a new local copy');
  }
  const late=fixture(),legacyId='late-legacy',legacySample=await late.create(legacyId,2,'open');
  const loaded=await late.repo.getLegacyResponse(legacyId,legacySample);
  await late.repo.deleteSessionById(legacyId);
  for(const intent of ['save','recovery'])await assert.rejects(late.repo.saveLegacyResponse({sessionId:legacyId,sampleId:legacySample,response:late.legacy(),intent,expectedFingerprint:loaded.savedFingerprint}));
  assert.equal(late.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
  const cva=fixture(),cvaId='late-cva',cvaSample=await cva.create(cvaId);
  const savedCva=await cva.repo.getCvaResponse(cvaId,cvaSample);
  await cva.repo.deleteSessionById(cvaId);
  await assert.rejects(cva.repo.saveCvaResponse({sessionId:cvaId,sampleId:cvaSample,response:cva.response(),expectedRevision:savedCva.revision,expectedIdentity:savedCva.trusted.identity,expectedCupCount:savedCva.n}));
  assert.equal(cva.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
  // Execute actual cross and dialog callbacks; no rendered/native claims.
  const icon=find(ast,n=>n.type==='JSXOpeningElement'&&n.name?.name==='IconButton');assert.ok(icon);
  const card=find(ast,n=>n.type==='FunctionDeclaration'&&n.id?.name==='CuppingSessionCard');
  assert.ok(!generate(card).code.includes('canManageSetup'),'cross is independent of setup authority');
  let opened=0,selected=null,stopped=0;
  const item={id:'target',title:'Same name',canManageSetup:false};
  const cross=new Function('item','onDelete',`return (${generate(icon.attributes.find(a=>a.name?.name==='onPress').value.expression).code});`)(item,value=>{selected=value;});
  cross({stopPropagation(){stopped++;}});assert.equal(stopped,1);assert.equal(selected,item);assert.equal(opened,0);
  let candidate=item, rows=[item,{id:'other',title:'Same name'}],error='',calls=0,release;
  const ref={current:null};
  const deps=()=>({deleteCandidate:candidate,deleteOperationRef:ref,closeDeleteDialog:()=>{candidate=null;},
    deleteSessionById:async id=>{calls++;assert.equal(id,'target');await new Promise(resolve=>{release=resolve;});},
    setSessions:fn=>{rows=fn(rows);},setDeleteCandidate:fn=>{candidate=typeof fn==='function'?fn(candidate):fn;},
    logAppError:()=>{},setDeleteErrorMessage:value=>{error=value;}});
  const close=compile('closeDeleteDialog',deps());close();assert.equal(candidate,null);assert.equal(calls,0);
  candidate=item;const deleting=compile('handleConfirmDelete',deps())();await compile('handleConfirmDelete',deps())();assert.equal(calls,1);
  candidate={id:'other',title:'Same name'};release();await deleting;
  assert.deepEqual(rows.map(row=>row.id),['other']);assert.equal(candidate.id,'other','old callback does not dismiss newer candidate');assert.equal(error,'');
  candidate=item;const failure=deps();failure.deleteSessionById=async()=>{throw Error('disk');};await compile('handleConfirmDelete',failure)();
  assert.equal(error,'Delete failed.');assert.deepEqual(rows.map(row=>row.id),['other']);
  const dialog=find(ast,n=>n.type==='JSXOpeningElement'&&n.name?.name==='WarningDialog'&&n.attributes.some(a=>a.name?.name==='title'&&a.value?.value==='Delete Session?'));
  for(const name of ['onDismiss','onOk'])assert.equal(dialog.attributes.find(a=>a.name?.name===name).value.expression.name,'closeDeleteDialog');
  assert.equal(dialog.attributes.find(a=>a.name?.name==='secondaryLabel').value.value,'Delete');
  const dialogSource=fs.readFileSync(path.join(__dirname,'../src/components/ui/WarningDialog.js'),'utf8');
  assert.match(dialogSource,/onPress=\{handleDismissRequest\}/);assert.match(dialogSource,/onRequestClose=\{handleDismissRequest\}/);
  assert.match(source,/okLabel="Cancel"/);assert.match(source,/saved scores and notes/);
  console.log('Local session deletion checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
