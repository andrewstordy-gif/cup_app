// Bounded prototype storage adapter, not the production participant/event store.
const { PROFILE, resolveForm, resolvePinnedForm, validateResponse, scoreResponse } = require('../../forms/contract');
const { canonicalize } = require('../../forms/contract/canonical');
const { cvaEnvelope, RATINGS, cvaNoteGroups } = require('./cvaResponse');
const active = () => resolveForm(PROFILE, 1).identity;
const samePin = (left, right) => left && right && Object.keys(left).length === 3 &&
  ['form_key', 'form_version', 'form_hash'].every(key => left[key] === right[key]);
const fail = code => { const error = new Error(code); error.code = code; throw error; };

async function context(db, sessionId, sampleId) {
  const row = await db.getFirstAsync(`SELECT s.status, s.cupping_form AS sessionForm,
    s.form_key AS formKey, s.form_version AS formVersion, s.form_hash AS formHash,
    sm.cupping_form AS sampleForm, sm.cup_number AS cupCount
    FROM sessions s JOIN samples sm ON sm.session_id = s.id WHERE s.id = ? AND sm.id = ? LIMIT 1`, [sessionId, sampleId]);
  const identity = { form_key: row?.formKey, form_version: row?.formVersion, form_hash: row?.formHash };
  const resolved = resolvePinnedForm(PROFILE, 1, identity);
  if (!row || row.sessionForm !== 1 || row.sampleForm !== 1 || !resolved.ok || !['2.0.0','3.0.0'].includes(identity.form_version)) fail('cva:unsupported_session');
  if (!Number.isInteger(row.cupCount) || row.cupCount < 1 || row.cupCount > 8) fail('cva:invalid_cup_count');
  if (!['new', 'pending', 'in_progress', 'complete'].includes(row.status)) fail('cva:unsupported_session_state');
  return { trusted: { profile: PROFILE, f: 1, identity }, n: row.cupCount, sessionComplete: row.status === 'complete', historicalReadOnly: !samePin(identity, active()) };
}

async function latest(db, sessionId, sampleId) {
  return db.getFirstAsync(`SELECT revision, form_key AS formKey, form_version AS formVersion, form_hash AS formHash,
    cup_count AS cupCount, response_json AS responseJson, is_complete AS isComplete, result_json AS resultJson,
    calculation_policy AS calculationPolicy, defect_policy AS defectPolicy
    FROM cva_response_revisions WHERE session_id = ? AND sample_id = ? ORDER BY revision DESC LIMIT 1`, [sessionId, sampleId]);
}

async function readWithDb(db, sessionId, sampleId) {
  const current = await context(db, sessionId, sampleId);
  const row = await latest(db, sessionId, sampleId);
  if (!row) return { ...current, revision: 0, response: null, complete: false, result: null, errors: [], everComplete: false };
  if (row.calculationPolicy !== 'sca104-exact-quarter-v1' || row.defectPolicy !== 'sca104-three-types-v1') fail('cva:unsupported_saved_policy');
  if (!samePin({ form_key: row.formKey, form_version: row.formVersion, form_hash: row.formHash }, current.trusted.identity) ||
      row.cupCount !== current.n || !Number.isInteger(row.revision) || ![0, 1].includes(row.isComplete)) fail('cva:stored_identity_mismatch');
  if (row.isComplete === 0 && row.resultJson !== null) fail('cva:damaged_result');
  let response;
  try { response = JSON.parse(row.responseJson); canonicalize(response); } catch { fail('cva:damaged_response'); }
  const input = cvaEnvelope(response, current.trusted, current.n, row.isComplete === 1);
  const validation = validateResponse(input, current.trusted);
  if (!validation.ok) fail('cva:invalid_saved_response');
  const result = row.isComplete === 1 ? scoreResponse(input, current.trusted) : null;
  if (result) {
    let savedResult;
    try { savedResult = JSON.parse(row.resultJson); } catch { fail('cva:damaged_result'); }
    if (!result.ok || canonicalize(savedResult) !== canonicalize(result)) fail('cva:saved_result_mismatch');
  }
  const ever = await db.getFirstAsync('SELECT revision FROM cva_response_revisions WHERE session_id = ? AND sample_id = ? AND is_complete = 1 LIMIT 1', [sessionId, sampleId]);
  const final = validateResponse({ ...input, complete: true }, current.trusted);
  return { ...current, revision: row.revision, response, complete: row.isComplete === 1, result,
    errors: final.errors, everComplete: Boolean(ever) };
}

async function saveWithDb(db, { sessionId, sampleId, response, expectedRevision, expectedIdentity, expectedCupCount }, generateId, descriptorProjection = () => [], beforeWrite = async () => {}) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) fail('cva:invalid_revision');
  let responseJson;
  try { responseJson = canonicalize(response); } catch { fail('cva:malformed_response'); }
  // Freeze caller input before any asynchronous boundary.
  const captured = JSON.parse(responseJson);
  let outcome;
  await db.withExclusiveTransactionAsync(async txn => {
    const current = await context(txn, sessionId, sampleId);
    if (current.historicalReadOnly) fail('cva:historical_read_only');
    if (current.sessionComplete) fail('cva:session_complete');
    if (!samePin(expectedIdentity, current.trusted.identity) || expectedCupCount !== current.n) fail('cva:session_changed');
    const previous = await readWithDb(txn, sessionId, sampleId);
    if (previous.revision !== expectedRevision) fail('cva:stale_revision');
    const input = cvaEnvelope(captured, current.trusted, current.n);
    const draft = validateResponse(input, current.trusted);
    if (!draft.ok) fail('cva:invalid_draft');
    const final = validateResponse({ ...input, complete: true }, current.trusted);
    const result = final.ok ? scoreResponse({ ...input, complete: true }, current.trusted) : null;
    if (final.ok && !result?.ok) fail('cva:score_unavailable');
    // The app repository supplies transaction-bound actor/stream provenance.
    // Keep this storage adapter's immutable response and scoring contracts intact.
    const guard = await beforeWrite(txn, current, previous);
    // Explicit adoption can retain an old draft's finality without silently
    // certifying it. Only the repository's internal hook supplies this option.
    const persistedComplete = final.ok && guard?.preserveDraft !== true;
    const persistedResult = persistedComplete ? result : null;
    const now = new Date().toISOString();
    const revision = previous.revision + 1;
    await txn.runAsync(`INSERT INTO cva_response_revisions
      (id, session_id, sample_id, revision, form_key, form_version, form_hash, cup_count, response_json,
       is_complete, result_json, calculation_policy, defect_policy, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), sessionId, sampleId, revision, current.trusted.identity.form_key, current.trusted.identity.form_version,
      current.trusted.identity.form_hash, current.n, responseJson, persistedComplete ? 1 : 0, persistedResult ? canonicalize(persistedResult) : null,
      'sca104-exact-quarter-v1', 'sca104-three-types-v1', now]);
    await txn.runAsync('DELETE FROM sample_flavour_observations WHERE session_id = ? AND sample_id = ?', [sessionId, sampleId]);
    for (const observation of descriptorProjection(captured)) {
      await txn.runAsync(`INSERT INTO sample_flavour_observations
        (id, session_id, sample_id, keyword, label, colour, source_field, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [generateId(), sessionId, sampleId, observation.keyword,
        observation.label, observation.colour, observation.sourceField, now]);
    }
    // Repository hooks own semantic progress (an empty/default-only Save does
    // not start tasting). Standalone adapter consumers retain their old contract.
    if (!guard) await txn.runAsync("UPDATE sessions SET status = 'in_progress', updated_at = ? WHERE id = ? AND status <> 'complete'", [now, sessionId]);
    if (typeof guard === 'function') await guard();
    else if (typeof guard?.finalize === 'function') await guard.finalize();
    outcome = { saved: true, revision, response: captured, complete: persistedComplete, result: persistedResult, errors: final.errors,
      firstComplete: persistedComplete && !previous.everComplete, everComplete: previous.everComplete || persistedComplete };
  });
  return outcome;
}

async function statusesWithDb(db, sessionId) {
  const samples = await db.getAllAsync('SELECT id FROM samples WHERE session_id = ?', [sessionId]);
  const output = {};
  for (const sample of samples) {
    const saved = await readWithDb(db, sessionId, sample.id);
    output[sample.id] = { isComplete: saved.complete, finalScore: saved.result?.display_score ?? null,
      canonicalCva: true, noteGroups: cvaNoteGroups(saved.response),
      resultLabel: saved.result?.label || null,
      hasAnyFeedback: saved.historicalReadOnly ? saved.revision > 0 : Object.values(RATINGS).some(key => saved.response?.ratings?.[key] != null), revision: saved.revision,
      scoresByField: Object.fromEntries(Object.entries(RATINGS).filter(([, key]) => saved.response?.ratings?.[key] != null)
        .map(([label, key]) => [label, saved.response.ratings[key]])) };
  }
  return output;
}

async function closeWithDb(db, sessionId) {
  let outcome;
  await db.withExclusiveTransactionAsync(async txn => {
    const sample = await txn.getFirstAsync('SELECT id FROM samples WHERE session_id = ? LIMIT 1', [sessionId]);
    if (sample && (await context(txn, sessionId, sample.id)).historicalReadOnly) fail('cva:historical_read_only');
    const statuses = await statusesWithDb(txn, sessionId);
    const values = Object.values(statuses);
    if (!values.length || values.some(value => !value.isComplete)) fail('cva:incomplete_session');
    await txn.runAsync("UPDATE sessions SET status = 'complete', updated_at = ? WHERE id = ?", [new Date().toISOString(), sessionId]);
    outcome = { updated: true, status: 'complete' };
  });
  return outcome;
}

module.exports = { readWithDb, saveWithDb, statusesWithDb, closeWithDb };
