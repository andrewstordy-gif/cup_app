# Local session state foundation

18 October 2026. R1-061 technical design for independent review before runtime implementation. Product authority is [PRODUCT_SPEC section 6.8](PRODUCT_SPEC.md#68-agreed-mobile-screen-and-state-map-18-october-2026). This is an additive installation-local prototype evolution, not the fresh encrypted production schema or an upload implementation.

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

Each actor revision holds a canonical aggregate containing session ID, actor ID, immutable session form pin/mode, and sorted local sample entries. Each entry includes sample ID, cup UUID, assigned number, form/mode/count, provenance actor or explicit unknown marker, and canonical committed response content/finality. Source row IDs, transport timestamps and CVA append counters are not semantic changes. Persisted result/policy identities remain validated by existing form adapters and are included where needed to prevent mismatched results qualifying. Coffee identity text is excluded from fingerprints exposed to presentation; raw aggregate stays in SQLite.

`content_hash` uses existing SHA-256 canonicalization. DTOs expose the revision and a non-authorising fingerprint/token, not raw aggregate content. A hash is not proof of service identity or protection from direct database tampering.

## Migration and legacy completion

Initialize only conservative history: ever-started follows existing durable latch, recorded score/note/evidence or started/global-complete state; ever-completed follows any existing explicit completion row or historical global-complete status. Neither grants current reveal, ownership or write access. Missing/malformed evidence cannot unlock preparation/setup. Preserve unknown authorship.

Do not backfill current actor revision completion from unversioned historical evidence. Preserve that evidence and fail closed for new reveal. Existing explicit legacy-adoption recovery stays explicit and source-token guarded. A valid current stream may be explicitly completed again only after current ownership, pin and required saved-score validation; this records new evidence rather than rewriting old completion history. Historical global-complete/unsupported pins remain read-only.

Migration must be idempotent for fresh, older and partial schemas. Enclose prerequisite schema evolution and foundation initialization in one exclusive transaction; replace inherited destructive `DROP COLUMN` steps with additive compatibility handling so earlier mode/colour evidence remains intact. Remove old unconditional per-start status/latch repairs after successful initialization. Repair missing columns by inspection, not duplicate ALTER assumptions. Set the durable migration marker only at the end, validate expected columns/constraints, then expose the database. Concurrent initialization shares one promise. On failure rollback, clear the failed promise for retry and reject all editing/read cutover; never fall back to partially migrated data or an old binary.

Migration does not read or modify AsyncStorage. Commands obtain and recheck its current profile UUID before commit. Tests snapshot original rows and raw text before/after, including old 89.5, not only numerical equality.

## Explicit Save and semantic revisions

Within one exclusive transaction, validate current actor, session/sample identity, trusted form pin/count/mode, existing provenance and optimistic expected response revision. Freeze caller inputs before awaiting. Known foreign/unattributed data cannot be overwritten; adoption remains a distinct explicitly confirmed command.

Compute committed semantic content before and after Save. A true change advances that actor's aggregate saved revision exactly once, atomically with response persistence, descriptor projection and progress. It invalidates current completion by leaving old completion events attached only to their former revision. Do not delete history. Set durable ever-started only when an explicitly saved score or note exists; saving an empty/default-only response does not start tasting. Clearing a previously saved response never clears started history. Return IN PROGRESS after changed saved results when already started/ever-completed. No-op Save does not advance the aggregate, reopen, hide or change current completion time; retain existing response-adapter compatibility as necessary without using an append counter as semantic identity.

New current completion permits editing its owned streams even when the presentation status is COMPLETE; an old global-complete row without qualified local evidence does not. Keep response `sessionComplete` reserved for historical global closure/read-only behaviour: both existing form consumers use it to disable editing. Never populate that flag from local completion. Save acknowledgements return refreshed identity/access/tasting so shallow consumer merges cannot retain revealed metadata after a changed Save. Consumers must receive trusted current-state DTOs, not raw status booleans.

Canonical CVA and versioned Legacy are the active edited response boundaries. Earlier generic feedback/defect/flavour write paths retain their historical pin guards; they must not certify new current completion or bypass provenance. Historical unsupported pins remain unqualified/read-only through the new state DTO. Any necessary tightening of those paths stays inside the assigned repository; no prototype score conversion is authorised.

Use current persisted aggregate comparison during reads and commands to detect untracked changes. A stored revision/hash that disagrees with current trusted content fails closed for completion/reveal; it never fabricates a new completion or unlocks setup. All state columns validate their types and canonical representation. Writes reconcile a legitimate changed roster/content under the exclusive command boundary; corrupt state must throw rather than silently bless altered evidence.

## Legacy recovery and explicit Save boundary

The current Legacy screen sends edit autosave and partial explicit Save through the same `saveLegacyResponse({response, complete:false})` call. The repository cannot infer intent from `complete`. PM expanded scope in task checkpoint `a123032` to permit narrowly bounded nonvisual save plumbing in `LegacyCuppingScreen.js` and `legacySaveQueue.js`; JSX, styles, controls, text, dialogs and navigation remain unchanged.

Pass explicit intent (`recovery` or `save`) through the existing queue; default public repository saves remain explicit for compatibility. Capture/rebind session/sample identity per queued command and include the expected committed fingerprint/revision; changing screen context cannot redirect queued work. Recovery writes only `local_legacy_recovery_drafts`, checks actor/context/base committed fingerprint, and does not bind a new committed stream, overwrite `legacy_responses`, project descriptors, increment saved revision, start or invalidate completion. Opening may return the matching recoverable draft separately from committed response/result; the existing screen loads that draft with pending-edits state. Explicit Save validates and commits the submitted response, then removes its recovery row atomically. A stale recovery draft cannot overwrite a newer committed response.

Leave/discard must clear only the matching actor/context recovery draft, preserve committed state, and retain the existing Leave/Stay mechanism. No new dialog, button, navigation design or layout is authorised. If the existing consumer cannot express discard safely within coordinated scope, stop and report that boundary rather than treat autosave as explicit Save.

## Completion, coverage and trusted presentation

Current completion token binds actor/session, trusted form context, aggregate semantic revision/hash and exact local roster. Actor change, saved mutation, membership change or pin/context change invalidates a previously captured token. Validate it inside the completion transaction, including the idempotent acknowledgement path; the old actor/session-only token is insufficient.

Completion requires a nonempty remaining local roster and valid complete saved results owned by the current actor for every sample. Validate using existing form contract adapters, not stored `is_complete` alone. On failure return neutral missing-sample labels without reveal. On success atomically append completion/reveal evidence, latch ever-started/ever-completed, and return COMPLETE for that exact revision. Repeating completion of unchanged content is idempotent. Recompletion after a changed Save records a new event and timestamp without overwriting original evidence.

The DTO derives DRAFT/PENDING/IN PROGRESS/COMPLETE from saved setup status, durable history and current qualified completion. Preserve temporary creator DRAFT and its started history. Never-started empty creator remains DRAFT; saved assigned setup remains PENDING; first explicitly saved score/note becomes IN PROGRESS. A completed actor's actual saved change returns IN PROGRESS. Open/unsaved/discarded changes leave committed status unchanged.

Blind coffee metadata is available in preparation only to the stored creator before ever-started, and in tasting only for current qualified completion. Temporary DRAFT cannot restore preparation identity. Reopened tasting hides again. Open Cupping stays open. Unknown/corrupt actor, pin, provenance or completion fails closed. Ever-completed setup history remains locked even after saved edits reopen tasting. Do not change actual session-name visibility.

## Scanned local membership

Participant import adds only the observed sample; existing sample numbers are retained and advertised total does not create missing samples. An actual new sample atomically changes aggregate coverage, invalidates current completion and yields IN PROGRESS if previously started/completed. A rescan of an existing matching sample opens without a semantic membership revision, duplicate or reopen. Reject conflicting saved assignment identity/count/mode rather than mutate score meaning.

The aggregate representation supports empty coverage, which cannot qualify completion. Removing samples and all-state local deletion remain later scoped commands; this slice does not grant permission through a new primitive or UI.

## Validation and release boundary

Before runtime edits run all 38 retained scripts on baseline `b280544` with Node 22.13.0 and shared read-only dependencies; preserve exact logs. New checks exercise real in-memory/file SQLite adapters, transaction rollback and module reload, not mocks that only match SQL strings.

Migration fixtures cover fresh empty stores, old version-4 variants, earlier shapes, partially added columns/tables, repeated startup and injected failure/retry. Assert exact original JSON, pins, policies, IDs, timestamps, attribution and completion rows unchanged. Include completed 89.5 and unknown/foreign/corrupt/historical data without automatic claim or reveal.

State checks cover CVA and Legacy partial and note-only explicit saves, blank/default Save, completion/edit/recompletion/no-op, persisted restart, foreign actor and late actor change, stale completion/context/revision, failed response/projection/completion transactions, new scanned sample versus rescan, empty coverage, preparation privacy and post-completion setup lock. Legacy checks separately cover autosave while COMPLETE, crash recovery, stale draft and Leave/discard retaining committed completion.

Retain numerical/security/history checks; change only assertions that encode superseded permanent reveal or autosave-as-Save policy, with explicit disposition. Independent architecture/security/privacy/QA and separate UX/source review must examine final committed code. Exact-source isolated iOS export proves bundling only. No live Metro, phone checkout, data, native install or physical tags change in this task. Creator verified NFC operations, original-footer restoration, participant removal/deletion UI and uploads remain later stages.
