// Installation-local workflow provenance, not service authentication or a
// multi-participant response store. All callers supply a transaction handle.
const { sha256, canonicalize } = require('../features/forms/contract/canonical');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const validActor = actor => typeof actor === 'string' && UUID.test(actor);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const contextToken = (actor, sessionId, revision = 0, hash = '') => validActor(actor) ? sha256(canonicalize(['local-tasting-v2', actor, sessionId, revision, hash])) : null;

async function historyWithDb(db, sessionId) {
  const row = await db.getFirstAsync('SELECT * FROM local_session_foundations WHERE session_id = ?', [sessionId]);
  const source = await db.getFirstAsync(`SELECT status, local_tasting_started_at AS startedAt,
    EXISTS(SELECT 1 FROM local_tasting_completions WHERE session_id = sessions.id) OR
    EXISTS(SELECT 1 FROM local_tasting_completion_events WHERE session_id = sessions.id) AS completed
    FROM sessions WHERE id = ?`, [sessionId]);
  if (!source) fail('tasting:unavailable');
  if (!['new', 'pending', 'in_progress', 'complete'].includes(source.status)) fail('tasting:damaged_history');
  const completed = source.status === 'complete' || Boolean(source.completed);
  // Unknown/corrupt legacy state cannot restore preparation or setup authority.
  const started = completed || source.startedAt != null || !['new', 'pending'].includes(source.status);
  if (row) {
    if (row.schema_version !== 1 || ![0, 1].includes(row.ever_started) || ![0, 1].includes(row.ever_completed) ||
        row.ever_completed > row.ever_started || started && !row.ever_started || completed && !row.ever_completed) fail('tasting:damaged_history');
    return row;
  }
  return { ever_started: started ? 1 : 0,
    ever_completed: completed ? 1 : 0 };
}

async function persistHistoryWithDb(db, sessionId, { started = false, completed = false } = {}) {
  const history = await historyWithDb(db, sessionId);
  await db.runAsync(`INSERT INTO local_session_foundations(session_id,schema_version,ever_started,ever_completed)
    VALUES (?,1,?,?) ON CONFLICT(session_id) DO UPDATE SET
    ever_started=excluded.ever_started, ever_completed=excluded.ever_completed`,
  [sessionId, history.ever_started || started || completed ? 1 : 0, history.ever_completed || completed ? 1 : 0]);
}

function semanticSource(source) {
  if (!source) return null;
  try {
    const output = { form_key: source.form_key, form_version: source.form_version, form_hash: source.form_hash,
      cup_count: source.cup_count, response: JSON.parse(source.response_json), complete: source.is_complete,
      result: source.result_json == null ? null : JSON.parse(source.result_json),
      calculation_policy: source.calculation_policy ?? null, defect_policy: source.defect_policy ?? null };
    if (![0, 1].includes(output.complete)) fail('tasting:damaged_response');
    canonicalize(output); return output;
  } catch { fail('tasting:damaged_response'); }
}

async function aggregateWithDb(db, sessionId, actor) {
  const session = await db.getFirstAsync('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) fail('tasting:unavailable');
  const samples = await db.getAllAsync('SELECT * FROM samples WHERE session_id = ? ORDER BY id', [sessionId]);
  const entries = [];
  for (const sample of samples) {
    const owner = await db.getFirstAsync('SELECT local_profile_id,bound_at FROM local_response_streams WHERE session_id = ? AND sample_id = ?', [sessionId, sample.id]);
    if (owner && (!validActor(owner.local_profile_id) || !validTime(owner.bound_at))) fail('tasting:damaged_provenance');
    entries.push({ id: sample.id, cupUUID: sample.cup_uuid, number: sample.sample_number, code: sample.sample_code, metadata: sample.sample_metadata_json, form: sample.cupping_form,
      mode: sample.cupping_mode, count: sample.cup_number, owner: owner?.local_profile_id ?? null,
      response: [1, 2].includes(session.cupping_form) ? semanticSource(await sourceWithDb(db, sessionId, sample.id, session.cupping_form)) : null });
  }
  const content = { version: 1, sessionId, actor, pin: { form: session.cupping_form, key: session.form_key,
    version: session.form_version, hash: session.form_hash, mode: session.cupping_mode }, samples: entries };
  const json = canonicalize(content);
  return { content, json, hash: sha256(json), coverage: canonicalize(entries.map(sample => sample.id)) };
}

async function revisionWithDb(db, sessionId, actor) {
  const current = await aggregateWithDb(db, sessionId, actor);
  const row = await db.getFirstAsync('SELECT * FROM local_tasting_revisions WHERE session_id = ? AND local_profile_id = ?', [sessionId, actor]);
  if (row && (!Number.isSafeInteger(row.saved_revision) || row.saved_revision < 1 || !validTime(row.updated_at) ||
      typeof row.content_json !== 'string' || sha256(row.content_json) !== row.content_hash)) fail('tasting:damaged_revision');
  if (row) {
    try { if (canonicalize(JSON.parse(row.content_json)) !== row.content_json) fail('tasting:damaged_revision'); }
    catch { fail('tasting:damaged_revision'); }
  }
  return { ...current, row, revision: row?.saved_revision || 0, matches: !row || row.content_json === current.json };
}

async function commitRevisionWithDb(db, sessionId, actor, { starts = false } = {}) {
  if (!validActor(actor)) fail('tasting:actor_unavailable');
  const current = await revisionWithDb(db, sessionId, actor);
  await persistHistoryWithDb(db, sessionId, { started: starts });
  const changed = !current.row || !current.matches;
  if (changed) await db.runAsync(`INSERT INTO local_tasting_revisions
    (session_id,local_profile_id,saved_revision,content_json,content_hash,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(session_id,local_profile_id) DO UPDATE SET saved_revision=excluded.saved_revision,
    content_json=excluded.content_json,content_hash=excluded.content_hash,updated_at=excluded.updated_at`,
  [sessionId, actor, current.revision + 1, current.json, current.hash, new Date().toISOString()]);
  if (starts) await startWithDb(db, sessionId);
  return { changed, revision: changed ? current.revision + 1 : current.revision };
}

function hasScoreOrNote(response, form) {
  if (!response) return false;
  if (form === 1) return Object.values(response.ratings || {}).some(value => value != null) ||
    Object.values(response.affective_notes || {}).some(value => typeof value === 'string' && value.length > 0) ||
    ['general_affective_notes', 'defect_description'].some(key => typeof response[key] === 'string' && response[key].length > 0);
  return Object.values(response.quality_ratings || {}).some(value => value != null) ||
    ['notes', 'aroma_qualities', 'fragrance_aroma_notes', 'defect_description'].some(key => typeof response[key] === 'string' && response[key].length > 0);
}

async function startWithDb(db, sessionId) {
  await persistHistoryWithDb(db, sessionId, { started: true });
  await db.runAsync('UPDATE sessions SET local_tasting_started_at = COALESCE(local_tasting_started_at, ?) WHERE id = ?',
    [new Date().toISOString(), sessionId]);
}

async function hasStartedWithDb(db, sessionId) {
  const foundation = await db.getFirstAsync('SELECT session_id FROM local_session_foundations WHERE session_id = ?', [sessionId]);
  if (foundation) return Boolean((await historyWithDb(db, sessionId)).ever_started);
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
  const history = await historyWithDb(db, sessionId);
  const row = validActor(actor) ? await db.getFirstAsync(`SELECT completed_at AS completedAt,
    identity_revealed_at AS revealedAt FROM local_tasting_completions
    WHERE session_id = ? AND local_profile_id = ?`, [sessionId, actor]) : null;
  if (row && (!validTime(row.completedAt) || !validTime(row.revealedAt) || row.completedAt !== row.revealedAt)) fail('tasting:damaged_completion');
  const current = validActor(actor) ? await revisionWithDb(db, sessionId, actor) : null;
  const evidence = current?.row && current.matches ? await db.getFirstAsync(`SELECT * FROM local_tasting_completion_events
    WHERE session_id=? AND local_profile_id=? AND saved_revision=?`, [sessionId, actor, current.revision]) : null;
  if (evidence && (!validTime(evidence.completed_at) || evidence.completed_at !== evidence.identity_revealed_at ||
      evidence.content_hash !== current.hash || evidence.coverage_json !== current.coverage)) fail('tasting:damaged_completion');
  const completed = Boolean(evidence && current.content.samples.length);
  return { started, everCompleted: Boolean(history.ever_completed), completed, revealed: completed,
    completedAt: completed ? evidence.completed_at : null,
    savedRevision: current?.revision ?? null,
    contextToken: current ? contextToken(actor, sessionId, current.revision, current.hash) : null };
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
  return current;
}

async function adoptionDuplicateWithDb(db, sessionId, sampleId, actor, token) {
  const row = await db.getFirstAsync('SELECT local_profile_id, adoption_source_token FROM local_response_streams WHERE session_id = ? AND sample_id = ?', [sessionId, sampleId]);
  return validActor(actor) && row?.local_profile_id === actor && typeof token === 'string' && row.adoption_source_token === token;
}

async function completeWithDb(db, sessionId, actor) {
  if (!validActor(actor)) fail('tasting:actor_unavailable');
  const prior = await stateWithDb(db, sessionId, actor);
  if (!(await revisionWithDb(db, sessionId, actor)).matches) fail('tasting:stale_content');
  if (prior.completed) return prior;
  await commitRevisionWithDb(db, sessionId, actor);
  const current = await revisionWithDb(db, sessionId, actor);
  if (!current.content.samples.length) fail('tasting:empty');
  const now = new Date().toISOString();
  await startWithDb(db, sessionId);
  await persistHistoryWithDb(db, sessionId, { completed: true });
  await db.runAsync(`INSERT OR IGNORE INTO local_tasting_completions
    (session_id, local_profile_id, completed_at, identity_revealed_at) VALUES (?, ?, ?, ?)`, [sessionId, actor, now, now]);
  await db.runAsync(`INSERT INTO local_tasting_completion_events
    (session_id,local_profile_id,saved_revision,content_hash,coverage_json,completed_at,identity_revealed_at)
    VALUES (?,?,?,?,?,?,?)`, [sessionId, actor, current.revision, current.hash, current.coverage, now, now]);
  return stateWithDb(db, sessionId, actor);
}

module.exports = { fail, validActor, contextToken, startWithDb, hasStartedWithDb, assertUnstartedWithDb,
  stateWithDb, sourceWithDb, streamWithDb, writeStreamWithDb, adoptionDuplicateWithDb, completeWithDb,
  historyWithDb, persistHistoryWithDb, aggregateWithDb, revisionWithDb, commitRevisionWithDb,
  semanticSource, hasScoreOrNote };
