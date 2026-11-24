# UI-LEGACY-007 — Compact approved Legacy score-box height

- **Status:** Independent software/UX review PASS24 November2026; protected integration and Legacy phone-height checkpoint pending. Andrew approved48-point centred boxes; CVA remains deferred.
- **Authority:** UI-LEGACY-005 proposal on codex/china-testflight, current48-point-centred preview /Users/andrewstordy/.codex/visualizations/2026/10/01/01a0f756-62fe-7000-ad2f-08245b4001db/legacy-rotated-scores.html. PRODUCT_SPEC6.5 exact Legacy meaning;6.8.1 card behaviour. UI_STYLE_GUIDE approved summary pattern.
- **Objective:** Lower the Legacy compact score-cell minimum from64 to48 points while retaining measured glyph-bound growth. Preserve centred clockwise13-point-bold quality numbers, upright captions/total, two decimals and all other accepted Legacy behaviour.
- **Non-scope:** CVA implementation, font/token/width/alignment changes, captions/provenance cleanup, expanded fields, scoring/persistence/NFC/contracts, native build/install/backup/versioning. No new data operation.
- **Allowed files:** src/features/forms/legacy/legacyCardPresentation.js only the cell-height floor; scripts/legacy-sample-card-check.js only necessary expected-height updates plus meaningful compact/glyph-fit checks; UI_STYLE_GUIDE.md only minimum-height guidance; this record. No LegacySampleCard component or shared token change expected. PM/RM owns changelog. Return to PM if other source work needed.
- **Branch/worktree:** codex/ui-legacy-007-compact; output/worktrees/ui-legacy-007 from verified clean origin/main fd423c9210e21afe4915d821e60f7039fe267c49.
- **Roles:** Temporary author legacy_card_stage1; different independent reviewer legacy_card_review; Release Manager legacy_card_release; PM /root coordination only.
- **Risk:** Low pure geometry change; exact native glyph bounds still take precedence over a rigid48-point value. Current phone font scale may require slightly taller boxes, which is correct to preserve full strings.

## Acceptance / checks

1. Normal compact cells use48 minimum instead of64, remain centred, preserve full rotated strings including10.00 and upright100.00/negative/zero totals. Minimum width56, numeric13/700 and expanded44 remain unchanged.
2. Continue growing height from actual rotated-value width plus existing safety allowance and upright total height. Never force48 if it clips larger text; no font shrinking, ellipsis or disabled text scaling. Test near-threshold and larger-font bounds, not just replacing an expected constant.
3. Retain existing actual-component deferred pooled-event, stale width/height/font/orientation, lifecycle/access, inactive hiding and open/expand/removal checks. Card probe plus current participant-parity and iOS JS bundle are the scoped software checks; no unrelated fixture maintenance or whole-suite expansion.
4. Independent PASS, current-main prospective exact-head protected PR and exact post-merge checks. Then synchronize clean usual main and refresh existing Metro23693/client; no Xcode build or app replacement.
5. Ask Andrew to confirm shorter Legacy boxes on the phone. Native visual acceptance remains separate from software checks. CVA implementation waits for this height checkpoint.

## Handoff / review / Definition of Done

### Implementation handoff

- **Author:** /root/legacy_card_stage1. The sole production change is `Math.max(64, …)` → `Math.max(48, …)` in legacyCardPresentation.js. LegacySampleCard.js, centring/alignment, numeric13/700 token, upright total56minimum, widths, expanded fields, CVA and other source are unchanged. UI guide updates only64→48 minimum guidance.
- **Glyph fit preserved:** Existing maximum still accounts for rotated source-string width plus frame/borders and upright total height. Normal corroborating font metrics yield48-point boxes; native metrics near the threshold correctly grow to49/50 instead of clipping text. At larger1.5/2font metrics, cells grow61/80 as required; no font shrinking or forcing fixed48.
- **Regression:** Existing actual card/lifecycle, rotation, pooled-event and stale width/height callbacks remain. Added raw measured-width boundary checks through recordLegacyScoreMeasurement:43/44→48,44.01 rounded up→49,45→49,46→50,66→70; upright total heights45/50 yield49/54. Caption fit, total width, centring, full10.00/100.00/negative/zero/missing and owner3L/05 geometry checks are retained. Initial card suite PASS before commit.
- **Changelog-worthy:** Legacy compact score boxes use the approved shorter48-point centred minimum while growing when measured glyphs need more room.
- **Limits:** No new native build/install, Metro feature-branch serving or data operation. Native phone height/readability acceptance remains a separate owner checkpoint after protected integration and usual-main refresh; CVA implementation remains deferred.

Exact source/test/bundle and independent review/integration evidence follow. Native binary/signing/NFC/storage gates N/A for this pure JS geometry change. Native height/readability acceptance pending. Final commit/PR/main pending. Author performs no push, merge, main/Metro or changelog edit.

### Exact author validation —24 November2026

Runtime **636a4ad0ea0393cc70aa5db8dbe8c3f22028ae3b**; clean tree during validation. Official verified Node22.14.0 reused from `../ui-legacy-002/output/node22/node-v22.14.0-darwin-arm64/bin/node` without dependency changes.

- `node22 scripts/legacy-sample-card-check.js`: **PASS**, retained full actual card/lifecycle, rotation, native-event/deferred-updater and stale measurements coverage, plus compact48threshold/rounding and larger-glyph growth. Both raw fractional width44.01 and upright total height can grow the row above48; no clipping/shrinking introduced.
- `node22 scripts/participant-parity-finish-check.js`: **PASS**, all eight SQLite/two-device/UI parity groups; no permission/CVA assertion changes.
- `node22 node_modules/expo/node_modules/@expo/cli/build/bin/cli export:embed --entry-file output/stage1-entry.js --platform ios --bundle-output output/ui-legacy-007-ios/main.jsbundle --assets-dest output/ui-legacy-007-ios --dev false`: **PASS**,769modules/fourassets. Ignored entry registers candidate `../App`. Bundle SHA256 **14033a1432488951d9728b74f83a860316240b8e24a9a2100f11138e4dac5949**. JavaScript bundle only, no new native binary/install.
- `git diff --check`: **PASS**. Production diff against fd423c9 is exactly one64→48 height-floor line; LegacySampleCard.js, all other source/tokens/width/alignment and CVA unchanged. Guide diff only updates the declared minimum.

Final runtime **636a4ad**; following documentation-only commit records evidence. Independent review, protected prospective/head/PR/merge/post-merge and actual phone acceptance remain pending. CVA implementation has not started.

### Independent compact-height review —24 November2026

- **PASS for scoped software, QA and UX review**, independent instance `/root/legacy_card_review`. Reviewed runtime **636a4ad0ea0393cc70aa5db8dbe8c3f22028ae3b** and documentation-only evidence **92930d8**, relative to main **fd423c9**. Production change is exactly the height-floor constant64→48. Component, centering/rotation, numeric token13/700, width calculation/min56, expanded fields, CVA, scoring, data access and NFC are unchanged. Guide update is the corresponding height declaration only. No unresolved software findings.
- Existing clipping/precision invariants and deferred-event/lifecycle assertions remain. Expected-height edits follow the newly approved floor, with additional boundary checks rather than an oracle-only replacement. Independently exercised scalar rounding through the real measurement helper: native quality widths43.99/44 produce48,44.01/45 produce49,46 produces50,75.11 produces80; allocated inner bounds retain the complete rotated source width. Reviewed independent upright-total height growth tests; neither48 nor normal font assumptions override measured glyph requirements.
- **Independent exact-runtime checks PASS:** `node scripts/legacy-sample-card-check.js`, verified Node22 `scripts/participant-parity-finish-check.js` (all eight groups, exit0), fractional-threshold/containment probe, and `git diff --check`. Independently checked author's exact iOS JavaScript bundle hash **14033a1432488951d9728b74f83a860316240b8e24a9a2100f11138e4dac5949**; no independent Metro rebuild performed.
- **Actual-source browser corroboration:** reused the actual React Native Web card renderer with unchanged13-bold AppKit fixture measurements, then regenerated source636a4ad snapshots. Visually inspected centred48-point ordinary boxes at320/375, including10.00 and upright100.00; DOM checks for320-owner/375-max/390-negative confirm seven CW frames, upright total, complete frame containment and48-point height. The320-large fixture grows to80, retains full rotated bounds and horizontal scrolling. This supports the approved centred treatment, not top alignment. Artifacts/renderer preserved under ignored `output/ui-legacy-007-review/ui-legacy-compact-{320-owner,375-max,390-negative,320-large}.{png,html,dom}` and `render.cjs`.
- **Limits / remaining gates:** browser uses injected saved snapshots/native-font bounds, substituted icon host and emulated enlarged text; not a physical iOS/VoiceOver/Dynamic Type test. Software PASS does not establish native height/readability acceptance. Release Manager must perform prospective current-main validation, protected PR integration and exact post-merge checks before clean normal-main Metro refresh. Owner confirms the shorter Legacy boxes on the phone before CVA work. New native binary/signing/NFC/storage/data-operation gates N/A because only pure JavaScript geometry changes; no installation or data copy performed.
