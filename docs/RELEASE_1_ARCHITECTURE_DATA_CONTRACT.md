# Cup App Release 1 Architecture and Data Contract

**Status:** Proposed canonical technical contract for Release 1 implementation

**Version:** 1.0

**Date:** 2 October 2026

**Scope:** Domain model, local-first persistence, synchronisation, blind-data isolation, and prototype migration

## 1. Authority and purpose

This document is normative for the Release 1 architecture and data boundaries described below. It is subordinate to [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) and must be read with [`NDEF_PROTOCOL.md`](NDEF_PROTOCOL.md). If these documents disagree, the Product Specification wins; the NDEF protocol controls physical tag encoding within its domain.

The current SQLite schema, source code, tests, [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md), and `README.md` are implementation evidence only. They do not override this contract.

This contract deliberately does not select a database, cloud provider, authentication vendor, billing provider, or hosting platform. It defines observable behavior and boundaries that any implementation must satisfy.

Normative words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** have their usual requirements meaning.

## 2. Release boundary and unresolved policy

Release 1 is a local-first NFC-tag product. It MUST work without Smart Cup telemetry, a brew timer, sensory note timing, sensor services, or AI-generated descriptors. Future fields for those capabilities may be additive, but Release 1 code MUST NOT fabricate sensor or timing data.

The following remain parameters or unresolved decisions, not values chosen by this contract:

- account-free participant access expiry after session completion;
- participant reopening duration;
- host session-reopen grace period;
- retention and deletion periods;
- paid-plan, trial, and pilot-entitlement details;
- PDF delivery method and stable export schema;
- supported launch tags and tag write-protection policy;
- exact configurable fields for Quick QC and Purchasing/selection;
- descriptor-vocabulary policy.

### 2.1 Blocking NDEF form decision

FR-028B remains unresolved and blocks a Release 1 pilot. `NDEF4.f=1` means SCA CVA. No production values are defined for legacy SCA, Quick QC, or Purchasing/selection. This contract names the four domain forms but does not map the other three to NDEF values. Implementations MUST reject or visibly block a production tag write when the selected session form has no approved protocol mapping. They MUST NOT invent, persist, or transmit a production enum value.

## 3. Architectural boundaries and ownership

Release 1 has four logical boundaries. They may be deployed together or separately, but MUST communicate through explicit contracts.

| Boundary | Responsibilities | Data authority |
| --- | --- | --- |
| Installed mobile app | Host setup, offline session package, cup resolution, participant identity, local capture, completion, consent, durable outbox | Authoritative working copy for unshared participant results and offline host changes |
| NFC adapter | Read, classify, encode, write, and verify canonical NDEF; expose no product-policy defaults | Physical tag payload only; never response data |
| Ingestion/service boundary | Validate session-scoped access, accept idempotent share snapshots, isolate tenants and blind data, return durable acknowledgements | Authoritative accepted copy of explicitly shared results |
| Host portal | Display only accepted shared results, aggregates, history, search, exclusion state, and exports | Read model derived from accepted service-side records |

Provider SDK objects MUST NOT cross the domain boundary. Domain services depend on the provider-neutral ports in section 12.

### 3.1 Ownership rules

- An unshared participant response belongs to the participant's local app. The host service and portal MUST NOT infer, enumerate, or represent that private response.
- Pressing **Share results** creates consent for one immutable share snapshot. It does not grant continuous synchronisation of later edits.
- Each later share of changed results requires a new explicit participant action and a new share operation.
- A service acknowledgement makes the accepted snapshot authoritative for portal reporting. The local source remains available for recovery and audit until retention policy permits deletion.
- Exclusion from aggregates never deletes the accepted raw response.
- An NFC tag owns only the protocol payload. It MUST NOT contain participant identity, response data, notes, scores, defects, or share state.

## 4. Identifiers and clocks

### 4.1 Domain identifiers

Except for the protocol-constrained session reference, every new domain identifier MUST be generated locally as a cryptographically random 128-bit identifier and serialized as a lowercase UUID. Generation MUST work offline. A collision MUST fail closed and generate a new identifier; it MUST NOT overwrite an existing record.

The following identifiers are immutable:

- `organisation_id`
- `user_id`
- `participant_id`
- `session_id`
- `sample_id`
- `cup_id`
- `cup_assignment_id`
- `response_id`
- `event_id`
- `share_operation_id`
- `share_attempt_id`
- `audit_event_id`

`public_session_ref` is distinct from `session_id`. It is the NDEF/session-join reference and MUST obey the current NDEF protocol: 14 lowercase alphanumeric characters for newly generated sessions. It MUST be generated with a cryptographically secure random source. `Math.random` or a timestamp is not acceptable. `NO-SESSION` is a protocol sentinel and MUST NOT be used as a domain `session_id`.

Physical NFC identifiers are normalized identifiers, not credentials. The system MUST NOT use a raw tag identifier as an authentication secret.

### 4.2 Idempotency identifiers

- Each tasting mutation has one `event_id`, generated before the durable local transaction.
- Each explicit press of **Share results** has one `share_operation_id`, generated before enqueue.
- Network retries for the same consented snapshot reuse that `share_operation_id`.
- Each transport attempt has a distinct `share_attempt_id` and references its `share_operation_id`.
- Server-side uniqueness MUST include tenant/session scope and `share_operation_id`. Event ingestion MUST also enforce uniqueness by `event_id` within the response/session scope.
- Receiving the same identifier and same canonical payload is a successful duplicate. Receiving the same identifier with different content is a conflict and MUST be quarantined rather than overwritten.

### 4.3 Time and ordering

All records carry `created_at` and, where mutable, `updated_at` in UTC ISO-8601 form. Device timestamps are evidence, not trusted global ordering. Each locally authored response stream MUST also carry a monotonically increasing `local_revision`. Synchronisation ordering uses revisions and identifiers, not wall-clock last-write-wins.

## 5. Canonical Release 1 entities

Fields listed as policy parameters may be null until the Product Owner approves a value. Unknown data MUST remain unknown rather than receiving a misleading default.

### 5.1 Organisation

Required fields:

- `organisation_id`, `name`, `timezone`, `default_units`
- `retention_policy_ref` (nullable pending policy)
- `created_at`, `updated_at`

The organisation is the tenant boundary for host-managed sessions, accepted shared results, exports, and audit events. Every service-side query MUST be constrained by `organisation_id` derived from authorised context, not a client-supplied filter alone.

### 5.2 Host/User

Required fields:

- `user_id`, `display_name`, `authentication_subject`
- organisation memberships with `organisation_id` and role
- cached entitlement assertion with issuer, issued time, expiry/grace parameters, and last verification time

Authentication identity and membership are separate. Entitlement failure MUST NOT interrupt an active offline session or hide existing records. The commercial values remain outside this contract.

### 5.3 Account-Free Participant

Required fields:

- `participant_id`, `session_id`, `display_name`
- `local_device_scope_id`
- `access_grant_ref` (nullable until a grant is available)
- `privacy_notice_version`, `privacy_accepted_at`
- `completion_state`, `completed_at`
- `access_expires_at` (policy-derived and nullable while policy is unresolved)
- `created_at`, `updated_at`

A participant belongs to exactly one session. An access grant MUST be session-scoped and MUST NOT authorise another session or organisation. Local identity continuity MAY survive restart on the same device. It MUST NOT be silently promoted to a host account or cross-session identity.

### 5.4 Session

Required fields:

- `session_id`, `public_session_ref`, `organisation_id`, `host_user_id`
- `name`, `session_type`
- `form_key`, `form_version`
- `identity_mode`: `blind` or `open`
- `status`: `draft`, `prepared`, `live`, `completed`, `reopened`, or `archived`
- `started_at`, `completed_at`, `reopened_at`, `archived_at` as applicable
- `reopen_until` (nullable pending policy)
- `contract_version`, `created_at`, `updated_at`

`form_key`, `form_version`, and `identity_mode` are session-level values. They MUST NOT vary by sample or participant. Once any response exists, `form_key` and `form_version` are immutable. A participant does not select or alter them.

Permitted lifecycle transitions are:

```text
draft -> prepared -> live -> completed -> reopened -> completed -> archived
  |         |         |          |                         |
  +---------+---------+----------+-------------------------+-> archived
```

Starting, completing, reopening, and archiving are explicit host actions. Reopening MUST be audit logged and allowed only by the unresolved grace-period policy. A completion action requires confirmation. No participant result automatically completes or closes the session.

### 5.5 Sample

Required fields:

- `sample_id`, `session_id`, `position`
- at least one of `display_name` or `sample_code`
- `blind_code`
- optional Release 1 metadata: `external_reference`, `supplier`, `origin`, `process`, `lot`, `roast_reference`, `sample_stage`, `notes`
- `created_at`, `updated_at`

A Sample is the coffee being evaluated. It is not a cup and MUST NOT store a physical NFC identifier. `blind_code` is neutral participant-facing identity; protected metadata remains in host-authorised storage and projections.

### 5.6 Cup

Required fields:

- `cup_id`, `organisation_id`
- `nfc_identifier`, `device_type`, `capabilities`
- optional `internal_label`, `model`, `hardware_version`, `firmware_version`
- `status`, `tag_write_status`, `last_written_at`, `last_verified_at`
- `created_at`, `updated_at`

A Cup is reusable across sessions. `nfc_identifier` is immutable unless an audited replacement operation explicitly creates or links a replacement cup. Release 1 requires an `ntag` capability without sensor assumptions. Smart Cup capabilities are additive Release 2 data.

### 5.7 Cup Assignment

Required fields:

- `cup_assignment_id`, `session_id`, `sample_id`, `cup_id`
- `assigned_by_user_id`, `assigned_at`
- `active`, `ended_at`
- `tag_payload_version`, `tag_write_status`, `tag_verified_at`

One Sample may have many Cup Assignments. A Cup MUST have at most one active assignment in a session. The implementation MUST enforce a uniqueness invariant equivalent to `(session_id, cup_id) WHERE active = true` and MUST reject duplicates with a corrective error.

Reassignment creates or activates a new assignment and ends the prior assignment in one transaction. It then writes and verifies the complete protocol payload. A failed or interrupted write leaves the assignment visibly unverified/failed and MUST NOT report success.

### 5.8 Response

Required fields:

- `response_id`, `session_id`, `sample_id`, `cup_assignment_id`, `participant_id`
- immutable `form_key`, `form_version`
- `completion_state`: `draft` or `complete`
- `current_revision`, `last_shared_revision`
- `excluded_from_aggregate`, `exclusion_reason`, `excluded_by_user_id`, `excluded_at`
- `created_at`, `updated_at`, `completed_at`

A Response belongs to exactly one participant, Sample, and Cup Assignment context. There is at most one active logical response for that tuple. Exclusion is a host-side reporting decision after sharing; it preserves the raw accepted response and creates an Audit Event.

### 5.9 Tasting Event

Required fields:

- `event_id`, `response_id`, `session_id`, `participant_id`
- `local_revision`, `event_type`, `form_field_key`
- value payload appropriate to the versioned form
- raw editable note text where applicable
- `input_source`: `typed` or `voice` where applicable
- deterministic descriptor text/category/colour and correction state where applicable
- `created_at`, `supersedes_event_id` (nullable)

Events are append-only facts. Editing appends a new event that supersedes or revises prior state; it does not reuse an identifier. A local response projection MAY be updated transactionally for efficient rendering.

Release 1 event timestamps are persistence/audit metadata only and MUST NOT be presented as sensory elapsed time. Temperature, brew-start time, sensor provenance, and AI-identified descriptors are Release 2 additions.

### 5.10 Share Operation and Outbox Item

A Share Operation is the durable record of one explicit consent action. Required fields:

- `share_operation_id`, `session_id`, `participant_id`
- immutable `snapshot_revision` and canonical `snapshot_hash`
- `consent_recorded_at`, `privacy_notice_version`
- state: `queued`, `sharing`, `shared`, or `failed`
- `queued_at`, `last_attempt_at`, `acknowledged_at`
- `attempt_count`, `last_error_code`, `retry_after`

The outbox payload contains the minimum session-scoped envelope and the immutable response/event snapshot through `snapshot_revision`. It MUST be created in the same durable transaction that records consent and changes the visible state from `complete` to `queued`.

A Share Attempt records transport evidence:

- `share_attempt_id`, `share_operation_id`, `started_at`, `finished_at`
- outcome, retry classification, and service acknowledgement reference

Attempts may be pruned under an approved retention policy after the parent operation is durably acknowledged; the Share Operation and consent evidence remain.

### 5.11 Audit Event

Required fields:

- `audit_event_id`, `organisation_id`, `session_id`
- actor type and actor identifier
- action, target type, target identifier
- before/after metadata with protected fields minimized
- `created_at`

Audit events are append-only. Release 1 MUST audit cup reassignment, blind reveal, result exclusion/inclusion, session complete/reopen/archive, and identity-affecting changes. Audit payloads MUST obey the same blind and tenant-isolation rules as normal data.

## 6. Participant result and sharing state

The participant-visible result state is derived from response completion and the latest explicit Share Operation:

```text
private/local -> complete -> queued -> sharing -> shared
                            \           \
                             -> failed <-
```

- `private/local`: local draft data exists and is not complete.
- `complete`: the participant has completed locally; no share operation exists for the current revision.
- `queued`: explicit consent was recorded and the immutable snapshot is waiting for connectivity or retry time.
- `sharing`: a transport attempt for that snapshot is active.
- `shared`: the service durably acknowledged that exact operation and snapshot.
- `failed`: the last attempt failed; the immutable snapshot and consent remain queued for participant-visible retry handling.

No session completion, host action, connectivity change, background task, or timer may create initial share consent. Background processing MAY retry an already consented queued/failed operation. A participant MUST see the state and have a safe retry path.

If a participant edits after sharing, the accepted snapshot remains unchanged. The new local revision returns the current result to `complete` for sharing purposes and requires another press of **Share results**. The prior Share Operation remains `shared`.

## 7. Local persistence and acknowledgement

### 7.1 Transaction boundary

For every acknowledged participant mutation, the local store MUST atomically persist:

1. the immutable Tasting Event with its pre-generated `event_id` and `local_revision`;
2. the updated Response projection and revision;
3. any dependent deterministic descriptor projection; and
4. a local commit marker sufficient to detect an incomplete transaction after restart.

The UI MUST acknowledge success only after the durable transaction commits. Updating React state, memory, an asynchronous request queue, or an NFC payload is not acknowledgement.

Share consent follows the same rule: the immutable snapshot, hash, Share Operation, and queued outbox item commit atomically before `queued` is shown.

### 7.2 Recovery

On startup and resume, the app MUST:

- open and migrate the local store before accepting edits;
- roll back or recover incomplete transactions according to the store's atomicity guarantees;
- rebuild projections from immutable events or verify their revision/commit marker;
- retain queued, sharing, and failed Share Operations;
- convert an interrupted `sharing` transport state to retryable `queued` or `failed` without creating a new operation;
- never discard acknowledged observations because connectivity is absent.

Local persistence MUST survive app restart, device sleep, and the complete offline session. Storage errors MUST be shown before the app reports an observation saved.

## 8. Synchronisation and ingestion

### 8.1 Share envelope

An ingestion request MUST contain:

- contract/schema version;
- `organisation_id`, `session_id`, `public_session_ref`;
- participant and session-scoped access proof;
- `share_operation_id`, `snapshot_revision`, `snapshot_hash`;
- participant display data permitted by the privacy notice;
- complete responses and their immutable events through the snapshot revision;
- client-created times and app/build version for diagnostics.

The envelope MUST NOT include unrelated sessions, unshared later revisions, hidden host-only identity in blind mode, device secrets, or analytics data.

### 8.2 Service acceptance transaction

The service MUST atomically:

1. authenticate/validate the session-scoped grant and tenant/session relationship;
2. validate schema and form versions;
3. enforce blind-safe fields;
4. compare the idempotency identifier and canonical hash;
5. insert previously unseen responses/events and preserve raw records;
6. update portal read models only from accepted shared data;
7. record the service acknowledgement.

Only after this durable transaction commits may the service return success. The app marks `shared` only from that durable acknowledgement.

### 8.3 Retry and deduplication

- Transient network, timeout, and retryable service failures keep the same Share Operation and snapshot.
- Backoff is implementation-defined, bounded, and reset by a participant-requested retry.
- A duplicate request with the same operation ID and hash returns the original success acknowledgement.
- A duplicate event ID with identical canonical content is ignored as already accepted.
- A repeated operation or event ID with different content is a security/data-integrity conflict and MUST NOT overwrite either version.
- Permanent validation or authorisation errors become `failed` with a participant-readable recovery path; they are not retried indefinitely.

### 8.4 Conflict handling

The system MUST NOT use timestamp-only last-write-wins for responses, session identity, cup assignment, or blind reveal.

- Immutable shared snapshots never mutate in place.
- A new explicitly shared revision is stored as a later revision linked to the earlier accepted snapshot.
- Divergent response revisions from the same base are both preserved and flagged for authorised resolution.
- Concurrent Cup Assignments that violate uniqueness are rejected or quarantined; the app never guesses which sample is correct.
- Session form/version conflicts block ingestion because response meaning cannot be inferred safely.
- Blind/open state conflicts choose the more restrictive participant projection until an authorised, audited host decision resolves them.

## 9. Blind-data classification and projections

### 9.1 Data classes

- **Protected sample identity:** display name when identifying, origin, supplier, process, lot, roast reference, external reference, notes, and any value that can reveal the coffee.
- **Neutral participant identity:** `blind_code`, neutral session label, sample position, form metadata, and Cup Assignment reference.
- **Participant result data:** participant display name, responses, notes, descriptors, completion, consent, and share status.
- **Operational data:** non-secret identifiers, schema versions, state flags, error codes, and timestamps.

Classification is conservative: when a field may reveal sample identity, treat it as protected.

### 9.2 Projection rules

| Projection | Before reveal | After authorised reveal |
| --- | --- | --- |
| Host-authorised local/service view | Protected identity allowed | Protected identity allowed |
| Account-free participant UI/accessibility tree | Neutral code only | Identity allowed only after current reveal state is obtained through an authorised path |
| Participant offline cache/package | Neutral code and minimum tasting data only | Add revealed identity through a versioned authorised update; do not assume stale caches changed |
| Participant network response/share envelope | No protected identity | May include revealed identity only when authorised and needed |
| NFC NDEF4 | Neutral blind identifier in `n`; no protected identity elsewhere | Rewriting policy remains an explicit host action governed by NDEF write verification |
| QR/link/manual join package | No protected identity | May include revealed identity only through authorised package refresh |
| Logs, crash reports, analytics | No protected identity, free-text notes, credentials, or raw tag secrets | Same restriction after reveal |
| Portal | Host-authorised identity plus explicitly shared results | Same, with reveal audit state |

Blind protection MUST be enforced when selecting/serializing data, not by hiding already-delivered fields in UI. Page titles, URLs, notifications, screen-reader labels, cached previews, database views accessible to the participant role, and API error details are part of the projection boundary.

Reveal is an explicit, authorised, audited state transition. Offline participants may remain on the safe blind projection until they receive a valid reveal update; lack of connectivity MUST NOT cause the app to guess or expose identity.

## 10. Offline session package

The app MUST persist a versioned offline package before a prepared session can claim offline readiness. The package is the union of data obtained through authorised host setup and participant join paths; NFC alone need not carry every field.

Minimum content:

- package/contract version and creation/update time;
- `session_id` or locally resolvable mapping from `public_session_ref`;
- neutral session name, session status, form key/version, and identity mode;
- session-scoped participant access material or a durable pending-grant state that does not broaden access;
- privacy notice version;
- known ordered Samples using participant-safe fields (`sample_id`, `blind_code` or open display label, position); the package MAY grow as additional NFC cups are scanned, and MUST NOT imply that an NFC-only join already contains unscanned samples;
- active Cup Assignment resolution data for NFC, QR, and manual codes;
- form definition and validation rules needed for local capture;
- local participant identity and existing Response/Event state;
- explicit package freshness/version and integrity evidence;
- outbox and retry metadata for already consented shares.

The package MUST support session creation by a prepared host, NFC/QR/manual joining from available prepared data, cup resolution, form rendering, capture, editing, completion, and local review without a network request.

Resolution outcomes are exactly `assigned`, `unassigned`, `unknown`, or `unsupported`. An absent or ambiguous mapping MUST NOT fall back to the most recent sample. Manual selection records that manual identity resolution was used.

## 11. NFC boundary

All physical encoding follows `NDEF_PROTOCOL.md`.

- Standard NTAG stickers contain one Well-Known Text record with NDEF4 JSON.
- Smart Cups use the four-record protocol, but Smart Cup behavior is not required for Release 1 completion.
- NDEF contains session/sample resolution metadata only, never tasting or participant data.
- Blind sessions use a neutral identifier for NDEF4 `n`.
- Assignment is not successful until the intended full payload is written and verified.
- An interrupted or mismatched write produces a visible failed/unverified state.
- A later assignment replaces the earlier session/sample payload only after verification.
- Unsupported form mappings, including the unresolved FR-028B cases, block production writes rather than guessing.

NFC scan evidence may identify a Cup and Assignment, but possession of a raw hardware identifier alone is not authorisation. Session access is limited to the account-free capability intended by the Product Specification.

## 12. Provider-neutral ports

Interfaces may use different names in code, but MUST preserve these semantics.

### 12.1 LocalStore

```text
transact(mutations) -> committed revision
loadOfflinePackage(public_session_ref) -> package | not_found
appendTastingEvent(event, expected_response_revision) -> response projection
createShareOperation(snapshot, consent) -> queued operation
claimQueuedShare(now) -> operation | none
recordShareAttempt(operation_id, attempt)
acknowledgeShare(operation_id, snapshot_hash, service_ack)
recoverInterruptedWork()
```

`appendTastingEvent` and `createShareOperation` are atomic and durable. Revision mismatch returns a conflict; it never silently overwrites.

### 12.2 SessionAccess

```text
prepareHostSession(host_context, session)
joinWithLinkOrQr(join_artifact, display_name, privacy_acceptance)
joinWithNfc(ndef_metadata, display_name, privacy_acceptance)
validateSessionScope(grant, session_id)
refreshRevealProjection(grant, package_version)
```

The interface supports offline-prepared artifacts and makes expiry a policy input rather than a hard-coded duration.

### 12.3 CupResolver and NfcAdapter

```text
classify(read_result) -> tag classification
resolve(identifier, metadata, offline_package) -> assigned | unassigned | unknown | unsupported
encodeAssignment(assignment, participant_safe_sample, protocol_version) -> records
writeAndVerify(records) -> verified result | explicit failure
```

The domain passes participant-safe data to encoding. The adapter MUST NOT fetch protected identity or invent enum mappings.

### 12.4 ShareTransport and Ingestion

```text
sendShare(operation_id, immutable_envelope) -> durable acknowledgement | retryable error | permanent error
ingestShare(authorised_context, immutable_envelope) -> original/new durable acknowledgement
```

Provider timeouts never imply failure or success; retrying the same operation obtains the original result.

### 12.5 Projection and Audit

```text
projectForHost(authorised_context, aggregate)
projectForParticipant(session_access, reveal_state)
projectForNfc(session, participant_safe_sample)
recordAudit(actor, action, target, minimized_before_after)
```

Projection functions use allowlists. Serializing a broad entity and deleting fields afterward is not conformant for blind or tenant-isolated data.

## 13. Prototype migration contract

Migration from the current `cup_user_test.db` MUST be additive, restartable, and recoverable.

### 13.1 Required process

1. Record the source schema version and create a recoverable database backup before mutation.
2. Create new tables/columns alongside legacy tables. Do not drop legacy data in the same release that first introduces the new contract.
3. Migrate in a single transaction or in restartable, checkpointed batches with an idempotent migration ledger.
4. Preserve every legacy primary key in `legacy_source_id` fields or a mapping table.
5. Validate row counts, foreign-key relationships, identifier uniqueness, and content hashes before switching reads.
6. Keep a rollback path that restores the pre-migration database or selects the legacy read path without interpreting partially migrated data.
7. Mark ambiguous records `needs_resolution`; never discard or silently normalize them.
8. Only remove legacy tables in a later independently reviewed task after production evidence and rollback-window approval.

### 13.2 Mapping

| Prototype record | Release 1 mapping |
| --- | --- |
| `sessions` | Session plus legacy identifier mapping |
| `samples` row | One Sample and one Cup Assignment for its `cup_uuid`; do not fabricate additional physical cups from `cup_number` |
| `sample_feedback_entries` | Response/Tasting Events under a session-local legacy participant, preserving raw values and final flags |
| `sample_defect_entries` | Versioned form response events, preserving masks and raw legacy snapshots |
| `sample_flavour_observations` | Deterministic descriptor events with original label/keyword/colour and legacy provenance |

Because the prototype has no participant entity, migration MUST create one explicit `legacy_local` participant per session (with a new valid identifier) and label its provenance. It MUST NOT claim that this identity represents a real account-free participant.

Prototype temperature/time snapshots are preserved as legacy raw metadata for lossless recovery, but Release 1 MUST NOT present them as validated sensory timing or Smart Cup provenance.

### 13.3 Ambiguity handling

- If all legacy sample rows agree on `cupping_form`, migrate that value to the Session only when it has an approved domain mapping. Otherwise mark the Session `needs_resolution`.
- If all legacy sample rows agree on `cupping_mode`, migrate it to Session `identity_mode`.
- Mixed per-sample forms or modes are invalid under the Product Specification. Preserve raw rows, mark the Session `needs_resolution`, and require an authorised migration decision; do not pick the first value.
- A missing/duplicate Cup identity, missing parent, malformed mask, or identifier collision is quarantined with evidence rather than dropped.
- Legacy `complete` state is preserved as provenance but does not prove account-free completion, consent, sharing, or portal ingestion.
- No legacy row is treated as shared without a separately evidenced explicit share action. Migrated responses default to private/local.

## 14. Current prototype conflicts and disposition

| Evidence | Conflict | Classification | Required follow-up |
| --- | --- | --- | --- |
| `samples` represents a cup-like row and stores `cup_uuid` | Product requires Sample separate from reusable Cup and Cup Assignment | Migration work / foundational implementation gap | Add entities and migrate losslessly |
| `cupping_form` and `cupping_mode` are stored per sample | Both are session-level product contracts | Implementation defect and migration ambiguity | Promote uniform values; quarantine mixed values |
| No Organisation, User, Participant, Response, Share Operation, or Audit Event tables | Required ownership, consent, tenant, and traceability boundaries are absent | Foundational implementation gap | Add in sequenced tasks |
| Prototype entry IDs may fall back to timestamp plus `Math.random` | Not a reliable collision-resistant offline identity contract | Implementation defect | Use cryptographically random UUID generation and fail closed |
| Session NDEF reference generator may fall back to `Math.random` | Session reference must be unguessable or verifiable | Security defect | Require secure randomness; no insecure fallback |
| Feedback/defect saves persist rows but do not implement a unified response revision/event acknowledgement contract | Cannot yet prove all acknowledged observations or conflict handling | Reliability/migration work | Introduce transactional event plus projection boundary |
| Flavour and feedback rows include temperature/time snapshots | Release 1 must not present note time as sensory data; validated sensor provenance is Release 2 | Out of Release 1 behavior; preserve-only migration data | Retain as legacy metadata, do not surface as validated context |
| Current database has no durable outbox, consent snapshot, or idempotency key | FR-064 is not implemented | Implementation gap | Implement explicit consented Share Operation/outbox later |
| Current data has no server-side blind projection or tenant boundary | UI hiding cannot satisfy FR-013/security requirements | Security implementation gap | Enforce allowlisted projections and authorisation service-side |
| Current README contains obsolete NDEF4 sample colour `k` | Canonical NDEF protocol removed the field | Documentation defect outside this task | Separate README reconciliation task |
| Only NDEF form value `1` is defined | Four Release 1 forms cannot all be encoded | Unresolved product/protocol decision, FR-028B | Product Owner/approved protocol decision; do not invent values |
| Reopen duration, participant expiry, retention, tag protection, export schema, and PDF delivery are unspecified | Values materially constrain product policy | Unresolved product decisions | Keep configurable/null and escalate through PM |

## 15. Testable invariants

Subsequent implementation tasks MUST provide automated evidence for applicable invariants.

### 15.1 Domain and migration

1. New domain IDs are valid cryptographically generated UUIDs and remain stable across restart and retry.
2. `public_session_ref` is distinct from the domain ID, protocol-valid, and securely generated.
3. A session has exactly one immutable form/version after the first Response and one identity mode.
4. A Sample can have many assignments; a Cup cannot have two active assignments in one session.
5. A Response references exactly one participant, Sample, assignment, and form version.
6. Re-running migration produces no duplicates and no additional semantic changes.
7. Every legacy row is mapped or quarantined with a reason; row/content reconciliation is reproducible.
8. A failed migration leaves the original database recoverable and no partial read cutover active.

### 15.2 Offline durability

9. Killing and restarting after an acknowledged edit restores the event and current projection.
10. Failure before transaction commit does not acknowledge or expose a partially saved edit.
11. Session creation, prepared join, scan resolution, capture, editing, completion, and local review work with network disabled.
12. Unknown, unassigned, unsupported, and ambiguous scans never open a guessed sample.
13. Interrupted `sharing` state recovers without a new consent operation or duplicate snapshot.

### 15.3 Sharing and conflict

14. No outbox item exists before explicit **Share results** consent.
15. Consent, immutable snapshot, hash, and queued state commit atomically.
16. All retries reuse the Share Operation ID and snapshot hash.
17. Replaying the same operation/event returns the original acknowledgement and creates no duplicate result/event.
18. Identifier reuse with different content is rejected and preserved as a conflict.
19. Edits after sharing are not uploaded until another explicit share action.
20. Excluding a result changes aggregates but retains raw data and creates an Audit Event.

### 15.4 Blindness, privacy, and tenancy

21. Before reveal, protected identity is absent—not merely hidden—from participant UI/accessibility output, NFC, offline cache/package, URLs, logs, analytics, and network responses.
22. Blind NDEF4 `n` contains only the neutral identifier.
23. Reveal requires an authorised explicit action and creates an Audit Event.
24. A session-scoped participant grant cannot read or share another session.
25. Cross-organisation identifiers supplied by a client cannot escape server-side tenant scoping.
26. Free-text notes and protected sample identity never appear as analytics properties.

### 15.5 Protocol boundary

27. Notes, scores, participant data, and share state never enter NDEF.
28. Failed/interrupted writes remain visibly unverified and never report assignment success.
29. A production write for a form without an approved NDEF mapping is blocked.
30. Physical NFC behavior is verified only with recorded device, OS, tag, firmware where relevant, and scenario evidence.

## 16. Dependency map for subsequent tasks

```text
secure identifiers + schema/migration foundation
        |
        +--> organisation/host/session domain
        |        +--> offline host session preparation
        |
        +--> sample/cup/assignment split
        |        +--> NFC registration/write/verify
        |        +--> NFC/QR/manual offline resolution
        |
        +--> participant/response/event store
                 +--> form implementations and autosave
                 +--> completion and local review
                 +--> explicit consent + durable outbox
                          +--> idempotent ingestion
                                   +--> portal projections
                                   +--> exclusion/audit
                                   +--> CSV/PDF/history

blind-safe projection and tenant/session authorisation span every branch
FR-028B approval gates production NFC writes for all four forms
```

Recommended sequencing:

1. Secure identifier primitives and additive local schema/migration.
2. Session-level form/mode, Sample/Cup/Assignment separation, and migration validation.
3. Participant, Response, append-only Tasting Event, and transactional acknowledgement.
4. Versioned offline package plus NFC/QR/manual deterministic resolution.
5. Blind-safe projections and session/tenant authorisation, reviewed for security/privacy.
6. Explicit Share Operation/outbox and idempotent ingestion.
7. Portal read models, exclusions/audit, history, and exports.

Form-specific implementation can proceed only with approved form definitions. Production NDEF coverage for all four forms remains gated by FR-028B.

## 17. Incremental UI consumption

This contract does not redesign UI. Existing Home and Cupping screens can adopt it incrementally:

- Home reads a Session projection and explicit Cup resolution state instead of inferring product state from legacy rows.
- Cupping reads one session-level form/version and identity mode, a participant-safe Sample projection, and a Response projection.
- Existing save controls call the transactional event boundary and show saved only after durable acknowledgement.
- Existing completion controls set local completion; a separate **Share results** action creates consent and the outbox item.
- Status elements map to `private/local`, `complete`, `queued`, `sharing`, `shared`, and `failed` without changing visual styling in this task.
- Active Session and future portal views consume only authorised projections; host aggregates contain only explicitly shared results.
- Scan flows consume the four explicit resolution outcomes and retain the current manual fallback route.

Any visual or navigation change requires its own scoped task and UI-guidance review.

## 18. Conformance evidence required

An implementation claiming conformance MUST identify the exact commit and provide:

- schema and migration tests, including restart, rollback, ambiguity, and content reconciliation;
- transaction/crash-recovery tests for acknowledged observations and outbox creation;
- offline end-to-end tests for the prepared host and participant flows;
- idempotency, replay, divergent-content, and conflict tests;
- blind projection and tenant/session authorisation tests at serialization/API boundaries;
- NDEF serializer/parser conformance tests and real-device evidence where physical behavior is claimed;
- review by an independent architecture reviewer and security/privacy reviewer;
- explicit limitations for policy parameters and FR-028B.

Passing a JavaScript bundle, simulation, or mocked NFC payload alone does not prove local durability, native NFC behavior, offline readiness, blind isolation, or pilot readiness.
