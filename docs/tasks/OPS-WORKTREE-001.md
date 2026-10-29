# OPS-WORKTREE-001 — Relocate legacy Codex worktrees to external storage

Status: owner now chose existing unencrypted external storage; awaiting macOS
administrator authorization for ownership enforcement. No old payload copied,
moved or deleted.

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

Historical choice, superseded below: owner initially chose encrypted, ownership-enabled external
storage, preserve all files/uncommitted work, main unchanged. Use a separate new
APFS(Encrypted) volume in existing external container rather than encrypting or
erasing existing external/main data. Read-only diskutil confirmed Samsung T7
external containerdisk7 UUID027166B4-80DA-4D11-AE22-A4B5CBD21BB3, existing
external disk7s1 UUID3C56520D-40F3-4233-8F9E-0C1AB20CEB7E. Existing mount/main
must remain untouched. New proposed volume CodexWorktrees, expected
/Volumes/CodexWorktrees, must be verified after creation; identifiers can change.

Prepared Disk Utility Add APFS Volume dialog from selected external disk7s1,
named CodexWorktrees and chose APFS(Encrypted). Stopped at blank password dialog.
Owner must enter/verify/store password privately and complete Choose/Add; agent
must not receive/generate/type credentials or operate erase/partition controls.
No volume creation command/confirmation has been executed by agent. Initial
Disk Utility launch tool unexpectedly took~694seconds; subsequent actions1–2s.

Historical encrypted plan, not to execute: after owner completes creation verify encrypted/unlocked/ownership-enabled
new volume and free space, create private directories, change future managed
root via user-operated Codex setting to encrypted destination, then independently
review updated exact destination/copy/verification/cutover/reclamation plan.
Old unencrypted destination path above is superseded, not approved for payload
copy. No drive-wide ownership setting or encryption changed yet.

Latest owner instruction supersedes the encrypted plan: "Please just use the
external drive without encryption", after discussing the simpler existing-drive
option with ownership enabled. Agent cancelled password dialog and Add APFS
Volume sheet in Disk Utility; no new volume or encryption created. Verified
/Volumes/CodexWorktrees absent; existing external UUID unchanged. Actual target
returns to /Volumes/external/codex-worktrees/legacy-internal (must remain absent
until copy), with existing managed default retained. Source/main untouched.

Tried diskutil enableOwnership /Volumes/external: definite refusal, root required.
Tried sudo -n same exact command: definite refusal, password required. No setting
changed. Do not request/handle credentials, bypass macOS authorization, leave an
interactive sudo process waiting or move protected data with ignored ownership.
Next step: owner runs sudo diskutil enableOwnership /Volumes/external locally,
entering password only into macOS/Terminal. This changes ownership enforcement,
not encryption or formatting. Then independently revalidate gate/copy plan and
refresh source manifests before migration; current inventory is pre-move only.

Main remains clean8c0c49b; app/upload/settings and
local files unchanged apart from new external operations checkout and metadata
inventory. No ordinary product regression tests needed for unchanged source;
filesystem/Git integrity checks remain mandatory. No claim of reclaimed space.
