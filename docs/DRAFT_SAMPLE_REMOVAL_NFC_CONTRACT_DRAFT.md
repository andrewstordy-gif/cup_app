# DRAFT sample removal NFC clearing contract

Draft for Andrew to agree before implementation. Applies only to the separate
two-character-code test client, based on fc987a2. It does not change the current
NDEF protocol, working app or main.

## Proposed user flow

In a saved creator DRAFT, **REMOVE SAMPLE** opens the scanner directly. The cup
identifies the sample; there is no sample picker. A matching scan durably records
the removal intent and clears that cup's assignment. The app then asks the user
to scan the same cup again. Only a matching separate verification and successful
local transaction remove the sample card. The session stays DRAFT.

The verification transaction saves the removal immediately, like successful
Add Sample verification; no additional session Save is needed to finish removal.
This is the proposed narrow specialization of the older architecture5.7 staged
Save flow, not permission to change addition or tasting Save behaviour. Ordinary
SAVE remains DRAFT and LOCK SESSION stays blocked while removal is unfinished.

Removal does not mean putting a Smart Cup to sleep, deleting a session, resetting
a taster's scores, or reassigning a completed-session cup. Those remain separate.

## Eligibility and target matching

Allow only a saved supported DRAFT owned by the captured current local profile,
with intact local issuer ledger, no setup lock, no started/completed history,
no saved tasting data and no unfinished addition/removal. Require saved setup;
ordinary unsaved edits must be saved or discarded using the existing mechanism
before scanning. Do not use NFC contents as proof of creator authority.

The initial scan must have all of the following:

- A supported writable NTAG or Smart Cup record structure and hardware UID.
- Exactly one verified committed sample in this session matching the hardware
  UID and composite identity `(u,z)`, including the original issued-code proof.
- Complete typed metadata matching that sample's immutable stored payload,
  including optional `i` presence/value, form, mode and physical cup count.
- For Smart Cups, valid documented state and complete supported settings.

Unknown, blank, already cleared, old numeric, foreign-session, ambiguous,
malformed or differently assigned cups cause no write or local removal. A
different current actor, damaged proof, capacity/status failure or concurrent
operation also prevents dispatch. No automatic formatting, repair, guesses or
overwrite of another assignment. Hardware UID is not NDEF2 telemetry `u` and is
not an authentication secret.

## Exact clearing payload

Every record is NFC Forum Well-Known Text, type `T`, language `en`, UTF-8,
without a record ID. Use the established encoder and record ordering.

| Tag | Records written |
| --- | --- |
| NTAG sticker | One Text record containing exactly `{}` |
| Smart Cup | Four Text records: `{"s":S}`, `{}`, preserved validated settings, `{}` |

For Smart Cups, `S` is the valid state captured from NDEF1 for this operation
(integer0–4). Preserve every supported NDEF3 setting, including optional `k`
and its absence. Do not apply defaults, copy unknown keys or use cached settings.
Invalid or unsupported settings prevent writing rather than being dropped.
Preserved compact settings are required `r,a,w,c,x,l`, with optional `k`, using
the current strict `validateSettings` contract: safe nonnegative integers and
`k` equal to1 or3 when present. No new settings or default values are introduced.

NDEF2 is written as `{}` to invalidate stale firmware metadata cache, following
the existing application-write rule. Never replay temperature, timing, battery,
firmware version or a telemetry identifier. NDEF4 is exactly `{}`: no coffee,
process, count, code, session, form, mode, blank strings, zero placeholders or
`NO-SESSION` sentinel. NTAG has no fabricated state/settings records.

The `{}` Text payload bytes are `02 65 6E 7B 7D`: UTF-8 status, `en`, `{}`.
The complete one-record NTAG NDEF message is
`D1 01 05 54 02 65 6E 7B 7D`. This is an NDEF-message contract, not an instruction
to erase tag memory, write raw Type2 TLVs, modify lock bits or format hardware.
Freeze the complete encoded message and hash before dispatch. Repeated transport
attempts of this removal reuse those bytes and operation identity; no sample
code is allocated by clearing.

## Verification and future use

Stop the writing NFC session. Verification requires a new user-initiated physical
scan, not the write callback, the write session's cached read or a local DTO.
Require the same hardware UID and frozen record family, with strict Text record
decoding, no hidden extra records and empty metadata object with no keys. A zero-
record tag, missing/invalid record, `null`, string, whitespace text or malformed
JSON is not proof of this clear. Equivalent JSON object whitespace is harmless;
the writer itself always emits canonical `{}`.

For Smart Cups also verify the same complete supported settings. Firmware may
republish live NDEF2 telemetry and advance a valid NDEF1 state between scans;
these live fields are not required to equal the emitted state/empty telemetry.
NDEF2 must decode as an empty object or an object containing only documented
compact telemetry keys: optional integer `t` (tenths Celsius), nonnegative safe
integer `m` (seconds), integer `b` (0–100 percent), nonempty string `u` and semantic
version string `v`. Reject duplicate keys, nested values, unknown keys, aliases
and assignment-bearing fields. Telemetry `u` never substitutes for hardware UID.
NDEF1 must contain only a valid documented integer `s`. The app has
not requested a state change; later firmware evolution is not local success
evidence. Repeated later scans must not restore the old NDEF4 assignment.

A cleared singleton `{}` is recognized as unassigned metadata on a supported
NTAG, not damaged sample-code data. Four valid Smart Cup records with NDEF4 `{}`
are likewise unassigned. Readers must not call the assigned-metadata validator
on an empty object or infer a sample from its UID alone. Future Add Sample may
assign such a cup through the existing write/check flow with a fresh code.
Do not broadly accept arbitrary generic NDEF or legacy/corrupt assignments.

## Durable operation and failure handling

Use a separate versioned removal journal, not an addition record disguised as
removal. Before any physical write, atomically store: operation ID, actor,
session and issuer incarnation, sample ID/code, hardware UID, record family,
trusted pin, immutable prior metadata/proof, setup revision/hash, original
state/settings, exact intended bytes/hash and phase. Hashes bind context; they
are not security credentials. Read and validate the saved record after staging.
Journal payloads and identifiers are internal protected local evidence, not
ordinary diagnostics, analytics, accessibility labels or navigation parameters.
Log only neutral stage/error codes and presence/count summaries, never raw UID,
coffee details or encoded assignment contents. Preserve existing blind-safe
projection and data protection boundaries.

| Durable phase | Required behaviour |
| --- | --- |
| Staged | Sample remains. No write unless intent persists and current guards pass. Safe cancellation is allowed before dispatch. |
| Writing | Persist before dispatch. Treat a missing callback or radio error as uncertain physical outcome. |
| Written unverified | Sample remains and setup stays blocked. Ask for the separate verification scan. |
| Verified pending commit | Persist read-back proof. Retry only the local commit if saving fails; never unnecessarily rewrite. |
| Committed | Removal is idempotent. Repeated callbacks cannot remove another sample or recreate this one. |

Leave, close, app crash or restart after dispatch preserves intent. Return to
Session Details with the sample retained and an unfinished-removal notice; the
same REMOVE SAMPLE action resumes **Rescan to verify**. No automatic write or
claim that Cancel undid the physical change. Serialize operations per session
and physical UID; block Lock, additions and other setup mutations until settled.

On an uncertain write, scan first. Intended clear means continue to verification/
commit. The exact original assignment on the same cup permits an explicit retry
of the frozen clear. Wrong UID changes nothing. A different assignment, partial
or unreadable payload remains unfinished and must not be silently erased; any
broader repair path requires separate approval. Failures must say that removal
is unfinished, not falsely assert that no physical write occurred.

Commit atomically revalidates actor, issuer incarnation, operation, setup and
target proof, marks the operation complete, removes only the target from creator
setup, and updates the actual local roster count/revision. Preserve its removal
receipt and all spent-code/issuance proof for the session's lifetime. Do not
delete or rewrite other results, histories or code records. Eligibility rejects
an unexpectedly scored target rather than deleting its tasting data.

Capture and recheck operation/context generations before dispatch, verification,
commit and success acknowledgement. Lock/profile changes, duplicate calls,
queued Save, session deletion/reimport and late addition acknowledgements cannot
reuse old evidence, restore a removed card or authorize a write. A later
contradictory physical read invalidates readiness, never silently undoes the tag.

Whole-local-session deletion retains its existing exception: it discards pending
local work without writing any cup, revokes queued callbacks and does not claim
the tag was restored. Cancellation after dispatch is not rollback. No automatic
physical undo is included.
An NFC request already dispatched cannot be recalled by local deletion; reject
its later callbacks without pretending the physical write was prevented.

## Other samples and counts

Retire only the scanned sample. Its two-character code stays used forever within
this session. Remaining codes and physical count `y` never change or renumber.
No other cups need scanning or rewriting for this bounded removal operation.

Following the accepted R1-106 rule, `i` on an existing tag remains its captured
advertised total at write time, not a live roster size, upper limit, completeness
proof or invitation to invent unseen samples. Update the creator's actual local
roster count from remaining verified samples; preserve larger historical hints
without treating them as current membership. Future additions retain the current
count policy and verification still compares each attempt's frozen `i` exactly.
This explicitly resolves the older stage4 count-consistency gate for this code
profile; it does not promise synchronized live counts on every physical tag.

Removing the last sample leaves an empty DRAFT; Lock is unavailable. Save and
future additions remain possible with the existing pinned setup policy.
One stored representative tagged cup identifies the whole sample: `y=5` does not
mean five tag-clearing scans. This operation clears only that representative UID,
not abandoned earlier-attempt tags or cloned/duplicated assignments elsewhere.
Other phones' previously scanned samples/results are not remotely erased or
revoked. A later physical scan of the cleared cup is unassigned, not permission
to open a stale UID-matched tasting; existing local review remains local.

## Agreement and implementation gates

Agree three choices: use `{}` as the unassigned representation; preserve Smart
Cup state/settings rather than Reset to OFF; leave other tags untouched and
treat their `i` as historical hints. Also agree verification success immediately
commits the local removal and incomplete physical work persists after closing.

After agreement, a separate implementation task updates canonical contracts,
journal/schema, reader/writer and UI in the test copy. Tests must inject failure
at every stage/write/verify/commit boundary, including restart, wrong/changed
cup, both forms, mixed modes, retained spent codes, empty DRAFT, concurrent Lock/
Save/add/delete, late callbacks and repeated acknowledgements. Independent
protocol/security/privacy/recovery/UI review and an iOS bundle are required.

Physical acceptance must separately record phone/OS, NTAG type/capacity and Smart
Cup firmware; test later scans for firmware cache restoration and settings/state
preservation. Software checks alone cannot establish hardware conformance.
Completed-session reassignment, arbitrary-tag cleanup, upload and main integration
remain out of scope.
