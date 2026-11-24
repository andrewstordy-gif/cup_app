# UI-LEGACY-003 — Keep exact Legacy score values on one line

- **Status:** Approved for implementation, 24 November 2026.
- **Authority:** Andrew approved correcting the 10.00 wrapping first after comparing the physical-device screenshot with the mockup. Stage 1 is main ae46f94589729aec3c3d9bf0a98628bde1e77004 (PR22).
- **Product/UI references:** PRODUCT_SPEC §6.5 (exact Legacy quarter-point marks), §6.8.1 (card opening/expansion), FR-035; UI_STYLE_GUIDE typography/responsive/accessibility rules. Existing form/result/NDEF contracts unchanged.
- **Evidence:** Screenshot 2026-11-24 at 12.19.01.png shows Overall 10.00 split into 10.0 and 0 on samples 3L and 05. REL-DEV-STAGE1 on codex/rel-dev-stage1 records this native Stage 1 failure. Previous browser/geometry checks did not prove five-character values fit native Text.
- **Objective:** Fix the Legacy score row so complete exact values remain on one line without clipping, ellipsis, hidden digits or typography shrinking. Retain existing saved values, totals, source labels and interactions.
- **Non-scope:** Card vertical spacing, supporting-caption hierarchy, screen debug subtitle, CVA, notes/pills/defect redesign, scoring/storage/NFC/form definitions, native dependency/signing/build changes.
- **Allowed files:** src/features/forms/legacy/LegacySampleCard.js; legacyCardPresentation.js; scripts/legacy-sample-card-check.js; this task. Any additional shared file/interface requires PM coordination. No implementation-agent CHANGELOG edits.
- **Branch/worktree:** codex/ui-legacy-003-score-wrap; output/worktrees/ui-legacy-003, isolated from clean current main ae46f945. Metro stays on usual main checkout until protected integration completes.
- **Author/review:** Temporary implementation author /root/legacy_card_stage1; independent different instance /root/legacy_card_review, UX/accessibility and QA. Release Manager handles prospective exact-head PR and post-merge gates. Narrow rendering-only change; no new data-read/privacy semantics.
- **Risk:** Low bounded rendering change, native geometry regression demonstrated. No new native binary needed if correction stays JavaScript only.

## Acceptance criteria

1. All seven quality values including 10.00, 0.00, 9.75 remain exact and single-line. Total values including 100.00, zero and a negative result retain all characters. Do not solve wrapping merely by truncating or adding ellipsis, disabling text scaling, reducing approved typography, or losing accessibility labels.
2. A single horizontal row remains, with existing accessibility scrolling fallback when enlarged text cannot fit. Prefer all values visible at ordinary 320/375/390 widths. If measured text cannot fit, report evidence to PM before materially changing presentation; don't guess that a fixed minimum width proves native glyph fit.
3. Keep typography token sizes unscaled; layout alone may respond to width/scale. Preserve open-on-score-row, independent chevron/removal, draft/missing/zero treatment, inactive/read safeguards and canonical totals.
4. Add a meaningful regression specifically covering longest values and any native measurement/layout callbacks chosen. Exercise normal/large text and narrow widths; rendered browser or native-font evidence must name its limitations. A numberOfLines=1 assertion by itself is insufficient proof against truncation.
5. Run the existing actual card/lifecycle check and relevant current participant-parity probe; iOS JS bundle on exact source. No broad unrelated fixture cleanup or repeat full project suite. Independent review before protected prospective integration and post-merge checks.
6. After merge, synchronize clean normal main checkout and refresh the already installed development client through the existing Metro server; no new signed build, app replacement or data copy. Ask Andrew to confirm the same 10.00 values display intact on his phone. Until that confirmation, record software completion separately from native owner acceptance.

## Handoff / evidence

Pending. Record exact implementation/review/test/prospective/merge commits, commands, limitations and changelog-worthy note. All validation must distinguish software from actual phone evidence; preserve the prior native FAIL until superseded by real owner evidence.

## Review / Definition of Done

Pending independent PASS and required scoped checks. No native/NFC change; native binary/build/signing/storage gates N/A with this scope rationale, not a full-device conformance claim. Native score-text acceptance remains pending owner test. Final commit/PR/merge references pending.
