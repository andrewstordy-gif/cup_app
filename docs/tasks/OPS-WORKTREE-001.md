# OPS-WORKTREE-001 — Relocate legacy Codex worktrees to external storage

Status: complete — migration and post-removal integrity checks independently
passed. No product/runtime/main change.

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

Chronological history follows: earlier paused/no-move/no-reclaimed-space statements
describe their phase only. The actual final-result section supersedes them.

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

## Approved existing-volume migration

Owner ran sudo diskutil enableOwnership /Volumes/external successfully and
reported output. Agent independently verified same volumeUUID3C56520D-40F3-
4233-8F9E-0C1AB20CEB7E, OwnersEnabled, EncryptedNo. The owner explicitly chose
the unencrypted alternative after risk disclosure; do not reopen that settled
choice or create an encrypted volume. Main clean8c0c49b. Old source ordinary
directory, destinationlegacy-internal and retainedinternal path both absent.

Refresh full content/Git manifests immediately before copy. Copy every source
entry (including dirty, untracked/ignored files) with ditto resource forks,
extended attributes and ACL preservation. Verify source remained byte/state
identical and destination matches every entry/hash/mode/uid/gid/symlink target;
keep source original intact. Independently approve cutover only afterward.
Cutover uses exact retained internal path and compatibility symlink; Git paths
and Codex state files remain unchanged. Reclamation of verified duplicates is
separate and requires fresh post-cutover checks/review. No generic recursive
cleanup, no changing main or unrelated watcher roots.

## Verified copy and cutover gate

Fresh versioned evidence: /Volumes/external/.codex-worktree-migration-2026-10-29/approved-copy.
before-git/before-manifest and after-copy-git/destination-manifest record49
checkouts,5dirty,172415entries/3493551420logicalbytes. Source stable, allfile
SHA256/type/mode/uid/gid/symlink targets match, Gitrefs/HEAD/index/status/ignored/
untracked match; originals retained. ditto --rsrc --extattr --acl copied source
to absentlegacy-internal. No source reset/cleanup or conversion.

Bundled Apple openrsync -aEcn metadata attempt FAILED: virtualAppleDouble ._
paths reportedENOENT, eventually ENOBUFS from hugeerroroutput. Not relabeledPASS
and not a source/copy mismatch. Direct native macOS metadata comparator replaced
this gate without weakening it:172415/172415 entries matched,0differences in
no-follow listxattr/getxattr values(SHA256only), BSDflags and extendedACLs.
Pythonos xattrfunctions unavailable; native ctypesABI used. OnDarwin absentACL
returnsENOENT even for anexistingobject, accepted only withimmediatestable
lstatinode/dev. KnownACL /Users/andrewstordy positivecontrol readcorrectly;
unexpectederrno fail. No rawattribute/ACL contents logged. Exact private
native-metadata-result.json and metadata-tool-disposition.json preserved.

Independent /root/worktree_migration_review explicitly approved CUTOVER-ONLY:
rawmanifest/Gitbeforeafter bytecomparisons and4restrictedfiles atbothpaths
verified; finalnativecomparator andresult reviewed. Cutover script requires fresh
content/Git/native metadata, source/destinationrealpath/dev/inode/volumeUUID,
no active source handles exceptread-onlyWatchmandirectories, exactunused retained
path and original rollback ifsymlinkfails. Retiresonly13oldwatches, preserves
2unrelatedroots, createsoldrootcompatibilitylink, checksall49oldandphysicalGit
paths, retained/externalcontents; re-registersrequestedwatcheswithcanonicalpath
proof. Failure attempts restore removedwatches and leavesdataretained.
No deletion/reclamation approval until actualcutoverresult independently reviewed.

Actual cutover PASS2026-10-29T11:30:43Z: source root now compatibility symlink to
/Volumes/external/codex-worktrees/legacy-internal. Original retained intact at
/Users/andrewstordy/.codex/worktrees-retained-2026-10-29, inode402913452,
dev16777229. Fresh pre-cutover native metadata and complete retained/external
manifests match original. All49 oldalias andphysicalexternal Gitstatus/index/
HEAD/ref checks match;5dirty preserved. Watchers13 canonical restored,2unrelated
unchanged. cutover-result.json/watchers-before/after andopenhandleevidence private.
No failure-recovery artifact or generic Gitrepair/prune/delete used.

Reclamation script pending independent execution approval: require verified
cutover report, exact retainedrootrealpath/inode/dev, expectedoldalias/newvolume
UUID/owners/mount, freshfullmanifests+native metadata+Git comparison, no retained
open handles. Only exact manifestmembers may be unlinked/rmdir inreverse order,
with canonicalparent andsamefilesystem/lstattype checks beforeeveryoperation.
No recursive remove/glob or symlink traversal; unknownextra makesrmdirfail rather
than delete it. Recheck rootinode immediatelybeforeloop. Externalpayloads are
never cleanup targets. Finally rehashall externalfiles and49Gitstates. Original
data remains fully on externalstorage; only independently verified duplicates
would be reclaimed. Metadata/comparison/assertions unchanged by read-loop speed
optimization from asynchronousstream to bounded1MiB synchronousSHA256chunks.

Independent reviewer explicitly approved exactretainedduplicate reclamation,
includingcanonicalparent guard and freshfullproof. First execution stopped
BEFOREanyunlink: strictemptylsofguard foundcachedWatchman1213 read-onlydirectory
handles. Nativepre-reclamation172415entries matched0differences; copies intact.
Reviewer independently rechecked actual15activewatchroots (13externallegacy+2
unrelated), none retained, andONLYPID1213/numericFD/accessr/nonlinkDIR handles
underretaineddev/canonicalpath, no files/cwd/writers/unknownprocesses.

Narrow revisedpredicate independently approved andcodechecked: permit ONLY that
exactcached/unwatchedreadonlydirectorycase while requiring all15external/unrelated
watches, rejectinganyactivecanonicalretainedwatch orotherhandle. No global
Watchmanrestart/debugGC. Tinyunlinkedemptydirectoryinodes maylinger untildaemonGC;
regularfilecontent isnotheld byreadonlydirectorydescriptors. This is an
evidence-based diagnostic disposition, not weakening filepreservation.
Rerun repeatsallfreshcontent/Git/native/inode/parentguards; preservesinitial
native reportandwritesuniqueretrymetadatafilename. Exactmanifestentryremoval only.
Sixfinaltoolversions preserved privately in evidence/tools-final, initial versions
separatelytools. Finalresults/spacechecksandindependentreview follow beforecompletion.

## Actual final result and rollback

Reclamation completed2026-10-29T11:41:04.419Z. Exact approved retainedinternal
duplicate removed withmanifest-onlyunlink/rmdir; all sourceworktreepayload remains
at /Volumes/external/codex-worktrees/legacy-internal. Compatibilitysymlink
/Users/andrewstordy/.codex/worktrees stillresolves there; no appstate/Gitregistered
paths rewritten. Final full externalmanifest matches172415entries andall49Git
states matchfreshbaseline, including5dirty/untrackedworktrees. Mainclean8c0c49b,
src07bfbbf195ff2ee3340d23af9376a92169c1917e. final-result.json recordsactualproof.

Internal duplicate allocation removed:3748812KiB (~3.575GiB), notlogicalbytecount
or a guaranteeofexactphysicalfreegain underAPFSsnapshots/clones. Observeddfbefore
cleanup22GiBavailable, after26GiB; unrelatedprocesses/purgeabledata can affectdf.
Tiny empty directoryinodes may remain referencedbyWatchman untilnormalGC, not
regularfilepayload. No servicekill, branchdeletion, genericcleanup, mainmerge,
appinstall, encryption or uploadbehavior change. Only independently verified
internalduplicates were deleted; completefiles/uncommittedwork recoverable from
externalcopy. Externaldrive remainsunencrypted byexplicitownerchoice; ownership
enabled. No new independent backupofuncommittedfiles isclaimed.

Recovery: keepdriveattached. Existing paths needtheoldrootcompatibilitylink and
the mounted externalcopy. To returninternally, firstcopy externalpayload to a
fresh internal stagingdirectory, performequivalentcontent/metadata/Git checks,
thenreplaceonlythecompatibilitylink withthatverifieddirectory underquietconditions.
Do notremoveexternaldata, reset branches, recreateoldworktrees overfiles or edit
CodexstateDB. ActualoldchatUIopening remains manual acceptance; filesystem/Git
aliaschecks do not claimUIcertification. Newmanageddefault was proven bycreating
the operationscheckout directlyunderexternalroot. No need to change it again.

Private evidence: /Volumes/external/.codex-worktree-migration-2026-10-29,
approved-copy containsbefore/afterGit/content/nativeMeta/watchers/cachedFD/final
reports; tools-final contains6finalscripts plusSHA256.json, initialtools retained.
Do notcommitrawmanifests/indexdetails/ignoredfiles or secrets. This recordonly
containsnonsensitivepaths/counts/results. It is onisolatedoperationsbranch, never
main. Subsequent receiptcommits legitimately advanceonlytheoperationsref after
the frozenbaseline has been fully compared.

DefinitionofDone: PASS files/ignored/untracked preservation, main/source/refs/
index/status invariants, metadata andpermissions, exactpathcutover, scopedwatchers,
verifiedduplicate removal, actualpostchecks, measuredspace anddurablehandoff.
Automated producttests/nativebuild/NFC/UI/servicevalidation N/A: no runtime,
schema, protocol, appnavigation, upload or userdatachanges. Independentfinal
review/outcomeanddocumentationcommit recordedbelow. No mainmerge/release/PR needed
for this workstationoperation. Pending changelog N/A: no productchange.

Independent /root/worktree_migration_review FINAL ACTUAL DATA-INTEGRITY PASS:
rawfinal-result reviewed; independently reranall49post-reclamationGit snapshots
deepEqual baseline includingallrefs/HEAD/branch/index/status/untracked/ignored;
5dirty preserved. DirectretainedpathENOENT andoldrootcorrectsymlink verified;
all4restrictedactualexternalfiles recheckedSHA256/mode/uid/gid. Main8c0c49b/
src07bfbbfclean. Finaltools6versions+SHA256presentwithprivate700/600permissions.
No requiredproduct/native/NFCtests forunchangedmain. Earlierphasewording is
explicitly historical, current status/resultcomplete. No oldchatUIreopenclaimed.
Finaldocumentationcommit/publication receipt follows; no main or appchange.
