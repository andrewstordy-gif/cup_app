const SESSION_REFERENCE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SESSION_REFERENCE_LENGTH = 14;
const MAX_UNBIASED_BYTE = 252; // 7 complete groups of 36 values.
const MAX_RANDOM_BATCHES = 10;

function secureBytes(length) {
  try {
    // Load when generation is requested so an older dev client without ExpoCrypto
    // can still render the app and show a safe creation error.
    const Crypto = require("expo-crypto");
    if (typeof Crypto.getRandomValues !== "function") {
      throw new Error("Missing secure random source");
    }
    const bytes = new Uint8Array(length);
    Crypto.getRandomValues(bytes);
    return bytes;
  } catch {
    throw new Error("Secure random generation is unavailable. Please restart or update Cup App.");
  }
}

export function generateDomainId() {
  const bytes = secureBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateSessionReference() {
  let reference = "";
  for (let batch = 0; batch < MAX_RANDOM_BATCHES && reference.length < SESSION_REFERENCE_LENGTH; batch += 1) {
    for (const byte of secureBytes(SESSION_REFERENCE_LENGTH - reference.length)) {
      if (byte < MAX_UNBIASED_BYTE) {
        reference += SESSION_REFERENCE_ALPHABET[byte % SESSION_REFERENCE_ALPHABET.length];
      }
    }
  }
  if (reference.length !== SESSION_REFERENCE_LENGTH) {
    throw new Error("Secure random generation is unavailable. Please restart or update Cup App.");
  }
  return reference;
}
