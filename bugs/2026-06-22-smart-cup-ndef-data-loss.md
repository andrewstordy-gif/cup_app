# Smart cup NDEF data loss after a successful write

**Date identified:** 2026-06-22
**Status:** Mitigated (mandatory Check Sample verification added), root hardware/firmware cause not yet fixed

## Symptom

A cup that had already been added to a session — and confirmed via terminal
logs to have been written correctly — was later scanned from Home and
produced the dialog:

> "This session is already complete. What would you like to do with this
> cup?"

instead of being recognised as belonging to its (incomplete) session, or
prompting the normal "how would you like to use this cup" choice for an
unrecognised cup.

## Investigation

### First reproduction — state reverts, metadata survives

A cup was added to a session ("Two phone test"). Scanning it again
immediately afterward confirmed `text1: {"state": 1}` with the full,
correct session metadata in `text4`. Scanning the *same* cup again later
showed:

```
text1: {"s": 0, "state": 0}
text4: {"n":"Yellow","p":5,"y":1,"i":1,"z":1,"k":"#00A651",
        "e":"Two phone test","t":6,"d":260622,"u":"fsdz90di5r9nyv","m":"b","f":1}
```

`text1.state` had reverted to `0` (sleeping) on its own — no app action
caused this — while `text2`/`text3`/`text4` were untouched and fully
intact. The smart cup's own firmware appears to drop to a sleep/idle state
after a period of inactivity, independent of the app.

This alone was a real bug in the app's scan-handling logic:
`scanCupForAssessment`'s smart-cup branch checked `cupState === 0` and
showed the generic sleep dialog *unconditionally*, before ever attempting
to resolve the cup's metadata into an active sample. A sleeping cup that
still carried valid session metadata was never given the chance to be
recognised. (Fixed separately — see the 2026-06-21 changelog entries for
`AppNavigator.js`.)

### Second reproduction — the metadata record itself disappears

A second, more concerning reproduction was run to confirm the above
diagnosis fully explained the original report. Sequence (same physical
smart cup, `id: E00253674FD4718D`):

1. **13:32:24–25** — a write succeeds. Confirmed via the "write success"
   log: all 4 NDEF records present, including a complete `text4` with
   `sessionUUID: "ll4in8g1zx69j0"`.
2. **13:32:38–41**, ~12 seconds later, no other action taken — a plain read
   shows only **3** records. `text1` (`state: 1`) and `text2`/`text3` are
   intact, but `text4` is `null`. The metadata record itself had been lost
   from the tag, not just the state flag reverting.

This is a different failure mode from the first reproduction: not "state
reverts but data survives," but actual loss of the record carrying the
session link, with no app-side cause. The write payload size had grown
slightly between attempts (249 → 255 bytes), which may point to a
storage/capacity boundary on this chip, but this has not been confirmed.

## Why this matters

Both failure modes mean the app can lose its only record of which session
a physical cup belongs to, with no warning at the time of writing — the
write itself reports success. The user only discovers the problem much
later, when the cup is scanned again and behaves unexpectedly (wrongly
flagged as belonging to a complete session, or treated as an unknown cup
entirely).

## Mitigation shipped

Root-caused as likely a hardware/firmware-level reliability issue with
this specific smart cup chip, not something fixable from the app side
alone. As an interim mitigation, a mandatory verification step was added
immediately after every cup write (both adding a new sample and editing an
existing one): the user is now required to scan the cup a second time to
confirm what's actually on it matches what was just written, with a
re-write loop if it doesn't, before the write is considered complete. See
the "Check Sample" flow added in the 2026-06-22 changelog entry
(`CheckSampleScreen.js`, `CuppingSessionDetailsScreen.js`).

## Still open

- The underlying cause of the data loss (firmware sleep/idle transition,
  and the separate text4-record-loss case) has not been identified or
  fixed at the hardware/firmware level — only worked around via mandatory
  re-verification.
- It's not yet confirmed whether the text4 loss is capacity-related,
  intermittent-write-related, or something else. Worth investigating
  further if it recurs with smaller payloads or different write timing.
- The original `scanCupForAssessment` fix (recognising a sleeping cup with
  valid metadata) and this Check Sample mitigation are complementary, not
  duplicates — both are needed: one handles a cup that's asleep but intact,
  the other catches writes that didn't actually stick.
