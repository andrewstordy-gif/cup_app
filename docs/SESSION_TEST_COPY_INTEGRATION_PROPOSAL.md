# Session workflow integration proposal

24 October 2026 — PROPOSED, awaiting Andrew's agreement. No runtime, data,
working-app or main changes authorized by this document.

## Recommendation

Finish this as a controlled integration, not another feature round. Use the
tested workflow with a fresh session library. Preserve the main app's valid
profile and unrelated app data. Do not migrate or copy old test sessions,
results, pending operations or test-profile ownership.

## Evidence and starting points

- Local main and locally stored origin/main:34f95a8119574557e5e67cc5246888a9d1c089c4.
- Original working app:46a80c6c46207c3de9b8593369545355d8891f28.
- Separate phone copy:f4b301eaf4dead46a2f0ea88efb7571e75e40224,
  checkpoint phone-test-2026-10-24-r1-135-removal-text-action.
- Main, working app and test copy were clean during read-only inspection.
- Phone copy versus main is211 files, including earlier reviewed CVA/Legacy
  forms, ownership/persistence and session work—not just the latest text action.
  Treat this as an integration inventory, not211 newly requested changes.
- App.js, app.json, native iOS/Android configuration and dependency lockfile
  have no tracked diff from local main in this candidate. No new dependency or
  native signing change is currently indicated; verify on the final candidate.
- Main/remote freshness and Git-host protection/PR state have not been verified
  over the network in this planning task. Check then-current main before trial
  integration; do not assume today's local refs remain current.

The user has exercised write/check/retry/recovery, codes, Lock, activation,
scores, removal, completion/reopen, privacy and latest DRAFT physical removal.
Individual task records retain automated and independent review evidence.
These are not yet tests of a prospective integrated main build.

## Included and deferred

Integrate the reviewed dependencies needed by both supported forms and the
approved session flow: two-character codes/allocator; durable pending writes and
separate verification; SAVE/DRAFT and LOCK/PENDING; creator and participant
activation/grey cards; local tasting removal, scoring/notes, completion and edit
reopening; Blind privacy; visible session/sample codes; DRAFT scan-clear-check
removal with Smart state/settings preservation; approved quiet text action;
disabled upload UI/status only. Preserve reviewed form pins/calculation behavior
and all unrelated Home/Brewing/Quick Cupping behavior.

Defer real upload/queues/server acknowledgements, completed-session cup
reassignment, generic tag repair/automatic old-tag conversion, old-session
migration, transfer/clone recovery and unapproved post-lock setup expansion.
Do not enable dormant DRAFT edit/reorder/label-scan actions merely because old
cards contain icons. No new preview screens or prototype feature work.

## Data-handling decision proposed for approval

| Area | Proposed treatment |
| --- | --- |
| Old main sessions in cup_user_test.db | Do not import; leave the file untouched and unused by the new session workflow. New library starts empty. |
| Phone experiment cup_r1_103_sample_codes_test.db | Do not copy/import; retain untouched as a separate test artifact. |
| New integrated session store | Create a fresh versioned database, proposed cup_sessions_v1.db; initialize and validate the reviewed code/issuer/recovery schema transactionally. |
| Main profile cup_app:user_profile | Keep existing valid UUID, name, organisation and photo reference. New sessions bind that identity. Missing profile uses existing secure initialization; malformed identity fails closed, no silent replacement. |
| Experiment profile cup_app:r1_103:user_profile | Do not copy or merge into main profile. No attempt to reclaim its session ownership. |
| Scores, code ledgers, pending writes/removals and completion history | Start empty with the new session store; no migration or replay of old test work. |
| Unrelated storage, preferences, brewing data, files and credentials | Preserve; no broad AsyncStorage clear, uninstall or application-data reset. Audit all database consumers before changing the store boundary. |
| Old on-cup assignments | Not erased by changing databases. No automatic writes or import. Use new/manually cleared spare tags for acceptance. |

Leaving files untouched is deliberate: it makes old sessions absent from the
new library without destructive cleanup. This is not a promise that old sessions
can be migrated or resumed later. A later cleanup would be separately scoped.
No user action to delete old sessions is needed under this proposal.

Already-written tags retain their old session/code data even when a library
starts empty. The integrated app must not infer creator ownership, copy missing
issuer ledgers or permit setup overwrite from a scan. Old numeric assignments
remain unsupported; supported code assignments follow their ordinary participant
scan rules and may create a participant-local record. Neither becomes owned
creator setup. Completed-cup reassignment remains deferred. Session UUIDs remain
fresh and code uniqueness remains per session; existing code ledgers are never
reset within a retained session.

## Configuration and canonical-document changes to prepare later

1. Restore normal Expo package entry node_modules/expo/AppEntry.js. Do not
   expose r1-062-phone-verification-entry or the upload preview entry points.
   Keep useful tests/reference sources outside normal runtime routes.
2. Select the fresh integrated DB and main profile key. Replace experiment-only
   r1_103_profile storage marker/names and diagnostic log namespace with an
   explicit integrated schema marker. Preserve all validation/rollback checks;
   do not simply remove incompatible-store guards or point the experimental
   bootstrap at cup_user_test.db. Treat this as bounded integration code work.
3. Promote the approved string-code profile and clearing contract consistently
   in NDEF_PROTOCOL/schema/architecture/spec docs. Separate historical numeric
   examples from the supported integrated profile; do not ship contradictory
   'experimental only' requirements or invent payload changes.
4. Reconcile selected tests with normal entry/storage rather than weakening
   assertions. Classify outdated fixtures separately from real regressions.
5. Retain upload disabled and no preview/fictional data on normal screens.

## Controlled implementation and validation sequence

1. After plan agreement, create an integration task/isolated candidate from
   then-current main. Inventory source lineage and all211-file differences;
   include reviewed form/session dependencies, exclude experiment wiring and
   unrelated/unreviewed changes. Verify every shared change has a task/provenance.
   No blind directory overwrite or immediate merge to main.
2. Prepare the candidate and the bounded configuration/schema/doc changes above.
   Main, original working checkout and phone experiment remain recoverable at
   their named checkpoints while this happens.
3. Run combined tests on the exact prospective integrated SHA: fresh/reopen/
   malformed-store behavior; main profile preservation and creator/participant
   authority; both forms/calculators/pins; codes/exhaustion/retirement; write,
   verify and recovery; physical removal; Lock; activation/removal; saved scores/
   notes/completion/reopen; Blind privacy; local deletion; upload disconnected;
   Home/Brewing/Quick Cupping and navigation. Confirm no reads/writes to old DBs
   and no altered unrelated storage. Any failure gets explicit disposition.
4. Independent nonauthor architecture, data/security/privacy, UI and QA review
   of the exact integrated diff and new storage bootstrap. No HIGH/CRITICAL
   finding accepted. Build/export from normal entry. Prior isolated test-copy
   passes do not replace these prospective integration gates.
5. Produce a named candidate tag/build for one concise device smoke check: fresh
   library/profile; CVA/Legacy setup/write/separate check; Save/Lock; tasting/
   completion/privacy; DRAFT removal using spare tags. Record actual phone/OS/
   tag and Smart firmware when applicable. Software tests do not prove radio
   or firmware behavior. Device smoke must be distinguished from main release.
6. Report candidate SHA, checks, remaining limitations and exact merge/launch
   plan to Andrew. Only after explicit integration approval use the protected
   PR/Release Manager path to main, verify exact merged build, record changelog
   and run post-merge smoke. No direct push/development on main.

## Rollback and non-goals

Preserve named Git checkpoints and old DB/profile namespaces. A failed fresh
bootstrap must roll back and stop, not fall back to old storage or reset files.
Before future release, validate code rollback behavior against the separate old
and new session stores. Reverting code cannot recall writes already made to a
physical tag: do not scan new code tags in the old numeric client. No silent
counter reset, tag rollback, reinstall or profile wipe is an acceptable shortcut.

This plan does not authorize implementation, deletion, a trial merge, stopping
Metro, switching the user's phone bundle, publishing a PR or integrating main.
Approval sought: clean session library with preserved main profile, the bounded
integration scope and the gated sequence above.
