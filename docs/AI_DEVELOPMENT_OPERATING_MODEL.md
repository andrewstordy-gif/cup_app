# Cup App AI Development Operating Model

**Status:** Adopted
**Date:** 1 October 2026
**Purpose:** Define how AI agents organise, implement, review, and release Cup App work while keeping `main` continuously usable for user testing.

## Table of contents

1. [Authority hierarchy](#1-authority-hierarchy)
2. [Product Owner](#2-product-owner)
3. [Project Manager and Release Manager](#3-project-manager-and-release-manager)
4. [Temporary implementation agents](#4-temporary-implementation-agents)
5. [Specialist review agents](#5-specialist-review-agents)
6. [Claude and Codex](#6-claude-and-codex)
7. [Durable agent communication](#7-durable-agent-communication)
8. [Git model](#8-git-model)
9. [Baseline and recovery](#9-baseline-and-recovery)
10. [Task lifecycle](#10-task-lifecycle)
11. [Definition of done](#11-definition-of-done)
12. [Release gates](#12-release-gates)
13. [`main` and user testing](#13-main-and-user-testing)
14. [Changelog ownership](#14-changelog-ownership)
15. [Scope discipline](#15-scope-discipline)
16. [Unresolved product decisions](#16-unresolved-product-decisions)
17. [Initial operating principle](#17-initial-operating-principle)

## 1. Authority hierarchy

Agents must use the following hierarchy, from highest to lowest authority:

1. **[`docs/PRODUCT_SPEC.md`](PRODUCT_SPEC.md)** — the highest authority for product behaviour and what the released product must do. It contains approved product requirements, priorities, acceptance criteria, release boundaries, and the Definition of Pilot-Ready.
2. **Canonical technical specifications** — normative contracts within their technical domain only where they do not conflict with the Product Specification. These include [`docs/NDEF_PROTOCOL.md`](NDEF_PROTOCOL.md) and future architecture, security, data, or offline-synchronisation specifications.
3. **This operating model** — defines how development work is selected, isolated, implemented, reviewed, and released.
4. **UI and implementation guidance** — including [`docs/UI_STYLE_GUIDE.md`](UI_STYLE_GUIDE.md), `AGENTS.md`, and `CLAUDE.md`.
5. **`README.md`** — describes the current implementation, commands, and repository state. It is descriptive conformance evidence, not a normative specification.
6. **Existing source code, serializers, parsers, and tests** — represent current behaviour and conformance evidence, including incomplete and legacy behaviour. They are not normative specifications and do not override the Product Specification or a consistent canonical technical specification.

### Resolving conflicts

- Follow the highest applicable authority.
- A technical specification controls its domain only when it is consistent with the Product Specification.
- Treat disagreement between implementation evidence and the Product Specification or a consistent canonical technical specification as a defect or unresolved migration issue, not as proof that the implementation is authoritative.
- Do not silently reinterpret a higher-level requirement to match legacy code.
- Record the conflict in the task or review handoff, identify the affected requirement or contract, and notify the Project Manager.
- If following the higher authority would create a safety, security, data-loss, or feasibility problem, stop the affected work and escalate with evidence. Do not improvise a conflicting product policy.
- Documentation corrections and implementation changes should be separate, reviewable work when combining them would obscure the decision.

## 2. Product Owner

The human is the **Product Owner**. The Product Owner should normally communicate with one persistent Project Manager agent rather than coordinating individual implementation agents.

The Project Manager escalates only:

- genuine product decisions or unresolved Product Specification questions;
- material changes to approved scope or acceptance criteria;
- high-risk or difficult-to-reverse architectural decisions;
- credentials, permissions, billing, signing, or external-account access;
- destructive or history-rewriting operations;
- ambiguities that cannot reasonably be resolved from the authority hierarchy.

Routine implementation choices, code organisation within established patterns, ordinary test failures, and reversible technical details should be resolved by the agents and recorded in the task. They should not consume Product Owner attention.

## 3. Project Manager and Release Manager

One persistent agent acts as **Project Manager (PM)** and, unless delegated, **Release Manager**. The PM maintains continuity across temporary agents but should generally not implement production code.

The PM is responsible for:

- maintaining the implementation backlog;
- translating Product Specification requirements into small, testable tasks;
- attaching relevant functional-requirement IDs and acceptance criteria to every product task;
- identifying dependencies, conflicts, and safe sequencing;
- assigning isolated work to temporary implementation agents;
- avoiding concurrent ownership of the same files or contracts;
- selecting proportionate independent and specialist reviewers;
- tracking the state of `main`, the current release, open risks, and incomplete work;
- deciding when work may enter the merge and release process;
- consolidating user-testing feedback into durable backlog tasks;
- consolidating release-level changelog information;
- ensuring release gates remain tied to P0 requirements and the Definition of Pilot-Ready.

The PM cannot:

- change Product Specification requirements or redefine product behaviour;
- waive mandatory review, validation, security, or release gates;
- accept unresolved CRITICAL or HIGH review findings;
- make material product-policy decisions;
- declare a P0 requirement complete without evidence.

Those actions require Product Owner resolution or the appropriate defined gate. Coordination authority does not grant product-authority or gate-waiver authority.

The PM may make small coordination-only edits when explicitly assigned, but should not become the default production-code author. Separating implementation from coordination improves independent review and keeps release decisions evidence-based.

## 4. Temporary implementation agents

Prefer temporary, task-specific agents over permanent frontend, backend, database, or NFC ownership roles.

Normal implementation tasks should be vertical product slices that deliver a testable behaviour, for example:

- add NFC cup registration;
- implement account-free session join;
- implement durable offline tasting autosave;
- implement explicit, idempotent **Share results**.

A broad subsystem agent is appropriate only when a compelling technical constraint requires sustained ownership and the PM records that reason.

Each implementation agent receives only the context needed for its task:

- task objective and boundaries;
- relevant Product Specification requirement IDs and acceptance criteria;
- relevant technical specifications;
- dependencies and known risks;
- expected files or interfaces, where known;
- required validation and reviewers.

Implementation agents must make the smallest coherent change that satisfies the task. They must not expand scope, redesign unrelated UI, or refactor unrelated architecture opportunistically.

## 5. Specialist review agents

Architecture, QA, security/privacy, UX/UI, and release review are responsibilities and gates, not necessarily five separate agent instances. Specialist review is invoked according to risk and is not mandatory for every trivial change. For small, low-risk work, one competent independent non-author reviewer may cover multiple responsibilities when the task record states exactly which responsibilities were covered. This consolidation must not weaken mandatory specialist review for high-risk Cup App changes.

The independent reviewer must be a different agent instance from the implementation author. An agent must never approve its own implementation, its own commits, or its own conflict resolution.

### Architecture reviewer

Use when work changes cross-cutting boundaries, data models, public interfaces, navigation structure, native integrations, offline/synchronisation design, protocol contracts, migrations, or foundational dependencies. The reviewer checks consistency with approved requirements, reversibility, failure modes, and future compatibility without inventing Release 2 scope.

### QA/test agent

Use for meaningful product behaviour, regression-prone changes, P0 requirements, bug fixes without an existing reproduction, and release candidates. The QA agent checks acceptance criteria, test coverage, failure paths, and evidence from the actual implementation rather than trusting the implementation summary.

### Security/privacy reviewer

Required for changes involving:

- offline persistence or recovery;
- result sharing, queues, retries, or synchronisation;
- authentication or session-scoped access;
- blind identity or reveal behaviour;
- NFC identity, payloads, or protocol writes;
- organisation data isolation;
- credentials, personal data, retention, or deletion.

The reviewer checks data exposure, authorisation boundaries, durability, replay/duplication, tenant isolation, and safe failure behaviour.

### UX/UI reviewer

Use for new or materially changed user-facing flows, controls, language, accessibility behaviour, responsive layout, or visual patterns. Review against `docs/UI_STYLE_GUIDE.md`, existing Home/Cupping reference screens, accessibility requirements, and the task's acceptance criteria.

### Release agent

Use when consolidating changelog entries, preparing a merge to `main`, producing a user-test build, creating release tags, or checking release gates. The Release agent verifies provenance, clean Git state, validation evidence, and the exact commit being released.

## 6. Claude and Codex

Claude and Codex do not own permanent product domains. Either may implement or review work based on task fit and availability.

Prefer cross-model review for significant work, although using a different model is not mandatory when a genuinely independent agent instance performs the review:

- Codex implementation followed by Claude review; or
- Claude implementation followed by Codex review.

The second model must review repository evidence independently rather than merely endorsing the first model's report. Specifications, task records, branches, commits, diffs, tests, and review findings are the communication mechanism. Never depend on shared conversational memory between Claude and Codex.

## 7. Durable agent communication

Agent coordination must be recoverable from repository records. Informal chat may help during a task, but it is not the authoritative handoff.

Do not build an external multi-agent orchestration service at this stage. Use the canonical task record, branches/worktrees, commits, tests, and structured handoffs.

### Task record

Every meaningful development task must have one canonical durable task record at:

```text
docs/tasks/<TASK-ID>.md
```

Trivial typo-only or document-formatting work does not require a task file unless the PM determines that one is useful. The task record must contain enough information for another agent to continue without access to the previous conversation.

At minimum, record:

- task ID;
- title;
- status;
- Product Specification references;
- technical-specification references;
- objective;
- non-scope;
- expected files, shared files, interfaces, and contracts affected;
- dependencies;
- risk level;
- implementation branch/worktree;
- authoring agent;
- required reviewer(s);
- acceptance criteria;
- decisions;
- implementation handoff;
- tests and evidence, including exact commits tested;
- review findings and disposition;
- final commit and merge reference.

The PM creates or approves the initial record before implementation starts. Each agent updates the same record for its assigned phase rather than creating an incompatible parallel account.

### Implementation handoff

Record in the task file:

- files changed;
- concise implementation summary;
- tests and builds run, with results;
- device/manual checks performed;
- known limitations;
- unresolved issues or follow-up work;
- changelog-worthy information for PM/Release consolidation.

### Review handoff

State one outcome:

- **PASS** — ready for the next gate;
- **CHANGES REQUIRED** — correctable findings remain;
- **BLOCKED** — missing decision, access, evidence, or external state prevents a reliable conclusion.

Include findings by severity, specification or test evidence, and required corrective actions in the task file. A PASS must identify what was reviewed and what was not verified.

## 8. Git model

`main` is the continuously usable, releasable, and user-testable version.

Rules:

- Agents do not develop directly on `main`.
- Agents do not push directly to `main`.
- Work starts from the current `main`, after confirming it is clean and synchronized with `origin/main`.
- Each meaningful task uses an isolated, short-lived branch and preferably an isolated worktree.
- A branch should represent one coherent task or tightly coupled vertical slice.
- Every task record declares expected shared files, interfaces, schemas, protocols, navigation contracts, and repository APIs it may affect.
- If an implementation agent discovers that it must modify an unassigned shared file or contract that overlaps another active task, it must stop that part of the work and return to the PM for coordination. Overlapping integration work is sequenced rather than independently merged.
- Incomplete, failing, unreviewed, or ambiguous work must not be merged.
- Every meaningful change requires at least one independent approval and all required validation/checks before merge.
- Before a controlled merge, the approved change must be updated/rebased onto, or trial-merged with, the current `main` in an isolated branch or worktree. Run the required validation checks against that prospective integrated result while leaving `main` unchanged.
- `main` must not change until the prospective integrated result passes its required validation and review gates.
- Only the Release Manager performs the controlled merge to `main` after verifying the approved change, current `main`, prospective integrated result, and gates.
- Experiments and unfinished work remain outside `main`.
- Feature flags may permit partially integrated capability in `main` only when the hidden/default state is safe, tested, and has a clear completion or removal plan.
- Do not introduce a permanent `develop` branch.
- Do not rewrite shared branch history without explicit authority and a verified recovery ref.
- Delete short-lived branches/worktrees only after their work is merged, preserved, or deliberately abandoned according to repository policy.

Configure GitHub branch protection and required checks for `main` where available. If technical branch protection is unavailable, process protection is mandatory: the Release Manager is the only role allowed to perform the controlled merge.

Every merge to `main` should be small enough to review and validate as a potentially testable product increment. Any material change after approval—including meaningful conflict resolution, rebase changes, altered generated output, or changed behaviour—invalidates the prior approval. The resulting diff must receive independent review again and repeat the required prospective integration validation before merge. Post-merge validation still confirms the exact integrated `main` commit, but it is not the first integration test.

## 9. Baseline and recovery

The known-good pre-operating-model prototype baseline is:

- Tag: `prototype-baseline-2026-10-01`
- Commit: `0c3a8f42977f36cb7613c3b4c8044b4f933dfad1`

Use this ref to inspect or recover the verified prototype state. It is a recovery baseline, not permission to bypass newer approved requirements.

The branch `checkpoint/pre-agent-setup-2026-10-01` preserves unfinished work that existed before this operating model. It is not canonical production behaviour. Any work recovered from it must be treated as a new task, compared with current specifications, reviewed, and validated before it can enter `main`.

## 10. Task lifecycle

```text
Product requirement
        ↓
PM task
        ↓
isolated implementation branch/worktree
        ↓
self-check and handoff
        ↓
independent review
        ↓
QA and automated validation
        ↓
specialist review when required
        ↓
prospective integration with current main
and required validation
        ↓
PM/Release approval
        ↓
merge to main
        ↓
identifiable user-test build
        ↓
feedback returned to backlog
```

### 1. Requirement to PM task

**Entry:** An approved requirement, defect, validation finding, or user-testing observation exists.
**Exit:** The task has an ID, bounded objective, requirement references, acceptance criteria, dependencies, risk level, and review plan. Open product decisions are resolved or explicitly excluded.

### 2. Implementation

**Entry:** The task is ready and an isolated branch/worktree starts from current `main`.
**Exit:** The scoped implementation is complete, self-reviewed, tested proportionately, and accompanied by an implementation handoff. The working tree contains no unexplained changes.

### 3. Independent review

**Entry:** A stable diff and handoff are available.
**Exit:** The reviewer records PASS, CHANGES REQUIRED, or BLOCKED with evidence. Required corrections return to implementation and are reviewed again.

### 4. QA and specialist gates

**Entry:** Independent code review has no unresolved blocking findings.
**Exit:** Acceptance criteria and regression paths have evidence; required architecture, security/privacy, UX/UI, and device reviews have passed or explicitly documented limitations prevent release.

### 5. PM/Release approval and merge

**Entry:** Definition of done and required reviews pass for the task change. The approved change is then updated/rebased onto, or trial-merged with, the current `main` in isolation, and required checks pass on that prospective integrated result before `main` changes. If this preparation materially changes the reviewed diff, independent review and prospective validation repeat on the resulting diff.
**Exit:** The Release Manager merges the validated prospective result through the controlled path, post-merge checks confirm the exact integrated `main` commit, and release/changelog records identify the change.

### 6. User test and feedback

**Entry:** A build is produced from an identifiable `main` commit or tag.
**Exit:** Results, device context, failures, and observations are captured as durable evidence and converted into backlog tasks where action is required.

## 11. Definition of done

An individual task is not complete because an agent says it works. Every Definition of Done item below must be recorded in the canonical task record as either **PASS** or **N/A — with a written reason**:

- all task acceptance criteria satisfied with evidence;
- appropriate automated tests added or updated;
- existing relevant tests passing;
- app bundle or native build validation passing where relevant;
- manual or device checks recorded where automation is insufficient;
- no unrelated refactoring, formatting churn, or product changes;
- behavioural, protocol, or contract documentation updated when changed;
- UI checked against existing design guidance and accessibility requirements;
- security, privacy, reliability, and data-loss risks reviewed when applicable;
- identified regression checks for affected existing flows executed and recorded;
- independent and specialist review findings resolved;
- clean working tree and an inspectable commit history;
- concise implementation and review handoffs produced;
- changelog-worthy information supplied to the PM/Release agent.

Validation evidence must identify the exact commit tested. Task branch/worktree validation, prospective integration validation against the then-current `main`, and post-merge validation of the exact integrated `main` commit are distinct records. The prospective validation must occur before `main` changes; post-merge validation confirms the merge rather than serving as the first integration test. None may be implied by another.

Physical NFC or device behaviour must never be claimed as verified from simulation, mocked payloads, or bundling alone. State exactly which hardware, OS, firmware, tag type, and scenario were tested.

## 12. Release gates

Release decisions are governed by the Product Specification's P0 requirements and Definition of Pilot-Ready.

### Per-change validation

An individual change records evidence for its own acceptance criteria, affected P0 requirements, regression checks, and Definition of Done. A criterion may be **N/A** only with a written reason showing why the scoped change cannot affect it. Per-change validation does not establish that the whole product is pilot-ready.

### Full release and pilot validation

A Release 1 pilot candidate requires a complete requirement-to-evidence record. Every applicable P0 requirement and every Definition of Pilot-Ready criterion must have **PASS** evidence against the exact release commit. Any failed, missing, untested, or unresolved applicable criterion blocks the pilot; it must not be marked N/A for convenience.

The following areas require explicit protection:

- offline session operation;
- durable local event and draft storage;
- participant-controlled, explicit **Share results**;
- idempotent sharing and retry behaviour;
- blind-data isolation in UI, tag data, cached data, and network responses;
- deterministic cup/sample resolution;
- canonical NFC payload conformance;
- NFC write, verification, interruption, and reassignment behaviour;
- safe handling of unknown, unassigned, damaged, or unsupported NFC tags;
- QR/manual fallback when NFC fails;
- organisation data isolation;
- session-scoped participant access.

Prefer automated tests for invariants, data transformations, authorisation rules, retry/idempotency, migrations, and failure handling. Require human/device testing for NFC radio behaviour, physical tags, native permissions and entitlements, accessibility interaction, platform-specific lifecycle behaviour, and realistic cupping-table usability.

A passing bundle is necessary evidence for many changes but does not prove native installation, NFC operation, offline durability, or pilot readiness.

## 13. `main` and user testing

`main` must remain suitable for frequent user testing. Treat every merge as a potentially testable product increment:

- integrated checks must pass;
- incomplete flows must remain safely hidden or outside `main`;
- known limitations must be explicit;
- the exact merged commit must be identifiable.

Generate user-testing builds only from named `main` commits or tags, never from an arbitrary developer branch. Record the commit, platform, build identifier, configuration, and relevant device/firmware context.

User-testing feedback must become a durable observation, defect, or backlog task with reproduction context and expected behaviour. Do not leave product evidence only in agent chats.

### Stop-the-line recovery for broken `main`

If `main` is discovered to be unusable:

1. pause all further merges;
2. record the failing `main` commit and reproducible evidence in a task record;
3. have the Release Manager identify the offending merge or change;
4. revert it unless a verified fix-forward is demonstrably safer and equally immediate;
5. validate the repaired `main` commit before merges resume.

Do not stack unrelated fixes onto a broken `main` or resume normal merging on the promise of a later repair.

## 14. Changelog ownership

Parallel implementation agents should not all edit `CHANGELOG.md`; doing so creates avoidable merge conflicts and inconsistent release narratives.

- Implementation agents include changelog-worthy details in their handoff.
- The PM/Release agent consolidates those details into `CHANGELOG.md` at an integration or release boundary.
- An implementation agent edits the changelog only when an isolated task explicitly assigns changelog ownership.

`AGENTS.md` implements this ownership rule: implementation agents record changelog-worthy information in the task handoff, while only the PM/Release agent or a task explicitly assigned changelog ownership edits `CHANGELOG.md`.

## 15. Scope discipline

- Release 1 work must satisfy Release 1 independently of Smart Cup hardware.
- Do not opportunistically implement Release 2 features while completing Release 1 tasks.
- Preserve compatible extension points for future Smart Cups only where this does not add unrequested product behaviour or delay Release 1.
- Do not use speculative architecture as a substitute for current acceptance criteria.
- Do not improve unrelated UI, rename unrelated concepts, replace established components, or refactor unrelated architecture inside a focused task.
- Record worthwhile out-of-scope observations as backlog candidates rather than expanding the active diff.

## 16. Unresolved product decisions

When `docs/PRODUCT_SPEC.md` deliberately lists an open decision, an implementation agent must not silently choose a policy that materially constrains the product.

The PM must choose one of three responses:

1. defer the affected work until the decision is made;
2. select a clearly safe, reversible technical default that does not present itself as settled product policy; or
3. escalate the decision to the Product Owner with options, evidence, and consequences.

The chosen response and its reversibility must be recorded in the task. A temporary default must not quietly become a permanent contract through implementation precedent.

### Approved Release 1 protocol decision: FR-028B

Product Specification requirement **FR-028B** is resolved for the two Release 1 forms. The canonical NDEF protocol defines `NDEF4.f=1` for SCA CVA and `NDEF4.f=2` for SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023). Quick QC and Purchasing/selection are subsequent-release concepts with no assigned or reserved NDEF values.

Implementation agents must preserve the approved mappings and visibly reject unknown or unsupported values; they must never guess, silently map an unsupported value to SCA CVA, or invent future production values. Each supported value still requires one immutable bundled form key, version, and definition hash. Any future form or mapping requires an approved Product Specification and protocol change before it enters user-visible `main`, persisted production data, or a release contract.

## 17. Initial operating principle

The goal is not maximum agent autonomy. The goal is reliable delivery with minimal Product Owner intervention.

Autonomy should increase only where tests, specifications, isolation, and independent review make it safe.
