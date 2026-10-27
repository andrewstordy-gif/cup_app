// Direct purpose only. Legacy clear rows/JSON remain separately validated.
const {canonicalize,sha256,validSession,validCode,validateMetadata}=require('./sampleCodeProfile');
const {validActor}=require('./localTastingState');
const codec=require('./directCupReassignmentCodec');
const {pendingSampleFields,pendingSaveInput}=require('./pendingSampleAdditionStore');
const V3_SCHEMA=`CREATE TABLE local_pending_direct_reassignments (
 destination_session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL, destination_incarnation TEXT NOT NULL,
 cup_uuid TEXT NOT NULL UNIQUE, format_version INTEGER NOT NULL CHECK(format_version=1),
 phase TEXT NOT NULL CHECK(phase IN ('consented','write_check','write_verified')),
 content_json TEXT NOT NULL, content_hash TEXT NOT NULL
);
CREATE TABLE local_direct_reassignment_receipts (
 operation_id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, destination_session_id TEXT NOT NULL,
 destination_incarnation TEXT NOT NULL, cup_uuid TEXT NOT NULL,
 direct_generation INTEGER NOT NULL CHECK(direct_generation>=1), old_session_reference TEXT NOT NULL,
 old_sample_code TEXT NOT NULL, old_binding_hash TEXT NOT NULL, new_sample_id TEXT NOT NULL,
 new_sample_code TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE,
 format_version INTEGER NOT NULL CHECK(format_version=1), receipt_json TEXT NOT NULL, receipt_hash TEXT NOT NULL,
 UNIQUE(cup_uuid,direct_generation)
);`;
const SCHEMA=V3_SCHEMA.replaceAll('CHECK(format_version=1)','CHECK(format_version IN (1,2))')
 .replace('old_session_reference TEXT NOT NULL','old_session_reference TEXT')
 .replace('old_sample_code TEXT NOT NULL','old_sample_code TEXT')
 .replace('UNIQUE(cup_uuid,direct_generation)','old_assignment_hash TEXT, CHECK((format_version=1 AND old_session_reference IS NOT NULL AND old_sample_code IS NOT NULL AND old_assignment_hash IS NULL) OR (format_version=2 AND old_assignment_hash IS NOT NULL AND ((old_session_reference IS NULL AND old_sample_code IS NULL) OR (old_session_reference IS NOT NULL AND old_sample_code IS NOT NULL)))), UNIQUE(cup_uuid,direct_generation)');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const keys=(v,s)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===s.split(',').sort().join(',');
const fail=codec.fail;
function decode(json,digest){let v;try{v=JSON.parse(json);if(canonicalize(v)!==json||sha256(json)!==digest)fail();}catch{fail();}return v;}
function drawer(v){if(!keys(v,'coffeeNameOrigin,process,cupNumber,cuppingMode')||typeof v.coffeeNameOrigin!=='string'||!v.coffeeNameOrigin.trim()||v.coffeeNameOrigin.length>2048||typeof v.process!=='string'||!/^\d+$/.test(v.process)||Number(v.process)<1||Number(v.process)>23||!Number.isInteger(v.cupNumber)||v.cupNumber<1||v.cupNumber>8||!['blind','open'].includes(v.cuppingMode))fail();return v;}
function attemptSummary(v){if(!keys(v,'attemptId,code,metadataHash,bytesHash')||!validActor(v.attemptId)||!validCode(v.code)||!hash(v.metadataHash)||!hash(v.bytesHash))fail();return v;}
function validateAttempt(p){const a=p.attempt;if(!keys(a,'attemptId,code,candidate,saveInput,frozen')||!validActor(a.attemptId)||!validCode(a.code))fail();codec.validateAssignment(p.original,a.frozen);
 const c=a.candidate,m=validateMetadata(a.frozen.payload);
 if(!c||!validActor(c.id)||canonicalize(pendingSampleFields(c))!==canonicalize(c)||c.cupUUID!==p.original.uid||c.sampleCode!==a.code||!Number.isSafeInteger(c.sampleNumber)||c.sampleNumber<1||!['blind','open'].includes(c.cuppingMode)||![1,2].includes(c.cuppingForm)||c.cuppingForm===2&&c.cuppingMode!=='open'||typeof c.process!=='string'||!/^\d+$/.test(c.process)||m.z!==a.code||m.u!==p.destinationId||m.y!==c.cupNumber||m.f!==c.cuppingForm||m.m!==(c.cuppingMode==='blind'?'b':'o')||m.n!==c.coffeeNameOrigin||m.p!==Number(c.process)||!a.saveInput||canonicalize(pendingSaveInput(a.saveInput))!==canonicalize(a.saveInput)||a.saveInput.sessionUUID!==p.destinationId||a.saveInput.existingSessionId!==p.destinationId||a.saveInput.intent!=='setup'||a.saveInput.cuppingForm!==c.cuppingForm||c.cuppingForm===2&&a.saveInput.cuppingMode!=='open'||typeof a.saveInput.sessionName!=='string'||!a.saveInput.sessionName.trim()||typeof a.saveInput.sessionDate!=='string'||!Array.isArray(a.saveInput.samples)||a.saveInput.samples.filter(s=>s.id===c.id&&canonicalize(s)===canonicalize(c)).length!==1||a.saveInput.samples[a.saveInput.samples.length-1]?.id!==c.id||c.sampleNumber!==a.saveInput.samples.length)fail();
 return a;}
function pending(row){if(!row)return null;const json=row.content_json,p=decode(json,row.content_hash);
 if(![1,2].includes(row.format_version)||!keys(p,'version,purpose,revision,destinationId,operationId,actor,incarnation,setupHash,removalGeneration,bindingVector,original,oldBindingHash,eligibility,sourceToken,consentVersion,drawerDraft,attempt,priorAttempts,verification')||p.version!==row.format_version||p.version===1&&p.original?.assignment||p.version===2&&!p.original?.assignment||json.length>(p.version===2?2097152:524288)||p.purpose!=='direct'||!Number.isSafeInteger(p.revision)||p.revision<1||!validSession(p.destinationId)||![p.operationId,p.actor,p.incarnation].every(validActor)||![p.setupHash,p.bindingVector,p.oldBindingHash,p.sourceToken].every(hash)||!Number.isSafeInteger(p.removalGeneration)||p.removalGeneration<0||!['known_creator_complete','unknown_override'].includes(p.eligibility)||p.consentVersion!==1||!['consented','write_check','write_verified'].includes(row.phase))fail();
 codec.original(p.original);drawer(p.drawerDraft);if(p.eligibility==='known_creator_complete'&&!codec.metadata(p.original))fail();
 if(p.oldBindingHash!==codec.bindingHash(p.original)||row.destination_session_id!==p.destinationId||row.operation_id!==p.operationId||row.actor_id!==p.actor||row.destination_incarnation!==p.incarnation||row.cup_uuid!==p.original.uid||!Array.isArray(p.priorAttempts)||p.priorAttempts.length>1296)fail();
 const seen=new Set();for(const a of p.priorAttempts){attemptSummary(a);if(seen.has(a.code)||seen.has(a.attemptId))fail();seen.add(a.code);seen.add(a.attemptId);}
 if(row.phase==='consented'){if(p.attempt!==null||p.verification!==null||p.priorAttempts.length)fail();}
 else{validateAttempt(p);if(seen.has(p.attempt.code)||seen.has(p.attempt.attemptId))fail();if(row.phase==='write_verified'){if(!keys(p.verification,'readHash,at,bytesHash,attemptId')||!hash(p.verification.readHash)||!time(p.verification.at)||p.verification.bytesHash!==p.attempt.frozen.bytesHash||p.verification.attemptId!==p.attempt.attemptId)fail();}else if(p.verification!==null)fail();}
 return {...p,phase:row.phase};}
const row=(db,id)=>db.getFirstAsync('SELECT * FROM local_pending_direct_reassignments WHERE destination_session_id=?',[id]);
async function write(db,p,phase){const {phase:old,...v}=p,prior=pending(await row(db,p.destinationId));if(prior&&(prior.operationId!==p.operationId||prior.revision!==p.revision||prior.version!==p.version))fail();v.revision=(prior?.revision||0)+1;const json=canonicalize(v);if(json.length>(v.version===2?2097152:524288))fail();
 await db.runAsync(`INSERT INTO local_pending_direct_reassignments VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(destination_session_id) DO UPDATE SET phase=excluded.phase,content_json=excluded.content_json,content_hash=excluded.content_hash`,[v.destinationId,v.operationId,v.actor,v.incarnation,v.original.uid,v.version,phase,json,sha256(json)]);return pending(await row(db,v.destinationId));}
async function assertNone(db,id=null,uid=null,except=null){for(const r of await db.getAllAsync('SELECT * FROM local_pending_direct_reassignments')){const p=pending(r);if(p.operationId!==except&&(p.destinationId===id||p.original.uid===uid))fail();}}
async function receipts(db,legacy){const rows=await db.getAllAsync('SELECT * FROM local_direct_reassignment_receipts ORDER BY cup_uuid,direct_generation'),byUid=new Map();return rows.map(row=>{
 const r=decode(row.receipt_json,row.receipt_hash),old=legacy.filter(v=>v.uid===r.uid),prior=byUid.get(r.uid)||[];
 const opaque=r.version===2;
 if(opaque){if(!hash(r.oldAssignmentHash)||row.old_assignment_hash!==r.oldAssignmentHash||r.eligibility==='known_creator_complete'&&r.oldMetadataHash===null||!((r.oldSession===null&&r.oldCode===null&&r.oldMetadataHash===null)||(validSession(r.oldSession)&&validCode(r.oldCode)&&hash(r.oldMetadataHash))))fail();}
 else if(row.old_assignment_hash!==null||!validSession(r.oldSession)||!validCode(r.oldCode)||!hash(r.oldMetadataHash))fail();
 if(![1,2].includes(row.format_version)||r.version!==row.format_version||!keys(r,'version,purpose,operationId,actor,destinationId,incarnation,setupHash,postSetupHash,savedSampleCount,removalGeneration,verifiedRevision,uid,kind,settings,oldSession,oldCode,oldMetadataHash,oldBindingHash,sampleId,code,attemptId,newMetadataHash,bytesHash,eligibility,consentVersion,readHash,at,generation,priorLegacyOps,priorVector'+(opaque?',oldAssignmentHash':''))||r.purpose!=='direct'||![r.operationId,r.actor,r.incarnation,r.sampleId,r.attemptId].every(validActor)||!validSession(r.destinationId)||!validCode(r.code)||typeof r.uid!=='string'||!/^[A-Z0-9]+$/.test(r.uid)||![r.setupHash,r.postSetupHash,r.oldBindingHash,r.newMetadataHash,r.bytesHash,r.readHash,r.priorVector].every(hash)||!Number.isSafeInteger(r.savedSampleCount)||r.savedSampleCount<1||!time(r.at)||!Number.isSafeInteger(r.removalGeneration)||r.removalGeneration<0||!Number.isSafeInteger(r.verifiedRevision)||r.verifiedRevision<1||r.generation!==prior.length+1||!['known_creator_complete','unknown_override'].includes(r.eligibility)||r.consentVersion!==1||!Array.isArray(r.priorLegacyOps)||r.priorLegacyOps.length>old.length||r.priorLegacyOps.some((op,i)=>op!==old[i].operationId)||prior.length&&r.priorLegacyOps.length<prior[prior.length-1].priorLegacyOps.length)fail();
 if(r.kind==='ntag'){if(r.settings!==null)fail();}else if(r.kind==='smart'){require('./sampleCodeProfile').validateSettings(r.settings);}else fail();
 if(r.oldBindingHash!==sha256(canonicalize(opaque?{version:2,uid:r.uid,kind:r.kind,assignmentHash:r.oldAssignmentHash}:{uid:r.uid,kind:r.kind,metadataHash:r.oldMetadataHash}))||r.priorVector!==vector(old.slice(0,r.priorLegacyOps.length),prior)||row.operation_id!==r.operationId||row.actor_id!==r.actor||row.destination_session_id!==r.destinationId||row.destination_incarnation!==r.incarnation||row.cup_uuid!==r.uid||row.direct_generation!==r.generation||row.old_session_reference!==r.oldSession||row.old_sample_code!==r.oldCode||row.old_binding_hash!==r.oldBindingHash||row.new_sample_id!==r.sampleId||row.new_sample_code!==r.code||row.attempt_id!==r.attemptId)fail();
 prior.push(r);byUid.set(r.uid,prior);return r;
 });}
function vector(legacy,direct){return sha256(canonicalize({legacy:legacy.map(r=>({op:r.operationId,hash:sha256(canonicalize(r))})),direct:direct.map(r=>({op:r.operationId,hash:sha256(canonicalize(r))}))}));}
const safe=p=>p?{purpose:'direct',destinationId:p.destinationId,operationId:p.operationId,phase:p.phase,revision:p.revision,drawerDraft:{...p.drawerDraft},candidate:p.attempt?{...p.attempt.candidate}:null}:null;
module.exports={SCHEMA,V3_SCHEMA,fail,hash,time,keys,drawer,decode,pending,row,write,assertNone,receipts,vector,safe,attemptSummary,validateAttempt};
