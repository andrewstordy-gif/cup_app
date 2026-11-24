# UI-LEGACY-008 — Compact Legacy cup-count summary label

- **Status:** Compact count-subtitle software integrated and exact post-merge checks PASS, 24 November 2026. Owner phone appearance check pending.
- **Objective:** Replace only Legacy card's long collapsed/header result-label line with an accurate compact physical cup-count label. Non-five counts use `Adapted · N cup(s)`; five uses `5 cups`. The mockup's one cup is illustrative, never a fixed count or authority to mark a five-cup standard score as adapted.
- **Authority:** PRODUCT_SPEC §6.6 independent Legacy scoring, 1–8 cups, non-five totals explicitly adapted and extended-scale provenance; §6.8 card/inactive identity and lifecycle. UI_STYLE_GUIDE score summaries/typography. Existing full-card mockup `sample-drawers-rotated-headers.html` is visual guidance only. No NDEF/form-version/contract change.
- **Base:** verified clean main/origin 1c73a45897af9c98234fc96ae9df7856fe435b5a. Branch `codex/ui-legacy-008-summary-label`, worktree `output/worktrees/ui-legacy-008`.
- **Scope:** src/features/forms/legacy/LegacySampleCard.js, legacyCardPresentation.js only if needed for a presentation helper; scripts/legacy-sample-card-check.js bounded label tests; docs/UI_STYLE_GUIDE.md bounded label sentence if needed; this record. Release Manager owns scoped CHANGELOG entry.
- **Non-scope:** CVA, geometry/rotation, totals/scoring, stored values, manifests/pins/hashes, inputs, notes/defects, access/identity, NFC/storage/network/native build/install/data operations. No broad cleanup or refactor.
- **Risk/review:** Low presentation risk. Temporary author legacy_card_stage1; different independent reviewer legacy_card_review covers code/QA/UX and inactive/data-source boundaries. Release Manager legacy_card_release handles protected integration after PM go.

## Acceptance criteria and decisions

1. Use the authoritative physical cup count already available in the validated saved result/session sample. Establish its source, never infer count from scored/qualifying cup sets or hardcode the mockup. Validate integer 1–8. Unavailable/invalid count must not invent one; preserve safe existing provenance fallback if needed.
2. For saved scored cards, non-five displays `Adapted · 1 cup` or `Adapted · N cups`; five displays `5 cups`. Keep existing visibility rules: inactive/loading/failed contexts must not show stale scoring provenance/count. No new database/network reads.
3. Preserve the full canonical result label and extended-scale note in the expanded Final score section; do not alter the scoring contract or erase interpretation provenance. Existing full final-result layout unchanged.
4. Match the approved compact secondary line (existing caption typography, trailing alignment as mockup where practical, existing tokens). No font-size responsive scaling or score-row height change.
5. Focused tests cover 1/2/5/8, invalid/missing source, no inference from selected checks, expanded canonical label and inactive/prop transitions. Run existing Legacy and CVA card regression, current participant parity and explicit-source iOS JS bundle on exact source. No unrelated fixture repair.
6. Durable independent PASS and proportionate review required. Release Manager runs prospective current-main validation before protected head-matched PR merge and exact post-merge checks. Main remains usable; no direct main push. Refresh existing normal-main Metro after integration. Phone appearance remains pending until Andrew reports it.

## Implementation / review / release handoff

### Author handoff

- **Author:** /root/legacy_card_stage1. Changed only the two declared Legacy presentation files, bounded existing Legacy probe, one guide paragraph and this task. No numeric/font token, score geometry, CVA or data/NFC code changes.
- **Authoritative count:** Existing getLegacyResponseWithDb compares saved row.cupCount to sample.cupNumber, then validates/scores with that physical count. Existing scoreResponse returns it as result.cup_count. The private card helper now derives summaryLabel only from a complete/ok result whose count is an integer1–8; no selected cup set, sample-number guess, hardcoded mockup count or new read is used. Invalid/unavailable count retains result.label as the safe collapsed fallback.
- **Appearance/provenance:** Collapsed line uses existing caption typography, sentence case and trailing alignment, displaying Adapted ·1cup / Adapted ·Ncups or5cups with normal spaces. The existing full canonical resultLabel and extendedNote fields/rendering in expanded Final score are unchanged. Existing current-snapshot/inactive/loading/error gates also govern the new label.
- **Tests before commit:** Existing Legacy actual-component/pure/lifecycle probe PASS with added1/2/5/8 count labels, strict invalid/missing fallback, no inference from zero qualifying cup sets, caption styling, full canonical/extended expanded provenance, inactive/loading/failure hiding and late stale-count replies. All rotation/geometry/pooled-event checks retained.
- **Changelog-worthy:** Legacy compact saved-score subtitle now shows the actual physical cup count with Adapted for non-five samples; full scoring provenance remains in expanded details.
- **Limits:** No actual phone/VoiceOver/NFC check, new binary/install, data operation, main or Metro change. Phone appearance remains pending after protected integration and usual-main refresh.

Exact tests/bundle, independent review, prospective/PR/merge/post-merge evidence and Definition of Done disposition follow. All operating-model gates must be PASS or justified N/A before merge; this JS-only label change is not full-device or pilot verification. Author performs no push/merge/changelog/Metro/native action.

### Exact author validation —24 November2026

Runtime **9dc909db23303bf4ee11253997a3e3b422374ba6**, clean tree during checks; reused verified Node22.14.0 at `../ui-legacy-002/output/node22/node-v22.14.0-darwin-arm64/bin/node`.

- `node22 scripts/legacy-sample-card-check.js`: **PASS**, count1/2/5/8 and invalid/missing fallback, zero qualifying-set non-inference, compact caption styling, expanded canonical/extended provenance, inactive/loading/error/stale-count transitions and retained geometry/lifecycle/native-event regressions.
- `node22 scripts/cva-sample-card-check.js`: **PASS**, unchanged CVA/default-summary/inactive/formatting/measurement behaviour.
- `node22 scripts/participant-parity-finish-check.js`: **PASS**, all eight existing SQLite/two-device/UI-parity groups.
- `node22 node_modules/expo/node_modules/@expo/cli/build/bin/cli export:embed --entry-file output/stage1-entry.js --platform ios --bundle-output output/ui-legacy-008-ios/main.jsbundle --assets-dest output/ui-legacy-008-ios --dev false`: **PASS**,771modules/fourassets. Ignored entry explicitly registers candidate `../App`. Bundle SHA256 **efc300b302a26f99ce7ed30a174f8d0d7473ce35ca354ef15dc1f2cab8735aae**. JavaScript validation only, no native build or installation.
- `git diff --check`: **PASS**. Five declared files only. No new reads, schema/protocol/scoring/geometry/shared-font/CVA changes; canonical-contract amendments N/A for this display-only label.

Author software handoff PASS; independent code/QA/UX review, protected prospective integration/PR/merge/post-merge and final Definition of Done remain pending. Physical NFC/native build/data gates N/A for this JS-only/no-data-read change; actual phone appearance/VoiceOver is not claimed and owner appearance check remains pending after integration. Documentation-only evidence commit follows runtime9dc909d.


### Independent review — 24 November 2026

**Reviewer:** /root/legacy_card_review, a separate agent instance from author. **PASS** for code, scoped QA, UX/accessibility structure and inactive/data-source boundaries at runtime **9dc909db23303bf4ee11253997a3e3b422374ba6**. Author evidence **cc63129** is documentation-only; task tree was clean before this review record. No unresolved findings within the approved scope.

- Independently ran Legacy sample-card regression, CVA sample-card regression and all eight current participant-parity groups with verified Node22: **PASS**. Added assertions cover physical counts1/2/5/8, strict missing/invalid fallback, no inference from zero qualifying sets, preserved expanded canonical label/extended-quality note, caption token/alignment and loading/inactive/failed/late-response suppression. Existing geometry, deferred pooled-event, lifecycle and CVA/default-row assertions remain intact.
- Confirmed source authority directly: getLegacyResponseWithDb checks persisted count against the session sample and passes it to validation/scoring; scoreResponse returns that same physical count as result.cup_count. Presentation reads only that complete/ok result field, validates integer1–8, and never uses response cup-check arrays. Five is accurately unqualified `5 cups`; non-five is visibly `Adapted`. Missing/invalid counts preserve the existing canonical provenance. No new reads or changes to scoring, inputs, storage, NFC, CVA or numeric geometry.
- Existing current-snapshot gates suppress the new subtitle before effects settle, and inactive cards never render it. Expanded full resultLabel/extendedNote rendering is unchanged. Caption uses existing12/600 inkSoft token, sentence case and trailing alignment, with no responsive font scaling or control/accessibility-role changes. Full native VoiceOver interaction was not tested.
- Proportionate visual check: actual LegacySampleCard/helper source rendered through React Native Web in a true320pt iframe. Visually inspected the trailing `Adapted · 1 cup` caption and unchanged complete score row; all eight numeric frames remained contained. Artifacts and reproducible renderer are under ignored `output/ui-legacy-008-review/`, including `ui-legacy-label-320-owner.png` and DOM/HTML. Renderer injects an existing-style committed saved snapshot and macOS AppKit glyph fixtures, substitutes native hosts/icon leaf, and uses synthetic width/fontScale. This is browser corroboration of layout, not actual iOS/VoiceOver/NFC acceptance.
- Independently verified candidate bundle SHA256 **efc300b302a26f99ce7ed30a174f8d0d7473ce35ca354ef15dc1f2cab8735aae**, matching the exact author's explicit-source771-module/four-asset export. No redundant native build or installation performed. `git diff --check` PASS; only declared presentation/test/guide/task files differ.

**Yield:** Task record is yielded to Release Manager after this documentation commit. Software PASS permits the required current-main prospective checks and protected, head-matched PR process; it is not merge completion or pilot approval. Phone appearance remains pending after exact post-merge checks and clean normal-main Metro refresh. Native build/signing/data/NFC gates are N/A for this bounded JS-only subtitle change; no physical or accessibility-device verification is claimed.

### Release preparation

- Release Manager `/root/legacy_card_release` verified durable independent PASS **789fc254180570363ac2b3dc299e0e466c60a55c** for runtime **9dc909d** and author evidence **cc63129**, satisfying conditional PM go. Release edits add only this record and scoped changelog; no source/test/guide amendments.
- Current live main **1c73a45897af9c98234fc96ae9df7856fe435b5a**. Required process gates remain durable independent approval, current-main prospective validation and protected exact-head PR integration; technical zero-review/no-CI configuration is not sufficient evidence by itself.
- Required checks stay proportionate: Legacy and CVA card regressions, current participant-parity suite and explicit candidate iOS JavaScript bundle. No unrelated fixtures, six-gate reruns, native build/install/data/backup/version or Metro actions. Root PM owns normal-main synchronization/client refresh after software post-merge PASS; actual phone subtitle acceptance remains pending.

### Prospective validation / software integration approval

- Isolated prospective checkout tested **7835e8f4c42ddaeebedce1bb3b86ad605fd6012f** against freshly fetched current main **1c73a45897af9c98234fc96ae9df7856fe435b5a**, before main changed. Main is an ancestor; candidate/prospective merge tree both **a42ddc7e6b8b5706d656511fe1f72daa5f8aff16**, no conflicts/material changes. Reviewed source/test/guide remain exact **9dc909d** bytes.
- Verified Node22 **PASS** Legacy card regression, **PASS** CVA card regression and **PASS** all eight current participant-parity groups. Clean checkout and `git diff --check` PASS. Logs/results preserved under prospective `output/ui-legacy-008-release/prospective-*`; no broader gates or fixture edits.
- Explicit exact-prospective iOS JavaScript bundle **PASS**,771modules/fourassets, SHA256 **efc300b302a26f99ce7ed30a174f8d0d7473ce35ca354ef15dc1f2cab8735aae**, identical to reviewed runtime. Ignored candidate-relative entry/output retained under prospective `output/ui-legacy-008-release/`. No native build/install.
- Release Manager software integration gate **PASS** after independent **789fc254**, scoped prospective checks and changelog. Final task-only evidence delta must preserve source/test/guide/changelog identity and exact live head/base/tree before protected PR merge. Owner phone appearance remains pending after integration; no full-device or pilot claim.

### Definition of Done — scoped software gate before merge

- **PASS:** Software acceptance criteria, including validated count source/fallback, 1/2/5/8 labels, safe inactive/error transitions and preserved expanded provenance; exact evidence above. Owner appearance is explicitly the later post-merge user-test checkpoint, not claimed here.
- **PASS:** Appropriate automated label/boundary/lifecycle tests added; relevant Legacy/CVA/current participant regressions pass without assertion weakening.
- **PASS:** Explicit candidate iOS JavaScript bundle; **N/A native binary build** because no native/configuration/dependency change.
- **PASS:** Manual actual-source browser UI inspection with declared injected-font/native-host limits; **N/A pre-merge physical NFC/radio validation** because no hardware path changed. Actual owner appearance/VoiceOver is not certified by that inspection.
- **PASS:** No unrelated refactoring/product change; declared files only, numeric geometry/CVA/scoring/data/NFC unchanged.
- **PASS:** Matching UI-guide sentence and task records updated; **N/A canonical protocol/schema amendments** because no contract or persisted representation changes.
- **PASS:** UI guidance/accessibility structure checked, existing caption token/no responsive font scaling, no control-role change; native accessibility interaction remains unclaimed.
- **PASS:** Independent inactive/data-source/privacy boundary review; no new reads, data writes, permissions, raw diagnostics or loss risk.
- **PASS:** Identified regression paths executed, exact author/runtime/prospective commits distinguished and no hardware success inferred.
- **PASS:** Independent findings resolved/no open blocker; author and reviewer handoffs, inspectable commits, clean branch and scoped changelog supplied.
- **PASS:** Current-main prospective integrated-tree validation completed before main changes. Controlled protected merge and exact post-merge validation remain mandatory next-phase gates, not marked complete prematurely.

### Protected integration and exact post-merge checks

- Protected [PR #28](https://github.com/andrewstordy-gif/cup_app/pull/28), final head **9a62cf198b14de0ed7c65624c2382928bef7753b**, exact live base **1c73a45897af9c98234fc96ae9df7856fe435b5a**. Final source/test/guide/changelog equal prospectively tested **7835e8f**; task evidence/DoD-only final delta. Final candidate/prospective merge tree both **0641c975b8cdfd5d2e7dd686028c9b1421628318**, no conflicts/material changes after independent approval.
- PR non-draft/mergeable with no configured CI statuses. Durable independent **789fc254**, all four scoped prospective gates and Release Manager approval supplied required process evidence. Existing authenticated `gh` fallback used for known connector write-permission limitation. Protected merge required `--match-head-commit 9a62cf198b14de0ed7c65624c2382928bef7753b`; no admin bypass/direct main push.
- Exact merged main **ff941765d13d9e3978b7b4555819d24ab4b080d4**, parents **1c73a458** and **9a62cf19**, tree **0641c975b8cdfd5d2e7dd686028c9b1421628318**, byte-identical to validated candidate.
- Exact actual main checked in isolated validation worktree: Legacy regression **PASS**, CVA regression **PASS**, current participant parity all eight groups **PASS**, fresh explicit-source iOS JavaScript bundle **PASS**, four assets (Metro cache reported742modules), SHA256 **efc300b302a26f99ce7ed30a174f8d0d7473ce35ca354ef15dc1f2cab8735aae**, unchanged from review/prospective. Candidate/merge equality and clean-state checks PASS. Results/logs preserved under prospective `output/ui-legacy-008-release/postmerge-*`. No broader fixtures/native build/install/data/backup/version/Metro action.
- **PASS:** Controlled protected integration and exact post-merge software gates, completing the scoped software DoD above. **PENDING:** actual owner subtitle appearance after root's clean-main synchronization/existing-client Metro refresh; no phone/NFC/VoiceOver or pilot acceptance inferred.
- Root PM notified post-merge PASS and may refresh normal main/client for owner checking. Final post-merge evidence preserved on remote **codex/ui-legacy-008-summary-label**; main contains pre-merge approval snapshot. Retain task branch/worktree. References: runtime **9dc909d**; independent **789fc254**; PR **#28**, merged head **9a62cf19**; exact post-merge-tested main **ff941765d13d9e3978b7b4555819d24ab4b080d4**.

### PM normal-main / Metro handoff

- PM fast-forwarded the clean normal checkout to **ff941765**. Previous Metro session23693 had ended and port8081 had no listener. Sandboxed startup attempts were stopped without serving; incompatible offline/LAN flags were corrected. With local-network permission, Metro successfully restarted as **session21778** from normal main, showing startup/QR for `exp+cup://expo-development-client/?url=http%3A%2F%2F192.168.68.117%3A8081`.
- This records server/source readiness only: no fresh phone application load, subtitle appearance or owner acceptance is claimed. No native/data operation. This evidence-only follow-up introduces no source change, test/release rerun, device operation or additional server action by Release Manager.
