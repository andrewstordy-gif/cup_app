export const SESSION_TYPE_OPTIONS = [
  "Sourcing Decision",
  "Quality Control",
  "Product Development",
  "Training Session",
  "Other",
];

export const CUP_NUMBER_OPTIONS = [1, 2, 3, 4, 5];
export const PENDING_CONFLICT_ERROR = "PENDING_CUP_CONFLICT";

export function generateSessionUUID() {
  const randomUuid = globalThis?.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  // Fallback for environments where crypto.randomUUID is unavailable.
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

export function generateRecordId() {
  return generateSessionUUID();
}

export function formatSessionDisplayId(sessionUUID) {
  const compact = String(sessionUUID || "").replace(/-/g, "").toUpperCase();
  return `SESSION-${compact.slice(0, 8)}`;
}

export function formatSessionDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function normalizeCupUuid(value) {
  return String(value || "").trim().toUpperCase();
}

export function createPendingConflictError(message) {
  const error = new Error(message);
  error.code = PENDING_CONFLICT_ERROR;
  return error;
}

export function createSample(data = {}) {
  const parsedCupNumber = Number.parseInt(data.cupNumber, 10);
  const cupNumber = Number.isInteger(parsedCupNumber)
    ? Math.max(1, Math.min(5, parsedCupNumber))
    : 3;

  return {
    id: data.id || generateRecordId(),
    coffeeNameOrigin: data.coffeeNameOrigin || "",
    process: data.process || "",
    cupUUID: data.cupUUID || "",
    cupNumber,
  };
}

export function resolveCupUUIDFromReadResult(result) {
  const parsed = result?.parsed || {};
  const tag = result?.tag || {};

  if (parsed?.text2?.UUID || parsed?.text2?.uuid || parsed?.text2?.u) {
    return parsed.text2.UUID || parsed.text2.uuid || parsed.text2.u;
  }

  const rawCandidates = [
    parsed?.raw?.text2,
    parsed?.raw?.text1,
    parsed?.raw?.text3,
    parsed?.raw?.text4,
  ].filter(Boolean);

  for (const candidate of rawCandidates) {
    const upperMatch = String(candidate).match(/\"UUID\"\\s*:\\s*\"([^\"]+)\"/);
    if (upperMatch?.[1]) {
      return upperMatch[1];
    }

    const lowerMatch = String(candidate).match(/\"uuid\"\\s*:\\s*\"([^\"]+)\"/i);
    if (lowerMatch?.[1]) {
      return lowerMatch[1];
    }

    const compactMatch = String(candidate).match(/\"u\"\\s*:\\s*\"([^\"]+)\"/);
    if (compactMatch?.[1]) {
      return compactMatch[1];
    }
  }

  // Some platforms expose a low-level tag id as a byte array or string.
  if (Array.isArray(tag?.id) && tag.id.length > 0) {
    return tag.id
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  if (typeof tag?.id === "string" && tag.id.trim()) {
    return tag.id.trim().toUpperCase();
  }

  if (typeof tag?.identifier === "string" && tag.identifier.trim()) {
    return tag.identifier.trim().toUpperCase();
  }

  return null;
}
