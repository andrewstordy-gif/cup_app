# Task Record

- **Task ID:** UI-LEGACY-001
- **Title:** Legacy Session Details and sample-card design proposal
- **Status:** Design proposal for Product Owner review; implementation not started
- **Product Specification references:** Sections 6.5 (form meaning and adapted totals), 6.8.1–6.8.5 (roles, controls, local state); FR-010, FR-035
- **Technical specification references:** UI_STYLE_GUIDE.md; NDEF_PROTOCOL.md unchanged
- **Objective:** Propose cleaner Legacy Session Details and expandable sample cards, preserving the established CVA visual language and Legacy score meaning.
- **Non-scope:** Production code, scoring changes, NFC changes, blind Legacy enablement, storage changes, descriptor extraction implementation, completion animation, distribution. Legacy tasting-screen redesign follows separately after this first screen is agreed.
- **Expected files/contracts affected:** This task record and a conversation design preview only. Potential later implementation files are LegacySampleCard.js and CuppingSessionDetailsScreen.js, but are not assigned for modification here.
- **Dependencies:** TF-LEG-002, TF-LEG-003, TF-LEG-005 in REL-TESTFLIGHT-001.md. TF-LEG-004 flavour pills are shown as intended presentation only, not functioning extraction.
- **Risk level:** Low for proposal; future shared-screen implementation requires state/role regression review.
- **Branch/worktree:** codex/china-testflight; /Volumes/external/codex-worktrees/china-testflight/cup_app. Documentation-only continuation of field-feedback coordination. No runtime changes or integration to main.
- **Authoring agent:** Project Manager, /root (coordination/design only)
- **Required reviewers:** Product Owner design feedback now; independent UX/UI and QA reviewer before any future implementation enters main.

## Acceptance criteria

- Show a clean Session Details proposal with compact session metadata, sample codes, saved score breakdown and explicit adapted-total qualification where applicable.
- Distinguish card opening from expand/collapse; expansion exposes coffee/process, cup checks, deductions and recorded notes without replacing the tasting form.
- Use seven Legacy quality attributes, not the CVA eight-attribute row. Preserve quarter-point precision and existing workflow controls.
- Show proposed flavour-pill presentation as illustrative data; do not claim working extraction or device validation.
- Obtain Andrew's feedback before implementation. No approved design or production readiness inferred from viewing the preview.

## Decisions

- Andrew chose appearance work on 23 November and resumed on 24 November 2026. Start with Legacy sample cards and Session Details, then address the tasting screen in a separate design step.
- Design revision requested 24 November: Legacy's seven quality scores and total must be on one line, matching the CVA card. Updated both previews to a single row with two-decimal values retained; use F/A for the combined Fragrance/Aroma caption with its full accessible name. This supersedes the initial two-row proposal described in the historical handoff below. Whole-design approval and physical viewport checks remain pending.
- Design revision requested 24 November: add Roast notes to the expanded CVA sample card, matching the Legacy card. Updated the comparison preview with the same notes-field treatment below Flavour notes; relates to TF-FB-012 (CVA item 11). This is a preview change only, not an addition of a new assessment field or a claim that the installed app has changed.
- Andrew requested a roast-defect example on both cards. Comparison now shows the neutral label Baked · Cup 1 on each expanded card, alongside illustrative text Flat, dull finish; scores are unchanged because roast-type selections are observations only. Current source uses a shared defect_description field in both forms, not a dedicated roast_notes field. The proposed Roast notes heading must not imply that an independently attributed roast note already exists: determine a truthful mapping/label before implementation, preserving original text and attribution. No response schema or stored data changed.
- Layout decision, 24 November: Andrew requested Roast notes and Roast defects at the end of both expanded cards. Updated the comparison to group them in the final section, after the final score and its adaptation label. This supersedes the earlier placement below Flavour notes; content, scores and persistence are unchanged.
- Subsequent layout refinement, 24 November: place the final score below the roast section on both cards. Current order ends with Roast notes / Roast defects, then Final score and its adaptation label. Updated comparison only; the compact score summary at the top remains unchanged.
- Bean-defect examples requested 24 November: both cards now show Phenolic on Cup 1 with illustrative defect-description text. Legacy explicitly selects Taint (severity 2), one affected cup of one: deduction 10.00; Clean Cup is 0.00 because that cup is defective; retained quality sum 57.75, Uniformity 10 and Sweetness 10 produce total 67.75. CVA uses eight ratings of 8, zero non-uniform cups (one-cup rule), and one scored defective cup: 94.75 minus 20.00 gives 74.75. Both retain adapted labels and observation-only Baked roast defects. Arithmetic checked against approved formulas; these are fictional design examples, not verified device responses. CVA column is now labelled proposed because it includes requested changes.
- Keep persistent form/mode context short; remove repetitive explanatory paragraphs from the ordinary view. Do not remove actionable errors, pending-write verification, adaptation or extended-score qualifications.
- Compare score-first and coffee-first layouts using identical fictional data. Sample A1: 9.75 plus six 8.00 quality marks, three 10.00 cup checks, zero defects gives 87.75; one cup requires an adapted label. B2 is incomplete, with no final total.

## Handoff and evidence

- Baseline inspected: task branch f3f339f01de4ad2aed8ebe21f7e68d6c3956fb1e; local main 8c0c49b3a8110cb80aab696561efac16946c2319. Working tree clean before proposal.
- Read operating model, relevant product sections, UI style guide, task template, feedback record and current Legacy/CVA card source. Existing Legacy card is a simple code/name/state/total card; CVA has expandable score/notes details.
- Preview: /Users/andrewstordy/.codex/visualizations/2026/10/01/01a0f756-62fe-7000-ad2f-08245b4001db/legacy-session-details-refresh.html
- Andrew requested a side-by-side comparison on 24 November. Comparison preview: /Users/andrewstordy/.codex/visualizations/2026/10/01/01a0f756-62fe-7000-ad2f-08245b4001db/legacy-cva-card-comparison.html. Recreates the CVA layout from the inspected card source alongside proposed Legacy, using illustrative data, not a physical screenshot or verified scoring output. Both expand/collapse independently. Legacy displays seven quarter-point attributes over two rows; CVA retains its eight-attribute single row. Notes use neutral outlined pills in this comparison; final implementation must reuse existing data-colour mappings. Preview JavaScript syntax checked; browser/device rendering not independently verified. This comparison does not approve a design.
- Checks: preview JavaScript syntax (`node --check`), literal-fragment checks, fictional total arithmetic and `git diff --check` passed on 24 November. Browser rendering has not been independently inspected. No native build or device/NFC testing: this is a design preview, not an installed app. Two alternatives are Score first (seven quality marks plus total, details on expansion) and Coffee first (coffee/total prominent, breakdown on expansion). Neither changes saved data or implements navigation to the tasting form; footer actions are labelled preview placeholders on interaction.
- Review: awaiting Product Owner feedback; independent implementation review not applicable until implementation exists.
- Definition of Done: proposal awaiting owner feedback. Production tests, bundling, prospective integration, merge and release gates N/A for this documentation/preview-only stage; none are claimed passed.
- Final commit/merge: pending; no merge to main requested.
