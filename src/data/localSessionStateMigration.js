// Additive prototype evolution. No response, profile, historical completion or
// score rewrite belongs in this migration. Caller holds an exclusive transaction.
const fail = () => { throw new Error('tasting:damaged_schema'); };
const definitions = {
  local_session_state_schema: `version INTEGER PRIMARY KEY CHECK(version=1)`,
  local_session_foundations: `session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    schema_version INTEGER NOT NULL CHECK(schema_version=1),
    ever_started INTEGER NOT NULL CHECK(ever_started IN(0,1)),
    ever_completed INTEGER NOT NULL CHECK(ever_completed IN(0,1))`,
  local_tasting_revisions: `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    local_profile_id TEXT NOT NULL, saved_revision INTEGER NOT NULL CHECK(saved_revision>=1),
    content_json TEXT NOT NULL, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(session_id, local_profile_id)`,
  local_tasting_completion_events: `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    local_profile_id TEXT NOT NULL, saved_revision INTEGER NOT NULL CHECK(saved_revision>=1),
    content_hash TEXT NOT NULL, coverage_json TEXT NOT NULL,
    completed_at TEXT NOT NULL, identity_revealed_at TEXT NOT NULL,
    CHECK(completed_at=identity_revealed_at), PRIMARY KEY(session_id, local_profile_id, saved_revision)`,
  local_legacy_recovery_drafts: `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE, local_profile_id TEXT NOT NULL,
    context_json TEXT NOT NULL, base_fingerprint TEXT NOT NULL, response_json TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY(session_id, sample_id, local_profile_id)`,
};
// Compare declared shapes, including CHECK/FK/key clauses, with our static DDL.
// A malformed lookalike table must not acquire a successful migration marker.
const normalize = sql => sql.replace(/\s+/g, '').replace(/IFNOTEXISTS/gi, '').replace(/;/g, '').toLowerCase();
async function migrateFoundationWithDb(db) {
  const markerTable = await db.getFirstAsync('SELECT sql FROM sqlite_master WHERE type=? AND name=?', ['table', 'local_session_state_schema']);
  let initialized = false;
  if (markerTable) {
    if (normalize(markerTable.sql) !== normalize(`CREATE TABLE local_session_state_schema (${definitions.local_session_state_schema})`)) fail();
    const marker = await db.getFirstAsync('SELECT version FROM local_session_state_schema');
    if (marker && marker.version !== 1) fail();
    initialized = Boolean(marker);
  }
  for (const [name, body] of Object.entries(definitions)) {
    const ddl = `CREATE TABLE ${name} (${body})`;
    const existing = await db.getFirstAsync('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', ['table', name]);
    if (!existing && initialized) fail();
    if (existing && normalize(existing.sql) !== normalize(ddl)) fail();
    if (!existing) await db.execAsync(`${ddl};`);
  }
  const marker = await db.getFirstAsync('SELECT version FROM local_session_state_schema');
  if (marker && marker.version !== 1) fail();
  // Only new state tables receive backfilled conservative history. No old row
  // or timestamp changes, and no actor or revision-qualified reveal is invented.
  await db.runAsync(`INSERT OR IGNORE INTO local_session_foundations
    (session_id, schema_version, ever_started, ever_completed)
    SELECT id, 1, CASE WHEN local_tasting_started_at IS NOT NULL OR status IS NULL OR status NOT IN ('new','pending') OR
      EXISTS(SELECT 1 FROM cva_response_revisions WHERE session_id=sessions.id) OR
      EXISTS(SELECT 1 FROM legacy_responses WHERE session_id=sessions.id) OR
      EXISTS(SELECT 1 FROM sample_feedback_entries WHERE session_id=sessions.id) OR
      EXISTS(SELECT 1 FROM sample_defect_entries WHERE session_id=sessions.id) OR
      EXISTS(SELECT 1 FROM sample_flavour_observations WHERE session_id=sessions.id) OR
      EXISTS(SELECT 1 FROM local_tasting_completions WHERE session_id=sessions.id)
      THEN 1 ELSE 0 END,
      CASE WHEN status='complete' OR EXISTS(SELECT 1 FROM local_tasting_completions WHERE session_id=sessions.id)
      THEN 1 ELSE 0 END FROM sessions`);
  await db.runAsync('INSERT OR IGNORE INTO local_session_state_schema(version) VALUES (1)');
  await db.execAsync('PRAGMA user_version = 5;');
}
module.exports = { migrateFoundationWithDb };
