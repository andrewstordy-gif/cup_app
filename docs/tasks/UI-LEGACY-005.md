# UI-LEGACY-005 — Rotated Legacy score-number design proposal

- **Status:** Design exploration requested by Andrew, 24 November 2026; no production implementation authorized by this record.
- **Objective:** Preview Legacy score numbers at the same nominal size/weight as the existing CVA sample-card numbers, rotated90 degrees so exact decimal marks occupy height rather than horizontal width. Keep attribute labels upright and every value visible within the card in the preview.
- **Authority:** Andrew says the scores are now present after UI004 but look too small compared with CVA; requests trying sideways numbers. PRODUCT_SPEC6.5 exact independent Legacy meaning/precision; UI_STYLE_GUIDE; existing CVA ScoreRow source is reference, not product policy.
- **Scope/files:** This coordination record; conversation-only preview at /Users/andrewstordy/.codex/visualizations/2026/10/01/01a0f756-62fe-7000-ad2f-08245b4001db/legacy-rotated-scores.html. No runtime, score, storage, NFC, native build, Metro or main changes. Design work on existing PM coordination branch codex/china-testflight; implementation would require a separately approved isolated task.
- **Dependency:** UI-LEGACY-004 mergedmain b20b530; exact native values now reported visible by owner. This does not establish absence of the prior event warning; Andrew has not separately confirmed that. Software remains as installed while exploring design.
- **PM/author:** /root, proposal only. Product Owner chooses direction/treatment before implementation; independent UX/accessibility/native layout review required for future implementation.

## Design criteria

- Existing CVA ScoreRow uses score text13, weight700, no font-size layout scaling. Total currently uses11. Preview uses these same sizes/weights for comparative reference; illustrates both clockwise and counterclockwise rotation, rather than guessing the preferred direction.
- Seven Legacy attributes retain two decimal places, e.g.10.00, plus the canonical total. Headers F/A, FL, AF, AC, BD, BA, OV, TOTAL remain upright. Rotation is of the complete number, not individually stacked digits.
- Preserve charcoal saved-score boxes and neutral total styling; enough vertical space for100.00 and negative totals. Show normal CVA reference and a proposed rotated Legacy row at matching nominal type size. Rotation is a new proposed pattern, not a style-guide implementation amendment yet.
- Use owner's Legacy3L row8.50/9.50/9.25/7.00/7.75/8.50/10.00 with total82.50 as illustrative supplied data. CVA uses separate fictional8s/94.75, not an assertion that the two forms produce the same score. No app data read for preview.
- Local optional control may keep total upright for comparison; no app mutation. Check preview fits320px without clipped rotated bounds; browser geometry is not physical iPhone/VoiceOver/Dynamic Type acceptance.

## Handoff / evidence / review

Preview created with clockwise/counterclockwise alternatives, upright labels and a local Rotate total too option. CVA reference and rotated Legacy example share score typography13/700 and total11/700. JavaScript syntax/literal-fragment checks passed; isolated browser screenshots visually inspected at390px card width and a320px constrained preview stage: full values/labels stay inside the displayed boxes. Native iPhone/VoiceOver/Dynamic Type behaviour is not established by this preview. No app code changes, test build, Metro update or release. Product-owner direction/treatment choice and future independent implementation review remain pending.
