# REL-TESTFLIGHT-001 — China factory demonstration build

Status: Preparation in progress; no archive or upload yet.

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

## Handoff / remaining gates

Inspect live account/build history, select build route, run relevant software checks, obtain independent release review, produce/upload signed artifact, and record installed-phone verification. No main changes, signing mutations, tag writes or upload submission have occurred in this task.
