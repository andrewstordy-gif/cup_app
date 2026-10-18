// Installation-local workflow provenance, not service authentication or a
// multi-participant response store. All callers supply a transaction handle.
const { sha256 } = require('../features/forms/contract/canonical');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const validActor = actor => typeof actor === 'string' && UUID.test(actor);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const contextToken = (actor, sessionId) => validActor(actor) ? sha256(JSON.stringify(['local-tasting-v1', actor, sessionId])) : null;

async function startWithDb(db, sessionId) {
  await db.runAsync('UPDATE sessions SET local_tasting_started_at = COALESCE(local_tasting_started_at, ?) WHERE id = ?',
    [new Date().toISOString(), sessionId]);
}

async function hasStartedWithDb(db, sessionId) {
  const row = await db.getFirstAsync(`SELECT status, local_tasting_started_at AS startedAt,
    EXISTS(SELECT 1 FROM cva_response_revisions WHERE session_id = sessions.id) OR
    EXISTS(SELECT 1 FROM legacy_responses WHERE session_id = sessions.id) OR
    EXISTS(SELECT 1 FROM sample_feedback_entries WHERE session_id = sessions.id) OR
    EXISTS(SELECT 1 FROM sample_defect_entries WHERE session_id = sessions.id) OR
    EXISTS(SELECT 1 FROM sample_flavour_observations WHERE session_id = sessions.id) AS evidence
    FROM sessions WHERE id = ?`, [sessionId]);
  if (!row) fail('tasting:unavailable');
  // A malformed latch/state is not permission to regain preparation identity.
  return row.startedAt != null || Boolean(row.evidence) || ['in_progress', 'complete'].includes(row.status) ||
    !['new', 'pending'].includes(row.status);
}

async function assertUnstartedWithDb(db, sessionId) {
  if (await hasStartedWithDb(db, sessionId)) fail('tasting:setup_started');
}

async function stateWithDb(db, sessionId, actor) {
  const started = await hasStartedWithDb(db, sessionId);
  const row = validActor(actor) ? await db.getFirstAsync(`SELECT completed_at AS completedAt,
    identity_revealed_at AS revealedAt FROM local_tasting_completions
    WHERE session_id = ? AND local_profile_id = ?`, [sessionId, actor]) : null;
  if (row && (!validTime(row.completedAt) || !validTime(row.revealedAt) || row.completedAt !== row.revealedAt)) fail('tasting:damaged_completion');
  return { started, completed: Boolean(row), revealed: Boolean(row),
    completedAt: row?.completedAt || null, contextToken: contextToken(actor, sessionId) };
}

async function sourceWithDb(db, sessionId, sampleId, form) {
  if (form === 1) return db.getFirstAsync('SELECT * FROM cva_response_revisions WHERE session_id = ? AND sample_id = ? ORDER BY revision DESC LIMIT 1', [sessionId, sampleId]);
  if (form === 2) return db.getFirstAsync('SELECT * FROM legacy_responses WHERE session_id = ? AND sample_id = ?', [sessionId, sampleId]);
  fail('tasting:unsupported');
}

async function sourceContextWithDb(db, sessionId, sampleId) {
  return db.getFirstAsync(`SELECT s.id, s.status, s.cupping_form, s.form_key, s.form_version, s.form_hash,
    s.cupping_mode, sm.id AS sample_id, sm.cupping_form AS sample_form,
    sm.cupping_mode AS sample_mode, sm.cup_number, sm.cup_uuid
    FROM sessions s JOIN samples sm ON sm.session_id = s.id WHERE s.id = ? AND sm.id = ?`, [sessionId, sampleId]);
}

function sourceToken(actor, context, source) {
  // Raw source remains in SQLite; only this non-authorising fingerprint reaches
  // presentation state. An actor change across a prompt invalidates the token.
  return validActor(actor) && context && source
    ? sha256(JSON.stringify(['local-adoption-v1', actor, context, source])) : null;
}

async function streamWithDb(db, sessionId, sampleId, form, actor) {
  const context = await sourceContextWithDb(db, sessionId, sampleId);
  const source = await sourceWithDb(db, sessionId, sampleId, form);
  const row = await db.getFirstAsync(`SELECT * FROM local_response_streams WHERE session_id = ? AND sample_id = ?`, [sessionId, sampleId]);
  if (row && (!validActor(row.local_profile_id) || !validTime(row.bound_at))) fail('tasting:damaged_provenance');
  const state = !validActor(actor) ? 'unavailable' : row ? row.local_profile_id === actor ? 'mine' : 'foreign'
    : source ? 'unattributed' : 'fresh';
  const editable = Boolean(context) && ['new', 'pending', 'in_progress'].includes(context.status);
  return { state, canWrite: editable && ['fresh', 'mine'].includes(state),
    canAdopt: editable && state === 'unattributed', sourceToken: state === 'unattributed' ? sourceToken(actor, context, source) : null,
    source, context, provenance: row };
}

async function writeStreamWithDb(db, { sessionId, sampleId, form, actor, expectedSourceToken = null }) {
  const current = await streamWithDb(db, sessionId, sampleId, form, actor);
  if (!validActor(actor) || current.state === 'foreign' || current.state === 'unavailable') fail('tasting:foreign_stream');
  if (!current.context || !['new', 'pending', 'in_progress'].includes(current.context.status)) fail('tasting:read_only');
  if (expectedSourceToken !== null) {
    if (current.state !== 'unattributed' || expectedSourceToken !== current.sourceToken) fail('tasting:stale_review');
  } else if (current.state === 'unattributed') fail('tasting:review_required');
  if (!current.provenance) {
    await db.runAsync(`INSERT INTO local_response_streams
      (session_id, sample_id, local_profile_id, bound_at, recovery_source_json, adoption_source_token)
      VALUES (?, ?, ?, ?, ?, ?)`, [sessionId, sampleId, actor, new Date().toISOString(),
      expectedSourceToken ? JSON.stringify(current.source) : null, expectedSourceToken]);
  }
  await startWithDb(db, sessionId);
  return current;
}

async function adoptionDuplicateWithDb(db, sessionId, sampleId, actor, token) {
  const row = await db.getFirstAsync('SELECT local_profile_id, adoption_source_token FROM local_response_streams WHERE session_id = ? AND sample_id = ?', [sessionId, sampleId]);
  return validActor(actor) && row?.local_profile_id === actor && typeof token === 'string' && row.adoption_source_token === token;
}

async function completeWithDb(db, sessionId, actor) {
  if (!validActor(actor)) fail('tasting:actor_unavailable');
  const prior = await stateWithDb(db, sessionId, actor);
  if (prior.completed) return prior;
  const now = new Date().toISOString();
  await startWithDb(db, sessionId);
  await db.runAsync(`INSERT INTO local_tasting_completions
    (session_id, local_profile_id, completed_at, identity_revealed_at) VALUES (?, ?, ?, ?)`, [sessionId, actor, now, now]);
  return stateWithDb(db, sessionId, actor);
}

module.exports = { fail, validActor, contextToken, startWithDb, hasStartedWithDb, assertUnstartedWithDb,
  stateWithDb, sourceWithDb, streamWithDb, writeStreamWithDb, adoptionDuplicateWithDb, completeWithDb };
