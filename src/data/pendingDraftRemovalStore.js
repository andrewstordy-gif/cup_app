// Protected transaction-only journal. Receipt has no sample FK: retirement
// must survive deleting that sample while its session/code ledger remains.
const {canonicalize,sha256,validSession,validCode}=require('./sampleCodeProfile');
const {validateFrozen}=require('./draftSampleRemovalCodec');
const SCHEMA=`CREATE TABLE IF NOT EXISTS local_pending_draft_removals (
 session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL, cup_uuid TEXT NOT NULL UNIQUE,
 format_version INTEGER NOT NULL CHECK(format_version=1),
 phase TEXT NOT NULL CHECK(phase IN ('staged','writing','written','verified')),
 content_json TEXT NOT NULL, content_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_draft_removal_receipts (
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL, issuer_incarnation TEXT NOT NULL,
 generation INTEGER NOT NULL, sample_id TEXT NOT NULL, sample_code TEXT NOT NULL,
 addition_operation_id TEXT NOT NULL, receipt_json TEXT NOT NULL, receipt_hash TEXT NOT NULL,
 PRIMARY KEY(session_id,sample_code)
);`;
const fail=()=>{throw new Error('removal:context_changed');};
const id=value=>typeof value==='string'&&value.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash=value=>typeof value==='string'&&value.length===64&&/^[a-f0-9]{64}$/.test(value);
function validVerification(value,bytesHash){return Boolean(value&&Object.keys(value).sort().join(',')==='at,bytesHash,readHash'&&
 value.bytesHash===bytesHash&&hash(value.bytesHash)&&hash(value.readHash)&&typeof value.at==='string'&&
 Number.isFinite(Date.parse(value.at))&&new Date(value.at).toISOString()===value.at);}
const normalize=sql=>sql.replace(/IF NOT EXISTS /gi,'').replace(/\s+/g,'').replace(/;$/,'').toLowerCase();
async function assertSchema(db){for(const statement of SCHEMA.split(';').map(s=>s.trim()).filter(Boolean)){
 const name=/EXISTS (\w+)/.exec(statement)[1],row=await db.getFirstAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",[name]);
 if(!row||normalize(row.sql)!==normalize(statement))fail();
}}
async function pendingRemovalRow(db,sessionId){await assertSchema(db);return db.getFirstAsync('SELECT * FROM local_pending_draft_removals WHERE session_id=?',[sessionId]);}
function decodeRemoval(row){
 if(!row)return null;
 if(row.format_version!==1||!['staged','writing','written','verified'].includes(row.phase)||sha256(row.content_json)!==row.content_hash)fail();
 let content;try{content=JSON.parse(row.content_json);if(canonicalize(content)!==row.content_json)fail();validateFrozen(content.frozen);}catch{fail();}
 if(Object.keys(content).sort().join(',')!=='actor,additionOperationId,code,frozen,generation,incarnation,operationId,sampleId,schema,sessionId,snapshot,verification'||
   content.schema!==1||!validSession(content.sessionId)||![content.operationId,content.actor,content.incarnation,content.sampleId,content.additionOperationId].every(id)||!validCode(content.code)||!hash(content.snapshot)||
   content.sessionId!==row.session_id||content.operationId!==row.operation_id||content.actor!==row.actor_id||
   content.frozen.uid!==row.cup_uuid||!Number.isSafeInteger(content.generation)||content.generation<1||
   row.phase==='verified'&&!validVerification(content.verification,content.frozen.bytesHash)||
   row.phase!=='verified'&&content.verification!=null)fail();
 return {...content,phase:row.phase};
}
async function writeRemoval(db,content,phase){
 const {phase:ignored,...saved}=content,json=canonicalize(saved);
 await db.runAsync(`INSERT INTO local_pending_draft_removals(session_id,operation_id,actor_id,cup_uuid,format_version,phase,content_json,content_hash)
 VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(session_id) DO UPDATE SET phase=excluded.phase,content_json=excluded.content_json,content_hash=excluded.content_hash`,
 [saved.sessionId,saved.operationId,saved.actor,saved.frozen.uid,phase,json,sha256(json)]);
 return decodeRemoval(await pendingRemovalRow(db,saved.sessionId));
}
async function assertNoRemoval(db,sessionId){if(await pendingRemovalRow(db,sessionId))throw new Error('removal:unfinished');}
module.exports={SCHEMA,pendingRemovalRow,decodeRemoval,writeRemoval,assertNoRemoval,validVerification};
