# cup_firmware

Arduino firmware for the digital cupping cup.

This firmware runs the cup state machine, reads sensors, and exchanges data with the app over ST25DV NDEF records.

## Hardware + Docs

- hardware docs: [docs/hardware/README.md](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/docs/hardware/README.md)
- main sketch: [cup_firmware.ino](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/cup_firmware.ino)

Main parts:
- ATtiny1614/1616 family
- ST25DV dynamic NFC tag
- STTS22H temperature sensor

## State Machine

FSM files:
- [states_fsm.h](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_fsm.h)
- [states_fsm.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_fsm.cpp)

State implementations:
- [states_off.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_off.cpp)
- [states_ready.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_ready.cpp)
- [states_brewing.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_brewing.cpp)
- [states_cupping.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_cupping.cpp)
- [states_low_battery.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/states_low_battery.cpp)

State enum mapping:
- `0` = `OFF`
- `1` = `READY`
- `2` = `BREWING`
- `3` = `CUPPING`
- `4` = `LOW_BATTERY`

## NFC Driver Layout

NFC files:
- [drivers_nfc.h](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/drivers_nfc.h)
- [drivers_nfc.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/drivers_nfc.cpp)

JSON files:
- [drivers_json.h](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/drivers_json.h)
- [drivers_json.cpp](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/drivers_json.cpp)

The repeated state NFC logic has been refactored into shared Stage 1 / Stage 2 helpers:
- Stage 1
  - begin NFC
  - disable RF
  - read temp
  - read battery
  - write cup records
  - re-enable RF
  - end NFC
- Stage 2
  - begin NFC
  - wait for RF idle
  - disable RF
  - read state
  - optionally read settings
  - re-enable RF
  - end NFC

## 4-Record NFC Contract

The cup protocol is position-based and always uses 4 text records in fixed order:

1. `NDEF1` = state
2. `NDEF2` = status
3. `NDEF3` = settings
4. `NDEF4` = metadata

Records must never be deleted.

### Compact payloads

`NDEF1`
- `s` = state `0..4`

`NDEF2`
- `t` = temp x10
- `m` = elapsed time seconds
- `b` = battery
- `u` = cup UUID

`NDEF3`
- `r` = trigger temp
- `a` = max start temp
- `w` = brew time
- `c` = max cup temp
- `x` = max time
- `l` = LED brightness

`NDEF4`
- app-owned metadata payload

## Sparse Protocol Support

Firmware now supports sparse app writes using `{}` placeholders.

Implemented behavior:
- `NDEF1 = {}`
  - no state update
- `NDEF3 = {}`
  - no settings update
- `NDEF4 = {}`
  - preserve the last meaningful metadata
- invalid state values above `4`
  - rejected

Meaningful `NDEF4` currently means:
- any readable record 4 payload that is not exactly `{}` (ignoring whitespace)

So examples like:

```json
{"u":"NO-SESSION"}
{"n":"Ethiopia","u":"CUP-8291-XJ2"}
```

are cached and preserved.

## Important Ownership Rule

Protocol ownership is:
- cup owns `NDEF1`, `NDEF2`, `NDEF3`
- app owns `NDEF4`

In practice, because the app performs full 4-record writes:
- the app should only send real values in:
  - `NDEF1`
  - `NDEF3`
  - `NDEF4`
- the app should send `NDEF2 = {}`

## Robustness Findings

Recent testing established:
- deleting records is unsafe because later records shift position
- empty `{}` placeholders are much safer than deletion
- malformed writes to `NDEF2` can make the tag unreadable until reboot/bootstrap
- valid-but-wrong values in `NDEF2` are tolerated and later overwritten by the cup
- startup bootstrap restores a valid baseline 4-record layout

## Boot / Recovery Behavior

Startup flow:
1. initialize defaults
2. initialize NFC
3. write baseline records
4. enter FSM in `OFF`

This bootstrap write is the main recovery path when the on-tag NDEF structure has been damaged.

## Settings Readback by State

States that read settings in Stage 2:
- `OFF`
- `READY`

States that only read state in Stage 2:
- `BREWING`
- `CUPPING`
- `LOW_BATTERY`

So settings writes performed while brewing/cupping are not applied immediately by firmware.

## Build / Flash

Typical flow:
1. open [cup_firmware.ino](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/cup_firmware.ino) in Arduino IDE
2. select the correct ATtiny board/core
3. select programmer/port
4. build and upload

Note:
- recent flash pressure required removing the earlier serial debug output once the full FSM was restored

## Current Testing Guidance

Best validation workflow:
1. flash firmware
2. reboot cup
3. confirm baseline tag read
4. use the app NFC Test screen or NFC Tap to exercise:
   - sparse state update
   - sparse settings update
   - sparse metadata update
   - `NO-SESSION` metadata

Expected stable behavior:
- no record deletion
- fixed 4-record ordering
- `NDEF4` preserved when app writes `{}` to record 4
