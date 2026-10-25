// Actual isolated on-disk SQLite + memory AsyncStorage. Never opens app data.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),projectLoader=require('./helpers/load-project-module');
const root=path.resolve(__dirname,'..'),schema=require('../src/data/integratedSessionSchema');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='nfzyy8y0pqizn6';
const mainKey='cup_app:user_profile',testKey='cup_app:r1_103:user_profile',profile={uuid:A,name:'Main taster',organisation:'Main org',photoUri:'file:///synthetic/profile.jpg'};
const schemaSql="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name";
function snapshot(db){return JSON.stringify({version:db.prepare('PRAGMA user_version').get(),schema:db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all(),data:Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]))});}
function harness(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cup-integrated-')),opened=[],storageOps=[],sqlOps=[],storage=new Map([[mainKey,JSON.stringify(profile)],[testKey,JSON.stringify({...profile,uuid:B,name:'Experiment'})],['unrelated:preference','keep-me']]);
 for(const name of ['cup_user_test.db','cup_r1_103_sample_codes_test.db']){const db=new DatabaseSync(path.join(dir,name));db.exec('CREATE TABLE sentinel(value TEXT);INSERT INTO sentinel VALUES(\'old data retained\')');db.close();}
 const oldBytes=Object.fromEntries(['cup_user_test.db','cup_r1_103_sample_codes_test.db'].map(name=>[name,fs.readFileSync(path.join(dir,name))]));
 let db=null,tail=Promise.resolve(),failure=null,active=false;
 const handle={async getFirstAsync(sql,args=[]){sqlOps.push(sql);return db.prepare(sql).get(...args)||null;},async getAllAsync(sql,args=[]){sqlOps.push(sql);return db.prepare(sql).all(...args);},async runAsync(sql,args=[]){sqlOps.push(sql);const value=db.prepare(sql).run(...args);if(failure&&sql.includes(failure))throw Error('injected bootstrap failure');return value;},async execAsync(sql){sqlOps.push(sql);db.exec(sql);if(failure&&sql.includes(failure))throw Error('injected bootstrap failure');}};
 const bridge={...handle,withExclusiveTransactionAsync(callback){const run=tail.then(async()=>{assert(!active);db.exec('BEGIN IMMEDIATE');active=true;try{const value=await callback(handle);db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}finally{active=false;}});tail=run.catch(()=>{});return run;}};
 const mocks={'expo-sqlite':{openDatabaseAsync:async name=>{opened.push(name);assert.equal(name,'cup_sessions_v1.db','old app DB must never be opened');if(!db)db=new DatabaseSync(path.join(dir,name));return bridge;}},
  '@react-native-async-storage/async-storage':{async getItem(key){storageOps.push(['get',key]);return storage.get(key)??null;},async setItem(key,value){storageOps.push(['set',key]);storage.set(key,value);},async clear(){throw Error('broad storage clear forbidden');},async removeItem(){throw Error('storage deletion forbidden');}},
  'expo-crypto':{getRandomValues(bytes){require('node:crypto').randomFillSync(bytes);return bytes;}},'../utils/secureIdentifiers':{generateDomainId:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}};
 let load;const env={dir,storage,opened,storageOps,sqlOps,get db(){if(!db)db=new DatabaseSync(path.join(dir,'cup_sessions_v1.db'));return db;},failAt(value){failure=value;},
  reload(){load=projectLoader(root,mocks);env.database=load('src/data/localDatabase.js');env.repo=load('src/data/sessionRepository.js');env.profile=load('src/data/userProfileRepository.js');},
  restart(){if(db)db.close();db=null;env.reload();},
  unchangedOld(){for(const [name,bytes]of Object.entries(oldBytes))assert.deepEqual(fs.readFileSync(path.join(dir,name)),bytes);assert.equal(storage.get('unrelated:preference'),'keep-me');assert.equal(JSON.parse(storage.get(testKey)).uuid,B);assert(storageOps.every(([,key])=>key===mainKey),'only main profile key accessed');}};
 env.reload();return env;
}
const input={sessionUUID:S,sessionName:'Fictional fresh session',sessionType:'4',sessionDate:'24 Oct 2026',cuppingForm:1,cuppingMode:null,samples:[],intent:'setup'};
async function main(){
 const env=harness(),stored=env.storage.get(mainKey);assert.deepEqual(await env.repo.listSessions(),[]);assert.deepEqual(await env.profile.getUserProfile(),profile);assert.equal(env.storage.get(mainKey),stored);assert(!env.storageOps.some(([kind])=>kind==='set'));
 assert.equal(env.db.prepare('SELECT version FROM cup_session_store_schema').get().version,2);assert.equal(schema.fingerprint(env.db.prepare(schemaSql).all()),schema.SCHEMA_HASH);
 await env.repo.saveSessionWithSamples(input);assert.equal(env.db.prepare('SELECT local_creator_profile_id FROM sessions').get().local_creator_profile_id,A);const before=snapshot(env.db);env.restart();assert.equal((await env.repo.listSessions()).length,1);assert.equal(snapshot(env.db),before,'recognized cold reopen performs no persistent mutation');env.unchangedOld();
 const template=env.db.prepare(schemaSql).all();
 function clone(target,change=row=>row.sql){for(const row of template.filter(row=>row.type==='table'))target.db.exec(change(row));for(const row of template.filter(row=>row.type==='index'))target.db.exec(change(row));target.db.exec('INSERT INTO cup_session_store_schema VALUES(2);INSERT INTO local_session_state_schema VALUES(1);PRAGMA user_version=6;');}
 for(const mutate of [
  db=>db.exec('CREATE TABLE sessions(id TEXT)'),
  db=>db.exec('CREATE TABLE unknown_store(value TEXT)'),
  db=>db.exec('PRAGMA user_version=5'),
 ]){const bad=harness();mutate(bad.db);const original=snapshot(bad.db);await assert.rejects(bad.database.getLocalDatabase(),/storage/);assert.equal(snapshot(bad.db),original,'markerless/partial store is rejected without repair');bad.unchangedOld();}
 const corruptions=[
  db=>db.exec('DROP TABLE local_pending_draft_removals'),db=>db.exec('DROP TABLE sample_code_issuers'),
  db=>db.exec('DROP INDEX idx_samples_cup_uuid'),db=>db.exec('ALTER TABLE samples ADD COLUMN unexpected TEXT'),
  db=>db.exec('CREATE TABLE extra_table(value TEXT)'),db=>db.exec('CREATE TABLE sqlitex_sneaky(value TEXT)'),
  db=>db.exec('CREATE TRIGGER unexpected_trigger AFTER INSERT ON sessions BEGIN SELECT 1; END'),
  db=>db.exec('DELETE FROM cup_session_store_schema'),db=>db.exec('DELETE FROM local_session_state_schema'),
  db=>db.exec('PRAGMA user_version=7'),db=>db.exec('PRAGMA user_version=4'),
 ];
 for(const corrupt of corruptions){const bad=harness();clone(bad);corrupt(bad.db);const original=snapshot(bad.db);await assert.rejects(bad.database.getLocalDatabase(),/storage/);assert.equal(snapshot(bad.db),original,'malformed integrated schema/marker rejected before changes');bad.unchangedOld();}
 const weakened=harness();clone(weakened,row=>row.name==='samples'?row.sql.replace('sample_code TEXT NOT NULL CHECK','sample_code TEXTNOTNULL CHECK'):row.sql);assert.equal(weakened.db.prepare('PRAGMA table_info(samples)').all().find(row=>row.name==='sample_code').notnull,0);const weakBefore=snapshot(weakened.db);await assert.rejects(weakened.database.getLocalDatabase(),/storage/);assert.equal(snapshot(weakened.db),weakBefore,'SQL token boundaries cannot weaken NOT NULL while matching fingerprint');
 assert.notEqual(schema.normalizeSql('sample_code TEXT NOT NULL'),schema.normalizeSql('sample_code TEXTNOTNULL'));assert.notEqual(schema.normalizeSql("DEFAULT 'new'"),schema.normalizeSql("DEFAULT 'NEW'"));
 for(const stage of ['CREATE TABLE IF NOT EXISTS samples','CREATE TABLE IF NOT EXISTS local_pending_draft_removals','INSERT INTO cup_session_store_schema']){
  const failed=harness(),original=snapshot(failed.db);failed.failAt(stage);await assert.rejects(failed.database.getLocalDatabase(),/injected/);assert.equal(snapshot(failed.db),original,'fresh bootstrap is all-or-nothing incl final marker');failed.failAt(null);await failed.database.getLocalDatabase();assert.equal(failed.db.prepare('SELECT version FROM cup_session_store_schema').get().version,2);failed.unchangedOld();
 }
 const concurrent=harness();const [left,right]=await Promise.all([concurrent.database.getLocalDatabase(),concurrent.database.getLocalDatabase()]);assert.strictEqual(left,right);assert.equal(concurrent.opened.length,1,'concurrent startup shares bootstrap');
 const missing=harness();missing.storage.delete(mainKey);assert.deepEqual(await missing.repo.listSessions(),[]);await missing.repo.saveSessionWithSamples(input);const created=JSON.parse(missing.storage.get(mainKey));assert.equal(created.uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');assert.notEqual(created.uuid,B,'experiment identity is never copied');missing.unchangedOld();
 for(const raw of ['not-json','null','{}',JSON.stringify({...profile,uuid:'damaged'})]){const corrupt=harness();corrupt.storage.set(mainKey,raw);await assert.rejects(corrupt.repo.saveSessionWithSamples(input),/identity/);assert.equal(corrupt.storage.get(mainKey),raw,'corrupt main profile is never replaced');assert.equal(corrupt.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);corrupt.unchangedOld();}
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));assert.equal(pkg.main,'node_modules/expo/AppEntry.js');assert(!/preview|r1-062/.test(pkg.main));
 console.log('PASS integrated normal entry/main profile/fresh on-disk SQLite boundary: old files+experiment/unrelated storage untouched, empty/reopen persistence, full-schema/constraint/marker rejection, atomic failure+retry, concurrent startup and profile initialization/corruption. No app data or device used.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
