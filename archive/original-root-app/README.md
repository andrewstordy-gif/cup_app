# Cup NDEF App

React Native (Expo) app for reading and writing your cup's 4 NDEF JSON text records.

## Important

Live NFC on iPhone requires an **Expo development build**.  
Expo Go will show the UI, but NFC read/write will not work.

## Install

```bash
npm install
```

## Run UI in Expo Go (no live NFC)

```bash
npx expo start --lan -c
```

## Run with live NFC on iPhone

```bash
npx expo prebuild
npx expo run:ios --device
```

Then open the installed app on iPhone and test the `Read NDEF` / `Write NDEF` buttons.
