# UI-LEGACY-007 — Compact approved Legacy score-box height

- **Status:** Implementation ready for independent review24 November2026. Andrew asked to implement the revised48-point, centred proposal after rejecting top alignment. Honor staged changes: Legacy height first, phone checkpoint, CVA separately.
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
