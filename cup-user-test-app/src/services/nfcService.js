import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { Platform } from "react-native";

let started = false;
let nfcOperationInFlight = false;
let nfcOperationQueue = Promise.resolve();
const WRITE_BLOCK_FLAG = "__CUPPING_READ_ONLY_NFC_WRITE_BLOCK__";
const IOS_SESSION_SETTLE_MS = 260;

function createNfcStageError(stage, error, fallbackMessage) {
  const raw = String(error?.message || error || "").trim();
  const message = raw || fallbackMessage;
  const wrapped = new Error(message);
  wrapped.nfcStage = stage;
  wrapped.nfcCode = `NFC_${String(stage || "unknown").toUpperCase()}`;
  wrapped.nfcRawError = raw || null;
  wrapped.nfcFallbackMessage = fallbackMessage || null;
  return wrapped;
}

function assertWriteAllowed() {
  if (globalThis?.[WRITE_BLOCK_FLAG]) {
    throw new Error("NFC writes are disabled during cupping assessment.");
  }
}

function decodeTextRecord(record) {
  if (!record || record.tnf !== Ndef.TNF_WELL_KNOWN) {
    return null;
  }

  const type = record.type && Array.isArray(record.type) ? record.type : [];
  const isTextType = type.length === 1 && type[0] === 84; // "T"
  if (!isTextType) {
    return null;
  }

  try {
    return Ndef.text.decodePayload(record.payload);
  } catch {
    return null;
  }
}

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

function normalizeCtrlPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const state = payload.state ?? payload.s;
  return {
    ...payload,
    ...(state !== undefined ? { state } : {}),
  };
}

function normalizeStatusPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const temp = payload.temp ?? payload.t;
  const time = payload.time ?? payload.m ?? payload.tm ?? payload.ti;
  const battery = payload.battery ?? payload.b;
  const uuid = payload.UUID ?? payload.uuid ?? payload.u;

  return {
    ...payload,
    ...(temp !== undefined ? { temp } : {}),
    ...(time !== undefined ? { time } : {}),
    ...(battery !== undefined ? { battery } : {}),
    ...(uuid !== undefined ? { UUID: uuid, uuid } : {}),
  };
}

function normalizeSettingsPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const triggerTemp = payload.triggerTemp ?? payload.r;
  const maxStartTemp = payload.maxStartTemp ?? payload.a;
  const brewTime = payload.brewTime ?? payload.w;
  const maxCupTemp = payload.maxCupTemp ?? payload.c;
  const maxTime = payload.maxTime ?? payload.x;
  const ledBrightness = payload.ledBrightness ?? payload.l;

  return {
    ...payload,
    ...(triggerTemp !== undefined ? { triggerTemp } : {}),
    ...(maxStartTemp !== undefined ? { maxStartTemp } : {}),
    ...(brewTime !== undefined ? { brewTime } : {}),
    ...(maxCupTemp !== undefined ? { maxCupTemp } : {}),
    ...(maxTime !== undefined ? { maxTime } : {}),
    ...(ledBrightness !== undefined ? { ledBrightness } : {}),
  };
}

function normalizeAppPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const coffeeName = payload.coffeeName ?? payload.n;
  const coffeeProcess = payload.coffeeProcess ?? payload.p;
  const cupNumber = payload.cupNumber ?? payload.y;
  const sessionName = payload.sessionName ?? payload.e;
  const sessionType = payload.sessionType ?? payload.t;
  const sessionDate = payload.sessionDate ?? payload.d;
  const sessionUUID = payload.sessionUUID ?? payload.u;

  return {
    ...payload,
    ...(coffeeName !== undefined ? { coffeeName } : {}),
    ...(coffeeProcess !== undefined ? { coffeeProcess } : {}),
    ...(cupNumber !== undefined ? { cupNumber } : {}),
    ...(sessionName !== undefined ? { sessionName } : {}),
    ...(sessionType !== undefined ? { sessionType } : {}),
    ...(sessionDate !== undefined ? { sessionDate } : {}),
    ...(sessionUUID !== undefined ? { sessionUUID } : {}),
  };
}

function compactCtrlPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const state = payload.state ?? payload.s;
  return state === undefined ? {} : { s: state };
}

function compactStatusPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const temp = payload.t ?? payload.temp;
  const time = payload.m ?? payload.time ?? payload.tm;
  const battery = payload.b ?? payload.battery;
  const uuid = payload.u ?? payload.UUID ?? payload.uuid;
  return {
    ...(temp !== undefined ? { t: temp } : {}),
    ...(time !== undefined ? { m: time } : {}),
    ...(battery !== undefined ? { b: battery } : {}),
    ...(uuid !== undefined ? { u: uuid } : {}),
  };
}

function compactSettingsPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const triggerTemp = payload.r ?? payload.triggerTemp;
  const maxStartTemp = payload.a ?? payload.maxStartTemp;
  const brewTime = payload.w ?? payload.brewTime;
  const maxCupTemp = payload.c ?? payload.maxCupTemp;
  const maxTime = payload.x ?? payload.maxTime;
  const ledBrightness = payload.l ?? payload.ledBrightness;
  return {
    ...(triggerTemp !== undefined ? { r: triggerTemp } : {}),
    ...(maxStartTemp !== undefined ? { a: maxStartTemp } : {}),
    ...(brewTime !== undefined ? { w: brewTime } : {}),
    ...(maxCupTemp !== undefined ? { c: maxCupTemp } : {}),
    ...(maxTime !== undefined ? { x: maxTime } : {}),
    ...(ledBrightness !== undefined ? { l: ledBrightness } : {}),
  };
}

function compactAppPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const coffeeName = payload.n ?? payload.coffeeName;
  const coffeeProcess = payload.p ?? payload.coffeeProcess;
  const cupNumber = payload.y ?? payload.cupNumber;
  const sessionName = payload.e ?? payload.sessionName;
  const sessionType = payload.t ?? payload.sessionType;
  const sessionDate = payload.d ?? payload.sessionDate;
  const sessionUUID = payload.u ?? payload.sessionUUID;
  return {
    ...(coffeeName !== undefined ? { n: coffeeName } : {}),
    ...(coffeeProcess !== undefined ? { p: coffeeProcess } : {}),
    ...(cupNumber !== undefined ? { y: cupNumber } : {}),
    ...(sessionName !== undefined ? { e: sessionName } : {}),
    ...(sessionType !== undefined ? { t: sessionType } : {}),
    ...(sessionDate !== undefined ? { d: sessionDate } : {}),
    ...(sessionUUID !== undefined ? { u: sessionUUID } : {}),
  };
}

function valueToObject(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    return safeJsonParse(value) || {};
  }
  if (typeof value === "object") {
    return value;
  }
  return {};
}

function stringifySection(value) {
  return JSON.stringify(value || {});
}

function buildNormalizedSinglePayload(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const hasSingleSchema =
    value.v !== undefined ||
    value.ctrl !== undefined ||
    value.status !== undefined ||
    value.settings !== undefined ||
    value.app !== undefined;

  if (!hasSingleSchema) {
    return null;
  }

  const ctrl = normalizeCtrlPayload(valueToObject(value.ctrl));
  const status = normalizeStatusPayload(valueToObject(value.status));
  const settings = normalizeSettingsPayload(valueToObject(value.settings));
  const app = normalizeAppPayload(valueToObject(value.app));

  return {
    v: Number.isInteger(value.v) ? value.v : 1,
    ctrl,
    status,
    settings,
    app,
    text1: ctrl,
    text2: status,
    text3: settings,
    text4: app,
    raw: {
      single: JSON.stringify(value),
      text1: stringifySection(compactCtrlPayload(ctrl)),
      text2: stringifySection(compactStatusPayload(status)),
      text3: stringifySection(compactSettingsPayload(settings)),
      text4: stringifySection(compactAppPayload(app)),
    },
  };
}

function pickTextRecord(message, index) {
  if (!Array.isArray(message)) {
    return null;
  }

  const record = message[index];
  const text = decodeTextRecord(record);
  return text || null;
}

export function parseNdefMessage(message) {
  const firstTextRaw = pickTextRecord(message, 0);
  const firstPayload = safeJsonParse(firstTextRaw);
  const normalizedSinglePayload = buildNormalizedSinglePayload(firstPayload);

  if (normalizedSinglePayload) {
    return normalizedSinglePayload;
  }

  const text1Raw = pickTextRecord(message, 0);
  const text2Raw = pickTextRecord(message, 1);
  const text3Raw = pickTextRecord(message, 2);
  const text4Raw = pickTextRecord(message, 3);

  const parsedText1 = normalizeCtrlPayload(safeJsonParse(text1Raw));
  const parsedText2 = normalizeStatusPayload(safeJsonParse(text2Raw));
  const parsedText3 = normalizeSettingsPayload(safeJsonParse(text3Raw));
  const parsedText4 = normalizeAppPayload(safeJsonParse(text4Raw));

  return {
    v: 0,
    ctrl: parsedText1,
    status: parsedText2,
    settings: parsedText3,
    app: parsedText4,
    text1: parsedText1,
    text2: parsedText2,
    text3: parsedText3,
    text4: parsedText4,
    raw: {
      text1: text1Raw,
      text2: text2Raw,
      text3: text3Raw,
      text4: text4Raw,
    },
  };
}

function buildTextRecord(jsonObject) {
  return Ndef.textRecord(JSON.stringify(jsonObject || {}));
}

export function buildNdefRecords(records) {
  const payload = records || {};
  const normalizedSinglePayload = buildNormalizedSinglePayload(payload);

  const ctrl = normalizedSinglePayload
    ? normalizedSinglePayload.ctrl
    : normalizeCtrlPayload(valueToObject(payload.text1));
  const status = normalizedSinglePayload
    ? normalizedSinglePayload.status
    : normalizeStatusPayload(valueToObject(payload.text2));
  const settings = normalizedSinglePayload
    ? normalizedSinglePayload.settings
    : normalizeSettingsPayload(valueToObject(payload.text3));
  const app = normalizedSinglePayload
    ? normalizedSinglePayload.app
    : normalizeAppPayload(valueToObject(payload.text4));

  const singleRecord = {
    v: normalizedSinglePayload?.v ?? 1,
    ctrl: compactCtrlPayload(ctrl),
    status: compactStatusPayload(status),
    settings: compactSettingsPayload(settings),
    app: compactAppPayload(app),
  };

  return [buildTextRecord(singleRecord)];
}

export async function start() {
  if (started) {
    return { ok: true, alreadyStarted: true };
  }

  const supported = await NfcManager.isSupported();
  if (!supported) {
    throw new Error("NFC is not supported on this device.");
  }

  await NfcManager.start();
  started = true;
  return { ok: true, alreadyStarted: false };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function closeIosSessionNow() {
  if (Platform.OS !== "ios") {
    return;
  }
  try {
    await NfcManager.invalidateSessionIOS();
  } catch {
    // no-op
  }
}

function normalizeNfcError(error, fallbackMessage) {
  const raw = String(error?.message || error || "").trim();
  const lower = raw.toLowerCase();
  const stage = error?.nfcStage || null;
  const code = error?.nfcCode || null;
  const nativeRaw = error?.nfcRawError || raw || null;
  const fallback = error?.nfcFallbackMessage || fallbackMessage || null;
  const context = error?.nfcContext || null;

  const wrapNormalized = (message) => {
    const normalized = new Error(message);
    normalized.nfcStage = stage;
    normalized.nfcCode = code;
    normalized.nfcRawError = nativeRaw;
    normalized.nfcFallbackMessage = fallback;
    normalized.nfcContext = context;
    return normalized;
  };

  if (!raw || lower === "error") {
    return wrapNormalized(fallback || "Unexpected NFC error.");
  }

  if (lower.includes("cancelled") || lower.includes("canceled")) {
    return wrapNormalized("Scan cancelled.");
  }

  if (
    lower.includes("busy") ||
    lower.includes("one request at a time") ||
    lower.includes("duplicated registration") ||
    lower.includes("already registered")
  ) {
    return wrapNormalized("NFC session is busy. Please wait a moment and scan again.");
  }

  if (
    lower.includes("tag connection lost") ||
    lower.includes("tag was lost") ||
    lower.includes("session invalidated")
  ) {
    return wrapNormalized("NFC tag moved too quickly. Hold near cup and retry.");
  }

  return wrapNormalized(raw);
}

async function withNfcOperation(operation, fallbackMessage) {
  const runOperation = async () => {
    nfcOperationInFlight = true;
    try {
      return await operation();
    } catch (error) {
      throw normalizeNfcError(error, fallbackMessage);
    } finally {
      nfcOperationInFlight = false;
      await closeIosSessionNow();
      await cancel();
      if (Platform.OS === "ios") {
        // Prevent rapid back-to-back requestTechnology calls while iOS NFC
        // session teardown is still completing in native.
        await delay(IOS_SESSION_SETTLE_MS);
      }
    }
  };

  const queuedOperation = nfcOperationQueue.then(runOperation, runOperation);
  nfcOperationQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

export async function readNdef(options = {}) {
  const {
    maxAttempts = 2,
    retryDelayMs = 90,
    onRetry,
    maxRequestAttempts = 2,
  } = options;

  return withNfcOperation(async () => {
    await start();
    const requestAttempts = Math.max(1, Number.parseInt(maxRequestAttempts, 10) || 1);
    let technologyRequested = false;
    let lastRequestError = null;

    for (let reqAttempt = 1; reqAttempt <= requestAttempts; reqAttempt += 1) {
      try {
        await NfcManager.requestTechnology(NfcTech.Ndef, {
          alertMessage: "Hold your phone near the cup to read NDEF.",
          invalidateAfterFirstRead: true,
        });
        technologyRequested = true;
        break;
      } catch (error) {
        lastRequestError = createNfcStageError(
          "request_technology_read",
          error,
          "Unable to start NFC scan session."
        );
        if (reqAttempt < requestAttempts) {
          if (typeof onRetry === "function") {
            onRetry({
              attempt: reqAttempt,
              maxAttempts: requestAttempts,
              reason: "request_tech_error",
            });
          }
          await cancel();
          await delay(retryDelayMs);
          continue;
        }
      }
    }

    if (!technologyRequested) {
      throw lastRequestError || new Error("Unable to start NFC scan session.");
    }

    let lastTag = null;
    let lastRecordCount = 0;
    const attempts = Math.max(1, Number.parseInt(maxAttempts, 10) || 1);
    let lastGetTagError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let tag = null;
      let ndefMessage = [];
      let recordCount = 0;

      try {
        tag = await NfcManager.getTag();
        ndefMessage = tag?.ndefMessage || [];
        recordCount = ndefMessage.length;
        lastGetTagError = null;
      } catch (error) {
        lastGetTagError = createNfcStageError(
          "get_tag_read",
          error,
          "Unable to read NFC tag data."
        );
      }

      lastTag = tag;
      lastRecordCount = recordCount;

      if (recordCount > 0) {
        await closeIosSessionNow();
        return {
          tag,
          parsed: parseNdefMessage(ndefMessage),
          recordCount,
          attemptCount: attempt,
        };
      }

      if (attempt < attempts) {
        if (typeof onRetry === "function") {
          onRetry({
            attempt,
            maxAttempts: attempts,
            reason: lastGetTagError ? "get_tag_error" : "empty_ndef",
          });
        }
        await delay(retryDelayMs);
        continue;
      }

      if (lastGetTagError) {
        throw lastGetTagError;
      }
    }

    return {
      tag: lastTag,
      parsed: parseNdefMessage([]),
      recordCount: lastRecordCount,
      attemptCount: attempts,
    };
  }, "Unable to scan cup. Please try again.");
}

export async function writeNdef(records) {
  assertWriteAllowed();
  return withNfcOperation(async () => {
    await start();
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: "Hold your phone near the cup to write NDEF.",
        invalidateAfterFirstRead: false,
      });
    } catch (error) {
      throw createNfcStageError(
        "request_technology_write",
        error,
        "Unable to start NFC write session."
      );
    }

    const message = buildNdefRecords(records);
    let bytes;
    try {
      bytes = Ndef.encodeMessage(message);
    } catch (error) {
      throw createNfcStageError("encode_ndef_write", error, "Unable to encode NDEF payload.");
    }

    if (!bytes) {
      throw new Error("Unable to encode NDEF payload.");
    }

    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    } catch (error) {
      throw createNfcStageError("write_ndef", error, "Unable to write NDEF payload.");
    }
    await closeIosSessionNow();
    return { ok: true };
  }, "Unable to write NFC tag.");
}

export async function readWriteNdef(recordsOrBuilder) {
  assertWriteAllowed();
  return withNfcOperation(async () => {
    await start();
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: "Hold your phone near the cup to read and write NDEF.",
        invalidateAfterFirstRead: false,
      });
    } catch (error) {
      throw createNfcStageError(
        "request_technology_read_write",
        error,
        "Unable to start NFC read/write session."
      );
    }

    let tag;
    try {
      tag = await NfcManager.getTag();
    } catch (error) {
      throw createNfcStageError("get_tag_read_write", error, "Unable to read NFC tag data.");
    }
    const ndefMessage = tag?.ndefMessage || [];
    const parsed = parseNdefMessage(ndefMessage);

    const nextRecords =
      typeof recordsOrBuilder === "function"
        ? await recordsOrBuilder(parsed, tag)
        : recordsOrBuilder;

    const message = buildNdefRecords(nextRecords || {});
    let bytes;
    try {
      bytes = Ndef.encodeMessage(message);
    } catch (error) {
      throw createNfcStageError(
        "encode_ndef_read_write",
        error,
        "Unable to encode NDEF payload."
      );
    }

    if (!bytes) {
      throw new Error("Unable to encode NDEF payload.");
    }

    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    } catch (error) {
      throw createNfcStageError("write_ndef_read_write", error, "Unable to write NDEF payload.");
    }
    await closeIosSessionNow();

    const nextParsed = parseNdefMessage(message);

    return {
      ok: true,
      tag,
      parsed: nextParsed,
      recordCount: ndefMessage.length,
    };
  }, "Unable to update cup via NFC.");
}

export async function cancel() {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // no-op: request may already be closed
  }
}

export const sampleNdefPayload = {
  text1: {
    state: 1,
  },
  text2: {
    temp: 920,
    time: 260,
    battery: 95,
    UUID: "E00253674F2285E9",
  },
  text3: {
    triggerTemp: 40,
    maxStartTemp: 93,
    brewTime: 240,
    maxCupTemp: 70,
    maxTime: 1200,
    ledBrightness: 128,
  },
  text4: {
    coffeeName: "Ethiopia Yirgacheffe G1",
    coffeeProcess: "Natural",
    cupNumber: 3,
    sessionType: "Sourcing Decision",
    sessionName: "Morning Cupping",
    sessionDate: new Date().toISOString(),
    sessionUUID: "CUP-8291-XJ2",
  },
};
