import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { Platform } from "react-native";

let started = false;
let nfcOperationQueue = Promise.resolve();

const WRITE_BLOCK_FLAG = "__CUPPING_READ_ONLY_NFC_WRITE_BLOCK__";
const IOS_SESSION_SETTLE_MS = 260;
const NDEF_RETRY_DELAY_MS = 250;
const NDEF_RETRY_ATTEMPTS = 2;
const IOS_SESSION_ERROR_COOLDOWN_MS = 1000;
const WRITE_RETRY_DELAY_MS = 650;
const WRITE_RETRY_ATTEMPTS = 1;
let nextNfcSessionAllowedAt = 0;

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

function normalizeText1Payload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const state = payload.state ?? payload.s;
  return {
    ...payload,
    ...(state !== undefined ? { state } : {}),
  };
}

function normalizeText2Payload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
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

function normalizeText3Payload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
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

function normalizeText4Payload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
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

function compactText1Payload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const state = payload.state ?? payload.s;
  return state === undefined ? {} : { s: state };
}

function compactText2Payload(payload) {
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

function compactText3Payload(payload) {
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

function compactText4Payload(payload) {
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

function pickTextRecord(message, index) {
  if (!Array.isArray(message)) {
    return null;
  }

  return decodeTextRecord(message[index]);
}

export function parseNdefMessage(message) {
  const text1Raw = pickTextRecord(message, 0);
  const text2Raw = pickTextRecord(message, 1);
  const text3Raw = pickTextRecord(message, 2);
  const text4Raw = pickTextRecord(message, 3);

  return {
    text1: normalizeText1Payload(safeJsonParse(text1Raw)),
    text2: normalizeText2Payload(safeJsonParse(text2Raw)),
    text3: normalizeText3Payload(safeJsonParse(text3Raw)),
    text4: normalizeText4Payload(safeJsonParse(text4Raw)),
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

function buildTextRecordFromValue(value, compactFn) {
  if (typeof value === "string") {
    return Ndef.textRecord(value);
  }
  return buildTextRecord(compactFn(value));
}

export function buildNdefRecords(records) {
  const payload = records || {};
  return [
    buildTextRecordFromValue(payload.text1, compactText1Payload),
    buildTextRecordFromValue(payload.text2, compactText2Payload),
    buildTextRecordFromValue(payload.text3, compactText3Payload),
    buildTextRecordFromValue(payload.text4, compactText4Payload),
  ];
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

function normalizeNfcError(error, fallbackMessage) {
  const stack = String(error?.stack || "");
  if (stack.includes("UserCancel")) {
    return new Error("NFC read session was cancelled.");
  }
  if (stack.includes("SystemBusy")) {
    return new Error("NFC scanner is still busy closing the previous session.");
  }

  const message = String(error?.message || error || "").trim();
  if (!message) {
    return new Error(fallbackMessage);
  }
  return new Error(message);
}

function padTime(value, width = 2) {
  return String(value).padStart(width, "0");
}

function logTimestamp() {
  const now = new Date();
  return `${padTime(now.getHours())}:${padTime(now.getMinutes())}:${padTime(now.getSeconds())}.${padTime(now.getMilliseconds(), 3)}`;
}

function logNativeNfcError(stage, error) {
  const ts = logTimestamp();
  console.log(`${ts} NFC native error stage: ${stage}`);
  console.log(`${ts} NFC native error object:`, error);
  console.log(`${ts} NFC native error message:`, error?.message);
  console.log(`${ts} NFC native error code:`, error?.code);
  console.log(`${ts} NFC native error stack:`, error?.stack);
  try {
    console.log(`${ts} NFC native error property names:`, Object.getOwnPropertyNames(error || {}));
  } catch {
    console.log(`${ts} NFC native error property names: <unavailable>`);
  }
  try {
    console.log(`${ts} NFC native error JSON:`, JSON.stringify(error, null, 2));
  } catch {
    console.log(`${ts} NFC native error JSON: <unserializable>`);
  }
}

function logNfcEvent(stage, payload) {
  const ts = logTimestamp();
  if (payload === undefined) {
    console.log(`${ts} NFC ${stage}`);
    return;
  }

  console.log(`${ts} NFC ${stage}:`, payload);
}

function isRetryableWriteError(error) {
  const stack = String(error?.stack || "");
  return stack.includes("TagConnectionLost") || stack.includes("TagUpdateFailure");
}

function summarizeTag(tag) {
  if (!tag || typeof tag !== "object") {
    return { present: false };
  }

  const techTypes = Array.isArray(tag.techTypes) ? tag.techTypes : [];
  const ndefMessage = Array.isArray(tag.ndefMessage) ? tag.ndefMessage : [];

  return {
    present: true,
    id: tag.id ?? null,
    techTypes,
    type: tag.type ?? null,
    ndefStatus: tag.ndefStatus ?? null,
    maxSize: tag.maxSize ?? null,
    canMakeReadOnly: tag.canMakeReadOnly ?? null,
    ndefRecordCount: ndefMessage.length,
    keys: Object.keys(tag).sort(),
  };
}

function hasNdefMessage(tag) {
  return Array.isArray(tag?.ndefMessage);
}

async function waitForNfcSessionCooldown() {
  const now = Date.now();
  if (now >= nextNfcSessionAllowedAt) {
    return;
  }

  const delayMs = nextNfcSessionAllowedAt - now;
  logNfcEvent("waiting for session cooldown", { delayMs });
  await delay(delayMs);
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

async function requestNdefTechnology(alertMessage, invalidateAfterFirstRead) {
  try {
    await waitForNfcSessionCooldown();
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage,
      invalidateAfterFirstRead,
    });
  } catch (error) {
    const stack = String(error?.stack || "");
    if (stack.includes("UserCancel") || stack.includes("SystemBusy")) {
      nextNfcSessionAllowedAt = Date.now() + IOS_SESSION_ERROR_COOLDOWN_MS;
      logNfcEvent("session cooldown armed", {
        delayMs: IOS_SESSION_ERROR_COOLDOWN_MS,
      });
    }
    logNativeNfcError("requestTechnology", error);
    throw normalizeNfcError(error, "Unable to start NFC session.");
  }
}

async function getCurrentTag() {
  try {
    return await NfcManager.getTag();
  } catch (error) {
    logNativeNfcError("getTag", error);
    throw normalizeNfcError(error, "Unable to read NFC tag data.");
  }
}

async function getCurrentTagWithNdefRetry(stage) {
  let tag = await getCurrentTag();
  logNfcEvent(`${stage} tag summary`, summarizeTag(tag));

  if (hasNdefMessage(tag) || !tag?.id) {
    return tag;
  }

  for (let attempt = 1; attempt <= NDEF_RETRY_ATTEMPTS; attempt += 1) {
    logNfcEvent(`${stage} missing ndefMessage, retrying`, {
      id: tag.id,
      attempt,
      delayMs: NDEF_RETRY_DELAY_MS,
    });
    await delay(NDEF_RETRY_DELAY_MS);

    tag = await getCurrentTag();
    logNfcEvent(`${stage} retry tag summary`, {
      attempt,
      ...summarizeTag(tag),
    });

    if (hasNdefMessage(tag)) {
      return tag;
    }
  }

  return tag;
}

function encodeRecords(records) {
  let bytes;

  try {
    bytes = Ndef.encodeMessage(buildNdefRecords(records));
  } catch (error) {
    throw normalizeNfcError(error, "Unable to encode NDEF payload.");
  }

  if (!bytes) {
    throw new Error("Unable to encode NDEF payload.");
  }

  return bytes;
}

async function writeEncodedMessage(bytes) {
  for (let attempt = 0; attempt <= WRITE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      return;
    } catch (error) {
      logNativeNfcError("writeNdefMessage", error);

      const shouldRetry =
        attempt < WRITE_RETRY_ATTEMPTS && isRetryableWriteError(error);
      if (!shouldRetry) {
        throw normalizeNfcError(error, "Unable to write NDEF payload.");
      }

      logNfcEvent("write retry scheduled", {
        attempt: attempt + 1,
        delayMs: WRITE_RETRY_DELAY_MS,
      });
      await delay(WRITE_RETRY_DELAY_MS);
    }
  }
}

async function withNfcOperation(operation, fallbackMessage) {
  const runOperation = async () => {
    try {
      return await operation();
    } catch (error) {
      throw normalizeNfcError(error, fallbackMessage);
    } finally {
      await cancel();
      if (Platform.OS === "ios") {
        await delay(IOS_SESSION_SETTLE_MS);
      }
    }
  };

  const queuedOperation = nfcOperationQueue.then(runOperation, runOperation);
  nfcOperationQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

export async function readNdef() {
  return withNfcOperation(async () => {
    await start();
    logNfcEvent("read start");
    await requestNdefTechnology("Hold your phone near the cup to read NDEF.", false);
    const tag = await getCurrentTagWithNdefRetry("read");
    const ndefMessage = tag?.ndefMessage || [];
    const parsed = parseNdefMessage(ndefMessage);

    logNfcEvent("read result", {
      recordCount: ndefMessage.length,
      text1: parsed.text1,
      text2: parsed.text2,
      text3: parsed.text3,
      text4: parsed.text4,
    });

    await closeIosSessionNow();
    return {
      tag,
      parsed,
      recordCount: ndefMessage.length,
    };
  }, "Unable to scan cup.");
}

export async function writeNdef(records) {
  assertWriteAllowed();

  return withNfcOperation(async () => {
    await start();
    logNfcEvent("write start", records);
    await requestNdefTechnology("Hold your phone near the cup to write NDEF.", false);
    const bytes = encodeRecords(records);
    await writeEncodedMessage(bytes);
    logNfcEvent("write success", { byteLength: bytes.length });
    await closeIosSessionNow();
    return { ok: true };
  }, "Unable to write NFC tag.");
}

export async function readWriteNdef(recordsOrBuilder) {
  assertWriteAllowed();

  return withNfcOperation(async () => {
    await start();
    logNfcEvent("readWrite start");
    await requestNdefTechnology("Hold your phone near the cup to read and write NDEF.", false);

    const tag = await getCurrentTagWithNdefRetry("readWrite");
    const ndefMessage = tag?.ndefMessage || [];
    const parsed = parseNdefMessage(ndefMessage);
    logNfcEvent("readWrite read result", {
      recordCount: ndefMessage.length,
      text1: parsed.text1,
      text2: parsed.text2,
      text3: parsed.text3,
      text4: parsed.text4,
    });
    const nextRecords =
      typeof recordsOrBuilder === "function"
        ? await recordsOrBuilder(parsed, tag)
        : recordsOrBuilder;

    const bytes = encodeRecords(nextRecords || {});
    await writeEncodedMessage(bytes);
    logNfcEvent("readWrite write success", {
      byteLength: bytes.length,
      nextRecords: nextRecords || {},
    });
    await closeIosSessionNow();

    return {
      ok: true,
      tag,
      parsed,
      recordCount: ndefMessage.length,
    };
  }, "Unable to update cup via NFC.");
}

export async function cancel() {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // no-op
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
