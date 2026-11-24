# UI-LEGACY-004 — Correct native measurement event lifetime and oversized row

- **Status:** Approved corrective work, 24 November 2026; no unrelated merges/stages while this regression is unresolved.
- **Evidence/base:** Main834deaf3c45561f3b64bdc5cd32700ea94dfce49 / PR23. Owner Screenshot 2026-11-24 at 12.39.58.png shows only about four full columns, others beyond the card, plus native warning This synthetic event is reused…. Previous UI003 actual-phone acceptance FAILED; software PASS did not establish native success.
- **Cause to verify:** measureScore currently retains a React native event inside a deferred functional state updater, then reads nativeEvent.lines later. Pooled event may be released, leaving generous bootstrap widths permanent. Inspect/test actual callback lifetime, not just the pure helper.
- **Objective:** Read/copy measurement scalars synchronously during event delivery, never access pooled event inside deferred updater; use actual displayed-value widths so short values need not reserve 10.00 width unnecessarily. Fit the owner's example rows when their measured widths fit available space, preserving exact digits and approved typography.
- **Authority:** Andrew reports regression during the active authorized wrapping correction. PRODUCT_SPEC6.5/6.8.1 and UI_STYLE_GUIDE typography/accessibility unchanged. No score policy, data or NFC changes. PM chooses bounded fix-forward because the event-lifetime bug is narrow, source-only and directly testable; reverting PR23 restores the original confirmed 10.00-wrap failure rather than completing the authorized fix. Main remains usable through horizontal scrolling; no data-loss finding.
- **Allowed files:** LegacySampleCard.js, legacyCardPresentation.js, scripts/legacy-sample-card-check.js, this task. PM/RM owns scoped changelog. Other files need coordination.
- **Non-scope:** Captions/vertical whitespace, CVA, notes/pills/defects, score formulas, database/NFC/form definitions, native build/install/backup, app versioning.
- **Branch/worktree:** codex/ui-legacy-004-native-measure, output/worktrees/ui-legacy-004; isolated from verified current main834deaf3. Metro stays on main until controlled integration.
- **Roles:** Temporary author legacy_card_stage1; independent reviewer legacy_card_review; Release Manager legacy_card_release. PM coordinates, does not author production code.
- **Risk:** Bounded native-event/rendering bug. Existing installed development client loads JavaScript update via Metro; no new binary or data operation.

## Acceptance

1. Actual onTextLayout handler synchronously copies only primitive width/count/context data before dispatch returns. No event/nativeEvent/lines object is retained in deferred state callbacks. Reject invalid, late, multiline and duplicate measurements as before.
2. Add actual-component regression with DEFERRED state updaters and simulated event release/nulling after the handler returns. It must fail on834deaf3 behavior and pass the correction, including late/reordered callbacks after font/content changes. Previous immediate-update mock was insufficient.
3. Give each quality column enough measured room for its displayed four-/five-character value, plus borders/native rounding; don't use the longest value for all seven columns when that needlessly pushes the row offscreen. Include caption width if needed. Total uses its actual value, including100.00/negative/zero. Maintain a quiet, coherent row and current full attribute accessibility labels.
4. Source owner's sample3L [8.50,9.50,9.25,7.00,7.75,8.50,10.00], total82.50, and sample05 [9.25,7.75,8.00,8.50,7.75,7.00,10.00], total80.25 in geometry/render checks at320/375/390 and representative font scales. All values visible where their actual widths fit. No truncation/ellipsis, font shrinking, typography scale changes or disabled Dynamic Type. For truly impossible widths at larger text, retain existing horizontal scrolling and document the limitation honestly.
5. Scoped real-card/lifecycle check, current participant-parity check and iOS JavaScript bundle; independent review then protected prospective merge/post-merge validation. No broad fixture cleanup or repeated native build. Record exact commits and failures.
6. After software integration, update clean main/refresh existing Metro and request the same screenshot/check. Actual-phone acceptance stays pending until the owner confirms no reused-event warning and an acceptable visible score row. Never mark UI003 native acceptance PASS from this software check alone.

## Handoff / review / release

Pending implementation, independent PASS, exact prospective and post-merge evidence. Prior native failure preserved until explicitly superseded by owner evidence. Final commit/PR/main pending. No native build/data operations are applicable to this JavaScript-only scope.
