// Transaction helpers only. No radio, UI, profile creation or database opening.
const { canonicalize, sha256 } = require('../features/forms/contract/canonical');

const PENDING_SAMPLE_SCHEMA = `CREATE TABLE IF NOT EXISTS local_pending_sample_additions (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  cup_uuid TEXT NOT NULL UNIQUE,
  format_version INTEGER NOT NULL CHECK(format_version=1),
  phase TEXT NOT NULL CHECK(phase IN ('check','verified')),
  base_hash TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL
)`;
const fail = () => { throw new Error('Pending cup setup changed or is unavailable. Reopen the session; no sample was added.'); };
const normalize = sql => String(sql).replace(/IF NOT EXISTS /gi,'').replace(/\s+/g,'').toLowerCase();
// Native/test SQLite adapters may return null-prototype row objects.
const setupFingerprint = setup => sha256(canonicalize(JSON.parse(JSON.stringify(setup))));
const pendingSampleFields = sample => Object.fromEntries(
  ['id','cupUUID','cupNumber','cuppingForm','cuppingMode','sampleNumber','coffeeNameOrigin','process'].map(key=>[key,sample[key]]));
function pendingSaveInput(input) {
  return { sessionUUID:input.sessionUUID, existingSessionId:input.existingSessionId,
    cuppingForm:input.cuppingForm,cuppingMode:input.cuppingMode ?? null,
    sessionDisplayId:input.sessionDisplayId ?? '',sessionName:input.sessionName,sessionType:input.sessionType,
    samplesInSession:input.samplesInSession ?? 0,status:input.status ?? 'new',sessionDate:input.sessionDate,
    samples:(input.samples || []).map(pendingSampleFields),intent:input.intent ?? 'save' };
}

async function assertSchema(db) {
  const row = await db.getFirstAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='local_pending_sample_additions'");
  if (!row || normalize(row.sql) !== normalize(PENDING_SAMPLE_SCHEMA)) fail();
}

async function pendingRowWithDb(db, sessionId) {
  await assertSchema(db);
  return db.getFirstAsync('SELECT * FROM local_pending_sample_additions WHERE session_id=?', [sessionId]);
}

function decodePending(row, actor, setup) {
  if (!row) return null;
  if (row.format_version !== 1 || row.actor_id !== actor || !['check','verified'].includes(row.phase) ||
      typeof row.operation_id !== 'string' || !row.operation_id ||
      row.base_hash !== setupFingerprint(setup) || sha256(row.content_json) !== row.content_hash) fail();
  let content;
  try { content=JSON.parse(row.content_json); if(canonicalize(content)!==row.content_json)fail(); } catch { fail(); }
  if (!content?.candidate || !content?.saveInput || !content?.payload ||
      content.saveInput.sessionUUID !== row.session_id || content.saveInput.existingSessionId !== row.session_id ||
      content.candidate.cupUUID !== row.cup_uuid || typeof content.candidate.id !== 'string' || !content.candidate.id ||
      !Array.isArray(content.saveInput.samples) || content.saveInput.samples.filter(s=>s.id===content.candidate.id).length!==1) fail();
  if (canonicalize(pendingSaveInput(content.saveInput))!==canonicalize(content.saveInput) ||
      canonicalize(pendingSampleFields(content.candidate))!==canonicalize(content.candidate) ||
      canonicalize(content.saveInput.samples.find(s=>s.id===content.candidate.id))!==canonicalize(content.candidate)) fail();
  return { ...content, sessionId: row.session_id, operationId: row.operation_id, phase: row.phase };
}

async function stagePendingWithDb(db, {sessionId, actor, setup, operationId, expectedOperationId, candidate, saveInput, payload}) {
  const previous=await pendingRowWithDb(db,sessionId);
  if ((previous?.operation_id ?? null)!==(expectedOperationId ?? null)) fail();
  if(previous) {
    decodePending(previous,actor,setup);
    if(previous.cup_uuid!==candidate.cupUUID || JSON.parse(previous.content_json).candidate.id!==candidate.id) fail();
  }
  const json=canonicalize({candidate,saveInput,payload});
  if(json.length>262144)throw new Error('Pending sample details are too large. No cup was written.');
  await db.runAsync(`INSERT INTO local_pending_sample_additions
    (session_id,operation_id,actor_id,cup_uuid,format_version,phase,base_hash,content_json,content_hash)
    VALUES (?,?,?,?,1,'check',?,?,?) ON CONFLICT(session_id) DO UPDATE SET
    operation_id=excluded.operation_id,actor_id=excluded.actor_id,cup_uuid=excluded.cup_uuid,
    format_version=1,phase='check',base_hash=excluded.base_hash,content_json=excluded.content_json,content_hash=excluded.content_hash`,
  [sessionId,operationId,actor,candidate.cupUUID,setupFingerprint(setup),json,sha256(json)]);
  return decodePending(await pendingRowWithDb(db,sessionId),actor,setup);
}

async function assertNoPendingWithDb(db, sessionId) {
  if(await pendingRowWithDb(db,sessionId))throw new Error('Finish the pending cup check from Add Sample before changing or tasting this session.');
}

module.exports = { PENDING_SAMPLE_SCHEMA, setupFingerprint, pendingSampleFields, pendingSaveInput, pendingRowWithDb, decodePending, stagePendingWithDb, assertNoPendingWithDb };
