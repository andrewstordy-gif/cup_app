import AsyncStorage from "@react-native-async-storage/async-storage";

const USER_PROFILE_STORAGE_KEY = "cup_app:user_profile";

function generateProfileUuid() {
  const randomUuid = globalThis?.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

function normalizeProfile(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    uuid: String(value.uuid || "").trim(),
    name: String(value.name || "").trim(),
    organisation: String(value.organisation || "").trim(),
    photoUri: String(value.photoUri || "").trim(),
  };
}

export async function getUserProfile() {
  const stored = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return normalizeProfile(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveUserProfile({ name, organisation, photoUri } = {}) {
  const existing = await getUserProfile();
  const nextProfile = {
    uuid: existing?.uuid || generateProfileUuid(),
    name: String(name || "").trim(),
    organisation: String(organisation || "").trim(),
    photoUri: String(photoUri || "").trim(),
  };

  await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
  return nextProfile;
}
