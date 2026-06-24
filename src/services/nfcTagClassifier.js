export const NFC_TAG_TYPES = {
  SMART_CUP: "smart_cup",
  NTAG_CUP: "ntag_cup",
  GENERIC_NDEF_TAG: "generic_ndef_tag",
  EMPTY_TAG: "empty_tag",
  UNKNOWN: "unknown",
};

function safeJsonParse(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasAnyKey(value, keys) {
  if (!isObject(value)) {
    return false;
  }
  return keys.some((key) => value[key] !== undefined && value[key] !== null && value[key] !== "");
}

function hasNumericKey(value, keys) {
  if (!isObject(value)) {
    return false;
  }
  return keys.some((key) => {
    const numeric = Number.parseInt(value[key], 10);
    return Number.isFinite(numeric);
  });
}

function isSessionMetadataPayload(payload) {
  const hasSessionId = hasAnyKey(payload, ["sessionUUID", "u"]);
  const hasSessionShape = hasAnyKey(payload, [
    "coffeeName",
    "n",
    "coffeeProcess",
    "p",
    "cupNumber",
    "y",
    "samplesInSession",
    "i",
    "sampleNumber",
    "z",
    "sessionName",
    "e",
    "sessionType",
    "sessionDate",
    "d",
  ]);
  return hasSessionId && hasSessionShape;
}

export function findNdef4MetadataPayload(parsed) {
  const rawText4 = safeJsonParse(parsed?.raw?.text4);
  const text4Candidates = [parsed?.text4, rawText4].filter(isObject);
  const text4Payload = text4Candidates.find(isSessionMetadataPayload);
  if (text4Payload) {
    return text4Payload;
  }

  const rawText1 = safeJsonParse(parsed?.raw?.text1);
  const text1Candidates = [parsed?.text1, rawText1].filter(isObject);
  const hasOnlyMetadataRecord = !parsed?.text2 && !parsed?.text3 && !parsed?.text4;
  if (hasOnlyMetadataRecord) {
    return text1Candidates.find(isSessionMetadataPayload) || null;
  }

  return null;
}

export function classifyNfcTagReadResult(readResult) {
  const parsed = readResult?.parsed || {};
  const recordCount = Number(readResult?.recordCount) || 0;
  const hasSmartCupState = hasNumericKey(parsed?.text1, ["state", "s"]);
  const hasSmartCupUuid = hasAnyKey(parsed?.text2, ["UUID", "uuid", "u"]);
  const hasSmartCupConfig = hasAnyKey(parsed?.text3, ["brewTime", "w", "triggerTemp", "r"]);
  const metadataPayload = findNdef4MetadataPayload(parsed);

  // A state value on its own is not enough to identify a smart cup. Some
  // standard NTAG stickers can be left with stale NDEF1 state records, but they
  // should still be treated as app-owned metadata tags and identified by tag id.
  if (hasSmartCupUuid || hasSmartCupConfig) {
    return {
      type: NFC_TAG_TYPES.SMART_CUP,
      recordCount,
      supportsCupState: true,
      supportsTemperature: true,
      supportsBrewTimer: true,
      supportsSessionMetadata: true,
      metadataPayload,
      reason: "Smart cup NDEF records detected.",
    };
  }

  if (metadataPayload) {
    return {
      type: NFC_TAG_TYPES.NTAG_CUP,
      recordCount,
      supportsCupState: false,
      supportsTemperature: false,
      supportsBrewTimer: false,
      supportsSessionMetadata: true,
      metadataPayload,
      reason: "NDEF4-style session metadata detected without smart cup records.",
    };
  }

  if (recordCount === 0) {
    return {
      type: NFC_TAG_TYPES.EMPTY_TAG,
      recordCount,
      supportsCupState: false,
      supportsTemperature: false,
      supportsBrewTimer: false,
      supportsSessionMetadata: false,
      metadataPayload: null,
      reason: "No NDEF records detected.",
    };
  }

  if (getNfcTagIdentifier(readResult?.tag)) {
    return {
      type: NFC_TAG_TYPES.GENERIC_NDEF_TAG,
      recordCount,
      supportsCupState: false,
      supportsTemperature: false,
      supportsBrewTimer: false,
      supportsSessionMetadata: false,
      metadataPayload: null,
      reason: "Generic NDEF tag detected without cup metadata.",
    };
  }

  return {
    type: NFC_TAG_TYPES.UNKNOWN,
    recordCount,
    supportsCupState: false,
    supportsTemperature: false,
    supportsBrewTimer: false,
    supportsSessionMetadata: false,
    metadataPayload: null,
    reason: "NDEF records do not match a known cup format.",
  };
}

export function getNfcTagIdentifier(tag) {
  const rawId = tag?.id ?? tag?.identifier ?? tag?.serialNumber;
  if (Array.isArray(rawId)) {
    return rawId
      .map((value) => Number(value).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  return String(rawId || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function looksLikeSmartCupUuid(cupUUID) {
  const tagId = String(cupUUID || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return /^E0/.test(tagId);
}

export function isSmartCupHardwareTag(tag) {
  const tagId = getNfcTagIdentifier(tag);
  return Boolean(tag?.icManufacturerCode || tag?.icSerialNumber || looksLikeSmartCupUuid(tagId));
}
