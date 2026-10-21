import { getLocalDatabase } from "./localDatabase";
import { getLocalProfileIdentity, getOrCreateLocalProfileIdentity } from "./userProfileRepository";
import { generateDomainId } from "../utils/secureIdentifiers";
import { validCode, validSession, reserveWithDb, validateMetadata, metadataMatches, wireProof } from './sampleCodeProfile';
import { assertNoPendingWithDb, decodePending, pendingRowWithDb, pendingSaveInput,
  pendingSampleFields, stagePendingWithDb } from './pendingSampleAdditionStore';
import { fail as tastingFail, validActor, contextToken, stateWithDb as tastingStateWithDb,
  assertUnstartedWithDb, startWithDb as startTastingWithDb, hasStartedWithDb,
  persistHistoryWithDb, historyWithDb, revisionWithDb, commitRevisionWithDb, semanticSource, hasScoreOrNote,
  streamWithDb, writeStreamWithDb, adoptionDuplicateWithDb, completeWithDb as completeTastingWithDb } from './localTastingState';
import { formIdentity, isPinnedForm, requireFormTag, requireTagCuppingMode } from "../features/forms/sessionFormRoute";
import { PROFILE, validateResponse, scoreResponse } from "../features/forms/contract";
import { canonicalize, sha256 } from '../features/forms/contract/canonical';
import { readWithDb as readCanonicalCva, saveWithDb as saveCanonicalCva,
  statusesWithDb as canonicalCvaStatuses, closeWithDb as closeCanonicalCva } from '../features/cupping/data/cvaResponseStore';
import { RATINGS, cvaUiMasks, cvaNoteGroups } from '../features/cupping/data/cvaResponse';
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

const SETUP_PERMISSION_ERROR = "Only the local profile that created this session can manage its setup.";

async function assertLocalCreatorWithDb(db, sessionId) {
  const profileId = await getLocalProfileIdentity();
  const row = await db.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id = ?', [sessionId]);
  if (!profileId || !row?.creator || row.creator !== profileId) throw new Error(SETUP_PERMISSION_ERROR);
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
    await assertUnstartedWithDb(txn,sessionId);
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
    if(canonicalize(input.samples.slice(0,-1))!==canonicalize(setup.samples.map(pendingSampleFields)))throw new Error('Session samples changed before writing. No cup was written.');
    if(observedMetadata){
      const observed=validateMetadata(observedMetadata);
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
    if(outcome?.actor_id===actor){await requireSameTastingActor(actor);return JSON.parse(outcome.outcome_json);}
  }
  if(!pending || pending.operationId!==operationId || pending.phase!=='verified')throw new Error('Pending cup check changed. No sample was added.');
  const saved=await saveSessionWithSamples({...pending.saveInput,pendingSampleOperationId:operationId});
  await requireSameTastingActor(actor);
  return saved;
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
    expectedCupCount: input?.expectedCupCount };
  const db = await getLocalDatabase();
  const actor = await getOrCreateLocalProfileIdentity();
  const result = await saveCanonicalCva(db, command, generateId, cvaDescriptors, async txn => {
    await requireSameTastingActor(actor);
    await assertAssessmentReadyWithDb(txn, command.sessionId);
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
  await requireSameTastingActor(actor);
  const acknowledged = await getCvaResponse(command.sessionId, command.sampleId);
  await requireSameTastingActor(actor);
  if (acknowledged.revision !== result.revision) tastingFail('tasting:ack_changed');
  return { ...result, ...acknowledged, firstComplete: result.firstComplete };
}

const cvaDescriptors = response => cvaNoteGroups(response).flatMap(group => tokenizeFlavourKeywords(group.notes)
  .filter(token => token.type === 'pill').map(token => ({ keyword: token.keyword, label: token.keyword, colour: token.colour, sourceField: group.key })));

async function requireSameTastingActor(actor) {
  if (!validActor(actor) || await getLocalProfileIdentity() !== actor) tastingFail('tasting:actor_changed');
}

async function assertAssessmentReadyWithDb(db, sessionId) {
  await assertNoPendingWithDb(db, sessionId);
  const row = await db.getFirstAsync('SELECT status, local_creator_profile_id AS creator FROM sessions WHERE id = ?', [sessionId]);
  if (row?.status === 'new' && row.creator) throw new Error('Save this session before opening a tasting assessment.');
}

async function withTastingResponseAccess(db, sessionId, sampleId, form, saved, capturedActor = undefined) {
  await assertAssessmentReadyWithDb(db, sessionId);
  let actor = capturedActor;
  if (actor === undefined) {
    actor = null;
    try { actor = await getOrCreateLocalProfileIdentity(); } catch { /* unavailable fails closed */ }
  }
  const access = await streamWithDb(db, sessionId, sampleId, form, actor);
  const presentation = await getLocalTastingPresentationWithDb(db, sessionId, 'tasting', actor);
  const sample = presentation.session.samples.find(row => row.id === sampleId);
  if (actor) await requireSameTastingActor(actor);
  return { ...saved, access: { state: access.state, canWrite: !saved.historicalReadOnly && access.canWrite, canAdopt: !saved.historicalReadOnly && access.canAdopt, sourceToken: saved.historicalReadOnly ? null : access.sourceToken },
    identity: { visible: !presentation.identityHidden, name: sample?.coffeeNameOrigin || '', process: sample?.process || '' },
    tasting: presentation.tasting };
}

async function canonicalCvaForSample(db, sampleId) {
  const row = await db.getFirstAsync(`SELECT s.id, s.cupping_form AS cuppingForm,
    s.form_key AS formKey, s.form_version AS formVersion, s.form_hash AS formHash
    FROM samples sm JOIN sessions s ON s.id = sm.session_id WHERE sm.id = ? LIMIT 1`, [sampleId]);
  return row && isCanonicalCvaReadPin(row) ? readCanonicalCva(db, row.id, sampleId) : null;
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
    "SELECT status FROM sessions WHERE id = ? LIMIT 1",
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
      await assertUnstartedWithDb(db, sessionId);
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
      return;
    }

    const placeholders = keepCupUuids.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM samples WHERE session_id = ? AND cup_uuid NOT IN (${placeholders})`,
      [sessionId, ...keepCupUuids]
    );

    await recomputeSessionProgressStatusWithDb(db, sessionId);
    if (pendingSampleOperationId) {
      const actor = pendingActor;
      await assertLocalCreatorWithDb(db,sessionId);
      const row = await pendingRowWithDb(db,sessionId);
      if (!row || row.actor_id !== actor || row.operation_id !== pendingSampleOperationId) throw new Error('Pending cup check changed. No sample was added.');
      await requireSameTastingActor(actor);
      await db.runAsync('INSERT INTO sample_code_commit_outcomes(session_id,operation_id,actor_id,outcome_json) VALUES (?,?,?,?)',[sessionId,pendingSampleOperationId,actor,JSON.stringify({sessionId,status:sessionStatusValue,savedSampleCount:normalizedSamples.length})]);
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
  const state = await tastingStateWithDb(db, sessionId, actor);
  const samples = raw.samples || [];
  const activePin = isActiveFormPin(raw, 1) || isActiveFormPin(raw, 2);
  const supported = (activePin || isCanonicalCvaReadPin(raw)) &&
    ['new', 'pending', 'in_progress', 'complete'].includes(raw.status) &&
    samples.every(sample => sample.cuppingForm === raw.cuppingForm && Number.isInteger(sample.cupNumber) && sample.cupNumber >= 1 && sample.cupNumber <= 8);
  const modes = samples.map(sample => sample.cuppingMode);
  const consistentMode = samples.length ? modes.every(mode => mode === modes[0]) && ['open', 'blind'].includes(modes[0])
    && (raw.cuppingMode == null || raw.cuppingMode === modes[0]) : ['open', 'blind'].includes(raw.cuppingMode);
  const validMode = consistentMode && (raw.cuppingForm !== 2 || raw.cuppingMode === 'open' && modes.every(mode => mode === 'open'));
  const open = validMode && (samples.length ? modes[0] === 'open' : raw.cuppingMode === 'open');
  // An empty, unassigned CVA draft chooses mode when its first sample is added.
  // NULL here is not the same as malformed non-null or conflicting assigned mode.
  const setupModeValid = validMode || (!samples.length && raw.cuppingForm === 1 && raw.cuppingMode == null && !raw.formLocked);
  const canManageSetup = Boolean(activePin && supported && setupModeValid && isLocalCreator && !state.started && raw.status !== 'complete');
  const emptyCvaDraftSetup = purpose === 'setup' && canManageSetup && raw.status === 'new' &&
    !samples.length && raw.cuppingForm === 1 && raw.cuppingMode == null && !raw.formLocked;
  const show = Boolean(supported && (validMode && (open || state.revealed || purpose === 'setup' && canManageSetup) || emptyCvaDraftSetup));
  const localRemoval = {};
  if (activePin && validMode && validActor(actor) && creator?.creator === null) {
    for (const sample of samples) localRemoval[sample.id] = await participantRemovalContextWithDb(db, sessionId, sample.id, actor);
  }
  const projected = {
    id: raw.id, sessionUUID: raw.sessionUUID, sessionDisplayId: raw.sessionDisplayId,
    sessionName: raw.sessionName, sessionType: raw.sessionType, sessionDate: raw.sessionDate,
    samplesInSession: raw.samplesInSession, status: state.completed ? 'complete' : raw.status === 'complete' ? 'complete' : state.started && raw.status !== 'new' ? 'in_progress' : raw.status, cuppingForm: raw.cuppingForm,
    formKey: raw.formKey, formVersion: raw.formVersion, formHash: raw.formHash,
    cuppingMode: raw.cuppingMode, formLocked: raw.formLocked, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
    samples: samples.map((sample, index) => ({
    id: sample.id, cupUUID: sample.cupUUID, cupNumber: sample.cupNumber,
    cuppingForm: sample.cuppingForm, cuppingMode: sample.cuppingMode,
    sampleNumber: sample.sampleNumber, sampleCode: sample.sampleCode, positionIndex: sample.positionIndex,
    localRemoval: localRemoval[sample.id] || { canRemove: false },
    coffeeNameOrigin: show ? sample.coffeeNameOrigin : `Sample ${sample.sampleCode || Number(sample.sampleNumber) || index + 1}`,
    process: show ? sample.process : null, identityHidden: !show,
  })) };
  return { session: projected, identityHidden: !show,
    tasting: { ...state, assessmentReady: !(creator?.creator && raw.status === 'new'), canComplete: Boolean(activePin && validActor(actor) && supported && validMode && samples.length && !state.completed && raw.status !== 'complete' && !(creator?.creator && raw.status === 'new')),
      canManageSetup, isLocalCreator } };
}

async function participantRemovalContextWithDb(db, sessionId, sampleId, actor) {
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
  if (session.cuppingMode !== null && session.cuppingMode !== sample.cuppingMode ||
      !Number.isInteger(sample.sampleNumber) || sample.sampleNumber < 1 || !cleanString(sample.cupUUID) ||
      session.samples.some(row => row.cuppingForm !== session.cuppingForm || row.cuppingMode !== sample.cuppingMode ||
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
    if (presentation.tasting.completed) {
      if (presentation.identityHidden) tastingFail('tasting:unsupported');
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
    await assertAssessmentReadyWithDb(txn, sessionId);
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

async function resolveCodeSampleFromMetadata({cupUUID,metadata}) {
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
  let output;
  await db.withExclusiveTransactionAsync(async txn=>{
    await requireSameTastingActor(actor);
    let session=await findSessionBySessionUUIDWithDb(txn,observed.u);
    if(!session)session=await importSessionWithDb(txn,{sessionUUID:observed.u,cuppingForm:observed.f,cuppingMode:observed.m==='b'?'blind':'open',sessionName:observed.e,sessionType:observed.t,sessionDate:observed.d,samplesInSession:observed.i,status:'new'});
    await assertNoPendingWithDb(txn,session.id);
    await assertAssessmentReadyWithDb(txn,session.id);
    const setup=await getSessionByIdWithDb(txn,session.id), mode=observed.m==='b'?'blind':'open';
    if(!isActiveFormPin(setup,observed.f)||setup.samples.some(sample=>sample.cuppingForm!==observed.f||sample.cuppingMode!==mode))throw new Error('Cup form or mode conflicts with this session.');
    const creator=await txn.getFirstAsync('SELECT local_creator_profile_id AS creator FROM sessions WHERE id=?',[session.id]);
    let sample=setup.samples.find(row=>row.sampleCode===observed.z);
    if(sample) {
      if(!metadataMatches(JSON.parse(sample.metadataJson),observed))throw new Error('Cup metadata conflicts with its stored sample. No scores were changed.');
    } else {
      if(creator?.creator)throw new Error('This code has no verified creator assignment. No sample was added.');
      const before=await revisionWithDb(txn,session.id,actor);if(!before.matches)tastingFail('tasting:stale_content');
      const id=generateId(), now=new Date().toISOString(),index=setup.samples.length;
      await txn.runAsync(`INSERT INTO samples(id,session_id,cup_uuid,cup_number,cupping_form,cupping_mode,sample_number,sample_code,sample_metadata_json,coffee_name_origin,process,position_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,session.id,target,observed.y,observed.f,mode,index+1,observed.z,JSON.stringify(observed),observed.n,String(observed.p),index,now,now]);
      await txn.runAsync('UPDATE sessions SET form_locked=1 WHERE id=?',[session.id]);
      await commitRevisionWithDb(txn,session.id,actor);
      await recomputeSessionProgressStatusWithDb(txn,session.id);
      sample={id,cupUUID:target,cupNumber:observed.y,cuppingForm:observed.f,cuppingMode:mode,sampleNumber:index+1,sampleCode:observed.z,coffeeNameOrigin:observed.n,process:String(observed.p),positionIndex:index};
    }
    const saved=await getSessionByIdWithDb(txn,session.id);
    await txn.runAsync('INSERT OR IGNORE INTO physical_code_observations(session_id,code,physical_uid) VALUES (?,?,?)',[session.id,observed.z,target]);
    output={sessionId:saved.id,sessionUUID:saved.sessionUUID,sessionDisplayId:saved.sessionDisplayId,sessionName:saved.sessionName,sessionType:saved.sessionType,sessionStatus:saved.status,sessionDate:saved.sessionDate,sampleId:sample.id,cupUUID:target,cupNumber:sample.cupNumber,cuppingForm:sample.cuppingForm,cuppingMode:sample.cuppingMode,sampleNumber:sample.sampleNumber,sampleCode:sample.sampleCode,coffeeNameOrigin:sample.coffeeNameOrigin,coffeeProcess:sample.process,cupIndex:sample.positionIndex,cupTotal:saved.samples.length};
    await requireSameTastingActor(actor);
  });
  await requireSameTastingActor(actor);
  const present=await db.getFirstAsync('SELECT sample_code AS code FROM samples WHERE session_id=? AND id=?',[output.sessionId,output.sampleId]);
  if(present?.code!==observed.z)tastingFail('tasting:ack_changed');
  await requireSameTastingActor(actor);
  return output;
}

export async function resolveActiveSampleFromCupMetadata({ cupUUID, metadata } = {}) {
  return resolveCodeSampleFromMetadata({cupUUID,metadata});
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
    const draft = validActor(actor) ? await txn.getFirstAsync(`SELECT * FROM local_legacy_recovery_drafts
      WHERE session_id=? AND sample_id=? AND local_profile_id=?`, [sessionId, sampleId, actor]) : null;
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
    } else output.recoveryDraft = null;
    if (actor) await requireSameTastingActor(actor);
  });
  return output;
}

async function legacyFingerprintWithDb(db, sessionId, sampleId, actor) {
  const stream = await streamWithDb(db, sessionId, sampleId, 2, actor);
  const c = stream.context;
  if (!c) tastingFail('tasting:unavailable');
  return sha256(canonicalize({ actor, context: { sessionId, sampleId,
    form: c.cupping_form, key: c.form_key, version: c.form_version, hash: c.form_hash,
    mode: c.cupping_mode, sampleForm: c.sample_form, sampleMode: c.sample_mode, count: c.cup_number },
  source: semanticSource(stream.source) }));
}

export async function discardLegacyRecoveryDraft({ sessionId, sampleId, expectedFingerprint }) {
  const db = await getLocalDatabase();
  const actor = await getLocalProfileIdentity();
  await db.withExclusiveTransactionAsync(async txn => {
    await requireSameTastingActor(actor);
    if (!expectedFingerprint || expectedFingerprint !== await legacyFingerprintWithDb(txn, sessionId, sampleId, actor)) tastingFail('tasting:stale_context');
    await txn.runAsync('DELETE FROM local_legacy_recovery_drafts WHERE session_id=? AND sample_id=? AND local_profile_id=?', [sessionId, sampleId, actor]);
    await requireSameTastingActor(actor);
  });
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

export async function saveLegacyResponse({ sessionId, sampleId, response, complete = false, intent = 'save', expectedFingerprint = null }) {
  try { response = JSON.parse(canonicalize(response)); } catch { return { ok: false, errors: ['response:invalid_object'] }; }
  const actor = await getOrCreateLocalProfileIdentity();
  if (!['save', 'recovery'].includes(intent)) return { ok: false, errors: ['response:invalid_intent'] };
  const fingerprint = expectedFingerprint ?? await legacyFingerprintWithDb(await getLocalDatabase(), sessionId, sampleId, actor);
  const session = await getSessionById(sessionId);
  const trusted = trustedLegacySession(session);
  if (session.status === 'complete') {
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
    if (current?.status === 'complete') {
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
    await assertAssessmentReadyWithDb(txn, sessionId);
    if (fingerprint !== await legacyFingerprintWithDb(txn, sessionId, sampleId, actor)) tastingFail('tasting:stale_context');
    const access = await streamWithDb(txn, sessionId, sampleId, 2, actor);
    if (!access.canWrite) tastingFail(access.state === 'unattributed' ? 'tasting:review_required' : 'tasting:foreign_stream');
    if (intent === 'recovery') {
      await txn.runAsync(`INSERT INTO local_legacy_recovery_drafts
        (session_id,sample_id,local_profile_id,context_json,base_fingerprint,response_json,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id,sample_id,local_profile_id) DO UPDATE SET
        context_json=excluded.context_json,base_fingerprint=excluded.base_fingerprint,response_json=excluded.response_json,updated_at=excluded.updated_at`,
      [sessionId, sampleId, actor, canonicalize({ sessionId, sampleId, pin: trusted.identity, count: sample.cupNumber }), fingerprint, canonicalize(response), new Date().toISOString()]);
      await requireSameTastingActor(actor);
      committedFingerprint = fingerprint;
      outcome = { ok: true, recoverySaved: true }; return;
    }
    await persistHistoryWithDb(txn, sessionId);
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
    await requireSameTastingActor(actor);
    outcome = { ok: true, result, errors: validation.errors,
      access: { state: 'mine', canWrite: true, canAdopt: false, sourceToken: null } };
  });
  if (!outcome?.ok) return outcome;
  await requireSameTastingActor(actor);
  const acknowledged = await getLegacyResponse(sessionId, sampleId);
  await requireSameTastingActor(actor);
  if (acknowledged.savedFingerprint !== committedFingerprint) tastingFail('tasting:ack_changed');
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
