# UI-LEGACY-002 — Legacy sample card structure, Stage 1

- **Status:** Implementation complete; awaiting independent review, 24 November 2026.
- **Product references:** PRODUCT_SPEC §§6.5, 6.8.1–6.8.5; FR-010, FR-013/014 (preserve existing identity boundary), FR-035. UI_STYLE_GUIDE is mandatory.
- **Technical references:** Existing versioned Legacy response/result contract and read API; NDEF_PROTOCOL unchanged.
- **Objective:** Implement the approved Legacy-only sample-card structure using existing saved data. Deliver one bounded, independently reviewed increment before CVA or later presentation work.
- **Non-scope:** CVA cards, tasting screen, session header/footer/copy cleanup, scoring/validation/form definitions, database/schema/write APIs, NFC, Legacy blind enablement, new descriptor extraction or coloured pills, new notes attribution, defect icons/detail redesign, animation, release metadata or distribution.
- **Expected files:** src/features/forms/legacy/LegacySampleCard.js; a colocated presentation helper if useful; scripts/legacy-sample-card-check.js (meaningful behavioural checks). CuppingSessionDetailsScreen.js allowed only for minimal session identity/refresh props to the Legacy card. This task record. UI_STYLE_GUIDE.md may receive only a concise description of the new Legacy-specific summary row; no unrelated edits. PM additionally authorized mechanical AppIcon/ScrollView mock additions in scripts/creator-scan-activation-check.js after its old non-JSX loader failed on the legitimate new shared AppIcon import; no assertion weakening. Other shared files require PM coordination.
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

- **Author:** /root/legacy_card_stage1, temporary implementation agent.
- **Files:** LegacySampleCard.js; new legacyCardPresentation.js; minimal Legacy-only read/refresh/font-scale props in CuppingSessionDetailsScreen.js; new scripts/legacy-sample-card-check.js; mechanical native-leaf mocks in creator-scan-activation-check.js; concise Legacy row guidance in UI_STYLE_GUIDE.md; this record.
- **Behaviour:** Saved seven-mark/total summary on one row. Header and score region retain permitted tap-to-open; separate 44-point chevron expands/collapses; removal remains separate with existing parent permissions. Inactive cards never read or expose saved scores/notes. DRAFT parent passes no read session. Access-checked existing getLegacyResponse is injected; only its committed response/result is shown, never recoveryDraft. Snapshot identity includes session, sample, status object, presentationRevision, reader and retry; old replies and stale snapshots are hidden across changes.
- **Data mapping:** quality_ratings integer quarters formatted using existing scoreText; complete canonical result supplies totals, component values, adaptation label and extended-quality provenance. Draft cup checks/final total remain unscored. aroma_qualities → Fragrance / Aroma; notes → General notes (not falsely Flavour); defect_description → separate neutral Defect notes; roast_level_note → Roast notes. Plain existing bean/roast names use their saved cup arrays. Roast section precedes final score. Empty optional sections omitted. No coloured pills/icons/extraction or response schema changes.
- **Checks before commit:** New actual-JSX/hooks/pure presentation checks PASS; form contract 239 PASS; Legacy UI PASS; local tasting UI PASS; Legacy save queue PASS; creator activation SQLite/restart PASS; pending blind/CVA card SQLite regression PASS. Existing saved-score-card probe fails on Unsupported sample-code profile before card rendering; baseline comparison recorded below rather than altering unrelated fixtures.
- **iOS validation:** PASS, rerun on final runtime commit ca18a5b1026e8615378c6f63489458c78d3032c2: 769 modules and four assets using Node20.20.0 and ignored output/stage1-entry.js (registerRootComponent + candidate ../App). Command: `/opt/homebrew/bin/node node_modules/expo/node_modules/@expo/cli/build/bin/cli export:embed --entry-file output/stage1-entry.js --platform ios --bundle-output output/ui-legacy-002-ios/main.jsbundle --assets-dest output/ui-legacy-002-ios --dev false`. Final SHA256 09b18672f9744432123bdc6f05063abae1c7aaa2c2f80f6e6528fa668f3d9f88. Ordinary expo export fails because shared node_modules symlink resolves Expo AppEntry relative to main; ignored entry fixes validation provenance without app/package changes. Default Node18 lacks toReversed; switched validation to existing Homebrew Node20 and temporary Node22 for SQLite.
- **Validation runtime:** Official node-v22.14.0-darwin-arm64 downloaded to ignored output/node22; archive SHA256 e9404633bc02a5162c5c573b1e2490f5fb44648345d64a958b17e325729a5e42 matches official SHASUMS256.txt. No dependency/lockfile changes. Tests requiring node:sqlite use that binary; Node18/20 cannot run those probes.
- **Limitations:** No physical iPhone, NFC or native Dynamic Type verification. Independent reviewer is checking actual-card RN-web geometry separately; browser evidence does not certify native hardware. Later stages remain deferred, including CVA design, descriptor pills and defect badges. No release metadata, distribution or main integration performed.
- **Changelog-worthy:** Legacy session sample cards now show precise saved score summaries with expandable source-labelled notes, cup checks, defects and final results while preserving existing open/remove/inactive behaviour.
- PM visual refinement after preliminary screenshots: omit the redundant outer Roast heading, retaining Roast notes/Roast defects headings and their shared divider grouping. No other layout or data change.
- Independent pre-review robustness finding corrected: incomplete saved Legacy rows may retain invalid/unassessed judgments even though completed results are validated. Guard missing/malformed scored-defect affected-cup arrays and unknown severity; display Cups not assessed for a known incomplete severity instead of crashing or guessing cup membership. Added draft regressions; no scoring/validation changes.

## Tests and exact source evidence

All following commands rerun successfully on clean task commit **ca18a5b1026e8615378c6f63489458c78d3032c2**, 24 November 2026, using `output/node22/node-v22.14.0-darwin-arm64/bin/node`:

- `scripts/legacy-sample-card-check.js`: PASS — real card JSX/hooks with native hosts substituted, canonical 1/5/8-cup results, zero/empty/draft/incomplete judgments, notes provenance, width calculations, open/expand/remove separation, note-only refresh, deferred out-of-order reads, inactive hiding, generic failures and retry.
- `scripts/form-contract-check.js`: PASS — 239 canonical contract checks.
- `scripts/legacy-ui-check.js`: PASS — unchanged Legacy tasting controls/notes/scan wiring.
- `scripts/legacy-save-queue-check.js`: PASS — save/revision/failure ordering.
- `scripts/local-tasting-ui-check.js`: PASS — completion/dialog/token/foreign-context controls and CVA single-row layout.
- `scripts/creator-scan-activation-check.js`: PASS — actual SQLite/restart plus Details/card/navigation binding, inactive access and no auto-activation. Only mechanical shared-icon/scroll-host mock additions were necessary; assertions unchanged.
- `scripts/pending-blind-card-check.js`: PASS — unchanged CVA Pending Blind/Open projection, edit/save/NFC payload preservation and reloads, actual SQLite/native-host substitution.
- iOS bundle command above: PASS against same exact commit. `git diff --check`: PASS.

**Known baseline probe limitation:** `scripts/saved-score-card-check.js` fails with `Unsupported sample-code profile. No session was saved.` in fixture setup, before rendering a card. Reproduced with the same Node22 binary in task tree and independently in clean `/Volumes/external/code/cup_app` at **8c0c49b3a8110cb80aab696561efac16946c2319** using `.../output/node22/node-v22.14.0-darwin-arm64/bin/node scripts/saved-score-card-check.js`. That probe and repository persistence code are unchanged. No pass or unrelated fixture repair claimed; the current creator-activation and pending-blind SQLite probes plus new real-card harness cover the affected paths.

No diff to CoffeeSampleCard.js, sessionRepository.js, form-contract definitions or LegacyCuppingScreen.js relative to main. Main has not changed. None of these software checks is physical NFC/device evidence.

## Review / integration evidence

Pending. Record PASS / CHANGES REQUIRED / BLOCKED with scope, findings and exact reviewed commit. Prospective integrated-main and post-merge checks are distinct mandatory gates. No merge or physical/device claim from automated tests alone.

## Definition of Done

Pending acceptance, implementation checks, UI/accessibility review, independent approval and clean task branch. No storage/identity policy changes: security review focuses on new rendering/read boundaries. Native hardware remains unverified until actual owner testing; no NFC semantics change. Distribution is a separate release step after this implementation gate. Every applicable gate must be recorded; no full pilot-readiness claim.

## Final references

Implementation runtime commit: ca18a5b1026e8615378c6f63489458c78d3032c2 (preceded by cb28b04 and 219ee6c). Documentation-only evidence commit follows. Independent review / PR / prospective integration / merge remain pending.
