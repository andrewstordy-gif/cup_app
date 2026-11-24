# UI-LEGACY-002 — Legacy sample card structure, Stage 1

- **Status:** Approved for implementation, 24 November 2026.
- **Product references:** PRODUCT_SPEC §§6.5, 6.8.1–6.8.5; FR-010, FR-013/014 (preserve existing identity boundary), FR-035. UI_STYLE_GUIDE is mandatory.
- **Technical references:** Existing versioned Legacy response/result contract and read API; NDEF_PROTOCOL unchanged.
- **Objective:** Implement the approved Legacy-only sample-card structure using existing saved data. Deliver one bounded, independently reviewed increment before CVA or later presentation work.
- **Non-scope:** CVA cards, tasting screen, session header/footer/copy cleanup, scoring/validation/form definitions, database/schema/write APIs, NFC, Legacy blind enablement, new descriptor extraction or coloured pills, new notes attribution, defect icons/detail redesign, animation, release metadata or distribution.
- **Expected files:** src/features/forms/legacy/LegacySampleCard.js; a colocated presentation helper if useful; scripts/legacy-sample-card-check.js (meaningful behavioural checks). CuppingSessionDetailsScreen.js allowed only for minimal session identity/refresh props to the Legacy card. This task record. UI_STYLE_GUIDE.md may receive only a concise description of the new Legacy-specific summary row; no unrelated edits. Other shared files require PM coordination.
- **Dependency/authority:** Andrew approved comparison designs and explicitly chose staged implementation; current instruction authorizes Stage 1 only. UI-LEGACY-001 design history is retained on codex/china-testflight, not merged as a dependency. Accepted preview is /Users/andrewstordy/.codex/visualizations/2026/10/01/01a0f756-62fe-7000-ad2f-08245b4001db/legacy-cva-card-comparison.html. Preview data are fictional, never production fixtures.
- **Risk:** Moderate UI/data-read regression risk; no persistence changes. Read only existing trusted access-checked saved responses; never expose recovery drafts, stale/removed responses, or guessed data.
- **Branch/worktree:** codex/ui-legacy-002-stage1; output/worktrees/ui-legacy-002 in the China TestFlight checkout. Starts from origin/main 8c0c49b3a8110cb80aab696561efac16946c2319, verified remote 24 November. Main clean before branching.
- **Author:** Temporary implementation agent assigned by /root PM. PM does not implement production code.
- **Review:** Different agent instance for independent code, UX/accessibility, QA and read-access/privacy review. Separate release audit before any integration. No self-approval.

## Acceptance criteria

1. Legacy card has sample code, seven quality scores (F/A, FL, AF, AC, BD, BA, OV) and total on one horizontal row at ordinary phone text sizes, preserving exact two-decimal quarter-point values. Total zero is valid. Missing values show a neutral dash, not zero. No fabricated final total for incomplete assessments.
2. Card body retains existing permitted onPress-to-form behaviour; separate accessible 44-point chevron expands/collapses without opening form. Preserve removal callback/permissions and inactive grey-card treatment. Inactive cards must not load/display retained scores/notes and cannot activate themselves through expansion.
3. Expanded order: Coffee/Process; Fragrance/Aroma; Flavour; Bean defects (existing data only); Cup assessment (Uniformity, Sweetness, Clean Cup, deduction); Roast notes/defects; Final score with canonical result label. Omit optional empty sections rather than add filler. Stage 1 may show existing text/type names only; icons, pills and extraction are deferred.
4. Preserve source meaning: aroma_qualities may populate Fragrance/Aroma; general Legacy notes must be labelled General notes rather than falsely attributed to Flavour if they are mixed. Dedicated roast_level_note is available in Legacy; shared defect_description is labelled Defect notes, never automatically Roast notes. Record any unavoidable preview-to-existing-data difference.
5. Final totals/labels come from existing access-checked saved results; no new scoring implementation. Read snapshots refresh after saved edits/reopen/activation transitions; stale async results must not leak between samples, become visible after removal, or display old totals alongside new scores. Clear generic loading/error states and cancellation safeguards. Do not log identity/notes.
6. Reuse tokens/components, quiet borders, no new colours. Responsive scale applies only to layout, never typography. Test narrow 320/375/390 widths and larger text: allow readable horizontal scrolling as accessibility fallback for enlarged text, not clipped precision or tiny scaled type. Accessible names expand abbreviated attributes.
7. Proportionate checks cover saved/draft/empty/zero scores, one/five/eight cups, missing notes, error/stale reads, inactive cards, open/expand/removal separation, saved-edit refresh, and unchanged CVA path. Bundle check for iOS; browser/rendered preview evidence if feasible, clearly separate from native/device evidence.

## Implementation handoff

Pending. Record changed files, data mapping, exact source commit tested, commands/results, limitations and changelog-worthy summary here. Do not edit CHANGELOG.md as implementation agent.

## Review / integration evidence

Pending. Record PASS / CHANGES REQUIRED / BLOCKED with scope, findings and exact reviewed commit. Prospective integrated-main and post-merge checks are distinct mandatory gates. No merge or physical/device claim from automated tests alone.

## Definition of Done

Pending acceptance, implementation checks, UI/accessibility review, independent approval and clean task branch. No storage/identity policy changes: security review focuses on new rendering/read boundaries. Native hardware remains unverified until actual owner testing; no NFC semantics change. Distribution is a separate release step after this implementation gate. Every applicable gate must be recorded; no full pilot-readiness claim.

## Final references

Final commit / PR / merge: pending.
