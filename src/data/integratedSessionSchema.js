// Integrated session store v1. Static schema fingerprint is derived from the
// reviewed complete DDL, never accepted from an on-device database/marker.
const {canonicalize,sha256}=require('../features/forms/contract/canonical');
const MARKER='cup_session_store_schema';
const MARKER_DDL='CREATE TABLE cup_session_store_schema (version INTEGER PRIMARY KEY CHECK(version=1))';
// Source c02d20c complete schema, replacing only its experimental marker DDL.
const SCHEMA_HASH='be8f4ecf5d6b0e934660b7b97730f834e93919e3c559eb5e4b84b63dccc697b8';
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
async function validate(db,{initialized=true}={}){
 const rows=await schemaRows(db);
 if(fingerprint(rows)!==SCHEMA_HASH||await userVersion(db)!==5)fail();
 const marker=await db.getAllAsync(`SELECT version FROM ${MARKER}`);
 if(initialized?marker.length!==1||marker[0].version!==1:marker.length!==0)fail();
 const foundation=await db.getAllAsync('SELECT version FROM local_session_state_schema');
 if(foundation.length!==1||foundation[0].version!==1)fail();
}
async function recognize(db){
 const rows=await schemaRows(db),version=await userVersion(db);
 if(!rows.length){if(version!==0)fail();return false;}
 // Existing storage is recognized or rejected before any CREATE/ALTER/backfill.
 await validate(db);return true;
}
module.exports={MARKER,MARKER_DDL,SCHEMA_HASH,normalizeSql,fingerprint,validate,recognize};
