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

Unresolved duration values do not permit an indefinite or missing production policy. Before pilot/production use, an authorised policy configuration MUST supply finite participant-grant expiry, retention, deletion-processing, backup-expiry, audit-retention, and revocation-propagation values. If a required value is absent, invalid, infinite, or outside an approved safety bound, the affected grant issuance, new session/data creation, or deletion workflow fails closed. This contract does not choose the values.

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

Before lookup or storage, a `public_session_ref` is normalized by trimming surrounding ASCII whitespace and converting ASCII letters to lowercase, then validated against exactly `[a-z0-9]{14}`. Internal whitespace, non-ASCII lookalikes, and every other length or character are rejected. `NO-SESSION` is recognized case-insensitively before normal validation and is never stored as a Session reference. The service MUST enforce global uniqueness on the normalized value because join artifacts do not require an organisation identifier. Local stores MUST enforce one normalized reference to one local Session or explicit reconciliation alias. Generation retries on a local or service collision; an imported reference that identifies two authoritative Sessions is quarantined and neither Session is guessed.

Physical NFC identifiers are normalized identifiers, not credentials. The NFC adapter MUST expose identifier source and raw value rather than a provider-formatted display string:

- a hardware tag UID is canonicalized from its bytes as `tag-uid:` followed by uninterrupted lowercase hexadecimal with two digits per byte;
- when hardware bytes are unavailable and the canonical protocol supplies a Smart Cup identifier in NDEF2 `u`, it is canonicalized as `smart-cup:` followed by the trimmed lowercase ASCII protocol value; an RFC 4122 UUID value also has braces removed and hyphens restored to canonical `8-4-4-4-12` form, while another protocol value must match `[a-z0-9][a-z0-9._:-]{0,127}` or be rejected;
- separators, case, and surrounding whitespace in provider tag-UID strings are removed only while decoding to bytes; an odd-length, non-hexadecimal, empty, or otherwise ambiguous UID is rejected rather than repaired;
- a value from one identifier source MUST NOT be compared as if it came from the other source.

When both a hardware UID and NDEF2 `u` are available, the hardware UID is the Cup lookup key and the protocol value is a separately unique alias to the same Cup. Conflicting aliases return `unknown`; the resolver MUST NOT switch identity sources opportunistically. The canonical pair `(identifier_kind, nfc_identifier)` is unique within an Organisation's Cup registry and within every offline Session package. The service MUST also quarantine simultaneous active ownership by different Organisations rather than silently linking tenants. A resolver encountering multiple Cup or Assignment rows for one canonical identifier returns `unknown` with a duplicate-identity error; it MUST NOT select by recency. The system MUST NOT use a raw or canonical NFC identifier as an authentication secret.

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

Fields listed as policy parameters may be null in design/import state until the Product Owner approves a value. Unknown data MUST remain unknown rather than receiving a misleading default. Section 2's mandatory finite safety policies are nevertheless preconditions for the affected production operation; null never authorises a non-expiring grant, indefinite retention, or an unbounded deletion/revocation delay.

Session, Sample, Cup, and Cup Assignment records that can originate from a cold NFC join are discriminated unions:

- `authority_state = authoritative` uses the full canonical shape and all authoritative ownership/actor fields described below;
- `authority_state = provisional` uses the explicit restricted shapes in section 5.12; unavailable authority fields are SQL/JSON `null` or absent exactly as that shape specifies, never placeholder UUIDs, sentinel Organisations, copied participant IDs, or inferred host identities.

Only authoritative entities may enter host/service-authoritative queries, tenant-scoped portal projections, exports, aggregate reporting, or assignment-readiness decisions. Participant-local projections may follow provisional references solely under the restricted access contract in section 10.1.

### 5.1 Organisation

Required fields:

- `organisation_id`, `name`, `timezone`, `default_units`
- `retention_policy_ref` (nullable only in design/import state pending policy; production Session creation is blocked until it resolves to an approved finite policy)
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
- `access_grant_ref` (null only for `provisional_local`; otherwise references the authoritative grant in section 10.3)
- `privacy_notice_version`, `privacy_accepted_at`
- `completion_state`, `completed_at`
- `identity_projection_state`: `hidden` or `revealed_after_completion`, and `identity_revealed_at` when revealed
- `participant_revision`, a monotonically increasing session-local aggregate revision
- `access_expires_at` (null only for `provisional_local`; every authoritative grant supplies a finite policy-derived value)
- `created_at`, `updated_at`

A participant belongs to exactly one session. An access grant MUST be session-scoped and MUST NOT authorise another session or organisation. Local identity continuity MAY survive restart on the same device. It MUST NOT be silently promoted to a host account or cross-session identity. In a blind Session, the transaction that explicitly changes `completion_state` to `complete` also changes `identity_projection_state` from `hidden` to `revealed_after_completion` and records `identity_revealed_at`. That identity transition is monotonic for the retained local record: reopening or editing a Response cannot set it back to `hidden`. It is durable for this participant/device and does not create share consent or network work.

### 5.4 Session

Required fields:

- `authority_state = authoritative`
- `session_id`, `public_session_ref`, non-null `organisation_id`, non-null `host_user_id`
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

- `authority_state = authoritative`
- `sample_id`, `session_id`, `position`
- at least one of `display_name` or `sample_code`
- `blind_code`
- optional Release 1 metadata: `external_reference`, `supplier`, `origin`, `process`, `lot`, `roast_reference`, `sample_stage`, `notes`
- `created_at`, `updated_at`

A Sample is the coffee being evaluated. It is not a cup and MUST NOT store a physical NFC identifier. `blind_code` is the neutral participant-facing identity before completion. Protected metadata remains in host-authorised storage and may also be retained encrypted in participant-local storage when read from NDEF4, but participant-facing projections MUST withhold it until that participant completes.

### 5.6 Cup

Required fields:

- `authority_state = authoritative`
- `cup_id`, non-null `organisation_id`
- `nfc_identifier`, `device_type`, `capabilities`
- optional `internal_label`, `model`, `hardware_version`, `firmware_version`
- `status`, `tag_write_status`, `last_written_at`, `last_verified_at`
- `created_at`, `updated_at`

A Cup is reusable across sessions. `nfc_identifier` is immutable unless an audited replacement operation explicitly creates or links a replacement cup. Release 1 requires an `ntag` capability without sensor assumptions. Smart Cup capabilities are additive Release 2 data.

### 5.7 Cup Assignment

Required fields:

- `authority_state = authoritative`
- `cup_assignment_id`, `session_id`, `sample_id`, `cup_id`
- non-null `assigned_by_user_id`, `assigned_at`
- `lifecycle_state`, `replaces_assignment_id`, `ended_at`
- `tag_payload_version`, `intended_payload_hash`, `tag_write_status`, `tag_verified_at`
- last write/verification error and recovery timestamps where applicable

One Sample may have many Cup Assignments. A Cup MUST have at most one `active` assignment in a session. The implementation MUST enforce a uniqueness invariant equivalent to `(session_id, cup_id) WHERE lifecycle_state = 'active'` and MUST reject duplicates with a corrective error.

Database state and a physical NFC write cannot share one transaction. Reassignment therefore uses the following durable state machine:

```text
staged -> writing -> written_unverified -> verified_pending_activation -> active
   |         |              |                         |
   +---------+--------------+-------------------------+-> failed
   +---------------------------------------------------> cancelled

active -> superseded                    failed-after-write -> rollback_pending
```

1. **Stage:** In one local transaction, create a `staged` candidate with the complete intended participant-safe payload, its canonical hash, and `replaces_assignment_id`. Keep the last verified assignment `active`. A newly registered cup with no prior assignment remains unassigned.
2. **Write intent:** Persist `writing` before beginning the external NFC operation. Retries reuse the same candidate and payload hash.
3. **Write:** After the adapter reports a completed write, persist `written_unverified`. This state is not success.
4. **Read-back verify:** Read the tag again and compare its complete canonical payload and physical identifier with the staged intent. An exact match records verification evidence and moves to `verified_pending_activation`. A mismatch or unreadable tag moves to `failed` or a retryable `written_unverified` state with an explicit error; it never activates.
5. **Activate:** In one idempotent local transaction, end/supersede the previous active assignment, activate the verified candidate, and persist the verification time. Only this transition reports assignment success/readiness.

Resolver behavior is deterministic at every state:

- a scan matching the last verified `active` assignment resolves `assigned`, even while a different candidate is `staged`, `writing`, or `written_unverified`;
- a local scan matching only a non-active candidate returns `unassigned` with an assignment-in-progress or recovery reason and MUST NOT open tasting;
- with no previous active assignment, every pre-activation state resolves `unassigned`;
- a payload matching neither the active nor the candidate intent returns `unknown` and creates recovery evidence;
- `failed`, `cancelled`, `rollback_pending`, and `superseded` records never resolve as active;
- a cold participant device without the host's assignment journal may bootstrap provisionally from one structurally valid NDEF payload under section 10.1, but later reconciliation MUST confirm or conflict that provisional mapping.

On restart, recovery examines each non-terminal intent and performs a fresh read where possible. If the tag exactly matches the candidate, recovery verifies and activates idempotently. If it exactly matches the last verified payload, the last verified assignment stays active and the candidate can be retried or failed. If it matches neither, the cup is not ready and requires host recovery. A persisted `verified_pending_activation` may repeat the activation transaction; a later contradictory physical read is treated as tag drift and blocks readiness.

Cancellation before physical writing marks the candidate `cancelled`. After writing starts, cancellation first enters `rollback_pending`: the app must rewrite and verify the last verified payload before marking the candidate cancelled. Where there is no safely restorable payload or tag protection policy prevents restoration, the cup remains `failed`/not ready for manual recovery; this contract does not invent a tag-clearing policy. A failed or interrupted write MUST NOT report success.

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
- immutable `participant_snapshot_revision`, `response_revision_vector`, `schema_version`, `canonicalization_version`, `hash_algorithm`, and `snapshot_hash`
- `consent_recorded_at`, `privacy_notice_version`
- state: `queued`, `sharing`, `shared`, or `failed`
- `queued_at`, `last_attempt_at`, `acknowledged_at`
- `attempt_count`, `last_error_code`, `retry_after`

Every transaction that changes any Response, Tasting Event, or participant completion state increments `participant_revision` exactly once. The outbox payload is the immutable aggregate cut at `participant_snapshot_revision`: it contains every Response owned by that participant in the Session, including completion state, plus an explicit `response_revision_vector` of `{response_id, current_revision}` entries. The vector is sorted by canonical `response_id`; each included event is bounded by the named Response revision. A Response created after the cut or an event committed at a later aggregate revision is not part of the snapshot.

Snapshot creation MUST occur in one local database transaction that:

1. obtains a write lock or equivalent serializable boundary for the participant/session aggregate;
2. reads and freezes the current `participant_revision`;
3. enumerates all participant Responses in that Session and their exact revision vector;
4. materializes and canonicalizes the envelope defined in section 8.1;
5. computes the canonical hash;
6. records consent, the immutable Share Operation, and the queued outbox bytes; and
7. commits before showing `queued`.

A concurrent edit either commits before this transaction and appears in the vector, or commits afterward with a higher `participant_revision` and is excluded. Torn cross-Response snapshots are forbidden.

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

Audit events are append-only. Release 1 MUST audit cup reassignment, Session identity-mode changes, result exclusion/inclusion, session complete/reopen/archive, and other host identity-affecting changes. Participant completion and its local reveal are persisted atomically in the participant aggregate; they are not a host-global reveal and do not create a network Audit Event or share operation. Audit payloads MUST obey the same blind and tenant-isolation rules as normal data.

### 5.12 Provisional cold-bootstrap entity shapes

These shapes exist only in participant-local storage after section 10.1 bootstrap. They are not incomplete authoritative rows.

**Provisional Session**

- `authority_state = provisional`
- local `session_id`, normalized `public_session_ref`
- `organisation_id = null`, `host_user_id = null`
- participant-safe `name`, `session_type`, `identity_mode`, registry-pinned `form_key`, `form_version`, and form-definition hash derived from validated NDEF/registry evidence
- `provisional_status`: `local_joined`, `conflicted`, or `reconciliation_blocked`; authoritative lifecycle `status = null`
- `provenance`: `source = ndef_cold_bootstrap`, canonical NDEF evidence hash, parser/profile version, physical-read time, and originating app/build version
- `created_at`, `updated_at`

**Provisional Sample**

- `authority_state = provisional`
- local `sample_id`, provisional `session_id`, validated protocol position, neutral blind label, and any real NDEF name/origin/process fields retained as encrypted protected presentation data
- protected host-only metadata absent; fields not present in NDEF are `null`, never inferred
- the same evidence hash/provenance reference as the bootstrap transaction
- `created_at`, `updated_at`

**Provisional Cup**

- `authority_state = provisional`
- local `cup_id`, `organisation_id = null`
- canonical identifier kind/value, observed `device_type`, and only capabilities proven by the read/classifier
- internal label, model, hardware version, firmware version, authoritative cup status, and host tag-history fields `null` unless directly present in canonical participant-safe protocol evidence
- the bootstrap evidence hash/provenance reference, `created_at`, `updated_at`

**Provisional Cup Assignment observation**

- `authority_state = provisional`
- local `cup_assignment_id` and provisional `session_id`, `sample_id`, `cup_id`
- `assigned_by_user_id = null`, `assigned_at = null`; these MUST NOT be replaced by the participant or physical-read time
- `observed_at`, canonical observed payload hash, protocol/profile version
- `lifecycle_state = provisional_observed`; no `active`/verified/readiness claim
- bootstrap evidence hash/provenance reference, `created_at`, `updated_at`

A participant Response may reference a `provisional_observed` assignment locally. That relationship means “this tag payload was observed for this provisional sample,” not “an authorised host assignment was verified.” Host/service code MUST use a typed authoritative-only repository/view whose schema excludes provisional rows, rather than relying on callers to remember a filter.

Reconciliation is monotonic and provenance-preserving:

1. validate the authoritative package and scoped grant before creating any authoritative ownership/actor value;
2. insert or match separate full authoritative Session, Sample, Cup, and Cup Assignment records with non-null service-validated Organisation, Host, and assigner references;
3. create one-to-one typed alias rows from provisional IDs to authoritative IDs, including evidence/package versions and reconciliation time;
4. mark provisional records `reconciled` in reconciliation metadata without rewriting their original evidence fields or changing `authority_state`;
5. route participant Responses/Events through the validated aliases for service ingestion while preserving their IDs/revisions; and
6. perform the alias creation, grant replacement, and local projection switch atomically and idempotently.

An implementation MAY let the service explicitly adopt a client-generated domain UUID, but only when the authoritative response names that same UUID and supplies every required ownership/actor field. This is still recorded as validated adoption with provenance; local code never self-promotes a provisional record. A mismatch, missing authority field, alias collision, or changed immutable evidence leaves the provisional graph isolated and blocked as section 10.2 specifies.

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
4. exactly one increment of the owning participant's session-local `participant_revision`; and
5. a local commit marker sufficient to detect an incomplete transaction after restart.

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

- integer contract/schema version and `canonicalization_version`;
- immutable local `session_id` and normalized `public_session_ref` in the snapshot;
- authoritative `organisation_id`/`session_id` alias binding and participant session-scoped access proof in the transport authorisation wrapper after reconciliation;
- `share_operation_id`, `participant_snapshot_revision`, sorted `response_revision_vector`, `hash_algorithm`, and `snapshot_hash`;
- participant display data permitted by the privacy notice;
- every participant Response in the Session at the aggregate cut and its immutable events through the corresponding vector revision;
- client-created times and app/build version for diagnostics.

The envelope MUST NOT include unrelated sessions, unshared later revisions, device secrets, credentials, tenant-only data, or analytics data. Participant completion/reveal does not itself create or enqueue this envelope. Protected coffee metadata already known to the host SHOULD be represented by authoritative Sample aliases rather than redundantly copied from participant-local NDEF evidence.

### 8.1.1 Canonical bytes and hash

Release 1 canonicalization version `cup-share-jcs-v1` uses RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8 without a byte-order mark, and SHA-256. The stored/transmitted `snapshot_hash` is 64 lowercase hexadecimal characters.

Before JCS serialization, the Cup App profile requires:

- domain UUIDs in canonical lowercase hyphenated form;
- `public_session_ref`, NFC identifiers, enums, and timestamps normalized by their defining contracts;
- every timestamp normalized by the exact timestamp profile below before JCS serialization;
- no `undefined`, non-finite number, negative zero, duplicate object key, or unpaired Unicode surrogate;
- absent optional fields omitted, while an explicit JSON `null` appears only where the schema assigns it meaning;
- `response_revision_vector` and Responses sorted by `response_id` code-point order;
- each Response's events sorted by numeric `local_revision`, then `event_id` code-point order;
- set-like arrays sorted by the schema-defined identifier; user-authored ordered values retain their semantic order.

#### Timestamp profile `cup-time-ms-v1`

Every timestamp field in a hashed snapshot MUST first parse the case-sensitive input grammar:

```text
YYYY-MM-DDTHH:mm:ss[.fraction](Z|+HH:MM|-HH:MM)
```

The rules are:

- year is `0001` through `9999`; month/day must be a real proleptic-Gregorian date;
- hour is `00`-`23`, minute and second are `00`-`59`; leap seconds and `24:00:00` are rejected;
- `fraction`, when present, has one to three decimal digits and denotes decimal fractions of a second; more digits are rejected rather than rounded;
- an offset is mandatory and is either uppercase `Z` or a numeric offset from `-13:59` through `+13:59`, plus `-14:00` and `+14:00`; at `14` the minutes must be `00`;
- `-00:00` is rejected because it denotes an unknown local offset; `+00:00` is accepted as UTC;
- spaces, lowercase `t`/`z`, timezone names, omitted seconds, commas, and surrounding whitespace are rejected;
- parsing/conversion uses integer calendar arithmetic, not locale rules or floating-point epoch seconds; an offset conversion outside years `0001`-`9999` is rejected.

After validating, convert the instant to UTC, right-pad an absent/short fraction to exactly three millisecond digits, and serialize exactly `YYYY-MM-DDTHH:mm:ss.SSSZ` (24 ASCII characters). No fractional trimming is permitted. Thus semantically equal accepted inputs always produce identical strings before JCS.

Required timestamp vectors:

| Accepted input | Canonical output |
| --- | --- |
| `2026-10-02T10:00:00Z` | `2026-10-02T10:00:00.000Z` |
| `2026-10-02T10:00:00.0Z` | `2026-10-02T10:00:00.000Z` |
| `2026-10-02T10:00:00.000+00:00` | `2026-10-02T10:00:00.000Z` |
| `2026-10-02T12:30:45.12+02:30` | `2026-10-02T10:00:45.120Z` |
| `2026-01-01T00:15:00-01:00` | `2026-01-01T01:15:00.000Z` |

Required rejection vectors include `2026-10-02 10:00:00Z`, `2026-10-02T10:00:00z`, `2026-10-02T10:00Z`, `2026-10-02T10:00:60Z`, `2026-10-02T10:00:00.0000Z`, `2026-10-02T10:00:00-00:00`, and `2026-02-29T10:00:00Z`.

The hash input is the complete immutable share snapshot excluding only `snapshot_hash`, transport-attempt metadata, the authoritative alias/access wrapper, access-proof bytes/signatures, and service acknowledgement fields. It includes the locally stable `session_id`, normalized `public_session_ref`, `schema_version`, `canonicalization_version`, `hash_algorithm`, `share_operation_id`, aggregate/vector boundaries, and all shared content. The exact canonical UTF-8 bytes are stored with the outbox item so retries do not reserialize mutable projections. After a cold join, reconciliation binds the immutable local identifiers to authoritative identifiers in the excluded transport wrapper; it does not rewrite the consented bytes.

The service MUST validate schema/types, reconstruct the hash-input object from received fields, apply the same profile and JCS implementation independently, recompute SHA-256, and compare the digest before idempotency or ingestion decisions. It MUST NOT trust the client-provided hash or hash raw transport bytes whose excluded authentication wrapper may vary. An unsupported canonicalization version is a permanent validation failure, not a fallback to implementation-native JSON serialization.

Cross-implementation canonicalization/hash fixture (intentionally a minimal object rather than a complete valid share envelope; the line between the fences has no trailing newline in the hashed bytes):

```json
{"canonicalization_version":"cup-share-jcs-v1","consent_recorded_at":"2026-10-02T10:00:00.000Z","hash_algorithm":"sha-256","participant_id":"00000000-0000-4000-8000-000000000001","participant_snapshot_revision":7,"response_revision_vector":[{"response_id":"00000000-0000-4000-8000-000000000010","revision":3},{"response_id":"00000000-0000-4000-8000-000000000011","revision":2}],"schema_version":1,"session_id":"00000000-0000-4000-8000-000000000002","share_operation_id":"00000000-0000-4000-8000-000000000020"}
```

Expected SHA-256: `95faf8ed77cc827f4840a918d9e410ac859c5cb26d1a4ccdf42788b1582d3187`.

### 8.2 Service acceptance transaction

The service MUST atomically:

1. authenticate/validate the session-scoped grant and tenant/session relationship;
2. validate schema and form versions;
3. enforce completion-aware blind projection and NDEF-exception field rules;
4. independently canonicalize and recompute the snapshot hash, then compare the idempotency identifier and digest;
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

The system MUST NOT use timestamp-only last-write-wins for responses, session identity, cup assignment, or participant completion/reveal state.

- Immutable shared snapshots never mutate in place.
- A new explicitly shared revision is stored as a later revision linked to the earlier accepted snapshot.
- Divergent response revisions from the same base are both preserved and flagged for authorised resolution.
- Concurrent Cup Assignments that violate uniqueness are rejected or quarantined; the app never guesses which sample is correct.
- Session form/version conflicts block ingestion because response meaning cannot be inferred safely.
- Blind/open Session-mode conflicts choose the more restrictive participant projection until an authorised, audited host decision resolves the mode. This conflict rule does not reverse a participant's already persisted post-completion reveal on that device.

## 9. Blind-data classification and projections

### 9.1 Data classes

- **Protected sample identity in Cup App presentation:** display name when identifying, origin, supplier, process, lot, roast reference, external reference, notes, and any value that can reveal the coffee. NDEF4's documented `n` name/origin and `p` process are an explicit raw-tag threat-model exception, not permission to display them early in Cup App.
- **Neutral participant identity:** `blind_code`, neutral session label, sample position, form metadata, and Cup Assignment reference.
- **Participant result data:** participant display name, responses, notes, descriptors, completion, consent, and share status.
- **Operational data:** non-secret identifiers, schema versions, state flags, error codes, and timestamps.

Classification is conservative: when a field may reveal sample identity, treat it as protected.

### 9.2 Projection rules

| Projection | Before this participant completes | After this participant completes |
| --- | --- | --- |
| Host-authorised local/service view | Protected identity allowed | Protected identity allowed |
| Account-free participant UI/accessibility tree | Neutral blind code only; no protected coffee metadata in any participant-facing surface | Locally held coffee metadata is visible for this participant/device and remains visible during later permitted review/editing |
| Participant encrypted offline cache/package | May retain protected `n`/`p` values read from NDEF4, but participant-facing selectors expose only the neutral blind projection | The same local values become eligible for the revealed participant projection; no download is required |
| Participant network response | No protected coffee metadata; server/API filtering remains mandatory | Still no protected coffee metadata in Release 1; local reveal does not depend on a service response |
| Share envelope/outbox | No item exists without a separate **Share results** action | Completion/reveal still creates no item; a later explicit share follows sections 5.10 and 8 and need not duplicate coffee metadata already identified by Sample aliases |
| NFC NDEF4 | Real coffee name/origin `n` and process `p` may remain with `m=b`; raw inspection is outside the Release 1 threat model | Tag bytes are unchanged; completion requires no rewrite |
| QR/link/manual join package | Neutral identity only | Still neutral in Release 1; no reveal QR or refresh is required |
| Logs, crash reports, analytics | No protected identity, free-text notes, credentials, or raw tag secrets | Same restriction after reveal |
| Portal | Host-authorised identity plus explicitly shared results | Same; participant completion/reveal does not imply that results were shared |

Blind protection MUST be enforced by the participant-facing projection boundary. In blind mode before completion, selectors/serializers for UI, page titles, URLs, notifications, screen-reader labels, cached previews, production diagnostics, participant API responses, and API error details MUST omit protected coffee metadata even when encrypted local storage contains `n`/`p` from NDEF4. General UI components MUST receive the neutral projection rather than broad Sample or raw-NDEF objects. Service/API projection filtering remains mandatory and cannot be replaced with visual hiding.

Reveal is the local consequence of this participant explicitly completing the blind Session. In one durable local transaction the app validates completion, records completion and reveal timestamps, and switches that participant/device to `revealed_after_completion`. The transition works offline, requires no host-global state, server refresh, reveal QR, or tag rewrite, and is not reversed by reopening/editing the local result or by later host Session closure/archive. It does not create consent, an outbox item, a Share Operation, or any upload. Only an applicable deletion/reset operation may later remove the locally held data.

Deliberate inspection of raw tag contents using a third-party NFC reader is outside the Release 1 threat model. This narrow exception does not weaken protection for participant results, notes, credentials, access grants, tenant data, device secrets, service responses, logs, analytics, or any field not expressly allowed by `NDEF_PROTOCOL.md`.

### 9.3 Encryption and key management

All Cup App data other than the deliberately participant-readable canonical NDEF payload is sensitive by default. Encryption is mandatory, not a provider option.

**In transit**

- Every mobile/service, portal/service, service-to-service, export download/upload, backup transfer, key-management, and administrative connection MUST use an authenticated encrypted transport with certificate/peer validation and downgrade/plaintext disabled.
- Authentication, access grants, join capabilities, result snapshots, exports, keys, and credentials MUST never be sent over plaintext or an unauthenticated encrypted channel. Redirects, retries, diagnostics, and health endpoints MUST NOT create an exception.
- The NDEF radio/tag payload is not confidential under the current protocol. Its allowlist may include the real NDEF4 `n` name/origin and `p` process in blind mode under section 9.2, but MUST contain no result, note, participant data, credential, access grant, tenant secret, device secret, or other protected metadata outside the canonical NDEF contract.

**At rest**

- The installed app MUST encrypt its local database, offline packages, private notes/results, canonical outbox bytes, conflict/quarantine evidence, cached participant projections, locally generated exports, and migration/rollback copies.
- The service MUST encrypt primary databases, object/blob storage, portal/search read models, queues, quarantine/dead-letter stores, generated exports, operational snapshots, replicas, and backups.
- Host/participant credentials, access grants, refresh material, capability proofs, and private keys require the strongest applicable credential/key protection and MUST NOT be stored in general preferences, plaintext files, logs, analytics, crash reports, or unencrypted backups.

**Keys and separation**

- Mobile data-encryption keys are generated with a cryptographically secure source, are non-exportable where the platform supports it, and are wrapped/protected by platform secure key storage. Credential/grant material uses a separate secure-storage namespace/key from bulk local data.
- Service data-encryption keys are envelope-wrapped by a provider-neutral key-management boundary. Production, test, and development keys are separate. Primary data, credentials/grants, exports, and backups use separate key purposes; compromise or revocation of one purpose MUST NOT expose every surface.
- Key identifiers/versions accompany encrypted records without exposing key material. Key material never enters source control, task records, client payloads, analytics, or routine logs.
- Rotation is supported without plaintext bulk exposure: new writes use the current key version, reads can unwrap approved older versions during migration, and re-encryption progress is durable/idempotent. Revoked/compromised keys stop new use immediately and follow an authorised recovery or crypto-erasure procedure.
- Backup keys are separated from live-data keys. Deleting live data alone MUST NOT make an undeclared backup copy readable indefinitely.

**Fail-closed behavior and evidence**

- Before accepting sensitive local capture, the app MUST successfully provision/open its protected key and encrypted store. If secure storage, key unwrap, authenticated decryption, or integrity verification fails, it MUST not fall back to plaintext, overwrite ciphertext, display stale decrypted caches, or report a save/share success.
- Services similarly fail the affected operation closed on key, certificate, or integrity failure; ciphertext and recovery evidence are preserved without logging plaintext. Availability degradation is explicit and tenant isolation remains enforced.
- Recovery, rotation, revocation, restore, and crypto-erasure actions are authorised and minimally audited. Implementations MUST test that database files, application backups, exported service objects, and captured transport do not expose representative sensitive fixtures without the appropriate keys.

### 9.4 Retention, display-name removal, deletion, and anonymisation

An approved policy supplies finite durations and any authorised hold rules. Missing policy never means “retain forever” or “delete immediately”; production creation/issuance fails closed as section 2 states.

Two tenant-scoped operations are required:

- `anonymize_participant_display_name` removes the participant's display name from shared/service/host-controlled data while preserving response content and exclusion/audit semantics required by the Product Specification;
- `delete_session` deletes or irreversibly anonymises the Session and its tenant-controlled Samples, Cups only where session-owned, Assignments, participants, accepted responses/events, share operations, read models, exports, and derived data according to policy.

Each operation has an immutable random `deletion_operation_id`, target tenant/session/participant scope, authorised actor, policy version, requested time, and state `requested -> authorised -> propagating -> completed`, with explicit `partially_blocked` and `failed` outcomes. The same operation ID and scope are idempotent; reuse with different scope is rejected. Authorisation derives tenant and target scope server-side and requires a current host/admin permission appropriate to the action.

Propagation MUST cover:

- primary service records, accepted raw records, portal/search/aggregate read models, caches, queues, quarantine/dead-letter stores, service-managed exports and download links, replicas, and migration/rollback stores;
- host-controlled mobile/offline packages on next authenticated synchronization;
- participant outbox items and shared-result local copies when the device next validates the tombstone; a deleted Session's service tombstone rejects late queued/replayed shares so data cannot resurrect;
- participant-private, never-shared local results only where local user action or an applicable disclosed local-retention policy authorises removal. A host deletion cannot be falsely reported as erasing an offline private device the service has never controlled;
- derived analytics only if they contain targetable personal/session data; analytics should already exclude notes and protected identity.

Service-managed exports are revoked and deleted. An export already downloaded outside Cup App control cannot be remotely erased; the deletion result records this limitation without retaining the file contents. New exports and restored read models MUST consult tombstones.

Immutable backups use a deletion manifest/tombstone and expire or become cryptographically unreadable within the finite configured backup policy. A restore MUST apply deletion manifests before the restored system serves queries. Quarantine data is not exempt: it is deleted/anonymised on the same target scope unless a specifically authorised hold applies; holds are scoped, finite, reviewable, and never inferred.

Audit evidence is minimised rather than silently destroyed: after anonymisation/deletion it retains only the tenant, operation ID, opaque/non-reversible target tombstone, action, policy/legal basis code where applicable, timestamps, and outcome. It MUST NOT retain display names, free-text notes, protected sample identity, grants, or deleted payload snapshots. Audit retention itself is a finite policy input.

Completion requires durable per-surface evidence or an explicit `partially_blocked` result naming the uncontrolled/offline surface. A compact tombstone containing no deleted content remains for the configured anti-replay period, then follows policy. Retrying propagation or restoring a backup is unable to resurrect deleted/anonymised data.

## 10. Offline session package

The app MUST persist a versioned offline package before a prepared session can claim offline readiness. The package is the union of data obtained through authorised host setup and participant join paths; NFC alone need not carry every field.

Minimum content:

- package/contract version and creation/update time;
- an authoritative `session_id` or a persisted provisional Session plus mapping from normalized `public_session_ref`;
- neutral session name, session status, form key/version, and identity mode;
- authoritative session-scoped participant access material or the restricted provisional-local access state defined below;
- privacy notice version;
- known ordered Samples using participant-facing fields (`sample_id`, `blind_code` or open display label, position), plus encrypted protected `n`/`p` metadata for a blind Sample when it was read from NDEF4; the package MAY grow as additional NFC cups are scanned, MUST keep protected values out of pre-completion projections, and MUST NOT imply that an NFC-only join already contains unscanned samples;
- active Cup Assignment resolution data for NFC, QR, and manual codes;
- form definition and validation rules needed for local capture;
- local participant identity and existing Response/Event state;
- explicit package freshness/version and integrity evidence;
- outbox and retry metadata for already consented shares.

The package MUST support session creation by a prepared host, NFC/QR/manual joining from available prepared data, cup resolution, form rendering, capture, editing, completion, and local review without a network request.

Resolution outcomes are exactly `assigned`, `unassigned`, `unknown`, or `unsupported`. An absent or ambiguous mapping MUST NOT fall back to the most recent sample. Manual selection records that manual identity resolution was used.

### 10.1 Cold/offline NFC bootstrap

A first-use device in airplane mode has no service-issued domain IDs or access token. A successful read of one structurally valid, supported canonical NDEF payload may bootstrap local tasting without pretending that tag data is service-authoritative.

The bootstrap transaction MUST:

1. normalize and validate `public_session_ref` and the physical NFC identifier under section 4;
2. classify the supported NDEF profile and resolve `f` through an immutable form compatibility registry bundled with the installed app;
3. reject `NO-SESSION`, an unsupported/ambiguous form mapping, malformed sample position, invalid mode, duplicate canonical identifier, or conflicting prior payload;
4. find or create one persisted provisional Session using the exact section 5.12 shape, keyed by normalized `public_session_ref`, with Organisation/Host authority explicitly unavailable;
5. find or create the section 5.12 provisional Sample, Cup, and Cup Assignment observation keyed within that Session by protocol position `z`, canonical NFC identifier, and parsed payload intent, with Organisation/assigner authority explicitly unavailable;
6. create or reuse a cryptographically random local participant ID and a `provisional_local` session access record;
7. persist the participant package, encrypted raw canonical NDEF evidence, any protected NDEF4 `n`/`p` presentation metadata, parser/profile version, and provisional-to-authoritative mapping rows; and
8. only then open the scanned cup's Response.

Provisional domain IDs are normal cryptographically random UUIDs generated once and persisted. They are not derived from public tag data and are marked `authority_state = provisional`. `organisation_id`, `host_user_id`, and `assigned_by_user_id` remain null/absent according to section 5.12; the app MUST NOT generate stand-ins. Repeating the same scan returns the same provisional Session, Sample, Cup Assignment observation, participant continuity, and Response; it does not duplicate them. A different payload for the same normalized reference/position/identifier is retained as conflict evidence and returns `unknown` until reconciled.

The current NDEF payload has a form key but no independent form-version field. Therefore each supported NDEF protocol profile and `f` value MUST map to exactly one immutable bundled pair `(form_key, form_version)` and a form-definition hash. That registry entry is the provisional Session's form contract. If an app supports more than one form version for the same unversioned NDEF profile/key, cold bootstrap is `unsupported`; it MUST NOT select the newest version. Adding an on-tag version requires a separately approved NDEF protocol change. FR-028B still prevents production bootstrap/write mappings for the three forms without approved `f` values.

`provisional_local` is evidence of physical possession for local use of exactly one `public_session_ref`. It permits offline capture and local completion only. In a blind Session, its participant-facing projection remains neutral until that participant completes, even though encrypted storage may retain real `n`/`p` values from the tag. It is not a service bearer token, does not identify an Organisation, cannot read host data or another Session, and cannot by itself upload results. The app may queue an explicitly consented share while still provisional, but transport waits until the access and identity reconciliation below succeeds.

### 10.2 Online reconciliation

When connectivity returns, the app presents the normalized `public_session_ref`, canonical NDEF evidence, provisional participant continuity, and any separate QR/link capability it holds to the provider-neutral SessionAccess boundary. The service validates the reference/capability, session status, tenant, canonical form/version, mode, sample position, Cup, and active Assignment, then returns an authoritative package plus a service-valid session-scoped grant. This exchange does not upload results, alter local completion/reveal state, or imply share consent.

Reconciliation MUST be one idempotent local transaction keyed by normalized `public_session_ref` and authoritative identifiers:

- create full authoritative entities from service-validated data where not already present, then durable typed aliases from each provisional Session/Sample/Cup/Assignment ID to its authoritative ID; never fill authority fields from local guesses;
- retain the locally generated participant, Response, Event, and Share Operation IDs unless an exact collision is detected;
- rewrite or resolve foreign keys through the alias map without changing event content, local revisions, participant aggregate revisions, or consent snapshots;
- merge only records whose public reference, normalized NFC identity, sample position, form key/version, and identity mode agree;
- record the service package/version, validated Organisation/Host/assigner provenance, and replace `provisional_local` with the service-valid session-scoped grant;
- preserve the participant's durable `identity_projection_state`; reconciliation or a later package MUST NOT re-hide an already completed participant's locally revealed metadata or reveal an incomplete participant;
- leave queued share snapshot bytes byte-for-byte immutable and place authoritative alias bindings only in the separately validated transport wrapper excluded from the snapshot hash.

Repeating the same authoritative package produces no additional rows or revisions. Provisional rows remain provenance evidence and are excluded by construction from authoritative repositories/views before and after reconciliation. A domain-ID collision with different content, missing validated Organisation/Host/assigner authority, mismatched form/version or mode, unknown/revoked session, conflicting Sample/Assignment, or duplicate authoritative mapping is quarantined. Local observations remain readable and are never discarded; sharing stays visibly failed/blocked until an authorised resolution or a new join artifact establishes scope. The app MUST NOT silently attach local results to a merely similar service record.

### 10.3 Authoritative participant access grant

The `provisional_local` record is not a grant. A service-valid participant grant is issued only after the service validates permitted join capability/evidence, resolves tenant and Session from server-owned data, confirms the Session access state, binds local participant continuity, and records the accepted privacy-notice version. A join capability is itself a cryptographically random opaque value backed by an integrity-protected service record, or a signed/authenticated artifact; it is purpose/audience-bound to participant joining, resolves to exactly one authoritative tenant and Session, has a finite policy-derived expiry and revocation/replay state, and never accepts client claims as authority. NDEF possession alone remains insufficient.

Each grant has or resolves server-side to these immutable claims:

- random `grant_id`, grant format/version, issuer, and signing/encryption/key version or opaque-record version;
- authoritative `organisation_id` and `session_id` derived by the service, never accepted as scope merely because the client supplied them;
- `access_subject_id` bound to one account-free participant/session continuity and its registered `local_device_scope_id` where applicable;
- explicit audience identifying the participant-safe API/service;
- least-privilege scopes selected from `participant_session_read` and `own_results_share`; no identity-reveal, host, billing, membership, other-participant, or cross-session scope;
- `issued_at`, optional future `not_before`, mandatory finite `expires_at`, policy version, and current status/revocation version.

The actual lifetime is a Product Owner policy value, but issuance MUST reject a missing, null, non-finite, already expired, or non-positive configured lifetime. No sentinel date means “never.” The service caps expiry at the configured Session/participant-access boundary and does not let a refresh silently exceed policy.

The grant is either cryptographically signed/authenticated so alteration is detectable, or is a cryptographically random opaque bearer whose complete claims/status live in an integrity-protected service record. Client-readable claims are untrusted until verified. Raw grants and refresh/capability material are stored only in platform secure credential storage, excluded from ordinary device backups where supported, and never placed in NDEF, URLs, analytics, crash reports, clipboard, or logs. Bulk app-data encryption alone is not sufficient credential storage.

Every service read, share, reconciliation continuation, and deletion-related participant request MUST validate:

1. cryptographic/opaque integrity, issuer, format/key version, audience, and finite `not_before`/`expires_at`;
2. current grant/subject/session revocation status and the configured revocation-propagation bound;
3. exact authoritative tenant, Session, access subject, device continuity where bound, and requested scope;
4. current Session state and the policy matrix for join, participant-safe read, share-after-completion/closure, and archive/delete behavior; and
5. request-specific bindings, including the immutable Share Operation ID/hash for result ingestion.

Validation derives query tenant/session scope from the verified grant and server records. A client path/body identifier can only narrow that scope and a mismatch fails closed. Expired, revoked, wrong-audience, wrong-session, wrong-tenant, wrong-subject, or insufficient-scope use returns no protected data and no distinguishable resource-existence detail.

Grant revocation is supported by grant, participant, and Session. Session deletion revokes immediately; closure/archive behavior follows a mandatory configured access-state matrix with finite share grace where allowed. If that matrix or a required duration is unset, the operation is denied. Release 1 participant service responses remain blind-safe and do not supply the local reveal. Local completion reveal does not depend on a grant claim or service read and remains visible on that device. Revocation cannot make metadata already revealed offline secret again, so connected clients apply the applicable deletion/cache policy and the limitation is recorded.

Refresh/replacement requires either a still-valid grant with refresh permission represented server-side or renewed proof from a permitted join artifact/capability. It repeats current Session, subject, audience, scope, revocation, and policy checks; issues a new `grant_id`; and revokes/replaces the old grant under a finite configured overlap bound. An expired or revoked grant alone cannot refresh itself. Reconciliation swaps `provisional_local` for the new protected grant atomically with authoritative aliases; failure leaves only local private access.

Public-session-reference/capability issuance endpoints MUST resist replay and enumeration with high-entropy references, bounded attempts and rate limits across appropriate reference/device/network dimensions, generic non-enumerating errors, and security monitoring that does not log the raw reference, capability, grant, participant name, or protected sample identity. Repeated issuance of the same authorised participant continuity is idempotent or rotates under the replacement rule; it MUST NOT create unlimited identities/grants through retry. Error timing and response shape SHOULD be uniform enough not to reveal whether a guessed Session exists.

## 11. NFC boundary

All physical encoding follows `NDEF_PROTOCOL.md`.

- Standard NTAG stickers contain one Well-Known Text record with NDEF4 JSON.
- Smart Cups use the four-record protocol, but Smart Cup behavior is not required for Release 1 completion.
- NDEF contains session/sample resolution metadata only, never tasting or participant data.
- In blind sessions NDEF4 may retain the real coffee name/origin in `n` and processing method in `p`; `m=b` makes Cup App use the neutral pre-completion participant projection. Deliberate third-party raw inspection is outside the Release 1 threat model.
- Participant completion reveal changes durable local presentation state only. It never requires a tag rewrite and never adds completion, consent, share, result, credential, or tenant data to NDEF.
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
completeParticipantAndReveal(participant_id, expected_participant_revision) -> committed local projection
loadParticipantProjection(participant_id) -> neutral | revealed_after_completion
createShareOperation(participant_id, expected_participant_revision, consent) -> queued immutable snapshot
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
bootstrapProvisionalNfcJoin(ndef_metadata, physical_identifier, display_name, privacy_acceptance)
reconcileProvisionalJoin(public_session_ref, evidence, capability) -> authoritative aliases + scoped grant
issueParticipantGrant(validated_join_evidence, access_subject, privacy_acceptance) -> scoped grant
validateGrant(grant, audience, required_scope, authoritative_context) -> verified context | denied
refreshOrReplaceGrant(grant_or_renewed_join_proof) -> replacement grant | denied
revokeGrant(authoritative_scope, reason)
```

The interface supports offline-prepared artifacts. Grant expiry and every closure/archive grace are mandatory finite policy inputs rather than hard-coded durations. Issuance and use fail closed when any required policy, binding, integrity check, or current revocation state is unavailable.

### 12.3 CupResolver and NfcAdapter

```text
classify(read_result) -> tag classification
resolve(identifier, metadata, offline_package) -> assigned | unassigned | unknown | unsupported
stageAssignment(cup_id, sample_id, complete_payload) -> staged intent
advanceAssignmentWrite(intent_id) -> durable lifecycle state
recoverAssignmentIntent(intent_id, fresh_read) -> durable lifecycle state
encodeAssignment(assignment, ndef_allowlisted_sample, protocol_version) -> records
writeAndVerify(records) -> verified result | explicit failure
```

The domain passes only canonical NDEF-allowlisted data to encoding. That may include real `n`/`p` metadata in blind mode, but the adapter MUST NOT fetch results, participant data, credentials, tenant-only fields, or other protected metadata, and MUST NOT invent enum mappings.

### 12.4 ShareTransport and Ingestion

```text
sendShare(operation_id, immutable_envelope) -> durable acknowledgement | retryable error | permanent error
ingestShare(authorised_context, immutable_envelope) -> original/new durable acknowledgement
```

Transport uses the authenticated encrypted channel from section 9.3. Provider timeouts never imply failure or success; retrying the same operation obtains the original result.

### 12.5 Projection and Audit

```text
projectForHost(authorised_context, aggregate)
projectForParticipant(session_access, participant_completion_state)
projectForNfc(session, ndef_allowlisted_sample)
recordAudit(actor, action, target, minimized_before_after)
```

Projection functions use allowlists. Serializing a broad entity and deleting fields afterward is not conformant for blind or tenant-isolated data.

### 12.6 Protection and Erasure

```text
openProtectedLocalStore(platform_key_reference) -> encrypted store | unavailable
encryptAtRest(key_purpose, plaintext) -> versioned authenticated ciphertext
rotateKey(key_purpose, from_version, to_version) -> durable progress
revokeKey(key_purpose, key_version, reason)
requestParticipantAnonymisation(authorised_context, participant_id, policy_version) -> operation
requestSessionDeletion(authorised_context, session_id, policy_version) -> operation
propagateDeletion(deletion_operation_id) -> per-surface progress
applyDeletionManifestOnRestore(restore_id, manifest_version) -> verified result | blocked
```

Protection operations fail closed and never return plaintext or success after an integrity/key failure. Erasure operations derive tenant and target scope from verified authority, are idempotent by operation ID plus immutable scope, expose partial/uncontrolled outcomes, and cannot mark completion until every controlled surface has durable evidence.

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
- Normalize every legacy `session_uuid` and `cup_uuid` into separate candidate columns before adding uniqueness constraints. Keep the original bytes/text as migration evidence.
- Legacy Sessions that normalize to the same `public_session_ref` are never merged merely because the key matches. An exact duplicate may be linked only when all immutable/session-defining fields and content evidence agree; otherwise every conflicting Session is quarantined and the public reference is unavailable for join until resolved.
- Legacy Cup rows that normalize to the same `(organisation, identifier_kind, nfc_identifier)` are never resolved by row order or recency. Proven duplicate rows may map to one Cup only when their immutable identity evidence agrees; conflicting rows and their assignments remain preserved but non-resolvable pending review.
- Constraints are enabled only after the migration report shows no unresolved duplicate in the active/readable set. A later collision is rejected at write time and recorded; it never updates the existing row.
- Legacy `complete` state is preserved as provenance but does not prove account-free completion, consent, sharing, or portal ingestion.
- No legacy row is treated as shared without a separately evidenced explicit share action. Migrated responses default to private/local.

### 13.4 Security and privacy migration implications

- The migration backup, rollback database, checkpoints, mapping ledger, quarantine, and temporary copies MUST be encrypted before they contain sensitive data. Their keys use a purpose separate from the live database and their finite expiry/deletion follows the configured migration and backup policies.
- Migration from a plaintext legacy database provisions and proves the protected store and platform key first. Copy/transform, reconciliation, and read cutover are transactional or restartable; verification covers row/content evidence before success. Plaintext temporary artifacts are not created. The superseded plaintext store is made inaccessible and removed using the strongest platform-supported deletion semantics only after rollback approval, with the platform limitation recorded rather than claiming guaranteed physical erasure.
- Every imported record receives a policy classification. Production cutover and new production writes are blocked until required finite retention, participant-access, backup-expiry, audit-retention, deletion-processing, and revocation-propagation policy values are present and valid.
- Legacy data has no authoritative participant access grant. Migration MUST NOT synthesize grants, access subjects, capability proofs, expiry, or consent. Unknown legacy tokens are invalidated; a grant can be issued only through section 10.3 after current proof and privacy acceptance.
- The migration ledger records compact, non-content tombstones for existing participant-name anonymisation or Session deletion evidence. Restore/cutover applies the latest deletion manifest before any migrated projection is readable, so replaying a batch or legacy backup cannot resurrect deleted data.
- Quarantined and `needs_resolution` records remain encrypted and tenant-isolated and are subject to the same deletion/anonymisation propagation. Ambiguity is not authority to extend retention or bypass a deletion request.

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
| Current data has no participant-completion projection boundary, server-side blind response projection, or tenant boundary | Broad UI objects or API responses could expose coffee metadata early even though raw NDEF4 is an approved exception | Security implementation gap | Enforce completion-aware allowlisted app projections and service authorisation/filtering |
| Current local database and migration path do not evidence encrypted storage or platform-secured keys | Sensitive offline data may be readable outside the application boundary | Security implementation gap | Introduce and verify the section 9.3 protected-store migration before production capture |
| Current prototype has no service-issued participant grant, revocation state, or finite access-policy enforcement | NFC/session references could be mistaken for authorisation | Security implementation gap | Implement section 10.3 issuance/verification before service participant access |
| Current prototype has no idempotent deletion/anonymisation operation or cross-surface tombstone propagation | Retained projections, outbox data, exports, or restores could resurrect deleted data | Privacy implementation gap | Implement section 9.4 lifecycle and restore manifests before production retention claims |
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
9. `public_session_ref` normalization accepts case/surrounding ASCII whitespace only as specified, rejects every malformed/sentinel value, and enforces one global authoritative Session; generated collisions retry without overwrite.
10. Equivalent provider renderings of the same tag UID produce the same `tag-uid:<hex>` value; malformed identifiers and cross-kind lookalikes are rejected.
11. Legacy session/tag duplicates are either proven identical and explicitly aliased or quarantined; neither scan nor join resolves a quarantined duplicate.

### 15.2 Offline durability

12. Killing and restarting after an acknowledged edit restores the event and current projection.
13. Failure before transaction commit does not acknowledge or expose a partially saved edit.
14. Session creation, prepared join, scan resolution, capture, editing, completion, and local review work with network disabled.
15. On a fresh device in airplane mode, one valid supported NFC read atomically creates a provisional Session/Sample/Cup Assignment/participant/Response with the registry-pinned form version and opens only that cup.
16. Repeating the same cold scan before and after restart reuses every provisional mapping and creates no duplicate entity or Response.
17. Reconciliation of a matching authoritative package is idempotent, preserves all local event/response/share IDs and revisions, and enables the scoped service grant without uploading results.
18. Reconciliation mismatch, revoked/unknown session, identifier collision, or ambiguous form version preserves local observations, exposes a blocked/conflict state, and never guesses an authoritative mapping.
19. Unknown, unassigned, unsupported, and ambiguous scans never open a guessed sample.
20. Interrupted `sharing` state recovers without a new consent operation or duplicate snapshot.

### 15.3 Assignment write and recovery

21. Before activation, the last verified assignment remains active and a candidate-only payload never opens tasting on the host device.
22. Crash/restart tests at each boundary—before/after staging, persisting `writing`, physical write completion, persisting `written_unverified`, read-back, persisting verification, and activation commit—produce only the documented state and never report premature success.
23. Recovery with a tag matching the candidate verifies/activates exactly once; matching the prior payload retains the prior assignment; matching neither blocks readiness.
24. Retrying a staged or interrupted write reuses the candidate ID and intended payload hash and cannot create two active assignments.
25. Cancellation before write has no tag effect; cancellation after write cannot complete until the prior verified payload is restored and read-back verified, or the cup remains not ready.
26. Initial assignment with no last verified payload resolves `unassigned` through every pre-activation/failure state.

### 15.4 Sharing and conflict

27. No outbox item exists before explicit **Share results** consent.
28. Consent, all-Response aggregate cut, revision vector, exact canonical bytes/hash, Share Operation, and queued state commit atomically.
29. A concurrent edit to any Response is wholly before or after the snapshot transaction; the captured participant revision/vector and event sets never form a torn cut.
30. All retries reuse the Share Operation ID, exact stored canonical bytes, and snapshot hash.
31. Independent mobile and service implementations serialize the section 8.1.1 fixture to exactly the displayed bytes and SHA-256 digest; property vectors cover object-key order, response/event sorting, Unicode, timestamps, null/omitted fields, number formatting, and invalid values.
32. The service rejects a client hash that differs from its independently canonicalized/recomputed digest and rejects unsupported canonicalization versions.
33. Replaying the same operation/event returns the original acknowledgement and creates no duplicate result/event.
34. Identifier reuse with different content is rejected and preserved as a conflict.
35. Edits after sharing are not uploaded until another explicit share action.
36. Excluding a result changes aggregates but retains raw data and creates an Audit Event.

### 15.5 Blindness, privacy, and tenancy

37. Before this participant explicitly completes a blind Session, protected coffee metadata is absent from participant-facing UI/accessibility output, page titles, URLs, notifications, cached previews, ordinary diagnostics, analytics, and participant network responses. Encrypted local storage may retain real NDEF4 `n`/`p`, but only the neutral projection reaches those surfaces.
38. Blind NDEF4 may contain real coffee name/origin `n` and process `p` with `m=b`, but contains no result, note, participant data, completion/reveal state, share state, credential, access grant, tenant secret, or device secret. A third-party reader can inspect the allowed raw metadata and is outside the Release 1 threat model.
39. Explicit participant completion and `revealed_after_completion` commit atomically offline. Reveal immediately uses locally held metadata, survives restart and later permitted review/editing on that device, requires no host-global reveal/network refresh/reveal QR/tag rewrite, and creates no consent, outbox item, Share Operation, or upload.
40. A provisional-local record cannot call service APIs; a reconciled session-scoped participant grant cannot read or share another session.
41. Cross-organisation identifiers supplied by a client cannot escape server-side tenant scoping.
42. Free-text notes and protected sample identity never appear as analytics properties.

### 15.6 Protocol boundary

43. Notes, scores, participant data, and share state never enter NDEF.
44. Failed/interrupted writes remain visibly unverified and never report assignment success.
45. A production write or cold bootstrap for a form without one approved, unambiguous NDEF-to-form-version mapping is blocked.
46. Physical NFC behavior is verified only with recorded device, OS, tag, firmware where relevant, and scenario evidence.

### 15.7 Provisional authority and timestamp canonicalization

47. A cold bootstrap persists the exact provisional shapes from section 5.12: Organisation, Host, and assigner references are null/absent as specified, provenance is present, and no fabricated authority identifier exists.
48. Authoritative repositories, host/portal queries, aggregate/export paths, and readiness checks return no provisional entity; only a validated, atomic, idempotent alias/promotion transaction makes an authoritative graph available.
49. Independent implementations produce every accepted `cup-time-ms-v1` output and reject every invalid vector in section 8.1.1 exactly as specified; equivalent UTC/offset/fraction inputs normalize to the same 24-byte ASCII timestamp.
50. Independent mobile and service implementations hash the revised timestamp-bearing fixture to `95faf8ed77cc827f4840a918d9e410ac859c5cb26d1a4ccdf42788b1582d3187`; changing only an accepted equivalent input representation before normalization does not change the canonical bytes or digest.

### 15.8 Security, grants, erasure, and migration

51. Representative mobile database, offline-package, private-response, outbox, quarantine, export, and migration-copy files reveal no sensitive fixture without the correct protected key; credentials/grants cannot be recovered from the bulk store, general preferences, logs, analytics, crash reports, clipboard, or ordinary backup.
52. Representative service primary data, object/read-model data, queues, quarantine, exports, replicas, and backups are encrypted at rest, and captured mobile/service, portal/service, service-to-service, export, backup, key-management, and administrative traffic reveals no plaintext sensitive fixture.
53. An invalid certificate/peer, attempted plaintext or downgraded transport, unavailable secure store/key, failed unwrap, altered ciphertext, or failed integrity check denies the operation without plaintext fallback, stale decrypted display, ciphertext overwrite, or false save/share success.
54. Key-purpose and environment separation prevents a credential/export/backup key from decrypting primary data; rotation is restartable and idempotent, new writes use the current version, and a revoked key cannot protect new writes.
55. Production grant issuance rejects an absent policy, null/infinite/non-positive lifetime, already-expired result, or expiry beyond the configured Session/access boundary; every issued grant has a finite `expires_at` and policy version.
56. Tampering or using a wrong issuer, key/version, audience, tenant, Session, access subject, bound device, scope, time window, or request-specific Share Operation/hash is denied without protected data or resource-existence detail.
57. Expired or revoked grants and grants for a closed, archived, or deleted Session follow the mandatory access-state matrix on every read, share, reveal, refresh, reconciliation continuation, and deletion-related participant request; an unset matrix/duration denies access.
58. Refresh/replacement repeats current validation, produces a new random grant ID, and revokes/replaces the old grant within the finite overlap bound; an expired or revoked grant alone cannot refresh or extend itself.
59. Local post-completion reveal is participant/device-scoped and is not reversed by grant refresh/revocation or host Session closure/archive; Release 1 participant service responses remain blind-safe before and after completion. Tests preserve the limitation that already revealed offline metadata cannot be made secret again, while deletion/reset may remove it under policy.
60. Replayed authorised issuance is idempotent or rotates under the replacement rule; bounded/rate-limited guessing receives generic non-enumerating responses, and raw references, capabilities, grants, names, or protected identities never enter security logs.
61. Participant display-name anonymisation removes the name from all controlled primary, raw, projection, cache, queue, quarantine, export, replica, migration, and applicable synchronized local surfaces while preserving response semantics and only the minimized audit/tombstone fields from section 9.4.
62. Session deletion propagates to every controlled surface, revokes grants/download links, and creates a compact tombstone that rejects a late queued/replayed share and prevents read-model, migration, or backup restore from resurrecting content.
63. An unreachable participant device, externally downloaded export, or other uncontrolled surface yields an explicit `partially_blocked` limitation rather than false completion; later authenticated synchronization applies the applicable tombstone without claiming authority over never-shared private local results.
64. A restore applies current deletion manifests before serving any query; quarantined data and backups expire or become cryptographically unreadable under finite policy and cannot bypass an authorised deletion through replay.
65. Retrying one deletion operation with the same immutable scope is idempotent; reuse with altered tenant/target scope is rejected, and completion evidence/audit contains no deleted payload, display name, note, protected identity, or grant.
66. Migration cannot cut over while protected storage or any mandatory finite policy is unavailable, does not synthesize legacy grants/consent, and leaves no newly created plaintext backup, checkpoint, quarantine, rollback, or temporary artifact.

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
5. Completion-aware blind participant projections and session/tenant authorisation, reviewed for security/privacy.
6. Explicit Share Operation/outbox and idempotent ingestion.
7. Portal read models, exclusions/audit, history, and exports.

Form-specific implementation can proceed only with approved form definitions. Production NDEF coverage for all four forms remains gated by FR-028B.

## 17. Incremental UI consumption

This contract does not redesign UI. Existing Home and Cupping screens can adopt it incrementally:

- Home reads a Session projection and explicit Cup resolution state instead of inferring product state from legacy rows.
- Cupping reads one session-level form/version and identity mode, a participant-safe Sample projection, and a Response projection.
- Existing save controls call the transactional event boundary and show saved only after durable acknowledgement.
- Existing completion controls atomically set local completion and, for a blind Session, permanently reveal locally held coffee metadata for that participant/device; a separate **Share results** action creates consent and the outbox item.
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
- completion-aware blind projection and tenant/session authorisation tests at UI/accessibility/cache/diagnostic and serialization/API boundaries, including the explicit raw-NDEF exception;
- NDEF serializer/parser conformance tests and real-device evidence where physical behavior is claimed;
- review by an independent architecture reviewer and security/privacy reviewer;
- explicit limitations for policy parameters and FR-028B.

Passing a JavaScript bundle, simulation, or mocked NFC payload alone does not prove local durability, native NFC behavior, offline readiness, blind isolation, or pilot readiness.
