// Transaction-only reassignment evidence. No DB opening, profile, radio or UI.
const {canonicalize,sha256}=require('../features/forms/contract/canonical');
const {validSession,validCode}=require('./sampleCodeProfile');
const {validActor}=require('./localTastingState');
const {validateFrozen,clearBytes}=require('./draftSampleRemovalCodec');
const SCHEMA=`CREATE TABLE local_pending_cup_reassignments (
 destination_session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL UNIQUE,
 actor_id TEXT NOT NULL,
 destination_incarnation TEXT NOT NULL,
 cup_uuid TEXT NOT NULL UNIQUE,
 format_version INTEGER NOT NULL CHECK(format_version=1),
 phase TEXT NOT NULL CHECK(phase IN ('staged','clear_check','clear_verified')),
 content_json TEXT NOT NULL,
 content_hash TEXT NOT NULL
);
CREATE TABLE local_cup_reassignment_receipts (
 operation_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL,
 destination_session_id TEXT NOT NULL,
 destination_incarnation TEXT NOT NULL,
 cup_uuid TEXT NOT NULL,
 binding_generation INTEGER NOT NULL CHECK(binding_generation>=1),
 old_session_reference TEXT NOT NULL,
 old_sample_code TEXT NOT NULL,
 old_binding_hash TEXT NOT NULL,
 format_version INTEGER NOT NULL CHECK(format_version=1),
 receipt_json TEXT NOT NULL,
 receipt_hash TEXT NOT NULL,
 UNIQUE(cup_uuid,binding_generation)
);`;
const fail=()=>{throw new Error('reassignment:unfinished');};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const uid=value=>typeof value==='string'&&/^[A-Z0-9]+$/.test(value);
const keys=(value,list)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===list.split(',').sort().join(',');
const bindingHash=frozen=>sha256(canonicalize({uid:frozen.uid,kind:frozen.kind,metadataHash:sha256(canonicalize(frozen.metadata))}));
function decodeJson(json,digest){let value;try{value=JSON.parse(json);if(canonicalize(value)!==json||sha256(json)!==digest)fail();}catch{fail();}return value;}
function validDrawer(value){
 if(!keys(value,'coffeeNameOrigin,process,cupNumber,cuppingMode')||typeof value.coffeeNameOrigin!=='string'||value.coffeeNameOrigin.length>2048||
  typeof value.process!=='string'||value.process.length>32||!Number.isInteger(value.cupNumber)||value.cupNumber<1||value.cupNumber>8||!['blind','open'].includes(value.cuppingMode))fail();
 return value;
}
function decodePending(row){
 if(!row)return null;
 const v=decodeJson(row.content_json,row.content_hash);
 if(row.format_version!==1||!keys(v,'version,revision,destinationId,operationId,actor,incarnation,setupHash,removalGeneration,bindingGeneration,frozen,bindingHash,eligibility,sourceToken,consentVersion,drawerDraft,verification')||
  v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<1||!validSession(v.destinationId)||![v.operationId,v.actor,v.incarnation].every(validActor)||!hash(v.setupHash)||
  !Number.isSafeInteger(v.removalGeneration)||v.removalGeneration<0||!Number.isSafeInteger(v.bindingGeneration)||v.bindingGeneration<1||
  !['known_creator_complete','unknown_override'].includes(v.eligibility)||!hash(v.sourceToken)||v.consentVersion!==1||
  row.destination_session_id!==v.destinationId||row.operation_id!==v.operationId||row.actor_id!==v.actor||row.destination_incarnation!==v.incarnation||
  !['staged','clear_check','clear_verified'].includes(row.phase))fail();
 let frozen;try{frozen=validateFrozen(v.frozen);validDrawer(v.drawerDraft);}catch{fail();}
 if(row.cup_uuid!==frozen.uid||v.bindingHash!==bindingHash(frozen))fail();
 if(row.phase==='clear_verified'){
  if(!keys(v.verification,'readHash,at,bytesHash')||!hash(v.verification.readHash)||!time(v.verification.at)||v.verification.bytesHash!==frozen.bytesHash)fail();
 }else if(v.verification!==null)fail();
 return {...v,phase:row.phase};
}
async function pendingRow(db,destinationId){return db.getFirstAsync('SELECT * FROM local_pending_cup_reassignments WHERE destination_session_id=?',[destinationId]);}
async function writePending(db,value,phase){
 const {phase:priorPhase,...content}=value;value=content;
 const prior=decodePending(await pendingRow(db,value.destinationId));
 if(prior&&(value.operationId!==prior.operationId||value.revision!==prior.revision))fail();
 value={...value,revision:(prior?.revision||0)+1};
 const json=canonicalize(value);if(json.length>262144)fail();
 await db.runAsync(`INSERT INTO local_pending_cup_reassignments VALUES(?,?,?,?,?,1,?,?,?)
 ON CONFLICT(destination_session_id) DO UPDATE SET phase=excluded.phase,content_json=excluded.content_json,content_hash=excluded.content_hash`,
 [value.destinationId,value.operationId,value.actor,value.incarnation,value.frozen.uid,phase,json,sha256(json)]);
 return decodePending(await pendingRow(db,value.destinationId));
}
async function assertNoReassignment(db,sessionId=null,physicalUid=null,exceptOperation=null){
 const rows=await db.getAllAsync('SELECT * FROM local_pending_cup_reassignments');
 for(const row of rows){const pending=decodePending(row);if(pending.operationId!==exceptOperation&&
  (pending.destinationId===sessionId||pending.frozen.uid===physicalUid))fail();}
}
async function receipts(db){
 const rows=await db.getAllAsync('SELECT * FROM local_cup_reassignment_receipts ORDER BY cup_uuid,binding_generation'),generations=new Map();
 return rows.map(row=>{
  const v=decodeJson(row.receipt_json,row.receipt_hash);
  if(row.format_version!==1||!keys(v,'version,operationId,actor,destinationId,incarnation,setupHash,removalGeneration,verifiedRevision,uid,generation,oldSession,oldCode,oldMetadataHash,oldBindingHash,eligibility,consentVersion,clear,readHash,at')||
   v.version!==1||![v.operationId,v.actor,v.incarnation].every(validActor)||!validSession(v.destinationId)||!uid(v.uid)||
   !validSession(v.oldSession)||!validCode(v.oldCode)||![v.setupHash,v.oldMetadataHash,v.oldBindingHash,v.readHash].every(hash)||!time(v.at)||
   !Number.isSafeInteger(v.removalGeneration)||v.removalGeneration<0||!Number.isSafeInteger(v.verifiedRevision)||v.verifiedRevision<1||
   !['known_creator_complete','unknown_override'].includes(v.eligibility)||v.consentVersion!==1||
   !keys(v.clear,'kind,state,settings,bytes,bytesHash')||!hash(v.clear.bytesHash)||!['smart','ntag'].includes(v.clear.kind)||
   v.clear.kind==='ntag'&&(v.clear.state!==null||v.clear.settings!==null))fail();
  let expected;try{expected=clearBytes(v.clear);}catch{fail();}
  if(v.oldBindingHash!==sha256(canonicalize({uid:v.uid,kind:v.clear.kind,metadataHash:v.oldMetadataHash}))||
   canonicalize(v.clear.bytes)!==canonicalize(expected)||sha256(canonicalize(expected))!==v.clear.bytesHash||
   row.operation_id!==v.operationId||row.actor_id!==v.actor||row.destination_session_id!==v.destinationId||row.destination_incarnation!==v.incarnation||
   row.cup_uuid!==v.uid||row.binding_generation!==v.generation||row.old_session_reference!==v.oldSession||row.old_sample_code!==v.oldCode||row.old_binding_hash!==v.oldBindingHash||
   !Number.isSafeInteger(v.generation)||v.generation!==(generations.get(v.uid)||0)+1)fail();
  generations.set(v.uid,v.generation);return v;
 });
}
function matchesRetired(receipt,physicalUid,metadata){return receipt.uid===physicalUid&&receipt.oldSession===metadata.u&&receipt.oldCode===metadata.z&&receipt.oldMetadataHash===sha256(canonicalize(metadata));}
const publicPending=pending=>pending?{destinationId:pending.destinationId,operationId:pending.operationId,phase:pending.phase,revision:pending.revision,drawerDraft:{...pending.drawerDraft}}:null;
module.exports={SCHEMA,fail,hash,time,keys,bindingHash,validDrawer,decodePending,pendingRow,writePending,assertNoReassignment,receipts,matchesRetired,publicPending};
