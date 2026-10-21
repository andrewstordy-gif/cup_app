import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateDomainId } from "../utils/secureIdentifiers";

const USER_PROFILE_STORAGE_KEY = "cup_app:r1_103:user_profile";
let profileQueue = Promise.resolve();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function serialized(operation) {
  const pending = profileQueue.then(operation);
  profileQueue = pending.catch(() => {});
  return pending;
}

async function readIdentityProfile() {
  const stored = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (stored === null) return null;
  let parsed;
  try { parsed = JSON.parse(stored); } catch { throw new Error("Local profile identity is unavailable. Existing sessions were not changed."); }
  if (!parsed || typeof parsed !== "object" || !UUID_PATTERN.test(parsed.uuid || "")) {
    throw new Error("Local profile identity is unavailable. Existing sessions were not changed.");
  }
  return normalizeProfile(parsed);
}

export function getLocalProfileIdentity() {
  return serialized(async () => (await readIdentityProfile())?.uuid ?? null);
}

export function getOrCreateLocalProfileIdentity() {
  return serialized(async () => {
    const existing = await readIdentityProfile();
    if (existing) return existing.uuid;
    const profile = { uuid: generateProfileUuid(), name: "", organisation: "", photoUri: "" };
    await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile.uuid;
  });
}

function generateProfileUuid() {
  return generateDomainId();
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
  return serialized(async () => {
  const existing = await readIdentityProfile();
  const nextProfile = {
    uuid: existing?.uuid || generateProfileUuid(),
    name: String(name || "").trim(),
    organisation: String(organisation || "").trim(),
    photoUri: String(photoUri || "").trim(),
  };

  await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
  return nextProfile;
  });
}
