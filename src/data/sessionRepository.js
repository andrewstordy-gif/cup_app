import { getLocalDatabase } from "./localDatabase";
import { getLocalProfileIdentity, getOrCreateLocalProfileIdentity } from "./userProfileRepository";
import { generateDomainId } from "../utils/secureIdentifiers";
import { validCode, validSession, reserveWithDb, validateMetadata, parseMetadata, metadataMatches, wireProof } from './sampleCodeProfile';
import { assertNoPendingWithDb as assertNoAdditionWithDb, decodePending, pendingRowWithDb, pendingSaveInput,
  pendingSampleFields, stagePendingWithDb } from './pendingSampleAdditionStore';
import { assertNoRemoval, pendingRemovalRow, decodeRemoval, writeRemoval, validVerification } from './pendingDraftRemovalStore';
import { readRemovalTag, freezeClear, compareRemovalRead, hardwareUid } from './draftSampleRemovalCodec';
import { fail as tastingFail, validActor, contextToken, stateWithDb as tastingStateWithDb,
  assertUnstartedWithDb, startWithDb as startTastingWithDb, hasStartedWithDb,
  persistHistoryWithDb, historyWithDb, revisionWithDb, commitRevisionWithDb, semanticSource, hasScoreOrNote,
  streamWithDb, writeStreamWithDb, adoptionDuplicateWithDb, completeWithDb as completeTastingWithDb } from './localTastingState';
import { formIdentity, isPinnedForm, requireFormTag, requireTagCuppingMode } from "../features/forms/sessionFormRoute";
import { PROFILE, validateResponse, scoreResponse } from "../features/forms/contract";
import { canonicalize, sha256 } from '../features/forms/contract/canonical';
import { readWithDb as readCanonicalCva, saveWithDb as saveCanonicalCva,
  statusesWithDb as canonicalCvaStatuses, closeWithDb as closeCanonicalCva } from '../features/cupping/data/cvaResponseStore';
import { RATINGS, createCvaDraft, cvaUiMasks, cvaNoteGroups } from '../features/cupping/data/cvaResponse';
import { tokenizeFlavourKeywords } from '../features/cupping/data/flavourKeywords';
import { CVA_SCORED_DEFECT_POLICY, getCvaScoredDefectSlots } from "../features/cupping/data/cvaDefectPolicy";
import { CVA_EXACT_CALCULATION_POLICY, CVA_UNKNOWN_CALCULATION_MESSAGE,
  calculateCvaScore, cvaResultLabel, isSupportedCvaCalculationPolicy } from "../features/cupping/data/cvaScoreCalculation";
import {
  getSessionDateLabel,
  getSessionTypeLabel,
  normalizeCuppingModeKey,
  normalizePositiveInteger,
  buildCompactSessionMetadata,
  normalizeProcessKey,
} from "../features/cupping/constants/sessionDetails";

function generateId() {
  return generateDomainId();
}

async function assertNoPendingWithDb(db,sessionId) {
  await assertNoAdditionWithDb(db,sessionId);
  await assertNoRemoval(db,sessionId);
}

const SETUP_PERMISSION_ERROR = "Only the local profile that created this session can manage its setup.";

async function assertLocalCreatorWithDb(db, sessionId) {
  const profileId = await getLocalProfileIdentity();
  const row = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?', [sessionId]);
  if (!profileId || !row?.creator || row.creator !== profileId) throw new Error(SETUP_PERMISSION_ERROR);
}

async function setupLockWithDb(db, sessionId) {
  const row = await db.getFirstAsync('SELECT local_setup_locked_at AS at, local_setup_lock_snapshot AS snapshot FROM sessions WHERE id=?', [sessionId]);
  if (!row) throw new Error('Session setup is unavailable.');
  if (row.at == null && row.snapshot == null) return null;
  if (typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at)) || new Date(row.at).toISOString() !== row.at ||
      typeof row.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(row.snapshot)) throw new Error('Session setup lock is unavailable.');
  return row;
}

async function assertSetupUnlockedWithDb(db, sessionId) {
  if (await setupLockWithDb(db, sessionId)) throw new Error('This session is locked. Its setup cannot be changed.');
}

// Creator Locks and separately proven participant scans enroll distinct local
// selections. Response presence alone is never evidence of a tasting scan.
const selectionTables = policy => policy?.kind === 'participant' ? {
  activations:'local_participant_sample_activations', removals:'local_participant_sample_removals',
  completions:'local_participant_tasting_completion_events', binding:'binding_snapshot',
} : {activations:'local_creator_sample_activations',removals:'local_creator_sample_removals',
  completions:'local_creator_tasting_completion_events',binding:'lock_snapshot'};

const validSelectionTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function participantBinding(session, actor, incarnation) {
  return sha256(canonicalize(['participant-selection-v1',session.id,actor,incarnation,
    session.cuppingForm,session.formKey,session.formVersion,session.formHash]));
}

async function participantActivationWithDb(db,sessionId) {
  const enrollment=await db.getFirstAsync('SELECT * FROM local_participant_tasting_enrollments WHERE session_id=?',[sessionId]);
  if(!enrollment)return null;
  const session=await db.getFirstAsync(`SELECT id,local_creator_profile_id AS creator,status,cupping_form AS cuppingForm,
    form_key AS formKey,form_version AS formVersion,form_hash AS formHash,cupping_mode AS mode FROM sessions WHERE id=?`,[sessionId]);
  if(!session||session.creator!==null||!validActor(enrollment.local_profile_id)||!validActor(enrollment.incarnation)||
    !validSelectionTime(enrollment.enrolled_at)||!['pending','in_progress','complete'].includes(session.status)||
    !isActiveFormPin(session,session.cuppingForm)||!validSession(sessionId)||
    enrollment.binding_snapshot!==participantBinding(session,enrollment.local_profile_id,enrollment.incarnation))tastingFail('tasting:damaged_activation');
  const samples=await db.getAllAsync('SELECT id,sample_code AS code FROM samples WHERE session_id=?',[sessionId]);
  const rows=await db.getAllAsync('SELECT *,binding_snapshot AS lock_snapshot FROM local_participant_sample_activations WHERE session_id=?',[sessionId]);
  for(const row of rows)if(row.local_profile_id!==enrollment.local_profile_id||row.binding_snapshot!==enrollment.binding_snapshot||
    !validCode(row.sample_code)||!samples.some(sample=>sample.id===row.sample_id&&sample.code===row.sample_code)||!validSelectionTime(row.scanned_at))tastingFail('tasting:damaged_activation');
  // "creator" here is the existing internal selection-owner slot, not session
  // ownership. UI/setup authority always reads immutable sessions provenance.
  return {...session,kind:'participant',creator:enrollment.local_profile_id,snapshot:enrollment.binding_snapshot,rows};
}

// Only an actual validated code scan can enroll an imported local copy. Old
// scores alone never establish discovery, ownership or active membership.
async function enrollParticipantWithDb(db,sessionId,actor) {
  const prior=await participantActivationWithDb(db,sessionId);
  if(prior){if(prior.creator!==actor)tastingFail('tasting:foreign_activation');return prior;}
  const session=await getSessionByIdWithDb(db,sessionId);
  const provenance=await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id=?',[sessionId]);
  if(provenance?.creator!==null||!validActor(actor)||!validSession(sessionId)||!isActiveFormPin(session,session.cuppingForm)||
    !['pending','in_progress','complete'].includes(session.status)||!session.samples.length||
    session.cuppingMode!=null&&!['open','blind'].includes(session.cuppingMode)||session.cuppingForm===2&&session.cuppingMode!=='open')tastingFail('tasting:unavailable');
  const revision=await revisionWithDb(db,sessionId,actor);
  if(!revision.matches||await db.getFirstAsync('SELECT local_profile_id FROM local_tasting_revisions WHERE session_id=? AND local_profile_id<>? LIMIT 1',[sessionId,actor]))tastingFail('tasting:foreign_stream');
  if(session.status==='complete'&&!(await tastingStateWithDb(db,sessionId,actor)).completed)tastingFail('tasting:damaged_completion');
  for(const sample of session.samples){
    const metadata=parseMetadata(sample.metadataJson);
    if(sample.cuppingForm!==session.cuppingForm||!validCode(sample.sampleCode)||metadata.z!==sample.sampleCode||
      !Number.isInteger(sample.cupNumber)||sample.cupNumber<1||sample.cupNumber>8||!['open','blind'].includes(sample.cuppingMode)||
      session.cuppingForm===2&&sample.cuppingMode!=='open'||
      !metadataMatches(metadata,buildCompactSessionMetadata({...sample,sessionUUID:sessionId,sessionName:session.sessionName,
        sessionType:session.sessionType,sessionDate:session.sessionDate,samplesInSession:metadata.i}))||
      !await db.getFirstAsync('SELECT code FROM physical_code_observations WHERE session_id=? AND code=? AND physical_uid=?',[sessionId,sample.sampleCode,sample.cupUUID]))tastingFail('tasting:unproven_scan');
    const access=await streamWithDb(db,sessionId,sample.id,session.cuppingForm,actor);
    if(!['fresh','mine'].includes(access.state))tastingFail('tasting:foreign_stream');
    const tables=['sample_feedback_entries','sample_defect_entries','sample_flavour_observations','cva_response_revisions','legacy_responses','local_response_streams'];
    if(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_feedback'"))tables.push('sample_feedback');
    for(const table of tables){
      if(await db.getFirstAsync(`SELECT sample_id FROM ${table} WHERE sample_id=? AND (session_id IS NULL OR session_id<>?) LIMIT 1`,[sample.id,sessionId])||
        access.state==='fresh'&&['sample_feedback_entries','sample_defect_entries','sample_flavour_observations','sample_feedback'].includes(table)&&
        await db.getFirstAsync(`SELECT sample_id FROM ${table} WHERE sample_id=? LIMIT 1`,[sample.id]))tastingFail('tasting:unproven_scan');
    }
    if(access.source){if(session.cuppingForm===1)await readCanonicalCva(db,sessionId,sample.id);else await getLegacyResponseWithDb(db,sessionId,sample.id);}
    const recovery=await db.getAllAsync('SELECT * FROM local_legacy_recovery_drafts WHERE sample_id=?',[sample.id]);
    for(const row of recovery){
      if(row.local_profile_id!==actor||row.session_id!==sessionId||session.cuppingForm!==2||!validSelectionTime(row.updated_at)||
        row.base_fingerprint!==await legacyFingerprintWithDb(db,sessionId,sample.id,actor)||
        row.context_json!==canonicalize({sessionId,sampleId:sample.id,pin:trustedLegacySession(session).identity,count:sample.cupNumber}))tastingFail('tasting:damaged_draft');
      try{const response=JSON.parse(row.response_json);if(canonicalize(response)!==row.response_json||
        !validateResponse({...trustedLegacySession(session),cup_count:sample.cupNumber,response,complete:false},trustedLegacySession(session)).ok)tastingFail('tasting:damaged_draft');}
      catch{tastingFail('tasting:damaged_draft');}
    }
  }
  const incarnation=generateId(),snapshot=participantBinding(session,actor,incarnation),now=new Date().toISOString();
  await requireSameTastingActor(actor);
  await db.runAsync('INSERT INTO local_participant_tasting_enrollments(session_id,local_profile_id,incarnation,binding_snapshot,enrolled_at) VALUES (?,?,?,?,?)',[sessionId,actor,incarnation,snapshot,now]);
  for(const sample of session.samples)await db.runAsync('INSERT INTO local_participant_sample_activations(session_id,local_profile_id,sample_id,sample_code,binding_snapshot,scanned_at) VALUES (?,?,?,?,?,?)',[sessionId,actor,sample.id,sample.sampleCode,snapshot,now]);
  return participantActivationWithDb(db,sessionId);
}

async function creatorActivationWithDb(db, sessionId) {
  const session = await db.getFirstAsync(`SELECT local_creator_activation_policy AS policy,
    local_creator_profile_id AS creator, local_setup_lock_snapshot AS snapshot,
    status, cupping_form AS cuppingForm, form_key AS formKey, form_version AS formVersion,
    form_hash AS formHash FROM sessions WHERE id=?`, [sessionId]);
  if (!session || session.policy == null) return participantActivationWithDb(db,sessionId);
  if (session.policy !== 1 || !validActor(session.creator) || !['pending', 'in_progress', 'complete'].includes(session.status) ||
      !isActiveFormPin(session, session.cuppingForm) || !(await setupLockWithDb(db, sessionId))) tastingFail('tasting:damaged_activation');
  const samples = await db.getAllAsync('SELECT id,sample_code AS code FROM samples WHERE session_id=?', [sessionId]);
  const rows = await db.getAllAsync('SELECT * FROM local_creator_sample_activations WHERE session_id=?', [sessionId]);
  for (const row of rows) {
    if (row.local_profile_id !== session.creator || row.lock_snapshot !== session.snapshot ||
        !validCode(row.sample_code) || !samples.some(sample => sample.id === row.sample_id && sample.code === row.sample_code) ||
        typeof row.scanned_at !== 'string' || !Number.isFinite(Date.parse(row.scanned_at)) ||
        new Date(row.scanned_at).toISOString() !== row.scanned_at) tastingFail('tasting:damaged_activation');
  }
  return { ...session, rows };
}

function creatorTargetActive(policy, actor, sampleId) {
  return !policy || policy.creator === actor && policy.rows.some(row => row.sample_id === sampleId);
}

async function assertCreatorTargetActiveWithDb(db, sessionId, sampleId, actor) {
  const policy = await creatorActivationWithDb(db, sessionId);
  if (!creatorTargetActive(policy, actor, sampleId)) tastingFail('tasting:scan_to_activate');
  return policy;
}

// Removal epochs survive deactivation. In particular, a Legacy blank response
// must not have the same optimistic-write identity before and after removal.
async function creatorRemovalGenerationWithDb(db, sessionId, sampleId, actor, policy = undefined) {
  if (policy === undefined) policy = await creatorActivationWithDb(db, sessionId);
  if (!policy) return null;
  if (policy.creator !== actor) tastingFail('tasting:foreign_activation');
  const sample = await db.getFirstAsync('SELECT sample_code AS code FROM samples WHERE session_id=? AND id=?', [sessionId, sampleId]);
  if (!sample || !validCode(sample.code)) tastingFail('tasting:damaged_activation');
  const tables=selectionTables(policy);
  const rows = await db.getAllAsync(`SELECT *,${tables.binding} AS lock_snapshot FROM ${tables.removals} WHERE session_id=? AND sample_id=?`, [sessionId, sampleId]);
  if (rows.length > 1) tastingFail('tasting:damaged_removal');
  const row = rows[0];
  if (!row) return 0;
  if (row.local_profile_id !== actor || row.sample_code !== sample.code || row.lock_snapshot !== policy.snapshot ||
      !Number.isSafeInteger(row.generation) || row.generation < 1 || typeof row.removed_at !== 'string' ||
      !Number.isFinite(Date.parse(row.removed_at)) || new Date(row.removed_at).toISOString() !== row.removed_at) tastingFail('tasting:damaged_removal');
  return row.generation;
}

async function creatorHasSavedScoreWithDb(db, sessionId, form) {
  const selected=await creatorStatusesWithDb(db,sessionId);
  if (selected) return Object.values(selected).some(value=>value.hasAnyFeedback);
  if (form === 1) return Object.values(await canonicalCvaStatuses(db, sessionId)).some(value => value.hasAnyFeedback);
  const samples = await db.getAllAsync('SELECT id FROM samples WHERE session_id=?', [sessionId]);
  for (const sample of samples) {
    const saved = await getLegacyResponseWithDb(db, sessionId, sample.id);
    if (Object.values(saved.response?.quality_ratings || {}).some(value => value != null)) return true;
  }
  return false;
}

async function creatorStatusesWithDb(db,sessionId,policy=undefined,actor=undefined) {
  if (policy===undefined) policy=await creatorActivationWithDb(db,sessionId);
  if (!policy) return null;
  if (actor===undefined) actor=await getLocalProfileIdentity();
  await requireSameTastingActor(actor);
  if(policy.kind==='participant'&&policy.creator!==actor)tastingFail('tasting:foreign_activation');
  const samples=await db.getAllAsync('SELECT id FROM samples WHERE session_id=?',[sessionId]),output={};
  for (const sample of samples) {
    output[sample.id]={isComplete:false,finalScore:null,resultLabel:null,hasAnyFeedback:false,scoresByField:{},noteGroups:[]};
    if (!creatorTargetActive(policy,actor,sample.id)) continue;
    const saved=policy.cuppingForm===1 ? await readCanonicalCva(db,sessionId,sample.id) : await getLegacyResponseWithDb(db,sessionId,sample.id);
    output[sample.id]={isComplete:Boolean(saved.complete&&saved.result?.ok),finalScore:saved.result?.display_score??null,resultLabel:saved.result?.label??null,
      hasAnyFeedback:Object.values(policy.cuppingForm===1?saved.response?.ratings||{}:saved.response?.quality_ratings||{}).some(value=>value!=null),
      scoresByField:policy.cuppingForm===1?Object.fromEntries(Object.entries(RATINGS).filter(([,key])=>saved.response?.ratings?.[key]!=null).map(([label,key])=>[label,saved.response.ratings[key]])):{},
      noteGroups:policy.cuppingForm===1?cvaNoteGroups(saved.response):[],...(policy.cuppingForm===1?{canonicalCva:true,revision:saved.revision}:{})};
  }
  await requireSameTastingActor(actor);
  return output;
}

// Additive completion coverage: the existing full-roster aggregate/revision
// stays byte-for-byte compatible with previously saved results and recovery.
async function creatorCompletionWithDb(db, sessionId, actor, prior = null) {
  const policy = await creatorActivationWithDb(db,sessionId);
  if (!policy) return null;
  if(policy.kind==='participant'&&policy.creator!==actor)tastingFail('tasting:foreign_activation');
  const state = prior || await tastingStateWithDb(db,sessionId,actor);
  if (!validActor(actor) || policy.creator !== actor) return {...state,completed:false,revealed:false,completedAt:null,contextToken:null,activeSelection:true,activeCount:0};
  const session = await getSessionByIdWithDb(db,sessionId);
  if (session.cuppingMode != null && !['open','blind'].includes(session.cuppingMode) ||
      session.cuppingForm === 2 && session.cuppingMode !== 'open' ||
      session.samples.some(sample => sample.cuppingForm !== session.cuppingForm || !['open','blind'].includes(sample.cuppingMode) ||
        session.cuppingForm === 2 && sample.cuppingMode !== 'open' || !Number.isInteger(sample.cupNumber) || sample.cupNumber < 1 || sample.cupNumber > 8 || !validCode(sample.sampleCode))) tastingFail('tasting:unsupported');
  const active = [],known=[];
  for (const sample of session.samples) {
    const generation = await creatorRemovalGenerationWithDb(db,sessionId,sample.id,actor,policy);
    known.push({id:sample.id,code:sample.sampleCode,generation});
    const activation = policy.rows.find(row=>row.sample_id===sample.id);
    if (activation) active.push({id:sample.id,code:sample.sampleCode,generation,scannedAt:activation.scanned_at});
  }
  active.sort((a,b)=>a.id.localeCompare(b.id));
  known.sort((a,b)=>a.id.localeCompare(b.id));
  const base = await revisionWithDb(db,sessionId,actor);
  if (!base.matches) tastingFail('tasting:stale_content');
  const snapshot = {schema:1,actor,sessionId,lockSnapshot:policy.snapshot,baseSavedRevision:base.revision,baseContentHash:base.hash,known,active};
  const json = canonicalize(snapshot), hash = sha256(json);
  const events = await db.getAllAsync(`SELECT * FROM ${selectionTables(policy).completions} WHERE session_id=? AND local_profile_id=? ORDER BY id`,[sessionId,actor]);
  let matching = null;
  for (const event of events) {
    let saved;
    try { saved=JSON.parse(event.snapshot_json); if (canonicalize(saved)!==event.snapshot_json) tastingFail('tasting:damaged_completion'); }
    catch { tastingFail('tasting:damaged_completion'); }
    if (event.schema_version!==1 || sha256(event.snapshot_json)!==event.snapshot_hash || saved.schema!==1 || saved.actor!==actor ||
        saved.sessionId!==sessionId || saved.lockSnapshot!==policy.snapshot || !Number.isSafeInteger(saved.baseSavedRevision) || saved.baseSavedRevision<1 ||
        typeof saved.baseContentHash!=='string' || !/^[a-f0-9]{64}$/.test(saved.baseContentHash) || !Array.isArray(saved.active) || !saved.active.length ||
        !Array.isArray(saved.known) || (policy.kind!=='participant'&&saved.known.length!==session.samples.length) ||
        policy.kind==='participant'&&(!saved.known.length||saved.active.some(sample=>!sample||!saved.known.some(row=>row&&row.id===sample.id&&row.code===sample.code&&row.generation===sample.generation))) || saved.known.some((sample,index)=>!sample ||
          !session.samples.some(row=>row.id===sample.id&&row.sampleCode===sample.code) || !Number.isSafeInteger(sample.generation)||sample.generation<0 ||
          index>0&&saved.known[index-1].id.localeCompare(sample.id)>=0) ||
        typeof event.completed_at!=='string' || !Number.isFinite(Date.parse(event.completed_at)) || new Date(event.completed_at).toISOString()!==event.completed_at ||
        saved.active.some((sample,index)=>!sample || typeof sample.id!=='string' || !session.samples.some(row=>row.id===sample.id&&row.sampleCode===sample.code) ||
          !Number.isSafeInteger(sample.generation)||sample.generation<0 || typeof sample.scannedAt!=='string' || !Number.isFinite(Date.parse(sample.scannedAt)) ||
          new Date(sample.scannedAt).toISOString()!==sample.scannedAt || index>0&&saved.active[index-1].id.localeCompare(sample.id)>=0)) tastingFail('tasting:damaged_completion');
    if (event.snapshot_hash===hash && event.snapshot_json===json) matching=event;
  }
  // A pre-update, valid full-roster completion remains readable without a
  // backfill. Once new evidence exists, it must never fall back to old reveal.
  const oldComplete = !events.length && state.completed && active.length===session.samples.length && active.length>0 &&
    (policy.kind!=='participant'||known.every(sample=>sample.generation===0));
  const completed = Boolean(matching||oldComplete);
  return {...state,completed,revealed:completed,completedAt:matching?.completed_at||(oldComplete?state.completedAt:null),
    contextToken:sha256(canonicalize(['creator-active-completion-v1',actor,sessionId,base.revision,base.hash,hash])),
    activeSelection:true,activeCount:active.length,snapshot,json,hash,base};
}

// Read-only readiness proof. Each member retains its own original on-tag total.
async function lockSnapshotWithDb(db, sessionId, actor, removal = false) {
  await assertLocalCreatorWithDb(db, sessionId);
  await assertSetupUnlockedWithDb(db, sessionId);
  await assertUnstartedWithDb(db, sessionId);
  if(removal)await assertNoAdditionWithDb(db,sessionId);
  else await assertNoPendingWithDb(db, sessionId);
  await creatorActivationWithDb(db, sessionId);
  const setup = await getSessionByIdWithDb(db, sessionId, { reconcile: false });
  if (setup.status !== 'new' || !setup.samples.length ||
      !isActiveFormPin(setup, setup.cuppingForm) || ![1, 2].includes(setup.cuppingForm) ||
      setup.cuppingMode != null && !['open', 'blind'].includes(setup.cuppingMode) ||
      setup.cuppingForm === 2 && setup.cuppingMode !== 'open') throw new Error('Save a verified draft before locking this session.');
  const issuer = await db.getFirstAsync('SELECT actor_id,incarnation,profile FROM sample_code_issuers WHERE session_id=?', [sessionId]);
  if (issuer?.actor_id !== actor || issuer.profile !== 103 || !issuer.incarnation) throw new Error('Session verification is unavailable.');
  const members = [];
  for (const sample of setup.samples) {
    if (!validCode(sample.sampleCode) || !Number.isInteger(sample.cupNumber) || sample.cupNumber < 1 || sample.cupNumber > 8 ||
        !['blind', 'open'].includes(sample.cuppingMode) || setup.cuppingForm === 2 && sample.cuppingMode !== 'open') throw new Error('Session verification is unavailable.');
    const metadata = parseMetadata(sample.metadataJson);
    const intended = buildCompactSessionMetadata({ ...sample, sessionUUID: sessionId, sessionName: setup.sessionName,
      sessionType: setup.sessionType, sessionDate: setup.sessionDate, samplesInSession: metadata.i });
    if (sample.cuppingForm !== setup.cuppingForm || !metadataMatches(metadata, intended)) throw new Error('Session verification is unavailable.');
    const proof = await db.getFirstAsync(`SELECT issued.operation_id, committed.actor_id, committed.outcome_json
      FROM issued_sample_codes issued JOIN sample_code_commit_outcomes committed
      ON committed.session_id=issued.session_id AND committed.operation_id=issued.operation_id
      WHERE issued.session_id=? AND issued.code=?`, [sessionId, sample.sampleCode]);
    let outcome; try { outcome = JSON.parse(proof?.outcome_json); } catch { /* fail closed */ }
    if (proof?.actor_id !== actor || outcome?.sessionId !== sessionId || !Number.isInteger(outcome.savedSampleCount) ||
        outcome.savedSampleCount < 1 || outcome.status !== 'new') throw new Error('Session verification is unavailable.');
    members.push({ ...sample, operationId: proof.operation_id });
  }
  const { status, updatedAt, ...savedSetup } = setup;
  return sha256(canonicalize({ ...savedSetup, samples: members, incarnation: issuer.incarnation, actor }));
}

export async function getSessionLockReadiness(sessionId) {
  const db = await getLocalDatabase(), actor = await getLocalProfileIdentity();
  let snapshot;
  await db.withExclusiveTransactionAsync(async txn => {
    snapshot = await lockSnapshotWithDb(txn, sessionId, actor);
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  return { sessionId, snapshot };
}

// Physical setup removal is deliberately separate from tasting removal. A
// durable verified read, never a write callback, authorizes this one deletion.
const removalFail=()=>{throw new Error('removal:context_changed');};
function assertRemovalReadCurrent(check){if(check==null)return;let current=false;try{current=typeof check==='function'&&check()===true;}catch{ /* revoked */ }if(!current)removalFail();}
async function removalReceiptsWithDb(db,sessionId,actor,incarnation){
  const rows=await db.getAllAsync('SELECT * FROM local_draft_removal_receipts WHERE session_id=? ORDER BY generation',[sessionId]);
  for(let i=0;i<rows.length;i++){
    const row=rows[i];let value;try{value=JSON.parse(row.receipt_json);}catch{removalFail();}
    if(!value||Object.keys(value).sort().join(',')!=='actor,additionOperationId,bytesHash,code,generation,incarnation,operationId,sampleId,schema,sessionId,verification'||value.schema!==1||
      !validSession(value.sessionId)||![value.actor,value.incarnation,value.operationId,value.sampleId,value.additionOperationId].every(validActor)||
      !validCode(value.code)||!validVerification(value.verification,value.bytesHash)||
      row.actor_id!==actor||row.issuer_incarnation!==incarnation||row.generation!==i+1||
      canonicalize(value)!==row.receipt_json||sha256(row.receipt_json)!==row.receipt_hash||
      value.sessionId!==sessionId||value.actor!==actor||value.incarnation!==incarnation||value.generation!==row.generation||
      value.operationId!==row.operation_id||value.sampleId!==row.sample_id||value.code!==row.sample_code||
      value.additionOperationId!==row.addition_operation_id)removalFail();
    const proof=await db.getFirstAsync(`SELECT i.operation_id,c.actor_id FROM issued_sample_codes i JOIN sample_code_commit_outcomes c
      ON c.session_id=i.session_id AND c.operation_id=i.operation_id WHERE i.session_id=? AND i.code=?`,[sessionId,value.code]);
    if(proof?.operation_id!==value.additionOperationId||proof.actor_id!==actor)removalFail();
  }
  return rows;
}
async function removalContextWithDb(db,sessionId,actor){
  const snapshot=await lockSnapshotWithDb(db,sessionId,actor,true);
  const setup=await getSessionByIdWithDb(db,sessionId,{reconcile:false});
  const issuer=await db.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
  const receipts=await removalReceiptsWithDb(db,sessionId,actor,issuer.incarnation);
  // Even a blank saved response/recovery is not an unstarted setup assignment.
  // Check sample ownership from either direction, including malformed children.
  for(const table of ['cva_response_revisions','legacy_responses','sample_feedback_entries','sample_defect_entries',
    'sample_flavour_observations','local_response_streams','local_legacy_recovery_drafts','sample_feedback']){
    if(!await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table]))continue;
    if(await db.getFirstAsync(`SELECT 1 FROM ${table} WHERE session_id=? OR sample_id IN (SELECT id FROM samples WHERE session_id=?) LIMIT 1`,[sessionId,sessionId]))removalFail();
  }
  return {snapshot,setup,incarnation:issuer.incarnation,generation:receipts.length+1};
}
async function currentRemovalWithDb(db,sessionId,actor,operationId){
  const pending=decodeRemoval(await pendingRemovalRow(db,sessionId));
  if(!pending||pending.actor!==actor||operationId&&pending.operationId!==operationId)removalFail();
  const current=await removalContextWithDb(db,sessionId,actor);
  if(pending.snapshot!==current.snapshot||pending.incarnation!==current.incarnation||pending.generation!==current.generation||
    !current.setup.samples.some(sample=>sample.id===pending.sampleId&&sample.sampleCode===pending.code&&sample.cupUUID===pending.frozen.uid&&metadataMatches(JSON.parse(sample.metadataJson),pending.frozen.metadata)))removalFail();
  const issued=await db.getFirstAsync('SELECT operation_id FROM issued_sample_codes WHERE session_id=? AND code=?',[sessionId,pending.code]);
  if(issued?.operation_id!==pending.additionOperationId)removalFail();
  return pending;
}
async function removalTransaction(sessionId,operation){
  if(!validSession(sessionId))removalFail();
  const db=await getLocalDatabase(),actor=await getLocalProfileIdentity();let result;
  await db.withExclusiveTransactionAsync(async txn=>{result=await operation(txn,actor);await requireSameTastingActor(actor);});
  await requireSameTastingActor(actor);return result;
}
export async function getDraftSampleRemoval(sessionId){
  return removalTransaction(sessionId,async(db,actor)=>{
    if(!await pendingRemovalRow(db,sessionId))return null;
    return currentRemovalWithDb(db,sessionId,actor);
  });
}
export async function stageDraftSampleRemoval({sessionId,readResult}){
  const frozen=freezeClear(readRemovalTag(readResult));
  return removalTransaction(sessionId,async(db,actor)=>{
    await assertNoRemoval(db,sessionId);
    const current=await removalContextWithDb(db,sessionId,actor);
    const sample=current.setup.samples.find(row=>row.cupUUID===frozen.uid);
    if(!sample||!metadataMatches(JSON.parse(sample.metadataJson),frozen.metadata))removalFail();
    if(await db.getFirstAsync('SELECT session_id FROM local_pending_sample_additions WHERE cup_uuid=?',[frozen.uid]))throw new Error('removal:unfinished');
    const issued=await db.getFirstAsync('SELECT operation_id FROM issued_sample_codes WHERE session_id=? AND code=?',[sessionId,sample.sampleCode]);
    return writeRemoval(db,{schema:1,sessionId,actor,incarnation:current.incarnation,generation:current.generation,
      snapshot:current.snapshot,operationId:generateId(),sampleId:sample.id,code:sample.sampleCode,
      additionOperationId:issued.operation_id,frozen,verification:null},'staged');
  });
}
export async function beginDraftSampleRemovalWrite({sessionId,operationId,expectedBytesHash}){
  return removalTransaction(sessionId,async(db,actor)=>{
    const pending=await currentRemovalWithDb(db,sessionId,actor,operationId);
    if(pending.phase==='verified'||pending.frozen.bytesHash!==expectedBytesHash)removalFail();
    return writeRemoval(db,pending,'writing');
  });
}
export async function markDraftSampleRemovalWritten({sessionId,operationId}){
  return removalTransaction(sessionId,async(db,actor)=>{
    const pending=await currentRemovalWithDb(db,sessionId,actor,operationId);
    if(pending.phase!=='writing')removalFail();return writeRemoval(db,pending,'written');
  });
}
export async function inspectDraftSampleRemovalRead({sessionId,operationId,readResult,isReadCurrent=null}){
  let read=null,uid=null;try{uid=hardwareUid(readResult?.tag);read=readRemovalTag(readResult);}catch{ /* same-UID malformed read revokes prior proof below */ }
  return removalTransaction(sessionId,async(db,actor)=>{
    assertRemovalReadCurrent(isReadCurrent);
    const pending=await currentRemovalWithDb(db,sessionId,actor,operationId);
    assertRemovalReadCurrent(isReadCurrent);
    const disposition=read?compareRemovalRead(pending.frozen,read):'mismatch';
    if(disposition==='cleared'){
      const verified=await writeRemoval(db,{...pending,verification:{bytesHash:pending.frozen.bytesHash,readHash:sha256(canonicalize(read)),at:new Date().toISOString()}},'verified');
      assertRemovalReadCurrent(isReadCurrent);
      return {pending:verified,disposition};
    }
    const uncertain=pending.phase==='verified'&&uid===pending.frozen.uid?await writeRemoval(db,{...pending,verification:null},'writing'):pending;
    assertRemovalReadCurrent(isReadCurrent);
    return {pending:uncertain,disposition};
  });
}
// A different scan entry point may observe a contradiction after verification.
// Commit this observation before the caller rejects its assessment workflow.
export async function observePendingDraftRemovalRead(readResult,{isReadCurrent=null}={}){
  let uid;try{uid=hardwareUid(readResult?.tag);}catch{return false;}
  let capturedRead=null;try{capturedRead=readRemovalTag(readResult);}catch{ /* keep captured UID for malformed contradiction */ }
  const db=await getLocalDatabase(),actor=await getLocalProfileIdentity();
  const row=await db.getFirstAsync('SELECT session_id,operation_id,actor_id FROM local_pending_draft_removals WHERE cup_uuid=?',[uid]);
  if(!row)return false;
  if(row.actor_id!==actor)throw new Error('removal:unfinished');
  await removalTransaction(row.session_id,async(txn,currentActor)=>{
    assertRemovalReadCurrent(isReadCurrent);
    const pending=await currentRemovalWithDb(txn,row.session_id,currentActor,row.operation_id);
    const cleared=Boolean(capturedRead&&compareRemovalRead(pending.frozen,capturedRead)==='cleared');
    assertRemovalReadCurrent(isReadCurrent);
    if(!cleared&&pending.phase==='verified')await writeRemoval(txn,{...pending,verification:null},'writing');
    assertRemovalReadCurrent(isReadCurrent);
  });
  return true;
}
export async function commitDraftSampleRemoval({sessionId,operationId}){
  let acknowledgement;
  const result=await removalTransaction(sessionId,async(db,actor)=>{
    const prior=await db.getFirstAsync('SELECT * FROM local_draft_removal_receipts WHERE session_id=? AND operation_id=?',[sessionId,operationId]);
    if(prior){
      await assertLocalCreatorWithDb(db,sessionId);
      const issuer=await db.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
      await removalReceiptsWithDb(db,sessionId,actor,issuer?.incarnation);
      if(await db.getFirstAsync('SELECT id FROM samples WHERE id=? OR (session_id=? AND sample_code=?)',[prior.sample_id,sessionId,prior.sample_code]))removalFail();
      acknowledgement=prior.receipt_hash;return {sessionId,sampleId:prior.sample_id,removed:true};
    }
    const pending=await currentRemovalWithDb(db,sessionId,actor,operationId);
    if(pending.phase!=='verified')removalFail();
    const receipt={schema:1,sessionId,actor,incarnation:pending.incarnation,generation:pending.generation,
      operationId,sampleId:pending.sampleId,code:pending.code,additionOperationId:pending.additionOperationId,
      bytesHash:pending.frozen.bytesHash,verification:pending.verification};
    const json=canonicalize(receipt);acknowledgement=sha256(json);
    await db.runAsync(`INSERT INTO local_draft_removal_receipts VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [sessionId,operationId,actor,pending.incarnation,pending.generation,pending.sampleId,pending.code,pending.additionOperationId,json,acknowledgement]);
    await db.runAsync('DELETE FROM samples WHERE session_id=? AND id=?',[sessionId,pending.sampleId]);
    await db.runAsync("UPDATE sessions SET samples_in_session=(SELECT COUNT(*) FROM samples WHERE session_id=?),status='new',updated_at=? WHERE id=?",[sessionId,new Date().toISOString(),sessionId]);
    await commitRevisionWithDb(db,sessionId,actor);
    await db.runAsync('DELETE FROM local_pending_draft_removals WHERE session_id=? AND operation_id=?',[sessionId,operationId]);
    return {sessionId,sampleId:pending.sampleId,removed:true};
  });
  // Re-check after commit: a late native/UI acknowledgement cannot refer to a
  // deleted/reimported incarnation, even when the session ID was reused.
  await removalTransaction(sessionId,async(db,actor)=>{
    const issuer=await db.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
    const receipts=await removalReceiptsWithDb(db,sessionId,actor,issuer?.incarnation);
    if(!receipts.some(row=>row.operation_id===operationId&&row.receipt_hash===acknowledgement))removalFail();
  });
  return result;
}

export async function lockSessionSetup({ sessionId, expectedSnapshot }) {
  if (!validSession(sessionId) || typeof expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSnapshot)) throw new Error('Session lock request is unavailable.');
  const db = await getLocalDatabase(), actor = await getLocalProfileIdentity();
  await db.withExclusiveTransactionAsync(async txn => {
    await assertLocalCreatorWithDb(txn, sessionId);
    const locked = await setupLockWithDb(txn, sessionId);
    if (locked) {
      if (locked.snapshot !== expectedSnapshot) throw new Error('Session setup changed. Reopen the session.');
    } else {
      if (await lockSnapshotWithDb(txn, sessionId, actor) !== expectedSnapshot) throw new Error('Session setup changed. Save and try again.');
      await requireSameTastingActor(actor);
      await txn.runAsync("UPDATE sessions SET local_setup_locked_at=?,local_setup_lock_snapshot=?,local_creator_activation_policy=1,status='pending' WHERE id=?", [new Date().toISOString(), expectedSnapshot, sessionId]);
    }
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  return { sessionId, locked: true };
}

export async function getSessionSetupAccess(sessionId) {
  try {
    const presentation = await getLocalTastingPresentation(sessionId, { purpose: 'setup' });
    return { canManageSetup: presentation.tasting.canManageSetup,
      isLocalCreator: presentation.tasting.isLocalCreator, started: presentation.tasting.started };
  } catch { return { canManageSetup: false, isLocalCreator: false, started: true }; }
}

export async function getOwnedSessionSetup(sessionId) {
  const db = await getLocalDatabase();
  const actor = await getLocalProfileIdentity();
  let result;
  await db.withExclusiveTransactionAsync(async txn => {
    await assertLocalCreatorWithDb(txn, sessionId);
    await assertSetupUnlockedWithDb(txn, sessionId);
    await assertUnstartedWithDb(txn, sessionId);
    const presentation = await getLocalTastingPresentationWithDb(txn, sessionId, 'setup', actor);
    if (!presentation.tasting.canManageSetup) throw new Error(SETUP_PERMISSION_ERROR);
    result = await getSessionByIdWithDb(txn, sessionId);
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  return result;
}

async function withPendingSetup(sessionId, operation) {
  const db=await getLocalDatabase(), actor=await getLocalProfileIdentity();
  let result;
  await db.withExclusiveTransactionAsync(async txn=>{
    await assertLocalCreatorWithDb(txn,sessionId);
    await assertSetupUnlockedWithDb(txn,sessionId);
    await assertUnstartedWithDb(txn,sessionId);
    await assertNoRemoval(txn,sessionId);
    const presentation=await getLocalTastingPresentationWithDb(txn,sessionId,'setup',actor);
    if(!presentation.tasting.canManageSetup)throw new Error(SETUP_PERMISSION_ERROR);
    const setup=await getSessionByIdWithDb(txn,sessionId);
    result=await operation(txn,actor,setup);
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  return result;
}

export async function getPendingSampleAddition(sessionId) {
  return withPendingSetup(sessionId,async(db,actor,setup)=>decodePending(await pendingRowWithDb(db,sessionId),actor,setup));
}

export async function stagePendingSampleAddition({sessionId,expectedOperationId=null,candidate,saveInput,payload,tagContext,observedMetadata=null}) {
  ({candidate,saveInput,tagContext,observedMetadata}=JSON.parse(JSON.stringify({candidate,saveInput,tagContext,observedMetadata})));
  return withPendingSetup(sessionId,async(db,actor,setup)=>{
    const input=pendingSaveInput(saveInput), sample=pendingSampleFields(candidate);
    if(await db.getFirstAsync('SELECT session_id FROM local_pending_draft_removals WHERE cup_uuid=?',[sample.cupUUID]))throw new Error('removal:unfinished');
    if(canonicalize(input.samples.slice(0,-1))!==canonicalize(setup.samples.map(pendingSampleFields)))throw new Error('Session samples changed before writing. No cup was written.');
    if(observedMetadata){
      const observed=validateMetadata(observedMetadata);
      const issuer=await db.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
      const retired=await removalReceiptsWithDb(db,sessionId,actor,issuer?.incarnation);
      if(retired.some(row=>row.sample_code===observed.z&&observed.u===sessionId))throw new Error('removal:retired_assignment');
      const issued=await db.getFirstAsync('SELECT operation_id FROM issued_sample_codes WHERE session_id=? AND code=?',[sessionId,observed.z]);
      const committed=await db.getFirstAsync('SELECT id FROM samples WHERE session_id=? AND sample_code=?',[sessionId,observed.z]);
      if(observed.u!==sessionId||!issued||committed)throw new Error('This cup has another assignment. Use a fresh or manually cleared cup. No cup was written.');
    }
    const operationId=generateId();
    sample.id=generateId();
    sample.sampleCode=await reserveWithDb(db,sessionId,actor,operationId);
    sample.sampleNumber=setup.samples.length+1;
    input.samples=[...setup.samples.map(pendingSampleFields),sample];
    if(input.sessionUUID!==sessionId || input.existingSessionId!==sessionId || input.intent!=='setup' ||
        input.cuppingForm!==setup.cuppingForm || sample.cuppingForm!==setup.cuppingForm ||
        !sample.cupUUID || normalizeCupUuid(sample.cupUUID)!==sample.cupUUID || !sample.coffeeNameOrigin?.trim() ||
        !normalizeProcessKey(sample.process) ||
        !Number.isInteger(sample.cupNumber) || sample.cupNumber<1 || sample.cupNumber>8 ||
        !['blind','open'].includes(sample.cuppingMode) || (sample.cuppingForm===2 && sample.cuppingMode!=='open')) throw new Error('Pending sample details are invalid. No cup was written.');
    const priorIndex=setup.samples.findIndex(s=>s.cupUUID===sample.cupUUID);
    const identityConflict=await db.getFirstAsync('SELECT session_id FROM samples WHERE id=? AND session_id<>?',[sample.id,sessionId]);
    if(identityConflict)throw new Error('Pending sample identity is already in use. No cup was written.');
    if(priorIndex>=0 || setup.samples.some(s=>s.id===sample.id)) throw new Error('This cup already has a committed sample. No cup was written.');
    const expected=setup.samples.map(pendingSampleFields);
    if(priorIndex>=0)expected[priorIndex]=sample;else expected.push(sample);
    if(canonicalize(input.samples)!==canonicalize(expected))throw new Error('Session samples changed before writing. No cup was written.');
    const responses=await db.getAllAsync(input.cuppingForm===1
      ? 'SELECT sm.cup_uuid AS cupUUID,sm.cup_number AS cupCount FROM samples sm JOIN cva_response_revisions r ON r.sample_id=sm.id WHERE sm.session_id=?'
      : 'SELECT sm.cup_uuid AS cupUUID,sm.cup_number AS cupCount FROM samples sm JOIN legacy_responses r ON r.sample_id=sm.id WHERE sm.session_id=?',[sessionId]);
    if(responses.some(prior=>!input.samples.some(next=>next.cupUUID===prior.cupUUID && next.cupNumber===Number(prior.cupCount))))throw new Error('A sample with a saved response cannot have its cup count changed. No cup was written.');
    const metadata=buildCompactSessionMetadata({...sample,process:sample.process,sessionUUID:sessionId,
      sessionName:input.sessionName,sessionType:input.sessionType,sessionDate:input.sessionDate,
      samplesInSession:normalizePositiveInteger(input.samplesInSession,0)||setup.samples.length+1});
    if(metadata.i<setup.samples.length+1)throw new Error('Declared sample total is smaller than this session. No cup was written.');
    validateMetadata(metadata);
    const conflict=await db.getFirstAsync('SELECT session_id FROM local_pending_sample_additions WHERE cup_uuid=? AND session_id<>?', [sample.cupUUID,sessionId]);
    if(conflict)throw new Error('This cup has an unfinished assignment in another session. No cup was written.');
    if(!tagContext||!['ntag','smart'].includes(tagContext.kind))throw new Error('Cup type is unavailable. No cup was written.');
    return stagePendingWithDb(db,{sessionId,actor,setup,operationId,expectedOperationId,candidate:sample,saveInput:input,payload:metadata,tagContext});
  });
}

export async function markPendingSampleAdditionWritten({sessionId,operationId}) {
  return withPendingSetup(sessionId,async(db,actor,setup)=>{
    const pending=decodePending(await pendingRowWithDb(db,sessionId),actor,setup);
    if(!pending || pending.operationId!==operationId || pending.phase!=='check')throw new Error('Pending cup write changed. No sample was added.');
    const json=canonicalize({candidate:pending.candidate,saveInput:pending.saveInput,payload:pending.payload,tagContext:pending.tagContext,...wireProof(pending.payload),writeCompleted:true});
    await db.runAsync('UPDATE local_pending_sample_additions SET content_json=?,content_hash=? WHERE session_id=? AND operation_id=?',
      [json,sha256(json),sessionId,operationId]);
    return decodePending(await pendingRowWithDb(db,sessionId),actor,setup);
  });
}

export async function markPendingSampleAdditionVerified({sessionId,operationId,payload,physicalUID,tagContext}) {
  payload=JSON.parse(JSON.stringify(payload));tagContext=JSON.parse(JSON.stringify(tagContext));
  return withPendingSetup(sessionId,async(db,actor,setup)=>{
    const pending=decodePending(await pendingRowWithDb(db,sessionId),actor,setup);
    if(!pending || !pending.writeCompleted || pending.operationId!==operationId || physicalUID!==pending.candidate.cupUUID || canonicalize(tagContext)!==canonicalize(pending.tagContext) || !metadataMatches(pending.payload,payload))throw new Error('Pending cup check changed. No sample was added.');
    await db.runAsync("UPDATE local_pending_sample_additions SET phase='verified' WHERE session_id=? AND operation_id=?",[sessionId,operationId]);
    return {...pending,phase:'verified'};
  });
}

export async function commitPendingSampleAddition({sessionId,operationId}) {
  const actor=await getLocalProfileIdentity();
  const pending=await getPendingSampleAddition(sessionId);
  await requireSameTastingActor(actor);
  if(!pending) {
    const db=await getLocalDatabase();
    const outcome=await db.getFirstAsync('SELECT actor_id,outcome_json FROM sample_code_commit_outcomes WHERE session_id=? AND operation_id=?',[sessionId,operationId]);
    if(outcome?.actor_id===actor){
      let result,replaySnapshot;
      await db.withExclusiveTransactionAsync(async txn=>{
        await assertLocalCreatorWithDb(txn,sessionId);
        await assertSetupUnlockedWithDb(txn,sessionId);
        await assertUnstartedWithDb(txn,sessionId);
        await assertNoRemoval(txn,sessionId);
        const issuer=await txn.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
        const retired=await removalReceiptsWithDb(txn,sessionId,actor,issuer?.incarnation);
        const issued=await txn.getFirstAsync('SELECT code FROM issued_sample_codes WHERE session_id=? AND operation_id=?',[sessionId,operationId]);
        if(!issued||retired.some(row=>row.addition_operation_id===operationId||row.sample_code===issued.code)||
          !await txn.getFirstAsync('SELECT id FROM samples WHERE session_id=? AND sample_code=?',[sessionId,issued.code]))throw new Error('removal:retired_assignment');
        const parsed=JSON.parse(outcome.outcome_json),count=await txn.getFirstAsync('SELECT COUNT(*) AS count FROM samples WHERE session_id=?',[sessionId]);
        if(parsed.sessionId!==sessionId||parsed.status!=='new'||parsed.savedSampleCount!==count.count||
          (retired.length||parsed.removalGeneration!=null||parsed.issuerIncarnation!=null)&&
          (parsed.removalGeneration!==retired.length||parsed.issuerIncarnation!==issuer?.incarnation))throw new Error('removal:context_changed');
        replaySnapshot=await lockSnapshotWithDb(txn,sessionId,actor);
        result={sessionId:parsed.sessionId,status:parsed.status,savedSampleCount:parsed.savedSampleCount};await requireSameTastingActor(actor);
      });
      if((await getSessionLockReadiness(sessionId)).snapshot!==replaySnapshot)throw new Error('removal:context_changed');
      await requireSameTastingActor(actor);return result;
    }
  }
  if(!pending || pending.operationId!==operationId || pending.phase!=='verified')throw new Error('Pending cup check changed. No sample was added.');
  await saveSessionWithSamples({...pending.saveInput,pendingSampleOperationId:operationId});
  await requireSameTastingActor(actor);
  // Reuse the guarded current-outcome readback rather than acknowledging an
  // addition which was removed/locked/changed after its commit settled.
  return commitPendingSampleAddition({sessionId,operationId});
}

async function ownedMutation(sessionId, operation) {
  const db = await getLocalDatabase();
  let result;
  await db.withExclusiveTransactionAsync(async txn => {
    await assertLocalCreatorWithDb(txn, sessionId);
    await assertNoPendingWithDb(txn, sessionId);
    // Existing domain commands can reuse their transaction body without opening
    // a nested SQLite transaction. Every mutation remains on this guarded handle.
    const scoped = {
      getFirstAsync: (...args) => txn.getFirstAsync(...args),
      getAllAsync: (...args) => txn.getAllAsync(...args),
      runAsync: (...args) => txn.runAsync(...args),
      withExclusiveTransactionAsync: callback => callback(scoped),
    };
    result = await operation(scoped);
  });
  return result;
}

function normalizeCupUuid(value) {
  return String(value || "").trim().toUpperCase();
}

function observedPositiveInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^[1-9][0-9]*$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isSafeInteger(number) && number >= 1 && number <= maximum ? number : null;
}

function coerceCupNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return 5;
  }

  return Math.max(1, Math.min(8, parsed));
}

function cleanString(value) {
  return String(value || "").trim();
}

function isActiveFormPin(session, f) {
  if (session?.cuppingForm !== f) return false;
  const active = formIdentity(f);
  return session.formKey === active.form_key &&
    session.formVersion === active.form_version &&
    session.formHash === active.form_hash;
}

// Canonical v2 remains readable under its frozen rules, never writable as v3.
function isCanonicalCvaReadPin(session) {
  return ['2.0.0','3.0.0'].includes(session?.formVersion) && isPinnedForm(session, 1);
}

const PROTOTYPE_CVA_PIN = {
  form_key: 'sca_cva_affective_104_2024', form_version: '1.1.0',
  form_hash: '2a9e341fb17664559875a08235a01f88571a3833682ead2a1de09558ba6bf0bb',
};
function isPrototypeCvaPin(session) {
  return session?.cuppingForm === 1 && session.formKey === PROTOTYPE_CVA_PIN.form_key &&
    session.formVersion === PROTOTYPE_CVA_PIN.form_version && session.formHash === PROTOTYPE_CVA_PIN.form_hash;
}

export async function getCvaResponse(sessionId, sampleId) {
  const db = await getLocalDatabase();
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    output = await withTastingResponseAccess(txn, sessionId, sampleId, 1, await readCanonicalCva(txn, sessionId, sampleId));
  });
  return output;
}
export async function saveCvaResponse(input) {
  // Freeze the same command before any await: provenance, response write and
  // acknowledgement must never target different samples after caller mutation.
  let response;
  try { response = JSON.parse(canonicalize(input?.response)); } catch { tastingFail('cva:malformed_response'); }
  const command = { sessionId: input?.sessionId, sampleId: input?.sampleId, response,
    expectedRevision: input?.expectedRevision, expectedIdentity: input?.expectedIdentity ? { ...input.expectedIdentity } : null,
    expectedCupCount: input?.expectedCupCount, expectedTastingContextToken:input?.expectedTastingContextToken };
  const db = await getLocalDatabase();
  const actor = await getOrCreateLocalProfileIdentity();
  let result,ackToken=null;
  await db.withExclusiveTransactionAsync(async txn=>{
    await requireSameTastingActor(actor);
    const scope=await enrolledSaveContextWithDb(txn,command.sessionId,command.sampleId,actor,command.expectedTastingContextToken);
    const prior=await readCanonicalCva(txn,command.sessionId,command.sampleId);
    if(scope?.canEditCompleted){
      if(!scope.canEditCompleted)tastingFail('cva:session_complete');
      if(command.expectedRevision!==prior.revision)tastingFail('cva:stale_revision');
      if(command.expectedCupCount!==prior.n||canonicalize(command.expectedIdentity)!==canonicalize(prior.trusted.identity))tastingFail('cva:session_changed');
      if(canonicalize(command.response)===canonicalize(prior.response)){
        result={...prior,saved:true,firstComplete:false,noChange:true};ackToken=scope.presentation.tasting.contextToken;await requireSameTastingActor(actor);return;
      }
      await persistHistoryWithDb(txn,command.sessionId);
      await txn.runAsync("UPDATE sessions SET status='pending' WHERE id=?",[command.sessionId]);
    }
    result = await saveCanonicalCva({...txn,withExclusiveTransactionAsync:work=>work(txn)}, command, generateId, cvaDescriptors, async txn => {
    await requireSameTastingActor(actor);
    await assertAssessmentReadyWithDb(txn, command.sessionId, command.sampleId, actor);
    await persistHistoryWithDb(txn, command.sessionId);
    const before = await revisionWithDb(txn, command.sessionId, actor);
    if (!before.matches) tastingFail('tasting:stale_content');
    await writeStreamWithDb(txn, { sessionId: command.sessionId, sampleId: command.sampleId, form: 1, actor });
    return async () => {
      await commitRevisionWithDb(txn, command.sessionId, actor, { starts: hasScoreOrNote(response, 1) });
      await recomputeSessionProgressStatusWithDb(txn, command.sessionId);
      await requireSameTastingActor(actor);
    };
    });
    if(scope)ackToken=(await getLocalTastingPresentationWithDb(txn,command.sessionId,'tasting',actor)).tasting.contextToken;
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  const acknowledged = await getCvaResponse(command.sessionId, command.sampleId);
  await requireSameTastingActor(actor);
  if (acknowledged.revision !== result.revision || ackToken&&acknowledged.tasting.contextToken!==ackToken) tastingFail('tasting:ack_changed');
  return { ...result, ...acknowledged, firstComplete: result.firstComplete };
}

const cvaDescriptors = response => cvaNoteGroups(response).flatMap(group => tokenizeFlavourKeywords(group.notes)
  .filter(token => token.type === 'pill').map(token => ({ keyword: token.keyword, label: token.keyword, colour: token.colour, sourceField: group.key })));

async function requireSameTastingActor(actor) {
  if (!validActor(actor) || await getLocalProfileIdentity() !== actor) tastingFail('tasting:actor_changed');
}

async function assertAssessmentReadyWithDb(db, sessionId, sampleId = null, actor = undefined) {
  await assertNoPendingWithDb(db, sessionId);
  const row = await db.getFirstAsync('SELECT status, local_creator_profile_id AS creator FROM sessions WHERE id = ?', [sessionId]);
  if (row?.status === 'new' && row.creator) throw new Error('Save this session before opening a tasting assessment.');
  if (sampleId) await assertCreatorTargetActiveWithDb(db, sessionId, sampleId, actor === undefined ? await getLocalProfileIdentity() : actor);
}

async function withTastingResponseAccess(db, sessionId, sampleId, form, saved, capturedActor = undefined) {
  let actor = capturedActor;
  if (actor === undefined) {
    actor = null;
    try { actor = await getOrCreateLocalProfileIdentity(); } catch { /* unavailable fails closed */ }
  }
  await assertAssessmentReadyWithDb(db, sessionId, sampleId, actor);
  const access = await streamWithDb(db, sessionId, sampleId, form, actor);
  const presentation = await getLocalTastingPresentationWithDb(db, sessionId, 'tasting', actor);
  const sample = presentation.session.samples.find(row => row.id === sampleId);
  const canEditCompleted=Boolean(!saved.historicalReadOnly&&saved.complete&&saved.result?.ok&&
    presentation.tasting.activeSelection&&presentation.tasting.completed&&sample?.tastingActive===true&&access.state==='mine');
  if (actor) await requireSameTastingActor(actor);
  return { ...saved, access: { state: access.state, canWrite: !saved.historicalReadOnly && (access.canWrite||canEditCompleted), canEditCompleted, canAdopt: !saved.historicalReadOnly && access.canAdopt, sourceToken: saved.historicalReadOnly ? null : access.sourceToken },
    identity: { visible: Boolean(sample && !sample.identityHidden), name: sample?.coffeeNameOrigin || '', process: sample?.process || '' },
    tasting: presentation.tasting };
}

async function enrolledSaveContextWithDb(db,sessionId,sampleId,actor,expectedToken){
  const policy=await assertCreatorTargetActiveWithDb(db,sessionId,sampleId,actor);
  if(!policy)return null;
  await requireSameTastingActor(actor);
  const presentation=await getLocalTastingPresentationWithDb(db,sessionId,'tasting',actor);
  if(!expectedToken||expectedToken!==presentation.tasting.contextToken)tastingFail('tasting:stale_context');
  const access=await streamWithDb(db,sessionId,sampleId,policy.cuppingForm,actor);
  const row=await db.getFirstAsync('SELECT status FROM sessions WHERE id=?',[sessionId]);
  const canEditCompleted=Boolean(presentation.tasting.completed&&access.state==='mine');
  if(row?.status==='complete'&&!canEditCompleted)tastingFail('tasting:read_only');
  return{policy,presentation,access,canEditCompleted};
}

async function canonicalCvaForSample(db, sampleId) {
  const row = await db.getFirstAsync(`SELECT s.id, s.cupping_form AS cuppingForm,
    s.form_key AS formKey, s.form_version AS formVersion, s.form_hash AS formHash
    FROM samples sm JOIN sessions s ON s.id = sm.session_id WHERE sm.id = ? LIMIT 1`, [sampleId]);
  if (!row || !isCanonicalCvaReadPin(row)) return null;
  const actor = await getLocalProfileIdentity();
  const policy = await assertCreatorTargetActiveWithDb(db, row.id, sampleId, actor);
  const saved = await readCanonicalCva(db, row.id, sampleId);
  if (policy) await requireSameTastingActor(actor);
  return saved;
}

async function assertActiveCvaSampleWithDb(db, sessionId, sampleId) {
  const row = await db.getFirstAsync(
    `SELECT s.id AS sessionId, s.status, s.cupping_form AS cuppingForm,
            s.form_key AS formKey, s.form_version AS formVersion,
            s.form_hash AS formHash, sm.cupping_form AS sampleForm
     FROM samples sm JOIN sessions s ON s.id = sm.session_id
     WHERE sm.id = ? LIMIT 1`,
    [sampleId]
  );
  if (!row || (sessionId && row.sessionId !== sessionId) || row.sampleForm !== 1 ||
      !isPrototypeCvaPin(row)) {
    throw new Error('This sample is not linked to the active CVA form version. Its saved data was not changed.');
  }
  if (row.status === 'complete') throw new Error('This session is complete. Its saved assessment was not changed.');
  if (!['new', 'pending', 'in_progress'].includes(row.status)) tastingFail('tasting:damaged_history');
  await assertAssessmentReadyWithDb(db, row.sessionId);
  return row.sessionId;
}

export async function assertWritableCvaSample({ sessionId, sampleId } = {}) {
  const db = await getLocalDatabase();
  return assertActiveCvaSampleWithDb(db, cleanString(sessionId), cleanString(sampleId));
}

async function savedCvaCalculationWithDb(db, sampleId) {
  const latest = await db.getFirstAsync(
    'SELECT calculation_policy AS calculationPolicy FROM sample_defect_entries WHERE sample_id = ? ORDER BY rowid DESC LIMIT 1',
    [sampleId]
  );
  if (latest && !isSupportedCvaCalculationPolicy(latest.calculationPolicy)) {
    throw new Error(CVA_UNKNOWN_CALCULATION_MESSAGE);
  }
  if (latest) return latest.calculationPolicy;
  const feedback = await db.getFirstAsync('SELECT id FROM sample_feedback_entries WHERE sample_id = ? LIMIT 1', [sampleId]);
  return feedback ? null : CVA_EXACT_CALCULATION_POLICY;
}

function normalizeSessionUuid(value) {
  return cleanString(value);
}

function formatSessionDateFallback(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalizeCupSlotList(value, maxCups = 8) {
  const limit = Math.max(1, Number.parseInt(maxCups, 10) || 1);
  const list = Array.isArray(value) ? value : [];
  const parsed = list
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= limit);
  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

function parseCupSlotMask(mask, fallbackCount, maxCups = 8) {
  const normalizedMask = cleanString(mask);
  if (normalizedMask) {
    try {
      const parsed = JSON.parse(normalizedMask);
      const slots = normalizeCupSlotList(parsed, maxCups);
      if (slots.length > 0 || Array.isArray(parsed)) {
        return slots;
      }
    } catch {
      // Ignore malformed masks and fallback to count.
    }
  }

  const count = Math.max(0, Math.min(maxCups, Number.parseInt(fallbackCount, 10) || 0));
  return Array.from({ length: count }, (_, index) => index + 1);
}

function normalizeDefectTypeMasks(value, maxCups = 8) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.entries(source).reduce((acc, [key, slots]) => {
    const normalizedKey = cleanString(key);
    if (!normalizedKey) {
      return acc;
    }
    const normalizedSlots = normalizeCupSlotList(slots, maxCups);
    if (normalizedSlots.length > 0) {
      acc[normalizedKey] = normalizedSlots;
    }
    return acc;
  }, {});
}

function parseDefectTypeMasks(mask, maxCups = 8) {
  const normalizedMask = cleanString(mask);
  if (!normalizedMask) {
    return {};
  }
  try {
    return normalizeDefectTypeMasks(JSON.parse(normalizedMask), maxCups);
  } catch {
    return {};
  }
}

// Session completion is now manual (user presses "Mark Complete").
// This function is retained as a no-op so existing call sites compile without changes.
// eslint-disable-next-line no-unused-vars
async function reconcileCompletedSessions(_db) {}

async function recomputeSessionProgressStatusWithDb(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  const session = await db.getFirstAsync(
    "SELECT status, cupping_form AS cuppingForm, form_key AS formKey, form_version AS formVersion, form_hash AS formHash FROM sessions WHERE id = ? LIMIT 1",
    [normalizedSessionId]
  );
  if (!session) {
    return null;
  }

  const currentStatus = session.status;
  if (!['new', 'pending', 'in_progress', 'complete'].includes(currentStatus)) tastingFail('tasting:damaged_history');
  if (currentStatus === "complete") {
    return "complete";
  }

  if (currentStatus === 'new') {
    const provenance = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?', [normalizedSessionId]);
    if (provenance?.creator) return 'new';
  }

  const sampleCountRow = await db.getFirstAsync(
    "SELECT COUNT(*) AS count FROM samples WHERE session_id = ?",
    [normalizedSessionId]
  );
  const sampleCount = Number(sampleCountRow?.count) || 0;
  let nextStatus = sampleCount > 0 ? "pending" : "new";
  if (await creatorActivationWithDb(db, normalizedSessionId)) {
    nextStatus = await creatorHasSavedScoreWithDb(db, normalizedSessionId, session.cuppingForm) ? 'in_progress' : 'pending';
    if (nextStatus !== currentStatus) await db.runAsync('UPDATE sessions SET status=?,updated_at=? WHERE id=?', [nextStatus,new Date().toISOString(),normalizedSessionId]);
    return nextStatus;
  }
  if (sampleCount > 0 && isActiveFormPin(session, 1) && isCanonicalCvaReadPin(session)) {
    const history = await historyWithDb(db, normalizedSessionId);
    if (history.ever_started && history.schema_version == null) await persistHistoryWithDb(db, normalizedSessionId);
    const statuses = await canonicalCvaStatuses(db, normalizedSessionId);
    if (Object.values(statuses).some(sample => sample.hasAnyFeedback)) {
      nextStatus = 'in_progress';
      await startTastingWithDb(db, normalizedSessionId);
    }
    if (nextStatus !== currentStatus) await db.runAsync('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, new Date().toISOString(), normalizedSessionId]);
    return nextStatus;
  }
  const foundation = await db.getFirstAsync('SELECT session_id FROM local_session_foundations WHERE session_id = ?', [normalizedSessionId]);
  if (foundation) {
    if ((await historyWithDb(db, normalizedSessionId)).ever_started) nextStatus = 'in_progress';
    if (nextStatus !== currentStatus) await db.runAsync('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, new Date().toISOString(), normalizedSessionId]);
    return nextStatus;
  }

  if (sampleCount > 0) {
    const feedbackCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM sample_feedback_entries WHERE session_id = ?",
      [normalizedSessionId]
    );
    const feedbackCount = Number(feedbackCountRow?.count) || 0;
    const legacyCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM legacy_responses WHERE session_id = ?",
      [normalizedSessionId]
    );
    const cvaCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM cva_response_revisions WHERE session_id = ?",
      [normalizedSessionId]
    );
    if (feedbackCount > 0 || Number(legacyCountRow?.count) > 0 || Number(cvaCountRow?.count) > 0) {
      nextStatus = "in_progress";
      await startTastingWithDb(db, normalizedSessionId);
    }
  }

  if (nextStatus !== currentStatus) {
    await db.runAsync(
      "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
      [nextStatus, new Date().toISOString(), normalizedSessionId]
    );
  }

  return nextStatus;
}

export async function recomputeSessionProgressStatus(sessionId) {
  const db = await getLocalDatabase();
  return recomputeSessionProgressStatusWithDb(db, sessionId);
}

export const CUPPING_SCORE_FIELDS = [
  "Fragrance",
  "Aroma",
  "Flavour",
  "Aftertaste",
  "Acidity",
  "Sweetness",
  "Mouthfeel",
  "Overall",
];

function toNumericOrZero(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateFinalScore({
  finalScoresByField,
  nonUniformCups,
  defectiveCups,
  numberOfCups,
  calculationPolicy = null,
}) {
  const cups = Math.max(1, toNumericOrZero(numberOfCups));
  const sumHi = CUPPING_SCORE_FIELDS.reduce(
    (sum, field) => sum + toNumericOrZero(finalScoresByField?.[field]),
    0
  );
  return calculateCvaScore({ sumHi, nonUniformCups, defectiveCups, numberOfCups: cups, calculationPolicy });
}

export async function saveSessionWithSamples({
  sessionUUID,
  existingSessionId = null,
  cuppingForm,
  cuppingMode,
  sessionDisplayId,
  sessionName,
  sessionType,
  samplesInSession = 0,
  status = "new",
  sessionDate,
  samples,
  intent = 'save',
  pendingSampleOperationId = null,
}) {
  if (!['save', 'setup'].includes(intent)) throw new Error('Unsupported session save intent.');
  if (cuppingForm !== 1 && cuppingForm !== 2) {
    throw new Error("The session form is missing or unsupported. No session was saved.");
  }
  const pinnedForm = formIdentity(cuppingForm);
  if (cuppingForm === 2 && cuppingMode !== 'open') throw new Error('SCA Legacy currently requires Open Cupping. No session was saved.');
  const trimmedSessionName = cleanString(sessionName);
  if (!trimmedSessionName) {
    throw new Error("Session name is required before saving.");
  }

  const normalizedSessionId = cleanString(sessionUUID);
  if (!normalizedSessionId) {
    throw new Error("Secure session reference is unavailable. Please reopen this session.");
  }

  const normalizedSamples = (samples || [])
    .map((sample, index) => ({
      id: cleanString(sample?.id) || generateId(),
      cupUUID: normalizeCupUuid(sample?.cupUUID),
      cupNumber: coerceCupNumber(sample?.cupNumber),
      cuppingForm: sample?.cuppingForm,
      cuppingMode: normalizeCuppingModeKey(sample?.cuppingMode),
      sampleNumber: normalizePositiveInteger(sample?.sampleNumber, index + 1),
      sampleCode: sample?.sampleCode,
      coffeeNameOrigin: cleanString(sample?.coffeeNameOrigin),
      process: cleanString(sample?.process),
      positionIndex: index,
    }))
    .filter((sample) => sample.cupUUID);

  if (normalizedSamples.some((sample) => sample.cuppingForm !== pinnedForm.f)) {
    throw new Error("A sample form does not match the session form.");
  }
  if(!validSession(normalizedSessionId)||normalizedSamples.some(sample=>!validCode(sample.sampleCode)))throw new Error('Unsupported test sample-code profile. No session was saved.');
  if (cuppingForm === 2 && normalizedSamples.some((sample) => sample.cuppingMode !== 'open')) {
    throw new Error('SCA Legacy Blind Cupping is not yet available. No session or cup assignment was saved.');
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  const sessionId = normalizedSessionId;
  const sessionUuidValue = normalizedSessionId;
  const displayIdValue = cleanString(sessionDisplayId) || `SESSION-${sessionUuidValue.slice(0, 8).toUpperCase()}`;
  const sessionStatusValue = intent === 'setup' || !normalizedSamples.length ? 'new' : 'pending';

  const creatorId = existingSessionId ? null : await getOrCreateLocalProfileIdentity();
  await db.withExclusiveTransactionAsync(async txn => {
    const db = txn;
    await assertNoRemoval(db,sessionId);
    let pendingActor = null;
    await assertSessionReferenceAvailableWithDb(db, sessionId, existingSessionId);
    const pendingRow = await pendingRowWithDb(db, sessionId);
    if (pendingRow) {
      const actor = await getLocalProfileIdentity();
      pendingActor = actor;
      const pending = decodePending(pendingRow,actor,await getSessionByIdWithDb(db,sessionId));
      const request = pendingSaveInput({sessionUUID,existingSessionId,cuppingForm,cuppingMode,sessionDisplayId,
        sessionName,sessionType,samplesInSession,status,sessionDate,samples,intent});
      if (!pendingSampleOperationId || pending.operationId !== pendingSampleOperationId || pending.phase !== 'verified' ||
          canonicalize(request) !== canonicalize(pending.saveInput)) throw new Error('Finish the pending cup check from Add Sample before saving this session.');
      await requireSameTastingActor(actor);
    } else if (pendingSampleOperationId) throw new Error('Pending cup check is no longer available. No sample was added.');
    const existingSession = await db.getFirstAsync(
      "SELECT created_at, cupping_form AS cuppingForm, form_key AS formKey, form_version AS formVersion, form_hash AS formHash, cupping_mode AS cuppingMode, form_locked AS formLocked, status FROM sessions WHERE id = ?",
      [sessionId]
    );
    if (existingSession) {
      await assertLocalCreatorWithDb(db, sessionId);
      await assertSetupUnlockedWithDb(db, sessionId);
      await assertUnstartedWithDb(db, sessionId);
      const roster=await db.getAllAsync('SELECT id,cup_uuid,sample_code FROM samples WHERE session_id=?',[sessionId]);
      if(roster.some(row=>!normalizedSamples.some(sample=>sample.id===row.id&&sample.cupUUID===row.cup_uuid&&sample.sampleCode===row.sample_code)))throw new Error('Session samples changed. Reopen the session.');
      const currentIssuer=await db.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
      const retired=await removalReceiptsWithDb(db,sessionId,await getLocalProfileIdentity(),currentIssuer?.incarnation);
      if(retired.some(row=>normalizedSamples.some(sample=>sample.id===row.sample_id||sample.sampleCode===row.sample_code)))throw new Error('removal:retired_assignment');
    }
    else if (existingSessionId) throw new Error('This saved session is unavailable. No new session was created.');
    if (existingSession && isPinnedForm(existingSession, existingSession.cuppingForm) &&
        !isActiveFormPin(existingSession, existingSession.cuppingForm) && !isPrototypeCvaPin(existingSession)) {
      throw new Error('This historical form version is read-only. Start a new session; its saved data was not changed.');
    }
    if (existingSession && (!isPinnedForm(existingSession, cuppingForm) ||
        (cuppingForm === 2 && existingSession.cuppingMode !== 'open'))) {
      if (!isPinnedForm(existingSession, existingSession.cuppingForm)) {
        throw new Error('This older or unsupported prototype session cannot be converted to a versioned form. Its data is unchanged.');
      }
      if (existingSession.cuppingForm === 2 && existingSession.cuppingMode !== 'open') {
        throw new Error('Legacy session Open mode is missing or conflicting. Its data is unchanged.');
      }
      const assigned = await db.getFirstAsync('SELECT COUNT(*) AS count FROM samples WHERE session_id = ?', [sessionId]);
      if (Number(assigned?.count) > 0 || Number(existingSession.formLocked) === 1) {
        throw new Error("An existing session's pinned form or mode cannot be changed after cup assignment. Its data is unchanged.");
      }
    }
    if (existingSession?.cuppingForm === 2) {
      if (existingSession.status === 'complete') {
        throw new Error('This completed Legacy Session is read-only. Reset it to Pending before editing; no local record was changed.');
      }
      const recorded = await db.getAllAsync(
        `SELECT samples.cup_uuid AS cupUUID, samples.cup_number AS cupNumber
         FROM samples JOIN legacy_responses ON legacy_responses.sample_id = samples.id
         WHERE samples.session_id = ?`, [sessionId]
      );
      for (const prior of recorded) {
        const next = normalizedSamples.find(sample => sample.cupUUID === prior.cupUUID);
        if (!next || next.cupNumber !== Number(prior.cupNumber)) {
          throw new Error('A Legacy sample with a saved response cannot be removed or have its cup count changed. No local record was changed.');
        }
      }
    }

    const createdAt = existingSession?.created_at || nowIso;
    const savedPin = cuppingForm === 1 && isPrototypeCvaPin(existingSession)
      ? { f: 1, ...PROTOTYPE_CVA_PIN } : pinnedForm;
    if (existingSession?.cuppingForm === 1 && isActiveFormPin(existingSession, 1)) {
      if (existingSession.status === 'complete') throw new Error('This completed CVA Session is read-only. No local record was changed.');
      const captured = await db.getAllAsync(`SELECT sm.cup_uuid AS cupUUID, sm.cup_number AS cupCount
        FROM samples sm JOIN cva_response_revisions r ON r.sample_id = sm.id WHERE sm.session_id = ?`, [sessionId]);
      if (captured.some(prior => !normalizedSamples.some(next => next.cupUUID === prior.cupUUID && next.cupNumber === prior.cupCount))) {
        throw new Error('A CVA sample with a saved response cannot be removed or have its cup count changed.');
      }
    }

    await db.runAsync(
      `
        INSERT INTO sessions (
          id, session_uuid, session_display_id, session_name, session_type, samples_in_session, status, session_date,
          cupping_form, form_key, form_version, form_hash, cupping_mode, form_locked, created_at, updated_at, local_creator_profile_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_uuid = excluded.session_uuid,
          session_display_id = excluded.session_display_id,
          session_name = excluded.session_name,
          session_type = excluded.session_type,
          samples_in_session = excluded.samples_in_session,
          status = excluded.status,
          session_date = excluded.session_date,
          cupping_form = excluded.cupping_form,
          form_key = excluded.form_key,
          form_version = excluded.form_version,
          form_hash = excluded.form_hash,
          cupping_mode = excluded.cupping_mode,
          form_locked = excluded.form_locked,
          updated_at = excluded.updated_at
      `,
      [
        sessionId,
        sessionUuidValue,
        displayIdValue,
        trimmedSessionName,
        cleanString(sessionType),
        normalizePositiveInteger(samplesInSession, normalizedSamples.length),
        sessionStatusValue,
        cleanString(sessionDate),
        pinnedForm.f,
        savedPin.form_key,
        savedPin.form_version,
        savedPin.form_hash,
        cuppingForm === 2 ? 'open' : null,
        Number(existingSession?.formLocked) === 1 || normalizedSamples.length > 0 ? 1 : 0,
        createdAt,
        nowIso,
        creatorId,
      ]
    );

    if (!existingSession) await db.runAsync('INSERT INTO sample_code_issuers(session_id,actor_id,incarnation,profile) VALUES (?,?,?,103)',[sessionId,creatorId,generateId()]);

    for (const sample of normalizedSamples) {
      const existingSample = await db.getFirstAsync(
        "SELECT id, created_at, cup_uuid AS cupUUID, cupping_form AS cuppingForm, sample_metadata_json AS metadataJson FROM samples WHERE session_id = ? AND sample_code = ?",
        [sessionId, sample.sampleCode]
      );
      if (!existingSample && !pendingSampleOperationId) throw new Error('A sample must pass Check Cup before it can be added.');
      if(existingSample){
        const original=JSON.parse(existingSample.metadataJson);
        const intended=buildCompactSessionMetadata({...sample,process:sample.process,sessionUUID:sessionId,sessionName:trimmedSessionName,sessionType,sessionDate,samplesInSession:original.i});
        if(existingSample.cupUUID!==sample.cupUUID||!metadataMatches(original,intended))throw new Error('Committed sample metadata cannot be edited in this test. No sample was changed.');
      }
      if (existingSample && existingSample.cuppingForm !== pinnedForm.f) {
        throw new Error("An existing sample has a different form. Its session and cup assignment were not changed.");
      }

      const sampleId = existingSample?.id || sample.id || generateId();
      const sampleCreatedAt = existingSample?.created_at || nowIso;
      const assignedMetadata=existingSample?.metadataJson || JSON.stringify(JSON.parse((await pendingRowWithDb(db,sessionId)).content_json).payload);

      await db.runAsync(
        `
          INSERT INTO samples (
            id, session_id, cup_uuid, cup_number, cupping_form, cupping_mode, sample_number, sample_code, sample_metadata_json, coffee_name_origin, process, position_index, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, sample_code) DO UPDATE SET
            cup_number = excluded.cup_number,
            cupping_form = excluded.cupping_form,
            cupping_mode = excluded.cupping_mode,
            sample_number = excluded.sample_number,
            coffee_name_origin = excluded.coffee_name_origin,
            process = excluded.process,
            position_index = excluded.position_index,
            updated_at = excluded.updated_at
        `,
        [
          sampleId,
          sessionId,
          sample.cupUUID,
          sample.cupNumber,
          sample.cuppingForm,
          sample.cuppingMode,
          sample.sampleNumber,
          sample.sampleCode,
          assignedMetadata,
          sample.coffeeNameOrigin,
          sample.process,
          sample.positionIndex,
          sampleCreatedAt,
          nowIso,
        ]
      );
    }

    const keepCupUuids = normalizedSamples.map((sample) => sample.cupUUID);
    if (keepCupUuids.length === 0) {
      await db.runAsync('DELETE FROM samples WHERE session_id = ?', [sessionId]);
      const actor=await getLocalProfileIdentity();
      if(await db.getFirstAsync('SELECT 1 FROM local_tasting_revisions WHERE session_id=? AND local_profile_id=?',[sessionId,actor]))await commitRevisionWithDb(db,sessionId,actor);
      return;
    }

    const placeholders = keepCupUuids.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM samples WHERE session_id = ? AND cup_uuid NOT IN (${placeholders})`,
      [sessionId, ...keepCupUuids]
    );

    await recomputeSessionProgressStatusWithDb(db, sessionId);
    const setupActor=await getLocalProfileIdentity();
    if(await db.getFirstAsync('SELECT 1 FROM local_tasting_revisions WHERE session_id=? AND local_profile_id=?',[sessionId,setupActor]))await commitRevisionWithDb(db,sessionId,setupActor);
    if (pendingSampleOperationId) {
      const actor = pendingActor;
      await assertLocalCreatorWithDb(db,sessionId);
      const row = await pendingRowWithDb(db,sessionId);
      if (!row || row.actor_id !== actor || row.operation_id !== pendingSampleOperationId) throw new Error('Pending cup check changed. No sample was added.');
      await requireSameTastingActor(actor);
      const issuer=await db.getFirstAsync('SELECT incarnation FROM sample_code_issuers WHERE session_id=?',[sessionId]);
      const receipts=await removalReceiptsWithDb(db,sessionId,actor,issuer?.incarnation);
      await db.runAsync('INSERT INTO sample_code_commit_outcomes(session_id,operation_id,actor_id,outcome_json) VALUES (?,?,?,?)',[sessionId,pendingSampleOperationId,actor,JSON.stringify({sessionId,status:sessionStatusValue,savedSampleCount:normalizedSamples.length,issuerIncarnation:issuer.incarnation,removalGeneration:receipts.length})]);
      await db.runAsync('DELETE FROM local_pending_sample_additions WHERE session_id=? AND operation_id=?', [sessionId,pendingSampleOperationId]);
      await requireSameTastingActor(actor);
    }
  });

  return {
    sessionId,
    status: sessionStatusValue,
    savedSampleCount: normalizedSamples.length,
  };
}

async function assertSessionReferenceAvailableWithDb(db, reference, existingSessionId) {
  const normalizedReference = cleanString(reference);
  const normalizedExistingId = cleanString(existingSessionId);
  if (!normalizedReference) {
    throw new Error("Secure session reference is unavailable. Please reopen this session.");
  }

  const existingById = await db.getFirstAsync(
    "SELECT id FROM sessions WHERE id = ? LIMIT 1",
    [normalizedReference]
  );
  const existingByReference = await db.getFirstAsync(
    "SELECT id FROM sessions WHERE session_uuid = ? LIMIT 1",
    [normalizedReference]
  );
  if (normalizedExistingId) {
    if (
      normalizedReference !== normalizedExistingId ||
      existingById?.id !== normalizedExistingId ||
      (existingByReference && existingByReference.id !== normalizedExistingId)
    ) {
      throw new Error("Session reference changed or is missing. Reopen the saved session before editing.");
    }
  } else if (existingById || existingByReference) {
    throw new Error("Session reference is already in use. Reopen the new-session screen and try again.");
  }
}

export async function assertSessionReferenceAvailable(reference, existingSessionId = null) {
  const db = await getLocalDatabase();
  return assertSessionReferenceAvailableWithDb(db, reference, existingSessionId);
}

export async function listSessions() {
  const db = await getLocalDatabase();
  await reconcileCompletedSessions(db);

  const rows = await db.getAllAsync(
    `
      SELECT
        id,
        session_uuid AS sessionUUID,
        session_display_id AS sessionDisplayId,
        session_name AS sessionName,
        session_type AS sessionType,
        samples_in_session AS samplesInSession,
        status,
        session_date AS sessionDate,
        cupping_form AS cuppingForm,
        form_key AS formKey,
        form_version AS formVersion,
        form_hash AS formHash,
        cupping_mode AS cuppingMode,
        form_locked AS formLocked,
        updated_at AS updatedAt
      FROM sessions
      ORDER BY updated_at DESC
    `
  );

  return rows || [];
}

export async function findPendingSessionByCupUUID({ cupUUID, excludeSessionId } = {}) {
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedCupUUID) {
    return null;
  }

  const db = await getLocalDatabase();
  const excludedId = cleanString(excludeSessionId);

  const row = excludedId
    ? await db.getFirstAsync(
        `
          SELECT
            s.id,
            s.session_uuid AS sessionUUID,
            s.session_display_id AS sessionDisplayId,
            s.session_name AS sessionName,
            s.session_type AS sessionType,
            s.status,
            s.session_date AS sessionDate,
            s.updated_at AS updatedAt
          FROM samples sm
          INNER JOIN sessions s ON sm.session_id = s.id
          WHERE sm.cup_uuid = ? AND s.id != ? AND s.status IN ('new', 'pending', 'in_progress')
          ORDER BY s.updated_at DESC
          LIMIT 1
        `,
        [normalizedCupUUID, excludedId]
      )
    : await db.getFirstAsync(
        `
          SELECT
            s.id,
            s.session_uuid AS sessionUUID,
            s.session_display_id AS sessionDisplayId,
            s.session_name AS sessionName,
            s.session_type AS sessionType,
            s.status,
            s.session_date AS sessionDate,
            s.updated_at AS updatedAt
          FROM samples sm
          INNER JOIN sessions s ON sm.session_id = s.id
          WHERE sm.cup_uuid = ? AND s.status IN ('new', 'pending', 'in_progress')
          ORDER BY s.updated_at DESC
          LIMIT 1
        `,
        [normalizedCupUUID]
      );

  return row || null;
}

export async function findSessionBySessionUUID(sessionUUID) {
  return findSessionBySessionUUIDWithDb(await getLocalDatabase(), sessionUUID);
}

async function findSessionBySessionUUIDWithDb(db, sessionUUID) {
  const normalizedSessionUUID = normalizeSessionUuid(sessionUUID);
  if (!normalizedSessionUUID) {
    return null;
  }

  const row = await db.getFirstAsync(
    `
      SELECT
        id,
        session_uuid AS sessionUUID,
        session_display_id AS sessionDisplayId,
        session_name AS sessionName,
        session_type AS sessionType,
        samples_in_session AS samplesInSession,
        status,
        session_date AS sessionDate,
        cupping_form AS cuppingForm,
        form_key AS formKey,
        form_version AS formVersion,
        form_hash AS formHash,
        cupping_mode AS cuppingMode,
        form_locked AS formLocked,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE session_uuid = ?
      LIMIT 1
    `,
    [normalizedSessionUUID]
  );

  return row || null;
}

export async function getSessionById(sessionId, { reconcile = true } = {}) {
  const db = await getLocalDatabase();
  return getSessionByIdWithDb(db, sessionId, { reconcile });
}

export async function getLocalTastingPresentation(sessionId, { purpose = 'tasting' } = {}) {
  const db = await getLocalDatabase();
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    let actor = null;
    try { actor = await getLocalProfileIdentity(); } catch { /* redact */ }
    output = await getLocalTastingPresentationWithDb(txn, sessionId, purpose, actor);
    if (actor && await getLocalProfileIdentity() !== actor) tastingFail('tasting:actor_changed');
  });
  return output;
}

async function getLocalTastingPresentationWithDb(db, sessionId, purpose, actor) {
  const raw = await getSessionByIdWithDb(db, sessionId);
  if (!raw) tastingFail('tasting:unavailable');
  const creator = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?', [sessionId]);
  const isLocalCreator = validActor(actor) && creator?.creator === actor;
  const originalState = await tastingStateWithDb(db, sessionId, actor);
  const creatorCompletion = await creatorCompletionWithDb(db,sessionId,actor,originalState);
  const state = creatorCompletion ? Object.fromEntries(Object.entries(creatorCompletion).filter(([key])=>!['snapshot','json','hash','base'].includes(key))) : originalState;
  const samples = raw.samples || [];
  const activation = await creatorActivationWithDb(db, sessionId);
  const targetActive = sample => creatorTargetActive(activation, actor, sample.id);
  const activePin = isActiveFormPin(raw, 1) || isActiveFormPin(raw, 2);
  const supported = (activePin || isCanonicalCvaReadPin(raw)) &&
    ['new', 'pending', 'in_progress', 'complete'].includes(raw.status) &&
    samples.every(sample => sample.cuppingForm === raw.cuppingForm && Number.isInteger(sample.cupNumber) && sample.cupNumber >= 1 && sample.cupNumber <= 8);
  const modes = samples.map(sample => sample.cuppingMode);
  const knownSessionMode = raw.cuppingMode == null || ['open', 'blind'].includes(raw.cuppingMode);
  const validMode = knownSessionMode && (samples.length ? modes.every(mode => ['open','blind'].includes(mode)) : ['open','blind'].includes(raw.cuppingMode)) &&
    (raw.cuppingForm !== 2 || raw.cuppingMode === 'open' && modes.every(mode => mode === 'open'));
  const open = validMode && raw.cuppingMode === 'open';
  // An empty, unassigned CVA draft chooses mode when its first sample is added.
  // NULL here is not the same as malformed non-null or conflicting assigned mode.
  let verifiedEmptyRemoval=false;
  if(!samples.length&&raw.status==='new'&&isLocalCreator&&raw.cuppingForm===1&&raw.cuppingMode==null){
    const issuer=await db.getFirstAsync('SELECT incarnation,actor_id FROM sample_code_issuers WHERE session_id=?',[sessionId]);
    if(issuer?.actor_id===actor)verifiedEmptyRemoval=(await removalReceiptsWithDb(db,sessionId,actor,issuer.incarnation)).length>0;
  }
  const setupModeValid = validMode || (!samples.length && raw.cuppingForm === 1 && raw.cuppingMode == null && (!raw.formLocked||verifiedEmptyRemoval));
  let setupUnlocked = false;
  try { setupUnlocked = !(await setupLockWithDb(db, sessionId)); } catch { /* damaged lock denies setup */ }
  const canManageSetup = Boolean(activePin && supported && setupModeValid && isLocalCreator && !state.started && setupUnlocked && raw.status !== 'complete');
  const emptyCvaDraftSetup = purpose === 'setup' && canManageSetup && raw.status === 'new' &&
    !samples.length && raw.cuppingForm === 1 && raw.cuppingMode == null && (!raw.formLocked||verifiedEmptyRemoval);
  const preparation = purpose === 'setup' && canManageSetup;
  const showSample = sample => Boolean(supported && validMode && (sample.cuppingMode === 'open' || targetActive(sample) && state.revealed || preparation));
  // This aggregate is conservative metadata only. Never use it for a target's
  // coffee identity: mixed tasting cards carry their own identityHidden flag.
  const identityHidden = samples.length ? samples.some(sample => !showSample(sample)) :
    !Boolean(supported && (validMode && (open || state.revealed || preparation) || emptyCvaDraftSetup));
  const localRemoval = {};
  if (activation && activation.creator===actor) {
    for (const sample of samples) localRemoval[sample.id] = await creatorRemovalContextWithDb(db, sessionId, sample.id, actor);
  }
  if (!activation && activePin && validMode && validActor(actor) && creator?.creator === null) {
    for (const sample of samples) localRemoval[sample.id] = await participantRemovalContextWithDb(db, sessionId, sample.id, actor);
  }
  let displayStatus = state.completed ? 'complete' : raw.status === 'complete' ? 'complete' : state.started && raw.status !== 'new' ? 'in_progress' : raw.status;
  if (activation) displayStatus = state.completed ? 'complete' : await creatorHasSavedScoreWithDb(db,sessionId,raw.cuppingForm) ? 'in_progress' : 'pending';
  // Current ratings control active CVA progress only. Historical start still
  // governs setup/privacy; reading an older already-cleared row never writes.
  if (!activation && activePin && isCanonicalCvaReadPin(raw) && samples.length && !['new', 'complete'].includes(displayStatus)) {
    const statuses = await canonicalCvaStatuses(db, sessionId);
    displayStatus = Object.values(statuses).some(sample => sample.hasAnyFeedback) ? 'in_progress' : 'pending';
  }
  if (activation && raw.cuppingForm === 2 && !state.completed && raw.status !== 'complete') {
    displayStatus = await creatorHasSavedScoreWithDb(db, sessionId, 2) ? 'in_progress' : 'pending';
  }
  const projected = {
    id: raw.id, sessionUUID: raw.sessionUUID, sessionDisplayId: raw.sessionDisplayId,
    sessionName: raw.sessionName, sessionType: raw.sessionType, sessionDate: raw.sessionDate,
    samplesInSession: raw.samplesInSession, status: displayStatus, cuppingForm: raw.cuppingForm,
    formKey: raw.formKey, formVersion: raw.formVersion, formHash: raw.formHash,
    cuppingMode: raw.cuppingMode, formLocked: raw.formLocked, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
    samples: samples.map((sample, index) => ({
    id: sample.id, cupUUID: sample.cupUUID, cupNumber: sample.cupNumber,
    cuppingForm: sample.cuppingForm, cuppingMode: sample.cuppingMode,
    sampleNumber: sample.sampleNumber, sampleCode: sample.sampleCode, positionIndex: sample.positionIndex,
    ...(activation ? { tastingActive: targetActive(sample) } : {}),
    localRemoval: localRemoval[sample.id] || { canRemove: false },
    coffeeNameOrigin: showSample(sample) ? sample.coffeeNameOrigin : `Sample ${sample.sampleCode || Number(sample.sampleNumber) || index + 1}`,
    process: showSample(sample) ? sample.process : null, identityHidden: !showSample(sample),
  })) };
  return { session: projected, identityHidden,
    tasting: { ...state, assessmentReady: !(creator?.creator && raw.status === 'new'), canComplete: Boolean(activePin && validActor(actor) && supported && validMode && (activation ? activation.creator===actor && state.activeCount>0 : samples.length) && !state.completed && (activation || raw.status !== 'complete') && !(creator?.creator && raw.status === 'new')),
      canManageSetup, isLocalCreator } };
}

async function creatorRemovalContextWithDb(db, sessionId, sampleId, actor) {
  const denied = { canRemove: false };
  const policy = await creatorActivationWithDb(db, sessionId);
  if (!policy || !validActor(actor) || policy.creator !== actor) return denied;
  const generation = await creatorRemovalGenerationWithDb(db, sessionId, sampleId, actor, policy);
  const activation = policy.rows.find(row => row.sample_id === sampleId);
  if (!activation || generation === Number.MAX_SAFE_INTEGER) return denied;
  const session = await getSessionByIdWithDb(db, sessionId);
  const sample = session.samples.find(row => row.id === sampleId);
  if (session.cuppingMode != null && !['open','blind'].includes(session.cuppingMode) ||
      session.cuppingForm === 2 && session.cuppingMode !== 'open' ||
      session.samples.some(row => row.cuppingForm !== session.cuppingForm || !['open','blind'].includes(row.cuppingMode) ||
        session.cuppingForm === 2 && row.cuppingMode !== 'open' || !Number.isInteger(row.cupNumber) || row.cupNumber < 1 || row.cupNumber > 8)) return denied;
  if (!sample || sample.cuppingForm !== session.cuppingForm || !Number.isInteger(sample.cupNumber) ||
      sample.cupNumber < 1 || sample.cupNumber > 8 || !['open','blind'].includes(sample.cuppingMode) ||
      session.cuppingForm === 2 && sample.cuppingMode !== 'open') return denied;
  const access = await streamWithDb(db, sessionId, sampleId, session.cuppingForm, actor);
  if (!['fresh','mine'].includes(access.state)) return denied;
  const revision = await revisionWithDb(db, sessionId, actor);
  if (!revision.matches || await db.getFirstAsync('SELECT local_profile_id FROM local_tasting_revisions WHERE session_id=? AND local_profile_id<>? LIMIT 1', [sessionId,actor])) return denied;
  if (session.cuppingForm === 1) await readCanonicalCva(db, sessionId, sampleId);
  else await getLegacyResponseWithDb(db, sessionId, sampleId);
  const recovery = await db.getAllAsync('SELECT * FROM local_legacy_recovery_drafts WHERE sample_id=? ORDER BY local_profile_id', [sampleId]);
  for (const row of recovery) {
    if (session.cuppingForm !== 2 || row.session_id !== sessionId || row.local_profile_id !== actor ||
        row.base_fingerprint !== await legacyFingerprintWithDb(db,sessionId,sampleId,actor) ||
        row.context_json !== canonicalize({sessionId,sampleId,pin:trustedLegacySession(session).identity,count:sample.cupNumber}) ||
        typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) || new Date(row.updated_at).toISOString() !== row.updated_at) return denied;
    try { if (canonicalize(JSON.parse(row.response_json)) !== row.response_json || !validateResponse({...trustedLegacySession(session),cup_count:sample.cupNumber,response:JSON.parse(row.response_json),complete:false},trustedLegacySession(session)).ok) return denied; }
    catch { return denied; }
  }
  const childTables = ['sample_feedback_entries','sample_defect_entries','sample_flavour_observations','cva_response_revisions','legacy_responses','local_response_streams'];
  if (await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_feedback'")) childTables.push('sample_feedback');
  for (const table of childTables) {
    if (await db.getFirstAsync(`SELECT sample_id FROM ${table} WHERE sample_id=? AND (session_id IS NULL OR session_id<>?) LIMIT 1`,[sampleId,sessionId])) return denied;
  }
  return { canRemove:true, kind:policy.kind==='participant'?'participant-tasting':'creator-tasting', label:sample.sampleCode,
    removalToken:sha256(canonicalize({actor,sessionId,sampleId,generation,activation:{...activation},revision:revision.revision,hash:revision.hash,recovery:recovery.map(row=>({...row}))})) };
}

export async function removeCreatorTastingSample({sessionId,sampleId,expectedRemovalToken} = {}) {
  return removeEnrolledTastingSample({sessionId,sampleId,expectedRemovalToken},'creator');
}

async function removeEnrolledTastingSample({sessionId,sampleId,expectedRemovalToken},kind) {
  const command = {sessionId,sampleId,expectedRemovalToken}, db = await getLocalDatabase(), actor = await getLocalProfileIdentity();
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    const context = await creatorRemovalContextWithDb(txn,command.sessionId,command.sampleId,actor);
    if (!context.canRemove || !command.expectedRemovalToken || context.removalToken !== command.expectedRemovalToken) tastingFail('tasting:stale_removal');
    const policy = await assertCreatorTargetActiveWithDb(txn,command.sessionId,command.sampleId,actor);
    if ((policy.kind||'creator')!==kind)tastingFail('tasting:stale_removal');
    const generation = await creatorRemovalGenerationWithDb(txn,command.sessionId,command.sampleId,actor,policy);
    const session = await getSessionByIdWithDb(txn,command.sessionId), sample = session.samples.find(row=>row.id===command.sampleId);
    await persistHistoryWithDb(txn,command.sessionId);
    // Preserve immutable completion provenance before reopening the current view.
    await txn.runAsync("UPDATE sessions SET status='pending' WHERE id=?",[command.sessionId]);
    if (session.cuppingForm === 1) {
      const prior = await readCanonicalCva(txn,command.sessionId,command.sampleId);
      await saveCanonicalCva({...txn,withExclusiveTransactionAsync:work=>work(txn)}, {
        sessionId:command.sessionId,sampleId:command.sampleId,response:createCvaDraft(sample.cupNumber),
        expectedRevision:prior.revision,expectedIdentity:prior.trusted.identity,expectedCupCount:sample.cupNumber,
      },generateId,()=>[],async handle=>{
        await writeStreamWithDb(handle,{sessionId:command.sessionId,sampleId:command.sampleId,form:1,actor});
        return {}; // Repository owns progress; clearing is not a tasting start.
      });
    } else await txn.runAsync('DELETE FROM legacy_responses WHERE session_id=? AND sample_id=?',[command.sessionId,command.sampleId]);
    await txn.runAsync('DELETE FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?',[command.sessionId,command.sampleId,actor]);
    for (const table of ['sample_feedback_entries','sample_defect_entries','sample_flavour_observations']) {
      await txn.runAsync(`DELETE FROM ${table} WHERE session_id=? AND sample_id=?`,[command.sessionId,command.sampleId]);
    }
    if (await txn.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_feedback'")) {
      await txn.runAsync('DELETE FROM sample_feedback WHERE session_id=? AND sample_id=?',[command.sessionId,command.sampleId]);
    }
    const tables=selectionTables(policy);
    await txn.runAsync(`INSERT INTO ${tables.removals}
      (session_id,local_profile_id,sample_id,sample_code,${tables.binding},generation,removed_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(session_id,local_profile_id,sample_id) DO UPDATE SET generation=excluded.generation,removed_at=excluded.removed_at`,
    [command.sessionId,actor,command.sampleId,sample.sampleCode,policy.snapshot,generation+1,new Date().toISOString()]);
    await txn.runAsync(`DELETE FROM ${tables.activations} WHERE session_id=? AND sample_id=? AND local_profile_id=?`,[command.sessionId,command.sampleId,actor]);
    await commitRevisionWithDb(txn,command.sessionId,actor);
    await recomputeSessionProgressStatusWithDb(txn,command.sessionId);
    output = {deactivated:true,presentation:await getLocalTastingPresentationWithDb(txn,command.sessionId,'tasting',actor),statuses:await getSessionSampleFinalStatusWithDb(txn,command.sessionId)};
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  const acknowledged = await getLocalTastingPresentation(command.sessionId);
  if (acknowledged.tasting.contextToken !== output.presentation.tasting.contextToken || acknowledged.session.samples.find(row=>row.id===command.sampleId)?.tastingActive !== false) tastingFail('tasting:ack_changed');
  await requireSameTastingActor(actor);
  return output;
}

async function participantRemovalContextWithDb(db, sessionId, sampleId, actor) {
  const policy=await participantActivationWithDb(db,sessionId);
  if(policy)return creatorRemovalContextWithDb(db,sessionId,sampleId,actor);
  const denied = { canRemove: false };
  if (!validActor(actor)) return denied;
  const session = await getSessionByIdWithDb(db, sessionId);
  const creator = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id=?', [sessionId]);
  const sample = session?.samples.find(row => row.id === sampleId);
  if (!session || creator?.creator !== null || !sample ||
      !isActiveFormPin(session, session.cuppingForm) || ![1,2].includes(session.cuppingForm) ||
      !['pending','in_progress'].includes(session.status) || sample.cuppingForm !== session.cuppingForm ||
      !Number.isInteger(sample.cupNumber) || sample.cupNumber < 1 || sample.cupNumber > 8 ||
      !['blind','open'].includes(sample.cuppingMode) || session.cuppingForm === 2 && (session.cuppingMode !== 'open' || sample.cuppingMode !== 'open')) return denied;
  if (session.cuppingMode != null && !['open','blind'].includes(session.cuppingMode) ||
      !Number.isInteger(sample.sampleNumber) || sample.sampleNumber < 1 || !cleanString(sample.cupUUID) ||
      session.samples.some(row => row.cuppingForm !== session.cuppingForm || !['open','blind'].includes(row.cuppingMode) || session.cuppingForm===2&&row.cuppingMode!=='open' ||
        !Number.isInteger(row.cupNumber) || row.cupNumber < 1 || row.cupNumber > 8)) return denied;
  const revision = await revisionWithDb(db, sessionId, actor);
  if (!revision.matches || await db.getFirstAsync('SELECT local_profile_id FROM local_tasting_revisions WHERE session_id=? AND local_profile_id<>? LIMIT 1', [sessionId, actor])) return denied;
  const access = await streamWithDb(db, sessionId, sampleId, session.cuppingForm, actor);
  if (!['fresh','mine'].includes(access.state)) return denied;
  const recovery = await db.getAllAsync('SELECT * FROM local_legacy_recovery_drafts WHERE sample_id=? ORDER BY local_profile_id', [sampleId]);
  if (recovery.some(row => row.session_id !== sessionId || row.local_profile_id !== actor)) return denied;
  for (const row of recovery) {
    if (session.cuppingForm !== 2 || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) ||
        new Date(row.updated_at).toISOString() !== row.updated_at || row.context_json !== canonicalize({ sessionId, sampleId,
          pin:trustedLegacySession(session).identity, count:sample.cupNumber })) return denied;
    if (row.base_fingerprint !== await legacyFingerprintWithDb(db, sessionId, sampleId, actor)) return denied;
    try { if (!validateResponse({ ...trustedLegacySession(session), cup_count:sample.cupNumber, response:JSON.parse(row.response_json), complete:false }, trustedLegacySession(session)).ok) return denied; }
    catch { return denied; }
  }
  const childTables = ['sample_feedback_entries','sample_defect_entries','sample_flavour_observations','cva_response_revisions','legacy_responses','local_response_streams'];
  const oldFeedback = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_feedback'");
  if (oldFeedback) childTables.push('sample_feedback');
  for (const table of childTables) {
    if (await db.getFirstAsync(`SELECT sample_id FROM ${table} WHERE sample_id=? AND (session_id IS NULL OR session_id<>?) LIMIT 1`, [sampleId, sessionId])) return denied;
    if (access.state === 'fresh' && ['sample_feedback_entries','sample_defect_entries','sample_flavour_observations','sample_feedback'].includes(table) &&
        await db.getFirstAsync(`SELECT sample_id FROM ${table} WHERE sample_id=? LIMIT 1`, [sampleId])) return denied;
  }
  // Validate a committed owned response under its actual pinned contract before
  // granting destructive local removal; unknown policy/identity is not authority.
  if (access.source) {
    if (session.cuppingForm === 1) await readCanonicalCva(db, sessionId, sampleId);
    else await getLegacyResponseWithDb(db, sessionId, sampleId);
  }
  const label = `Sample ${Number(sample.sampleNumber) || session.samples.indexOf(sample) + 1}`;
  return { canRemove: true, label, removalToken: sha256(canonicalize({ version:1, actor, sessionId, sampleId,
    sample:{...sample}, creator:null, revision:revision.revision, hash:revision.hash, recovery:recovery.map(row=>({...row})) })) };
}

export async function getParticipantSampleRemovalContext(sessionId, sampleId) {
  const db = await getLocalDatabase(), actor = await getLocalProfileIdentity();
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    output = await participantRemovalContextWithDb(txn, sessionId, sampleId, actor);
    await requireSameTastingActor(actor);
  });
  return output;
}

export async function removeParticipantSample({ sessionId, sampleId, expectedRemovalToken } = {}) {
  const enrollmentDb=await getLocalDatabase();
  if(await participantActivationWithDb(enrollmentDb,sessionId))return removeEnrolledTastingSample({sessionId,sampleId,expectedRemovalToken},'participant');
  const command = { sessionId, sampleId, expectedRemovalToken };
  const db = await getLocalDatabase(), actor = await getLocalProfileIdentity();
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    const context = await participantRemovalContextWithDb(txn, command.sessionId, command.sampleId, actor);
    if (!context.canRemove || !command.expectedRemovalToken || context.removalToken !== command.expectedRemovalToken) tastingFail('tasting:stale_removal');
    await persistHistoryWithDb(txn, command.sessionId);
    if (await txn.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_feedback'")) {
      await txn.runAsync('DELETE FROM sample_feedback WHERE sample_id=? AND session_id=?', [command.sampleId, command.sessionId]);
    }
    await txn.runAsync('DELETE FROM samples WHERE id=? AND session_id=?', [command.sampleId, command.sessionId]);
    const remaining = await txn.getFirstAsync('SELECT COUNT(*) AS count FROM samples WHERE session_id=?', [command.sessionId]);
    await commitRevisionWithDb(txn, command.sessionId, actor, { starts: Number(remaining.count) === 0 });
    await recomputeSessionProgressStatusWithDb(txn, command.sessionId);
    output = { deleted:true, presentation: await getLocalTastingPresentationWithDb(txn, command.sessionId, 'tasting', actor),
      statuses: await getSessionSampleFinalStatusWithDb(txn, command.sessionId) };
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  const acknowledged = await getLocalTastingPresentation(command.sessionId);
  await requireSameTastingActor(actor);
  if (acknowledged.tasting.contextToken !== output.presentation.tasting.contextToken) tastingFail('tasting:ack_changed');
  return output;
}

export async function completeLocalTasting(sessionId, { expectedContextToken } = {}) {
  const db = await getLocalDatabase();
  const actor = await getLocalProfileIdentity();
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    const presentation = await getLocalTastingPresentationWithDb(txn, sessionId, 'tasting', actor);
    if (!expectedContextToken || expectedContextToken !== presentation.tasting.contextToken) tastingFail('tasting:stale_context');
    // Validate current pin/mode before returning an idempotent acknowledgement.
    const session = await getSessionByIdWithDb(txn, sessionId);
    if ((!isActiveFormPin(session, 1) && !isActiveFormPin(session, 2)) ||
        !['new', 'pending', 'in_progress', 'complete'].includes(session.status)) tastingFail('tasting:unsupported');
    const creatorCompletion = await creatorCompletionWithDb(txn,sessionId,actor);
    if (creatorCompletion) {
      if (!creatorCompletion.activeCount || !creatorCompletion.snapshot) tastingFail('tasting:unavailable');
      const incompleteSamples=[];
      // Validate only active saved assessments, never the inactive roster's
      // response/finality or UI summaries. Recovery is not a saved result.
      for (const target of creatorCompletion.snapshot.active) {
        const access=await streamWithDb(txn,sessionId,target.id,session.cuppingForm,actor);
        const saved=session.cuppingForm===1 ? await readCanonicalCva(txn,sessionId,target.id) : await getLegacyResponseWithDb(txn,sessionId,target.id);
        if (access.state!=='mine' || !saved.complete || !saved.result?.ok) incompleteSamples.push({sampleId:target.id,label:target.code});
      }
      if (incompleteSamples.length) {
        await requireSameTastingActor(actor);
        output={status:'incomplete',incompleteSamples,tasting:presentation.tasting};return;
      }
      if (!creatorCompletion.base.row) tastingFail('tasting:stale_content');
      if (!creatorCompletion.completed) {
        await persistHistoryWithDb(txn,sessionId,{completed:true});
        const policy=await creatorActivationWithDb(txn,sessionId);
        await txn.runAsync(`INSERT INTO ${selectionTables(policy).completions}
          (session_id,local_profile_id,schema_version,snapshot_json,snapshot_hash,completed_at) VALUES (?,?,1,?,?,?)`,
        [sessionId,actor,creatorCompletion.json,creatorCompletion.hash,new Date().toISOString()]);
        await txn.runAsync("UPDATE sessions SET status='complete',updated_at=? WHERE id=?",[new Date().toISOString(),sessionId]);
      }
      await requireSameTastingActor(actor);
      const acknowledged=await getLocalTastingPresentationWithDb(txn,sessionId,'tasting',actor);
      if (!acknowledged.tasting.completed || acknowledged.tasting.contextToken!==expectedContextToken) tastingFail('tasting:ack_changed');
      await requireSameTastingActor(actor);
      output={status:'complete',tasting:acknowledged.tasting};return;
    }
    if (presentation.tasting.completed) {
      if (presentation.session.samples.some(sample => sample.identityHidden)) tastingFail('tasting:unsupported');
      await requireSameTastingActor(actor);
      output = { status: 'complete', tasting: presentation.tasting }; return;
    }
    if (!presentation.tasting.canComplete) tastingFail('tasting:unavailable');
    const statuses = await getSessionSampleFinalStatusWithDb(txn, sessionId);
    const incompleteSamples = [];
    for (const [index, sample] of session.samples.entries()) {
      const access = await streamWithDb(txn, sessionId, sample.id, session.cuppingForm, actor);
      if (access.state !== 'mine' || !statuses[sample.id]?.isComplete) {
        incompleteSamples.push({ sampleId: sample.id, label: `Sample ${Number(sample.sampleNumber) || index + 1}` });
      }
    }
    if (incompleteSamples.length) {
      await requireSameTastingActor(actor);
      output = { status: 'incomplete', incompleteSamples, tasting: presentation.tasting }; return;
    }
    await requireSameTastingActor(actor);
    await completeTastingWithDb(txn, sessionId, actor);
    output = { status: 'complete', tasting: (await getLocalTastingPresentationWithDb(txn, sessionId, 'tasting', actor)).tasting };
    await requireSameTastingActor(actor);
  });
  if (output?.tasting?.activeSelection) {
    await requireSameTastingActor(actor);
    const acknowledged=await getLocalTastingPresentation(sessionId);
    if (acknowledged.tasting.contextToken!==expectedContextToken || output.status==='complete'&&!acknowledged.tasting.completed) tastingFail('tasting:ack_changed');
    await requireSameTastingActor(actor);
  }
  return output;
}

export async function adoptSavedTasting({ sessionId, sampleId, expectedSourceToken } = {}) {
  const db = await getLocalDatabase();
  const actor = await getLocalProfileIdentity();
  if (!validActor(actor) || typeof expectedSourceToken !== 'string' || !expectedSourceToken) tastingFail('tasting:stale_review');
  let form;
  let committedSource;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    await assertAssessmentReadyWithDb(txn, sessionId, sampleId, actor);
    const session = await getSessionByIdWithDb(txn, sessionId);
    if (!(await revisionWithDb(txn, sessionId, actor)).matches) tastingFail('tasting:stale_content');
    form = session?.cuppingForm;
    if ((!isActiveFormPin(session, 1) && !isActiveFormPin(session, 2)) || !['new', 'pending', 'in_progress'].includes(session?.status)) tastingFail('tasting:read_only');
    if (await adoptionDuplicateWithDb(txn, sessionId, sampleId, actor, expectedSourceToken)) {
      committedSource = await adoptionAckIdentityWithDb(txn, sessionId, sampleId, form, actor);
      await requireSameTastingActor(actor); return;
    }
    const prior = form === 1 ? await readCanonicalCva(txn, sessionId, sampleId) : await getLegacyResponseWithDb(txn, sessionId, sampleId);
    if (!prior.response) tastingFail('tasting:stale_review');
    if (form === 1) {
      const scoped = { getFirstAsync: (...args) => txn.getFirstAsync(...args), getAllAsync: (...args) => txn.getAllAsync(...args),
        runAsync: (...args) => txn.runAsync(...args), withExclusiveTransactionAsync: callback => callback(scoped) };
      await saveCanonicalCva(scoped, { sessionId, sampleId, response: prior.response, expectedRevision: prior.revision,
        expectedIdentity: prior.trusted.identity, expectedCupCount: prior.n }, generateId, cvaDescriptors, async handle => {
        await requireSameTastingActor(actor);
        await writeStreamWithDb(handle, { sessionId, sampleId, form, actor, expectedSourceToken });
        return { preserveDraft: !prior.complete, finalize: async () => {
          await commitRevisionWithDb(handle, sessionId, actor, { starts: hasScoreOrNote(prior.response, form) });
          await requireSameTastingActor(actor);
        } };
      });
    } else {
      const sample = session.samples.find(row => row.id === sampleId);
      const validation = validateResponse({ ...trustedLegacySession(session), cup_count: sample.cupNumber,
        response: prior.response, complete: Boolean(prior.complete) }, trustedLegacySession(session));
      if (!validation.ok) tastingFail('tasting:invalid_saved_response');
      await writeStreamWithDb(txn, { sessionId, sampleId, form, actor, expectedSourceToken });
      // Adoption does not alter any saved judgement or its finality. The exact
      // original row has been retained by writeStreamWithDb before this write.
      await txn.runAsync('UPDATE legacy_responses SET updated_at = ? WHERE session_id = ? AND sample_id = ?',
        [new Date().toISOString(), sessionId, sampleId]);
      await commitRevisionWithDb(txn, sessionId, actor, { starts: hasScoreOrNote(prior.response, form) });
    }
    committedSource = await adoptionAckIdentityWithDb(txn, sessionId, sampleId, form, actor);
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  const acknowledged = form === 1 ? await getCvaResponse(sessionId, sampleId) : await getLegacyResponse(sessionId, sampleId);
  await requireSameTastingActor(actor);
  if ((form === 1 ? acknowledged.revision : acknowledged.savedFingerprint) !== committedSource) tastingFail('tasting:ack_changed');
  return acknowledged;
}

async function adoptionAckIdentityWithDb(db, sessionId, sampleId, form, actor) {
  if (form === 2) return legacyFingerprintWithDb(db, sessionId, sampleId, actor);
  const row = await db.getFirstAsync('SELECT revision FROM cva_response_revisions WHERE session_id=? AND sample_id=? ORDER BY revision DESC LIMIT 1', [sessionId, sampleId]);
  return row?.revision;
}

async function getSessionByIdWithDb(db, sessionId, { reconcile = true } = {}) {
  if (reconcile) await reconcileCompletedSessions(db);

  const session = await db.getFirstAsync(
    `
      SELECT
        id,
        session_uuid AS sessionUUID,
        session_display_id AS sessionDisplayId,
        session_name AS sessionName,
        session_type AS sessionType,
        samples_in_session AS samplesInSession,
        status,
        session_date AS sessionDate,
        cupping_form AS cuppingForm,
        form_key AS formKey,
        form_version AS formVersion,
        form_hash AS formHash,
        cupping_mode AS cuppingMode,
        form_locked AS formLocked,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  if (!session) {
    return null;
  }

  const samples = await db.getAllAsync(
    `
      SELECT
        id,
        cup_uuid AS cupUUID,
        cup_number AS cupNumber,
        cupping_form AS cuppingForm,
        cupping_mode AS cuppingMode,
        sample_number AS sampleNumber,
        sample_code AS sampleCode,
        sample_metadata_json AS metadataJson,
        coffee_name_origin AS coffeeNameOrigin,
        process,
        position_index AS positionIndex
      FROM samples
      WHERE session_id = ?
      ORDER BY position_index ASC, created_at ASC
    `,
    [sessionId]
  );

  return {
    ...session,
    samples: samples || [],
  };
}

async function assertPinnedSessionWithDb(db, sessionId) {
  const row = await db.getFirstAsync(
    `SELECT status, cupping_form AS cuppingForm, form_key AS formKey,
            form_version AS formVersion, form_hash AS formHash, cupping_mode AS cuppingMode
     FROM sessions WHERE id = ? LIMIT 1`,
    [sessionId]
  );
  if (isCanonicalCvaReadPin(row) && !isActiveFormPin(row, 1)) {
    throw new Error('This historical CVA session is read-only. No record was changed.');
  }
  if (!isPinnedForm(row, row?.cuppingForm) || !['new', 'pending', 'in_progress', 'complete'].includes(row.status) || (row.cuppingForm === 2 && row.cuppingMode !== 'open')) {
    throw new Error("This older or unsupported prototype session is read-only. No record was changed.");
  }
}

export async function findSampleInSessionByCupUUID({ sessionId, cupUUID } = {}) {
  throw new Error('Scan the cup metadata to resolve its session and sample code. Physical identity alone is not a sample.');
}

async function findSampleInSessionByCupUUIDWithDb(db, { sessionId, cupUUID } = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedSessionId || !normalizedCupUUID) {
    return null;
  }

  const row = await db.getFirstAsync(
    `
      SELECT
        id,
        session_id AS sessionId,
        cup_uuid AS cupUUID,
        cup_number AS cupNumber,
        cupping_form AS cuppingForm,
        cupping_mode AS cuppingMode,
        sample_number AS sampleNumber,
        sample_code AS sampleCode,
        sample_metadata_json AS metadataJson,
        coffee_name_origin AS coffeeNameOrigin,
        process,
        position_index AS cupIndex,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM samples
      WHERE session_id = ? AND cup_uuid = ?
      LIMIT 1
    `,
    [normalizedSessionId, normalizedCupUUID]
  );

  return row || null;
}

export async function upsertSessionFromCupMetadata(input = {}) {
  input = { ...input };
  const db = await getLocalDatabase();
  let result;
  await db.withExclusiveTransactionAsync(async txn => { result = await importSessionWithDb(txn, input); });
  return result;
}

async function importSessionWithDb(db, {
  sessionUUID,
  cuppingForm,
  sessionName,
  sessionType,
  sessionDate,
  samplesInSession,
  status = "new",
  expectedExistingSessionId = null,
  cuppingMode = null,
} = {}) {
  const f = requireFormTag({ f: cuppingForm });
  const pinnedForm = formIdentity(f);
  const normalizedSessionUUID = normalizeSessionUuid(sessionUUID);
  if (!normalizedSessionUUID) {
    throw new Error("sessionUUID is required to upsert a session.");
  }

  const nowIso = new Date().toISOString();
  const existing = await findSessionBySessionUUIDWithDb(db, normalizedSessionUUID);
  if (expectedExistingSessionId && existing?.id !== expectedExistingSessionId) {
    throw new Error('This local session was removed or changed while scanning. Scan again to import a new local copy.');
  }
  if (existing && !isPinnedForm(existing, f)) {
    throw new Error("This cup refers to an older or unsupported prototype session. Its local data was not changed.");
  }
  if (existing && !isActiveFormPin(existing, f) && !isPrototypeCvaPin(existing)) {
    throw new Error('This cup refers to a read-only historical form version. Its saved data was not changed.');
  }
  if (f === 2 && (existing ? existing.cuppingMode !== 'open' : cuppingMode !== 'open')) {
    throw new Error('SCA Legacy cup is not linked to a trusted local Open Cupping session. No local data was changed.');
  }
  if (f === 2 && existing) return existing;
  const provenance = existing && await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?', [existing.id]);
  if (provenance?.creator) {
    // Earlier cups legitimately carry the old total/header after another sample
    // is added or organiser metadata changes. Those tag fields are observations,
    // never authority to update local setup. The sample import still requires an
    // exact known assignment, form, mode, cup count, identity and position.
    return existing;
  }
  // A trusted local historical pin is authority; a tag's f=1 never upgrades it.
  if (isPrototypeCvaPin(existing)) return existing;
  const sessionId = cleanString(existing?.id) || normalizedSessionUUID;
  const createdAt = cleanString(existing?.createdAt) || nowIso;
  const nextStatus = cleanString(existing?.status || status).toLowerCase() || "new";
  const nextSessionName = cleanString(sessionName) || cleanString(existing?.sessionName) || "Imported Session";
  const nextSessionType = getSessionTypeLabel(sessionType) || cleanString(existing?.sessionType) || "Other";
  const nextSessionDate = getSessionDateLabel(sessionDate) || cleanString(existing?.sessionDate) || formatSessionDateFallback(new Date());
  const nextSamplesInSession = normalizePositiveInteger(samplesInSession, Number(existing?.samplesInSession) || 0);
  const nextDisplayId = cleanString(existing?.sessionDisplayId) || `SESSION-${normalizedSessionUUID.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await db.runAsync(
    `
      INSERT INTO sessions (
        id, session_uuid, session_display_id, session_name, session_type, samples_in_session, status, session_date,
        cupping_form, form_key, form_version, form_hash, cupping_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_uuid = excluded.session_uuid,
        session_display_id = excluded.session_display_id,
        session_name = excluded.session_name,
        session_type = excluded.session_type,
        samples_in_session = excluded.samples_in_session,
        status = excluded.status,
        session_date = excluded.session_date,
        cupping_form = excluded.cupping_form,
        form_key = excluded.form_key,
        form_version = excluded.form_version,
        form_hash = excluded.form_hash,
        cupping_mode = excluded.cupping_mode,
        updated_at = excluded.updated_at
    `,
    [
      sessionId,
      normalizedSessionUUID,
      nextDisplayId,
      nextSessionName,
      nextSessionType,
      nextSamplesInSession,
      nextStatus,
      nextSessionDate,
      pinnedForm.f,
      pinnedForm.form_key,
      pinnedForm.form_version,
      pinnedForm.form_hash,
      f === 2 ? 'open' : null,
      createdAt,
      nowIso,
    ]
  );

  return {
    id: sessionId,
    sessionUUID: normalizedSessionUUID,
    sessionDisplayId: nextDisplayId,
    sessionName: nextSessionName,
    sessionType: nextSessionType,
    samplesInSession: nextSamplesInSession,
    status: nextStatus,
    sessionDate: nextSessionDate,
    cuppingForm: pinnedForm.f,
    formKey: pinnedForm.form_key,
    formVersion: pinnedForm.form_version,
    formHash: pinnedForm.form_hash,
    cuppingMode: f === 2 ? 'open' : null,
    createdAt,
    updatedAt: nowIso,
  };
}

export async function upsertSessionSampleFromCupMetadata(input = {}) {
  input = { ...input };
  const db = await getLocalDatabase();
  let result;
  await db.withExclusiveTransactionAsync(async txn => { result = await importSampleWithDb(txn, input); });
  return result;
}

async function importSampleWithDb(db, {
  sessionId,
  cupUUID,
  coffeeNameOrigin,
  process,
  cupNumber,
  cuppingForm,
  cuppingMode,
  sampleNumber,
  expectedExistingSampleId = undefined,
  capturedActor = undefined,
} = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedSessionId || !normalizedCupUUID) {
    throw new Error("sessionId and cupUUID are required to upsert a sample.");
  }

  await assertNoPendingWithDb(db,normalizedSessionId);
  if(await db.getFirstAsync('SELECT session_id FROM local_pending_sample_additions WHERE cup_uuid=?',[normalizedCupUUID]))throw new Error('This cup has an unfinished assignment. Finish its pending check before tasting.');

  const nowIso = new Date().toISOString();
  const existing = await findSampleInSessionByCupUUIDWithDb(db, {
    sessionId: normalizedSessionId,
    cupUUID: normalizedCupUUID,
  });
  if (expectedExistingSampleId !== undefined && (existing?.id ?? null) !== expectedExistingSampleId) tastingFail('tasting:stale_membership');

  const sampleCountRow = await db.getFirstAsync(
    `
      SELECT COUNT(*) AS count, COALESCE(MAX(position_index), -1) AS lastPosition
      FROM samples
      WHERE session_id = ?
    `,
    [normalizedSessionId]
  );
  const sampleCount = Number(sampleCountRow?.count) || 0;
  const nextCupIndex =
    existing && Number.isInteger(Number(existing.cupIndex))
      ? Number(existing.cupIndex)
      : Number(sampleCountRow?.lastPosition ?? sampleCount - 1) + 1;

  const sampleId = cleanString(existing?.id) || generateId();
  const createdAt = cleanString(existing?.createdAt) || nowIso;
  const nextCupNumber = coerceCupNumber(cupNumber ?? existing?.cupNumber);
  const pinnedSession = await getSessionByIdWithDb(db, normalizedSessionId, { reconcile: cuppingForm !== 2 });
  if (!isPinnedForm(pinnedSession, cuppingForm) || (existing && existing.cuppingForm !== cuppingForm)) {
    throw new Error("Cup form does not match the session form. No sample was changed.");
  }
  if (cuppingForm === 1 && !isActiveFormPin(pinnedSession, 1) && !isPrototypeCvaPin(pinnedSession)) {
    throw new Error('This historical CVA session is read-only. No sample was changed.');
  }
  const nextCuppingForm = cuppingForm;
  if (nextCuppingForm === 1 && isActiveFormPin(pinnedSession, 1) && existing) {
    const captured = await db.getFirstAsync('SELECT revision FROM cva_response_revisions WHERE sample_id = ? LIMIT 1', [existing.id]);
    if (captured && existing.cupNumber !== nextCupNumber) throw new Error('Cannot change the cup count after a CVA response was saved.');
  }
  if (nextCuppingForm === 2 && existing && Number(existing.cupNumber) !== nextCupNumber) {
    const responseRow = await db.getFirstAsync('SELECT sample_id FROM legacy_responses WHERE sample_id = ? LIMIT 1', [existing.id]);
    if (responseRow) throw new Error('Cannot change the cup count after a Legacy response was saved. No local record was changed.');
  }
  const nextCuppingMode = requireTagCuppingMode(
    cuppingMode === "b" || cuppingMode === "o" ? { m: cuppingMode } : { cuppingMode }
  );
  if (nextCuppingForm === 2 && (pinnedSession.cuppingMode !== 'open' || nextCuppingMode !== 'open')) {
    throw new Error('SCA Legacy Blind Cupping is not yet available. No local record was changed.');
  }
  const provenance = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?', [normalizedSessionId]);
  const observedCount = observedPositiveInteger(cupNumber, 8);
  const observedPosition = observedPositiveInteger(sampleNumber);
  if (!provenance?.creator && !existing && (observedCount === null || observedPosition === null)) {
    throw new Error('Cup assignment count or assigned position is missing or invalid. No local record was changed.');
  }
  if (provenance?.creator && existing && (observedCount === null || (sampleNumber !== undefined && observedPosition === null))) {
    throw new Error('Cup assignment count or position is missing or invalid. No local record was changed.');
  }
  if (nextCuppingForm === 2 && (existing || provenance?.creator)) {
    if (!existing) {
      throw new Error('This Legacy cup has no trusted local assignment. Reopen the Session and assign the cup before scanning; no local data was changed.');
    }
    if (Number(existing.cupNumber) !== nextCupNumber ||
        cleanString(coffeeNameOrigin) !== existing.coffeeNameOrigin ||
        String(process) !== String(existing.process) ||
        normalizePositiveInteger(sampleNumber, existing.sampleNumber) !== Number(existing.sampleNumber)) {
      throw new Error('Legacy cup metadata conflicts with its trusted local assignment. No local record was changed.');
    }
    return existing;
  }
  if (provenance?.creator) {
    if (!existing || existing.cupNumber !== observedCount || existing.cuppingMode !== nextCuppingMode ||
        cleanString(coffeeNameOrigin) !== existing.coffeeNameOrigin || cleanString(process) !== String(existing.process) ||
        (sampleNumber !== undefined && observedPosition !== Number(existing?.sampleNumber))) {
      throw new Error('Cup metadata conflicts with locally created sample assignment. No local record was changed.');
    }
    return existing;
  }
  if ((pinnedSession.samples || []).some((sample) => sample.cuppingMode !== nextCuppingMode)) {
    throw new Error("Cup cupping mode conflicts with its stored session samples. No local record was changed.");
  }
  const nextSampleNumber = normalizePositiveInteger(
    sampleNumber,
    Number(existing?.sampleNumber) || nextCupIndex + 1
  );
  const nextCoffeeNameOrigin =
    cleanString(coffeeNameOrigin) || cleanString(existing?.coffeeNameOrigin);
  const nextProcess = cleanString(process) || cleanString(existing?.process);
  const importingActor = capturedActor ?? await getOrCreateLocalProfileIdentity();
  await requireSameTastingActor(importingActor);
  const beforeImport = await revisionWithDb(db, normalizedSessionId, importingActor);
  if (!beforeImport.matches) tastingFail('tasting:stale_content');
  if (existing && (existing.cupNumber !== nextCupNumber || existing.cuppingMode !== nextCuppingMode ||
      existing.sampleNumber !== nextSampleNumber || existing.coffeeNameOrigin !== nextCoffeeNameOrigin ||
      String(existing.process) !== nextProcess)) {
    throw new Error('Cup metadata conflicts with its stored local sample. No local record was changed.');
  }
  if (existing) return existing;

  await db.runAsync(
    `
      INSERT INTO samples (
        id, session_id, cup_uuid, cup_number, cupping_form, cupping_mode, sample_number, coffee_name_origin, process, position_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, cup_uuid) DO UPDATE SET
        cup_number = excluded.cup_number,
        cupping_form = excluded.cupping_form,
        cupping_mode = excluded.cupping_mode,
        sample_number = excluded.sample_number,
        coffee_name_origin = excluded.coffee_name_origin,
        process = excluded.process,
        position_index = excluded.position_index,
        updated_at = excluded.updated_at
    `,
    [
      sampleId,
      normalizedSessionId,
      normalizedCupUUID,
      nextCupNumber,
      nextCuppingForm,
      nextCuppingMode,
      nextSampleNumber,
      nextCoffeeNameOrigin,
      nextProcess,
      nextCupIndex,
      createdAt,
      nowIso,
    ]
  );

  await db.runAsync('UPDATE sessions SET form_locked = 1 WHERE id = ?', [normalizedSessionId]);

  if (!existing) {
    await commitRevisionWithDb(db, normalizedSessionId, importingActor);
    await requireSameTastingActor(importingActor);
  }

  await recomputeSessionProgressStatusWithDb(db, normalizedSessionId);

  return {
    id: sampleId,
    sessionId: normalizedSessionId,
    cupUUID: normalizedCupUUID,
    cupNumber: nextCupNumber,
    cuppingForm: nextCuppingForm,
    cuppingMode: nextCuppingMode,
    sampleNumber: nextSampleNumber,
    coffeeNameOrigin: nextCoffeeNameOrigin,
    process: nextProcess,
    cupIndex: nextCupIndex,
    createdAt,
    updatedAt: nowIso,
  };
}

async function resolveCodeSampleFromMetadata({cupUUID,metadata,isScanCurrent=null}) {
  const assertScanCurrent = () => {
    if (isScanCurrent == null) return;
    let current = false;
    try { current = typeof isScanCurrent === 'function' && isScanCurrent() === true; } catch { /* revoke */ }
    if (!current) tastingFail('tasting:scan_cancelled');
  };
  // Internal decoded aliases may exist, but must agree exactly with compact data.
  const aliases={coffeeName:'n',coffeeProcess:'p',cupNumber:'y',samplesInSession:'i',sampleNumber:'z',sessionName:'e',sessionType:'t',sessionDate:'d',sessionUUID:'u',cuppingMode:'m',cuppingForm:'f'};
  const compact={};
  for(const [key,value] of Object.entries(metadata||{})) {
    if(aliases[key]) {if(value!==metadata[aliases[key]])throw new Error('Conflicting decoded sample metadata.');}
    else compact[key]=value;
  }
  const observed=validateMetadata(compact), target=normalizeCupUuid(cupUUID);
  if(!target)throw new Error('Physical cup identity is unavailable.');
  const db=await getLocalDatabase(),actor=await getOrCreateLocalProfileIdentity();
  let output,ackToken,observedContext;
  await db.withExclusiveTransactionAsync(async txn=>{
    assertScanCurrent();await requireSameTastingActor(actor);
    if(await txn.getFirstAsync('SELECT session_id FROM local_pending_draft_removals WHERE cup_uuid=?',[target]))throw new Error('removal:unfinished');
    const existing=await findSessionBySessionUUIDWithDb(txn,observed.u);
    const enrollment=existing?await txn.getFirstAsync('SELECT incarnation FROM local_participant_tasting_enrollments WHERE session_id=?',[existing.id]):null;
    const revision=existing?await revisionWithDb(txn,existing.id,actor):null;
    const selection=existing?await creatorCompletionWithDb(txn,existing.id,actor):null;
    observedContext=existing?canonicalize({id:existing.id,incarnation:enrollment?.incarnation??null,revision:revision.revision,hash:revision.hash,selection:selection?.contextToken??null}):null;
    await requireSameTastingActor(actor);assertScanCurrent();
  });
  await db.withExclusiveTransactionAsync(async txn=>{
    await requireSameTastingActor(actor);assertScanCurrent();
    if(await txn.getFirstAsync('SELECT session_id FROM local_pending_draft_removals WHERE cup_uuid=?',[target]))throw new Error('removal:unfinished');
    let session=await findSessionBySessionUUIDWithDb(txn,observed.u);
    if(observedContext){
      if(!session)tastingFail('tasting:stale_membership');
      const enrollment=await txn.getFirstAsync('SELECT incarnation FROM local_participant_tasting_enrollments WHERE session_id=?',[session.id]);
      const revision=await revisionWithDb(txn,session.id,actor);
      const selection=await creatorCompletionWithDb(txn,session.id,actor);
      if(!revision.matches||canonicalize({id:session.id,incarnation:enrollment?.incarnation??null,revision:revision.revision,hash:revision.hash,selection:selection?.contextToken??null})!==observedContext)tastingFail('tasting:stale_membership');
    }else if(session)tastingFail('tasting:stale_membership');
    if(!session)session=await importSessionWithDb(txn,{sessionUUID:observed.u,cuppingForm:observed.f,cuppingMode:observed.m==='b'?'blind':'open',sessionName:observed.e,sessionType:observed.t,sessionDate:observed.d,samplesInSession:observed.i,status:'new'});
    await assertNoPendingWithDb(txn,session.id);
    await assertAssessmentReadyWithDb(txn,session.id);
    const setup=await getSessionByIdWithDb(txn,session.id), mode=observed.m==='b'?'blind':'open';
    if(!isActiveFormPin(setup,observed.f)||setup.cuppingMode!=null&&!['open','blind'].includes(setup.cuppingMode)||observed.f===2&&setup.cuppingMode!=='open'||setup.samples.some(sample=>sample.cuppingForm!==observed.f||!['open','blind'].includes(sample.cuppingMode)||observed.f===2&&sample.cuppingMode!=='open'))throw new Error('Cup form or mode conflicts with this session.');
    const creator=await txn.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id=?',[session.id]);
    let sample=setup.samples.find(row=>row.sampleCode===observed.z);
    if(creator?.creator===null&&setup.samples.length){
      if(sample){
        if(!metadataMatches(JSON.parse(sample.metadataJson),observed))throw new Error('Cup metadata conflicts with its stored sample. No scores were changed.');
        await txn.runAsync('INSERT OR IGNORE INTO physical_code_observations(session_id,code,physical_uid) VALUES (?,?,?)',[session.id,observed.z,target]);
      }
      await enrollParticipantWithDb(txn,session.id,actor);
    }
    if(sample) {
      if(!metadataMatches(JSON.parse(sample.metadataJson),observed))throw new Error('Cup metadata conflicts with its stored sample. No scores were changed.');
    } else {
      if(creator?.creator)throw new Error('This code has no verified creator assignment. No sample was added.');
      const before=await revisionWithDb(txn,session.id,actor);if(!before.matches)tastingFail('tasting:stale_content');
      if(setup.status==='complete'){
        const completion=await creatorCompletionWithDb(txn,session.id,actor);
        if(!completion?.completed)tastingFail('tasting:damaged_completion');
        await persistHistoryWithDb(txn,session.id);
        await txn.runAsync("UPDATE sessions SET status='pending' WHERE id=?",[session.id]);
      }
      const id=generateId(), now=new Date().toISOString(),index=setup.samples.length;
      await txn.runAsync(`INSERT INTO samples(id,session_id,cup_uuid,cup_number,cupping_form,cupping_mode,sample_number,sample_code,sample_metadata_json,coffee_name_origin,process,position_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,session.id,target,observed.y,observed.f,mode,index+1,observed.z,JSON.stringify(observed),observed.n,String(observed.p),index,now,now]);
      await txn.runAsync('UPDATE sessions SET form_locked=1 WHERE id=?',[session.id]);
      await commitRevisionWithDb(txn,session.id,actor);
      await recomputeSessionProgressStatusWithDb(txn,session.id);
      sample={id,cupUUID:target,cupNumber:observed.y,cuppingForm:observed.f,cuppingMode:mode,sampleNumber:index+1,sampleCode:observed.z,coffeeNameOrigin:observed.n,process:String(observed.p),positionIndex:index};
    }
    let saved=await getSessionByIdWithDb(txn,session.id);
    await txn.runAsync('INSERT OR IGNORE INTO physical_code_observations(session_id,code,physical_uid) VALUES (?,?,?)',[session.id,observed.z,target]);
    const activation = creator?.creator===null?await enrollParticipantWithDb(txn,session.id,actor):await creatorActivationWithDb(txn, session.id);
    if (activation) {
      assertScanCurrent();
      if (activation.creator !== actor) tastingFail('tasting:foreign_activation');
      if (!creatorTargetActive(activation, actor, sample.id)) {
        if (saved.status === 'complete') {
          const completion=await creatorCompletionWithDb(txn,session.id,actor);
          if (!completion?.completed) tastingFail('tasting:damaged_completion');
          await persistHistoryWithDb(txn,session.id);
          await txn.runAsync("UPDATE sessions SET status='pending' WHERE id=?",[session.id]);
        }
        const tables=selectionTables(activation);
        await txn.runAsync(`INSERT INTO ${tables.activations}
          (session_id,local_profile_id,sample_id,sample_code,${tables.binding},scanned_at) VALUES (?,?,?,?,?,?)`,
        [session.id,actor,sample.id,sample.sampleCode,activation.snapshot,new Date().toISOString()]);
        await recomputeSessionProgressStatusWithDb(txn,session.id);
        saved=await getSessionByIdWithDb(txn,session.id);
      }
    }
    await txn.runAsync('INSERT OR IGNORE INTO physical_code_observations(session_id,code,physical_uid) VALUES (?,?,?)',[session.id,observed.z,target]);
    output={sessionId:saved.id,sessionUUID:saved.sessionUUID,sessionDisplayId:saved.sessionDisplayId,sessionName:saved.sessionName,sessionType:saved.sessionType,sessionStatus:saved.status,sessionDate:saved.sessionDate,sampleId:sample.id,cupUUID:target,cupNumber:sample.cupNumber,cuppingForm:sample.cuppingForm,cuppingMode:sample.cuppingMode,sampleNumber:sample.sampleNumber,sampleCode:sample.sampleCode,coffeeNameOrigin:sample.coffeeNameOrigin,coffeeProcess:sample.process,cupIndex:saved.samples.findIndex(row=>row.id===sample.id),cupTotal:saved.samples.length};
    await requireSameTastingActor(actor);
    if (activation) assertScanCurrent();
    if(activation)ackToken=(await getLocalTastingPresentationWithDb(txn,session.id,'tasting',actor)).tasting.contextToken;
  });
  await requireSameTastingActor(actor);
  const present=await db.getFirstAsync('SELECT sample_code AS code FROM samples WHERE session_id=? AND id=?',[output.sessionId,output.sampleId]);
  if(present?.code!==observed.z)tastingFail('tasting:ack_changed');
  if(ackToken){const current=await getLocalTastingPresentation(output.sessionId);if(current.tasting.contextToken!==ackToken||!current.session.samples.some(sample=>sample.id===output.sampleId&&sample.tastingActive===true))tastingFail('tasting:ack_changed');}
  await requireSameTastingActor(actor);
  return output;
}

export async function resolveActiveSampleFromCupMetadata({ cupUUID, metadata, isScanCurrent = null } = {}) {
  return resolveCodeSampleFromMetadata({cupUUID,metadata,isScanCurrent});
}

// Numeric-profile resolver retained as historical implementation evidence, never
// dispatched by the isolated code profile. Do not guess a code from an ordinal.
async function resolveNumericSampleFromCupMetadata({ cupUUID, metadata } = {}) {
  // Freeze the observed read before an await; callers cannot retarget queued work.
  metadata = JSON.parse(JSON.stringify(metadata));
  cupUUID = cleanString(cupUUID);
  const f = requireFormTag(metadata), tagMode = requireTagCuppingMode(metadata);
  const rawCupCount = metadata?.cupNumber ?? metadata?.y;
  if (f === 2 && (!Number.isInteger(rawCupCount) || rawCupCount < 1 || rawCupCount > 8 || tagMode !== 'open')) {
    throw new Error('SCA Legacy cup count or Open mode is missing or unsupported. No local data was changed.');
  }
  const count = observedPositiveInteger(rawCupCount, 8);
  const position = metadata?.sampleNumber ?? metadata?.z;
  if (count === null || position !== undefined && observedPositiveInteger(position) === null) throw new Error('Cup assignment count or position is missing or invalid. No local record was changed.');
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  const sessionUUID = normalizeSessionUuid(metadata?.sessionUUID ?? metadata?.u);
  if (!normalizedCupUUID || !sessionUUID || sessionUUID.toUpperCase() === 'NO-SESSION') return null;
  const db = await getLocalDatabase(), actor = await getOrCreateLocalProfileIdentity();
  await requireSameTastingActor(actor);
  // A known context disappearing while this read is queued is not a new import.
  let observedSession, observedSample, observedContext;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    observedSession = await findSessionBySessionUUIDWithDb(txn, sessionUUID);
    observedSample = observedSession ? await findSampleInSessionByCupUUIDWithDb(txn, {sessionId:observedSession.id,cupUUID:normalizedCupUUID}) : null;
    const revision = observedSession ? await revisionWithDb(txn, observedSession.id, actor) : null;
    observedContext = observedSession ? canonicalize({session:{...observedSession},revision:revision.revision,hash:revision.hash}) : null;
    await requireSameTastingActor(actor);
  });
  if (f === 2 && observedSession && !observedSample) {
    const provenance = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id=?', [observedSession.id]);
    if (provenance?.creator) throw new Error('This SCA Legacy cup has no trusted local assignment. Its local data was not changed.');
  }
  if (observedSession) await assertAssessmentReadyWithDb(db, observedSession.id);
  let output, committed;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    let session = await findSessionBySessionUUIDWithDb(txn, sessionUUID);
    if (observedSession && session?.id !== observedSession.id) throw new Error('This local session was removed or changed while scanning. Scan again to import a new local copy.');
    if (observedContext) {
      const currentRevision = await revisionWithDb(txn, session.id, actor);
      if (!currentRevision.matches || canonicalize({session:{...session},revision:currentRevision.revision,hash:currentRevision.hash}) !== observedContext) tastingFail('tasting:stale_membership');
    }
    if (session) {
      if (!isPinnedForm(session,f)) throw new Error('This cup refers to an older or unsupported prototype session. Its local data was not changed.');
      if (!isActiveFormPin(session,f) && !isPrototypeCvaPin(session)) throw new Error('This cup refers to a read-only historical form version. Its saved data was not changed.');
      await assertAssessmentReadyWithDb(txn,session.id);
      if (f === 2 && session.cuppingMode !== 'open') throw new Error('SCA Legacy requires its trusted Open mode. No local record was changed.');
    } else {
      session = await importSessionWithDb(txn,{sessionUUID,cuppingForm:f,cuppingMode:tagMode,
        sessionName:metadata?.sessionName ?? metadata?.e,sessionType:metadata?.sessionType ?? metadata?.t,
        sessionDate:metadata?.sessionDate ?? metadata?.d,samplesInSession:metadata?.samplesInSession ?? metadata?.i,status:'new'});
    }
    const current = await getSessionByIdWithDb(txn,session.id);
    if (current.samples.some(row=>row.cuppingForm!==f || row.cuppingMode!==tagMode)) throw new Error('The cup form or cupping mode conflicts with stored session samples. No local record was changed.');
    if (current.status === 'complete' && !current.samples.some(row=>normalizeCupUuid(row.cupUUID)===normalizedCupUUID)) throw new Error('This historical completed session is read-only. No local record was changed.');
    const sample = await importSampleWithDb(txn,{sessionId:session.id,cupUUID:normalizedCupUUID,
      coffeeNameOrigin:metadata?.coffeeName ?? metadata?.n,process:metadata?.coffeeProcess ?? metadata?.p,
      cupNumber:rawCupCount,cuppingForm:f,cuppingMode:tagMode,sampleNumber:position,
      expectedExistingSampleId:observedSession ? observedSample?.id ?? null : undefined,capturedActor:actor});
    const saved = await getSessionByIdWithDb(txn,session.id);
    const row = saved.samples.find(entry=>entry.id===sample.id);
    if (!row) tastingFail('tasting:stale_membership');
    output={sessionId:saved.id,sessionUUID:saved.sessionUUID,sessionDisplayId:saved.sessionDisplayId,
      sessionName:saved.sessionName,sessionType:saved.sessionType,sessionStatus:saved.status,sessionDate:saved.sessionDate,
      sampleId:row.id,cupUUID:row.cupUUID,cupNumber:row.cupNumber,cuppingForm:row.cuppingForm,cuppingMode:row.cuppingMode,
      sampleNumber:row.sampleNumber,coffeeNameOrigin:row.coffeeNameOrigin,coffeeProcess:row.process,
      cupIndex:saved.samples.findIndex(entry=>entry.id===row.id),cupTotal:saved.samples.length};
    committed=await revisionWithDb(txn,saved.id,actor);
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  await db.withExclusiveTransactionAsync(async txn=>{
    await requireSameTastingActor(actor);
    const current=await revisionWithDb(txn,output.sessionId,actor);
    const sample=await txn.getFirstAsync('SELECT id FROM samples WHERE id=? AND session_id=?',[output.sampleId,output.sessionId]);
    if (!sample || !current.matches || current.revision!==committed.revision || current.hash!==committed.hash) tastingFail('tasting:ack_changed');
    await requireSameTastingActor(actor);
  });
  return output;
}

export async function deleteSessionById(sessionId) {
  const db = await getLocalDatabase();
  let result;
  await db.withExclusiveTransactionAsync(async txn => { result = await deleteLocalSessionById(txn, sessionId); });
  return result;
}

async function deleteLocalSessionById(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("sessionId is required to delete a session.");
  }

  const existing = await db.getFirstAsync(
    `
      SELECT id
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedSessionId]
  );

  if (!existing) {
    return { deleted: false };
  }

  // This retained pre-event table may have no foreign keys. Remove only this
  // session's rows, or startup could backfill deleted feedback into an empty store.
  if (await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sample_feedback' LIMIT 1")) {
    await db.runAsync('DELETE FROM sample_feedback WHERE session_id = ? OR sample_id IN (SELECT id FROM samples WHERE session_id = ?)', [normalizedSessionId, normalizedSessionId]);
  }
  await db.runAsync("DELETE FROM sessions WHERE id = ?", [normalizedSessionId]);
  return { deleted: true };
}

function trustedLegacySession(session) {
  if (!isPinnedForm(session, 2) || session.cuppingMode !== 'open') {
    throw new Error('SCA Legacy Open Cupping session identity is unavailable. No response was changed.');
  }
  return {
    profile: PROFILE,
    f: 2,
    identity: { form_key: session.formKey, form_version: session.formVersion, form_hash: session.formHash },
  };
}

export async function getLegacyResponse(sessionId, sampleId) {
  const db = await getLocalDatabase();
  let actor = null;
  try { actor = await getOrCreateLocalProfileIdentity(); } catch { /* unavailable fails closed */ }
  let output;
  await db.withExclusiveTransactionAsync(async txn => {
    if (actor) await requireSameTastingActor(actor);
    output = await withTastingResponseAccess(txn, sessionId, sampleId, 2, await getLegacyResponseWithDb(txn, sessionId, sampleId), actor);
    output.savedFingerprint = await legacyFingerprintWithDb(txn, sessionId, sampleId, actor);
    output.removalGeneration = await creatorRemovalGenerationWithDb(txn,sessionId,sampleId,actor);
    const draft = validActor(actor) ? await txn.getFirstAsync(`SELECT * FROM local_legacy_recovery_drafts
      WHERE session_id=? AND sample_id=? AND local_profile_id=?`, [sessionId, sampleId, actor]) : null;
    output.recoveryRowToken=null;
    if (draft && draft.base_fingerprint === output.savedFingerprint && output.access.canWrite) {
      let response;
      const session = await getSessionByIdWithDb(txn, sessionId);
      const sample = session.samples.find(value => value.id === sampleId);
      const expectedContext = canonicalize({ sessionId, sampleId, pin: trustedLegacySession(session).identity, count: sample.cupNumber });
      if (draft.context_json !== expectedContext || !Number.isFinite(Date.parse(draft.updated_at)) ||
          new Date(draft.updated_at).toISOString() !== draft.updated_at) tastingFail('tasting:damaged_draft');
      try { response = JSON.parse(draft.response_json); if (canonicalize(response) !== draft.response_json) tastingFail('tasting:damaged_draft'); }
      catch { tastingFail('tasting:damaged_draft'); }
      const validation = validateResponse({ ...trustedLegacySession(session), cup_count: sample.cupNumber, response, complete:false },trustedLegacySession(session));
      if (!validation.ok) tastingFail('tasting:damaged_draft');
      output.recoveryDraft = response;
      output.recoveryRowToken=sha256(canonicalize({...draft}));
    } else output.recoveryDraft = null;
    if (actor) await requireSameTastingActor(actor);
  });
  return output;
}

async function legacyFingerprintWithDb(db, sessionId, sampleId, actor) {
  const stream = await streamWithDb(db, sessionId, sampleId, 2, actor);
  const c = stream.context;
  if (!c) tastingFail('tasting:unavailable');
  const generation = await creatorRemovalGenerationWithDb(db,sessionId,sampleId,actor);
  return sha256(canonicalize({ actor, ...(generation > 0 ? {removalGeneration:generation} : {}), context: { sessionId, sampleId,
    form: c.cupping_form, key: c.form_key, version: c.form_version, hash: c.form_hash,
    mode: c.cupping_mode, sampleForm: c.sample_form, sampleMode: c.sample_mode, count: c.cup_number },
  source: semanticSource(stream.source) }));
}

export async function discardLegacyRecoveryDraft({ sessionId, sampleId, expectedFingerprint, expectedTastingContextToken=null,expectedRemovalGeneration=null,expectedRecoveryRowToken=null }) {
  const db = await getLocalDatabase();
  const actor = await getLocalProfileIdentity();
  let scoped=false;
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    await assertCreatorTargetActiveWithDb(txn, sessionId, sampleId, actor);
    const scope=await enrolledSaveContextWithDb(txn,sessionId,sampleId,actor,expectedTastingContextToken);
    scoped=Boolean(scope);
    if (!expectedFingerprint || expectedFingerprint !== await legacyFingerprintWithDb(txn, sessionId, sampleId, actor)) tastingFail('tasting:stale_context');
    if(scope){
      if(expectedRemovalGeneration!==await creatorRemovalGenerationWithDb(txn,sessionId,sampleId,actor))tastingFail('tasting:stale_removal');
      const row=await txn.getFirstAsync('SELECT * FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?',[sessionId,sampleId,actor]);
      const token=row?sha256(canonicalize({...row})):null;
      if(token!==expectedRecoveryRowToken)tastingFail('tasting:stale_recovery');
    }
    await txn.runAsync('DELETE FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?', [sessionId, sampleId, actor]);
    await requireSameTastingActor(actor);
  });
  if(scoped){
    await requireSameTastingActor(actor);
    const acknowledged=await getLegacyResponse(sessionId,sampleId);
    if(acknowledged.tasting.contextToken!==expectedTastingContextToken||acknowledged.savedFingerprint!==expectedFingerprint||acknowledged.recoveryRowToken!==null)tastingFail('tasting:ack_changed');
    await requireSameTastingActor(actor);
  }
}

async function getLegacyResponseWithDb(db, sessionId, sampleId) {
  const session = await getSessionByIdWithDb(db, sessionId);
  const trusted = trustedLegacySession(session);
  const sample = session.samples.find((row) => row.id === sampleId);
  if (!sample || sample.cuppingForm !== 2 || sample.cuppingMode !== 'open') {
    throw new Error('Legacy sample identity does not match its session.');
  }
  const row = await db.getFirstAsync(
    'SELECT form_key AS formKey, form_version AS formVersion, form_hash AS formHash, cup_count AS cupCount, response_json AS responseJson, is_complete AS isComplete FROM legacy_responses WHERE session_id = ? AND sample_id = ? LIMIT 1',
    [sessionId, sampleId]
  );
  if (!row) return { response: null, complete: false, result: null, errors: [], sessionComplete: session.status === 'complete' };
  if (row.formKey !== trusted.identity.form_key || row.formVersion !== trusted.identity.form_version ||
      row.formHash !== trusted.identity.form_hash || Number(row.cupCount) !== Number(sample.cupNumber) || ![0, 1].includes(row.isComplete)) {
    throw new Error('Saved Legacy response identity or cup count conflicts with this session.');
  }
  let response;
  try { response = JSON.parse(row.responseJson); } catch { throw new Error('Saved Legacy response is damaged.'); }
  const input = { ...trusted, cup_count: Number(sample.cupNumber), response, complete: Boolean(row.isComplete) };
  const validation = validateResponse(input, trusted);
  if (row.isComplete && !validation.ok) throw new Error(`Saved Legacy response is invalid: ${validation.errors.join(', ')}`);
  const result = row.isComplete ? scoreResponse(input, trusted) : null;
  if (row.isComplete && !result?.ok) throw new Error('Saved Legacy score could not be reproduced.');
  return { response, complete: Boolean(row.isComplete), result, errors: validation.errors,
    sessionComplete: session.status === 'complete' };
}

export async function saveLegacyResponse({ sessionId, sampleId, response, complete = false, intent = 'save', expectedFingerprint = null, expectedRemovalGeneration = null, expectedTastingContextToken=null }) {
  try { response = JSON.parse(canonicalize(response)); } catch { return { ok: false, errors: ['response:invalid_object'] }; }
  const actor = await getOrCreateLocalProfileIdentity();
  if (!['save', 'recovery'].includes(intent)) return { ok: false, errors: ['response:invalid_intent'] };
  const fingerprint = expectedFingerprint ?? await legacyFingerprintWithDb(await getLocalDatabase(), sessionId, sampleId, actor);
  const session = await getSessionById(sessionId);
  const trusted = trustedLegacySession(session);
  if (session.status === 'complete'&&!(await creatorActivationWithDb(await getLocalDatabase(),sessionId))) {
    return { ok: false, errors: ['session:complete_read_only'] };
  }
  const sample = session.samples.find((row) => row.id === sampleId);
  if (!sample || sample.cuppingForm !== 2 || sample.cuppingMode !== 'open') {
    throw new Error('Legacy sample identity does not match its session. No response was saved.');
  }
  const input = { ...trusted, cup_count: Number(sample.cupNumber), response, complete: Boolean(complete) };
  const validation = validateResponse(input, trusted);
  if (complete && !validation.ok) return { ok: false, errors: validation.errors };
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { ok: false, errors: ['response:invalid_object'] };
  }
  const result = complete ? scoreResponse(input, trusted) : null;
  if (complete && !result?.ok) return { ok: false, errors: result?.errors || ['score:invalid'] };
  const db = await getLocalDatabase();
  let outcome = null;
  let committedFingerprint = null;
  let ackToken=null;
  let committedRecoveryToken=null;
  // The earlier UI/validation read is not authority for a later write. Hold an
  // exclusive transaction while rechecking the current pin, Session state,
  // Sample mode/count, and any response row that an UPSERT would replace.
  await db.withExclusiveTransactionAsync(async (txn) => {
    const current = await txn.getFirstAsync(
      `SELECT s.status, s.cupping_form AS cuppingForm, s.form_key AS formKey,
              s.form_version AS formVersion, s.form_hash AS formHash, s.cupping_mode AS cuppingMode,
              sm.cupping_form AS sampleForm, sm.cupping_mode AS sampleMode, sm.cup_number AS cupCount
       FROM sessions s JOIN samples sm ON sm.session_id = s.id
       WHERE s.id = ? AND sm.id = ? LIMIT 1`, [sessionId, sampleId]
    );
    if (current?.status === 'complete'&&!(await creatorActivationWithDb(txn,sessionId))) {
      outcome = { ok: false, errors: ['session:complete_read_only'] };
      return;
    }
    if (!current || current.cuppingForm !== 2 || current.sampleForm !== 2 ||
        current.cuppingMode !== 'open' || current.sampleMode !== 'open' ||
        current.formKey !== trusted.identity.form_key || current.formVersion !== trusted.identity.form_version ||
        current.formHash !== trusted.identity.form_hash || Number(current.cupCount) !== Number(sample.cupNumber)) {
      outcome = { ok: false, errors: ['session:form_or_sample_changed'] };
      return;
    }
    const prior = await txn.getFirstAsync(
      `SELECT session_id AS sessionId, form_key AS formKey, form_version AS formVersion,
              form_hash AS formHash, cup_count AS cupCount
       FROM legacy_responses WHERE sample_id = ? LIMIT 1`, [sampleId]
    );
    if (prior && (prior.sessionId !== sessionId || prior.formKey !== trusted.identity.form_key ||
        prior.formVersion !== trusted.identity.form_version || prior.formHash !== trusted.identity.form_hash ||
        Number(prior.cupCount) !== Number(sample.cupNumber))) {
      outcome = { ok: false, errors: ['response:stored_identity_mismatch'] };
      return;
    }
    await requireSameTastingActor(actor);
    await assertAssessmentReadyWithDb(txn, sessionId, sampleId, actor);
    const generation = await creatorRemovalGenerationWithDb(txn,sessionId,sampleId,actor);
    if (generation != null && (!Number.isSafeInteger(expectedRemovalGeneration) || expectedRemovalGeneration !== generation)) tastingFail('tasting:stale_removal');
    if (fingerprint !== await legacyFingerprintWithDb(txn, sessionId, sampleId, actor)) tastingFail('tasting:stale_context');
    const scope=await enrolledSaveContextWithDb(txn,sessionId,sampleId,actor,expectedTastingContextToken);
    const access = await streamWithDb(txn, sessionId, sampleId, 2, actor);
    if (!access.canWrite&&!scope?.canEditCompleted) tastingFail(access.state === 'unattributed' ? 'tasting:review_required' : 'tasting:foreign_stream');
    if(scope?.canEditCompleted&&!validateResponse({...input,complete:false},trusted).ok){outcome={ok:false,errors:['response:invalid_draft']};return;}
    if(scope)ackToken=scope.presentation.tasting.contextToken;
    if (intent === 'recovery') {
      await txn.runAsync(`INSERT INTO local_legacy_recovery_drafts
        (session_id,sample_id,local_profile_id,context_json,base_fingerprint,response_json,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id,sample_id,local_profile_id) DO UPDATE SET
        context_json=excluded.context_json,base_fingerprint=excluded.base_fingerprint,response_json=excluded.response_json,updated_at=excluded.updated_at`,
      [sessionId, sampleId, actor, canonicalize({ sessionId, sampleId, pin: trusted.identity, count: sample.cupNumber }), fingerprint, canonicalize(response), new Date().toISOString()]);
      await requireSameTastingActor(actor);
      committedFingerprint = fingerprint;
      if(scope){const row=await txn.getFirstAsync('SELECT * FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?',[sessionId,sampleId,actor]);committedRecoveryToken=sha256(canonicalize({...row}));}
      await requireSameTastingActor(actor);
      outcome = { ok: true, recoverySaved: true }; return;
    }
    if(scope?.canEditCompleted){
      const saved=await getLegacyResponseWithDb(txn,sessionId,sampleId);
      if(canonicalize(response)===canonicalize(saved.response)){
        await txn.runAsync('DELETE FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?',[sessionId,sampleId,actor]);
        committedFingerprint=fingerprint;outcome={ok:true,noChange:true,result:saved.result,errors:saved.errors};await requireSameTastingActor(actor);return;
      }
    }
    await persistHistoryWithDb(txn, sessionId);
    if(scope?.canEditCompleted)await txn.runAsync("UPDATE sessions SET status='pending' WHERE id=?",[sessionId]);
    const before = await revisionWithDb(txn, sessionId, actor);
    if (!before.matches) tastingFail('tasting:stale_content');
    await writeStreamWithDb(txn, { sessionId, sampleId, form: 2, actor });
    await txn.runAsync(
      `INSERT INTO legacy_responses (sample_id, session_id, form_key, form_version, form_hash, cup_count, response_json, is_complete, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sample_id) DO UPDATE SET response_json = excluded.response_json, is_complete = excluded.is_complete,
         updated_at = excluded.updated_at`,
      [sampleId, sessionId, trusted.identity.form_key, trusted.identity.form_version, trusted.identity.form_hash,
        Number(sample.cupNumber), JSON.stringify(response), complete ? 1 : 0, new Date().toISOString()]
    );
    await txn.runAsync('DELETE FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?', [sessionId, sampleId, actor]);
    await commitRevisionWithDb(txn, sessionId, actor, { starts: hasScoreOrNote(response, 2) });
    await recomputeSessionProgressStatusWithDb(txn, sessionId);
    committedFingerprint = await legacyFingerprintWithDb(txn, sessionId, sampleId, actor);
    if(scope)ackToken=(await getLocalTastingPresentationWithDb(txn,sessionId,'tasting',actor)).tasting.contextToken;
    await requireSameTastingActor(actor);
    outcome = { ok: true, result, errors: validation.errors,
      access: { state: 'mine', canWrite: true, canAdopt: false, sourceToken: null } };
  });
  if (!outcome?.ok) return outcome;
  await requireSameTastingActor(actor);
  const acknowledged = await getLegacyResponse(sessionId, sampleId);
  await requireSameTastingActor(actor);
  if (acknowledged.savedFingerprint !== committedFingerprint || ackToken&&(acknowledged.tasting.contextToken!==ackToken||acknowledged.recoveryRowToken!==committedRecoveryToken)) tastingFail('tasting:ack_changed');
  return { ...outcome, ...acknowledged };
}

export async function getSessionSampleFinalStatus(sessionId) {
  return getSessionSampleFinalStatusWithDb(await getLocalDatabase(), sessionId);
}

async function getSessionSampleFinalStatusWithDb(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    return {};
  }

  const session = await getSessionByIdWithDb(db, normalizedSessionId);
  const selected=await creatorStatusesWithDb(db,normalizedSessionId);
  if (selected) return selected;
  if (isCanonicalCvaReadPin(session)) return canonicalCvaStatuses(db, normalizedSessionId);
  if (isPinnedForm(session, 2)) {
    trustedLegacySession(session);
    const rows = await db.getAllAsync(
      'SELECT sample_id AS sampleId, is_complete AS isComplete FROM legacy_responses WHERE session_id = ?',
      [normalizedSessionId]
    );
    const saved = new Map((rows || []).map((row) => [row.sampleId, row]));
    const statuses = {};
    for (const sample of session.samples) {
      const row = saved.get(sample.id);
      const complete = row ? await getLegacyResponseWithDb(db, normalizedSessionId, sample.id) : null;
      statuses[sample.id] = { isComplete: Boolean(complete?.result?.ok), finalScore: complete?.result?.display_score || null,
        resultLabel: complete?.result?.label || null, hasAnyFeedback: Boolean(row), scoresByField: {} };
    }
    return statuses;
  }
  const samples = await db.getAllAsync(
    `
      SELECT id
      FROM samples
      WHERE session_id = ?
    `,
    [normalizedSessionId]
  );

  const sampleIds = (samples || []).map((row) => cleanString(row?.id)).filter(Boolean);
  if (sampleIds.length === 0) {
    return {};
  }

  const placeholders = sampleIds.map(() => "?").join(", ");
  let feedbackRows = [];
  try {
    feedbackRows = await db.getAllAsync(
      `
        SELECT
          sample_id AS sampleId,
          field_name AS fieldName,
          score,
          created_at AS createdAt
        FROM sample_feedback_entries
        WHERE session_id = ?
          AND sample_id IN (${placeholders})
        ORDER BY CASE WHEN (
          SELECT d.calculation_policy FROM sample_defect_entries d
          WHERE d.sample_id = sample_feedback_entries.sample_id ORDER BY d.rowid DESC LIMIT 1
        ) = ? THEN rowid END ASC, created_at ASC, rowid ASC
      `,
      [normalizedSessionId, ...sampleIds, CVA_EXACT_CALCULATION_POLICY]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column: is_final")) {
      throw error;
    }
    feedbackRows = [];
  }

  let defectRows = [];
  try {
    defectRows = await db.getAllAsync(
      `
        SELECT
          sample_id AS sampleId,
          non_uniform_cups AS nonUniformCups,
          defective_cups AS defectiveCups,
          number_of_cups AS numberOfCups,
          calculation_policy AS calculationPolicy,
          score_policy AS scorePolicy,
          created_at AS createdAt
        FROM sample_defect_entries
        WHERE session_id = ?
          AND sample_id IN (${placeholders})
        ORDER BY rowid ASC
      `,
      [normalizedSessionId, ...sampleIds]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column: is_final")) {
      throw error;
    }
    defectRows = [];
  }

  const latestScoresBySample = {};
  (feedbackRows || []).forEach((row) => {
    const sampleId = cleanString(row?.sampleId);
    const fieldName = cleanString(row?.fieldName);
    if (!sampleId || !fieldName) {
      return;
    }
    if (!latestScoresBySample[sampleId]) {
      latestScoresBySample[sampleId] = {};
    }
    latestScoresBySample[sampleId][fieldName] = row?.score == null ? 0 : Number(row.score);
  });

  const latestDefectsBySample = {};
  (defectRows || []).forEach((row) => {
    const sampleId = cleanString(row?.sampleId);
    if (!sampleId) {
      return;
    }
    latestDefectsBySample[sampleId] = {
      nonUniformCups: Math.max(0, Number.parseInt(row?.nonUniformCups, 10) || 0),
      defectiveCups: Math.max(0, Number.parseInt(row?.defectiveCups, 10) || 0),
      numberOfCups: Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1),
      calculationPolicy: row?.calculationPolicy ?? null,
      scorePolicy: row?.scorePolicy ?? null,
    };
  });

  return sampleIds.reduce((acc, sampleId) => {
    const finalScoresByField = latestScoresBySample[sampleId] || {};
    const hasAnyFeedback = Object.keys(finalScoresByField).length > 0;
    const isComplete =
      hasAnyFeedback &&
      CUPPING_SCORE_FIELDS.every((field) => finalScoresByField[field] !== undefined);
    if (!isComplete) {
      acc[sampleId] = {
        isComplete: false,
        finalScore: null,
        scoresByField: finalScoresByField,
        hasAnyFeedback,
      };
      return acc;
    }

    const defects = latestDefectsBySample[sampleId] || {
      nonUniformCups: 0,
      defectiveCups: 0,
      numberOfCups: 1,
    };

    acc[sampleId] = {
      isComplete: true,
      finalScore: calculateFinalScore({
        finalScoresByField,
        nonUniformCups: defects.nonUniformCups,
        defectiveCups: defects.defectiveCups,
        numberOfCups: defects.numberOfCups,
        calculationPolicy: defects.calculationPolicy ?? null,
      }),
      calculationPolicy: defects.calculationPolicy ?? null,
      resultLabel: cvaResultLabel(defects.calculationPolicy ?? null, defects.numberOfCups, defects.scorePolicy),
      scoresByField: finalScoresByField,
      hasAnyFeedback,
    };
    return acc;
  }, {});
}

export async function activateSession(sessionId) {
  return ownedMutation(sessionId, db => activateOwnedSession(db, sessionId));
}

async function activateOwnedSession(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return;
  await assertPinnedSessionWithDb(db, normalizedSessionId);
  await assertAssessmentReadyWithDb(db, normalizedSessionId);
  await db.runAsync(
    `UPDATE sessions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'new'`,
    [new Date().toISOString(), normalizedSessionId]
  );
}

export async function resetSessionToPending(sessionId) {
  return ownedMutation(sessionId, db => resetOwnedSessionToPending(db, sessionId));
}

async function resetOwnedSessionToPending(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return { updated: false };
  await assertPinnedSessionWithDb(db, normalizedSessionId);
  await db.runAsync(
    `UPDATE sessions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'complete'`,
    [new Date().toISOString(), normalizedSessionId]
  );
  return { updated: true };
}

export async function manuallyMarkSessionComplete(sessionId) {
  return ownedMutation(sessionId, db => manuallyMarkOwnedSessionComplete(db, sessionId));
}

async function manuallyMarkOwnedSessionComplete(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return { updated: false };
  await assertPinnedSessionWithDb(db, normalizedSessionId);
  const session = await getSessionByIdWithDb(db, normalizedSessionId);
  // Retained historical/global-close commands latch history, but never create
  // current local completion/reveal evidence. Failed validation rolls this back.
  await persistHistoryWithDb(db, normalizedSessionId, { completed: true });
  if (isActiveFormPin(session, 1)) return closeCanonicalCva(db, normalizedSessionId);
  await db.runAsync(
    `UPDATE sessions SET status = 'complete', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), normalizedSessionId]
  );
  return { updated: true };
}

export async function getSessionCompletionSummary(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return { allComplete: false, incompleteSamples: [] };

  const db = await getLocalDatabase();
  const sampleRows = await db.getAllAsync(
    `SELECT id, sample_number AS sampleNumber, coffee_name_origin AS coffeeNameOrigin
     FROM samples WHERE session_id = ? ORDER BY position_index ASC`,
    [normalizedSessionId]
  );

  const statusMap = await getSessionSampleFinalStatus(normalizedSessionId);

  const incomplete = (sampleRows || [])
    .filter((row) => !statusMap[row.id]?.isComplete)
    .map((row, idx) => ({
      sampleId: row.id,
      name: cleanString(row.coffeeNameOrigin) || `Sample ${Number(row.sampleNumber) || idx + 1}`,
    }));

  return { allComplete: incomplete.length === 0, incompleteSamples: incomplete };
}

export async function deleteSampleFromSession(sampleId) {
  const db = await getLocalDatabase();
  const sample = await db.getFirstAsync('SELECT session_id AS sessionId FROM samples WHERE id = ?', [sampleId]);
  if (!sample) return { deleted: false };
  return ownedMutation(sample.sessionId, txn => deleteOwnedSampleFromSession(txn, sampleId));
}

async function deleteOwnedSampleFromSession(db, sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) throw new Error("sampleId is required.");
  const sample = await db.getFirstAsync(
    "SELECT session_id AS sessionId FROM samples WHERE id = ? LIMIT 1",
    [normalizedSampleId]
  );
  if (!sample?.sessionId) return { deleted: false };
  await assertUnstartedWithDb(db, sample.sessionId);
  await assertSetupUnlockedWithDb(db, sample.sessionId);
  await assertPinnedSessionWithDb(db, sample.sessionId);
  const ownerPin = await db.getFirstAsync(
    'SELECT cupping_form AS cuppingForm, form_key AS formKey, form_version AS formVersion, form_hash AS formHash FROM sessions WHERE id = ? LIMIT 1',
    [sample.sessionId]
  );
  if (ownerPin?.cuppingForm === 1 && !isActiveFormPin(ownerPin, 1) && !isPrototypeCvaPin(ownerPin)) {
    throw new Error('This historical CVA session is read-only. No sample was removed.');
  }
  const owner = await db.getFirstAsync('SELECT cupping_form AS cuppingForm, status FROM sessions WHERE id = ? LIMIT 1', [sample.sessionId]);
  if (isActiveFormPin(ownerPin, 1)) {
    // Serialize the guard with Save; a successful response acknowledgement must
    // never be followed by an earlier deletion check cascading its revision away.
    await db.withExclusiveTransactionAsync(async txn => {
      const current = await txn.getFirstAsync(`SELECT cupping_form AS cuppingForm, form_key AS formKey,
        form_version AS formVersion, form_hash AS formHash, status FROM sessions WHERE id = ?`, [sample.sessionId]);
      if (!isActiveFormPin(current, 1) || !['new', 'pending', 'in_progress'].includes(current.status)) throw new Error('This CVA sample cannot be removed.');
      const captured = await txn.getFirstAsync('SELECT revision FROM cva_response_revisions WHERE sample_id = ? LIMIT 1', [normalizedSampleId]);
      if (captured) throw new Error('A saved CVA response cannot be removed.');
      await txn.runAsync('DELETE FROM samples WHERE id = ? AND session_id = ?', [normalizedSampleId, sample.sessionId]);
      await recomputeSessionProgressStatusWithDb(txn, sample.sessionId);
    });
    return { deleted: true };
  }
  if (owner?.cuppingForm === 2 && owner.status === 'complete') {
    throw new Error('This completed Legacy Session is read-only. Reset it to Pending before editing; no local record was changed.');
  }
  if (owner?.cuppingForm === 2) {
    const response = await db.getFirstAsync('SELECT sample_id FROM legacy_responses WHERE sample_id = ? LIMIT 1', [normalizedSampleId]);
    if (response) throw new Error('A Legacy sample with a saved response cannot be removed. No local record was changed.');
  }
  await db.runAsync("DELETE FROM samples WHERE id = ?", [normalizedSampleId]);
  if (sample?.sessionId) {
    await recomputeSessionProgressStatusWithDb(db, sample.sessionId);
  }
  return { deleted: true };
}

export async function markSessionCompleteIfAllSamplesComplete(sessionId) {
  return ownedMutation(sessionId, db => markOwnedSessionCompleteIfAllSamplesComplete(db, sessionId));
}

async function markOwnedSessionCompleteIfAllSamplesComplete(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    return { updated: false, status: null };
  }

  await assertPinnedSessionWithDb(db, normalizedSessionId);
  const session = await getSessionByIdWithDb(db, normalizedSessionId);
  if (isActiveFormPin(session, 1)) {
    await persistHistoryWithDb(db, normalizedSessionId, { completed: true });
    return closeCanonicalCva(db, normalizedSessionId);
  }

  const sampleStatusMap = await getSessionSampleFinalStatusWithDb(db, normalizedSessionId);
  const statusEntries = Object.values(sampleStatusMap || {});
  if (statusEntries.length === 0) {
    return { updated: false, status: null };
  }

  const nowIso = new Date().toISOString();
  const allComplete = statusEntries.every((entry) => Boolean(entry?.isComplete));
  if (!allComplete) {
    await db.runAsync(
      `
        UPDATE sessions
        SET status = 'pending',
            updated_at = ?
        WHERE id = ?
          AND status = 'complete'
      `,
      [nowIso, normalizedSessionId]
    );
    return { updated: true, status: "incomplete" };
  }

  await persistHistoryWithDb(db, normalizedSessionId, { completed: true });
  await db.runAsync(
    `
      UPDATE sessions
      SET status = 'complete',
          updated_at = ?
      WHERE id = ?
    `,
    [nowIso, normalizedSessionId]
  );

  return { updated: true, status: "complete" };
}

export async function findActiveSampleByCupUUID(cupUUID) {
  return null; // This profile never guesses a historical sample from a UID.
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedCupUUID) {
    return null;
  }

  const db = await getLocalDatabase();
  await reconcileCompletedSessions(db);

  const row = await db.getFirstAsync(
    `
      SELECT
        s.id AS sessionId,
        s.session_uuid AS sessionUUID,
        s.session_display_id AS sessionDisplayId,
        s.session_name AS sessionName,
        s.session_type AS sessionType,
        s.status AS sessionStatus,
        s.session_date AS sessionDate,
        s.cupping_form AS sessionCuppingForm,
        s.form_key AS formKey,
        s.form_version AS formVersion,
        s.form_hash AS formHash,
        sm.id AS sampleId,
        sm.cup_uuid AS cupUUID,
        sm.cup_number AS cupNumber,
        sm.cupping_form AS cuppingForm,
        sm.cupping_mode AS cuppingMode,
        sm.sample_number AS sampleNumber,
        sm.coffee_name_origin AS coffeeNameOrigin,
        sm.process AS coffeeProcess,
        sm.position_index AS cupIndex,
        (
          SELECT COUNT(*)
          FROM samples s2
          WHERE s2.session_id = s.id
        ) AS cupTotal
      FROM samples sm
      INNER JOIN sessions s ON sm.session_id = s.id
      WHERE sm.cup_uuid = ?
        AND s.status IN ('new', 'pending', 'in_progress', 'complete')
      ORDER BY
        CASE s.status
          WHEN 'in_progress' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'new' THEN 2
          WHEN 'complete' THEN 3
          ELSE 3
        END,
        s.updated_at DESC
      LIMIT 1
    `,
    [normalizedCupUUID]
  );

  if (!row) {
    return null;
  }

  return {
    ...row,
    cupIndex: Number(row.cupIndex) || 0,
    cupTotal: Number(row.cupTotal) || 1,
    cupNumber: Number(row.cupNumber) || 3,
    cuppingForm: row.cuppingForm,
    cuppingMode: normalizeCuppingModeKey(row.cuppingMode),
    sampleNumber: Number(row.sampleNumber) || null,
  };
}

export async function getSampleFeedback(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return {};
  }

  const db = await getLocalDatabase();
  const canonical = await canonicalCvaForSample(db, normalizedSampleId);
  if (canonical) return Object.fromEntries(Object.entries(RATINGS).map(([label, key]) => [label,
    canonical.response?.ratings?.[key] != null ? [{ score: canonical.response.ratings[key], comments: '', isFinal: canonical.complete }] : []]));
  const calculation = await db.getFirstAsync(
    'SELECT calculation_policy AS calculationPolicy FROM sample_defect_entries WHERE sample_id = ? ORDER BY rowid DESC LIMIT 1',
    [normalizedSampleId]
  );
  const feedbackOrder = calculation?.calculationPolicy === CVA_EXACT_CALCULATION_POLICY
    ? 'rowid ASC' : 'created_at ASC, rowid ASC';
  let rows = [];
  try {
    rows = await db.getAllAsync(
      `
        SELECT
          field_name AS fieldName,
          is_final AS isFinal,
          score,
          comments,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_feedback_entries
        WHERE sample_id = ?
        ORDER BY ${feedbackOrder}
      `,
      [normalizedSampleId]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column: is_final")) {
      throw error;
    }

    // Backward compatibility: older local DB before final-score migration.
    rows = await db.getAllAsync(
      `
        SELECT
          field_name AS fieldName,
          0 AS isFinal,
          score,
          comments,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_feedback_entries
        WHERE sample_id = ?
        ORDER BY ${feedbackOrder}
      `,
      [normalizedSampleId]
    );
  }

  return (rows || []).reduce((acc, row) => {
    const key = cleanString(row?.fieldName);
    if (!key) {
      return acc;
    }

    if (!Array.isArray(acc[key])) {
      acc[key] = [];
    }

    acc[key].push({
      isFinal: Number(row?.isFinal) === 1,
      score: row?.score == null ? null : Number(row.score),
      comments: cleanString(row?.comments),
      tempSnapshot: cleanString(row?.tempSnapshot),
      timeSnapshot: cleanString(row?.timeSnapshot),
      createdAt: cleanString(row?.createdAt),
      updatedAt: cleanString(row?.updatedAt),
    });

    return acc;
  }, {});
}

export async function getSampleFlavourObservations(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return [];
  }

  const db = await getLocalDatabase();
  const actor = await getLocalProfileIdentity();
  const target = await db.getFirstAsync('SELECT session_id AS sessionId FROM samples WHERE id=?', [normalizedSampleId]);
  const policy = target ? await assertCreatorTargetActiveWithDb(db, target.sessionId, normalizedSampleId, actor) : null;
  const rows = await db.getAllAsync(
    `
      SELECT
        keyword,
        label,
        colour,
        temp_c AS tempC,
        elapsed_seconds AS elapsedSeconds,
        source_field AS sourceField,
        created_at AS createdAt
      FROM sample_flavour_observations
      WHERE sample_id = ?
      ORDER BY created_at ASC
    `,
    [normalizedSampleId]
  );

  if (policy) await requireSameTastingActor(actor);
  return (rows || []).map((row) => ({
    keyword: cleanString(row?.keyword),
    label: cleanString(row?.label),
    colour: cleanString(row?.colour),
    tempC: row?.tempC == null ? null : Number(row.tempC),
    elapsedSeconds: row?.elapsedSeconds == null ? null : Number(row.elapsedSeconds),
    sourceField: cleanString(row?.sourceField),
    createdAt: cleanString(row?.createdAt),
  }));
}

export async function saveSampleFlavourObservations({
  sessionId,
  sampleId,
  observations = [],
} = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  const normalizedObservations = (Array.isArray(observations) ? observations : [])
    .map((observation) => ({
      keyword: cleanString(observation?.keyword).toLowerCase(),
      label: cleanString(observation?.label) || cleanString(observation?.keyword),
      colour: cleanString(observation?.colour),
      tempC:
        observation?.tempC == null || Number.isNaN(Number(observation.tempC))
          ? null
          : Math.round(Number(observation.tempC)),
      elapsedSeconds:
        observation?.elapsedSeconds == null || Number.isNaN(Number(observation.elapsedSeconds))
          ? null
          : Math.max(0, Number.parseInt(observation.elapsedSeconds, 10)),
      sourceField: cleanString(observation?.sourceField),
      createdAt: cleanString(observation?.createdAt),
    }))
    .filter((observation) => observation.keyword && observation.label);

  if (!normalizedSessionId || !normalizedSampleId || normalizedObservations.length === 0) {
    return { savedCount: 0 };
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  let savedCount = 0;

  await db.withTransactionAsync(async () => {
    await assertActiveCvaSampleWithDb(db, normalizedSessionId, normalizedSampleId);
    for (const observation of normalizedObservations) {
      await db.runAsync(
        `
          INSERT INTO sample_flavour_observations (
            id, session_id, sample_id, keyword, label, colour, temp_c, elapsed_seconds, source_field, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          generateId(),
          normalizedSessionId,
          normalizedSampleId,
          observation.keyword,
          observation.label,
          observation.colour,
          observation.tempC,
          observation.elapsedSeconds,
          observation.sourceField,
          observation.createdAt || nowIso,
        ]
      );
      savedCount += 1;
    }
    if (savedCount > 0) await startTastingWithDb(db, normalizedSessionId);
  });

  return { savedCount };
}

// Removes stored observations for a sample where the keyword is no longer present in the notes text.
// pruneGroups: [{ includeSourceFields: string[], keepKeywords: string[] }]
export async function pruneSampleFlavourObservations({ sampleId, pruneGroups = [] } = {}) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId || !pruneGroups.length) return;

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await assertActiveCvaSampleWithDb(db, null, normalizedSampleId);
    const rows = await db.getAllAsync(
      "SELECT id, keyword, source_field FROM sample_flavour_observations WHERE sample_id = ?",
      [normalizedSampleId]
    );
    const idsToDelete = [];
    for (const row of rows) {
      const rowSourceParts = String(row.source_field || "").split(",").map((s) => s.trim());
      for (const { includeSourceFields, keepKeywords } of pruneGroups) {
        const overlaps = includeSourceFields.some((f) => rowSourceParts.includes(f));
        if (!overlaps) continue;
        const keepSet = new Set((keepKeywords || []).map((k) => String(k).toLowerCase()));
        if (!keepSet.has(String(row.keyword || "").toLowerCase())) {
          idsToDelete.push(row.id);
        }
        break;
      }
    }
    for (const id of idsToDelete) {
      await db.runAsync("DELETE FROM sample_flavour_observations WHERE id = ?", [id]);
    }
  });
}

export async function hasFinalFeedbackForSample(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return false;
  }

  const db = await getLocalDatabase();
  const canonical = await canonicalCvaForSample(db, normalizedSampleId);
  if (canonical) return canonical.complete;
  try {
    const row = await db.getFirstAsync(
      `
        SELECT COUNT(DISTINCT field_name) AS count
        FROM sample_feedback_entries
        WHERE sample_id = ? AND is_final = 1
          AND field_name IN (${CUPPING_SCORE_FIELDS.map(() => "?").join(", ")})
      `,
      [normalizedSampleId, ...CUPPING_SCORE_FIELDS]
    );
    return Number(row?.count) >= CUPPING_SCORE_FIELDS.length;
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("no such column: is_final")) {
      return false;
    }
    throw error;
  }
}

export async function getSampleDefects(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return {
      nonFinal: [],
      final: [],
      latest: null,
    };
  }

  const db = await getLocalDatabase();
  const canonical = await canonicalCvaForSample(db, normalizedSampleId);
  if (canonical) {
    if (!canonical.response) return { nonFinal: [], final: [], latest: null };
    const response = canonical.response;
    const masks = cvaUiMasks(response);
    const entry = { ...Object.fromEntries(Object.entries(masks).map(([key, cups]) => [key, cups.length > 0])),
      isFinal: canonical.complete, nonUniformCups: response.non_uniform_cups?.length ?? 0,
      defectiveCups: response.defective_cups?.length ?? 0, nonUniformCupSlots: response.non_uniform_cups,
      defectiveCupSlots: response.defective_cups, defectCupSlots: masks, defectDescription: response.defect_description || '',
      numberOfCups: canonical.n, scorePolicy: CVA_SCORED_DEFECT_POLICY, calculationPolicy: CVA_EXACT_CALCULATION_POLICY };
    return { nonFinal: canonical.complete ? [] : [entry], final: canonical.complete ? [entry] : [], latest: entry };
  }
  let rows = [];
  try {
    rows = await db.getAllAsync(
      `
        SELECT
          is_final AS isFinal,
          moldy,
          phenolic,
          potato,
          other_bean AS otherBean,
          underdeveloped,
          baked,
          uneven_roast AS unevenRoast,
          overdeveloped,
          non_uniform_cups AS nonUniformCups,
          defective_cups AS defectiveCups,
          non_uniform_mask AS nonUniformMask,
          defective_mask AS defectiveMask,
          defect_type_masks AS defectTypeMasks,
          score_policy AS scorePolicy,
          calculation_policy AS calculationPolicy,
          defect_description AS defectDescription,
          number_of_cups AS numberOfCups,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_defect_entries
        WHERE sample_id = ?
        ORDER BY rowid ASC
      `,
      [normalizedSampleId]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column")) {
      throw error;
    }
    rows = await db.getAllAsync(
      `
        SELECT
          0 AS isFinal,
          moldy,
          phenolic,
          potato,
          0 AS otherBean,
          0 AS underdeveloped,
          0 AS baked,
          0 AS unevenRoast,
          0 AS overdeveloped,
          non_uniform_cups AS nonUniformCups,
          defective_cups AS defectiveCups,
          '' AS nonUniformMask,
          '' AS defectiveMask,
          '' AS defectTypeMasks,
          NULL AS scorePolicy,
          NULL AS calculationPolicy,
          NULL AS defectDescription,
          number_of_cups AS numberOfCups,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_defect_entries
        WHERE sample_id = ?
        ORDER BY rowid ASC
      `,
      [normalizedSampleId]
    );
  }

  return (rows || []).reduce(
    (acc, row) => {
      const entry = {
        isFinal: Number(row?.isFinal) === 1,
        moldy: Number(row?.moldy) === 1,
        phenolic: Number(row?.phenolic) === 1,
        potato: Number(row?.potato) === 1,
        otherBean: Number(row?.otherBean) === 1,
        underdeveloped: Number(row?.underdeveloped) === 1,
        baked: Number(row?.baked) === 1,
        unevenRoast: Number(row?.unevenRoast) === 1,
        overdeveloped: Number(row?.overdeveloped) === 1,
        nonUniformCups: Math.max(0, Number.parseInt(row?.nonUniformCups, 10) || 0),
        defectiveCups: Math.max(0, Number.parseInt(row?.defectiveCups, 10) || 0),
        numberOfCups: Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1),
        nonUniformCupSlots: parseCupSlotMask(
          row?.nonUniformMask,
          row?.nonUniformCups,
          Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1)
        ),
        defectiveCupSlots: parseCupSlotMask(
          row?.defectiveMask,
          row?.defectiveCups,
          Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1)
        ),
        defectCupSlots: parseDefectTypeMasks(
          row?.defectTypeMasks,
          Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1)
        ),
        scorePolicy: cleanString(row?.scorePolicy) || null,
        calculationPolicy: row?.calculationPolicy ?? null,
        defectDescription: typeof row?.defectDescription === 'string' ? row.defectDescription : '',
        tempSnapshot: cleanString(row?.tempSnapshot),
        timeSnapshot: cleanString(row?.timeSnapshot),
        createdAt: cleanString(row?.createdAt),
        updatedAt: cleanString(row?.updatedAt),
      };

      if (entry.isFinal) {
        acc.final.push(entry);
      } else {
        acc.nonFinal.push(entry);
      }
      acc.latest = entry;
      return acc;
    },
    { nonFinal: [], final: [], latest: null }
  );
}

export async function saveSampleDefectsEntry({
  sessionId,
  sampleId,
  defects = {},
  nonUniformCups = 0,
  defectiveCups = 0,
  nonUniformCupSlots = [],
  defectiveCupSlots = [],
  defectCupSlots = {},
  defectDescription = '',
  numberOfCups = 1,
  tempSnapshot = "",
  timeSnapshot = "",
  isFinal = false,
}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSessionId || !normalizedSampleId) {
    throw new Error("sessionId and sampleId are required to save defects.");
  }

  const cups = Math.max(1, Number.parseInt(numberOfCups, 10) || 1);
  const nonUniform = Math.max(0, Math.min(cups, Number.parseInt(nonUniformCups, 10) || 0));

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  const defectsId = generateId();
  const normalizedNonUniformCupSlots = normalizeCupSlotList(nonUniformCupSlots, cups);
  const normalizedDefectCupSlots = normalizeDefectTypeMasks(defectCupSlots, cups);
  const normalizedDefectiveCupSlots = getCvaScoredDefectSlots(normalizedDefectCupSlots, cups, defects);
  const nonUniformCount = normalizedNonUniformCupSlots.length > 0 ? normalizedNonUniformCupSlots.length : nonUniform;
  const defectiveCount = normalizedDefectiveCupSlots.length;

  await db.withTransactionAsync(async () => {
    await assertActiveCvaSampleWithDb(db, normalizedSessionId, normalizedSampleId);
    const calculationPolicy = await savedCvaCalculationWithDb(db, normalizedSampleId);
    await db.runAsync(
      `
      INSERT INTO sample_defect_entries (
        id, session_id, sample_id, is_final, moldy, phenolic, potato, other_bean,
        underdeveloped, baked, uneven_roast, overdeveloped,
        non_uniform_cups, defective_cups, non_uniform_mask, defective_mask, defect_type_masks, score_policy, calculation_policy, defect_description,
        number_of_cups, temp_snapshot, time_snapshot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      defectsId,
      normalizedSessionId,
      normalizedSampleId,
      isFinal ? 1 : 0,
      defects?.moldy ? 1 : 0,
      defects?.phenolic ? 1 : 0,
      defects?.potato ? 1 : 0,
      defects?.otherBean ? 1 : 0,
      defects?.underdeveloped ? 1 : 0,
      defects?.baked ? 1 : 0,
      defects?.unevenRoast ? 1 : 0,
      defects?.overdeveloped ? 1 : 0,
      nonUniformCount,
      defectiveCount,
      JSON.stringify(normalizedNonUniformCupSlots),
      JSON.stringify(normalizedDefectiveCupSlots),
      JSON.stringify(normalizedDefectCupSlots),
      CVA_SCORED_DEFECT_POLICY,
      calculationPolicy,
      typeof defectDescription === 'string' ? defectDescription : '',
      cups,
      cleanString(tempSnapshot),
      cleanString(timeSnapshot),
      nowIso,
      nowIso,
      ]
    );
    await startTastingWithDb(db, normalizedSessionId);
  });

  return {
    saved: true,
    id: defectsId,
  };
}

// Explicit CVA Save is a single commit boundary. Partial-entry helpers above and
// below intentionally retain their existing independent-write behaviour.
export async function saveCvaAssessmentAtomically({
  sessionId,
  sampleId,
  emptyFieldsToClear = [],
  finalFieldsToReplace = [],
  feedback = {},
  finalFeedback = {},
  finalFieldsToClear = [],
  pruneGroups = [],
  observations = [],
  defectsEntry,
  tempSnapshot = '',
  timeSnapshot = '',
} = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSessionId || !normalizedSampleId || !defectsEntry) {
    throw new Error('Session, sample and defects are required to save the CVA assessment.');
  }
  const db = await getLocalDatabase();
  if (typeof db.withExclusiveTransactionAsync !== 'function') {
    throw new Error('Atomic CVA Save is unavailable on this device. No assessment was saved.');
  }
  const nowIso = new Date().toISOString();
  const fields = (items) => Array.from(new Set((Array.isArray(items) ? items : []).map(cleanString).filter(Boolean)));
  const deleteFeedback = async (txn, names, finalOnly) => {
    const selected = fields(names);
    if (!selected.length) return;
    await txn.runAsync(
      `DELETE FROM sample_feedback_entries WHERE session_id = ? AND sample_id = ? AND field_name IN (${selected.map(() => '?').join(', ')})${finalOnly ? ' AND is_final = 1' : ''}`,
      [normalizedSessionId, normalizedSampleId, ...selected]
    );
  };
  const insertFeedback = async (txn, entries, isFinal) => {
    for (const [fieldName, value] of Object.entries(entries || {})) {
      const normalizedFieldName = cleanString(fieldName);
      if (!normalizedFieldName) continue;
      const score = value?.score == null || Number.isNaN(Number(value.score)) ? null : Number.parseInt(value.score, 10);
      const comments = cleanString(value?.comments);
      if (score == null && !comments && !isFinal) continue;
      await txn.runAsync(
        `INSERT INTO sample_feedback_entries
         (id, session_id, sample_id, field_name, is_final, score, comments, temp_snapshot, time_snapshot, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), normalizedSessionId, normalizedSampleId, normalizedFieldName, isFinal ? 1 : 0,
          score, comments, cleanString(tempSnapshot), cleanString(timeSnapshot), nowIso, nowIso]
      );
    }
  };

  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertActiveCvaSampleWithDb(txn, normalizedSessionId, normalizedSampleId);
    const session = await txn.getFirstAsync('SELECT status FROM sessions WHERE id = ? LIMIT 1', [normalizedSessionId]);
    if (cleanString(session?.status).toLowerCase() === 'complete') {
      throw new Error('This session is complete. Its saved assessment was not changed.');
    }
    const previousCalculation = await savedCvaCalculationWithDb(txn, normalizedSampleId);
    if (previousCalculation === null) {
      // The old calculation selected rating rows by wall-clock time. Capture
      // those selected values for untouched fields before adopting append order,
      // so a backwards clock cannot change an unedited rating during conversion.
      const historicalRows = await txn.getAllAsync(
        `SELECT field_name AS fieldName, is_final AS isFinal, score, comments
         FROM sample_feedback_entries WHERE session_id = ? AND sample_id = ?
         ORDER BY created_at ASC, rowid ASC`, [normalizedSessionId, normalizedSampleId]
      );
      const changedFields = new Set([
        ...fields(emptyFieldsToClear), ...fields(finalFieldsToReplace), ...fields(finalFieldsToClear),
        ...Object.keys(finalFeedback || {}),
        ...Object.keys(feedback || {}).filter((field) => feedback[field]?.score != null || cleanString(feedback[field]?.comments)),
      ]);
      const selected = new Map(historicalRows.map((row) => [row.fieldName, row]));
      for (const [field, row] of selected) {
        if (!changedFields.has(field)) await insertFeedback(txn, { [field]: row }, Number(row.isFinal) === 1);
      }
    }
    await deleteFeedback(txn, emptyFieldsToClear, false);
    await deleteFeedback(txn, finalFieldsToReplace, true);
    await insertFeedback(txn, feedback, false);
    await insertFeedback(txn, finalFeedback, true);
    await deleteFeedback(txn, finalFieldsToClear, true);

    if (pruneGroups.length) {
      const rows = await txn.getAllAsync(
        'SELECT id, keyword, source_field FROM sample_flavour_observations WHERE session_id = ? AND sample_id = ?',
        [normalizedSessionId, normalizedSampleId]
      );
      for (const row of rows) {
        const sourceFields = String(row.source_field || '').split(',').map((part) => part.trim());
        for (const group of pruneGroups) {
          if (!(group.includeSourceFields || []).some((field) => sourceFields.includes(field))) continue;
          const keep = new Set((group.keepKeywords || []).map((keyword) => cleanString(keyword).toLowerCase()));
          if (!keep.has(cleanString(row.keyword).toLowerCase())) {
            await txn.runAsync('DELETE FROM sample_flavour_observations WHERE id = ? AND session_id = ? AND sample_id = ?',
              [row.id, normalizedSessionId, normalizedSampleId]);
          }
          break;
        }
      }
    }
    for (const observation of Array.isArray(observations) ? observations : []) {
      const keyword = cleanString(observation?.keyword).toLowerCase();
      const label = cleanString(observation?.label) || cleanString(observation?.keyword);
      if (!keyword || !label) continue;
      const tempC = observation?.tempC == null || Number.isNaN(Number(observation.tempC))
        ? null : Math.round(Number(observation.tempC));
      const elapsedSeconds = observation?.elapsedSeconds == null || Number.isNaN(Number(observation.elapsedSeconds))
        ? null : Math.max(0, Number.parseInt(observation.elapsedSeconds, 10));
      await txn.runAsync(
        `INSERT INTO sample_flavour_observations
         (id, session_id, sample_id, keyword, label, colour, temp_c, elapsed_seconds, source_field, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), normalizedSessionId, normalizedSampleId, keyword, label, cleanString(observation?.colour),
          tempC, elapsedSeconds, cleanString(observation?.sourceField), cleanString(observation?.createdAt) || nowIso]
      );
    }

    const cups = Math.max(1, Number.parseInt(defectsEntry.numberOfCups, 10) || 1);
    const nonUniformSlots = normalizeCupSlotList(defectsEntry.nonUniformCupSlots, cups);
    const typeMasks = normalizeDefectTypeMasks(defectsEntry.defectCupSlots, cups);
    const defectiveSlots = getCvaScoredDefectSlots(typeMasks, cups, defectsEntry.defects);
    const count = (slots, value) => slots.length > 0 ? slots.length : Math.max(0, Math.min(cups, Number.parseInt(value, 10) || 0));
    const defects = defectsEntry.defects || {};
    await txn.runAsync(
      `INSERT INTO sample_defect_entries
       (id, session_id, sample_id, is_final, moldy, phenolic, potato, other_bean,
        underdeveloped, baked, uneven_roast, overdeveloped, non_uniform_cups, defective_cups,
        non_uniform_mask, defective_mask, defect_type_masks, score_policy, calculation_policy, defect_description, number_of_cups,
        temp_snapshot, time_snapshot, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), normalizedSessionId, normalizedSampleId, 1,
        defects.moldy ? 1 : 0, defects.phenolic ? 1 : 0, defects.potato ? 1 : 0, defects.otherBean ? 1 : 0,
        defects.underdeveloped ? 1 : 0, defects.baked ? 1 : 0, defects.unevenRoast ? 1 : 0,
        defects.overdeveloped ? 1 : 0, count(nonUniformSlots, defectsEntry.nonUniformCups),
        defectiveSlots.length, JSON.stringify(nonUniformSlots), JSON.stringify(defectiveSlots),
        JSON.stringify(typeMasks), CVA_SCORED_DEFECT_POLICY, CVA_EXACT_CALCULATION_POLICY, typeof defectsEntry.defectDescription === 'string' ? defectsEntry.defectDescription : '',
        cups, cleanString(tempSnapshot), cleanString(timeSnapshot), nowIso, nowIso]
    );
    await recomputeSessionProgressStatusWithDb(txn, normalizedSessionId);
  });
  return { saved: true };
}

export async function saveSampleFeedbackBatch({
  sessionId,
  sampleId,
  feedback = {},
  tempSnapshot = "",
  timeSnapshot = "",
  isFinal = false,
}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSessionId || !normalizedSampleId) {
    throw new Error("sessionId and sampleId are required to save feedback.");
  }

  const entries = Object.entries(feedback || {}).filter(([fieldName]) => cleanString(fieldName));
  if (entries.length === 0) {
    return { savedCount: 0 };
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  let savedCount = 0;

  const isFinalValue = isFinal ? 1 : 0;
  await db.withTransactionAsync(async () => {
    await assertActiveCvaSampleWithDb(db, normalizedSessionId, normalizedSampleId);
    for (const [fieldName, value] of entries) {
      const normalizedFieldName = cleanString(fieldName);
      const score =
        value?.score == null || Number.isNaN(Number(value.score)) ? null : Number.parseInt(value.score, 10);
      const comments = cleanString(value?.comments);

      if (score == null && !comments && !isFinal) {
        continue;
      }

      const feedbackId = generateId();
      const createdAt = nowIso;

      await db.runAsync(
        `
          INSERT INTO sample_feedback_entries (
            id, session_id, sample_id, field_name, is_final, score, comments, temp_snapshot, time_snapshot, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          feedbackId,
          normalizedSessionId,
          normalizedSampleId,
          normalizedFieldName,
          isFinalValue,
          score,
          comments,
          cleanString(tempSnapshot),
          cleanString(timeSnapshot),
          createdAt,
          nowIso,
        ]
      );
      savedCount += 1;
    }
    if (savedCount > 0) await startTastingWithDb(db, normalizedSessionId);
  });

  if (savedCount > 0) {
    await recomputeSessionProgressStatusWithDb(db, normalizedSessionId);
  }

  return { savedCount };
}

export async function clearSampleFeedbackFields({ sampleId, fields = [], isFinal = null } = {}) {
  const normalizedSampleId = cleanString(sampleId);
  const normalizedFields = Array.from(
    new Set((Array.isArray(fields) ? fields : []).map((field) => cleanString(field)).filter(Boolean))
  );

  if (!normalizedSampleId || normalizedFields.length === 0) {
    return { clearedCount: 0 };
  }

  const db = await getLocalDatabase();
  const placeholders = normalizedFields.map(() => "?").join(", ");
  const finalClause = isFinal === null ? "" : " AND is_final = ?";
  const params = [normalizedSampleId, ...normalizedFields];
  if (isFinal !== null) {
    params.push(isFinal ? 1 : 0);
  }

  let clearedCount = 0;
  await db.withTransactionAsync(async () => {
    const sessionId = await assertActiveCvaSampleWithDb(db, null, normalizedSampleId);
    const result = await db.runAsync(
      `DELETE FROM sample_feedback_entries
       WHERE sample_id = ? AND field_name IN (${placeholders}) ${finalClause}`,
      params
    );
    clearedCount = Number(result?.changes) || 0;
    if (clearedCount > 0) await recomputeSessionProgressStatusWithDb(db, sessionId);
  });
  return { clearedCount };
}

export async function clearSampleFinalFeedbackFields({ sampleId, fields = [] } = {}) {
  const normalizedSampleId = cleanString(sampleId);
  const normalizedFields = Array.from(
    new Set((Array.isArray(fields) ? fields : []).map((field) => cleanString(field)).filter(Boolean))
  );

  if (!normalizedSampleId || normalizedFields.length === 0) {
    return { clearedCount: 0 };
  }

  const db = await getLocalDatabase();
  const placeholders = normalizedFields.map(() => "?").join(", ");
  let clearedCount = 0;
  await db.withTransactionAsync(async () => {
    const sessionId = await assertActiveCvaSampleWithDb(db, null, normalizedSampleId);
    const result = await db.runAsync(
      `DELETE FROM sample_feedback_entries
       WHERE sample_id = ? AND is_final = 1 AND field_name IN (${placeholders})`,
      [normalizedSampleId, ...normalizedFields]
    );
    clearedCount = Number(result?.changes) || 0;
    if (clearedCount > 0) await recomputeSessionProgressStatusWithDb(db, sessionId);
  });
  return { clearedCount };
}
