# Cup App Project Manager Recovery and Restart Guide

Use this guide when the Project Manager chat, Codex application state, subagents, worktrees, or an entire development computer is unavailable. It is an operational companion to [`AI_DEVELOPMENT_OPERATING_MODEL.md`](AI_DEVELOPMENT_OPERATING_MODEL.md); the operating model remains authoritative if the two disagree.

Recovery starts with inspection and a written status report. Do not resume implementation, rewrite task status, create replacement branches, merge, or delete anything until repository and remote state have been reconciled.

## 1. What is durable and what may be lost

The recovery source of truth is durable repository and remote-hosting evidence, not an agent's conversational memory.

| Usually durable when committed and pushed | Local or conversational state that may be lost |
| --- | --- |
| Remote `main`, task branches, commits, merge commits, and tags | Codex/Claude chats, summaries, plans, and subagent state |
| Canonical specifications and the operating model on the relevant commit | Local worktrees and branch checkouts |
| `docs/tasks/<TASK-ID>.md` records, including recorded evidence and review dispositions | Uncommitted tracked changes |
| Pull requests, review comments, checks, approvals, and merge/close state on the Git host | Commits that were never pushed to a durable remote |
| Release tags and build references that identify an exact pushed commit | Untracked and ignored files, including local reports, generated outputs, dependency directories, and device artifacts |
| Pushed changelog and release evidence | Dependency caches such as `node_modules`, tool installations, simulator/device state, signing sessions, environment variables, and credentials |

A task record is durable evidence, not a live process oracle. Completed records are history. An apparently active status must be checked against commits, remote branches, pull requests, reviews, and `main`; chat claims and a status line alone are not authoritative.

No Git procedure can recover work that existed only in a deleted worktree or failed computer. Uncommitted, untracked, ignored, or unpushed work may be irrecoverable. Do not claim otherwise.

### Recovering the approved cupping-form visual design

The 9 October 2026 approved SCA CVA/Legacy side-by-side visual is indexed at [`design/README.md`](design/README.md) and preserved as [`design/cva-legacy-side-by-side.html`](design/cva-legacy-side-by-side.html). The four earlier exploratory previews are in the same directory and are labelled in that README. If these files are not yet on the recovered `main`, inspect the pushed remote branch `codex/form-design-archive` (archive source commit `6392c7ba731750f95fa7b8e7c7265f15ff01c642`) during the read-only branch/PR audit below. Do not rely on the former Codex-local visualization path or chat history. The visual is a layout reference; the Product Specification, canonical form contracts and R1-010/R1-012 task records retain their normal authority and release gates.

The OpenAI article [Run long-horizon tasks with Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) similarly recommends durable project memory and explicit progress artifacts for work that must survive context boundaries. For Cup App, the repository operating model, canonical specifications, task records, commits, reviews, and protected Git workflow define the required form of that memory.

## 2. Same-machine recovery: preserve local evidence first

If the original computer or storage still exists, do not start by cloning, fetching, opening an unknown worktree in an editor/agent, switching branches, or trying to make a checkout clean. First preserve and inventory the surviving state in place. A new clean clone may be created later in a separate directory for comparison, but it does not replace this local-evidence audit.

From a known surviving Cup App checkout, record the following before any fetch or other reference update:

```bash
pwd
git rev-parse --show-toplevel
git status --short --branch
git diff --name-status
git diff --cached --name-status
git ls-files --others --exclude-standard
git ls-files --others --ignored --exclude-standard --directory
git remote -v
git branch --show-current
git branch --all --verbose --no-abbrev
git show-ref
git worktree list --porcelain
git log --branches --not --remotes --oneline --decorate
git reflog show --all --date=iso
```

Label this evidence **pre-fetch**. It captures the current checkout, tracked/staged changes, untracked and ignored paths, local/remote-tracking refs, registered worktrees, commits not currently reachable from a remote-tracking ref, and reflog recovery clues. Remote-tracking refs may be stale at this point; preserving that fact is intentional.

For every registered worktree whose purpose and path are already known, record `git -C <KNOWN-WORKTREE-PATH> status --short --branch` and its `HEAD`. Do not enter, launch an agent/editor in, install dependencies in, or modify an unfamiliar worktree merely to inspect it. Record unfamiliar or inaccessible worktrees as uninspected and keep fetch/cleanup deferred until their owner and purpose are reconciled.

Do not reset, clean, stash, rebase, merge, check out another branch, delete a worktree, expire reflogs, run garbage collection, or move files during this preservation pass. Record important local-only files without copying secrets into the repository or task record. If disk failure is suspected, stop normal Git activity and obtain appropriate storage/recovery help before increasing writes.

Only after the pre-fetch inventory is durable may a separate clean clone be used to compare remote state with the preserved checkout. Local-only commits and files remain recoverable only from the surviving storage until they are deliberately reviewed and durably preserved.

## 3. Prerequisites for recovery after total computer loss

Before a clean-machine restart can reproduce repository-backed work, obtain:

- the authoritative remote repository URL and an account with least-privilege read access initially;
- Git and, where used, the Git host CLI or browser access for pull requests, checks, reviews, and branch-protection settings;
- separately managed credentials for the Git host, package registries, Expo/EAS, Apple signing/App Store Connect, and any later service environments;
- a supported development host with the repository's required Node/npm, native iOS/Android, Expo, and device tooling installed as needed;
- access to external build records, test devices, firmware, certificates, provisioning profiles, and service configuration required by the task being recovered; and
- the Product Owner or authorised administrator for permissions that cannot safely be reconstructed.

The remote Git repository is necessary but not sufficient. It does not contain secrets, local environment variables, signing sessions, dependency caches, ignored files, or proof from a device that was never recorded durably. Credentials and recovery codes must be held in an approved password manager or platform credential store, never committed to this repository, pasted into task records, or copied into an agent prompt.

If the remote repository, required credentials, or an authoritative administrator is unavailable, report the exact limitation and stop before attempting a substitute source or weakening a gate.

After total computer loss there is no same-machine evidence to inventory. Begin from the durable remote and separately managed prerequisites below, and explicitly report that any unpushed/local-only state is unavailable.

## 4. Safe clean-clone restart

Use a new empty directory after the same-machine preservation pass, or immediately when the original machine is genuinely unavailable. Do not clone over a surviving checkout, copy an old `.git` directory, or run cleanup/reset commands against an unknown path.

```bash
git clone <REPOSITORY-URL> <RECOVERY-DIRECTORY>
cd <RECOVERY-DIRECTORY>
git remote -v
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -1 --oneline --decorate
```

Confirm that the resolved repository root and remote are the expected Cup App repository before continuing:

```bash
pwd
git rev-parse --show-toplevel
git config --get remote.origin.url
```

Do not install dependencies or run repository scripts until their current instructions and lockfiles have been inspected. Installation can execute lifecycle scripts and changes machine state. Do not restore `node_modules`, credential files, `.env` files, signing material, or caches from an untrusted backup.

Cloning creates local files and remote-tracking refs in the new directory, but it does not change a preserved checkout. Record the clone's initial refs/status before any additional fetch. If the initial branch is not the remote default, or local `main` differs from `origin/main`, report the discrepancy. Do not force, reset, merge, rebase, or check out an interrupted task merely to make the display look clean.

## 5. Read-only first audit

Run the audit from the verified repository root before any fetch in a surviving checkout and before any additional fetch in a clean clone. These commands inspect state; they do not intentionally update repository refs or the working tree.

### 5.1 Repository reading order

Read each selected file in full:

1. [`../AGENTS.md`](../AGENTS.md) — repository entrypoint.
2. [`AI_DEVELOPMENT_OPERATING_MODEL.md`](AI_DEVELOPMENT_OPERATING_MODEL.md).
3. The sections of [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) relevant to the work being recovered.
4. Relevant canonical technical specifications, including [`NDEF_PROTOCOL.md`](NDEF_PROTOCOL.md) or [`RELEASE_1_ARCHITECTURE_DATA_CONTRACT.md`](RELEASE_1_ARCHITECTURE_DATA_CONTRACT.md) where applicable.
5. [`UI_STYLE_GUIDE.md`](UI_STYLE_GUIDE.md) before creating, reviewing, or resuming user-facing UI work.
6. The relevant canonical file in [`tasks/`](tasks/), then [`../README.md`](../README.md), and finally the source/tests needed to verify the task's claims.

This startup sequence matches `AGENTS.md`; it is not the authority hierarchy. The operating model separately defines authority as Product Specification first, then consistent canonical technical specifications, then the operating model, UI/agent guidance, README, and implementation evidence. Never lower a requirement because current code, README text, an old task record, or a prior chat disagrees.

### 5.2 Inventory local repository evidence before fetch

```bash
git status --short --branch
git remote -v
git branch --show-current
git branch --all --verbose --no-abbrev
git show-ref
git tag --list --sort=-creatordate
git worktree list --porcelain
git log --oneline --decorate --graph --all
git log --branches --not --remotes --oneline --decorate
git reflog show --all --date=iso
git diff --name-status
git diff --cached --name-status
git ls-files --others --exclude-standard
git ls-files --others --ignored --exclude-standard --directory
git ls-files docs/tasks
rg -n '^(- \*\*Status:\*\*|# Task Record|## Review findings|## Final references)' docs/tasks
```

Discover the current commits; do not copy a commit hash from this guide:

```bash
git rev-parse HEAD
git rev-parse origin/main
git log -1 --oneline --decorate origin/main
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Record all output as pre-fetch evidence. `origin/main` here is the locally stored remote-tracking ref and may be stale. If authenticated network inspection is available, this command reads the remote's advertised `main` without updating local refs:

```bash
git ls-remote origin refs/heads/main
```

Inspect Git-host state through authenticated read-only commands or the repository web UI:

```bash
gh repo view
gh pr list --state all --limit 100
gh pr status
```

For each relevant pull request, inspect its base/head, commits, reviews, checks, mergeability, and merged/closed state. Also verify the actual `main` branch-protection or ruleset configuration; do not infer protection merely from documentation. If the Git host CLI is unavailable, record that limitation and use the authenticated web UI rather than guessing.

### 5.3 Controlled remote-ref refresh after pre-fetch evidence

`git fetch` mutates local remote-tracking refs and `FETCH_HEAD`, even though it does not modify checked-out files. Do not fetch until the complete pre-fetch refs, worktrees, status, local-only paths/commits, and any uninspected worktree limitations are recorded. Then, when remote reconciliation is authorised, use a plain fetch without pruning:

```bash
git fetch --tags origin
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git log -1 --oneline --decorate origin/main
```

Record this as **post-fetch** evidence and compare it with the pre-fetch inventory. Do not use `--prune` during initial recovery: disappearing remote-tracking refs may be useful evidence. Fetch does not authorise checkout, reset, merge, rebase, deletion, or implementation.

### 5.4 Reconcile tasks and tests

For every task that appears active, review-required, blocked, or recently completed:

- compare its declared branch/worktree and exact tested commits with remote refs and pull-request commits;
- confirm whether recorded review findings were resolved by a later commit;
- distinguish task-branch, prospective-integration, and post-merge evidence;
- verify whether the final/merge reference is present on `origin/main`;
- inspect changed files against declared scope and overlapping active tasks; and
- discover the current test commands from `package.json`, repository scripts, README, and the task record before running them.

Start with non-mutating checks such as `git diff --check`, targeted searches, and inspection of recorded CI results. Install dependencies, execute scripts, build, or access devices only after the current task and environment are understood. A test result proves only the exact commit and environment recorded; simulation does not prove physical NFC/device behaviour.

The first recovery report should state:

- repository root, remote URL, current branch, `HEAD`, and discovered `origin/main` commit;
- whether the working tree is clean and whether local `main` matches `origin/main`;
- relevant local/remote branches, worktrees, tags, pull requests, reviews, and checks;
- durable tasks and their evidence-backed lifecycle state;
- discrepancies, potentially lost local-only work, blockers, and missing access;
- which tests appear relevant and whether they have merely been discovered or actually run; and
- the proposed next action, with no implementation started.

## 6. Interrupted-task decision tree

Use evidence, not naming conventions or chat memory.

1. **Is the task's merge commit or final reviewed commit on current `origin/main`?**
   - Yes: treat the task record as historical. Verify post-merge evidence and any explicit follow-up; do not resume its old implementation branch.
   - No: continue.
2. **Is there an open pull request?**
   - Inspect its exact head/base commits, reviews, checks, unresolved findings, mergeability, and whether the task record matches. Do not merge or continue coding during the audit.
3. **Is there a pushed remote task branch but no open pull request?**
   - Compare it with `origin/main`, inspect its commit history and task handoff, and determine whether it awaits review, was superseded, or was intentionally abandoned. A branch name alone is not evidence of status.
4. **Is there only a closed, unmerged pull request?**
   - Inspect the close reason, review history, and successor work. Do not assume either completion or abandonment.
5. **Does a surviving local worktree contain changes or unpushed commits?**
   - Preserve it in place. Record tracked, untracked, and ignored state; identify its branch and upstream; do not clean, reset, delete, rebase, or combine it with another task. Decide separately whether to commit/push, archive, or abandon it with proper authority.
6. **Does the task record imply work that has no surviving commit, remote branch, pull request, or worktree?**
   - Report the work as potentially lost. Restart only from the newest verified durable commit after the PM confirms scope; do not reconstruct claimed results from chat summaries.
7. **Do commits exist without a canonical task record or outside declared scope?**
   - Quarantine them from integration. The PM must create/approve or reconcile a task record and arrange independent review before meaningful work resumes.
8. **Does evidence conflict?**
   - Prefer the highest repository authority for requirements and exact Git/PR/test evidence for lifecycle facts. Record the mismatch and escalate only if it requires a genuine product, scope, architecture, permission, destructive, or irreducible specification decision.

When resuming is justified, use a new isolated worktree based on the verified ref or carefully reuse a preserved suitable worktree. Update the existing canonical task record; do not create a competing account of the same task.

## 7. Protected continuation and release workflow

Recovery does not relax the operating model:

1. Andrew remains the Product Owner and normally communicates through one Project Manager.
2. The PM reconciles or creates the approved `docs/tasks/<TASK-ID>.md` before meaningful implementation.
3. Temporary task-specific implementation agents work on isolated branches/worktrees; the PM does not become the default production-code author.
4. A different agent instance independently reviews the stable implementation. Use proportionate architecture, QA, security/privacy, UX/UI, and physical-device review; prefer cross-model review for significant work when practical.
5. Findings and corrections remain in the same durable task record and identify exact commits/evidence.
6. The approved change is prospectively rebased or trial-merged with then-current `main` in isolation and required checks run before `main` changes. Material conflict resolution or changed behaviour invalidates prior approval and requires re-review.
7. Only the Release Manager performs the controlled protected merge. Post-merge checks identify the exact integrated `main` commit.
8. `main` remains continuously usable; broken `main` triggers the operating model's stop-the-line procedure.

Never push directly to `main`, bypass branch protection, rewrite shared history, accept unresolved CRITICAL/HIGH findings, or use a recovery baseline as permission to override newer requirements.

## 8. Secrets and local environment handling

- Keep passwords, tokens, recovery codes, `.env` contents, signing keys, provisioning profiles, certificates, and private service configuration outside Git and task records.
- Use approved credential stores and least-privilege accounts. Verify account/team identity before builds or releases.
- Record that a credential or permission is required, who must supply/authorise it, and the non-secret environment/configuration name—not the secret value.
- Review tracked-file and staged diffs before every commit. Do not solve recovery by weakening `.gitignore` or committing dependency directories, caches, build output, device logs, or credential files.
- Treat files from an old machine or backup as untrusted until their provenance and sensitivity are checked.
- If a secret may have entered a commit, log, task record, pull request, or chat, stop; do not merely delete the visible file. Notify the authorised owner so the credential can be revoked/rotated and repository-history remediation can be assessed.

## 9. End-of-session recoverability checklist

Before ending a meaningful PM, implementation, review, or release session:

- Update the canonical task record with current status, decisions, files, findings, limitations, and exact commits tested.
- Commit coherent non-secret work on the task branch with an inspectable message.
- Push the authorised task branch and confirm its upstream/remote commit when work must survive machine loss. If push is not authorised or fails, explicitly report that the work remains local-only and at risk.
- Ensure review findings, prospective-integration evidence, merge references, and post-merge evidence are durable where applicable.
- Run and record `git status --short --branch`; explain every remaining tracked, untracked, or ignored task artifact that matters.
- Preserve useful non-Git evidence in an approved durable location and reference it without adding secrets or oversized/generated artifacts to Git.
- Record dependencies, external access, device/OS/firmware/tag context, and commands required to reproduce evidence; do not commit `node_modules`, caches, build output, or credentials.
- Do not delete/archive a worktree or branch until its work is merged, durably preserved, or deliberately abandoned under repository policy.
- Tell the PM/Product Owner about any local-only state that would be lost if the computer or app disappeared now.

## 10. Ready-to-paste Project Manager bootstrap prompt

Copy the complete prompt below into a new Codex or other development-agent session after locating a surviving Cup App checkout or, when the original machine is unavailable, creating a verified clean clone:

```text
You are the Project Manager for the Cup App development project. Andrew is the Product Owner, and you are his primary interface to the AI development team. Follow the repository's adopted operating model; do not redefine Product Specification requirements or waive mandatory gates.

This is a recovery/bootstrap inspection. Follow the repository reading sequence:
- AGENTS.md
- docs/AI_DEVELOPMENT_OPERATING_MODEL.md
- the sections of docs/PRODUCT_SPEC.md relevant to recovery and any task being reconciled
- the relevant canonical technical specifications, including docs/NDEF_PROTOCOL.md and docs/RELEASE_1_ARCHITECTURE_DATA_CONTRACT.md where applicable
- docs/UI_STYLE_GUIDE.md before any user-facing UI work
- docs/tasks/TASK_TEMPLATE.md and each relevant task record, then README.md and the source/tests needed to verify claims

Also read docs/PROJECT_MANAGER_RECOVERY.md in full as the operational recovery checklist. Its procedure is subordinate to the authority hierarchy in the operating model.

If this is a surviving same-machine checkout, preserve it in place. Before any fetch, branch switch, editor/agent launch in an unfamiliar worktree, dependency install, cleanup, or other mutation, capture:
- repository root, HEAD, current branch/upstream, full status, unstaged/staged file names, untracked and ignored paths;
- all local and remote-tracking refs, tags, registered worktrees, reflogs, and commits currently reachable from local branches but not remote-tracking refs; and
- status/HEAD for already-known worktrees only, leaving unfamiliar worktrees unentered and unmodified.

Then inspect, without changing repository refs, files, branches, worktrees, or remote state:
- the repository root, current branch, HEAD, working-tree status, remotes, and upstreams;
- the current local main and locally stored remote-tracking main commits, discovering hashes from Git rather than trusting this prompt and labelling remote-tracking refs as potentially stale;
- local/remote branches, tags, registered worktrees, and recent graph/history;
- all docs/tasks records, especially any apparently active, review-required, blocked, or recently completed task;
- open, closed, and merged pull requests plus their exact heads/bases, reviews, checks, and merge state;
- actual main branch-protection/ruleset assumptions where access permits;
- relevant test commands and recorded evidence, without installing dependencies or running state-changing setup during the first audit; and
- discrepancies between task status, commits, PRs, reviews, tests, and current main.

Do not run git fetch during this initial audit. If authenticated remote inspection is available, git ls-remote and read-only Git-host/PR queries may be used without updating local refs. Report the complete pre-fetch evidence first. A later authorised reconciliation may run plain `git fetch --tags origin`, explicitly recording that it mutates local remote-tracking refs and FETCH_HEAD; do not use --prune during initial recovery.

Treat repository specifications, task records, pushed commits, PR evidence, and tags as durable evidence. Treat chat history, subagent state, local worktrees, dependency caches, credentials, uncommitted changes, untracked/ignored files, and unpushed commits as potentially absent or non-authoritative. A task record's status must be reconciled with Git and PR evidence; completed task records are history, not active instructions.

Do not modify files, create tasks or branches, install dependencies, run builds, fetch, commit, push, merge, delete, reset, rebase, clean, stash, switch branches, open unfamiliar worktrees, or start implementation yet. Do not use a separate Release Manager chat during this inspection. Report:
1. whether you understand and can perform the Project Manager role;
2. the discovered main and HEAD commits and whether the checkout is clean/synchronized;
3. durable tasks and their evidence-backed lifecycle states;
4. relevant branches, tags, worktrees, PRs, reviews, and checks;
5. unresolved blockers, follow-ups, conflicts, potentially lost local-only work, or missing access;
6. the relevant tests discovered and what has or has not been verified; and
7. the safest proposed next action.

Escalate only genuine product decisions, material scope changes, high-risk architecture, credentials/permissions, destructive operations, or irreducible specification ambiguity. Do not build a backlog or begin work until Andrew authorises the next step.

End with exactly PROJECT MANAGER READY or PROJECT MANAGER BLOCKED.
```
