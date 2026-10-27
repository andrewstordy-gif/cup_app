# Local-workflow integration audit — R1-149 baseline / R1-157 refresh

## Current disposition — 27 October 2026 (R1-157)

This section supersedes the dated R1-149 integration disposition below. Refresh
the existing **draft PR21 only; no main merge, release or pilot approval**. The
working app, running candidate8097, phone data and Metro process are unchanged
by this audit. [R1-157 task](tasks/R1-157.md) records publication and final gates.

### Current source and scope

- Verified remote/working main: `34f95a8119574557e5e67cc5246888a9d1c089c4`.
- Prior draft PR21 head: `b946032b7c73d83de20e235b1398e8867cd96077`.
- Owner-tested running candidate: `0e130ee5168f7fc4ff5262c210f8bfb470ad8f87`.
- Exact clean audit/test commit: `f1628134616052a4c2ec0552a2f325e92890aa04`.
- Exact **src tree**, not a commit: `07bfbbf195ff2ee3340d23af9376a92169c1917e`.
  Candidate, R156 freeze and audit have identical source/scripts/normal entry.
  Main and prior PR head are ancestors; no conflict resolution or runtime edit
  was needed. Subsequent refresh edits are audit/changelog/task documentation only.

At this freeze:279 changed paths against main (87docs/109scripts/68src/10review/
5root), versus prior PR262. Since prior PR there are36 changed paths before this
refresh's report/changelog edits:8runtime/13scripts/15docs;17 newly added paths.
The original R137 inventory and R149 counts below are historical, not current.
R150's parked test-only branch is **not** included. App.js/package/lockfiles/
configuration/native projects remain identical to main. Services, navigation,
strict current validators/classifier, removal codec and profile have no delta
since prior PR. No database, bundle, dependencies or private artifact is tracked.

All previously reviewed local workflow remains included: both supported forms,
1,296 codes/session, separate NFC verification, Save/Lock, creator/participant
grey-card tasting/removal/completion/editing, Blind projections, verified Quick,
physical DRAFT removal, and disconnected upload UI. This is an accumulated
dependency/workflow integration, not merely a latest-button PR.

Latest reviewed runtime commits are R151 `6de11bf`, R152 `d4bc56e`, R154
`b7b7293`, R155 `a3f49a8` and R156 `f8ff82b`, with canonical/task and independent
handoffs. R153 diagnosed without runtime changes. Their bounded additions:

- R151 accepts bounded opaque OLD coffee assignment Text only for explicit Add/
  reassignment consent. Protected envelope/UID/Smart records remain validated;
  new output and separate check stay strictly canonical. No old membership,
  identity, conversion, import or generic repair is inferred.
- R152 restores explicit mode/count; R153/R154 isolated a preflight binding
  rejection. The temporary R154 fixed-label, nonthrowing development-only probe
  remains included; no identifiers/coffee/raw errors are logged. Removing it is
  later cleanup, not newly connected telemetry.
- R155 explicit unverified drawer restart abandons only that unfinished journal,
  retains details and spent codes, then freshly inspects the selected cup. New
  assigned targets require fresh warning/consent; consented write/check stays
  same-cup bound. Old callbacks cannot revive the abandoned root. This cannot
  recall an already dispatched physical write or clear the abandoned cup.
- R156 corrects both actual-render permission gates. Ordinary setup remains
  blocked during pending intent; only the successful explicit restart invocation
  continues past its captured false ordinary permission. The prior optimistic
  test fixture is replaced with source-derived ownership/form/readiness and
  captured-render regressions, including existing DRAFT samples.

### Current data handling and rollback

Same `cup_sessions_v1.db` and main `cup_app:user_profile`; no old namespace import,
reset, profile replacement, uninstall or unrelated storage/file deletion. Current
integrated **v4/marker4/user_version8/foundation1**,46-object target SHA256:
`8c58bba307f397a5352ccc1cd95f0d3adab19c5f4df8262158fca613ba2077b8`.
Exact recognized v1/5, v2/6 and v3/7 upgrade in one outer exclusive transaction.
Only two direct tables are rebuilt; original values/JSON/hashes/causal vectors
retain their meaning, and old receipt rows gain a NULL new hash column. Old
direct format1 and legacy clear recovery remain operational, not reinterpreted.
Malformed/partial/weakened stores fail closed without repair. Old binaries reject
v4; there is no automatic downgrade/reset. Reverting app source cannot undo cup
writes. Do not use the old numeric client on new string-code assignments.

### Current exact software evidence

- Full standalone matrix at clean f162813: **103 run / 75 PASS / 28 FAIL /
  zero timeouts**. All74 prior R155 passes retained; new R156 permission check
  passes. The28 failed names **and normalized primary errors** match R149 and
  R155. Matching names/errors are not a waiver or evidence every old tail ran.
  The historical failure table below still applies; current-equivalent evidence
  is separate. Command: `/usr/local/bin/node /private/tmp/r1-146-matrix-runner.cjs /private/tmp/cup-r1-144-reassignment /private/tmp/r1-157-final-f162813-matrix`.
  Report: `/private/tmp/r1-157-final-f162813-matrix/report.json`.
- **27 distinct current-equivalent supplemental suites passed**, not one
  uninterrupted27-green run: first16 passed, then SQLite could not open a test
  DB and the runner hit ENOSPC writing a log on the nearly full internal disk.
  Original failures/evidence are retained. The failed/unreported/unrun11 passed
  unchanged with temporary DBs/reports redirected to external disk. Nothing was
  deleted/moved and no runtime/validator/test assertion was loosened.
  Initial report `/private/tmp/r1-157-final-f162813-independent/report.json`;
  preserved interruption `/Volumes/external/cup-r1-157-scratch.LHhsK3/initial-enospc-evidence/`;
  remaining report `/Volumes/external/cup-r1-157-scratch.LHhsK3/final-remaining-f162813/report.json`.
  Every inherited failure's bounded passing evidence is mapped in
  `/Volumes/external/cup-r1-157-scratch.LHhsK3/r157-inherited-dispositions.json`.
- Current supplemental coverage: exact rational CVA scoring/UI counts1–8,
  atomic response/pin failures, real distinct-actor participant/Blind lifecycle,
  controlled all-state deletion, Save/Leave/Stay and identifier collisions;
  v1/v2/v3→v4 exact preservation/manifest/fault rollback/operational recovery;
  opaque envelope/native/conflict/mixed-format causal chain, stale intent/issuer
  ABA and source-derived captured-render permission; read-only Check recovery,
  verified Quick command/navigation and held/duplicate modal races. These are
  bounded current scenarios, not all historical tails or all P0 requirements.
- Independent nonauthor combined-source review PASS at f162813: all8 runtime
  delta files examined in context, six selected checks independently passed;
  architecture/data/security/privacy/NFC/recovery/UX, no unresolved HIGH/CRITICAL
  or mandatory finding. This is a bounded delta review plus the distinct R149
  historical full-stack evidence, not an exhaustive new full-stack proof.
- Normal-entry iOS export PASS at f162813,768 modules,3326770-byte Hermes bundle
  `AppEntry-34afa80e6847590cce0850d0b120efe8.hbc`, SHA256
  `c74f358febd9a965a255d51b66191cadfb18b65157a369cbee5e9c9ea498eb9f`.
  Command: `PATH="/usr/local/bin:$PATH" /usr/local/bin/node node_modules/expo/bin/cli export --platform ios --output-dir /private/tmp/r1-157-ios-f162813`.
  This is this export's hash, not a byte-identical claim about earlier bundles.
  Source/scripts remain identical to the phone candidate. Export is not native
  installation or physical NFC certification.

### Latest owner phone acceptance — NFC sticker tags

Owner explicitly confirmed these latest checks used **NFC sticker tags**:

1. Corrected SCAN & ADD CUP starts scanning; separate verification adds one
   fresh-code sample exactly once; destination remains DRAFT.
2. For a second addition, close Check before verification: details and explicit
   mode restored, only first sample listed, no automatic scan/write.
3. Change name and restart with another tag: exactly two samples; first unchanged,
   new name/fresh code on the verified second sample; still DRAFT.
4. Reopen: exactly two names/codes retained, no abandoned-attempt sample, DRAFT.

These are owner-reported physical acceptance against the unchanged8097 candidate,
not agent-performed NFC operations. Phone/iOS/tag model unspecified. Earlier
Smart Cup reassignment/Quick reports remain valid only for their earlier source
and scenarios; latest Smart restart/firmware conformance is not established by
the sticker test or synthetic both-family coverage. Abandoned tags may retain
unverified assignments; never claim clearing or recall from local abandonment.

### Remaining boundaries and merge controls

All original deferred production/service/upload/accessibility/platform/crash-
draft/manual-fallback limitations below remain. No upload behavior or pilot
readiness is connected/claimed. Inherited fixture/reference failures remain test
debt with bounded disposition, not blanket P0 waivers. Main protection rechecked:
enforce_admins true, no force/deletion, zero required approvals and no required
status checks; process gates remain necessary. Nine historical cosmetic EOF
warnings remain untouched. No unrelated source cleanup is included.

Publish only an independently reviewed fast-forward of existing draft PR21;
no force push, main change or auto-merge. Before any later merge: explicit owner
approval of exact head/scope/limits, applicable physical gate disposition, fresh
remote main/head check and required prospective/post-merge validation. This
audit/PR refresh does not authorize that later merge. Final publication/readback
is recorded in R1-157; the running phone candidate stays0e130ee.

---

## Historical R1-149 record — 26 October 2026 (preserved)

26 October 2026. Audit complete for draft PR preparation, not merge approval or
pilot release. Source/review and software evidence are qualified below.

## Exact prospective integration

- Verified GitHub main and untouched working main:
  `34f95a8119574557e5e67cc5246888a9d1c089c4`.
- Running phone candidate: `1caea3ae41944bfd7c6750eb854f7fa767197de3`.
- Frozen audit/test commit: `03f3cc5ae7a24a5b4a17b35b58b2ac2fc6d7a156` on
  `codex/r1-149-integration-audit`. It adds only the R1-149 task to that candidate.
- Main is already an ancestor. No merge-conflict resolution or runtime change
  was needed for this prospective integrated tree. R1-149 changes documentation
  only; running candidate files, Metro 8097 and phone data are untouched.
- Exact `src` tree at candidate and audit source:
  `0af474fb78166d6cafc9912908d4e002f4e6786b`.

## Scope and provenance

The candidate is the accumulated reviewed local workflow, not merely the latest
button change. At the frozen audit commit there are 260 changed paths against
main: 79 docs (including this task, before this report), 101 checks/helpers,
66 runtime/form-definition paths, 10 review fixtures and four root reference/docs
paths. The earlier [R1-137 inventory](R1_137_INTEGRATION_INVENTORY.md) accounts for
213 original paths; restoring package.json removes one net path, and later tasks
add 48. R1-149 audit documents/changelog subsequently add documentation paths.
Commit history preserves the implementation and independent task handoffs.

Original forms/source assembly is traced by R1-060 and
SESSION_IMPLEMENTATION_BASELINE_AUDIT; R1-061/063–069 supply local state/form
dependencies; R1-080–135 supply the phone-reviewed workflow; R1-137/138 supply
normal-entry integration and verified Quick lock; R1-139/140 provide minimized
settings diagnostics/investigation; R1-141 permits valid unassigned OFF Smart
Cups; R1-142/143 record reassignment decisions/design; R1-144–148 implement and
review durable reassignment, reopen lookup, read-only verification retry, direct
write/check and one-shot modal-to-scan transition. Historical handoffs retain
their original scope/status; this report is the current integration disposition.

App.js, package.json (normal Expo AppEntry), app.json, dependency lockfile,
native iOS/Android and existing build configuration have no net change from main.
Home, Brewing and Account screen implementations are unchanged; their shared
navigation/repository/NFC dependencies are reviewed and tested separately.
No generated bundle/database/dependency artifact is tracked by this integration.
Standalone phone/upload entries and review fixtures remain reference-only,
with no normal runtime import. The parked upload snapshot builder is not wired.

### Included

- Both supported forms and immutable form/policy pins, current canonical CVA
  response/scoring and Legacy form dependencies.
- Session-scoped two-character codes, all 1,296 possibilities; durable spent
  ledger and fresh code per explicit new write/rewrite, not read/save retry.
- Durable staged assignment, separate Check Cup and atomic membership; editable
  cancellation, different-cup ordinary retry, restart/read-only recovery.
- SAVE retains DRAFT; confirmed LOCK moves to PENDING without rewriting cups.
  Verified Quick locks/activates its sole sample before opening its blank form.
- Creator and enrolled participant activation/grey cards, retained rescan scores,
  scoped local tasting removal, explicit active-only completion, saved edit
  reopening, current-rating progress, Blind hiding/reveal and public codes.
- DRAFT physical removal with separate clear/check and Smart state/settings
  preservation, unchanged quiet blue text action.
- Explicit warned reassignment to a supported owned destination DRAFT, including
  unknown-source interruption consent, active-conflict/duplicate protection,
  same-cup direct write then separate verification, causal retirement/recovery.
  Already-pending legacy clear/check operations retain their older meanings.
- Disabled upload control and truthful Not uploaded status on normal screens.
  No consent, queue, sending or service acknowledgement is connected.

### Deferred / not claimed

Real uploads, backend/accounts/grants/tenancy, encrypted production storage,
production migration/retention/tombstones, generic damaged/numeric-tag repair,
old-test-session import, issuer transfer/clone recovery, post-lock setup expansion,
and broader manual/QR fallback and pilot acceptance remain outside this increment.
Existing low-level developer write-only tools do not consult pending journals;
do not use them during unfinished operations. No claim that every possible NFC
write is guarded. Native requestTechnology/radio reliability is not changed.
CVA unsaved in-memory edits lack the Legacy crash-draft recovery guarantee; this
integration must not be described as satisfying every FR-031/P0 criterion.
Android/Web, installed binary, VoiceOver and full hardware/firmware conformance
are not established by an iOS JavaScript export. This is not pilot readiness.

The 24 October proposal originally deferred reassignment. The later explicit
owner approvals and current R1-144–148 contracts supersede that historical defer;
they do not authorize unrelated future setup or upload work.

## Data handling and rollback

Use only `cup_sessions_v1.db` for integrated sessions. Neither old
`cup_user_test.db` nor `cup_r1_103_sample_codes_test.db` is opened/imported/reset/
deleted. Retain the valid main `cup_app:user_profile`; never adopt the experiment
profile. Missing profile uses secure initialization; malformed identity fails
closed, not a replacement ownership grant. Unrelated preferences, photos,
files/credentials and brewing data are not cleared. Old test sessions can remain
on disk without appearing in this new library.

The current integrated store requires marker3/user_version7/foundation1 and the
static 46-object schema SHA-256
`3d46cbe6f32dac3b83ad944856cf76643b7c89fe22f6aed6b9f0538ea80222fe`.
Only exact recognized integrated v1/5 or v2/6 schemas upgrade, in one exclusive
transaction preserving business rows, issuer ledgers, legacy recovery/receipts
and profile. Unknown/partial/weakened schemas fail without repair. No old-store
import is authorized. Marker/version changes are intentional, not row loss.

Keep existing code checkpoints and old namespaces. Older v1/v2 binaries reject
v3; there is no safe automatic downgrade/reset. Reverting code cannot recall
physical writes, and the old numeric client must not scan new code assignments.
Do not uninstall, wipe app data or reset a ledger to work around a rollback.

## Exact software validation

Full standalone matrix at03f3cc5: **96 run, 68 PASS, 28 FAIL, zero timeouts**.
All 67 prior R1-147 passes remain passing, the R1-148 confirmation suite passes,
and the failed-name set is identical to R1-147. This is not an all-green suite.
Commands: `/usr/local/bin/node scripts/<name>-check.js`, Node22.13.0, max two
workers, no build contention. Exact outputs/exits retained locally at
`/private/tmp/r1-149-final-03f3cc5-matrix/report.json` and per-script logs.

The following are the actual current failures. Prior rationale is in
[baseline disposition](R1_137_BASELINE_CHECK_DISPOSITION.md); a matching failure
name is not a waiver or proof that the old assertion ran. Current-equivalent
evidence is separate; no production validator was relaxed to accept bad fixtures.

| Failure family | Failed scripts (all suffix `-check.js`) | Disposition |
| --- | --- | --- |
| Invalid historical direct/numeric fixtures | blind-metadata-error; cva-atomic-save; cva-independent-deductions; cva-progress-status; cva-response-persistence; cva-zero-default; historical-pin-write; legacy-vertical; local-session-delete; local-session-ownership; local-tasting-completion; participant-sample-lifecycle; pending-sample-addition; saved-score-card; session-draft-save-boundary; session-state-foundation; session-state-migration; virtual-nfc-robustness | Fixtures bypass current string-code issuance/verification or unsupported historical import. Current code/contract/lifecycle/atomicity and deletion coverage must pass independently. Old import is not implemented. |
| Historical collision fixture | secure-identifiers | Pure secure-generation checks precede rejection of an invalid direct-create request; that obsolete request does not prove the intended repository collision branch. Current issuer/code/profile negatives are separate evidence. |
| Old standalone loader | cva-rounding | Extensionless module import fails; independent exact current rational scoring sweep is required. Not a full original script pass. |
| Extracted handlers missing current refs | empty-session-save-continuation; pending-sample-screen | Current first failure is missing cupReassignmentRef. Do not infer runtime ReferenceError from an incomplete extracted-handler environment. Current actual callback probes are distinct. |
| Archived whole-screen/source freeze | pending-upload-delete-preview; removal-text-action; replace-results-preview; upload-status-fixtures | Later approved changes invalidate historical Git/AST freeze. Current disabled-upload/removal behavior is checked separately; no sending claimed. |
| Old privacy source-pattern assertion | saved-session-blind-identity | Old raw-edit-sheet regex, not current projection behavior. Current Blind/authority negatives are checked independently. |
| Unsupported legacy schema seed | session-form-persistence | Old fixture schema is deliberately rejected, not repaired/imported. Exact recognized integrated upgrade tests are the current gate. |

Normal-entry iOS export at03f3cc5 PASS,766 modules:

```sh
/usr/local/bin/node node_modules/expo/bin/cli export --platform ios --output-dir /private/tmp/r1-149-ios-03f3cc5
```

Hermes bundle `AppEntry-fd615730cf245f7ce1c997d14b749160.hbc`,3,311,134 bytes,
SHA-256 `4fd9920a9cd074f59b435bec1f7d7643e2271a9937ee8397f0066b6f3c33ee94`.
It matches the preceding R1-148 export; R1-149 has no runtime/check edits.

`git diff --check` against main reports nine existing cosmetic blank-at-EOF
warnings in the historical inventory and direct tests/fixture. New audit edits
pass the working-diff whitespace check. No cosmetic source cleanup is bundled.

### Supplemental QA and review

Independent QA at the same03f3cc5 runtime executed 20 additional synthetic probes:
19 PASS; one failed only at a historical whole-Nav AST freeze after its actual
all-state deletion assertions had passed. The original failure is retained.
A scratch copy retained those assertions and compared the unchanged current
route handlers to the approved pre-audit1caea3a reference: PASS. An additional
actual current Save/Leave/Stay probe and a valid-profile session-reference
collision/owned-edit negative probe also passed. This is a 19/20 initial run
plus three passing follow-ups, not a claim that the original20 were all rerun green.
Reports: `/private/tmp/r1-149-final-03f3cc5-independent/report.json` and
`/private/tmp/r1-149-final-03f3cc5-extra/report.json` and its separate
`collision-report.json`; exact commands/results are recorded there. Only audit
docs were dirty during supplemental runs;
`git diff 03f3cc5 -- src scripts` is empty.

Current-equivalent coverage includes:

- 18,330 independent BigInt rational CVA deduction/quarter-rounding cases,
  trusted exact pin/unsupported-form negatives and actual Canonical UI defaults
  for all eight cup counts, with no automatic Save/start or reopen mutation.
- Both-form real SQLite late aggregate-write failure rolls back response,
  projections, history and status; wrong-session/stale/pin/count negatives
  preserve the full DB; valid current edits persist. Historical CVA pins are
  exact trusted definitions and historical writes remain denied, not converted.
- Both-role current lifecycle, actor/provenance/ABA fences, grey activation/
  removal, completion/reopen, Blind projection and persisted recovery.
- Actual Sessions delete callbacks in four controlled states under creator and
  noncreator local-actor contexts: Cancel, duplicate/stale dialog suppression,
  exact local deletion, neighbour retention, stale Save/Add acknowledgement
  denial and failure behavior. These fixtures switch actor on a creator-held
  row, not eight complete creator/participant lifecycle histories. The separate
  real participant wire/lifecycle probe covers participant behavior. The
  corrected reference assertion is source-preservation, not lifecycle evidence.
- Actual Save/Leave/Stay callbacks with both forms and real SQLite: repeated
  empty Save stays DRAFT, Stay cancels deferred Leave, Leave preserves saved
  records without implicit Save, held Save blocks exit and newer typing remains
  unsaved. Pending physical work is tested separately, not conflated with Leave.
- Both-form valid-profile session-reference collision branches: duplicate new
  creation rejected without writes, exact existing identity permits owned edit,
  and a wrong editing target is rejected. The old secure-identifiers fixture's
  invalid seed is not used as evidence that this current collision branch ran.
- Exact v1/v2 upgrade preservation/rollback, restart in pending phases,
  same-cup/actor/causal race and eligibility guards, native capacity/writable/
  frozen-byte boundaries, read-only verification retry, modal held/duplicate/
  Cancel callbacks and guarded Quick command/navigation handoff.

These are current scenarios, not a claim to have executed every historical tail
or implemented excluded migrations. The full96's28 failures remain28 failures.
PM accepts their bounded fixture/reference disposition only alongside this
specific current evidence; fixture modernization remains test debt, not a waiver
of a newly failing current workflow.

Independent non-author source reviewer `/root/r1_115_review`: **PASS for draft
PR preparation**, no unresolved HIGH/CRITICAL findings in reviewed current paths.
Covered architecture/data/profile/authority, NFC direct+legacy recovery and
retirement/atomic acknowledgement, current Blind/lifecycle/deletion and modal UI.
This is risk-based actual source review, not formal exhaustive verification of
every changed line. Ten selected scripts independently rerun PASS:
integrated-bootstrap, participant-parity-finish, creator-active-completion,
direct-cup-reassignment-schema, direct-cup-reassignment-races,
completed-tasting-edit, reassignment-confirm-to-scan, session-card-upload-label,
upload-details-ui and nfc-safe-diagnostics (all `scripts/<name>-check.js`, same
Node command as above). Comprehensive scoring/matrix QA and actual hardware are
separate evidence, not claimed as reviewer-executed tests.

The source author separately reconciled provenance/scope without approving their
own implementation. Independent review approved the factual README corrections
to composite identity and verified membership, and architecture's current3/7
recognition wording. No runtime change or product-policy expansion was made.

## Physical acceptance record

Latest owner reports confirm the streamlined reassignment worked; cancelling
retained entered coffee details, and membership occurred only after successful
verification. Owner clarified on26 October that this used **an NFC tag**. Phone,
iOS and tag model were not supplied. Do not label that as Smart Cup/firmware
acceptance. Earlier task/chat history records ordinary Smart/Quick testing, but
does not prove this latest direct-reassignment/modal flow on Smart hardware.
Agents did not access the phone database or perform physical writes.

## PR and merge controls

Prepare a draft PR against main, no auto-merge. Repository protection read-only
audit: enforce_admins true, force pushes/deletions disabled, zero required
approvals, no required status-check entry and no rulesets; no GitHub workflow
exists in the tree. Independent process gates are therefore essential, not
replaced by an empty GitHub checks list. Existing unrelated PRs are not modified.

Before any later merge: explicit owner approval, final independent evidence,
applicable physical gate disposition, fresh remote-main verification and exact
prospective-tree match are required. If source or base changes, rerun affected
prospective checks/review. Only then controlled PR merge and exact merged-commit
post-merge validation; neither happens in R1-149. No claim of release or pilot
approval follows from preparing this PR.
