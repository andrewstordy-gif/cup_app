# REL-DEV-STAGE1 — iPhone development build for Legacy Stage 1

- **Status:** Authorized preparation, 24 November 2026; phone unlock requested.
- **Owner/role:** /root Project Manager; temporary Release Manager handles build/install.
- **Authority:** Andrew explicitly requests running a development build on his connected unlocked iPhone instead of TestFlight. Software UI-LEGACY-002 integrated through PR22; exact source main ae46f94589729aec3c3d9bf0a98628bde1e77004. Operating-model build provenance and review gates apply; no further feature work.
- **Branch/worktree:** codex/rel-dev-stage1, isolated output/worktrees/rel-dev-stage1. Task documentation only delta from named main.
- **Scope/files:** This task record; ignored build/tool artifacts. Use existing personal Apple team 6W675PGM38, bundle com.andrewstordy.cup, NFC TAG entitlement and development-client dependencies. No committed runtime/config/version/signing edits; no main changes, native feature changes, new provisioning identity, credentials rotation, distribution or TestFlight upload. Any necessary source/native config change returns to PM for a separate reviewed task.
- **Objective:** Build or reuse a compatible signed NFC-capable development client, install/launch on the connected iPhone, serve exact Stage 1 JavaScript via Metro, record evidence and give Andrew concise manual Metro instructions.
- **Device observed:** iPhone 13 mini (iPhone14,4), CoreDevice77D2F4D8-8688-54FA-83D7-2E0B69235970, paired/available. Device app enumeration initially failed because screen relocked while mounting developer image. Unlock requested via async question.
- **Data protection:** User has not authorized deleting TestFlight or its local cupping data. Same configured bundle ID means one installed Cup identity. Inspect installed app and attempt non-destructive replacement only if supported by signing/install path; do not uninstall, erase containers or change app identifier/create new signing resources without PM coordination and any genuinely required owner decision. If replacement requires deletion, stop that step and explain evidence to PM.

## Acceptance / evidence

1. Verify exact source commit and clean runtime/config tree, compatible native client, signing team/bundle/NFC entitlement and device state. Record actual Debug artifact identity/hash and build command; never call an iOS JavaScript export a signed development app.
2. Install/launch through Xcode/devicectl only while phone available and permitted. Record result/errors; never claim installation or visible-screen success solely from build exit.
3. Metro serves candidate source from this named-main checkout (shared node_modules symlink must not accidentally resolve older main App). Prefer port8081 if free. Do not stop unrelated Metro/processes. No token-intensive log monitoring; hand manual command to Andrew once startup/load is confirmed.
4. Independent release/artifact check by a different agent before installing a newly built binary if required by operating-model gates. Existing runtime already independently reviewed; no code gate waiver.
5. Preserve TestFlight/data; no physical NFC/card/VoiceOver verification implied by launch. User confirms actual screen before claiming app running.

## Handoff / checks / limitations

Pending preparation. Existing Xcode CLI needs ordinary local service permissions beyond sandbox; use approved escalation, not simulator conclusions for physical device availability. No app deletions performed.
