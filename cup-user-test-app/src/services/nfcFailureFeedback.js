import { Audio } from "expo-av";

const FAILURE_CLANG = require("../../assets/sounds/nfc-failure-clang.wav");

let soundRef = null;
let loadPromise = null;

function normalizeMessage(error) {
  return String(error?.message || error || "").trim().toLowerCase();
}

export function isNfcUserCancel(error) {
  const message = normalizeMessage(error);
  return message.includes("scan cancelled") || message.includes("session was cancelled");
}

async function ensureLoaded() {
  if (soundRef) {
    return soundRef;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(FAILURE_CLANG);
      soundRef = sound;
      return sound;
    })().finally(() => {
      loadPromise = null;
    });
  }

  return loadPromise;
}

export async function playNfcFailureFeedback(error) {
  if (isNfcUserCancel(error)) {
    return;
  }

  try {
    const sound = await ensureLoaded();
    await sound.replayAsync();
  } catch {
    try {
      await soundRef?.unloadAsync();
    } catch {
      // no-op
    }

    soundRef = null;

    try {
      const { sound } = await Audio.Sound.createAsync(FAILURE_CLANG, {
        shouldPlay: true,
      });
      soundRef = sound;
    } catch {
      soundRef = null;
    }
  }
}

export async function unloadNfcFailureFeedback() {
  try {
    await soundRef?.unloadAsync();
  } catch {
    // no-op
  }
  soundRef = null;
}
