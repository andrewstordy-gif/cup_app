# cup

Expo React Native app for CUP NFC cupping workflows, local session storage, smart cup scanning, and NTAG prototype testing.

## Current Status

This branch is the NTAG prototype branch:

- Branch: `codex/ntag-version`
- Base checkpoint: `codex/redesign-cupping-flow`
- iOS bundle id: `com.andrewstordy.cup`

The app currently supports two NFC cup paths:

- Smart CUP hardware using the 4-record NDEF protocol.
- Standard NTAG sticker cups using metadata-only NDEF for prototype and research testing.

The main production-style flow now uses the redesigned Home, Brewing, Cupping, and Active Session screens.

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

NFC must be tested on a physical iPhone. The simulator cannot read or write NFC tags.

## Useful Commands

```bash
npm run start:dev
npm run ios:device
npm run test:nfc
```

`npm run test:nfc` runs a virtual robustness check for smart cup and NTAG classification, compact metadata matching, smart-cup preservation, and verification logic.

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
scripts/
  virtual-nfc-robustness-check.js
mock-screens/
```

## NFC Protocols

### Smart CUP

Smart cups use a position-based 4-record NDEF protocol.

1. `NDEF1` = state
2. `NDEF2` = status
3. `NDEF3` = settings
4. `NDEF4` = session/sample metadata

Compact keys:

- `NDEF1.s` = state
- `NDEF2.t` = temperature x10
- `NDEF2.m` = elapsed time in seconds
- `NDEF2.b` = battery
- `NDEF2.u` = physical cup UUID
- `NDEF2.v` = firmware version (SemVer string, e.g. `"0.2.0"`; optional — omitted by cups on firmware older than the release that added it). The app decodes this field but never writes it back — `NDEF2` is cup-owned and republished by the cup itself on every interaction.
- `NDEF3.r` = trigger temp
- `NDEF3.a` = max start temp
- `NDEF3.w` = brew time
- `NDEF3.c` = max cup temp
- `NDEF3.x` = max time
- `NDEF3.l` = LED brightness

### NTAG Cups

Standard NTAG sticker cups do not provide smart-cup state, temperature, brew timer, or firmware settings.

For NTAG cups:

- The app writes session/sample metadata only.
- Metadata is stored as a single NDEF text record.
- The physical NFC tag id is used as the sample identifier when no smart-cup UUID exists.
- The cupping screen opens with all scoring fields available immediately.
- Temperature and brewing state are unavailable.

### Tag Classification

The NFC layer classifies reads as:

- `smart_cup`
- `ntag_cup`
- `generic_ndef_tag`
- `empty_tag`
- `unknown`

Smart cup hardware is detected from the iOS tag shape and hardware id, not only from the number of NDEF records. This prevents a flaky smart cup read from being treated as an NTAG and accidentally rewritten as metadata-only.

If a smart cup has collapsed to a single metadata record, the add-sample flow can rebuild the 4-record smart payload. In that recovery path, `NDEF2` and `NDEF3` are restored with safe defaults until the firmware refreshes live status/settings:

- `NDEF2`: physical tag id, temp `0`, time `0`, battery `0`
- `NDEF3`: `r=40`, `a=93`, `w=240`, `c=70`, `x=3600`, `l=100`

## Session Metadata

Session/sample metadata is stored in `NDEF4` on smart cups and as the single metadata record on NTAG cups.

Compact keys:

- `n` = coffee
- `p` = coffee process key
- `y` = cups per sample
- `i` = samples in session
- `z` = sample number
- `k` = sample colour hex
- `e` = session name
- `t` = session type key
- `d` = compact date, for example `260521`
- `u` = 14-character session UUID

Example:

```json
{"n":"Burundi","p":6,"y":3,"i":3,"z":2,"k":"#00A651","e":"NTAG","t":1,"d":260506,"u":"nfzyy8y0pqizn6"}
```

## App Flows

### Home And No-Session Cups

The Home screen scans cups and routes by cup type/state.

For smart cups with `NDEF4.u` set to `NO-SESSION`, the app uses the no-session flow:

- Ready state opens the no-session ready screen.
- Brewing state opens the brewing timer screen.
- Cupping state opens the no-session cupping screen.

The no-session cupping timer uses `NDEF2.m` and continues incrementing locally after scan.

### Session Setup

Sessions can contain a mix of smart cups and NTAG cups.

When adding a sample:

- Smart cups are written as 4-record smart payloads.
- NTAG cups are written as metadata-only payloads.
- The app stores the sample in the local database.
- Verification compares the physical cup/tag and compact metadata against the stored sample.

### Brewing

The Brewing screen uses:

- `NDEF2.m` for elapsed seconds
- `NDEF3.w` for target brew time
- `NDEF4.k` for the sample colour indicator

The timer progresses locally second-by-second after the cup has been scanned.

### Cupping

Smart CUP availability rules:

- Ready state `1`: Fragrance is available first; other score inputs are inactive.
- Brewing state `2`: the Brewing screen opens.
- Cupping state `3` with no Aroma score: Fragrance and Aroma are available.
- Cupping state `3` after Aroma is populated: all score fields are available.

NTAG availability rules:

- All score fields are available immediately because state/timer data is unavailable.

Shared cupping features:

- Eight score fields: Fragrance, Aroma, Flavour, Aftertaste, Acidity, Sweetness, Mouthfeel, Overall.
- Swipe/pagination between samples in the current session without scanning each cup.
- One notes box after the score fields.
- Keyboard-aware notes entry.
- Flavour keyword pills in notes previews.
- `FINAL` buttons that lock/unlock each score row.
- Defects drawer.
- Bottom button switches between `SCAN CUP` and `SAVE`.
- Balloons rise when a sample is saved with all eight fields marked final.

### Active Session

The Active Session screen is available from the side menu.

It shows:

- Session status, date, name, and type.
- One card per sample/cup.
- Eight score boxes per sample.
- Defect icons.
- Current score or final score.
- Expandable sample details: Coffee, Process, and Flavours.

Tapping a sample card opens that sample in the cupping screen. The chevron expands/collapses the detail drawer.

## Scoring And Defects

The cupping screen shows `Score Pending` until all eight score fields have values.

Once all eight scores are present, the live score is shown:

```text
Score 80.50
```

When all eight score fields are also marked final, the title changes to:

```text
Final Score 80.50
```

Current score formula:

```text
score = 0.65625 * sum(eight scores) + 52.75 - nonUniformDeduction - defectiveDeduction
```

The result is rounded to the nearest 0.25.

Defect rules:

- `NON-UNIFORM CUPS` has one checkbox per cup in the sample.
- `DEFECTIVE CUPS` has one checkbox per cup in the sample.
- `MOULDY`, `PHENOLIC`, and `POTATO` each have one checkbox.
- Non-uniform cups reduce the score.
- Defective cups reduce the score more heavily.
- Named defect checkboxes are recorded and shown as icons, but the current numeric deduction is driven by the defective cup count.

Current deductions:

```text
nonUniformDeduction = 2 * ((nonUniformCups / cupsPerSample) * 5)
defectiveDeduction = 4 * ((defectiveCups / cupsPerSample) * 5)
```

## Flavour Keywords

Keyword data lives in:

- `src/features/cupping/data/flavour_keywords_update.csv`
- `src/features/cupping/data/flavourKeywords.js`

Recognised flavour words are rendered as coloured pills in notes previews and active session details.

## NFC Services

Main files:

- `src/services/nfcServiceMinimal.js`
- `src/services/nfcTagClassifier.js`

`nfcServiceMinimal.js` handles:

- Smart cup 4-record reads/writes
- Metadata-only NTAG writes
- Read retries when `ndefMessage` is temporarily missing
- Transient write retries
- iOS NFC session cooldowns
- Smart-cup read/write recovery when a hardware smart cup is read in a degraded NDEF state

`nfcTagClassifier.js` handles:

- Tag type classification
- Smart cup hardware detection
- NTAG tag id extraction
- Metadata payload detection

## Building For iPhone

### Development Build

```bash
npm run ios:device
npm run start:dev
```

Use this for day-to-day NFC testing.

### Xcode Archive For TestFlight

The current manual release route is Xcode archive upload:

1. Open `ios/cup.xcworkspace` in Xcode.
2. Select the app target.
3. Confirm the selected Apple Developer team is the personal CUP app team, not IKAWA LTD.
4. Confirm Signing & Capabilities includes NFC Tag Reading. For NFC, keep NDEF/TAG enabled.
5. Confirm the bundle identifier is `com.andrewstordy.cup`.
6. Increment the build number when uploading another TestFlight build.
7. Select a physical iPhone or `Any iOS Device (arm64)` as the destination.
8. Choose Product -> Archive.
9. In Organizer, select the archive and choose Distribute App.
10. Upload to App Store Connect for TestFlight processing.

Do not use the IKAWA LTD Apple Developer team for CUP app TestFlight releases.

The version shown in Organizer is `MARKETING_VERSION (CURRENT_PROJECT_VERSION)`, for example `0.1.0 (2)`.

### EAS Build For TestFlight

The root `eas.json` contains a production iOS profile for App Store Connect/TestFlight builds. Use the personal Apple Developer account for CUP app releases:

```bash
npx eas login
npx eas build --platform ios --profile production --auto-submit
```

When EAS asks for Apple Developer credentials:

- Use Apple ID `andrewstordy@gmail.com`.
- Do not accept a prefilled `andrew@ikawacoffee.com` prompt.
- Do not choose the IKAWA LTD Apple Developer team.
- If EAS restores a cached IKAWA session, overwrite the Apple ID prompt with `andrewstordy@gmail.com` before continuing.

The linked EAS project is `@andrewstordy/cup`.

For manual submit after a completed EAS build:

```bash
npx eas submit --platform ios --profile production
```

If EAS reports Apple agreement updates for IKAWA LTD, stop. That means the build is using the wrong Apple account/team.

### EAS Build Alternative

For a build without automatic submission:

```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production
```

## Sample Shape Icons

Samples are identified by shape rather than colour to avoid biasing flavour perception. All shapes use `FontAwesome` from `@expo/vector-icons`.

| # | Key | Icon | Label |
|---|-----|------|-------|
| 1 | `circle` | `circle` | Circle |
| 2 | `circle-outline` | `circle-o` | Circle Out. |
| 3 | `circle-thin` | `play` | Play |
| 4 | `circle-target` | `dot-circle-o` | Target |
| 5 | `circle-plus` | `plus-circle` | Circle Plus |
| 6 | `circle-minus` | `minus-circle` | Circle Minus |
| 7 | `circle-times` | `times-circle` | Circle × |
| 8 | `circle-check` | `check-circle` | Circle Check |
| 9 | `square` | `square` | Square |
| 10 | `square-outline` | `flag` | Flag |
| 11 | `square-plus` | `plus-square` | Square Plus |
| 12 | `square-minus` | `minus-square` | Square Minus |
| 13 | `square-check` | `check-square` | Square Check |
| 14 | `star` | `star` | Star |
| 15 | `star-outline` | `bolt` | Bolt |
| 16 | `star-half` | `bookmark` | Bookmark |
| 17 | `certificate` | `certificate` | Certificate |
| 18 | `heart` | `heart` | Heart |
| 19 | `heart-outline` | `shield` | Shield |
| 20 | `diamond` | `leaf` | Leaf |

Usage:

```jsx
import { ShapeIcon } from "../components/ui/ShapeIcon";
import { SAMPLE_SHAPES } from "../theme/iconography";

// Render a shape by key
<ShapeIcon shape="circle" size={24} color={colors.ink} />

// Iterate all 20 shapes
{SAMPLE_SHAPES.map(({ key, label }) => (
  <ShapeIcon key={key} shape={key} size={24} color={colors.ink} />
))}
```

## Known Constraints

- Device testing is still the primary validation path.
- `react-native-nfc-manager` is timing-sensitive on iOS.
- Blank NTAG behaviour depends on whether iOS exposes NDEF data or only the physical tag id.
- NTAG cups cannot supply live state, temperature, or brew timing.
- Smart cup recovery can rebuild a collapsed 4-record payload, but recovered status/settings are defaults until firmware refreshes them.
- `expo-av` is still present and deprecated in Expo SDK 54.
- Native `ios/` and `android/` folders are kept in the repo.
