# Cup reassignment — bounded implementation design

## R1-147 implementation checkpoint (supersedes NEW clear-first operations)

PM/reviewer checkpoint, 26 October 2026. New purpose-specific module
`directCupReassignmentStore.js` and codec `directCupReassignmentCodec.js`; legacy
clear store/rows/JSON retain their exact meaning. Two additional tables:
`local_pending_direct_reassignments` (destination PK/FK cascade, unique operation,
actor/incarnation, unique UID, format1, phase consented/write_check/write_verified,
canonical content/hash) and `local_direct_reassignment_receipts` (operation PK,
actor/destination/incarnation/UID, unique UID+direct_generation, old composite/
binding hash, new sample/code/attempt, format1, canonical receipt/hash; no FK).
Exact marker3/user_version7/static reviewed manifest. Fresh initializes v3;
recognized v1→v2→v3 and v2→v3 run under one outer exclusive transaction, validating
each bundled source and final target before marker commit. Legacy business,
pending-operation and receipt rows and the profile remain unchanged; schema
markers/user_version intentionally advance. Partial/unknown stores reject unchanged.
V2 binaries reject v3 rather than downgrade. No import/reset.

Direct pending canonical keys:
`version,purpose,revision,destinationId,operationId,actor,incarnation,setupHash,
removalGeneration,bindingVector,original,oldBindingHash,eligibility,sourceToken,
consentVersion,drawerDraft,attempt,priorAttempts,verification`.
Purpose is direct; original is strict UID/kind/state/settings/typed metadata only,
never clear bytes. Consent phase has null attempt/verification. Attempt binds
secure attemptId and issued code, exact candidate/save-input, typed new payload,
wire JSON/UTF8 proof, complete intended NDEF bytes/hash and tag context. Persist
write_check before native dispatch; it conservatively means dispatch may have
happened even if capacity/transport later rejects. Prior attempts retain bounded
secure attempt IDs/codes and exact metadata/message hashes, validated against
issuer records; they are not new members or free-code capacity. Every transition
has monotonic revision and required expectedRevision; beforeWrite revalidates
without silently advancing the returned revision. Write_verified holds separate
read hash/time and exact attempt/message proof. Wrong-UID observations do not
revoke target proof; same-UID contradiction revokes via captured revision/hash CAS.

Direct receipt binds purpose/version, root/attempt IDs, actor/destination/issuer,
setup/removal context, verified revision, UID/family/settings, old composite and
metadata/binding hashes (not old coffee data), new sample/code/payload/message
hashes, eligibility/consent, verification hash/time, direct generation and causal
prior retirement vector. No cleared=true/clear proof. Keep old legacy counters
unchanged. Combined vector hashes validated legacy receipt IDs/hashes and direct
receipt IDs/hashes for that UID. Each direct receipt records the exact prefix
of legacy operation IDs existing before it plus previous direct generations;
validate prefix/subset/monotonic chain. Thus legacy replay is stale if a later
direct receipt causally includes that legacy operation, without timestamps or
reinterpretation of immutable legacy generation. New direct intent compares the
entire current vector. All retired-binding and pending-UID guards consult both
purposes; a newer binding is never suppressed by UID alone.

Proposed public APIs (all current predicates, read captures before first await):
- inspectDirectCupReassignment({destinationId,readResult,isCurrent}) → neutral
  prompt/opaque observation; no staging/code/write.
- stageDirectCupReassignment({observation,consentVersion,drawerDraft,isCurrent})
  → consented safe DTO. Cancel permitted only before any attempt dispatch.
- getDirectCupReassignment({destinationId,isCurrent}) → validated safe DTO/null;
  absent read retains R145 unrelated recovery behavior, never setup authority.
- prepareDirectCupReassignmentWrite({destinationId,operationId,expectedRevision,
  readResult,drawerDraft,isCurrent}) → staged fresh-code attempt, exact ordinary
  assignment records/metadataOnly plus beforeWrite and safe pending DTO.
- inspectDirectCupReassignmentWrite({destinationId,operationId,expectedRevision,
  readResult,isCurrent}) → exact separate comparison/proof; rejected transport
  cannot call it or promote proof. Read-only recovery never allocates.
- commitDirectCupReassignment({destinationId,operationId,expectedRevision,isCurrent})
  → private exclusive transaction rechecks all current context, issuer/code/wire
  proof and verified attempt; atomically INSERT exact member/standard code outcome/
  direct retirement receipt, UPDATE destination count/form lock/aggregate if
  existing, DELETE direct journal. No public addition-commit then receipt gap.
Replay/final ack requires same actor/issuer/member/outcome/receipt/vector and
  cannot resurrect removed membership or falsely acknowledge later setup.
- cancelDirectCupReassignment and the existing observePendingCupReassignmentRead
  dispatch by explicit purpose. All scan entrypoints keep their existing observer;
  no native/database import inside generic NFC transport.

Details uses NEW direct inspector/stager after assigned-cup detection; legacy
clear recovery APIs/modes stay separate. Consent restores drawer with explicit
SCAN & WRITE CUP; fresh second scan writes once via unchanged readAndWriteNdefMinimal,
then existing CheckSampleScreen displays separate verification/read-retry or
save-only. Explicit rewrite is allowed only for validated original/own attempt,
never arbitrary changed payload. Pending UID cannot move to another cup. Existing
normal addition A-to-B and same-destination abandoned retry remain unchanged.
Three scans on happy path, no hidden clear or automatic radio on recovery.

Implementation refinement: receipt also stores exact postSetupHash and original
savedSampleCount. Both replay and the second acknowledgment transaction validate
these plus the live issued-code/standard-outcome/member linkage and entire causal
vector. A lost acknowledgment does not imply rollback of an already committed
member. Changed editable drawer fields block old frozen-name commit and require
explicit same-cup fresh-code rewrite, even if the previous attempt was separately
verified. Drawer Close immediately revokes held dispatch callbacks; safe idle
consent can be canceled, while any possibly dispatched attempt is retained.

Exact emitted Smart state is intentional READY1, telemetry empty, validated
settings preserved. First dispatch requires still-original observed state/settings;
own-attempt rewrite requires READY and exact settings (no firmware-state rewind).
No new native API or retry behavior. Existing closed/unknown eligibility policy,
warning risk, privacy rules and low-level diagnostic-write limit remain.

25 October 2026. DESIGN ONLY; not authorization to edit runtime or write tags.
Builds on the owner's approved R1-142 decisions. No new product feature beyond
safe physical reuse. Working app/main remain unchanged.

## 1. Invariants

- Destination: saved, current-actor creator-owned, supported unlocked DRAFT with
  intact issuer ledger and no started history or conflicting pending operation.
- Strict supported metadata only. No numeric-tag conversion, arbitrary erase,
  repair, battery-test extension support, post-lock setup editing or uploads.
- Known locally active physical assignment blocks reuse. Qualified creator-local
  COMPLETE is an eligibility rule, not global closure. Participant COMPLETE is
  not a creator release. Unknown/foreign/deleted source requires approved explicit
  interruption warning. No source ownership is inferred from a scan.
- Physical UID plus old composite `(session reference, sample code)` and exact
  typed metadata identify the observed assignment; telemetry UUID is not UID.
- Clear → separate check → explicit new write → separate check. Neither native
  success callback creates a destination sample. Clearing reserves no sample code.
- Preserve old results, history and codes. Retire the OLD physical binding only;
  never delete/reopen the old tasting or mistake its historic UID for a live claim.
- Same operation transport retries use frozen bytes; each explicit new assignment
  or re-write uses a fresh spent destination code under existing ledger rules.
- No radio action from app load, receipt replay, navigation or background recovery.

## 2. Minimal persistence addition

Do not force foreign clearing into `local_pending_draft_removals`: it requires
owned source membership and deletes a source sample. Add a dedicated transaction-
only `pendingCupReassignmentStore.js`, no radio/profile/DB-opening side effects.
Proposed two tables (exact SQL/fingerprint are reviewed implementation artifacts):

`local_pending_cup_reassignments`

| Column | Constraint / meaning |
| --- | --- |
| destination_session_id | PRIMARY KEY; FK sessions(id) ON DELETE CASCADE |
| operation_id | secure UUID, NOT NULL UNIQUE |
| actor_id | captured valid local profile UUID, NOT NULL |
| destination_incarnation | existing issuer incarnation UUID, NOT NULL |
| cup_uuid | normalized hardware UID, NOT NULL UNIQUE |
| format_version | integer, CHECK=1 |
| phase | CHECK IN ('staged','clear_check','clear_verified') |
| content_json | canonical immutable context plus phase evidence, bounded size |
| content_hash | SHA256 canonical content, decoded/validated before use |

Context: operation/session/actor/incarnation mirrors row; destination setup hash;
original strict `readRemovalTag` context (UID, family, state/settings, old metadata);
exact `freezeClear` bytes/hash; old binding hash; permission category
`known_creator_complete` or `unknown_override`; acknowledged warning version;
known source identity/incarnation/current completion+coverage fingerprint when
present; observed physical-binding generation; editable drawer draft snapshot;
clear-verification evidence/null. Do not persist route flags as authority.
Old protected metadata retained only in the existing local-store trust boundary
to verify the frozen write; never exposed through public DTOs/logs.

`local_cup_reassignment_receipts`

| Column | Constraint / meaning |
| --- | --- |
| operation_id | PRIMARY KEY secure UUID |
| actor_id | valid captured profile UUID |
| destination_session_id, destination_incarnation | immutable origin references, no cascading FK |
| cup_uuid, binding_generation | NOT NULL; UNIQUE(cup_uuid,binding_generation), positive integer |
| old_session_reference, old_sample_code | validated supported old composite identity |
| old_binding_hash | hash of UID/family/full old canonical metadata |
| format_version | integer, CHECK=1 |
| receipt_json, receipt_hash | canonical minimal receipt and SHA256 |

Receipt contains clear bytes/hash, settings hash, read-back hash, ISO timestamp,
same-cup proof and immutable consent/source eligibility category; no old coffee
name/process or raw telemetry. It is a local consistency receipt, not proof of
remote completion/ownership or a cryptographic hardware credential. Preserve
optional-settings presence in the frozen evidence. Receipt persists beyond source
or destination session deletion, so stale old bindings cannot revive; no profile
data beyond actor UUID. Never show its protected context in error/UI/log output.

Generation = highest validated prior reassignment receipt for UID +1, calculated
inside exclusive transaction; first=1. Validate sequence, uniqueness, canonical
hashes and existing pending/removal constraints; malformed evidence fails closed.
Independent existing DRAFT-removal generations retain their own meaning; never
substitute them for this generation. A combined fence captures BOTH mechanisms.

Pending uniqueness alone does not span other tables: every relevant command
must transactionally check pending additions/removals/reassignments by destination
AND physical UID before it stages/dispatches/commits. Reuse existing transaction
serialization, no second JS-only lock as authority.

## 3. Operation lifecycle / exact repository boundary

New functions in sessionRepository, with internal DB helpers rather than nested
public repository transactions. UI never supplies eligibility decisions.

| Command | Preconditions and durable effect |
| --- | --- |
| inspectCupReassignment({destinationId,readResult,isCurrent}) | Read-only strict decode, creator/setup/conflict/completion checks; return neutral prompt DTO plus immutable in-memory observation token. No code allocation or staging. |
| stageCupReassignment({observation,consentVersion,drawerDraft,isCurrent}) | Exclusive transaction rechecks actor/incarnation/setup/source completion/binding generation; create staged journal. Duplicate exact operation returns same intent; changed observation requires new prompt. No write. |
| beginCupReassignmentClear({destinationId,operationId,readResult,isCurrent}) | Fresh same-cup scan; require exact original assignment/state/settings, fresh eligible source, native status/capacity checked by adapter. Persist clear_check BEFORE dispatch, return frozen bytes + bounded beforeWrite fence. |
| inspectCupReassignmentClear({destinationId,operationId,readResult,isCurrent}) | In clear_check, compare strict UID/family, empty metadata, preserved settings and valid evolved state using existing clear codec. Persist clear_verified only for matching separate scan; no source/destination member changes. |
| commitCupReassignmentClear({destinationId,operationId,isCurrent}) | Atomically append unique minimal receipt, retire old physical binding via that receipt, delete pending row. Replay exact committed receipt read-only; must not revive deleted destination or authorize another write. |
| getCupReassignment({destinationId}) | Validated current-actor recovery DTO (phase, safe action text, restored drawer); never automatically dispatch. |
| observePendingCupReassignmentRead(readResult,{isReadCurrent}) | Shared observation-only guard on every existing scan entry point before classification/routing or throwing: for a pending clear_verified operation on this hardware UID, a contradictory/malformed same-UID read durably revokes verification to clear_check. Check actor/incarnation/operation/generations/current predicate transactionally; no promotion or radio write. |
| cancelStagedCupReassignment({destinationId,operationId,isCurrent}) | Delete staged-only intent before dispatch. clear_check uncertainty cannot be dismissed as physically undone. |

All mutation/readback acknowledgements recheck captured actor, issuer incarnation,
operation ID, setup hash and binding/removal generations; stale route/epoch never
opens a dialog or form. Actor/context changes during transaction roll back or
deny acknowledgement without lying about a committed physical/local effect.
Do not call profile initialization to manufacture the original actor.

`clear_check` means "dispatch may have happened", even if the write throws or
the app closes before it. Native callback success is not another state/proof.
Transport clear-write uncertainty never triggers automatic retry. Resume first
with a separate read: cleared→verify; exact original→offer explicit clear retry;
third-party assignment/changed settings/state→block, never overwrite it.

Saved verified proof is not valid forever: if the same UID is observed with
changed assignment/settings, unsupported or malformed contents before receipt
commit, clear its verification and return to clear_check DURABLY before the
caller returns/errors. Valid firmware-evolved state with empty metadata and
unchanged supported settings is not a contradiction. Wrong-UID reads do not
revoke the target. Unrelated scans never auto-verify/promote it. Observation
after delete/recreate, account change or stale operation must not mutate a new
operation. Receipt commit compares the current phase/proof and CAS identity in
its transaction, so a Save-only retry cannot commit known-invalidated evidence.
Existing Home/Details/assignment/removal scan entrypoints all call this observer;
otherwise a successful clear-check followed by a changed-tag read would leave
a stale proof incorrectly usable after local commit failure.

After receipt commit, reuse ordinary `stagePendingSampleAddition` only following
an explicit SCAN & ADD CUP action with a fresh actual read. The read must show
currently blank supported contents. Receipt is NOT permission to overwrite
whatever is there now. New details may be edited; do not replay the pre-clear
coffee name. Allocate fresh code and use existing addition/check/commit logic.
No cross-phase automatic write, no additional sample-code allocation on clear,
verification, receipt commit or saved acknowledgement replay.

## 4. Retiring a physical binding without changing old results

Current `findPendingSessionByCupUUID` checks raw status only, which is not the
qualified completion projection. Replace its use for this flow with one trusted
conflict inspection that validates stored source creator/participant role, exact
old metadata binding and current completion/coverage inside the same transaction.
Retain ordinary known-active denial; never globally remove UID conflict checks.

When a verified clear receipt matches the OLD exact UID/composite/metadata hash,
that historic assignment is superseded for physical lookup only. Old session
member remains reviewable/scored with its code; completion/history unchanged.
`findActiveSampleByCupUUID`, metadata import/resolve, write guards and delayed old
addition/activation callbacks must not fall back to that retired binding. A scan
carrying retired old metadata is a conflict, not a way to reactivate old results.
The current integrated `findActiveSampleByCupUUID` already returns null before
legacy query code: retain that no-UID-guess behavior, do not revive the dead query
or invent a replacement UID-only lookup merely to implement reassignment.
New assignment has fresh destination composite/code and ordinary active proof.
Unrelated old result edits/review remain possible by their local session/sample
IDs; physical supersession must not become tasting removal or score deletion.

Receipts never suppress a distinct newer/unknown binding on the same UID. Known
source changed or reopened before CLEAR dispatch: invalidate prompt/staging;
after a possible clear dispatch, retain recovery and require read-back instead
of rejecting recovery merely because its historic source later changed. Exact
new known-active conflicts still prevent any further dispatch. Local receipt
cannot prevent another phone acting offline; approved interruption warning stands.

## 5. UI / recovery map (reuse existing controls)

| Situation | What user sees / action |
| --- | --- |
| Initial assigned-cup read | Approved Reassign Cup? warning, no prior identity shown; Cancel/close keeps editable drawer and does not stage. |
| Confirmed, not dispatched | Filled drawer; explicit Scan cup to clear action; cancel may discard staged intent. |
| Successful/uncertain clear dispatch | Existing-style Check Cup dialog, copy clearly says checking removal; close returns drawer with Resume cup check. |
| Read shows exact original still assigned | Explicit Retry clear action, same operation/frozen bytes if context still exact; no auto-write. |
| Wrong cup or changed foreign assignment | Safe mismatch message; original pending intent retained, no write and no sample changes. |
| Clear verified but receipt commit fails | Save/retry receipt only, no new NFC write; no destination sample yet. |
| Clear receipt committed | Filled editable drawer, explicit SCAN & ADD CUP; new physical scan required before new write. |
| App restart | Restore existing drawer snapshot plus pending phase; no automatic scanner/write/Lock. |
| New assignment write/check | Existing editable drawer, Check Cup / Re-write behaviour, fresh codes, addition only after verification. |

Keep the existing source-removal and reassignment dialog modes distinct even if
they share a visual component. Use existing typography/buttons/warning tokens;
no redesigned footer. All async close/action handlers bind operation/epoch.
Destination Save/Lock, competing additions/removals and scan-to-taste stay blocked
while hazardous pending clear exists. Before verified clear, switching cups is
not the ordinary addition A-to-B retry; after receipt commit normal addition
policy applies. No hidden writes when changing drawer fields or choosing Cancel.

Whole destination-session deletion remains explicit local deletion: cancel/fence
its pending work transactionally, cascade its journal, no cup write and no claim
that a possibly cleared cup was restored. A late result must not insert a new
receipt/member or recreate a deleted same-ID session. Existing verified receipts
remain as immutable retired-binding evidence, not creator ownership. Switching
account neither adopts the pending intent nor clears physical uncertainty.

## 6. Versioned schema rollout — no silent reset

Current integrated bootstrap accepts ONLY the exact reviewed 42-object manifest,
marker1 and user_version5. Adding tables without a schema rollout would rightly
fail reopening. Do not loosen the fingerprint or point to an old experiment DB.

Proposed bounded upgrade in SAME cup_sessions_v1.db: schema marker2,
user_version6, exact static v2 manifest. For existing EXACT recognized v1 only,
one exclusive transaction creates the two tables/indexes and replaces marker
DDL/version as necessary; validate full target schema then commit. All existing
rows/profile/pins/history/ledgers/pending work preserved. Failure rolls back
schema and markers; empty DB initializes exact v2 directly. Any partial,
unrecognized, malformed or experimental schema still fails without reset/import.
Read current source manifest BEFORE migration, not accept a hash read from the
device as expected truth. Keep prior marker/table/foundation evidence validated.

Downgrade limitation: current v1 binary/candidate will reject upgraded store.
No promise of in-place old-code rollback. Preserve named pre-upgrade code and
use synthetic migration tests before phone approval; do not copy or clear real
phone databases in this design task. Approval must explicitly include this
non-destructive schema upgrade before implementation/device use.

## 7. Assigned implementation scope, after approval only

Expected owned runtime files: new pendingCupReassignmentStore.js;
sessionRepository.js (journal/receipt/retired-binding/conflict/guard integration);
integratedSessionSchema.js and localDatabase.js (exact versioned upgrade);
CuppingSessionDetailsScreen.js and its existing Add/Check components (mode,
confirmation/recovery); nfcServiceMinimal.js ONLY a dedicated bounded clear
dispatcher using reviewed codec if existing removal dispatcher preconditions
cannot serve this operation. Keep existing raw clear encoder unchanged unless
review proves an adapter-interface change necessary. AppNavigator.js requires
the shared current-UID observation guard before existing scan classification/
routing; all other scan callbacks use the same observer. No navigation redesign.
Resolve exact shared interfaces and task ownership before authors edit them.

Canonical updates limited to approved reassignment exception, journal/schema
and recovery contracts. No CHANGELOG edit by implementation author. Main release,
real uploads, old numeric migration, participant-global lifecycle and firmware
changes remain excluded. Both NTAG and standard Smart Cup must use same safety
semantics; both supported forms retain exact pins/calculation rules.

## 8. Validation and handoff

Actual SQLite: exact v1→v2 migration, fresh v2/reopen, concurrent startup,
malformed/partial rejection, injected migration rollback, intact existing
results/ledgers/operations/profile, no old-store access; exact replay/actor/ABA/
deletion/generation conflicts; known COMPLETE/active/participant/unknown eligibility;
retired-old-UID denies resurrection without blocking unrelated/new bindings.

Actual callbacks/native adapters: Cancel/no dispatch; stage/beforeWrite failure;
same-UID foreign mutation; exact NTAG/Smart clear bytes/state/settings; no automatic
retry on uncertainty; separate read proof; failed local receipt commit retry;
restart/close phase restoration; explicit fresh-code new write and final check;
late callback after delete/account/route/source change; immutable old scores/notes;
same-UID contradiction after verified clear/failed commit revokes durable proof
across every scan entrypoint; wrong UID/stale observation cannot revoke another
operation and unrelated scans cannot auto-promote;
no protected metadata/UID logging or accessibility leakage in confirmations.

Retain existing Quick, assignment/retry/A-to-B, DRAFT physical removal, activation,
completion/reopen/Blind, participant parity and code exhaustion regressions.
Independent non-author architecture/security/QA and UI review before phone gate.
Phone gate only after software evidence: one spare already-written NTAG then one
standard Smart Cup, correct clear/check/write/check sequence, preserve settings/
state and old history, exactly one new sample. No tests here establish hardware
conformance; no main merge without explicit owner approval.

Next authorization sought: implement this bounded design in the isolated
candidate, including exact recognized-v1→v2 upgrade, test it automatically and
independently review before asking owner to scan anything. This document alone
authorizes none of those runtime changes.
