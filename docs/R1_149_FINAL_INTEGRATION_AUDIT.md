# R1-149 — Final local-workflow integration audit

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
