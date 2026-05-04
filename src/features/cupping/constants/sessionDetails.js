export const SESSION_TYPE_OPTIONS = [
  { key: 1, label: "Sourcing Decision" },
  { key: 2, label: "Quality Control" },
  { key: 3, label: "Product Development" },
  { key: 4, label: "Training Session" },
  { key: 5, label: "Other" },
];

export const CUP_NUMBER_OPTIONS = [1, 2, 3, 4, 5];
export const PENDING_CONFLICT_ERROR = "PENDING_CUP_CONFLICT";
export const SAMPLE_COLOUR_OPTIONS = [
  { key: "green", label: "Green", hex: "#00A651" },
  { key: "yellow", label: "Yellow", hex: "#FFD43B" },
  { key: "blue", label: "Blue", hex: "#3478F6" },
  { key: "red", label: "Red", hex: "#FF3B30" },
  { key: "black", label: "Black", hex: "#111111" },
];
export const PROCESS_OPTIONS = [
  { key: 1, label: "Washed (Wet)", aliases: ["Washed"] },
  { key: 2, label: "Natural (Dry)", aliases: ["Natural"] },
  { key: 3, label: "Honey (Pulped Natural)", aliases: ["Honey"] },
  { key: 4, label: "White Honey" },
  { key: 5, label: "Yellow Honey" },
  { key: 6, label: "Red Honey" },
  { key: 7, label: "Black Honey" },
  { key: 8, label: "Anaerobic" },
  { key: 9, label: "Anaerobic Washed" },
  { key: 10, label: "Anaerobic Natural" },
  { key: 11, label: "Carbonic Maceration" },
  { key: 12, label: "Lactic Fermentation" },
  { key: 13, label: "Extended Fermentation" },
  { key: 14, label: "Hybrid" },
  { key: 15, label: "Semi-Washed" },
  { key: 16, label: "Pulped Natural" },
  { key: 17, label: "Double Fermentation" },
  { key: 18, label: "Reposado" },
  { key: 19, label: "Experimental" },
  { key: 20, label: "Yeast-Inoculated Fermentation" },
  { key: 21, label: "Thermal Shock" },
  { key: 22, label: "Co-Fermented" },
  { key: 23, label: "Enzymatic Processing" },
];

function normalizeProcessText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOptionText(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeSessionTypeKey(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && SESSION_TYPE_OPTIONS.some((option) => option.key === numeric)) {
    return numeric;
  }

  const normalized = normalizeOptionText(value);
  const option = SESSION_TYPE_OPTIONS.find((entry) => normalizeOptionText(entry.label) === normalized);
  return option?.key ?? null;
}

export function getSessionTypeLabel(value) {
  const key = normalizeSessionTypeKey(value);
  const option = SESSION_TYPE_OPTIONS.find((entry) => entry.key === key);
  return option?.label || String(value || "");
}

export function compactSessionTypeValue(value) {
  return normalizeSessionTypeKey(value) ?? String(value || "").trim();
}

export function normalizeProcessKey(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && PROCESS_OPTIONS.some((option) => option.key === numeric)) {
    return numeric;
  }

  const normalized = normalizeProcessText(value);
  const option = PROCESS_OPTIONS.find(
    (entry) =>
      normalizeProcessText(entry.label) === normalized ||
      (entry.aliases || []).some((alias) => normalizeProcessText(alias) === normalized)
  );

  return option?.key ?? null;
}

export function getProcessLabel(value) {
  const key = normalizeProcessKey(value);
  const option = PROCESS_OPTIONS.find((entry) => entry.key === key);
  return option?.label || String(value || "");
}

export function compactProcessValue(value) {
  return normalizeProcessKey(value) ?? String(value || "").trim();
}

export function normalizeSampleColour(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const option = SAMPLE_COLOUR_OPTIONS.find(
    (entry) =>
      entry.key === text.toLowerCase() ||
      entry.label.toLowerCase() === text.toLowerCase() ||
      entry.hex.toLowerCase() === text.toLowerCase()
  );

  if (option) {
    return option.hex;
  }

  const normalized = text.startsWith("#") ? text : `#${text}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : "";
}

export function normalizePositiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function generateSessionUUID() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(14);
  globalThis?.crypto?.getRandomValues?.(bytes);

  if (bytes.some((byte) => byte !== 0)) {
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  let id = "";
  for (let index = 0; index < 14; index += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
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

function parseDisplaySessionDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const numeric = Number.parseInt(text, 10);
  if (/^\d{6}$/.test(text) && Number.isInteger(numeric)) {
    const year = 2000 + Number.parseInt(text.slice(0, 2), 10);
    const month = Number.parseInt(text.slice(2, 4), 10);
    const day = Number.parseInt(text.slice(4, 6), 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  const displayMatch = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (displayMatch) {
    const monthNames = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const day = Number.parseInt(displayMatch[1], 10);
    const month = monthNames[displayMatch[2].toLowerCase()];
    const year = Number.parseInt(displayMatch[3], 10);
    if (Number.isInteger(day) && month !== undefined && Number.isInteger(year)) {
      return new Date(year, month, day);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function compactSessionDateValue(value) {
  const date = value instanceof Date ? value : parseDisplaySessionDate(value);
  if (!date) {
    return String(value || "").trim();
  }

  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return Number(`${year}${month}${day}`);
}

export function normalizeSessionDateForCompare(value) {
  const compact = compactSessionDateValue(value);
  return String(compact || "").trim();
}

export function getSessionDateLabel(value) {
  const date = parseDisplaySessionDate(value);
  return date ? formatSessionDate(date) : String(value || "");
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
    sampleNumber: normalizePositiveInteger(data.sampleNumber),
    sampleColour: normalizeSampleColour(data.sampleColour),
    verificationStatus: data.verificationStatus || "unverified",
  };
}

export function buildCompactSessionMetadata({
  coffeeNameOrigin,
  process,
  cupNumber,
  samplesInSession,
  sampleNumber,
  sampleColour,
  sessionName,
  sessionType,
  sessionDate,
  sessionUUID,
}) {
  return {
    n: String(coffeeNameOrigin || "").trim(),
    p: compactProcessValue(process),
    y: Number.isInteger(Number(cupNumber)) ? Number(cupNumber) : 3,
    ...(Number.isInteger(Number(samplesInSession)) ? { i: Number(samplesInSession) } : {}),
    ...(Number.isInteger(Number(sampleNumber)) ? { z: Number(sampleNumber) } : {}),
    ...(normalizeSampleColour(sampleColour) ? { k: normalizeSampleColour(sampleColour) } : {}),
    e: String(sessionName || "").trim(),
    t: compactSessionTypeValue(sessionType),
    d: compactSessionDateValue(sessionDate),
    u: String(sessionUUID || "").trim(),
  };
}

export function doesMetadataMatchExpected(actual, expected) {
  if (!actual || typeof actual !== "object") {
    return false;
  }

  return (
    String(actual.n || actual.coffeeName || "") === String(expected.n || "") &&
    String(compactProcessValue(actual.p ?? actual.coffeeProcess ?? "")) ===
      String(compactProcessValue(expected.p ?? "")) &&
    Number(actual.y ?? actual.cupNumber ?? 0) === Number(expected.y || 0) &&
    (expected.i === undefined ||
      Number(actual.i ?? actual.samplesInSession ?? 0) === Number(expected.i || 0)) &&
    (expected.z === undefined ||
      Number(actual.z ?? actual.sampleNumber ?? 0) === Number(expected.z || 0)) &&
    (expected.k === undefined ||
      normalizeSampleColour(actual.k ?? actual.sampleColour ?? "") === normalizeSampleColour(expected.k ?? "")) &&
    String(actual.e || actual.sessionName || "") === String(expected.e || "") &&
    String(compactSessionTypeValue(actual.t ?? actual.sessionType ?? "")) ===
      String(compactSessionTypeValue(expected.t ?? "")) &&
    normalizeSessionDateForCompare(actual.d ?? actual.sessionDate ?? "") ===
      normalizeSessionDateForCompare(expected.d ?? "") &&
    String(actual.u || actual.sessionUUID || "") === String(expected.u || "")
  );
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
