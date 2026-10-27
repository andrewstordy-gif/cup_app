# Session implementation baseline audit

Date: 18 October 2026. Task: [R1-060](tasks/R1-060.md). Scope: implementation-plan stage 1 only; no application change or phone release.

## Selected baseline and authority

Use the reviewed phone application tree at **`6e392c1081b9cff72d199307e51ca8136e117df5`** as the exact source reference for the next isolated local-state task. Its packaged runtime is **`701b555c27bad24729aed0bd52a86869738b668e`**; the intervening delta changes only `docs/tasks/R1-058.md`. It preserves the tested form, scoring, historical-data, ownership and completion foundations that main does not yet contain. It is a development reference, not approval to merge the 339-commit feature history or to release its obsolete state policy.

Behaviour must follow the approved R1-059 documentation checkpoint **`c78610e514e3ceba7c63b2d94dd63a3a67d670ed`**, final evidence `209b039`: Product Specification section 6.8, architecture section 2.2, NDEF protocol and UI guide. Those approved documents are on `codex/r1-059-session-map-spec`, not main. In particular, old permanent reveal and setup-locked-on-start assertions in the phone source are implementation gaps, not competing authority.

The canonical `docs/SESSION_SCREEN_STATE_IMPLEMENTATION_PLAN.md` exists in that approved documentation tree. This audit branch deliberately does not copy those specifications or production code; absence on old main does not revoke their authority.

### Exact subsequent assembly instruction

Before runtime edits, create the next canonical task with exclusive schema/repository/DTO ownership. Start an isolated branch from then-current clean, synchronized main; compare it with this audit's main baseline **`34f95a8119574557e5e67cc5246888a9d1c089c4`**. If main moved, review every overlapping change before selecting content.

On that isolated branch, assemble a separately inspectable baseline commit from the exact phone `src/` and `scripts/` trees, retaining unchanged current-main files and recording the 84 changed source/test paths below. Reconcile the approved R1-059 specifications/plan separately; do not import old phone policy text over them. Retain task provenance for the included dependency slices, either through preserved history or explicit checkpoint references. Verify the assembled runtime/test tree against the selected ref before new implementation. This is a proposed next-task operation, not performed by this audit.

Keep main's application dependency declarations and lock/native/configuration files unchanged: the phone has no dependency-version delta. The phone-specific package entry is packaging, not state-model logic. Do not blindly copy its `package.json` or registration entry into the state task. If an isolated export later needs a local registration entry, prepare it only in disposable export staging or an explicitly scoped packaging task. After the baseline assembly, run the retained suite again, then implement and independently review only the new state slice. Any eventual prospective main integration must review the entire inherited source delta plus the new slice, repeat integration validation, and retain unresolved device/production gates. Existing narrow approvals do not approve that combined merge.

## Commit and file inventory

Read-only Git comparison establishes that main `34f95a8` is the merge base and ancestor of phone `6e392c1`; **339 commits** are reachable after main. The phone tag is `phone-verification-2026-10-18-r1-057`; its peeled commit is the selected source above. This audit made no changes to main, the live phone HEAD or existing tags; only its isolated task branch receives documentation commits.

| Changed paths from main to phone | Count | Classification |
| --- | ---: | --- |
| `src/` | 44 | Runtime, immutable form definitions/fixtures and shared UI/navigation/NFC source |
| `scripts/` | 40 | Added/updated checks and three test-loader/fixture helpers |
| `docs/` | 48 | Specifications, feedback and task/review history; older policy requires R1-059 reconciliation |
| `package.json` | 1 | Changes entry and adds two test aliases only; dependency declarations unchanged |
| `r1-057-phone-verification-entry.js` | 1 | Four-line Expo registration importing this checkout's `./App` |
| Native/configuration/lock/dependency-version changes | 0 | No `ios/`, `android/`, app/bundler configuration or lockfile delta |
| Total | 134 | 13,022 insertions and 1,536 deletions |

The complete 339-commit inventory with parent hashes, exact name/status inventory and per-file line counts are retained with the test logs in `/private/tmp/cup-r1-060-checks.4ZjcXi/{commit-inventory.txt,file-inventory.txt,file-numstat.txt}`. They are reproducible from the named refs; temporary logs are local evidence, not permanent release artifacts.

### Dependency slices and prior reviews

| Slice | Significant source checkpoints | Prior evidence and limits |
| --- | --- | --- |
| Versioned Legacy/CVA forms, shared result/notes/cups, blind reachable routes | R1-010–039; combined `f90c03f` | R1-040 initially required changes despite passing 23 checks; initial PASS counts must not be treated as whole-stack approval. |
| Blind diagnostics/import projection and exact CVA quarters/history | R1-041 `4f3ce97`, R1-042 `8a7c227` | R1-040 correction record cites independent privacy/numerical/history/UX reviews, 25 checks and export. Historical policy conversion remains explicit. |
| Lossless canonical CVA 2 response, pinned history and transactional saves | R1-043 `50a56f2` | Independent architecture/history/security, numerical/QA and UX reviews; 29 checks/export. Not production event/outbox/auth or NFC lifecycle completion. |
| Started progress, saved-score rendering, zero-defect default and empty-session continuation | R1-044 `3175344`, R1-046 `060cb69`, R1-047 `831de7e`, R1-048 `b819b26` | Respective task records preserve scoped checks, reviews and user feedback. Empty-save continuation is not a durable NFC journal. |
| Immutable installation-local creator provenance and imported-assignment guards | R1-050 `0946140`, corrections `08ad270`/`811f177`, tests `4aca60c` | Independent software/privacy/UX approval in R1-050; local profile is not an authenticated account or private multi-taster store. |
| Actual session-name visibility independent of blind coffee identity | R1-052 `ea33c4c` | Independent review in R1-052; session names remain visible/searchable under new map. |
| Actor-scoped completion, guarded historical adoption and safe DTOs | R1-054 data `5900235`, UI `3d70a66`/`b234de3`, tests `8bdf31b` | Initial data findings corrected and independently reviewed; 37 checks. Retained reveal and setup-on-start locks are now explicitly superseded. |
| Original session-level completion presentation and immediate incomplete warning | R1-057 `1295a4b` | Independent architecture/security/privacy/QA and separate UX source approvals; 38 checks and iOS export. No working upload service. |
| Phone packaging | R1-058 runtime `701b555`, tag peel `6e392c1` | Independent packaging/provenance review; exact-entry export previously passed. Historical export evidence was not rerun in this audit. |

These are task-scoped approvals at their recorded requirements. They neither settle new migration/revision design nor waive R1-040's inherited production, physical, accessibility and integration gates.

## Current source and schema gaps

Paths and line references in this section refer to immutable phone `6e392c1`, not old main.

| Area | Existing source evidence | Required next behaviour or gate |
| --- | --- | --- |
| Completion and reveal | `src/data/localTastingState.js:32` returns `completed/revealed = Boolean(row)`; completion row is keyed only by session/profile. `sessionRepository.js:788` returns prior completion idempotently without current coverage qualification. | Bind current completion to saved revision and active local coverage; changed saved scores/notes or participant membership reopen/hide. Keep separate ever-completed history. |
| Durable start and setup access | `localTastingState.js:15` conservatively recognizes started evidence; `assertUnstartedWithDb` and `sessionRepository.js:36,425,1759` reject all setup after start. | Preserve start latch, but permit creator additions/removals before first completion. Temporary DRAFT cannot restore preparation visibility or clear history. Assigned metadata locks are independent. |
| Save and progress | `sessionRepository.js:267` derives status from sample/response counts; `cvaResponseStore.js:56` appends each successful Save and sets in_progress. Legacy path is `sessionRepository.js:1437`. | Distinguish true saved-content changes from no-op Save, recovery drafts and typing. Atomically advance saved revision/coverage and invalidate completion only when approved. Preserve ever-started even when roster becomes empty. |
| Creator provenance | `sessionRepository.js:30,52` checks stored creator in guarded mutation; `userProfileRepository.js:1` serializes immutable UUID initialization/profile edits in AsyncStorage. | Retain those checks for setup. Do not use them as the authority for deleting one's local copy, participant sample removal or future service access. |
| Participant roster and streams | `resolveActiveSampleFromCupMetadata` at `sessionRepository.js:1241` imports scanned cup/sample; `samples` is shared installation-local storage. `local_response_streams` prevents known foreign overwrite, not separate response histories. | Explicit current local membership/coverage must not be inferred from advertised total or old uploaded snapshots. Add/remove/rescan transitions need tests. Full shared-device private multi-taster storage remains a separate service/privacy requirement. |
| Local deletion | `sessionRepository.js:1362` wraps whole-session deletion in creator-only `ownedMutation`; sample deletion at `1744` is also owner-only, rejects started/saved responses and performs database deletion without a physical removal transaction. `CuppingSessionScreen.js:42` gates cross on canManageSetup. | Both roles can delete local sessions in all states. Participant removal is local-only with result warning and reopen/empty-roster semantics. Creator retained-session cup removal needs physical clear/verify. These must be separate commands. |
| NFC consistency and recovery | Details screen `:761` reads/writes; `:891` saves the returned sample after write, before separate verification; verification at `:967` updates React/ref state. Smart Cup assignment at `:860` supplies `text2:{}` but `text3:{}`. `nfcServiceMinimal.js:696` reports native read/write success without durable activation journal. | Durably stage complete identity/payload before any external write; require later physical rescan and successful Save. Persist recovery across Leave/restart, no automatic rewrite. Explicit reviewed record-3 preservation/intended-setting and exact unassignment/counter contract required before physical workflow change. |
| Assigned metadata | Current Details includes rewrite/edit path (`:1086`) and replacement sample fields (`:840`); setup saves retain form pin guards. | Lock assigned session name/type/form and coffee name/process; remove/verify/reassign to change. Review all entry paths, not button visibility alone. |
| Upload and icons | No consent/outbox/ack schema in `localDatabase.js`; targeted data/service/screens search found upload style declarations only in Details `:1767`, no functioning consented upload/ingestion path. | Real immutable consent/outbox/service/revision contracts and auth must precede upload/status claims. Older consented queue remains eligible after edits; old acknowledgements cannot mark newer local results uploaded. |
| Screen controls | Existing local action component and trusted DTO pipeline are present; original footer combinations and all-state crosses are incomplete under new map. | Reuse established footer/dialog/icon components later; do not add completion links to forms or wrap CVA scores. No UI edits in this stage. |

### Migration sensitive storage

`src/data/localDatabase.js` opens **`cup_user_test.db`**. `PRAGMA user_version` reaches 4, but later columns/tables are added by column-presence checks without a new version; version 4 does not identify one unique schema shape. Migration uses mixed DDL and data repair rather than one enclosing transaction. Forward design must cover actual older/partially applied shapes and interruption, not merely a version-number switch.

- `sessions`: preserve IDs/references/name/type/date/status, mode, `cupping_form`, immutable `form_key/form_version/form_hash`, `form_locked`, nullable `local_creator_profile_id`, monotonic `local_tasting_started_at` and timestamps.
- `samples`: preserve session/cup identity, cup count, assigned `sample_number`, position, raw name/process, mode/form and uniqueness/cascade relationships. The prototype sample row currently embeds one cup identity rather than the full canonical service Sample/CupAssignment split.
- `cva_response_revisions`: append-only raw response/result JSON, unique sample/revision, identity/count, calculation and defect policy. Preserve old pinned 1.0/1.1/2.0 meanings and stored results, not just displayed score.
- `legacy_responses`: one current raw row per sample with pin/count/finality; original adoption source is separately retained in `local_response_streams.recovery_source_json`.
- Existing feedback, defect and flavour-observation rows carry prototype/history and calculation evidence. Preserve assessed/unassessed distinctions, masks, Other/roast observations and source ordering.
- `local_response_streams`: preserve actor binding, bound time, exact recovery JSON and adoption token; historical unknown authorship stays unknown. `local_tasting_completions`: preserve original explicit completion/reveal evidence while designing current revision qualification and ever-completed latch; never silently manufacture completion or reveal.
- AsyncStorage key **`cup_app:user_profile`** and its UUID must remain unchanged. SQLite migration cannot assume atomically changing AsyncStorage; actor continuity must be rechecked at commands.

Minimum fixtures for the next design: empty creator draft; unstarted assigned Pending; started partial/notes-only; current completed89.5; reopened revision; foreign/unattributed/corrupt actor; historical globally-complete read-only; unknown pins/policies; earlier partial schemas; failed/interrupted migration and repeat startup; participant empty roster. Snapshot original rows/profile before migration and compare exact preserved evidence after it. No reinstall/reset, bulk adoption, automatic score recalculation or old-binary privacy downgrade.

## Regression execution

Executed against clean phone **`6e392c1081b9cff72d199307e51ca8136e117df5`**, `/usr/local/bin/node` **v22.13.0**, shared dependencies read via `NODE_PATH=/Volumes/external/code/cup_app/node_modules`.

Safety inspection covered the scripts' filesystem/native adapter imports and test loaders before execution. Database adapters use in-memory SQLite except `local-tasting-completion-check.js`, which creates a fresh `os.tmpdir()/cup-local-tasting-*` directory and `test.db` for restart/competing-connection tests. AsyncStorage is mocked with a Map, NFC native transport is mocked, and no connected phone database or physical cup is accessed. The scripts do not start Metro, invoke child processes or make a service request. Existing dependency files are reused, not installed or edited.

Command, from the unchanged phone checkout:

```sh
task_audit_logs=$(mktemp -d /private/tmp/cup-r1-060-checks.XXXXXX)
/usr/local/bin/node --version
for task_check in scripts/*-check.js; do
  task_check_name=${task_check##*/}
  NODE_PATH=/Volumes/external/code/cup_app/node_modules /usr/local/bin/node "$task_check" > "$task_audit_logs/$task_check_name.log" 2>&1
  task_check_result=$?
  printf '%s %s\n' "$task_check_result" "$task_check_name" >> "$task_audit_logs/results.txt"
done
```

**38 check-script entrypoints PASS; zero nonzero exits.** Some entrypoints load other checks, so this count is not 38 independent test suites. Retained output is `/private/tmp/cup-r1-060-checks.4ZjcXi`, one log per script and `results.txt`. SQLite's experimental warning is expected. Inventory commands were `git log --format='%H %P %s' 34f95a8..6e392c1`, `git diff --name-status 34f95a8 6e392c1`, `git diff --numstat 34f95a8 6e392c1`, `git merge-base 34f95a8 6e392c1` and `git rev-list --count 34f95a8..6e392c1`.

Passing scripts, names below all end in `-check.js`:

```text
active-session-blind-identity  assessment-cup-selector  assessment-form-intro
assessment-header  assessment-sample-identity  blind-metadata-error
cva-atomic-save  cva-completion-confirmation  cva-inline-result
cva-progress-status  cva-response-contract  cva-response-persistence
cva-response-ui-save  cva-rounding  cva-zero-default
defect-dialog-reachability  empty-session-save-continuation  form-contract
historical-pin-write  legacy-save-queue  legacy-select-all  legacy-ui
legacy-vertical  local-completion-presentation  local-session-ownership
local-tasting-completion  local-tasting-ui  new-session-form-choice
new-session-sample-route  notes-keyboard  saved-score-card
saved-session-blind-identity  secure-identifiers  session-form-persistence
session-form-routing  session-name-visibility  shared-assessment-result
virtual-nfc-robustness
```

These checks establish a regression baseline, **not conformance to the new map**. In particular, local-tasting-completion deliberately asserts retained reveal after subsequent partial Save and setup_started rejection. Replace those obsolete expectations with specification-traced tests in the later implementation; retain valid scoring, corruption, actor, snapshot, rollback and history protections.

The virtual NFC check also contains its own `buildSmartAddSampleWritePayload` helper rather than executing the actual Details-screen assignment callback. Its passing claim about preserving NDEF2 status/NDEF3 settings is not canonical write conformance: canonical app writes require NDEF2 `{}`, while the actual add-screen callback supplies NDEF2 `{}` and NDEF3 `{}`. Future NFC tests must exercise the real callback/adapter payload, preserve or intentionally set record 3 under a reviewed contract, and separately prove durable rescan/recovery. No bundle/native build or phone/NFC/VoiceOver test was performed in this audit. R1-058's recorded export is historical only.

## Next stage boundary

The next implementation-plan stage is **local state and revision foundation**, not NFC workflow, UI restoration or upload delivery. First review a concrete schema/revision/coverage contract and additive migration fixtures. Assign the following shared interfaces together before dependent screen work:

| Boundary | Candidate files | Required contract |
| --- | --- | --- |
| Schema and migration | `src/data/localDatabase.js`, implemented descriptive schema docs | Actual-shape migration, durable ever-started/ever-completed, saved revision/coverage and transactional completion qualification; preserve old evidence. |
| Repository and local state | `src/data/sessionRepository.js`, `src/data/localTastingState.js` | Actor-derived commands, setup versus local-copy authority, real-change detection, no-op Save, completion invalidation, empty roster, idempotent transitions and late-context guards. |
| Form persistence hooks | `cvaResponseStore.js`, Legacy repository path and save queue | Same transition on CVA/Legacy actual saved score/note; atomic result/progress writes; unknown historical author remains gated. No immutable manifest rewrite. |
| Presentation DTO | `getLocalTastingPresentation`, shared identity/status helpers and their consumers | One trusted current-state/permissions projection; durable preparation lock, current reveal and neutral sample labels without caller booleans granting authority. |
| Scanned local membership | metadata resolution/import APIs | Preserve assigned numbers, distinguish existing rescan from membership change, never expand advertised unseen roster or accept tag data as setup permission. |

The implementation task must explicitly choose which commands become active in that slice and which remain safely unavailable until NFC/controls gates. Removing `assertUnstartedWithDb` without physical consistency and metadata-lock contracts would prematurely enable unsafe creator changes; do not do so as a shortcut. Likewise, adding revision fields does not implement a consent queue or authorize network sends.

All-state local deletion, creator physical removal, durable NFC recovery, and consented upload remain separately sequenced stages with their own failure tests and independent reviews. Exact unassignment bytes and affected `i/z/y` consistency are unresolved technical gates; service credentials, production encryption, tenant isolation, finite policy and backend ordering remain unimplemented requirements, not waived by local UUIDs or this baseline selection.

## Source inventory for the next isolated branch

The exact 44 changed `src/` paths are:

```text
src/data/localDatabase.js
src/data/localTastingState.js
src/data/sessionRepository.js
src/data/userProfileRepository.js
src/features/cupping/components/AddCoffeeSampleSheet.js
src/features/cupping/components/AssessmentCupSelector.js
src/features/cupping/components/AssessmentFormIntro.js
src/features/cupping/components/AssessmentHeader.js
src/features/cupping/components/AssessmentResultSection.js
src/features/cupping/components/AssessmentSampleIdentity.js
src/features/cupping/components/CoffeeSampleCard.js
src/features/cupping/components/DefectsSection.js
src/features/cupping/components/LocalTastingActions.js
src/features/cupping/components/ScoreBalloons.js
src/features/cupping/components/assessmentCupLayout.js
src/features/cupping/components/focusNotesAboveKeyboard.js
src/features/cupping/constants/sessionDetails.js
src/features/cupping/data/cvaDefectPolicy.js
src/features/cupping/data/cvaResponse.js
src/features/cupping/data/cvaResponseStore.js
src/features/cupping/data/cvaScoreCalculation.js
src/features/cupping/screens/ActiveSessionScreen.js
src/features/cupping/screens/CanonicalCvaScreen.js
src/features/cupping/screens/CuppingScreen.js
src/features/cupping/screens/CuppingSessionDetailsScreen.js
src/features/cupping/screens/CuppingSessionScreen.js
src/features/cupping/screens/activeSessionIdentity.js
src/features/cupping/screens/savedSessionIdentity.js
src/features/forms/contract/fixtures/cva-v2.canonical.json
src/features/forms/contract/index.js
src/features/forms/contract/manifests/cva-v1.1.json
src/features/forms/contract/manifests/cva-v1.json
src/features/forms/contract/manifests/cva.json
src/features/forms/contract/manifests/legacy.json
src/features/forms/legacy/LegacyCuppingScreen.js
src/features/forms/legacy/LegacySampleCard.js
src/features/forms/legacy/legacyCupSelection.js
src/features/forms/legacy/legacyQualityPresentation.js
src/features/forms/legacy/legacySaveQueue.js
src/features/forms/legacy/legacyScoreGridLayout.js
src/features/forms/sessionFormRoute.js
src/features/style-guide/components/ScoreRow.js
src/navigation/AppNavigator.js
src/services/nfcServiceMinimal.js
```

The 40 changed `scripts/` paths are enumerated exactly in `file-inventory.txt`; 37 are checks, plus `helpers/load-project-module.js`, `helpers/local-profile-fixture.js` and `helpers/prototype-cva-fixture.js`. The 38th executed check, virtual NFC robustness, is unchanged from main. No changed-path inventory implies permission to edit every listed file in the next slice.
