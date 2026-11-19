# REL-TESTFLIGHT-001 — China factory demonstration build

Status: Build 6 enabled for owner-only internal TestFlight testing; owner feedback collection started 19 November 2026; acceptance outcomes remain pending.

## Owner field-test feedback — collected 19 November 2026

This section records Andrew's direct reports about the TestFlight app taken to China. It supplements the dated preparation history below; it does not infer a test pass, new product requirement, or authorization to implement a fix. The release associated with this record is 0.1.0 (6), but the installed version/build on each test phone has not yet been confirmed. Andrew previously identified app testing on 16 or 17 November; the exact date of the scenario below is not separately confirmed.

### TF-FB-001 — Two-phone CVA cupping session

- **Source:** Andrew, Project Manager chat, 19 November 2026: “I tested the app by running through a cupping session with two phones using the CVA form.”
- **Recorded observation:** Andrew ran through a cupping session using two phones and the CVA form.
- **Context not yet supplied:** Phone models/OS versions, per-phone installed build, creator/participant roles, cup/tag type and count, connectivity conditions, and detailed steps.
- **Outcome:** Not yet reported. Do not mark completion, cross-phone behavior, offline operation, blind isolation, persistence or sharing as passed from this statement alone.
- **Disposition:** Feedback intake in progress; capture Andrew's subsequent observations before defect triage or implementation scope.

### TF-FB-002 — Observation 1: repeated setup scans feel slow

- **Source:** Andrew, Project Manager chat, 19 November 2026, during feedback on the two-phone CVA test.
- **Reported experience:** Setting up a cupping session or adding a cup requires multiple scanning steps to check that the record was correctly written to the cup. Andrew finds this time-consuming and slow. No scan count or elapsed time was supplied.
- **Classification:** Usability/workflow-friction observation only, explicitly identified by Andrew as “just an observation at this stage.” This is not a reported write failure or a confirmed software defect.
- **Disposition:** Recorded for later consideration. No requested solution, prioritization, implementation task or change to the separate NFC verification requirement is approved by this observation.

### TF-FB-003 — Observation 2: reassignment warning is confusing

- **Source:** Andrew, Project Manager chat, 19 November 2026, with attached screenshot `Photo 1.jpg` showing the Session Details reassignment dialog.
- **Current wording shown:** Title: “Reassign Cup?” Body: “We can't check its previous session. Reassigning may interrupt it.” Actions: “CANCEL” and “REASSIGN CUP”.
- **Reported experience:** Cups often already contain an existing record. Andrew finds this message confusing and difficult to understand in that situation.
- **Requested improvement:** Make the message snappier, shorter and easier to understand. No replacement wording has yet been selected or approved.
- **Classification and disposition:** Copy/usability feedback for later scoped wording review. No app implementation has started. This feedback does not authorize removing the warning/confirmation or changing reassignment safeguards. The screenshot establishes the displayed wording, not the actual status of the cup's previous session or a failed reassignment.

### TF-FB-004 — Observation 3: future manual timer for ordinary NFC cups

- **Source:** Andrew, Project Manager chat, 19 November 2026, explicitly described as an idea for future improvement.
- **Reported gap:** During cupping with an ordinary NFC cup/tag rather than a Smart Cup, there is no timing function available to the taster.
- **Proposed interaction:** After the initial coffee smell assessment, when water is poured into the cup, the user could press a button to start a four-minute timer. Timing would be started manually rather than supplied automatically by Smart Cup hardware.
- **Classification and disposition:** Future enhancement idea, not a confirmed defect or approval to implement or change Release 1 scope. The Product Specification currently permits Release 1 without a brew timer; retain this proposal for later product consideration.
- **Details still open:** Exact placement and wording, whether the timer belongs to an individual cup/sample or the whole session, repeat/start/reset behavior, end-of-timer notification, and lifecycle/background behavior. Andrew's reference to aroma/smell does not by itself redefine the form's Fragrance/Aroma fields, scoring or assessment sequence.

### TF-FB-005 — Item 4: Square Mile's own form for the Smart Cup trial

- **Source:** Andrew, Project Manager chat, 19 November 2026; email research explicitly requested by Andrew.
- **Trial goal:** Square Mile should adopt the Smart Cups in their normal work and want to keep using them. Andrew anticipates that asking them to learn a different cupping form alongside testing the cups will create an adoption barrier. This is Andrew's assessment, not a new refusal reported by Square Mile.
- **Proposed improvement:** Provide a simple Square Mile-specific cupping form matching their established process for the Smart Cup trial.
- **Primary source located:** James Haydon, “Re: Smart Cupping Cup”, [26 June 2026](https://mail.google.com/mail/u/?authuser=andrewstordy%40googlemail.com#all/19f02fbea0f26f4b), clarified [1 July 2026](https://mail.google.com/mail/u/?authuser=andrewstordy%40googlemail.com#all/19f1c8ba21334a07). James describes a manually chosen overall score of 1–14, with below 7 a fail. Other attributes use -1, 0 or +1 as analytical notes/guides; they do not mathematically determine the overall score. His July reply confirms no direct calculation and explains that the team is accustomed to this system. Emails were read; unnecessary correspondence and personal contact details are not copied here.
- **Form reference:** The June email includes `Screenshot 2026-06-26 at 09.08.51.png`, a sheet using a fictional coffee. Attachment located/retrieved through Gmail, but its fields have not yet been visually transcribed or validated. Exact attribute names, allowed overall-score increments, required entries and other behavior remain to confirm from the source before any implementation.
- **Classification and disposition:** Proposed trial-specific enhancement, recorded for scope/design assessment. Current Release 1 specification and NDEF mappings support exactly CVA and Legacy; adding this form needs an explicit approved trial/release boundary, immutable form identity and reviewed protocol/compatibility design. Do not relabel it as CVA/Legacy, reuse their identifiers, invent a new production NDEF value, or silently extend Release 1. No specification/app changes or contact with James authorized/performed during feedback capture.

### TF-FB-006 — Item 5: perceived delay saving and opening forms

- **Source:** Andrew, Project Manager chat, 19 November 2026, referring to the latest TestFlight version taken to China.
- **Reported experience:** After pressing Save, the form takes some time to save. After scanning a cup, the form takes some time to open.
- **Classification:** Performance/usability observation affecting two distinct interactions: form save and scan-to-form opening. This is separate from Item 1's repeated setup/write-verification scans.
- **Evidence limits:** No timings, frequency, phone model/OS, per-phone build, sample count, logs or reproduction steps supplied yet. The preceding test context was two-phone CVA, but do not assume the delay is limited to CVA or occurs on both devices. No cause, regression comparison, lost data or failed save has been established.
- **Disposition:** Recorded for later measurement and diagnosis. No implementation started; a UI acknowledgement alone must not be treated as a completed durable save.

## Owner and Apple confirmation — 29 October

Owner leaves tomorrow (30 October); distribution only to their own phone through internal TestFlight. Owner completed personal Apple login. App Store Connect stordy_cup (6762091756) lists 0.1.0 builds 1–5, latest build 5 uploaded June 25, expired. Personal Apple Developer account confirms team 6W675PGM38 and agreement accepted October 8; earlier ASC banner may be stale. Do not accept any new agreement automatically.

Prepare 0.1.0 (6) in this isolated branch by changing only app.json iOS buildNumber and the two native CURRENT_PROJECT_VERSION values. Public version and Android unchanged. Release provenance will be an independently reviewed named release tag based on main 8c0c49b3, with metadata/documentation-only delta; main checkout stays untouched. No product feature changes or upload integration. Existing EAS production/store route selected; do not auto-submit before artifact review.

### Build 6 dispatch

Independent reviewer /root/testflight_release_review approved exact commit 39968ff380fad6f341b2d42713cffba02de269aa for named tag china-demo-ios-0.1.0-6 and an EAS production/store build without automatic submission. Version check and both actual upload UI checks PASS; runtime src tree remains 07bfbbf195ff2ee3340d23af9376a92169c1917e, equal to main. Tag created locally at that exact commit.

Dispatched EAS build 505b55ab-5280-4d06-a638-f897de55160a using production, non-interactive, freeze-credentials, no-wait; no auto-submit. Existing remote distribution certificate/profile selected, personal team 6W675PGM38, com.andrewstordy.cup, expiry June 24, 2027. EAS explicitly skipped Apple-side certificate/profile validation in non-interactive mode; actual signed artifact remains to inspect. Project archive uploaded 7.0 MB. No credentials regenerated, no agreements accepted by agent, no main or runtime changes. Expo build page: https://expo.dev/accounts/andrewstordy/projects/cup/builds/505b55ab-5280-4d06-a638-f897de55160a

EAS build query confirms source 39968ff380fad6f341b2d42713cffba02de269aa, production/store, 0.1.0 (6). App Store Connect existing internal group cup_0.1.0_testers has exactly one tester, the owner's personal Apple account. Reuse this group for owner-only installation; do not add the build to the external group.

Submission-only configuration prepared after build dispatch: eas.json submit.production.ios.ascAppId = 6762091756, the existing stordy_cup record observed in the signed-in personal ASC account. Avoids automatic app-record discovery/creation or selecting another app. This does not change the build profile, tagged source, app binary or working main. Requires independent review before submission; never generate new ASC credentials silently.

### Signed artifact — 29 October

EAS build finished 12:09:27 UTC. Binary preserved at output/testflight-build-6/cup-0.1.0-6.ipa in this external workspace (ignored build output), 11,343,248 bytes, SHA-256 2670426c46853a350fc402051adcf8d3abf97e392815b9c90bcec6b60f3bc69e. Initial attempt to create a new directory at the external volume root failed permissions; Python's separate TLS trust store also failed verification. No TLS bypass used. Download succeeded with system curl into the owned external workspace.

codesign --verify --deep --strict PASS. Signed app: com.andrewstordy.cup, 0.1.0 (6), team 6W675PGM38, application identifier 6W675PGM38.com.andrewstordy.cup; get-task-allow false; NFC formats [TAG]; distribution profile expires June 24, 2027 with no ProvisionedDevices; minimum iOS 15.1. Bundled main.jsbundle present, 3,326,807 bytes. This establishes embedded JavaScript, not physical cold-start or NFC success. Submission-only target change d914664 independently PASS reviewed. Independent signed-artifact review requested; exact build submission only after that passes.

### Submission

Independent signed-artifact review /root/testflight_release_review PASS: independently hashed IPA, verified signature with macOS trust services, decoded embedded profile, confirmed team/version/TAG/JavaScript and disabled upload source. Approved exact EAS build 505b55ab-5280-4d06-a638-f897de55160a to existing CUP app 6762091756 for owner-only internal testing. Does not certify hardware success or Pilot-Ready status.

Submitted that exact build with eas submit --platform ios --profile production --id 505b55ab-5280-4d06-a638-f897de55160a --non-interactive --no-wait. Existing EAS-hosted App Store Connect API credential reused; no new credential generated. Submission 39a71987-4360-43fb-8eee-d8e908cf84e6 scheduled successfully. Scheduling is not proof of Apple delivery/processing or installation. https://expo.dev/accounts/andrewstordy/projects/cup/submissions/39a71987-4360-43fb-8eee-d8e908cf84e6

Apple delivery confirmed in signed-in App Store Connect: Build Uploads row 0.1.0 (6), Processing, created October 29 at 12:13 PM. No further credentials or agreement changes required for delivery. Processing/compliance, adding to the owner's internal group and installed-phone smoke remain pending.

Apple now lists Build 6 (Apple build UUID c83d9d87-b0e4-45bf-91d7-2c7bfe165f18), Missing Compliance. Manage opens encryption questionnaire. Selected 'None of the algorithms mentioned above' based on current source/dependency review (random identifiers/hashing, OS-provided services; no app cipher implementation found). Apple official documentation distinguishes OS-only encryption from app-provided encryption: https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption . No Info.plist declaration or runtime change made.

Saving this selection was rejected by automatic approval review because it is a consequential export-compliance declaration without specific owner authorization. Do not bypass it. Owner asked to review and press Save personally; dialog left open. Apple declaration is NOT recorded as submitted. Once owner completes it, verify status and add only to existing one-person internal group; no need to rebuild the IPA.

### Owner access confirmed — 29 October

Owner reported saving the compliance declaration. Verified signed-in ASC no longer shows Missing Compliance. Existing internal group cup_0.1.0_testers now has 1 Tester / 1 Build; its Builds tab lists 0.1.0 (6), status Testing, expires in 90 days. Its sole tester remains the owner's personal account. The build became available automatically following the owner's action; no additional access mutation or external-group assignment was needed. Owner can open TestFlight under that Apple account, select stordy_cup and install/update build 6. No additional compliance action is required. Main and results-upload behaviour unchanged. Physical installation, cold start, NFC and offline persistence remain owner checks.

## Installed-phone acceptance handoff

Use TestFlight's stordy_cup app, version 0.1.0 (6); installed app remains CUP/cup. Install over the existing app; do not uninstall or clear its storage. Owner-only internal group, no external distribution. Do not represent the previous dev-client acceptance as acceptance of this signed Release binary.

Minimal trip checks once installable: (1) fully close/reopen without Metro or the Mac connection; (2) scan the production-firmware Smart Cup and perform the intended demo flow, including separate verification if assigning a sample; (3) turn Wi-Fi/mobile data off, save a rating/note, close/reopen and confirm the same sample/code/result survives. Upload must stay disabled. Record owner results and any observed replacement/install data behaviour, not assumptions. No broad re-run of previously completed phone scripts required unless these checks reveal a regression.

## Authority and scope

Owner request: prepare an installable TestFlight version for a ten-day China factory trip. Upload behaviour must remain disconnected. This is a bounded pre-release demonstration of the existing installation-local app, not a claim of Pilot-Ready or full Product Specification Release 1 conformance.

References: PRODUCT_SPEC sections 5.1 and 6 (offline setup/tasting, explicit sharing); NDEF_PROTOCOL integrated sample-code profile; AI_DEVELOPMENT_OPERATING_MODEL sections 8–13; README Building For iPhone.

Objective: identify a reproducible signed Release build from merged main, distribute through the owner's CUP Apple account, and verify installed operation without Metro before travel.

Non-scope: product features, upload/queue/network behaviour, NFC or persistence changes, dependency upgrades, UI changes, deletion of phone data, and changes to the working main checkout.

Expected files: this task record; release metadata/configuration only if a new build number is required and separately reviewed. No runtime files currently assigned.

Author/Release Manager: root agent. Required independent reviewer: different agent instance covering release provenance, QA evidence and distribution configuration before distribution. Any discovered runtime change returns for separate scope and specialist review.

Risk: medium (signing, credentials and installing over the same bundle ID). Dependencies: personal CUP Apple Developer account, App Store Connect record/build history, signing capability, TestFlight access. Do not use IKAWA team. Owner enters credentials and accepts legal/account decisions personally.

Branch/worktree: codex/china-testflight at /Volumes/external/codex-worktrees/china-testflight/cup_app. Source main: 8c0c49b3a8110cb80aab696561efac16946c2319. Main clean at preparation start. Release must identify its main commit/tag, configuration, version/build and destination.

## Acceptance criteria

- Confirm previous uploaded build number before choosing the next one; maintain app/native version consistency.
- Confirm signing team, bundle ID com.andrewstordy.cup and NFC TAG entitlement in the signed artifact.
- Produce a standalone Release build; no Metro requirement.
- Verify upload UI remains disabled with no sending/queueing connection.
- Preserve existing files and phone records; do not uninstall or reset the app as a preparation shortcut.
- Record actual archive/distribution result and independent review before claiming readiness.
- Owner-installed TestFlight smoke: cold start without Metro, scan Smart Cup, write/separate verification, save/reopen and offline tasting. Software checks cannot establish physical NFC success.

## Initial evidence and decisions

- Version consistency script PASS on source main: iOS 0.1.0 (5), Android 0.1.0 (1).
- Xcode 26.3 (17C529) installed. Existing EAS CLI 15.0.15 installed; no upgrade performed.
- Existing EAS production profile is store distribution; local version source. Existing manual Xcode route documented.
- Initial EAS auth query failed due sandbox DNS restrictions; no inference about account authentication from that failure.
- Existing merged-main phone acceptance recorded in conversation; new signed Release/offline device acceptance remains outstanding.
- Historical 28 test failures remain recorded debt in R1_149_FINAL_INTEGRATION_AUDIT; do not describe the full historical suite as green.

### 29 October live preparation checks

- Expo account query succeeded with network permission: andrewstordy; linked CUP project a80a13f3-0ccf-4040-b71e-ed285585e160. Latest three EAS iOS builds are production/store 0.1.0 builds 5, 4, 3. Latest build 5: 3215df9f-7815-4cea-8648-5c62dd9a4467, source 50744ed3198ab3ea2fbafb3e5a3264f1250aae08, June 25. This is not proof of the latest App Store Connect upload; verify ASC before assigning a new number. No credentials or artifact URLs copied into this record.
- App Store Connect opened to its sign-in screen. Owner must complete personal CUP sign-in; no account creation, agreements, credential entry or submission performed by the agent.
- Current source main: check-app-version.js PASS; upload-details-ui-check.js PASS; session-card-upload-label-check.js PASS. Details footer has primaryDisabled and no upload onPrimaryPress.
- upload-status-fixtures-check.js FAIL: historical source freeze compares all src/App.js against ac38154. Keep this recorded as a failed historical guard, not a successful end-to-end upload check. No test or source changes made to suppress it.
- New release workspace has no node_modules/Pods installed. Prefer existing configured EAS store build route once Apple build number/signing history is confirmed, avoiding a new local dependency installation on the internal disk.
- Independent release-preparation reviewer assigned: /root/testflight_release_review. Artifact/signing and installed-phone gates remain unverified.

### Independent preparation review

/root/testflight_release_review: PASS for preparation scope; distribution pending remaining gates. Reviewed unchanged runtime/config source at main 8c0c49b3, version consistency, store profile, disabled upload binding and TAG entitlement. Keep README's imprecise NDEF/TAG wording from causing a capability change. No feature expansion needed. Required remaining gates: ASC latest build/personal team; reviewed version metadata with named-main/tag provenance; signed Release artifact inspection; Apple processing/compliance; owner-installed physical offline/NFC check. Review does not certify any archive or hardware result. Preparation record commit 1fa054e adds documentation only; runtime/native/config remain equal to source main.

## Handoff / remaining gates

Inspect live account/build history, select build route, run relevant software checks, obtain independent release review, produce/upload signed artifact, and record installed-phone verification. No main changes, signing mutations, tag writes or upload submission have occurred in this task.
