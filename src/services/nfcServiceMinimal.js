import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { Platform } from "react-native";

let started = false;
let nextNfcSessionAllowedAt = 0;

const NDEF_RETRY_DELAY_MS = 250;
const NDEF_RETRY_ATTEMPTS = 3;
const IOS_SESSION_SETTLE_MS = 260;
const IOS_SESSION_ERROR_COOLDOWN_MS = 1000;
const WRITE_RETRY_DELAY_MS = 900;
const WRITE_RETRY_ATTEMPTS = 1;
const WRITE_SESSION_SETTLE_MS = 150;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function padTime(value, width = 2) {
  return String(value).padStart(width, "0");
}

function logTimestamp() {
  const now = new Date();
  return `${padTime(now.getHours())}:${padTime(now.getMinutes())}:${padTime(now.getSeconds())}.${padTime(now.getMilliseconds(), 3)}`;
}

function logNfcEvent(stage, payload) {
  const ts = logTimestamp();
  if (payload === undefined) {
    console.log(`${ts} NFC minimal ${stage}`);
    return;
  }

  console.log(`${ts} NFC minimal ${stage}:`, payload);
}

function logNativeNfcError(stage, error) {
  const ts = logTimestamp();
  console.log(`${ts} NFC minimal error stage: ${stage}`);
  console.log(`${ts} NFC minimal error object:`, error);
  console.log(`${ts} NFC minimal error message:`, error?.message);
  console.log(`${ts} NFC minimal error code:`, error?.code);
  console.log(`${ts} NFC minimal error stack:`, error?.stack);
}

function byteToHex(value) {
  return Number(value).toString(16).padStart(2, "0");
}

function bytesToHex(bytes, limit = bytes?.length ?? 0) {
  if (!Array.isArray(bytes)) {
    return "";
  }

  return bytes
    .slice(0, limit)
    .map((value) => byteToHex(value))
    .join(" ");
}

function summarizeByteWindow(bytes, edgeSize = 12) {
  if (!Array.isArray(bytes)) {
    return {
      length: 0,
      headHex: "",
      tailHex: "",
    };
  }

  return {
    length: bytes.length,
    headHex: bytesToHex(bytes, Math.min(edgeSize, bytes.length)),
    tailHex: bytesToHex(bytes.slice(Math.max(0, bytes.length - edgeSize))),
  };
}

function summarizeRecordForDebug(record) {
  const payload = Array.isArray(record?.payload) ? record.payload : [];
  const typeBytes = Array.isArray(record?.type)
    ? record.type
    : typeof record?.type === "string"
      ? Array.from(record.type).map((char) => char.charCodeAt(0))
      : [];
  const idBytes = Array.isArray(record?.id) ? record.id : [];
  const isShortRecord = payload.length < 0xff;
  const encodedLength =
    1 + // tnf/header
    1 + // type length
    (isShortRecord ? 1 : 4) + // payload length field
    (idBytes.length > 0 ? 1 : 0) + // id length field when present
    typeBytes.length +
    idBytes.length +
    payload.length;

  return {
    tnf: record?.tnf ?? null,
    type: Array.isArray(record?.type) ? bytesToHex(record.type) : record?.type ?? null,
    typeLength: typeBytes.length,
    idLength: idBytes.length,
    payloadLength: payload.length,
    encodedLength,
    payloadHeadHex: bytesToHex(payload, Math.min(12, payload.length)),
    payloadTailHex: bytesToHex(payload.slice(Math.max(0, payload.length - 12))),
  };
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

function isSessionCooldownError(error) {
  const stack = String(error?.stack || "");
  return stack.includes("UserCancel") || stack.includes("SystemBusy");
}

function isRetryableWriteError(error) {
  const stack = String(error?.stack || "");
  return stack.includes("TagConnectionLost") || stack.includes("TagUpdateFailure");
}

function decodeTextRecord(record) {
  if (!record || record.tnf !== Ndef.TNF_WELL_KNOWN) {
    return null;
  }

  const type = Array.isArray(record.type) ? record.type : [];
  const isTextType = type.length === 1 && type[0] === 84;
  if (!isTextType) {
    return null;
  }

  try {
    return Ndef.text.decodePayload(record.payload);
  } catch {
    return null;
  }
}

function getRecordAt(message, index) {
  if (!Array.isArray(message)) {
    return null;
  }

  return message[index] || null;
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
  const samplesInSession = payload.samplesInSession ?? payload.i;
  const sampleNumber = payload.sampleNumber ?? payload.z;
  const sampleColour = payload.sampleColour ?? payload.k;
  const sessionName = payload.sessionName ?? payload.e;
  const sessionType = payload.sessionType ?? payload.t;
  const sessionDate = payload.sessionDate ?? payload.d;
  const sessionUUID = payload.sessionUUID ?? payload.u;

  return {
    ...payload,
    ...(coffeeName !== undefined ? { coffeeName } : {}),
    ...(coffeeProcess !== undefined ? { coffeeProcess } : {}),
    ...(cupNumber !== undefined ? { cupNumber } : {}),
    ...(samplesInSession !== undefined ? { samplesInSession } : {}),
    ...(sampleNumber !== undefined ? { sampleNumber } : {}),
    ...(sampleColour !== undefined ? { sampleColour } : {}),
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
  const samplesInSession = payload.i ?? payload.samplesInSession;
  const sampleNumber = payload.z ?? payload.sampleNumber;
  const sampleColour = payload.k ?? payload.sampleColour;
  const sessionName = payload.e ?? payload.sessionName;
  const sessionType = payload.t ?? payload.sessionType;
  const sessionDate = payload.d ?? payload.sessionDate;
  const sessionUUID = payload.u ?? payload.sessionUUID;

  return {
    ...(coffeeName !== undefined ? { n: coffeeName } : {}),
    ...(coffeeProcess !== undefined ? { p: coffeeProcess } : {}),
    ...(cupNumber !== undefined ? { y: cupNumber } : {}),
    ...(samplesInSession !== undefined ? { i: samplesInSession } : {}),
    ...(sampleNumber !== undefined ? { z: sampleNumber } : {}),
    ...(sampleColour !== undefined ? { k: sampleColour } : {}),
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

export function parseNdefMessageMinimal(message) {
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

function buildExactTextRecord(text) {
  return Ndef.record(
    Ndef.TNF_WELL_KNOWN,
    Ndef.RTD_TEXT,
    [],
    Ndef.text.encodePayload(text, "en"),
  );
}

export function buildNdefRecordsMinimal(records) {
  const text1 = JSON.stringify(compactText1Payload(records?.text1));
  const text2 = JSON.stringify(compactText2Payload(records?.text2));
  const text3 = JSON.stringify(compactText3Payload(records?.text3));
  const text4 = JSON.stringify(compactText4Payload(records?.text4));

  return [
    buildExactTextRecord(text1),
    buildExactTextRecord(text2),
    buildExactTextRecord(text3),
    buildExactTextRecord(text4),
  ];
}

function buildExactTextPayloads(records) {
  return {
    text1: JSON.stringify(compactText1Payload(records?.text1)),
    text2: JSON.stringify(compactText2Payload(records?.text2)),
    text3: JSON.stringify(compactText3Payload(records?.text3)),
    text4: JSON.stringify(compactText4Payload(records?.text4)),
  };
}

function buildSingleMetadataDiagnosticRecords(records) {
  const exactPayloads = buildExactTextPayloads(records);
  return [buildExactTextRecord(exactPayloads.text4)];
}

function buildDebugSummaryFromBuiltRecords(builtRecords) {
  const encodedMessage = Ndef.encodeMessage(builtRecords) || [];
  const recordSummaries = builtRecords.map((record, index) => ({
    index: index + 1,
    ...summarizeRecordForDebug(record),
  }));

  return {
    encodedMessageLength: encodedMessage.length,
    encodedMessageHeadHex: bytesToHex(encodedMessage, Math.min(18, encodedMessage.length)),
    encodedMessageTailHex: bytesToHex(encodedMessage.slice(Math.max(0, encodedMessage.length - 18))),
    recordSummaries,
  };
}

function buildDebugNdefSummary(records) {
  return buildDebugSummaryFromBuiltRecords(buildNdefRecordsMinimal(records));
}

export async function startMinimal() {
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

async function waitForNfcSessionCooldown() {
  const now = Date.now();
  if (now >= nextNfcSessionAllowedAt) {
    return;
  }

  const delayMs = nextNfcSessionAllowedAt - now;
  logNfcEvent("waiting for session cooldown", { delayMs });
  await delay(delayMs);
}

async function requestNdefTechnology(alertMessage) {
  try {
    await waitForNfcSessionCooldown();
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage,
      invalidateAfterFirstRead: false,
    });
  } catch (error) {
    if (isSessionCooldownError(error)) {
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

function summarizeTag(tag) {
  if (!tag || typeof tag !== "object") {
    return { present: false };
  }

  const ndefMessage = Array.isArray(tag.ndefMessage) ? tag.ndefMessage : [];
  return {
    present: true,
    id: tag.id ?? null,
    ndefRecordCount: ndefMessage.length,
    keys: Object.keys(tag).sort(),
  };
}

async function getCurrentTagWithRetry(stage) {
  let tag = await getCurrentTag();
  logNfcEvent(`${stage} tag summary`, summarizeTag(tag));

  if (Array.isArray(tag?.ndefMessage) || !tag?.id) {
    return tag;
  }

  for (let attempt = 1; attempt <= NDEF_RETRY_ATTEMPTS; attempt += 1) {
    logNfcEvent(`${stage} missing ndefMessage, retrying`, {
      attempt,
      delayMs: NDEF_RETRY_DELAY_MS,
      id: tag.id,
    });
    await delay(NDEF_RETRY_DELAY_MS);
    tag = await getCurrentTag();
    logNfcEvent(`${stage} retry tag summary`, {
      attempt,
      ...summarizeTag(tag),
    });
    if (Array.isArray(tag?.ndefMessage)) {
      return tag;
    }
  }

  return tag;
}

function encodeRecords(records) {
  try {
    const bytes = Ndef.encodeMessage(buildNdefRecordsMinimal(records));
    if (!bytes) {
      throw new Error("Unable to encode NDEF payload.");
    }
    return bytes;
  } catch (error) {
    throw normalizeNfcError(error, "Unable to encode NDEF payload.");
  }
}

function encodeBuiltRecords(builtRecords) {
  try {
    const bytes = Ndef.encodeMessage(builtRecords);
    if (!bytes) {
      throw new Error("Unable to encode NDEF payload.");
    }
    return bytes;
  } catch (error) {
    throw normalizeNfcError(error, "Unable to encode NDEF payload.");
  }
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

async function writeEncodedNdefBytes(bytes, alertMessage) {
  await requestNdefTechnology(alertMessage);
  await delay(WRITE_SESSION_SETTLE_MS);

  let writeSucceeded = false;
  for (let attempt = 0; attempt <= WRITE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      writeSucceeded = true;
      break;
    } catch (error) {
      logNativeNfcError("writeNdefMessage", error);
      const shouldRetry =
        attempt < WRITE_RETRY_ATTEMPTS && isRetryableWriteError(error);
      if (!shouldRetry) {
        throw error;
      }

      logNfcEvent("write retry scheduled", {
        attempt: attempt + 1,
        delayMs: WRITE_RETRY_DELAY_MS,
      });
      await delay(WRITE_RETRY_DELAY_MS);
    }
  }

  if (!writeSucceeded) {
    throw new Error("Unable to write NFC tag.");
  }
}

export async function cancelMinimal() {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // no-op
  }
}

export async function readNdefMinimal() {
  try {
    await startMinimal();
    logNfcEvent("read start");
    await requestNdefTechnology("Hold your phone near the cup to read NDEF.");
    const tag = await getCurrentTagWithRetry("read");
    const ndefMessage = Array.isArray(tag?.ndefMessage) ? tag.ndefMessage : [];
    const parsed = parseNdefMessageMinimal(ndefMessage);
    const recordDebugs = ndefMessage.map((record, index) => ({
      index: index + 1,
      ...summarizeRecordForDebug(record),
    }));
    const record4Debug = getRecordAt(recordDebugs, 3);

    logNfcEvent("read result", {
      recordCount: ndefMessage.length,
      text1: parsed.text1,
      text2: parsed.text2,
      text3: parsed.text3,
      text4: parsed.text4,
      rawText1: parsed?.raw?.text1 ?? null,
      rawText1Length: typeof parsed?.raw?.text1 === "string" ? parsed.raw.text1.length : 0,
      rawText4: parsed?.raw?.text4 ?? null,
      rawText4Length: typeof parsed?.raw?.text4 === "string" ? parsed.raw.text4.length : 0,
      recordDebugs,
      record4Debug:
        parsed?.raw?.text4 == null
          ? record4Debug
          : {
              payloadLength: record4Debug.payloadLength,
              encodedLength: record4Debug.encodedLength,
            },
    });

    await closeIosSessionNow();
    return {
      tag,
      parsed,
      recordCount: ndefMessage.length,
    };
  } catch (error) {
    throw normalizeNfcError(error, "Unable to scan cup.");
  } finally {
    await cancelMinimal();
    if (Platform.OS === "ios") {
      await delay(IOS_SESSION_SETTLE_MS);
    }
  }
}

export async function writeNdefMinimal(records) {
  try {
    await startMinimal();
    const exactPayloads = buildExactTextPayloads(records || {});
    const compactPreview = {
      text1: compactText1Payload(records?.text1),
      text2: compactText2Payload(records?.text2),
      text3: compactText3Payload(records?.text3),
      text4: compactText4Payload(records?.text4),
    };
    const debugSummary = buildDebugNdefSummary(records || {});
    logNfcEvent("write start", {
      compactPreview,
      exactText4: exactPayloads.text4,
      exactText4Length: exactPayloads.text4.length,
      encodedMessageLength: debugSummary.encodedMessageLength,
      encodedMessageHeadHex: debugSummary.encodedMessageHeadHex,
      encodedMessageTailHex: debugSummary.encodedMessageTailHex,
      record1Debug: debugSummary.recordSummaries[0],
      record2Debug: debugSummary.recordSummaries[1],
      record3Debug: debugSummary.recordSummaries[2],
      record4Debug: debugSummary.recordSummaries[3],
    });
    const bytes = encodeRecords(records || {});
    await writeEncodedNdefBytes(
      bytes,
      "Hold your phone near the cup to write NDEF.",
    );
    logNfcEvent("write success", { byteLength: bytes.length, compactPreview });
    await closeIosSessionNow();
    return { ok: true, compactPreview };
  } catch (error) {
    throw normalizeNfcError(error, "Unable to write NFC tag.");
  } finally {
    await cancelMinimal();
    if (Platform.OS === "ios") {
      await delay(IOS_SESSION_SETTLE_MS);
    }
  }
}

export async function writeSingleRecordMetadataDiagnosticMinimal(records) {
  try {
    await startMinimal();
    const safeRecords = records || {};
    const exactPayloads = buildExactTextPayloads(safeRecords);
    const compactPreview = {
      text1: compactText1Payload(safeRecords?.text1),
      text2: compactText2Payload(safeRecords?.text2),
      text3: compactText3Payload(safeRecords?.text3),
      text4: compactText4Payload(safeRecords?.text4),
    };
    const builtRecords = buildSingleMetadataDiagnosticRecords(safeRecords);
    const debugSummary = buildDebugSummaryFromBuiltRecords(builtRecords);
    logNfcEvent("write metadata-only start", {
      compactPreview,
      exactText4: exactPayloads.text4,
      exactText4Length: exactPayloads.text4.length,
      encodedMessageLength: debugSummary.encodedMessageLength,
      encodedMessageHeadHex: debugSummary.encodedMessageHeadHex,
      encodedMessageTailHex: debugSummary.encodedMessageTailHex,
      record1Debug: debugSummary.recordSummaries[0],
    });
    const bytes = encodeBuiltRecords(builtRecords);
    await writeEncodedNdefBytes(
      bytes,
      "Hold your phone near the cup to write the session metadata.",
    );
    logNfcEvent("write metadata-only success", {
      byteLength: bytes.length,
      compactPreview,
    });
    await closeIosSessionNow();
    return { ok: true, compactPreview };
  } catch (error) {
    throw normalizeNfcError(error, "Unable to write session metadata to NFC tag.");
  } finally {
    await cancelMinimal();
    if (Platform.OS === "ios") {
      await delay(IOS_SESSION_SETTLE_MS);
    }
  }
}

export async function writeNdefMetadataOnlyMinimal(records) {
  return writeSingleRecordMetadataDiagnosticMinimal(records);
}
