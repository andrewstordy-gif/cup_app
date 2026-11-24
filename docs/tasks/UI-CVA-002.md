# UI-CVA-002 — Match CVA sample-card header to approved design

- **Status:** PM approved 24 November 2026 before implementation. Andrew requested the same design as UI-LEGACY-008 so the entire CVA cup title/header element matches the full-card mockup.
- **Objective:** Match the CVA collapsed card header to Legacy/mockup: sample code and existing edit control, Saved status for an actually saved final result beside existing permitted remove control, unchanged rotated row, compact trailing physical-cup-count subtitle. Non-five counts use `Adapted · N cup(s)`; five uses `5 cups`.
- **Authority:** PRODUCT_SPEC §6.6 CVA independent versioned scoring, 1–8 cups, explicit adaptation/provenance; §6.8 roles/controls/inactive/blind identity; FR-013/014/035. UI_STYLE_GUIDE existing card summary tokens and UI-LEGACY-008 compact label. Full-card mockup sample-drawers-rotated-headers.html. No NDEF/form-contract/schema change.
- **Base/branch/worktree:** Clean verified main/origin ff941765d13d9e3978b7b4555819d24ab4b080d4; codex/ui-cva-002-card-header; output/worktrees/ui-cva-002.
- **Scope:** src/features/cupping/components/CoffeeSampleCard.js; new CVA-private presentation helper if needed; scripts/cva-sample-card-check.js bounded meaningful assertions; UI_STYLE_GUIDE bounded clarification; this record. Test compatibility changes ONLY to creator-scan-activation-check.js/pending-blind-card-check.js/cva-inline-result-check.js if a new directly reproduced failure requires a narrow native-leaf mock, preserving permission/privacy assertions. Other files require PM coordination. Release Manager owns CHANGELOG.
- **Non-scope:** Expanded drawer redesign, notes/pills/defects, calculations/inputs/stored values/form pins, status projection/data repositories, geometry/rotation/shared theme, Legacy, NFC/network/access/storage/native build/install/versioning/data operations.
- **Agents/review:** legacy_card_stage1 author; independent different instance legacy_card_review covers code/QA/UX and inactive/provenance boundaries; legacy_card_release protected integration. Low/moderate presentation risk because historical provenance and inactive suppression must remain accurate.

## Acceptance criteria / decisions

1. Preserve sample-code identity and all edit/remove/open/expand handlers and permissions. Saved status is display-only and appears only when existing committed status actually establishes a saved valid final score; do not equate draft/notes/unknown policy with completion. Other states may retain current appearance rather than inventing status policy. Inactive never displays stale Saved/provenance/scores; no new data reads.
2. Compact trailing subtitle uses authoritative existing physical sample cup count, strictly integer 1–8; establish actual source. Never infer from defects/selected checks or default to1. For scored non-five display Adapted · N cup(s), five 5 cups; unavailable invalid count retains safe full provenance fallback, not invented count. Respect current visibility semantics for no result/draft.
3. Existing status.resultLabel may contain adaptation AND historical/unsupported calculation or defect-rule warnings. Do not discard those warnings when replacing the ordinary adaptation line. Keep any safety-relevant historical/unsupported explanation visible without expansion and preserve full provenance alongside expanded Final Score, including when status supports a result but local session completion is not yet true. Avoid a misleading Saved label for unsupported results. No recalculation or policy mutation.
4. Existing token-based neutral Saved styling/alignment and text_caption subtitle, trailing compact line as Legacy/mockup. Font sizes never scaled. Keep 48-point rotated score geometry and upright total unchanged. At320 width no overlap of sample code/edit/status/remove; no duplicate controls.
5. Tests exercise actual CoffeeSampleCard header for counts1/2/5/8, invalid/missing source, saved/draft/unknown/historical/inactive/prop transitions and unchanged controls; current CVA geometry/probe/default ScoreRow regressions remain. Run CVA and unchanged Legacy card regression/current participant parity, creator activation and pending-blind (affected parent/header), plus explicit-source iOS JS bundle on exact source. No unrelated fixture repair.
6. Durable handoff and independent PASS, prospective current-main checks before protected exact-head PR merge, exact postmerge validation. No direct main push. PM sync clean normal main and refresh existing Metro21778. No reinstall. Actual owner-phone appearance remains pending until Andrew reports it; no NFC/VoiceOver/pilot claim.

## Handoff / review / Definition of Done / release

Implementation complete at source c1487239832d3a798dc33522a19f576bbf011b4c; independent review and integration pending.

### Implementation

- Author legacy_card_stage1; branch/worktree above. Task a41b82d preceded all code. CoffeeSampleCard header only plus private cvaCardHeaderPresentation helper; CVA regression and bounded guide clarification. No shared geometry, Legacy, theme, data/status, scoring, NFC, contracts or default controls changed. No compatibility-script edits needed.
- Physical count source is sample.cupNumber (repository local presentation maps the saved sample field directly; savedSessionIdentity also allowlists it). Canonical read validates the saved response cupCount against current sample.n. Helper strictly accepts integer1–8, never coerces strings, guesses a count or uses selected judgments. A finite result gets compact physical-count caption; invalid/missing count retains ordinary full label.
- Exact known ordinary labels only are compacted. Every other nonempty label, including combined adaptation plus historical calculation/defect or unknown policy text, remains visible collapsed. Full original provenance now also accompanies expanded Final Score whenever total or provenance is available, independently of local completion. No recalculation.
- Neutral Saved requires committed isComplete, finite normalized final (zero/negative valid), explicit canonicalCva or current exact-calculation marker, and no warning. Notes, partial ratings, absent support, unknown/historical warnings or inactive states never create Saved. Existing code/edit/remove/open/expand permissions and callbacks unchanged; existing rotated row unchanged.
- Changelog: CVA sample headers now match approved Legacy count/status treatment while retaining historical/unsupported provenance warnings and expanded interpretation labels.

### Validation / limitations

Exact source **c1487239832d3a798dc33522a19f576bbf011b4c**, clean while checked. Runtime Node22.14.0 at ../ui-legacy-002/output/node22/node-v22.14.0-darwin-arm64/bin/node (previous official verified validation-only runtime). All commands below exited0:

- `node scripts/cva-sample-card-check.js`: PASS actual CVA header1/2/5/8, strict invalid/missing fallback, zero/negative final, saved/draft/absent support, previous/unsupported/unknown combined warnings, expanded provenance before completion, inactive and sample/status transitions, preserved edit/remove/open callbacks and permissions; pre-existing two-decimal/geometry/queued-event/default ScoreRow regressions preserved.
- `node scripts/legacy-sample-card-check.js`: PASS unchanged Legacy header/count/provenance, geometry and lifecycle.
- `node scripts/participant-parity-finish-check.js`: PASS two forms/two-device SQLite lifecycle, privacy/ownership, queues and exact parent parity assertions.
- `node scripts/creator-scan-activation-check.js`: PASS SQLite/restart + actual Details/card/scan/Nav inactive/provenance/access paths.
- `node scripts/pending-blind-card-check.js`: PASS actual SQLite and screen/card JSX Pending Blind/Open role/order masking, retained raw data.
- `git diff --check`: PASS.
- Explicit candidate-source iOS JavaScript bundle: PASS772modules/4assets. Command `node node_modules/expo/node_modules/@expo/cli/build/bin/cli export:embed --entry-file output/stage1-entry.js --platform ios --bundle-output output/ui-cva-002-ios/main.jsbundle --assets-dest output/ui-cva-002-ios --dev false`. Ignored entry imports registerRootComponent from expo and App from ../App, then registers App; this deliberately resolves candidate App/src instead of the main checkout behind the shared dependency symlink. Bundle SHA256 **1d2b7a8ae5167895453db4e7b9173c39acbeb64958579162a865e7e68d67dd2c**. Entry/bundle/runtime are ignored validation artifacts, not source changes. Actual owner phone/VoiceOver/NFC testing not performed; no install/native build/Metro/data operation. Independent reviewer will perform proportionate actual-source320 header rendering. Bundling cannot establish native appearance or pilot readiness.

### Definition of Done at author handoff

- Acceptance / appropriate regression / existing relevant checks / candidate bundle: PASS author software evidence above; independent visual/QA review and actual owner phone remain explicitly separate.
- Scope discipline and docs: PASS; presentation/guide only, no unrelated changes or behavioral/protocol contracts.
- UI / accessibility: token-based neutral status, caption, existing labels/disabled controls retained; software checks plus independent visual review pending. Actual owner appearance and VoiceOver N/A at implementation gate, explicitly unverified and still needed for hardware claims.
- Security/privacy/reliability: existing inactive blind/header suppression checked without new reads; independent reviewer checks scope. Persistence/network/NFC/data-loss changes N/A because none made.
- Independent findings, prospective integration and exact postmerge: pending reviewer/Release Manager, not waived.
- Clean committed history / concise handoff / changelog information: PASS source c148723, evidence-only follow-up commit; changelog note supplied above, Release Manager owns file.
