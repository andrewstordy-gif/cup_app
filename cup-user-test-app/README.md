# cup-user-test-app

Expo React Native prototype for CUP NFC flows, cupping workflows, and local-first persistence.

## Status (2026-03-12)

Working development build with:
- Native NFC read/write (`react-native-nfc-manager`)
- Local SQLite persistence (`expo-sqlite`)
- Cupping sessions + sample assignment
- State-based Home scan routing
- Cupping capture, final mode, defects, and score calculation

## Run

```bash
cd /Users/andrewstordy/code/cup_app/cup-user-test-app
npm install
npm run ios:device     # install dev client to iPhone
npm run start:dev      # run Metro for dev client
```

## App Structure

```text
src/
  components/
    layout/ScreenContainer.js
    ui/
      Header.js
      HomeStatusElement.js
      WarningDialog.js
      CupStatusStrip.js
      ScoreSelector.js
      NotesInput.js
      full_page_button.js
      primary_button.js
      floating_action_button.js
  data/
    localDatabase.js
    sessionRepository.js
  features/
    home/screens/
    cup-settings/screens/
    cupping/components/
    cupping/screens/
    nfc/screens/
    settings/screens/
  navigation/AppNavigator.js
  services/nfcService.js
  theme/
```

## NDEF Contract (compact keys)

- Text 1: `s` (state `0..4`)
- Text 2: `t` (temp x10), `m` (seconds), `b` (battery), `u` (cup UUID)
- Text 3: `r` (trigger temp), `a` (max water temp), `w` (brew time sec), `c` (max cup temp), `x` (max time), `l` (LED brightness)
- Text 4: `n` (coffee name), `p` (coffee process), `y` (cup number), `e` (session name), `t` (session type), `d` (session date), `u` (session UUID)

`nfcService` normalizes compact/full key variants when reading and writes compact keys when encoding.

## Home Scan Behavior

- Tap cup image overlay to scan.
- State `0`: show **Cup Sleeping zz** dialog.
- State `1/2/3` + Text4 `sessionUUID = NO-SESSION`: stay on Home and update Home status card.
- State `1/2/3` + matching pending/ongoing sample: open Cupping screen.
- State `1/2/3` + no matching sample: show **Cup Not in Session** dialog.

### Use without session

- Writes Text1 `s=1` (READY).
- Clears Text4 fields and sets Text4 `u=NO-SESSION`.

## CUP Menu (current)

- Cupping Sessions
- Cup Settings
- Reset Cup to OFF
- Share Latest Error Log
- NFC Test (kept but visually hidden)

`Reset Cup to OFF` writes Text1 `s=0` and preserves other records.

## Cup Settings Screen

Editable Text3 fields:
- Trigger Temp (`r`)
- Max Water Temp (`a`)
- Brew Time (`w`) shown as `mm:ss` (stored as seconds)
- Max Cup Temp (`c`)
- LED Brightness (`l`) shown as percentage (`0..100%` -> `0..200`)

Button: **Read / Write Settings**  
Write is gated to cup states `0`, `1`, `4`.

## Cupping Session + Cupping Screen

- Session details support NFC sample assignment and cup conflict prevention.
- Completed sample cards are locked/greyed.
- Cupping screen supports:
  - READY/BREWING/CUPPING state modes
  - History cards
  - Final mode
  - Defect selection
  - Final score calculation and persistence
- Session status auto-updates to complete when all samples are complete.

## Data Layer

Primary repository: `src/data/sessionRepository.js`  
DB setup/migrations: `src/data/localDatabase.js`

Core entities:
- `sessions`
- `samples`
- `sample_feedback_entries`
- `sample_defect_entries`

## Cleanup Completed

- Refactored repeated NFC action-finalization blocks in `AppNavigator` into one helper (`finishCurrentNfcAction`).
- Removed dead local `delay` helper from `AppNavigator`.
- Simplified Home scan code path (single `readResult` assignment).
- Updated NFC service to close iOS session immediately on successful read/write.
- Refactored `CuppingSessionDetailsScreen` for readability:
  - extracted reusable sample card UI to `src/features/cupping/components/CoffeeSampleCard.js`
  - extracted add-sample bottom sheet UI to `src/features/cupping/components/AddCoffeeSampleSheet.js`
  - extracted session detail constants/utilities to `src/features/cupping/constants/sessionDetails.js`

## Notes / Known Constraints

- No automated test suite yet; device testing is primary validation path.
- `react-native-nfc-manager` is currently flagged by Expo Doctor as untested on New Architecture.
- This app keeps native `ios/` and `android/` folders (prebuild workflow).

## Error Logs (new)

- The app now writes a text file for each caught error in key NFC flows/screens.
- Log files are stored under app documents in `error-logs/`.
- Each log includes:
  - timestamp
  - screen/route/flow
  - user-facing message
  - raw error
  - flow events (step trace)
  - context snapshot (when available)
- Use **CUP Menu -> Share Latest Error Log** to export the newest `.txt` log.
