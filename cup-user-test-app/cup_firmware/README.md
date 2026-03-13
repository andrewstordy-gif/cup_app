# cup_firmware

Arduino firmware for the digital cupping cup.

This firmware runs a state machine (`OFF`, `READY`, `BREWING`, `CUPPING`, `LOW_BATTERY`), reads sensors (temperature, battery), and exchanges data with phone apps over ST25DV NDEF records.

## Hardware + Docs

- Main hardware docs: [`docs/hardware/README.md`](./docs/hardware/README.md)
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

## Current Development Notes

- Firmware and app both read/write NDEF, so timing and atomicity matter.
- If you see intermittent malformed record reads on phone, check:
  - when firmware writes during NFC-triggered wake,
  - whether records are rewritten while RF reads are in progress,
  - I2C begin/end symmetry in NFC driver paths.

## Suggested Next Docs

To make maintenance easier, add:
1. `docs/firmware-build.md` with exact Arduino board package/version and menu options.
2. `docs/ndef-contract.md` as the single source of truth for record schemas and ownership.
