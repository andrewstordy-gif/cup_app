# cup-user-test-app

Expo React Native prototype for CUP NFC flows, cupping workflows, and local-first persistence.

## Current Status

This repo currently contains:
- the React Native app
- the Arduino cup firmware
- an NFC Test screen used to validate the cup/app protocol on-device

The latest working checkpoint implements a sparse 4-record NFC protocol and matching firmware support for metadata preservation.

## Run

```bash
cd /Users/andrewstordy/code/cup_app/cup-user-test-app
npm install
npm run ios:device
npm run start:dev
```

Typical device workflow:
1. `npm run ios:device` to install/update the dev client on iPhone
2. `npm run start:dev` to start Metro
3. open the app on the device and use the NFC Test screen for protocol validation

## App Structure

```text
src/
  components/
  data/
  features/
    cup-settings/screens/
    cupping/components/
    cupping/screens/
    home/screens/
    nfc/screens/
    settings/screens/
  navigation/AppNavigator.js
  services/
    errorLogger.js
    nfcService.js
    nfcServiceMinimal.js
  theme/
```

## NFC Protocol

The cup/tag protocol is position-based and always uses exactly 4 NDEF text records in this order:

1. `NDEF1` = state
2. `NDEF2` = status
3. `NDEF3` = settings
4. `NDEF4` = metadata

Records must never be deleted.

### Compact on-tag keys

- `NDEF1`
  - `s` = state (`0..4`)
- `NDEF2`
  - `t` = temp x10
  - `m` = time seconds
  - `b` = battery
  - `u` = cup UUID
- `NDEF3`
  - `r` = trigger temp
  - `a` = max start temp
  - `w` = brew time
  - `c` = max cup temp
  - `x` = max time
  - `l` = LED brightness
- `NDEF4`
  - `n` = coffee name
  - `p` = coffee process
  - `y` = cup number
  - `e` = session name
  - `t` = session type
  - `d` = session date
  - `u` = session UUID

### Sparse write protocol

The app now writes sparse 4-record frames.

Rules:
- every write always sends all 4 records
- `NDEF2` is always written as `{}` by the app
- `{}` in `NDEF1` means no state update
- `{}` in `NDEF3` means no settings update
- `{}` in `NDEF4` means preserve existing metadata in firmware
- explicit "no session" metadata should be written as:

```json
{"u":"NO-SESSION"}
```

Examples:

State update:

```json
NDEF1 = {"s":1}
NDEF2 = {}
NDEF3 = {}
NDEF4 = {}
```

Settings update:

```json
NDEF1 = {}
NDEF2 = {}
NDEF3 = {"r":40,"a":93,"w":240,"c":70,"x":3600,"l":100}
NDEF4 = {}
```

Metadata update:

```json
NDEF1 = {}
NDEF2 = {}
NDEF3 = {}
NDEF4 = {"u":"NO-SESSION"}
```

## NFC Test Screen

Location:
- [src/features/nfc/screens/NfcServiceTestScreen.js](/Users/andrewstordy/code/cup_app/cup-user-test-app/src/features/nfc/screens/NfcServiceTestScreen.js)

Current purpose:
- read raw and parsed NDEF records from the cup
- manually write sparse protocol frames for state, settings, and metadata
- show the exact compact payload being written to each of the 4 records

Current write actions:
- `Write State Update`
- `Write Settings Update`
- `Write Metadata Update`
- `Write No Session`

Current service:
- [src/services/nfcServiceMinimal.js](/Users/andrewstordy/code/cup_app/cup-user-test-app/src/services/nfcServiceMinimal.js)

This minimal service now includes:
- read retry for temporarily missing `ndefMessage`
- one write retry for transient `TagUpdateFailure` / `TagConnectionLost`
- iOS session cooldown after `UserCancel` / `SystemBusy`
- short session settle delay before `writeNdefMessage(...)`

## Home Flow

Home remains conservative/read-oriented while the sparse-write protocol is being validated.

Current status:
- Home scan reads the cup and routes by state
- NFC Test is the primary place to validate new write behavior

## Cup Settings

The regular Cup Settings flow still gates settings writes to cup states:
- `OFF`
- `READY`
- `LOW_BATTERY`

Firmware behavior is different:
- in `BREWING` / `CUPPING`, firmware ignores `NDEF3` settings updates at runtime because those states do not read settings back

## Firmware

Firmware lives in:
- [cup_firmware/README.md](/Users/andrewstordy/code/cup_app/cup-user-test-app/cup_firmware/README.md)

Important recent firmware behaviors:
- invalid states above `4` are rejected
- `NDEF4 = {}` preserves the last meaningful metadata
- startup bootstrap restores a valid baseline 4-record tag layout

## Device-Test Notes

Useful patterns from recent testing:
- deleting records is unsafe because record order shifts
- writing `{}` placeholders is much safer than deleting records
- malformed `NDEF2` writes can make the tag unreadable until reboot/bootstrap
- valid sparse writes now work reliably enough for iterative testing

## Known Constraints

- no automated test suite yet; device testing is still the primary validation path
- `react-native-nfc-manager` remains timing-sensitive on iOS
- `expo-av` is still used for NFC Test failure feedback and is deprecated on SDK 54
- native `ios/` and `android/` folders are kept in-repo
