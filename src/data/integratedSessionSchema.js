// Integrated session store v4. Static schema fingerprints are derived from the
// reviewed complete DDL, never accepted from an on-device database/marker.
const {canonicalize,sha256}=require('../features/forms/contract/canonical');
const MARKER='cup_session_store_schema';
const V1_MARKER_DDL='CREATE TABLE cup_session_store_schema (version INTEGER PRIMARY KEY CHECK(version=1))';
const V2_MARKER_DDL='CREATE TABLE cup_session_store_schema (version INTEGER PRIMARY KEY CHECK(version=2))';
const V3_MARKER_DDL='CREATE TABLE cup_session_store_schema (version INTEGER PRIMARY KEY CHECK(version=3))';
const MARKER_DDL='CREATE TABLE cup_session_store_schema (version INTEGER PRIMARY KEY CHECK(version=4))';
// Source c02d20c complete schema, replacing only its experimental marker DDL.
const V1_SCHEMA_HASH='be8f4ecf5d6b0e934660b7b97730f834e93919e3c559eb5e4b84b63dccc697b8';
// Independently derived from exact reviewed v1 plus the two reassignment tables.
const V2_SCHEMA_HASH='9f2b3dc8a68235f571d4ca9f3a0ab8f3ce34d8255659748854fb7008054ef07f';
const V3_SCHEMA_HASH='3d46cbe6f32dac3b83ad944856cf76643b7c89fe22f6aed6b9f0538ea80222fe';
const SCHEMA_HASH='8c58bba307f397a5352ccc1cd95f0d3adab19c5f4df8262158fca613ba2077b8';
const fail=()=>{throw new Error('Session storage is incompatible or incomplete. No database was reset.');};
function normalizeSql(sql){
 if(typeof sql!=='string')fail();
 const tokens=[];let word='';
 const flush=()=>{if(word){tokens.push(word.toLowerCase());word='';}};
 for(let index=0;index<sql.length;index++){
  const char=sql[index];
  if(/\s/.test(char)){flush();continue;}
  if(char==='\''||char==='"'||char==='`'||char==='['){
   flush();const close=char==='['?']':char;let token=char,closed=false;
   while(++index<sql.length){token+=sql[index];if(sql[index]===close){if(sql[index+1]===close&&char!=='['){token+=sql[++index];}else{closed=true;break;}}}
   if(!closed)fail();tokens.push(token);continue;
  }
  if(/[a-z0-9_]/i.test(char)){word+=char;continue;}
  flush();tokens.push(char);
 }
 flush();if(tokens[tokens.length-1]===';')tokens.pop();return JSON.stringify(tokens);
}
function fingerprint(rows){return sha256(canonicalize(rows.map(row=>({type:row.type,name:row.name,table:row.tbl_name,sql:normalizeSql(row.sql)}))));}
async function schemaRows(db){return db.getAllAsync("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name");}
async function userVersion(db){const row=await db.getFirstAsync('PRAGMA user_version;');if(!Number.isSafeInteger(row?.user_version))fail();return row.user_version;}
async function validate(db,{initialized=true,version=4}={}){
 const rows=await schemaRows(db);
 if(![1,2,3,4].includes(version)||fingerprint(rows)!==({1:V1_SCHEMA_HASH,2:V2_SCHEMA_HASH,3:V3_SCHEMA_HASH,4:SCHEMA_HASH})[version]||await userVersion(db)!==version+4)fail();
 const marker=await db.getAllAsync(`SELECT version FROM ${MARKER}`);
 if(initialized?marker.length!==1||marker[0].version!==version:marker.length!==0)fail();
 const foundation=await db.getAllAsync('SELECT version FROM local_session_state_schema');
 if(foundation.length!==1||foundation[0].version!==1)fail();
}
async function recognize(db){
 const rows=await schemaRows(db),version=await userVersion(db);
 if(!rows.length){if(version!==0)fail();return 0;}
 // Existing storage is recognized or rejected before any CREATE/ALTER/backfill.
 if(version===5&&fingerprint(rows)===V1_SCHEMA_HASH){await validate(db,{version:1});return 1;}
 if(version===6&&fingerprint(rows)===V2_SCHEMA_HASH){await validate(db,{version:2});return 2;}
 if(version===7&&fingerprint(rows)===V3_SCHEMA_HASH){await validate(db,{version:3});return 3;}
 await validate(db);return 4;
}
async function upgrade(db,version=1){
 // The expected source is bundled, never a marker/hash supplied by the device.
 await validate(db,{version});
 if(version===1){
  await db.execAsync(require('./pendingCupReassignmentStore').SCHEMA);
  await db.execAsync(`DROP TABLE ${MARKER};${V2_MARKER_DDL};PRAGMA user_version=6;`);
  await validate(db,{initialized:false,version:2});await db.runAsync('INSERT INTO cup_session_store_schema VALUES(2)');await validate(db,{version:2});
 }
 if(version<3){
 await db.execAsync(require('./directCupReassignmentStore').V3_SCHEMA);
 await db.execAsync(`DROP TABLE ${MARKER};${V3_MARKER_DDL};PRAGMA user_version=7;`);
 await validate(db,{initialized:false,version:3});await db.runAsync('INSERT INTO cup_session_store_schema VALUES(3)');await validate(db,{version:3});
 }
 await db.execAsync(`ALTER TABLE local_pending_direct_reassignments RENAME TO r151_pending_v3;
 ALTER TABLE local_direct_reassignment_receipts RENAME TO r151_receipts_v3;`);
 await db.execAsync(require('./directCupReassignmentStore').SCHEMA);
 await db.execAsync(`INSERT INTO local_pending_direct_reassignments SELECT * FROM r151_pending_v3;
 INSERT INTO local_direct_reassignment_receipts SELECT *,NULL FROM r151_receipts_v3;
 DROP TABLE r151_pending_v3; DROP TABLE r151_receipts_v3;
 DROP TABLE ${MARKER};${MARKER_DDL};PRAGMA user_version=8;`);
 await validate(db,{initialized:false});await db.runAsync('INSERT INTO cup_session_store_schema VALUES(4)');
 await validate(db);
}
module.exports={MARKER,MARKER_DDL,V1_MARKER_DDL,V2_MARKER_DDL,V3_MARKER_DDL,V1_SCHEMA_HASH,V2_SCHEMA_HASH,V3_SCHEMA_HASH,SCHEMA_HASH,normalizeSql,fingerprint,validate,recognize,upgrade};
