# R1-137 imported-source inventory

Source c02d20c85539a8ffe26d37c44c0b76c60157affd versus verified main34f95a8119574557e5e67cc5246888a9d1c089c4. Generated from read-only Git name/history queries before integration edits. 213 changed paths (the prior phone inventory was211; R1-136 adds two planning documents). No uncommitted source copied.

Trial merge53e9af47a613934670a583cd01b3bdaedc5cc425 has the identical source tree plus the prior committed R1-137 task. No conflict resolution was necessary. History retains task/checkpoint provenance; latest-path references below identify inspectable source, not blanket release approval.

## Include/defer classification

- 62 canonical docs/task evidence.
- 4 entry/reference packaging.
- 10 non-runtime review fixtures.
- 78 checks/helpers.
- 59 runtime and bundled form definitions.

Runtime/form dependencies remain included pending exact combined validation/review. Earlier forms are traced by docs/SESSION_IMPLEMENTATION_BASELINE_AUDIT.md (R1-060, source assemblyb280544) to R1-010–058; local-state changes by R1-061/063–069; latest session work by R1-080–135 records and preserved source commits. Existing canonical approvals govern behavior; historical superseded requirements do not become current authority through this import.

package.json normal entry is restored by R1-137. Standalone r1-062/r1-118/r1-122 entries and review fixtures are reference-only, never normal runtime imports. Test-only storage/profile/log wiring is replaced under the approved fresh-store plan. No real upload, parked R1-120 snapshot builder, completed-cup reassignment or unfinished physical setup features are added. App.js, app.json, dependencies/lockfile, native iOS/Android files, Home/Brewing/Account implementations have no imported diff; shared navigation changes still require exact candidate regression review. Imported src SQLite consumer is sessionRepository only; AsyncStorage consumer is profile repository only, and Account photo files remain in their existing document paths.

## Exact paths and latest source references

| Path | Latest source commit and description |
| --- | --- |
| `docs/DATABASE_SCHEMA.md` | e6b82a3 Implement verified scanned removal for creator drafts |
| `docs/DRAFT_SAMPLE_REMOVAL_NFC_CONTRACT_DRAFT.md` | e6b82a3 Implement verified scanned removal for creator drafts |
| `docs/LOCAL_SESSION_STATE_FOUNDATION.md` | e6b82a3 Implement verified scanned removal for creator drafts |
| `docs/NDEF_PROTOCOL.md` | e6b82a3 Implement verified scanned removal for creator drafts |
| `docs/PRODUCT_SPEC.md` | 63cba9e fix: support per-sample CVA modes in isolated client |
| `docs/RELEASE_1_ARCHITECTURE_DATA_CONTRACT.md` | b280544 build: assemble audited session implementation reference in isolation |
| `docs/SESSION_IMPLEMENTATION_BASELINE_AUDIT.md` | b280544 build: assemble audited session implementation reference in isolation |
| `docs/SESSION_SCREEN_STATE_IMPLEMENTATION_PLAN.md` | d37f884 docs: hand off reviewed participant sample management |
| `docs/SESSION_TEST_COPY_INTEGRATION_PROPOSAL.md` | c02d20c docs: propose session workflow integration and fresh data policy |
| `docs/UI_STYLE_GUIDE.md` | 0c5a17a Use a quiet blue text action for draft sample removal |
| `docs/tasks/R1-059.md` | b280544 build: assemble audited session implementation reference in isolation |
| `docs/tasks/R1-060.md` | b280544 build: assemble audited session implementation reference in isolation |
| `docs/tasks/R1-061.md` | 313d3a8 docs: record reviewed state foundation handoff |
| `docs/tasks/R1-062.md` | b9dd07b docs: hand off reviewed state foundation phone package |
| `docs/tasks/R1-063.md` | 7fb3620 docs: record creator phone state-cycle results |
| `docs/tasks/R1-064.md` | 4c931b4 docs: record verified uniformity phone candidate |
| `docs/tasks/R1-065.md` | bf98b03 docs: record verified all-state deletion phone tag |
| `docs/tasks/R1-066.md` | 108c26c docs: hand off reviewed CVA uniformity default |
| `docs/tasks/R1-067.md` | 14165cd docs: record independent scoring test and future warning idea |
| `docs/tasks/R1-068.md` | 62f457a docs: defer cup reuse issue and identify participant lifecycle next slice |
| `docs/tasks/R1-069.md` | d37f884 docs: hand off reviewed participant sample management |
| `docs/tasks/R1-080.md` | 78ec78d ui: prepare isolated compact session title fixture review |
| `docs/tasks/R1-081.md` | 7a53492 docs: record served title-only phone checkpoint |
| `docs/tasks/R1-082.md` | c1469a3 docs: record standard title typography review and phone checkpoint |
| `docs/tasks/R1-084.md` | eac6fa7 docs: record draft footer phone review checkpoint |
| `docs/tasks/R1-091.md` | 2f06364 docs: record verification dialog phone checkpoint |
| `docs/tasks/R1-093.md` | a7ae66a docs: record reviewed deferred sample phone candidate |
| `docs/tasks/R1-094.md` | 77e03a6 docs: record reviewed failed-write retry phone checkpoint |
| `docs/tasks/R1-095.md` | 46a80c6 docs: record reviewed drawer restart phone checkpoint |
| `docs/tasks/R1-103.md` | 0b1dd64 docs: record reviewed isolated sample-code phone checkpoint |
| `docs/tasks/R1-104.md` | 1239d7d docs: record reviewed empty-draft guard correction |
| `docs/tasks/R1-105.md` | e1ee719 docs: record per-sample mode review and test handoff |
| `docs/tasks/R1-106.md` | 8f1ac70 docs: record saved-count correction review and test evidence |
| `docs/tasks/R1-107.md` | 6b5ed4b docs: record reviewed NFC diagnostic checkpoint |
| `docs/tasks/R1-108.md` | 26398e1 docs: record bare card code review |
| `docs/tasks/R1-109.md` | fd0e839 docs: record R1-109 review and phone checkpoint |
| `docs/tasks/R1-110.md` | c78a20c docs: update R1-110 review status |
| `docs/tasks/R1-111.md` | fa11402 docs: record R1-111 review and phone handoff |
| `docs/tasks/R1-112.md` | 8527d1f docs: record R1-112 review and phone handoff |
| `docs/tasks/R1-113.md` | d69f76a docs: record R1-113 independent lock review and phone handoff |
| `docs/tasks/R1-114.md` | c0a093d docs: record R1-114 independent activation review and phone handoff |
| `docs/tasks/R1-115.md` | 34168d6 docs: record R1-115 final removal review and phone handoff |
| `docs/tasks/R1-116.md` | 3efea87 docs: record R1-116 exact completion review and phone handoff |
| `docs/tasks/R1-117.md` | c701234 docs: record R1-117 applied phone validation |
| `docs/tasks/R1-118.md` | 0dcbd0c docs: record R1-118 applied preview validation |
| `docs/tasks/R1-119.md` | 0d10e7c docs: record R1-119 review and applied phone validation |
| `docs/tasks/R1-121.md` | ac38154 docs: record R1-121 review and phone-copy validation |
| `docs/tasks/R1-122.md` | 20f0114 docs: record R1-122 review and phone-preview validation |
| `docs/tasks/R1-123.md` | 6bf328c docs: record R1-123 review and phone-preview validation |
| `docs/tasks/R1-124.md` | 4fa0c8b docs: record R1-124 reviewed preview wording |
| `docs/tasks/R1-125.md` | f4e3d2a docs: record R1-125 review and phone-preview validation |
| `docs/tasks/R1-126.md` | b529e10 docs: record R1-126 reviewed warning copy |
| `docs/tasks/R1-127.md` | 4819c62 docs: record R1-127 queued-card preview validation |
| `docs/tasks/R1-128.md` | a907862 docs: record R1-128 upload-control preview validation |
| `docs/tasks/R1-129.md` | e548a57 docs: record R1-129 normal-screen restoration validation |
| `docs/tasks/R1-130.md` | 873e7f0 docs: record R1-130 reviewed separate-copy handoff |
| `docs/tasks/R1-131.md` | fc987a2 docs: record R1-131 separate-copy validation |
| `docs/tasks/R1-132.md` | 978b31e docs: propose DRAFT sample NFC clearing contract for agreement |
| `docs/tasks/R1-133.md` | d9f321a docs: record R1-133 validation and phone-copy handoff |
| `docs/tasks/R1-134.md` | 1f4b278 docs: record R1-134 validation and separate-copy apply |
| `docs/tasks/R1-135.md` | d329370 docs: record R1-135 visual change validation and apply |
| `docs/tasks/R1-136.md` | c02d20c docs: propose session workflow integration and fresh data policy |
| `package.json` | e9a6fe5 build: package state foundation supervised phone entry |
| `r1-062-phone-verification-entry.js` | ac3e9cf R1-129 restore normal test App startup |
| `r1-118-upload-preview.js` | cba0cc4 R1-118 add isolated upload status phone preview |
| `r1-122-upload-status-preview.js` | a6ae7b7 R1-128 preview replacement from fictional upload control |
| `review/draft-footer-connection/check.cjs` | b0a9471 ui: add draft save footer with disabled lock action |
| `review/session-title/README.md` | 78ec78d ui: prepare isolated compact session title fixture review |
| `review/session-title/check.cjs` | 78ec78d ui: prepare isolated compact session title fixture review |
| `review/session-title/connection-check.cjs` | 65b3224 ui: connect compact title to existing non-draft session data |
| `review/session-title/fixtures.cjs` | 78ec78d ui: prepare isolated compact session title fixture review |
| `review/session-title/render.cjs` | 78ec78d ui: prepare isolated compact session title fixture review |
| `review/session-title/runtime.cjs` | 78ec78d ui: prepare isolated compact session title fixture review |
| `review/session-title/typography-check.cjs` | d747a31 ui: use standard typography tokens for compact session title |
| `review/verification-dialogs/check.cjs` | 9ac141c ui: present existing cup verification as approved dialogs |
| `review/verification-dialogs/runtime.cjs` | 9ac141c ui: present existing cup verification as approved dialogs |
| `scripts/active-session-blind-identity-check.js` | 63cba9e fix: support per-sample CVA modes in isolated client |
| `scripts/assessment-code-route-check.js` | 418b95c fix: pass sample code to canonical tasting headers |
| `scripts/assessment-cup-selector-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/assessment-form-intro-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/assessment-header-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/assessment-sample-identity-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/blind-metadata-error-check.js` | 703d25f Keep duplicate scan persistence regression strict |
| `scripts/completed-tasting-edit-check.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `scripts/creator-active-completion-check.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `scripts/creator-sample-removal-check.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `scripts/creator-scan-activation-check.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `scripts/current-rating-progress-check.js` | 79bd4f0 fix: keep normal draft saves on session details in draft |
| `scripts/cva-atomic-save-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/cva-completion-confirmation-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/cva-independent-deductions-check.js` | 6799a14 Reject historical CVA lifecycle mutations at shared boundary |
| `scripts/cva-inline-result-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/cva-progress-status-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/cva-response-contract-check.js` | 2ed5c8a Version independent CVA deductions and preserve historical v2 reads |
| `scripts/cva-response-persistence-check.js` | 2ed5c8a Version independent CVA deductions and preserve historical v2 reads |
| `scripts/cva-response-ui-save-check.js` | 3d5656f Default new CVA Uniformity to zero deduction |
| `scripts/cva-rounding-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/cva-zero-default-check.js` | 0e82482 feat: manage participant samples in local session copies |
| `scripts/defect-dialog-reachability-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/draft-removal-nfc-check.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `scripts/draft-save-only-check.js` | 067c24d Add explicit durable setup lock for saved draft sessions |
| `scripts/draft-scan-removal-check.js` | fe9abd5 Show durable draft removal recovery notice |
| `scripts/empty-draft-setup-guard-check.js` | 067c24d Add explicit durable setup lock for saved draft sessions |
| `scripts/empty-session-save-continuation-check.js` | 1be979c fix: defer sample membership until durable cup verification |
| `scripts/form-contract-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/helpers/load-project-module.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/helpers/local-profile-fixture.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/helpers/prototype-cva-fixture.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/helpers/sample-code-fixture.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `scripts/helpers/session-state-fixture.js` | d0a9edf fix: bind saved acknowledgements to actor and committed source |
| `scripts/historical-pin-write-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/legacy-save-queue-check.js` | a3a1cd3 fix: guard preserved state evidence and verify migration boundaries |
| `scripts/legacy-select-all-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/legacy-ui-check.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `scripts/legacy-vertical-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/local-completion-presentation-check.js` | f79bb8d Keep creator setup Draft until explicit session Save |
| `scripts/local-session-delete-check.js` | 1be979c fix: defer sample membership until durable cup verification |
| `scripts/local-session-ownership-check.js` | d450e2b Allow confirmed deletion of any local session copy |
| `scripts/local-tasting-completion-check.js` | a3a1cd3 fix: guard preserved state evidence and verify migration boundaries |
| `scripts/local-tasting-ui-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/lock-session-check.js` | f823171 Activate newly locked creator samples only after tasting scan |
| `scripts/new-session-form-choice-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/new-session-sample-route-check.js` | f79bb8d Keep creator setup Draft until explicit session Save |
| `scripts/nfc-safe-diagnostics-check.js` | d8d4e82 chore: add privacy-safe NFC scan-shape diagnostics |
| `scripts/notes-keyboard-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/participant-parity-finish-check.js` | 829508f R1-131 restore prior DRAFT card appearance without setup actions |
| `scripts/participant-sample-lifecycle-check.js` | e591b8d fix: fail closed on corrupt participant mode and retain card checks |
| `scripts/pending-blind-card-check.js` | 79bd4f0 fix: keep normal draft saves on session details in draft |
| `scripts/pending-sample-addition-check.js` | d8d1da6 fix: retry failed initial sample write before cup check |
| `scripts/pending-sample-screen-check.js` | 481af63 fix: restart sample write from retained editable drawer |
| `scripts/pending-upload-delete-preview-check.js` | ac3e9cf R1-129 restore normal test App startup |
| `scripts/per-sample-mode-check.js` | 26352d7 R1-130 align retained participant regression fixtures |
| `scripts/removal-text-action-check.js` | 0c5a17a Use a quiet blue text action for draft sample removal |
| `scripts/replace-results-preview-check.js` | ac3e9cf R1-129 restore normal test App startup |
| `scripts/sample-code-nfc-check.js` | 6654477 fix: fence malformed code targets and participant acknowledgements |
| `scripts/sample-code-phone-check.js` | 26352d7 R1-130 align retained participant regression fixtures |
| `scripts/sample-code-screen-check.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `scripts/saved-sample-count-check.js` | 68fc505 fix: grow creator draft count for new verified samples |
| `scripts/saved-score-card-check.js` | e591b8d fix: fail closed on corrupt participant mode and retain card checks |
| `scripts/saved-session-blind-identity-check.js` | f823171 Activate newly locked creator samples only after tasting scan |
| `scripts/secure-identifiers-check.js` | dcf998a fix: retain completed-form denial and strict-state test context |
| `scripts/session-card-upload-label-check.js` | 09da345 R1-130 finish local participant tasting and DRAFT preparation cards |
| `scripts/session-code-display-check.js` | 79bd4f0 fix: keep normal draft saves on session details in draft |
| `scripts/session-draft-save-boundary-check.js` | 1be979c fix: defer sample membership until durable cup verification |
| `scripts/session-form-persistence-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/session-form-routing-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/session-name-visibility-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/session-state-foundation-check.js` | acf1aa2 fix: reject noncanonical persisted progress states |
| `scripts/session-state-migration-check.js` | d0a9edf fix: bind saved acknowledgements to actor and committed source |
| `scripts/setup-save-actor-check.js` | 8e8a525 Fence setup Save to its captured profile through acknowledgement |
| `scripts/shared-assessment-result-check.js` | b280544 build: assemble audited session implementation reference in isolation |
| `scripts/upload-details-ui-check.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `scripts/upload-status-fixtures-check.js` | ac3e9cf R1-129 restore normal test App startup |
| `scripts/upload-ui-preview-check.js` | ac3e9cf R1-129 restore normal test App startup |
| `src/components/ui/AppIcon.js` | cba0cc4 R1-118 add isolated upload status phone preview |
| `src/components/ui/ScreenFooter.js` | ad01840 R1-119 show disabled upload control on creator Session Details |
| `src/components/ui/full_page_button.js` | ad01840 R1-119 show disabled upload control on creator Session Details |
| `src/data/draftSampleRemovalCodec.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `src/data/localDatabase.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `src/data/localSessionStateMigration.js` | bc4efc5 fix: fail closed for damaged setup and session contexts |
| `src/data/localTastingState.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/data/pendingDraftRemovalStore.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `src/data/pendingSampleAdditionStore.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/data/sampleCodeProfile.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/data/sessionRepository.js` | 8e8a525 Fence setup Save to its captured profile through acknowledgement |
| `src/data/userProfileRepository.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/features/cupping/components/AddCoffeeSampleSheet.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/AssessmentCupSelector.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/AssessmentFormIntro.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/AssessmentHeader.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/features/cupping/components/AssessmentResultSection.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/AssessmentSampleIdentity.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/CheckRemovalDialog.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `src/features/cupping/components/CheckSampleScreen.js` | 1be979c fix: defer sample membership until durable cup verification |
| `src/features/cupping/components/CoffeeSampleCard.js` | f823171 Activate newly locked creator samples only after tasting scan |
| `src/features/cupping/components/DefectsSection.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/LocalTastingActions.js` | cc7f51a Complete enrolled creator tasting against active sample coverage |
| `src/features/cupping/components/ScoreBalloons.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/SessionTitleSummary.js` | d747a31 ui: use standard typography tokens for compact session title |
| `src/features/cupping/components/assessmentCupLayout.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/components/focusNotesAboveKeyboard.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/constants/sessionDetails.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/features/cupping/data/cvaDefectPolicy.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/data/cvaResponse.js` | 3d5656f Default new CVA Uniformity to zero deduction |
| `src/features/cupping/data/cvaResponseStore.js` | d34a06f fix: derive active CVA progress from current saved ratings |
| `src/features/cupping/data/cvaScoreCalculation.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/cupping/screens/ActiveSessionScreen.js` | f79bb8d Keep creator setup Draft until explicit session Save |
| `src/features/cupping/screens/CanonicalCvaScreen.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `src/features/cupping/screens/CuppingScreen.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/features/cupping/screens/CuppingSessionDetailsScreen.js` | 0c5a17a Use a quiet blue text action for draft sample removal |
| `src/features/cupping/screens/CuppingSessionScreen.js` | 09da345 R1-130 finish local participant tasting and DRAFT preparation cards |
| `src/features/cupping/screens/activeSessionIdentity.js` | 63cba9e fix: support per-sample CVA modes in isolated client |
| `src/features/cupping/screens/savedSessionIdentity.js` | eeb2f2a fix: show bare code on pending blind card field |
| `src/features/forms/contract/fixtures/cva-v2.canonical.json` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/contract/fixtures/cva-v3.canonical.json` | 2ed5c8a Version independent CVA deductions and preserve historical v2 reads |
| `src/features/forms/contract/index.js` | 2ed5c8a Version independent CVA deductions and preserve historical v2 reads |
| `src/features/forms/contract/manifests/cva-v1.1.json` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/contract/manifests/cva-v1.json` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/contract/manifests/cva-v2.json` | 2ed5c8a Version independent CVA deductions and preserve historical v2 reads |
| `src/features/forms/contract/manifests/cva.json` | 2ed5c8a Version independent CVA deductions and preserve historical v2 reads |
| `src/features/forms/contract/manifests/legacy.json` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/legacy/LegacyCuppingScreen.js` | 897acd2 R1-117 allow scoped completed tasting edits on explicit save |
| `src/features/forms/legacy/LegacySampleCard.js` | f823171 Activate newly locked creator samples only after tasting scan |
| `src/features/forms/legacy/legacyCupSelection.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/legacy/legacyQualityPresentation.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/legacy/legacySaveQueue.js` | 19a9ef2 feat: preserve saved data with revision-qualified local tasting state |
| `src/features/forms/legacy/legacyScoreGridLayout.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/forms/sessionFormRoute.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/features/style-guide/components/ScoreRow.js` | b280544 build: assemble audited session implementation reference in isolation |
| `src/navigation/AppNavigator.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `src/services/errorLogger.js` | 10216c1 test: isolate sample-code phone write and verification slice |
| `src/services/nfcServiceMinimal.js` | e6b82a3 Implement verified scanned removal for creator drafts |
| `src/services/nfcTagClassifier.js` | e6b82a3 Implement verified scanned removal for creator drafts |

