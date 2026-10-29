# OPS-WORKTREE-001 — Relocate legacy Codex worktrees to external storage

Status: preflight complete; paused for owner storage-protection decision. No old
payload files copied, moved or deleted.

## Scope, authority and ownership

Owner approved external drive default for all worktrees and migration of existing
ones to reclaim internal space. Main app/runtime/upload behavior unchanged.
Operating model sections5/7/8 and PROJECT_MANAGER_RECOVERY preservation rules
apply. Product/NDEF/UI behavior changes N/A: workstation storage operation only.
PM author /root; independent operations/data-preservation reviewer required.
Risk high for local-only/uncommitted work; no force/reset/clean/prune/branch
deletion or app-state database editing permitted.

Main /Volumes/external/code/cup_app stays clean8c0c49b. This new managed checkout
/Volumes/external/codex-worktrees/external-worktree-migration/cup_app and branch
codex/ops-external-worktree-migration hold only operations documentation/tools.
Creating it through Codex verified that the owner-selected global root setting
actually takes effect; registration succeeded without changing app settings.

## Proposed migration, subject to inventory and review

Source /Users/andrewstordy/.codex/worktrees is an existing ordinary directory.
Destination /Volumes/external/codex-worktrees/legacy-internal must not exist.
Evidence /Volumes/external/.codex-worktree-migration-2026-10-29 must be private.
Inventory every source entry and supported registered checkout, all Git refs/
statuses/HEADs and ignored/untracked state before changes. Inspect no secret
contents in logs. Check for processes using source before cutover; never stop
unrelated processes or mutate active worktrees.

Prefer a verified metadata-preserving copy of the legacy tree plus a compatibility
link at its original root, NOT changed per-chat paths or direct Codex state edits.
Existing Git registrations/absolute links continue to resolve through that link;
the physical bytes live externally. New managed worktrees use the external root
directly. Do not claim old Git paths were rewritten. Original internal copy stays
intact until independent verification approves reclaiming only exact verified
duplicate data. Main, original refs/indexes, uncommitted/untracked/ignored files,
ownership/permissions and symlink targets must survive. Any mismatch stops.

Acceptance: complete manifest/content verification, unchanged per-checkout Git
state and refs; old-path and physical external-path resolution; no app/source/
data/branch change; report actual reclaimed space and residual limitations.
No automatic cleanup of missing /private/tmp registrations. No main merge or
TestFlight/build/install action. Record exact stages/paths/commands/results and
rollback method here; migration is not complete just because the copy exists.

## Evidence and review

Inventory at2026-10-29:58 source children,49 valid registered Cup checkouts,
172415 filesystem entries,3493551420 logical bytes. Five checkouts have uncommitted
state (r1-039, r1-045/046/047/048 phone copies); no reset/stash/cleanup done.
Read-only --no-optional-locks Git inventory includes refs/reflogs/branches/
local-only reachability, HEADs/status/ignored/untracked names and index hashes.
Complete regular-file SHA256/mode/uid/gid/symlink manifest captured privately in
/Volumes/external/.codex-worktree-migration-2026-10-29. Raw secrets/content not
printed or committed; generated JSON stays outside Git. Four source entries are
owner-only/restricted. No obvious credential filenames found, not proof of no
sensitive content.

No legacy cwd found; open-file scan identified Watchman read-only directory
handles. Watch-list has13 legacy roots and2 unrelated external projects. Any
future cutover must preserve/refresh only those13 watches, never shutdown global
Watchman or affect unrelated main/IKAWA projects. No watcher mutation yet.
Missing /private/tmp registrations left untouched. No new/deleted branch except
this isolated operations branch.

Independent /root/worktree_migration_review: compatibility alias plan viable
only with quiescent source, full-content/perms/links/state comparison, retained
original until independent verification and exact-target reclamation. No generic
Git repair/remove/prune. Existing filesystem paths can be verified, but actual
old-chat reopening remains a separate manual acceptance, not proven by Git.

Mandatory pre-copy protection gate: diskutil reports source internal APFS
OwnersEnabled/FileVaultYes, destination external APFS OwnersDisabled/EncryptedNo.
Preserving numeric mode bits cannot prove equivalent access enforcement when
ownership is ignored. Reviewer requires explicit owner authorization to enable
ownership (drive-wide, affects other projects; admin may be needed), or explicit
acceptance of non-equivalent protection. External physical-loss risk without
encryption must be disclosed; do not silently encrypt/reformat or weaken security.
No raw source payload copy/cutover/deletion authorized past this gate yet.

Next action: obtain owner's storage-protection choice, then resume reviewed
copy/verification/cutover plan. Main remains clean8c0c49b; app/upload/settings and
local files unchanged apart from new external operations checkout and metadata
inventory. No ordinary product regression tests needed for unchanged source;
filesystem/Git integrity checks remain mandatory. No claim of reclaimed space.
