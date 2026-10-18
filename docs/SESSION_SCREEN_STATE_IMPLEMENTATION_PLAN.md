# Session screen and state map — implementation plan

Date: 18 October 2026

Status: proposed implementation sequence; documentation approved for preparation, application changes not yet authorised.

Task: [R1-059](tasks/R1-059.md)

## Scope and authority

Implement the agreed creator and participant experience in [Product Specification section 6.8](PRODUCT_SPEC.md#68-agreed-mobile-screen-and-state-map-18-october-2026). That specification governs behaviour; this plan sequences the work, rather than creating another source of product policy. Technical and visual constraints remain in the [architecture contract](RELEASE_1_ARCHITECTURE_DATA_CONTRACT.md), [NDEF protocol](NDEF_PROTOCOL.md) and [UI style guide](UI_STYLE_GUIDE.md).

Keep the original session controls. Do not add a second completion action to the assessment form, wrap the nine CVA score inputs, change scoring rules, or redesign unrelated screens. Upload is a real consented service operation, not a placeholder success action.

## 1. Establish and preserve the implementation baseline

The documentation branch starts at main `34f95a8119574557e5e67cc5246888a9d1c089c4`. The reviewed phone checkout is a different, unmerged history: tag `phone-verification-2026-10-18-r1-057`, peeled commit `6e392c1081b9cff72d199307e51ca8136e117df5`, runtime checkpoint `701b555`. Do not assume main contains the phone functionality, or import the whole feature stack without an integration audit.

Before coding, produce a commit/file inventory of the phone stack and select a reviewed implementation base. Check dependencies and earlier task ownership, run its existing regression checks, and record which capabilities are present versus still proposed. Preserve the live phone checkout, Metro, database, profile ID, sessions, pinned historical calculations and saved results. No reinstall or reset is a migration strategy.

Sampled phone evidence already shows two changes are needed: retained completion-row existence currently drives old monotonic completion, and `assertUnstartedWithDb` prevents setup changes after tasting starts. Neither implements the newly agreed contract. Main lacks the phone's `src/data/localTastingState.js`. A functioning consent/outbox/backend pipeline has not been established by this audit; older descriptive architecture tables are not proof of the current runtime.

Initial files to audit, not blanket permission to edit:

- Local model: `src/data/localDatabase.js`, `sessionRepository.js`, `localTastingState.js`, `userProfileRepository.js`.
- Assessment persistence: `src/features/cupping/data/cvaResponseStore.js` and the Legacy persistence path discovered in the selected base.
- Screens: `CuppingSessionScreen.js`, `CuppingSessionDetailsScreen.js`, `ActiveSessionScreen.js`, `CanonicalCvaScreen.js`, and `src/features/forms/legacy/LegacyCuppingScreen.js`.
- Shared presentation/navigation: `LocalTastingActions.js`, session-detail constants, existing footer/icon components and `src/navigation/AppNavigator.js`.
- NFC: `src/services/nfcServiceMinimal.js`, `nfcTagClassifier.js`, serializers and assignment-recovery storage found during the audit.

Each implementation slice needs its own canonical task record before edits, with exact file/interface ownership and independent review. Resolve shared schema, repository API, DTO and navigation contracts before parallel implementation; do not let separate tasks redefine them independently.

## 2. Build the local state and revision foundation

Design a forward migration and repository-level transitions that separate:

- Per-session creator provenance from participation and from permission to delete a local copy.
- Persisted setup state and unsaved/recovery drafts from explicit Save.
- Durable ever-started and ever-completed history from current-revision completion.
- The local sample roster from a creator's roster or a previously uploaded snapshot.
- Current saved result/coverage revision from queued immutable snapshots and acknowledged revisions.

Choose and document the revision/coverage identity and migration schema before coding dependent screens. Preserve original profile IDs, unknown historical authorship, saved scores, notes and calculation pins. Do not automatically claim old responses, recalculate them, complete a tasting or reveal identities during migration. Any legacy adoption must remain explicit and separately tested.

Implement transitions transactionally at the data boundary, not just by hiding buttons. Empty creator Save persists a visible DRAFT. Verified setup with samples saves to PENDING, or returns to IN PROGRESS if tasting has already started. An opening or recovery autosave is not the first saved score/note. Temporary DRAFT must not reset started history or unlock metadata already written to cups. Setup stays locked after the creator has ever completed their tasting.

Gate: migration fixtures and repository tests cover both roles, all states, permitted setup edits, locked assigned metadata, crashes and transaction failures. Existing saved totals and provenance remain unchanged. Update descriptive schema documentation only when the migration is actually implemented.

## 3. Implement assessment, roster and blind-view transitions

Use the same state rules across CVA and Legacy save paths and all relevant identity projections. First explicit saved score or note starts tasting. Complete Session validates required saved scores for the remaining local roster and gives an immediate explanation when incomplete; notes do not become mandatory.

Saving changed results after COMPLETE returns to IN PROGRESS, hides blind details again and invalidates the current uploaded-success indication. Merely opening, typing or discarding unsaved changes preserves the committed COMPLETE state. Retain the existing Leave/Stay warning for unsaved setup or form changes.

Participants add only samples they physically scan; retain assigned sample numbers and do not enumerate an unseen creator roster. Rescanning an existing sample opens it without duplication. Adding a new sample, or confirming local removal after completion, reopens that local tasting. Removing the last sample leaves a visible IN PROGRESS session with Scan Cup and no ability to complete until another sample is added and scored. Saved responses for other samples remain intact.

Gate: data and screen tests cover creator preparation visibility, started temporary DRAFT, current completion/re-hiding, partial results, saved notes, local membership changes and reopen/restart. Test Home scans, session scans, sample cards, expanded cards and assessment headers. Hiding is a presentation rule, not a claim to erase information already seen.

## 4. Implement physical NFC consistency and recoverable setup

Before implementation, resolve exact unassignment bytes and how additions/removals keep all affected physical `i`/`z`/`y` assignment values consistent. Review serializer, journal, firmware/tag compatibility and affected-cup coverage together. Do not silently add wire fields or treat cached counts as verified physical consistency. This is a prerequisite technical contract/conformance gate, not an unresolved UI workaround.

Durably stage the intended operation before writing. A failed staging transaction must prevent the external write. Require a separate physical re-scan to verify cup identity and the complete intended canonical data; the write callback alone is insufficient. Preserve smart-cup records 1/3 and existing record-2 behaviour, and the NTAG protocol.

Leaving or restarting with an unfinished operation preserves recovery and resumes verification by reading, not by automatically rewriting. Keep the setup DRAFT until verification and successful session Save. If the cup changed but final persistence fails, retain the durable intent and retry idempotently without duplicate assignment or unnecessary writes. Mismatches remain unfinished and require an explicit recovery decision.

Creator removal of an assigned cup while retaining the session requires a physical clear and verification before reassignment. Participant local removal and whole-session local deletion must never use that physical-removal path.

Gate: injected failures at every journal/write/read/commit boundary, restart tests, duplicate callbacks and mismatched tags. Then record real-device, OS, tag type and applicable firmware evidence for assign, remove, reassign, write-success/save-failure, interrupted verification and radio failures. Simulations and bundling cannot satisfy this gate. Keep NFC workflow changes separate from unrelated visual work.

## 5. Implement local deletion and restore the agreed screens

Provide the session-list delete cross in every state for both roles. Confirm local session/results deletion; specifically warn when it cancels a pending upload. Atomically remove the local copy and pending verification, cancel queued work and prevent stale callbacks or worker restart from recreating it. Do not scan or change physical cups, another profile/device's copy, or already accepted remote results.

A request already in flight may have reached the service before local deletion. Design cancellation and acknowledgement handling honestly: stop local retries and ignore stale local callbacks, without promising to unsend a remotely accepted request. Keep tenant/service erasure and retention policy separate from local-copy deletion.

Align the screen mockups to the final normative map and freeze them for review before screen edits. Restore original Complete Session / Scan Cup session-level controls, with original Upload / Scan Cup on COMPLETE for both roles. Keep assessment controls and score rows unchanged. Blue denotes physical-cup actions; Save, Complete, Upload and upload status use the established neutral treatments. No new main actions.

Gate: deletion in every state, pending verification, queued/in-flight uploads, confirmation cancel, participant removal and last-sample cases; no NFC writes or service-delete calls. Independently review screenshots of each role/state, accessible warnings and unchanged single-row CVA inputs. Upload controls/status must not claim functioning transport before the following gates are met.

## 6. Deliver explicit-consent upload end to end

### Contract and service prerequisites

Design the outbox schema, immutable snapshot/operation identity, consent evidence, revision ordering, active-roster representation, durable acknowledgement and retry/cancellation interfaces together. Scope ordering to the verified participant/session/response stream; do not use arrival time or device wall clocks as a global last-write-wins rule. Resolve cross-device ordering and conflicts explicitly.

Service ingestion must accept retries idempotently and retain raw/audit history while projecting the latest accepted revision. Late older submissions cannot overwrite newer results. A previously consented snapshot containing a subsequently removed sample must not repopulate the local roster; define how newer full snapshots represent membership removal without confusing audit history with active results. Preserve tenant isolation, authorization, encryption, PII/retention and service-erasure requirements. Local profile IDs are not backend credentials. Deployment/provider/account requirements remain separate release gates.

### Consent, replacement and delivery

Only pressing Upload for a completed saved tasting authorizes a snapshot. Offline presses durably queue it; reconnect may deliver that consented snapshot, but never create new consent. Existing queued snapshots remain eligible after later local edits. Saving, completing or returning online must not implicitly authorize revised results.

After revised results are completed, pressing Upload when previous queued or uploaded results exist shows the agreed replacement confirmation referring to both. Yes creates a new consented operation and immutable snapshot; supersede unstarted older work safely without changing its identity/bytes. No retains existing queued/remote results. Account for an older request already in flight.

Wire the existing grey Upload control to this real flow only after the service/auth and local outbox prerequisites pass. Show a grey cloud-clock for pending authorized work, including an older snapshot, and cloud-check only for durable acceptance of the current saved revision. An old acknowledgement cannot restore a current cloud-check. Use accessible status text; icons are not extra buttons. Queue insertion, connectivity or a response lacking durable acceptance is not upload success.

Gate: online/offline consent, crash/restart, replacement Yes/No, duplicate retries, old/new arrival permutations, membership removal, local deletion races and cross-profile/tenant rejection. Verify real accepted results and current-version icons, not a mock success toast. If service prerequisites are unavailable, report upload as blocked rather than shipping a fake action or silently changing scope.

## 7. Integrate and verify a phone candidate

For each slice, run existing regressions plus new transition/failure tests against its exact source commit. Preserve valid assertions; replace obsolete monotonic-completion or pre-start-only assertions with tests traced to the approved specification. Particularly retain score/calculation preservation, ownership guards, atomic saves, form routing, blind identity, notes keyboard, score-card rendering, saved session names and NFC robustness checks.

Before a candidate, independently review the prospective integrated tree and reconcile the specification, implemented schema and task handoffs. Record automated results, build/export checks and any known gaps. Prepare an isolated, identifiable phone candidate without changing the existing verification tag or resetting user data. Do not claim a main merge or phone release from a documentation commit.

Phone acceptance should proceed in short scripts:

1. Creator: save an empty DRAFT; assign and verify cups; save PENDING; open without starting; save the first score/note; confirm IN PROGRESS and hidden identities.
2. Creator: permitted addition/removal and recovery; Save restores the correct state; assigned metadata stays locked; post-completion setup remains locked.
3. Both roles: complete only after required local results; reveal; save an edit and re-hide; discard an unsaved edit without changing committed state; complete again.
4. Participant: scan only selected samples; rescan without duplication; add/remove after completion; remove the last sample and retain an uncompletable local session.
5. Both roles: delete cross and confirmations in every state; pending verification and upload deletion warnings; ordinary Leave preserves verification, deliberate Delete discards it without touching the cup.
6. Both roles: COMPLETE keeps Scan Cup and grey Upload; offline consent/queue, real acknowledgement, edit invalidation, replacement confirmation and late-older-ack behaviour.

Record separate physical NFC results; do not substitute automated checks for hardware verification. Approval of one slice does not establish upload, firmware or production readiness for the others.

## Recommended starting point and release boundaries

Start with the baseline audit and state/revision migration design, then implement the local foundation and assessment/roster transitions. Resolve the physical counter/unassignment contract before NFC workflow implementation, and the authenticated snapshot/revision contract before upload implementation. Deliver screen changes against those foundations, not ahead of them.

Completion of this documentation task does not start any of those implementation slices. No runtime, database, physical cup, existing phone version or backend is changed by this plan.
