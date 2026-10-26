# CUP app database

The integrated installation-local store is `cup_sessions_v1.db`, via
`expo-sqlite`; `sessionRepository.js` is its only application consumer.
`localDatabase.js` initializes the reviewed DDL and
`integratedSessionSchema.js` validates the complete schema. The base entities
below are supplemented by the form, issuer, recovery and selection tables in
the appendices and foundation contract; this is not the encrypted production
schema required for a future Release 1 release.

R1-137 starts a fresh library. Neither `cup_user_test.db` nor
`cup_r1_103_sample_codes_test.db` is opened, copied, repaired or deleted. Existing
main profile `cup_app:user_profile` is retained; the experiment profile and
unrelated storage/files are untouched. Only a truly empty version0 store may
initialize. R1-147's static token-preserving SHA-256 manifest binds all 46 named
schema objects, including constraints/indexes/issuer/journals/receipts. Current
marker3, foundation marker1 and SQLite user_version7 must match before reads.
Only the exact reviewed marker1/user_version5 or marker2/user_version6 integrated schemas may
upgrade atomically; this is not an old-store import or schema repair.
Missing/extra/weakened schema is rejected, never repaired or reset. Fresh complete
schema validation and the final marker insert share one exclusive transaction.

### R1-147 direct purpose / v3

`local_pending_direct_reassignments` and `local_direct_reassignment_receipts`
are separate from legacy clear evidence. Pending consented/write_check/
write_verified content binds original context, current drawer fields, exact new
assignment bytes, issued attempt/code, prior hazardous attempts and separate
verification. Every change has a captured monotonic revision. Direct receipts
have no FK, retain only old composite/hashes (no coffee details), new member/code/
attempt proof and exact post-commit setup hash/count for acknowledgment.

Validated legacy-prefix/direct-generation causal vectors cover BOTH purposes;
legacy receipt generations/JSON remain unchanged. New member, standard outcome,
old-binding receipt and pending deletion commit atomically. Exact v1→v2→v3 or
v2→v3 migration shares one outer exclusive transaction and preserves every legacy
business, pending-operation and receipt row and the profile; schema markers and
user_version intentionally change. Target hash independently reproduced:
`3d46cbe6f32dac3b83ad944856cf76643b7c89fe22f6aed6b9f0538ea80222fe`.
V1/v2 binaries reject v3; no downgrade, reset, repair or old-store import.

### R1-144 reassignment evidence / recognized upgrade

`local_pending_cup_reassignments` holds one unique destination and hardware UID,
actor and issuer incarnation, phase `staged` / `clear_check` / `clear_verified`,
and canonical hashed operation content. Content binds exact original clear bytes,
setup/removal/binding generations, consent and four drawer fields. Every update
advances a durable JSON revision. Commands require the captured revision;
beforeWrite revalidates without incrementing it. Observers use captured phase/hash
CAS, rejecting stale reads even with identical bytes and timestamps.

`local_cup_reassignment_receipts` retains minimal immutable old-binding retirement:
operation, actor, destination/incarnation, UID, contiguous per-UID generation, old
session/code and metadata/binding hashes, clear bytes/state/settings, verification
hash/time and verified revision. It intentionally has no session FK: deletion must
not revive old assignments. No previous coffee identity/results/whole metadata is
retained in receipts. Pending evidence cascades with its destination only.

Upgrade validates the independently retained exact v1 manifest before DDL, adds
two tables, replaces only the schema-marker table, sets version6, validates the
target, inserts marker2 last and validates again, in one exclusive transaction.
All prior data rows remain unchanged; failure rolls back schema/data/version.
Independently reproduced target DDL hash:
`9f2b3dc8a68235f571d4ca9f3a0ab8f3ce34d8255659748854fb7008054ef07f`.
V2 reopens without schema mutation; old v1 code rejects v2 rather than downgrade.

## `sessions`

One row per cupping session.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (PK) | Same value as `session_uuid` — generated client-side, doubles as the DB primary key. |
| `session_uuid` | TEXT (unique) | |
| `session_display_id` | TEXT | Human-readable ID shown in the UI (e.g. `SESSION-A1B2C3D4`). |
| `session_name` | TEXT | User-entered, or auto-set to the coffee name for Quick Cupping sessions. |
| `session_type` | TEXT | Numeric key into `SESSION_TYPE_OPTIONS` (Sourcing Decision, Quality Control, ..., Quick Cupping). |
| `samples_in_session` | INTEGER | Legacy "expected sample count" field — UI for editing it was removed; real sample count is now read from `samples` directly. |
| `status` | TEXT | `new` (Draft) → `pending` → `in_progress` → `complete`. The first three are recomputed automatically from real sample/feedback data on every relevant write (`recomputeSessionProgressStatus`); `complete` is the one state that's never auto-derived — only the explicit "COMPLETE SESSION" button sets it. |
| `session_date` | TEXT | |
| `created_at` / `updated_at` | TEXT | ISO timestamps. |

**Not stored here:** cupping mode (blind/open) — moved to `samples` (see
below), since it turned out to be a per-sample choice, not session-wide.

## `samples`

One row per physical cup added to a session. Cascades on session delete.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (PK) | |
| `session_id` | TEXT (FK → sessions) | |
| `cup_uuid` | TEXT | The physical cup's NFC tag ID. `UNIQUE(session_id, cup_uuid)` — the same cup can't be added twice to one session. |
| `cup_number` | INTEGER | Number of physical cups poured for this sample (1–8, default 5). |
| `cupping_form` | INTEGER | Numeric key into `CUPPING_FORM_OPTIONS` (currently only "SCA CVA"; extensible). |
| `cupping_mode` | TEXT | `blind` or `open` — per-sample, not per-session. |
| `sample_number` | INTEGER | Position within the session (1st, 2nd, ... sample). |
| `sample_code` | TEXT | Required two-character session-scoped code; never an ordinal or hardware UID. |
| `sample_metadata_json` | TEXT | Exact validated immutable assignment metadata; neighbour totals/ordinals are not rewritten on removal. |
| `coffee_name_origin` | TEXT | |
| `process` | TEXT | Numeric key into `PROCESS_OPTIONS`. |
| `position_index` | INTEGER | Display/sort order within the session. |
| `created_at` / `updated_at` | TEXT | |

**Not stored here:** scores, defects, and flavour notes — those live in
the three child tables below, not on the sample row itself. There's also
no `verification_status` column — physical assignment/check state instead uses
the durable pending-write journal and verified commit evidence. There's no sample
colour column anymore — `sample_colour` was removed (it was unused).

## `sample_feedback_entries`

One row **per scored field** per sample (e.g. a separate row for
Fragrance, a separate row for Aroma, etc. — not one row per sample).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (PK) | |
| `session_id` / `sample_id` | TEXT (FK) | |
| `field_name` | TEXT | One of the 8 `CUPPING_SCORE_FIELDS` (Fragrance, Aroma, Flavour, Aftertaste, Acidity, Sweetness, Mouthfeel, Overall). |
| `is_final` | INTEGER (bool) | Distinguishes a draft/in-progress entry from a finished one. |
| `score` | INTEGER | Nullable. |
| `comments` | TEXT | Free-text notes for that field. |
| `temp_snapshot` / `time_snapshot` | TEXT | Cup temperature/elapsed time at the moment this field was scored. |
| `created_at` / `updated_at` | TEXT | |

A sample's overall completeness, per-field score breakdown, and final
score are all derived by reading this table (`getSessionSampleFinalStatus`)
— there's no separate "is this sample complete" flag stored anywhere.

## `sample_defect_entries`

One row of defect flags per sample.

| Column | Type | Notes |
|---|---|---|
| `id`, `session_id`, `sample_id`, `is_final` | — | Same pattern as feedback entries. |
| `moldy`, `phenolic`, `potato`, `other_bean`, `underdeveloped`, `baked`, `uneven_roast`, `overdeveloped` | INTEGER (bool) | The 8 named defect checkboxes (first 4 = bean defects, last 4 = roast defects). |
| `non_uniform_cups` / `defective_cups` | INTEGER | Counts used in the final-score deduction formula. |
| `non_uniform_mask` / `defective_mask` | TEXT | JSON-encoded list of which physical cup slots (1..N) are non-uniform/defective. |
| `defect_type_masks` | TEXT | JSON-encoded per-defect-type cup-slot assignment. |
| `number_of_cups` | INTEGER | How many physical cups this defect entry covers. |
| `temp_snapshot` / `time_snapshot` | TEXT | |

## `sample_flavour_observations`

One row per flavour keyword tagged while scoring (e.g. "blueberry",
"citrus" — the pills shown under the notes boxes).

| Column | Type | Notes |
|---|---|---|
| `id`, `session_id`, `sample_id` | — | |
| `keyword` | TEXT | The tagged flavour word. |
| `label` | TEXT | Display label (may differ slightly from the raw keyword). |
| `colour` | TEXT | Hex colour for the pill. |
| `temp_c` / `elapsed_seconds` | INTEGER | Cup conditions when this flavour was tagged. |
| `source_field` | TEXT | Which scoring field(s) this observation belongs to (drives whether it shows under "Fragrance/Aroma Notes" or "Flavour Notes"). |
| `created_at` | TEXT | |

## Relationships

```
sessions (1) ──< samples (many)
samples  (1) ──< sample_feedback_entries (many, one per scored field)
samples  (1) ──< sample_defect_entries (many, typically one live row)
samples  (1) ──< sample_flavour_observations (many, one per tagged keyword)
```

All three sample-child tables cascade-delete with their parent sample;
`samples` cascades with its parent session.

## What's deliberately *not* in this database

There is no general cache of cup telemetry — battery level, firmware version,
live temperature or brew timer. It's read live from the
physical cup's NDEF2/NDEF3 records each time (`Cup Settings`, `Home`,
`CuppingScreen`) and only ever held in transient React state. The cup
itself is the source of truth. Purpose-bound durable pending operations retain
the exact required state/settings needed for guarded write/recovery, never a
general telemetry cache or permission to replay stale live values.
# Installation local state foundation additions

R1-061 adds version-5 prototype state tables without rewriting saved scores,
response/result JSON, pins, profile IDs or original completion evidence. This
does not initialize the separately specified encrypted production database.

- `local_session_state_schema`: transactional schema marker, version 1.
- `local_session_foundations`: per-session durable ever-started/ever-completed
  latches; neither is current reveal authority.
- `local_tasting_revisions`: per-session/profile semantic saved revision,
  canonical roster/response context and hash. CVA append counters and timestamps
  do not make an unchanged Save a new semantic revision.
- `local_tasting_completion_events`: append-only completion/reveal evidence for
  the exact current revision and nonempty local sample coverage. Earlier
  `local_tasting_completions` timestamps remain untouched.
- `local_legacy_recovery_drafts`: actor/context/base-fingerprint guarded unsaved
  Legacy recovery, separate from the committed Legacy response.

The [foundation contract](LOCAL_SESSION_STATE_FOUNDATION.md) specifies the
schema, transaction boundaries, historical compatibility and later-stage gaps.

## R1-130 bounded participant selection additions

Additive tables for proven string-code participant imports only; no creator
columns, setup locks, existing responses or aggregate hashes are migrated.

- `local_participant_tasting_enrollments`: session primary key/cascading FK,
  non-null local profile, random UUID incarnation, SHA-256 binding snapshot and
  ISO enrollment time. One installation-local actor stream, not service auth.
- `local_participant_sample_activations`: session/profile/sample composite key,
  cascading session/sample FKs, immutable code, binding snapshot and scan time.
- `local_participant_sample_removals`: same composite key/FKs/code/binding,
  positive durable removal generation and ISO removal time; remains after
  deactivation/reactivation to prevent stale-operation ABA.
- `local_participant_tasting_completion_events`: autoincrement ID, cascading
  session FK, profile, schema version 1, canonical snapshot JSON/SHA-256 and ISO
  completion time; unique session/profile/snapshot hash. Append-only historical
  evidence, qualified against current saved content and exact selection.

All non-key fields above are NOT NULL. Runtime validates canonical pin/mode/
count/code, actor, UUID/time/hash bindings, stream ownership, generation and
cross-row consistency. Sessions deletion cascades these sidecars. Participant
removal retains the sample row/code and clears only target current results,
notes and recovery; creator sidecars remain unchanged. See the foundation's
R1-130 extension for enrollment and compatibility limits.

## R1-133 verified DRAFT physical removal

Two additive, versioned sidecars apply only to saved never-started/unlocked
creator code-profile DRAFTs. `local_pending_draft_removals` has a cascading
session primary key, unique operation and hardware UID, actor, format version1,
phase (`staged`, `writing`, `written`, `verified`), canonical content JSON and
SHA-256. Content binds issuer incarnation, monotonic removal generation, full
saved setup snapshot, target row/code/issued-add operation, strict original tag
family/metadata/state/settings and exact frozen complete clear bytes/hash.
Verification stores the separate decoded-read hash and canonical ISO time.
Smart state/settings are captured solely for this durable physical operation;
they are not a general telemetry cache. No live telemetry is journalled.

`local_draft_removal_receipts` retains session/operation/actor/incarnation,
positive generation, retired row/code/original-add operation and canonical
receipt/hash. Its only FK is the cascading session FK: deleting the target
sample must not delete its retirement receipt. Session/code is the primary key;
operation is unique. Runtime validates declared schema, exact content shapes,
types/hashes and ledger/provenance relationships, not hashes alone.

Verified commit deletes only the target row, updates actual roster count and
actor aggregate revision atomically, and retains DRAFT, pin/form-lock policy,
spent code ledger and original outcomes. Subsequent legitimate setup saves
maintain an existing aggregate revision. A validated receipt permits the empty
creator DRAFT to remain editable without resetting its form pin/lock/history.
Neither stale full-roster Save nor a late original addition acknowledgement can
restore a retired assignment. Whole-session deletion cascades both sidecars.
New addition outcome JSON also carries private issuer-incarnation/removal-
generation replay evidence; old rows are not backfilled. Public acknowledgement
DTO remains sessionId/status/savedSampleCount. Changed roster/generation or a
retired assignment rejects replay rather than acknowledging an obsolete add.
