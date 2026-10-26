# Reassign Cup — proposed narrow contract

## R1-147 approved superseding contract — NEW operations only

26 October 2026. PRODUCT_SPEC6.7/6.8.3 owner approval replaces clear-first NEW
reassignment with three actual scans: (1) read old assignment, end radio session,
show the interruption warning and obtain explicit consent; (2) fresh same-cup
scan deliberately writes the new assignment; (3) separate Check Cup verifies
before one atomic local retirement/addition commit. No intermediate blank write,
member on a write-success callback. R1-148 owner revision: confirmed consent
starts the fresh write scan after durable staging and native confirmation-modal
dismissal, without returning to the entry drawer or another button press. This
does not authorize a scanner/write on load, recovery or cancellation. The
historical R1-142 contract below continues to govern already-pending legacy clear
operations and receipts, which are never relabeled as direct-write evidence.

Known-active, duplicate, unknown/foreign override, actor/owned DRAFT/issuer/form
and privacy rules below remain. Qualified participant COMPLETE is unknown, not
creator release. The known-case message for new direct operations is
**Replace its previous assignment? Other tasters may still be using it.**
Unknown warning and Cancel/Reassign Cup actions are unchanged. No old identity
is exposed. Consent alone consumes no code and writes nothing.

The second scan must still show the exact original UID/family/typed metadata,
Smart state and settings captured by consent, with fresh source eligibility.
Current editable destination details bind this explicit write. NTAG emits one
English Text record of the complete new compact metadata. Smart emits exactly
`{s:1}`, `{}`, preserved validated compact settings (optional k presence/value
retained), complete new metadata. READY is the intentional existing assignment
transition, not preservation of the old state; unchanged fresh original state
before dispatch prevents replaying cached state over an intervening change.
Never replay telemetry. Existing encoder/capacity/writable checks/native frozen-
byte retry policy remain; each beforeWrite revalidates the same durable attempt.

Persist exact original binding, consent, destination/actor/incarnation/setup/
removal/combined-retirement vector, candidate/save context, issued fresh attempt
code and exact intended message before dispatch. A failed stage cannot write.
Uncertain dispatch remains unfinished and resumes read-first after close/restart.
Verification/read/save retries allocate no code. R146 failed read keeps Check
Cup. Exact same UID/family/new typed metadata/settings and READY prove a direct
write; a native success tick does not. Verified local commit failure is save-only.

Explicit rewrite requires a fresh read-first same-cup observation showing the
original binding/state/settings or a fully validated own recorded attempt with
exact typed metadata/family/settings and READY. It reserves a fresh code and
retains all previous attempt evidence. No switching UID, overwriting an unknown
third-party assignment, discarding hazardous intent, or transferring consent.
Changed details require an explicit same-cup write, never mutate frozen proof.

The verified commit atomically retires the exact old binding, adds one new member
and its standard issued-code outcome, and deletes direct pending intent. It does
not delete/reopen/alter old results/history/codes. Receipts are purpose-specific,
minimal and permanent beyond session deletion; they do not claim clearing.
Generation/vector, revision/CAS, current actor/incarnation and final ack fences
deny stale callbacks, old clear acknowledgements, deleted/recreated sessions and
known contradictory proof. All existing raw-read observers cover both purposes
without automatically verifying. The pre-existing diagnostic write-without-read
boundary below remains unchanged. Phone conformance is a later explicit gate.

25 October 2026. Owner approved the two decisions below. No runtime implementation authorized by this document-only step.

## Purpose and authority

An already-written cup can be reused without deleting saved results or using
an external tag-clearing app. Destination is creator-owned, unlocked DRAFT.
Physical possession does not grant access to or setup ownership of the earlier
session. A phone/account may create one session and participate in another.

PRODUCT_SPEC6.7/6.8, FR-020/028A require clearing AND separately verifying the
previous assignment before writing/verifying the new one. This is not a silent
overwrite. The earlier conversational shorthand "confirm then assign" omits
this mandatory intermediate clear/check and must not become implementation.

## Eligibility and conflicts

Always validate native supported family, physical hardware UID, record layout,
UTF-8/JSON, state/settings, supported metadata/form and actual capacity/writable
status. No legacy numeric conversion, malformed-tag repair or unknown-field
acceptance. Smart Cup battery-test extensions remain unsupported separately.

- Blank/already-cleared allowed cups use the existing addition flow, no prompt.
- A cup already committed to the destination is a duplicate, not reassignable.
- Known creator-owned earlier session with qualified COMPLETE presentation may
  be eligible after confirmation. Use trusted current revision/coverage, not
  only legacy sessions.status or a screen badge. Any conflicting known active
  assignment, pending write/removal/reassignment or stale receipt blocks it.
  Creator-local COMPLETE also covers only that creator's current tasting/active
  selection, NOT host-global closure or proof other participants finished. This
  is a proposed local eligibility condition with the same cross-phone risk.
- A participant's local COMPLETE is not evidence that the creator or other
  tasters finished. Do not treat it as permission to free an active assignment.
- Unknown/foreign/deleted earlier session: the tag does not carry authoritative
  lifecycle state. Never invent "completed", require that it was created on
  this phone, or import old ownership/issuer ledgers to make it eligible.

**Owner decision approved, 25 October 2026:** allow the unknown/foreign case only through an
explicit operator override acknowledging that the old session cannot be
checked. Continue blocking any locally known active conflict. This authorizes
changing this physical cup only, not reading/changing the old session. It may
disrupt an active session on another phone; offline software cannot prevent
that. Owner explicitly accepted this risk and warning on 25 October 2026.
Current runtime still blocks these cases until separately authorized implementation.

An eligible locally completed case and an approved unknown override must
recheck all evidence and actor/destination constraints immediately before each
physical dispatch; confirmation alone is not a reusable capability.

## Confirmation — reuse shared dialog/style tokens

Known completed case:

Title: **Reassign Cup?**

Message: **Clear its previous assignment? Other tasters may still be using it.**

Actions: **Cancel** / **Reassign Cup**.

Approved unknown-case override warning:

Title: **Reassign Cup?**

Message: **We can't check its previous session. Reassigning may interrupt it.**

Actions: **Cancel** / **Reassign Cup**.

Never show previous coffee name/process, protected metadata or raw identifiers.
Cancel/close leaves physical cup and old/new sessions unchanged, destination
drawer editable and filled. No code reservation or write from opening prompt.

## Exact operation sequence

1. SCAN & ADD CUP reads existing assignment. Identify an eligible reassignment;
   retain immutable observed metadata and hardware evidence for this operation.
   Stop the native scan session before displaying confirmation; do not hold a
   radio request open while awaiting a UI decision.
2. Confirming durably journals a clear/reassignment intent FIRST, bound to actor,
   destination session incarnation/setup revision, physical UID/family, original
   canonical assignment, validated Smart state/settings, and operation phase.
   Persistence failure means no write. Reserve no new sample code yet.
3. Request a fresh physical scan of that SAME cup. Recheck original assignment,
   current eligibility, actor/route/current epoch, native status/capacity and all
   frozen evidence. Different cup/changed assignment/settings/state: no write;
   show conflict and require a fresh explicit operation. Never rewind a changed
   Smart state from cached evidence.
4. Clear only the assignment using reviewed clearing bytes:
   NTAG: one English UTF-8 Text record containing `{}`.
   Smart: four ordered Text records `{s:S}`, `{}`, exact validated existing
   compact settings (including optional k presence/value), `{}`. Preserve S0–4
   and settings; NDEF2{} invalidates stale firmware cache, not replayed telemetry.
   Never delete/reorder records or reset Smart state/settings.
5. Separate **Check Cup** scan confirms SAME UID/family, empty metadata and
   preserved settings/valid firmware-evolved state. Native write-success alone
   is never clear verification. No sample removed from old saved history.
6. Persist verified clear receipt. Only now offer the existing explicit
   SCAN & ADD CUP action for the destination's CURRENT editable details. Do not
   chain an automatic assignment write onto the clearing confirmation/check.
7. That new explicit write reserves a fresh two-character code from destination
   ledger before dispatch, writes current details, then requires the existing
   separate Check Cup scan. Only successful verification plus durable addition
   commit adds exactly one destination sample. Ordinary session stays DRAFT;
   existing Quick auto-lock exception applies only if this is explicitly Quick.

This is a longer but truthful clear/check then write/check sequence. No hidden
extra writes or duplicate Save/Lock/activation behavior. No adjacent-cup rewrites.

## Recovery, cancellation and isolation

- Before any clear dispatch: cancellation leaves cup/history unchanged. Abandon
  the unexecuted intent safely; no new code consumed.
- Clear dispatch failure/uncertainty: retain unfinished durable intent. On retry
  or restart resume read-back verification first, not automatic rewrite. If it
  still exactly matches the old assignment, a deliberate clear retry is allowed
  only after current checks; a third-party assignment must never be cleared.
- Closing Check Cup before clear verification returns to editable destination
  drawer with pending-clear action. Different-cup/new-add writes stay blocked
  until this hazardous intent is safely resolved; ordinary addition A-to-B
  retry policy is not silently applied to a possibly dispatched clear.
- After verified clear: the cup is unassigned even if user leaves or edits
  details. Keep receipt; no automatic restore of old metadata. A new scan checks
  actual current contents, never assumes a receipt means it stayed blank.
- After assignment dispatch: use existing durable pending addition/check and
  cancellation behavior. Failed/cancelled/superseded writes never recycle codes.
  New explicit assignment/re-write reserves a new code; verification/Save retries
  do not. Never add destination sample on write callback alone.
- Failed local commit/acknowledgement: replay existing verified receipt once;
  no repeated write or duplicate sample. Restart does not trigger radio writes.
- Old session scores, notes, mode, form pins, completion/history and codes remain
  unchanged. No old sample deletion, activation change, reopen, ownership transfer
  or code recycling. Historical physical-assignment provenance remains history,
  not permission for future conflicting writes to that UID.
- Concurrent callbacks, account/session changes, same-ID recreation/deletion,
  pending removals and late acknowledgements must fail closed with current actor,
  session incarnation and operation/generation fences. Do not manufacture blank
  ownership or erase a pending intent on an ambiguous radio result.
- Existing whole-session deletion remains local-only and never writes the cup.
  If it discards an unfinished operation, remaining cup state is not claimed
  cleared or restored. Future reads must classify actual tag contents afresh.

## Implementation boundary and acceptance gate

After owner agreement, prepare an exact durable journal/schema/interface design
and assign shared files before coding. Existing DRAFT-removal journal assumes
removing a sample owned by that source session; do NOT reuse it unchanged for
foreign/unknown assignments or delete a historical sample to satisfy its schema.
Review whether generic active-UID guards need a narrowly scoped superseded-
assignment receipt while retaining immutable old results; do not just drop them.

Automated actual repository/SQLite/callback/native-codec tests must cover both
families/forms, known COMPLETE versus active/participant/unknown cases, all
clear/write/check/commit failures, exact bytes/state/settings, stale/changed cups,
rollback/restart/duplicate callbacks, no old-history mutation, spent-code rules,
privacy and cancel. Independently review architecture, security and UI flow.
Then short phone check: reassign a spare already-written cup, confirm old results
unchanged and new member appears once only after full verification. Software
tests alone cannot claim physical NFC/firmware conformance or main merge approval.

## Owner decisions approved — 25 October 2026

1. Approve explicit unknown/foreign override despite offline inability to verify
   whether its earlier session is still active? Known active conflicts stay blocked.
   Also acknowledge that even creator-local COMPLETE cannot prove other phones
   finished; neither route claims host-global session closure.
2. Approve visible **clear → check → new write → check** sequence, with an
   explicit action before each write, preserving Smart state/settings and history?

Owner answered yes to both points, including the cross-phone interruption risk.
These are agreed design decisions, not permission to change app runtime yet.
Next work is the exact durable journal/schema/interface proposal before coding;
keep working app unchanged and no main integration without owner approval.

No runtime code, validation, logging, stored data, firmware or cup was changed
while preparing this proposal. Working app and main remain untouched.
