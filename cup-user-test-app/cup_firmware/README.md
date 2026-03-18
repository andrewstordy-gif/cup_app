# cup_firmware

Arduino firmware for the digital cupping cup.

This firmware runs a state machine (`OFF`, `READY`, `BREWING`, `CUPPING`, `LOW_BATTERY`), reads sensors (temperature, battery), and exchanges data with phone apps over ST25DV NDEF records.

## Hardware + Docs

- Main hardware docs: [`docs/hardware/README.md`](./docs/hardware/README.md)
- ST25 datasheet used during the latest NFC debugging:
  - [`docs/hardware/st25dv04kc-2450072 (1).pdf`](./docs/hardware/st25dv04kc-2450072%20(1).pdf)
- Key parts in this repo:
  - ATtiny1614/1616 family (per included datasheet)
  - ST25DV dynamic NFC tag
  - STTS22H temperature sensor

## Firmware Entry Point

- Sketch: [`cup_firmware.ino`](./cup_firmware.ino)
- Global shared runtime structs:
  - `gState` (`NDEF Text 1`)
  - `gStatus` (`NDEF Text 2`)
  - `gSettings` (`NDEF Text 3`)

Startup flow:
1. Initialize JSON defaults.
2. Initialize NFC and write initial records.
3. Start FSM in `OFF`.

## State Machine

- FSM definitions: [`states_fsm.h`](./states_fsm.h), [`states_fsm.cpp`](./states_fsm.cpp)
- State implementations:
  - [`states_off.cpp`](./states_off.cpp)
  - [`states_ready.cpp`](./states_ready.cpp)
  - [`states_brewing.cpp`](./states_brewing.cpp)
  - [`states_cupping.cpp`](./states_cupping.cpp)
  - [`states_low_battery.cpp`](./states_low_battery.cpp)

State enum mapping:

- `0`: `OFF`
- `1`: `READY`
- `2`: `BREWING`
- `3`: `CUPPING`
- `4`: `LOW_BATTERY`

## NFC / NDEF Data Contract

NDEF handling:
- [`drivers_nfc.h`](./drivers_nfc.h)
- [`drivers_nfc.cpp`](./drivers_nfc.cpp)

JSON encoding/decoding:
- [`drivers_json.h`](./drivers_json.h)
- [`drivers_json.cpp`](./drivers_json.cpp)

Records:

1. `NDEF Text 1` (state JSON)
   - `s` (uint8 state: 0-4)
2. `NDEF Text 2` (status JSON)
   - `t` (uint16 temp, x10)
   - `m` (uint16 time, seconds)
   - `b` (uint8 battery, 0-100)
   - `u` (string UUID, ST25DV UID)
3. `NDEF Text 3` (settings JSON)
   - `r` (uint8 triggerTemp)
   - `a` (uint8 maxStartTemp)
   - `w` (uint16 brewTime)
   - `c` (uint8 maxCupTemp)
   - `x` (uint16 maxTime)
   - `l` (uint8 ledBrightness)
4. `NDEF Text 4` (app-owned JSON)
   - Cup firmware preserves this record when writing 1-3.
   - Phone app owns this record content.
   - Current app compact keys:
     - `n` coffeeName
     - `p` coffeeProcess
     - `y` cupNumber
     - `e` sessionName
     - `t` sessionType
     - `d` sessionDate
     - `u` sessionUUID

Compatibility notes:
- Firmware decoders accept both legacy verbose keys and compact keys for Text 1-3.
- App NFC service normalizes compact keys back to friendly field names for UI code.

## Configuration

Defaults and pin mapping:
- [`config.h`](./config.h)

Includes:
- Default thresholds/timers/brightness
- GPIO mapping
- Battery divider constants

## Power + Sleep

- Driver: [`drivers_power.h`](./drivers_power.h), [`drivers_power.cpp`](./drivers_power.cpp)
- Supports:
  - deep sleep (NFC wake / temp wake)
  - RTC tick timing (250 ms)
  - NFC lockout windows

## Build / Flash

This project is written as an Arduino sketch.

Typical flow:
1. Open `cup_firmware.ino` in Arduino IDE.
2. Select the correct board/core for your ATtiny target.
3. Select correct programmer/port.
4. Build and upload.

Note:
- Board/core setup is environment-specific. Keep a local note of exact board package + clock/fuse settings used in production.

Standalone debug sketches:
- [`st25_rf_disable_test/st25_rf_disable_test.ino`](./st25_rf_disable_test/st25_rf_disable_test.ino)
  - Minimal ST25DV64KC test sketch for:
    - power sequencing
    - direct raw I2C access to ST25
    - raw `RF_MNGT_DYN` readback
    - raw byte write / readback of RF disable on the dynamic register map

## Current Development Notes

- Firmware and app both read/write NDEF, so timing and atomicity matter.
- If you see intermittent malformed record reads on phone, check:
  - when firmware writes during NFC-triggered wake,
  - whether records are rewritten while RF reads are in progress,
  - I2C begin/end symmetry in NFC driver paths.

## NFC Handoff Notes (2026-03-17)

Current firmware debugging status:
- ST25DV bring-up in [`drivers_nfc.cpp`](./drivers_nfc.cpp) now retries up to 5 full init attempts.
- This materially improved write reliability in `OFF`; recent runs showed repeated `writeOk = 1`.
- `failCode = 1` became rare after the multi-attempt init logic. It now means all configured init attempts failed.
- `failCode = 2` was traced to an address-space bug when accessing `RF_MNGT_DYN`.
- The standalone sketch proved `RF_MNGT_DYN` works correctly when accessed directly over I2C on the dynamic register / data address space (`0x53`), not the system address space.
- Main firmware now uses the dynamic/data address space for RF disable / re-enable in [`drivers_nfc.cpp`](./drivers_nfc.cpp).
- After that fix, `failCode = 2` disappeared in the next main-firmware test run and successful writes reported `failCode = 0`.
- A new failure mode then surfaced: `failCode = 4` (`record 4 read failed`).

What we learned:
- The main fatal firmware issue was ST25DV init reliability, not the NDEF write itself.
- Making RF disable best-effort brought successful writes back.
- Record 4 preservation is fixed: failed writes no longer overwrite app-owned record 4 with `{}`.
- The earlier RF-disable problem was real, but it was caused by talking to `RF_MNGT_DYN` through the wrong address space.
- The raw standalone sketch result was stable:
  - `rf0=00`
  - `set=1`, `rf1=01`
  - `clear=1`, `rf2=00`
- App-side issues still remain even with successful writes:
  - occasional `recordCount = 0`
  - iOS `UserCancel`
  - iOS `SystemBusy`

Current interpretation:
- Cup-side write reliability is much better than earlier in the investigation.
- RF disable / re-enable now appears to be functioning correctly in firmware after the address-space fix.
- The remaining phone-side instability is no longer explained only by failed cup writes.
- The next visible firmware-side problem is `failCode = 4`:
  - firmware cannot read record 4 on that cycle
  - Expo then tends to show `text3: null`, `text4: null`, or later `recordCount = 0`
  - this suggests the next bug is in NDEF readability / structure around records 3-4, not RF disable

Known temporary/diagnostic changes:
- [`drivers_nfc.cpp`](./drivers_nfc.cpp)
  - `powerOn()` currently uses a larger `LPD`-before-`VCC` delay than the original code.
  - `begin()` uses repeated init attempts as a diagnostic recovery strategy.
  - auto-formating blank tags in `begin()` was removed to save flash during debugging.
  - RF disable / enable now targets `RF_MNGT_DYN` on the dynamic/data address space.
- [`drivers_power.cpp`](./drivers_power.cpp)
  - deep-sleep entry now shuts NFC down before switching other pins to low-leakage mode.
- [`drivers_temp_sensor.cpp`](./drivers_temp_sensor.cpp)
  - the extra `delay(30)` in `drivers::temp::begin()` was removed during testing; verify sensor behavior over more soak time before treating that as final.

Likely next investigation target:
- why records 3 / 4 become unreadable after the RF-disable fix.
- Best next step is probably a very small focused sketch or instrumentation path that reads records 3 and 4 only and logs exactly which read fails, plus raw bytes if possible.

## OFF Debug Logging

The `OFF` state currently prints a compact CSV timing/debug line from [`states_off.cpp`](./states_off.cpp):

```text
off,temp,battery,write,delay,state,settings,writeOk,failCode
```

Field meanings:
- `temp`: time spent in `drivers::temp::begin()` + `drivers::temp::read()`
- `battery`: battery read time
- `write`: NFC bring-up + `writeCupRecords()` time
- `delay`: the fixed post-write wait window in `OFF`
- `state`: time to read record 1 back
- `settings`: combined time from post-delay read start until end of record 3 read and NFC shutdown
- `writeOk`: `1` if `writeCupRecords()` returned success, else `0`
- `failCode`: last internal NFC write-path status from [`drivers_nfc.h`](./drivers_nfc.h)

Current `failCode` meanings:
- `0`: no failure recorded
- `1`: tag init failed for that write attempt (currently after all configured init retries)
- `2`: RF disable failed before the write (currently after retry)
- `3`: UID read failed
- `4`: record 4 read failed
- `5`: `writeAllRecords()` failed
- `6`: RF re-enable failed

Important note on `failCode 2`:
- `failCode 2` is still treated as a warning, not a hard write failure.
- But after the dynamic/data-address fix, it should now be uncommon.
- If it reappears, it means RF disable really did fail on that cycle.

Important note on `failCode 4`:
- `failCode 4` means firmware could not read record 4 before rewriting records 1-3.
- The current safety behavior is to abort the write rather than wiping record 4.
- Recent Expo logs suggest `failCode 4` can line up with:
  - `text3: null`, `text4: null`
  - and then later `recordCount = 0`

Typical `write` timing bands seen during recent `OFF` testing:
- Before the RF-disable address-space fix:
  - `~470-480 ms`: write succeeded on an early init attempt
  - `~540-550 ms`: at least one extra init recovery cycle occurred before success
  - `~610-620 ms`: multiple init recovery cycles occurred before success
- After the RF-disable address-space fix:
  - `~410-430 ms`: successful write with `failCode = 0`
  - `~540-550 ms`: successful write after extra init recovery
  - `~80-85 ms`: early abort ending in `failCode = 4`
  - `~330-340 ms`: later abort ending in `failCode = 4`

## NFC Handoff Notes (2026-03-18)

Today focused on verifying the RF-disable behavior itself and checking whether RF can be disabled even earlier in the NFC driver lifecycle.

What was confirmed:
- The phone cannot read the tag while `RF_DISABLE` is asserted, and reads resume when RF is re-enabled.
- The cup can still communicate with the ST25DV over I2C while RF is disabled.
- This validates the design assumption behind hiding the tag from the phone during MCU-side work.

Standalone sketch results:
- [`st25_rf_disable_test/st25_rf_disable_test.ino`](./st25_rf_disable_test/st25_rf_disable_test.ino) was adapted twice:
  - first to prove RF OFF blocks the phone but still allows I2C access
  - then to test "disable RF first, initialize tag second"
- The pre-init test result was stable:
  - `bus=1`
  - `rf0=00`
  - `set=1`
  - `rf1=01`
  - `init_after_disable=1`
  - `clear=1`
  - `rf2=00`

Interpretation of the pre-init test:
- It is possible to:
  1. power the ST25DV,
  2. disable RF immediately over raw I2C,
  3. then run `tag.begin(Wire)` successfully while RF remains off,
  4. then re-enable RF afterwards.
- This means the preferred design of disabling RF as early as possible is viable.

Important implication for the main firmware:
- The current main firmware still only disables RF inside [`writeCupRecords()`](./drivers_nfc.cpp).
- There are still other I2C accesses with RF left enabled, including:
  - [`readState()`](./drivers_nfc.cpp)
  - [`readSettings()`](./drivers_nfc.cpp)
  - [`readStatus()`](./drivers_nfc.cpp)
- A cleaner NFC ownership model would likely be:
  - disable RF in `drivers::nfc::begin()` after power-up,
  - keep RF off for the whole period while the MCU owns the ST25DV,
  - re-enable RF in `drivers::nfc::end()`.

Current recommendation after today's testing:
- Refactor RF gating so it is owned by `begin()` / `end()`, not only by `writeCupRecords()`.
- If that refactor is done:
  - remove the inner RF disable / enable around `writeCupRecords()`
  - keep logging if RF re-enable fails in `end()`
  - decide whether RF-disable failure in `begin()` should be treated as fatal or warning

Open problem still remaining:
- `failCode = 4` / unreadable records 3-4 / later `recordCount = 0`
- RF disable is now a confirmed working mechanism, so the remaining bug is elsewhere.

## Suggested Next Docs

To make maintenance easier, add:
1. `docs/firmware-build.md` with exact Arduino board package/version and menu options.
2. `docs/ndef-contract.md` as the single source of truth for record schemas and ownership.

## NFC Comparison Notes (2026-03-18, later)

Later testing on 2026-03-18 compared three different cases:
- the refactored `OFF` firmware flow with explicit RF ownership windows
- Expo scans with the cup unpowered
- NFC Connect scans while the cup was powered and Arduino serial was running

### 1. Refactored `OFF` flow can run cleanly

The current `OFF` debug line is now:

```text
off2,<14 timings>,<session1Mask>,<session2Mask>,<failCode>
```

Where:
- `session1Mask = 15` means the first NFC ownership window fully succeeded:
  - `begin1Ok`
  - `rfOff1Ok`
  - `writeOk`
  - `rfOn1Ok`
- `session2Mask = 31` means the second NFC ownership window fully succeeded:
  - `begin2Ok`
  - `rfOff2Ok`
  - `stateOk`
  - `settingsOk`
  - `rfOn2Ok`

Representative good lines were:

```text
off2,...,15,31,0
```

Interpretation:
- the new `OFF` sequencing worked end-to-end
- RF disable / enable worked in both sessions
- write succeeded
- read-back of state and settings succeeded
- `failCode = 0`

Typical timing ranges in the clean run:
- `begin1`: ~41-47 ms
- `rfOff1`: ~0-7 ms
- `temp`: ~23-25 ms
- `battery`: ~2-3 ms
- `write`: ~363-369 ms
- `rfOn1`: ~5-7 ms
- `begin2`: ~41-42 ms
- `state`: ~4-6 ms
- `settings`: ~15-17 ms

### 2. Expo still shows intermittent failures with the cup unpowered

Unpowered-cup Expo scans still showed:
- `recordCount = 0`
- `UserCancel`
- `SystemBusy`

But successful scans returned a clean full payload with:
- `recordCount = 4`
- valid `text1`
- valid `text2`
- valid `text3`
- valid `text4`

Interpretation:
- at least part of the remaining scan instability is not caused by the cup firmware
- Expo / iOS NFC session behaviour can fail even when the MCU is fully out of the picture

### 3. NFC Connect comparison while powered

While scanning with NFC Connect and watching Arduino serial at the same time, the cup-side logs remained consistently healthy:

```text
off2,...,15,31,0
```

Interpretation:
- from the cup's point of view, the two-session `OFF` transaction remained stable
- RF ownership was behaving correctly
- no internal NFC error was recorded

If phone-side errors still appear during runs like this, they should not be assumed to come from the cup-side transaction flow alone.

### Current working conclusion

At this point there appear to be two separate classes of problem:

1. Phone-side scan/session instability
- seen even with the cup unpowered
- symptoms include:
  - `recordCount = 0`
  - `UserCancel`
  - `SystemBusy`

2. Firmware-side NDEF readability/integrity issue
- seen in powered runs when Arduino reports:
  - `failCode = 4`
  - degraded masks such as `11,19,4` or `11,23,4`
- app-side symptoms during those periods can include:
  - `recordCount = 2`
  - missing later records
  - failed writes

So the remaining work should keep those two threads separate:
- app/session reliability
- tag/NDEF integrity when firmware reports `failCode = 4`
