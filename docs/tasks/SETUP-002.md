# Task Record

- **Task ID:** SETUP-002
- **Title:** Preserve and index the approved two-form UI design for recovery
- **Status:** Documentation-only archive committed on an isolated branch; recovery pointers, independent review, prospective integration, protected PR merge, and post-merge validation pending.
- **Product Specification references:** §6.6 and FR-010/030/032 govern the two Release 1 forms; this task does not change their requirements.
- **Technical specification references:** `docs/AI_DEVELOPMENT_OPERATING_MODEL.md` §§1, 7–11, 13 and `docs/PROJECT_MANAGER_RECOVERY.md`; form-specific contracts remain in R1-010 and R1-012.
- **Objective:** Make the approved 9 October 2026 CVA/Legacy visual comparison and its design history recoverable from GitHub without Codex local visualization storage or chat history, and give a new Project Manager a direct, unambiguous route to it.
- **Non-scope:** Application UI or scoring changes, new design decisions, revisions to Product Specification or form contracts, NFC/device work, or treating illustrative mockup values as test fixtures.
- **Expected files/contracts affected:** `docs/design/` HTML previews and README; a narrow pointer in `docs/PROJECT_MANAGER_RECOVERY.md`; cross-references in the existing R1-010 and R1-012 task records on their own isolated branches. No application code or canonical technical contract changes.
- **Dependencies:** Archive branch `codex/form-design-archive` starts at clean `main=34f95a8119574557e5e67cc5246888a9d1c089c4`. R1-010 and R1-012 are unmerged task branches, so their task-record pointers must be committed on those branches rather than importing their implementation into this archive PR. Keep `main` unchanged until independent review and prospective integration pass.
- **Risk level:** Low — documentation/provenance only, but an incorrect reference or an apparent override of canonical requirements could mislead future implementation.
- **Branch/worktree:** `codex/form-design-archive` in `/Users/andrewstordy/.codex/worktrees/form-design-archive/cup_app`.
- **Authoring agent:** Project Manager for coordination-only documentation; no production code.
- **Required reviewer(s):** Independent non-author documentation/recovery reviewer; Release Manager prospective integration and protected PR/post-merge checks.

## Acceptance criteria

- The final side-by-side visual and four earlier exploratory HTML files are committed and pushed, byte-for-byte identical to their original Codex visualization sources. A README identifies the final approved layout reference and labels the others as earlier alternatives.
- The recovery guide points to the repository-relative design index and final comparison, explains how to locate the pushed archive branch if the files are not yet on `main`, and preserves the Product Specification/task-record authority boundary.
- R1-010 and R1-012 task records point to the durable design archive without changing their statuses, scope, review findings, or release gates.
- A fresh clone with access to GitHub can find the design using repository files/refs alone. The archive remains free of credentials, private data and external asset dependencies.
- Independent review, prospective validation against current `main`, controlled PR merge, and exact-main post-merge confirmation are recorded. No implementation or device result is inferred.

## Decisions

- Andrew requested durable recovery of the approved visual work and authorised explicit recovery/task pointers and normal protected-PR integration on 10 October 2026.
- The HTML is archived exactly as produced. It is design evidence, not a higher-authority specification or a substitute for accessibility/device validation.

## Implementation handoff

- **Files changed:** `docs/design/` preview archive and index; recovery guide and cross-branch task pointers pending.
- **Implementation summary:** Documentation preservation only; no application code.
- **Tests/checks run:** Byte comparison of each source/archived HTML passed; remaining validation pending.
- **Known limitations:** HTML fragments may show icon placeholders outside the original visualization host; content and layout source are preserved. Earlier alternatives are not the final agreed layout.
- **Unresolved issues:** Independent review and controlled integration pending.
- **Changelog-worthy information:** None for app release; repository recovery documentation now preserves the form design.

## Tests and evidence

- Initial archive commit `6392c7ba731750f95fa7b8e7c7265f15ff01c642` was pushed to `origin/codex/form-design-archive`. `cmp` found no difference for any of the five HTML source/archive pairs. A targeted scan found no URLs, local absolute paths, tokens, passwords, or credentials in the HTML files. This is source preservation, not a rendered visual QA claim.

## Review findings

- **Outcome:** Pending independent non-author review.
- **Findings by severity:** Pending.
- **Specification/test evidence:** Pending.
- **Required corrective actions:** Pending.

## Definition of Done

- Acceptance criteria satisfied: Pending.
- Automated tests added/updated where required: N/A — documentation-only source preservation; byte comparison is required.
- Existing relevant tests pass: N/A — no application change; prospective diff/links check required.
- Build/bundle validation passes where relevant: N/A — no application code or assets consumed by the build.
- No unrelated refactoring or product changes: Pending.
- Documentation updated when contracts or behaviour change: N/A — no contract/behaviour change.
- UI checked against guidance where relevant: N/A — exact approved preview archived; no UI implementation.
- Security/privacy review completed where relevant: Pending content/secrets audit.
- Identified regression checks performed: Pending link and source comparisons.
- Exact commit tested recorded: Pending.
- Branch/worktree validation recorded: Pending.
- Prospective integrated-`main` validation recorded before merge: Pending.
- Physical NFC/device verification distinguished clearly from simulation: N/A — documentation-only; no device claim.
- Review findings resolved; handoff and clean Git state recorded: Pending.

## Final references

- **Final commit:** Pending.
- **Merge reference:** Pending.
