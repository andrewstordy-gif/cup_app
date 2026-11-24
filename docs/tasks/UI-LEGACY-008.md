# UI-LEGACY-008 — Compact Legacy cup-count summary label

- **Status:** Implementation ready for independent review, 24 November 2026. Andrew requested the app match the mockup's compact `Adapted · 1 cup` header subtitle.
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
