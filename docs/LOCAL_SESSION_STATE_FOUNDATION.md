# Local session state foundation

18 October 2026. R1-061 scoped implemented contract; its design passed independent review before runtime work. Product authority is [PRODUCT_SPEC section 6.8](PRODUCT_SPEC.md#68-agreed-mobile-screen-and-state-map-18-october-2026). This is an additive installation-local prototype evolution, not the fresh encrypted production schema or an upload implementation. Final implementation review and device gates are recorded separately in the task.

## Scope and preserved evidence

Keep `cup_user_test.db`, profile storage and UUID, every original response/result JSON byte, score policy, form pin, adoption source/token, sample number, completion timestamp and creator provenance. Do not recalculate old results during migration, infer authorship, manufacture consent or copy an advertised NFC roster. Existing global `sessions.status='complete'` without new qualified local completion remains historical read-only evidence; this foundation must not reinterpret it as locally owned editable completion.

New schema and state helpers live in the repository layer. Assessment layout, controls, navigation, NFC writes, upload and membership-removal commands remain outside this slice. Existing creator post-start setup guards stay in place until the physical consistency stage. Storing ever-completed history does not prematurely enable additions or removals.

## Additive schema

Create these tables with foreign keys and constraints in one exclusive migration transaction. Inspect actual columns with `PRAGMA table_info`, including partially applied version-4 stores; a user-version number alone is not a shape check. Keep original tables and rows intact.

| Table | Keys and stored fields | Purpose |
| --- | --- | --- |
| `local_session_foundations` | session primary key; `schema_version=1`; durable `ever_started`, `ever_completed`; initialization marker | Session-wide history and setup latch, never reveal authority |
| `local_tasting_revisions` | session/profile composite primary key; positive `saved_revision`; canonical `content_json`; `content_hash`; `updated_at` | Actor-owned aggregate identity for the committed local roster, trusted contexts and saved responses |
| `local_tasting_completion_events` | session/profile/revision composite primary key; exact saved `content_hash`; canonical coverage; completion/reveal timestamps equal | Append-only evidence qualifying a particular aggregate revision, retaining all earlier completions |
| `local_legacy_recovery_drafts` | session/sample/profile composite key; trusted pin/count and base saved response fingerprint; exact draft JSON; update time | Crash recovery separate from committed Legacy response, scoring, completion and start history |

The new tables never replace `local_tasting_completions`. Preserve its original evidence byte-for-byte. A new explicit completion may insert its first row if none exists, but never updates an earlier timestamp. New completion events are the current authority. No migration creates one from old completion-row existence.

Exact types: foundation `session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE`, `schema_version INTEGER NOT NULL CHECK(schema_version=1)`, `ever_started INTEGER NOT NULL CHECK(ever_started IN(0,1))`, `ever_completed INTEGER NOT NULL CHECK(ever_completed IN(0,1))`. Revision key columns are non-null TEXT with cascading session foreign key; `saved_revision INTEGER NOT NULL CHECK(saved_revision>=1)`; content/hash/time are non-null TEXT. Completion key has non-null TEXT session/profile and `saved_revision INTEGER NOT NULL CHECK(saved_revision>=1)`; hash/coverage/completion/reveal times are non-null TEXT, `CHECK(completed_at=identity_revealed_at)`. Recovery uses non-null TEXT session/sample/profile keys, cascading session/sample references, `context_json`, `base_fingerprint`, `response_json`, `updated_at` TEXT NOT NULL. Runtime validates UUIDs, ISO times, canonical JSON, hashes and cross-row session/sample consistency, not SQLite coercion alone.

Marker is `schema_version=1` in each foundation row, with `PRAGMA user_version=5` set transactionally after initialization. Empty stores use a single migration table `local_session_state_schema(version INTEGER PRIMARY KEY CHECK(version=1))`; the row is inserted last. Inspect all expected columns and declared primary-key positions even when tables already exist. A partial table missing a nullable-compatible/addable column is repaired before the marker; inconsistent keys/constraints/types or an existing completed marker with missing structure fail closed rather than dropping/replacing tables. New tables use `CREATE TABLE IF NOT EXISTS`; do not bless malformed lookalikes.

Each revision stores exactly canonical `{version:1, sessionId, actor, pin:{form, key, version, hash, mode}, samples:[...]}` sorted by sample ID. Each sample is `{id, cupUUID, number, form, mode, count, owner, response}`. `owner` is the stored validated stream actor or null; `response` is null, or `{form_key, form_version, form_hash, cup_count, response: parsed raw response JSON, complete:0|1, result: parsed result JSON|null, calculation_policy:string|null, defect_policy:string|null}` from the current CVA revision or Legacy row. Legacy calculated result is not newly materialized during migration/fingerprinting; its persisted result field is null and its immutable pin binds the calculator. CVA includes its exact persisted result and both policies. No raw source-row IDs/timestamps/CVA append counters enter semantic equality. Generic prototype rows stay outside active response certification. Never recalculate historical result content for a fingerprint.

`content_hash` uses existing SHA-256 canonicalization. DTOs expose the revision and a non-authorising fingerprint/token, not raw aggregate content. A hash is not proof of service identity or protection from direct database tampering.

## Migration and legacy completion

Initialize only conservative history: ever-started follows existing durable latch, recorded score/note/evidence or started/global-complete state; ever-completed follows any existing explicit completion row or historical global-complete status. Neither grants current reveal, ownership or write access. Missing/malformed evidence cannot unlock preparation/setup. Preserve unknown authorship.

Do not backfill current actor revision completion from unversioned historical evidence. Preserve that evidence and fail closed for new reveal. Existing explicit legacy-adoption recovery stays explicit and source-token guarded. A valid current stream may be explicitly completed again only after current ownership, pin and required saved-score validation; this records new evidence rather than rewriting old completion history. Historical global-complete/unsupported pins remain read-only.

Migration must be idempotent for fresh, older and partial schemas. Enclose prerequisite schema evolution and foundation initialization in one exclusive transaction; replace inherited destructive `DROP COLUMN` steps with additive compatibility handling so earlier mode/colour evidence remains intact. Do not copy old session mode into existing samples or rewrite their semantics; old ambiguous/unpinned contexts remain unsupported. Remove old unconditional per-start status/latch repairs after successful initialization. Repair missing columns by inspection, not duplicate ALTER assumptions. Set the durable migration marker only at the end, validate expected columns/constraints, then expose the database. Concurrent initialization shares one promise. On failure rollback, clear the failed promise for retry and reject all editing/read cutover; never fall back to partially migrated data or an old binary.

Migration does not read or modify AsyncStorage. Commands obtain and recheck its current profile UUID before commit. Tests snapshot original rows and raw text before/after, including old 89.5, not only numerical equality.

## Explicit Save and semantic revisions

Within one exclusive transaction, validate current actor, session/sample identity, trusted form pin/count/mode, existing provenance and optimistic expected response revision. Freeze caller inputs before awaiting. Known foreign/unattributed data cannot be overwritten; adoption remains a distinct explicitly confirmed command.

Save and adoption acknowledgements retain that captured actor across post-commit readback and require its exact committed CVA source revision or Legacy source fingerprint. A profile change or competing later readback rejects the acknowledgement without undoing or overwriting the already committed rows; reopening reads the durable state. Never merge another actor's access or a later response into the earlier operation's success.

Compute committed semantic content before and after Save. A true change advances that actor's aggregate saved revision exactly once, atomically with response persistence, descriptor projection and progress. It invalidates current completion by leaving old completion events attached only to their former revision. Do not delete history. Set durable ever-started only when an explicitly saved score or note exists; saving an empty/default-only response does not start tasting. Clearing a previously saved response never clears started history. Return IN PROGRESS after changed saved results when already started/ever-completed. No-op Save does not advance the aggregate, reopen, hide or change current completion time; retain existing response-adapter compatibility as necessary without using an append counter as semantic identity.

New current completion permits editing its owned streams even when the presentation status is COMPLETE; an old global-complete row without qualified local evidence does not. Keep response `sessionComplete` reserved for historical global closure/read-only behaviour: both existing form consumers use it to disable editing. Never populate that flag from local completion. Save acknowledgements return refreshed identity/access/tasting so shallow consumer merges cannot retain revealed metadata after a changed Save. Consumers must receive trusted current-state DTOs, not raw status booleans.

Canonical CVA and versioned Legacy are the active edited response boundaries. Earlier generic feedback/defect/flavour write paths retain their historical pin guards; they must not certify new current completion or bypass provenance. Historical unsupported pins remain unqualified/read-only through the new state DTO. Any necessary tightening of those paths stays inside the assigned repository; no prototype score conversion is authorised.

Use current persisted aggregate comparison during reads and commands to detect untracked changes. A stored revision/hash that disagrees with current trusted content fails closed for completion/reveal; it never fabricates a new completion or unlocks setup. All state columns validate their types and canonical representation. Writes reconcile a legitimate changed roster/content under the exclusive command boundary; corrupt state must throw rather than silently bless altered evidence.

## Legacy recovery and explicit Save boundary

The current Legacy screen sends edit autosave and partial explicit Save through the same `saveLegacyResponse({response, complete:false})` call. The repository cannot infer intent from `complete`. PM expanded scope in task checkpoint `a123032` to permit narrowly bounded nonvisual save plumbing in `LegacyCuppingScreen.js` and `legacySaveQueue.js`; JSX, styles, controls, text, dialogs and navigation remain unchanged.

Pass explicit intent (`recovery` or `save`) through the existing queue; default public repository saves remain explicit for compatibility. Capture/rebind session/sample identity per queued command; changing screen context cannot redirect queued work. Legacy read DTO returns `savedFingerprint = sha256(canonicalize({context, source}))`, with context containing session/sample IDs, pin/mode/count and actor, and source containing the committed semantic row above. A null source has an explicit fingerprint, not an omitted guard. Each explicit/recovery command supplies that expected fingerprint; transaction re-reads and compares before writing. Queue closures advance their expected fingerprint only from successful explicit Save acknowledgement; recovery acknowledgements do not advance it. Public calls omitting it capture a fingerprint before the transaction and recheck inside, preserving existing API compatibility without permitting asynchronous lost updates.

Recovery writes only `local_legacy_recovery_drafts`, checks actor/context/base committed fingerprint, and does not bind a new committed stream, overwrite `legacy_responses`, project descriptors, increment saved revision, start or invalidate completion. Opening returns the matching recoverable draft separately from committed response/result. The existing screen loads it with pending-edits state and hides the provisional displayed result, while preserving committed `savedCompleteRef` so recovered typing cannot repeat completion balloons. Explicit Save validates and commits submitted content, then removes its recovery row atomically. A stale recovery draft cannot overwrite a newer committed response.

An actor/context-guarded data-layer discard operation clears only the matching recovery draft and preserves committed state. The current Legacy header directly calls `onBackPress` and has no Leave/Stay/discard callback; this known missing warning is a later UI-stage gap, not a claim that discard is wired here. Ordinary exit preserves crash recovery until an explicit future discard or successful Save. No new dialog, button, navigation design, layout or user text is authorised in this slice.

## Completion, coverage and trusted presentation

Current completion token binds actor/session, trusted form context, aggregate semantic revision/hash and exact local roster. Actor change, saved mutation, membership change or pin/context change invalidates a previously captured token. Validate it inside the completion transaction, including the idempotent acknowledgement path; the old actor/session-only token is insufficient.

Completion requires a nonempty remaining local roster and valid complete saved results owned by the current actor for every sample. Validate using existing form contract adapters, not stored `is_complete` alone. On failure return neutral missing-sample labels without reveal. On success atomically append completion/reveal evidence, latch ever-started/ever-completed, and return COMPLETE for that exact revision. Repeating completion of unchanged content is idempotent. Recompletion after a changed Save records a new event and timestamp without overwriting original evidence.

The DTO derives DRAFT/PENDING/IN PROGRESS/COMPLETE from saved setup status, durable history and current qualified completion. Preserve temporary creator DRAFT and its started history. Never-started empty creator remains DRAFT; saved assigned setup remains PENDING; first explicitly saved score/note becomes IN PROGRESS. A completed actor's actual saved change returns IN PROGRESS. Open/unsaved/discarded changes leave committed status unchanged.

Blind coffee metadata is available in preparation only to the stored creator before ever-started, and in tasting only for current qualified completion. Temporary DRAFT cannot restore preparation identity. Reopened tasting hides again. Open Cupping stays open. Unknown/corrupt actor, pin, provenance or completion fails closed. Ever-completed setup history remains locked even after saved edits reopen tasting. Do not change actual session-name visibility.

## Scanned local membership

Participant import adds only the observed sample; existing sample numbers are retained and advertised total does not create missing samples. An actual new sample atomically changes aggregate coverage, invalidates current completion and yields IN PROGRESS if previously started/completed. A rescan of an existing matching sample opens without a semantic membership revision, duplicate or reopen. Reject conflicting saved assignment identity/count/mode rather than mutate score meaning.

The aggregate representation supports empty coverage, which cannot qualify completion. Removing samples and all-state local deletion remain later scoped commands; this slice does not grant permission through a new primitive or UI.

### Participant sample management extension R1-069

19 October 2026. R1-069 extends the earlier foundation without changing its schema, immutable form definitions or score calculations. Active CVA3 and Legacy4 support participant imports containing only scanned samples; Legacy remains Open-only. Matching rescans are non-mutating, while a new member changes current coverage and invalidates completion/reveal. Assigned sample numbers are retained independently of dense local navigation indices. The resolver freezes the read, captures an internally consistent existing-context snapshot and imports the session/sample atomically; a known context changed by deletion/re-import or removal cannot be silently reused by its stale observed request. Callbacks before any local context was observed still require the separate future NFC journal/recovery design.

`getParticipantSampleRemovalContext` and `removeParticipantSample` are separate from creator setup deletion. The command permits an active supported participant-import copy with NULL stored creator, a stable valid actor and selected fresh/current-actor-owned stream. Historical/unsupported contexts, non-null creator copies, foreign/unattributed saved streams, other actors' aggregate snapshots, selected foreign recovery or corrupt child/mode context fail closed. Whole-local-session deletion remains its separate all-role action. A confirmation token binds current actor, session, selected sample/cup, form context, semantic revision/hash and recovery/child evidence; an intervening saved edit invalidates it.

Confirmed removal transactionally deletes only the selected sample, its FK dependants and matching non-FK old feedback; replaces the current actor's aggregate snapshot and recomputes progress without rewriting remaining results or prior completion events. Removing the last member explicitly latches workflow-start history so the retained empty session is IN PROGRESS after restart, but cannot complete/reveal without another scored member. This specific empty-roster transition does not fabricate a saved quality score or change the separate blank-Save policy. No physical cup, creator copy, network/upload consent or backend record changes. Session Details reloads the trusted projection after confirmation, retains existing scan/completion controls, and guards busy/stale/cancel callbacks. See the task for exact software evidence and pending phone checks.

## Validation and release boundary

### R1-130 participant selection / completed editing extension

For explicitly enrolled, supported two-character-code participant copies only,
this extension supersedes R1-069's sample-row deletion. An actual validated scan
may enroll a NULL-creator session with matching current pin, supported per-sample
mode/count, exact code/metadata, and durable physical observation for every
already-known sample. Each saved stream must be fresh or owned by the captured
actor; foreign/unattributed revisions, unknown children or damaged recovery fail
closed. No roster is inferred from advertised totals, scores or creator flags.
No creator provenance/setup-lock field is written. Numeric/missing-pin/unproven
copies are not silently converted, reset or granted completion/edit authority.

Enrollment adds actor/incarnation-bound sidecars only. Already-known proven
samples are retained active without rewriting responses, revisions, recovery,
history or raw session status. An exact qualified pre-update full-known core
completion remains qualified only with all known active and no intervening
removal generation/new completion evidence; raw COMPLETE alone is insufficient.
The existing response `sessionComplete` flag retains raw-closure meaning;
`access.canEditCompleted` is the separate qualified selection permission. Current
forms use that scoped permission for completed Save/Stay/Leave. No-op Save and
discard preserve completion; saved score or notes changes reopen/hide atomically.

New scans add only the observed sample; active rescan is idempotent. Removal
appends a canonical blank CVA revision (or clears current Legacy response),
clears only that target's notes/recovery, increments durable removal generation
and retains its known grey card/code. Reactivation starts blank; it never restores
history as current results. Completion uses at least one active sample and every
active required saved score, excludes grey, and reveals only active Blind data.
Historical participant completion vectors may be proper subsets after further
discovery; they never qualify the current larger/changed selection.

Current completion/context tokens bind actor/session, enrollment incarnation,
saved revision/hash, all-known code/removal generations and active scan vector.
Scan capture, Save/recovery/discard/removal/completion and final acknowledgements
recheck these identities; delete/reimport and blank semantic ABA cannot borrow an
earlier context. Whole-session deletion cascades sidecars. Existing creator
selection/completion evidence and full-roster aggregate representation remain
compatible. No upload consent, NFC write/payload or setup authority is added.
Latest accepted R1-111 current-rating rule is preserved: notes/defaults/defects
alone do not create current scored progress; saved notes changes after COMPLETE
still invalidate completion/reveal, and durable started/completed history stays.

### R1-133 verified physical DRAFT removal extension

This separate creator setup command never reuses tasting removal or grants
participant setup authority. Current stored creator, issuer incarnation, saved
supported DRAFT, unstarted/unlocked history, exact assignment proof and absence
of saved response/recovery children are rechecked transactionally. A current
strict physical tag family/state/settings is captured; original addition rows
do not retain historical family/settings, so no historical match is claimed.

The versioned journal stages before dispatch and persists `writing` immediately
before the guarded native call. Write success is not verification. Recovery is
read-first and never automatically writes: exact original state/settings and
assignment permit explicit frozen retry, valid cleared read permits verified
commit, other data stays unfinished. Smart frozen retry cannot rewind evolved
state. After separate verified read, a local commit failure is save-only retry.
Known same-UID contradictory/malformed observations revoke verified readiness
durably before an outside assessment/write workflow is rejected; wrong-UID
observations do not revoke the target. Outside scans never grant verification.

Commit removes the target only, updates actual count and aggregate revision,
retains immutable neighbouring metadata/codes/ordinals and spent issuance, and
keeps setup DRAFT. Retained retirement receipt/generation blocks stale Save,
old-add acknowledgement and retired-payload reuse; cleared re-add receives a
fresh code. Session/UID pending conflicts are checked in both directions.
Actor/issuer/snapshot/operation and UI epochs reject late callbacks; deletion
cascades local journal/receipts but cannot recall an already dispatched radio
write. Cleared cups are explicitly unassigned, never stale-UID tasting fallback.

Before runtime edits run all 38 retained scripts on baseline `b280544` with Node 22.13.0 and shared read-only dependencies; preserve exact logs. New checks exercise real in-memory/file SQLite adapters, transaction rollback and module reload, not mocks that only match SQL strings.

Migration fixtures cover fresh empty stores, old version-4 variants, earlier shapes, partially added columns/tables, repeated startup and injected failure/retry. Assert exact original JSON, pins, policies, IDs, timestamps, attribution and completion rows unchanged. Include completed 89.5 and unknown/foreign/corrupt/historical data without automatic claim or reveal.

State checks cover CVA and Legacy partial and note-only explicit saves, blank/default Save, completion/edit/recompletion/no-op, persisted restart, foreign actor and late actor change, stale completion/context/revision, failed response/projection/completion transactions, new scanned sample versus rescan, empty coverage, preparation privacy and post-completion setup lock. Legacy checks separately cover autosave while COMPLETE, crash recovery, stale draft and Leave/discard retaining committed completion.

Retain numerical/security/history checks; change only assertions that encode superseded permanent reveal or autosave-as-Save policy, with explicit disposition. Independent architecture/security/privacy/QA and separate UX/source review must examine final committed code. Exact-source isolated iOS export proves bundling only. No live Metro, phone checkout, data, native install or physical tags change in this task. Creator verified NFC operations, original-footer restoration, participant removal/deletion UI and uploads remain later stages.
