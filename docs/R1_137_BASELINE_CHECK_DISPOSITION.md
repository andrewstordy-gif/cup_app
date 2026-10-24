# R1-137 baseline failure disposition — proposed, not waived

Unchanged source c02d20c85539a8ffe26d37c44c0b76c60157affd, clean before/after.
Node /usr/local/bin/node v22.13.0. All 74 standalone scripts/*check.js ran:
43 PASS, 31 FAIL, no timeout. Exact commands/outputs/exits:
/private/tmp/r1-137-qa-baseline-c02d20c/report.json and per-script .log files.
No repository edits. These are baseline failures, not integration regressions.
Passing replacements below are evidence for the stated coverage only, not a
claim that every old assertion was re-executed. PM must accept each disposition.

Abbreviations: SC=sample-code-phone-check; SS=sample-code-screen-check;
NC=sample-code-nfc-check; DR=draft-scan-removal-check; DN=draft-removal-nfc-check;
CA=creator-scan-activation-check; CR=creator-sample-removal-check;
CC=creator-active-completion-check; CE=completed-tasting-edit-check;
PP=participant-parity-finish-check; RC=cva-response-contract-check;
FC=form-contract-check; PR=current-rating-progress-check. Each passed baseline.

| Failed script | Exact first failure / cause | Proposed disposition and current replacement or gap |
|---|---|---|
| blind-metadata-error-check | Unsupported or damaged sample-code assignment at numeric fixture scan | Numeric profile superseded. NC/SC strict malformed metadata; nfc-safe-diagnostics + pending-blind-card + PP cover current privacy. Do not claim old numeric path works. |
| cva-atomic-save-check | Unsupported test sample-code profile at direct old fixture save | Fixture bypasses approved code issuance and verification. CE invalid-response rejection + injected late write rollback on actual canonical saved-response transaction; CC completion rollback; SS addition rollback. Historical prototype side-table transaction assertions remain historical, not imported. |
| cva-independent-deductions-check | Unsupported test sample-code profile in cva-zero-default fixture | Its pure v3 independent-deduction/pin/coherence assertions execute before the failing UI fixture. RC/FC + proposed independent current precision sweep cover calculators; CE historical v2 write denial. Actual UI all-count defaults part needs current fixture adaptation or targeted scratch, not assumed passed. |
| cva-progress-status-check | Unsupported test sample-code profile at old direct fixture save | PR current saved ratings/history/setup-lock reset; PP/CC current active selection status. |
| cva-response-persistence-check | Unsupported test sample-code profile at old direct fixture save | CE real SQLite response/revision/notes/recovery/atomic failure, CR clear/blank/stale revision, PP disk reopen. RC typed response/identity negatives. |
| cva-rounding-check | ERR_MODULE_NOT_FOUND sessionFormRoute through savedSessionIdentity | Standalone loader fails to recursively transpile newly imported ES modules. Scratch corrected only loader, retained assertions: original 12,870-case exact/historical sweep plus policy/confirmation assertions PASS; next failure is unsupported old direct seed. This is NOT a full rounding script pass. Historical row-conversion/migration part is outside fresh-store integration; current precision sweep remains separate gate. |
| cva-zero-default-check | Unsupported test sample-code profile at old direct fixture save | RC createCvaDraft/typed defaults n1–8 and CC/CE actual canonical saves. Actual UI all-count default fixture coverage gap; propose current fixture or scratch, not blanket ignore. |
| empty-draft-setup-guard-check | ReferenceError draftRemoval undefined in evaluated current expression | Still relevant. Tiny AST mock extension: draftRemoval:null, draftRemovalRef:{current:null}, draftRemovalBusyRef:{current:null}; keep all existing permission/reopen negatives. Re-run may reveal later stale fixture assumptions. |
| empty-session-save-continuation-check | ReferenceError draftRemovalRef undefined in current Save handler | Still relevant. Add draftRemovalRef and draftRemovalBusyRef, both current:null, to harness. Preserve Save/Leave/Stay actor/continuation assertions. Later dependency on old pending-sample-screen harness also needs disposition; do not assume one-field patch fixes all. |
| historical-pin-write-check | Unsupported test sample-code profile at old direct fixture save | Historical prototype seeding is not a supported new-write API. FC/RC exact historical hashes/pin mismatch rejection; CE active-to-historical v2 repository and standalone-store write denial with full DB snapshot unchanged. Old v1 prototype mutation/migration assertions not re-run; old stores are not imported. |
| legacy-vertical-check | Unsupported test sample-code profile at old direct fixture save | FC Legacy calculation/validation/pins, CE/PP actual Legacy save/recovery/edit/discard, CR removal and stale save fences; legacy-ui/select-all and legacy-save-queue passed. |
| local-session-delete-check | Unsupported test sample-code profile in session-state-fixture.create | DR/PP deletion cascades pending operations/sidecars and stale callback denial. Current whole-library UI callback may need dedicated new-code fixture for all-state delete cancellation; not inferred solely from repository delete tests. |
| local-session-ownership-check | Unsupported test sample-code profile in direct fixture create | PP two isolated actor DBs with exact creator wire payload, no creator grants, wrong-actor rejection; setup-save-actor and DR actor/stale guards. New integrated profile retention gets a dedicated bootstrap gate. |
| local-tasting-completion-check | Unsupported test sample-code profile at old direct fixture save | CC/CE/PP current exact active coverage completion/reveal, notes/scores reopen, blank/missing/zero-active rejection, old completion continuity and stale tokens. |
| new-session-form-choice-check | ReferenceError draftRemovalRef undefined in selectSessionForm | Still relevant. Add draftRemovalRef/draftRemovalBusyRef current:null to each evaluated selection context; retain no-default, separate Quick default, unsupported and explicit-choice assertions. |
| new-session-sample-route-check | Expected selected context, actual null | Missing getLocalTastingPresentation in canOpenSample dependency mock; current callback catches ReferenceError and returns warning/null. Add same explicit projected session mock already used by next callback. Keep missing-session/handoff and inactive/DRAFT negatives. Actual Quick path tested separately and has a genuine assessment-read regression; this fixture failure alone is not that bug. |
| participant-sample-lifecycle-check | Unsupported or damaged sample-code assignment at numeric scan | Old numeric/delete-card lifecycle superseded by retained grey cards. PP verifies current string code discovery, removal/reactivation blank, no unseen creator roster, state/privacy/recovery, history and deletion. |
| pending-sample-addition-check | Unsupported test sample-code profile at old direct fixture save | SC/SS actual code-reserving pending stage/write/check/save-only restart/idempotence, actor/target/payload failure and A-to-B retry; DR inter-operation guards. |
| pending-sample-screen-check | ReferenceError draftRemovalRef undefined in old extracted handler harness | Superseded harness has more than two missing refs: draftRemovalRef/busyRef, lockOperationRef, verifiedObservationRef, readCodeTagContext/canonicalize, actual recordCount and guarded beforeWrite. Prefer SS current harness replacement; do not patch a series of mocks or weaken negatives silently. Existing continuation tests depending on it need explicit update. |
| pending-upload-delete-preview-check | historical git diff --exit-code 4fa0c8b -- src... fails | Archived preview asserted its then-isolated runtime freeze; later approved workflow changed src. Reference-only gate, not current runtime behavior. Keep fixture wording/simulation assertions; upload-details-ui + session-card-upload-label current disabled UI passed. |
| replace-results-preview-check | historical git diff --exit-code 20f0114 -- src... fails | Same reference-only whole-tree assertion. No real replacement/upload is included. Preserve archival reference, do not claim sending tested. |
| saved-score-card-check | Unsupported test sample-code profile at old direct fixture save | PR actual latest card ratings/status, CC/CE/PP actual current canonical/Legacy saved values and grey exclusion. cva-inline-result + shared-assessment-result UI passed. |
| saved-session-blind-identity-check | old regex “unowned sample cannot open raw edit sheet” fails | Current expression adds a stronger DRAFT suppression before existing unowned guard; old local setup cross assumptions are superseded by verified physical removal. pending-blind-card/PP/CC/DR current privacy/removal bindings passed. Do not remove actual unowned guard. |
| secure-identifiers-check | expected /already in use/, got unsupported profile fixture error | Early secure RNG/UUID/reference collision checks execute; final repository request is not valid under string-code contract, so intended later collision branch is never reached. SC/DR protect code/issuer identity; valid main-profile secure initialization needs dedicated bootstrap gate. Retain source RNG negatives; invalid direct sample request should not be used as collision proof. |
| session-code-display-check | ReferenceError usesActiveCompletion undefined while evaluating new title prop | Still relevant. Derive usesActiveCompletion from fixture's matching presentation.tasting.activeSelection; do not hard-code away upload scope. Existing code/privacy/no-mutation assertions remain. |
| session-draft-save-boundary-check | Unsupported test sample-code profile in session-state-fixture.create | draft-save-only, lock-session and PP/DR current boundaries; old direct creation API bypasses code verification. |
| session-form-persistence-check | Incompatible test storage; no database reset | Old migration/schema fixture deliberately lacks supported profile marker. Fresh integrated store explicitly does not migrate it. New bootstrap must independently test incompatible/partial schema rejection with byte-preserving rollback, not make this old store acceptable. |
| session-state-foundation-check | Unsupported test sample-code profile in old direct create | CC/CE/PP current revision/hash/history/coverage and actor isolation; dedicated bootstrap fresh/malformed store gate. Old fixture-dependent migration portions do not establish current integration. |
| session-state-migration-check | Unsupported test sample-code profile in old direct create | Old-store migration is explicitly excluded by accepted fresh-store plan. Dedicated bootstrap must prove refusal/no fallback/no old-store access; current state continuity covered PP/CC/CE. |
| upload-status-fixtures-check | historical git diff --exit-code ac38154 -- src App.js fails | Archived preview then-source-freeze assertion, not current runtime gate. Current upload control/status disabled and normal-entry startup tested separately; no sending/queueing authority implied. |
| virtual-nfc-robustness-check | numeric/incomplete assignment rejected by supported code validator | NC/DN strict code/record/settings/capacity/write failures and DR current clear/read recovery. Home/Brewing/Quick route preservation still requires targeted actual callbacks; Quick regression separately reproduced, cannot call this whole replacement complete. |

## Non-waived current risk checks

Current precision: retain original pure assertions in scratch corrected loader;
run independent current-v3 exact rational sweep and current form/pin negatives.
Historical pin write denial and atomic saved-response failure are already present
in passing CE (both repository and standalone store, full DB snapshot comparison).
No old-store import/conversion is authorized. Do not claim old migration scripts
passed or broaden runtime to make invalid historical fixture writes succeed.

## Quick Cupping finding

/private/tmp/r1-137-quick-flow-probe.cjs executes actual current Details
write/check callbacks with real SQLite, then actual Nav Quick-ready callback.
Verified sample remains status=new; navigation selects it, but actual canonical
assessment getter rejects “Save this session before opening a tasting
assessment.” Exact original main repository/schema in a separate mocked DB
turns the equivalent initial Save into pending. This is a real included Quick
workflow regression at the assessment boundary, not simply an obsolete test or
an intentional current-navigation denial. No code changed; PM disposition needed.
