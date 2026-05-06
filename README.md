# cup

Expo React Native app for CUP NFC cupping workflows, local session storage, and NFC cup/tag testing.

## Current Status

This branch is the NTAG prototype branch:

- branch: `codex/ntag-version`
- base checkpoint: `codex/redesign-cupping-flow`
- app bundle id: `com.andrewstordy.cup`

The app currently supports two NFC cup paths:

- Smart CUP hardware using the 4-record NDEF protocol.
- Standard NTAG sticker cups for prototype testing, using metadata-only NDEF.

## Run Locally

```bash
cd /Volumes/external/code/cup_app
npm install
npm run ios:device
npm run start:dev
```

Typical device workflow:

1. `npm run ios:device` installs or updates the Expo dev client on the iPhone.
2. `npm run start:dev` starts Metro.
3. Open the app on the phone and scan cups/tags.

## TestFlight Build

The root `eas.json` contains a production iOS profile for App Store Connect/TestFlight builds.

Before building, make sure the working tree is committed and you are logged in:

```bash
npx eas login
```

Build for TestFlight:

```bash
npx eas build --platform ios --profile production
```

Submit the completed build to App Store Connect:

```bash
npx eas submit --platform ios --profile production
```

Or build and submit in one step:

```bash
npx eas build --platform ios --profile production --auto-submit
```

After submission, Apple processes the build in App Store Connect. It should then appear under TestFlight.

## App Structure

```text
src/
  components/
  data/
    sessionRepository.js
  features/
    account/
    cup-settings/
    cupping/
      components/
      data/
      screens/
    home/
    nfc/
    settings/
  navigation/
    AppNavigator.js
  services/
    nfcServiceMinimal.js
    nfcTagClassifier.js
  theme/
```

## Smart CUP NFC Protocol

Smart cups use a position-based 4-record NDEF protocol.

1. `NDEF1` = state
2. `NDEF2` = status
3. `NDEF3` = settings
4. `NDEF4` = session/sample metadata

### Compact Keys

`NDEF1`

- `s` = state

`NDEF2`

- `t` = temp x10
- `m` = time seconds
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

- `n` = coffee name
- `p` = coffee process key
- `y` = cups per sample
- `i` = samples in session
- `z` = sample number
- `k` = sample colour hex
- `e` = session name
- `t` = session type key
- `d` = compact date, for example `260506`
- `u` = session UUID

Example `NDEF4`:

```json
{"n":"Burundi","p":6,"y":3,"i":3,"z":2,"k":"#00A651","e":"NTAG","t":1,"d":260506,"u":"nfzyy8y0pqizn6"}
```

## NTAG Cup Prototype

Standard NTAG sticker cups do not provide smart-cup state, temperature, brew timer, or firmware settings.

The app classifies NFC reads as:

- `smart_cup`
- `ntag_cup`
- `generic_ndef_tag`
- `empty_tag`
- `unknown`

For NTAG cups:

- The app writes session/sample metadata only.
- The physical NFC tag id is used as the cup/sample identifier when no smart-cup UUID exists.
- Home scan resolves the active sample from metadata or tag id.
- The cupping screen opens directly with all scoring fields available.
- Temperature is shown as unavailable because NTAG stickers do not provide cup temperature.

## Cupping Flow

Smart CUP behaviour:

- Ready state: cupping screen opens with Fragrance available first.
- Brewing state: brewing timer screen opens.
- Cupping state: Fragrance and Aroma are available first; remaining fields unlock after Aroma is populated.

NTAG cup behaviour:

- Cupping screen opens directly.
- All scoring fields are available immediately.

Shared cupping features:

- 1-9 selectors with `FINAL` gating.
- Defects drawer.
- Save/scan footer behaviour.
- Active Session overview.
- Flavour keyword pills in notes after leaving the notes field.

## Flavour Keywords

Keyword data lives in:

- `src/features/cupping/data/flavour_keywords_update.csv`
- `src/features/cupping/data/flavourKeywords.js`

The runtime list currently contains 108 descriptors. Recognised flavour words are rendered as coloured pills in notes previews and active session details.

## NFC Services

Main files:

- `src/services/nfcServiceMinimal.js`
- `src/services/nfcTagClassifier.js`

`nfcServiceMinimal.js` handles:

- smart cup 4-record reads/writes
- metadata-only NTAG writes
- read retries when `ndefMessage` is temporarily missing
- transient write retries
- iOS NFC session cooldowns

`nfcTagClassifier.js` handles:

- tag type classification
- NTAG tag id extraction
- metadata payload detection

## Known Constraints

- Device testing is still the primary validation path.
- `react-native-nfc-manager` is timing-sensitive on iOS.
- Blank NTAG behaviour depends on whether iOS exposes NDEF data or only the physical tag id.
- NTAG cups cannot supply live state, temperature, or brew timing.
- `expo-av` is still present and deprecated in Expo SDK 54.
- Native `ios/` and `android/` folders are kept in the repo.
