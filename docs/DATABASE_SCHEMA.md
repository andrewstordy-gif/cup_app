# CUP app database

Local SQLite, via `expo-sqlite`. Schema lives entirely in
`src/data/localDatabase.js`; all reads/writes go through
`src/data/sessionRepository.js`. Five tables, organised around one root
entity (`sessions`) and one child entity (`samples`), with three further
tables hanging off each sample.

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
| `coffee_name_origin` | TEXT | |
| `process` | TEXT | Numeric key into `PROCESS_OPTIONS`. |
| `position_index` | INTEGER | Display/sort order within the session. |
| `created_at` / `updated_at` | TEXT | |

**Not stored here:** scores, defects, and flavour notes — those live in
the three child tables below, not on the sample row itself. There's also
no `verification_status` column — verification state is in-memory only
(`sample.verificationStatus`), not persisted. There's also no sample
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

The cup's own hardware telemetry — battery level, firmware version,
live temperature, brew timer, smart-cup settings (trigger temp, brew time,
LED brightness, etc.) — is **never persisted**. It's read live from the
physical cup's NDEF2/NDEF3 records each time (`Cup Settings`, `Home`,
`CuppingScreen`) and only ever held in transient React state. The cup
itself is the source of truth for that data, not this database.
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
