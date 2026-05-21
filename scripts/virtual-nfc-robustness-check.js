#!/usr/bin/env node

const fs = require("fs");
const Module = require("module");
const path = require("path");
const { transformSync } = require("@babel/core");

const rootDir = path.resolve(__dirname, "..");

function requireAppModule(relativePath) {
  const filename = path.join(rootDir, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const { code } = transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

const {
  NFC_TAG_TYPES,
  classifyNfcTagReadResult,
  getNfcTagIdentifier,
  isSmartCupHardwareTag,
} = requireAppModule("src/services/nfcTagClassifier.js");
const {
  buildCompactSessionMetadata,
  doesMetadataMatchExpected,
  normalizeCupUuid,
  normalizePositiveInteger,
  resolveCupUUIDFromReadResult,
} = requireAppModule("src/features/cupping/constants/sessionDetails.js");

let failures = 0;

function assert(condition, message, detail) {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }

  failures += 1;
  console.error(`FAIL ${message}`);
  if (detail !== undefined) {
    console.error(JSON.stringify(detail, null, 2));
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseMetadata = {
  n: "Yellow",
  p: 4,
  y: 3,
  i: 4,
  z: 1,
  k: "#FFD43B",
  e: "Test",
  t: 1,
  d: 260519,
  u: "6mfboabcmtm6cv",
};

const baseSmartParsed = {
  raw: {
    text1: JSON.stringify({ s: 0 }),
    text2: JSON.stringify({ t: 238, m: 0, b: 0, u: "E00253674FD4718D" }),
    text3: JSON.stringify({ r: 40, a: 93, w: 240, c: 70, x: 3600, l: 100 }),
    text4: JSON.stringify(baseMetadata),
  },
  text1: { s: 0, state: 0 },
  text2: {
    t: 238,
    temp: 238,
    m: 0,
    time: 0,
    b: 0,
    battery: 0,
    u: "E00253674FD4718D",
    UUID: "E00253674FD4718D",
    uuid: "E00253674FD4718D",
  },
  text3: {
    r: 40,
    triggerTemp: 40,
    a: 93,
    maxStartTemp: 93,
    w: 240,
    brewTime: 240,
    c: 70,
    maxCupTemp: 70,
    x: 3600,
    maxTime: 3600,
    l: 100,
    ledBrightness: 100,
  },
  text4: {
    ...baseMetadata,
    coffeeName: "Yellow",
    coffeeProcess: 4,
    cupNumber: 3,
    samplesInSession: 4,
    sampleNumber: 1,
    sampleColour: "#FFD43B",
    sessionName: "Test",
    sessionType: 1,
    sessionDate: 260519,
    sessionUUID: "6mfboabcmtm6cv",
  },
};

function makeReadResult({ id = "E00253674FD4718D", parsed, recordCount, tag = {} }) {
  return {
    tag: { id, ...tag },
    parsed,
    recordCount,
  };
}

function classify(readResult) {
  return classifyNfcTagReadResult(readResult);
}

function buildExpectedMetadata(overrides = {}) {
  return buildCompactSessionMetadata({
    coffeeNameOrigin: "Yellow",
    process: 4,
    cupNumber: 3,
    samplesInSession: 4,
    sampleNumber: 1,
    sampleColour: "#FFD43B",
    sessionName: "Test",
    sessionType: 1,
    sessionDate: "19 May 2026",
    sessionUUID: "6mfboabcmtm6cv",
    ...overrides,
  });
}

function buildSmartAddSampleWritePayload(readResult, metadata) {
  const parsed = readResult?.parsed || {};
  return {
    metadataOnly: false,
    records: {
      text1: { ...(parsed.text1 || {}), state: 1 },
      text2: parsed.text2 || {},
      text3: parsed.text3 || {},
      text4: metadata,
    },
  };
}

function buildNtagAddSampleWritePayload(metadata) {
  return {
    metadataOnly: true,
    records: {
      text4: metadata,
    },
  };
}

function buildRepairSmartAddSampleWritePayload(readResult, metadata) {
  return {
    metadataOnly: false,
    records: {
      text1: { state: 1 },
      text2: { u: getNfcTagIdentifier(readResult?.tag), t: 0, m: 0, b: 0 },
      text3: { triggerTemp: 40, maxStartTemp: 93, brewTime: 240, maxCupTemp: 70, maxTime: 3600, ledBrightness: 100 },
      text4: metadata,
    },
  };
}

function verifyScannedCup({ readResult, expectedCupUUID, expectedMetadata }) {
  const parsed = readResult?.parsed || {};
  const tagClassification = classify(readResult);
  const isNtagCup =
    tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
    tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
    tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG;
  const detectedCupUUID = normalizeCupUuid(
    isNtagCup ? getNfcTagIdentifier(readResult?.tag) : resolveCupUUIDFromReadResult(readResult)
  );
  const actualMetadata =
    tagClassification.metadataPayload ||
    (parsed?.raw?.text4 ? JSON.parse(parsed.raw.text4) : parsed?.text4);

  return {
    detectedCupUUID,
    metadataMatches: doesMetadataMatchExpected(actualMetadata, expectedMetadata),
    classification: tagClassification.type,
    actualMetadata,
  };
}

const smartRead = makeReadResult({
  parsed: clone(baseSmartParsed),
  recordCount: 4,
});
const smartClassification = classify(smartRead);
assert(smartClassification.type === NFC_TAG_TYPES.SMART_CUP, "smart cup is classified as smart cup", smartClassification);
assert(isSmartCupHardwareTag(smartRead.tag), "smart cup hardware is detected from tag id");
assert(
  smartClassification.metadataPayload?.u === baseMetadata.u &&
    smartClassification.metadataPayload?.n === baseMetadata.n,
  "smart cup metadata is taken from NDEF4, not NDEF2",
  smartClassification.metadataPayload
);

const ntagRead = makeReadResult({
  id: "04A3A695D32A81",
  parsed: {
    raw: { text1: JSON.stringify(baseMetadata) },
    text1: clone(baseMetadata),
  },
  recordCount: 1,
});
const ntagClassification = classify(ntagRead);
assert(ntagClassification.type === NFC_TAG_TYPES.NTAG_CUP, "single-record NTAG metadata is classified as NTAG", ntagClassification);
assert(ntagClassification.metadataPayload?.u === baseMetadata.u, "single-record NTAG metadata is readable");
assert(!isSmartCupHardwareTag(ntagRead.tag), "NTAG hardware is not detected as smart cup hardware");

const emptySmartHardwareRead = makeReadResult({
  id: "E00253674FD4718D",
  parsed: {},
  recordCount: 0,
  tag: {
    icManufacturerCode: 2,
    icSerialNumber: "0253674FD4718D",
  },
});
assert(
  classify(emptySmartHardwareRead).type === NFC_TAG_TYPES.EMPTY_TAG && isSmartCupHardwareTag(emptySmartHardwareRead.tag),
  "empty read from smart cup hardware is detectable as a retry-only state",
  classify(emptySmartHardwareRead)
);

const staleNtagRead = makeReadResult({
  id: "04A3A695D32A81",
  parsed: {
    raw: {
      text1: JSON.stringify({ s: 1 }),
      text2: "{}",
      text3: "{}",
      text4: JSON.stringify(baseMetadata),
    },
    text1: { s: 1, state: 1 },
    text2: {},
    text3: {},
    text4: clone(baseMetadata),
  },
  recordCount: 4,
});
const staleNtagClassification = classify(staleNtagRead);
assert(
  staleNtagClassification.type === NFC_TAG_TYPES.NTAG_CUP,
  "stale NTAG with old state record is not misclassified as smart cup",
  staleNtagClassification
);

const emptyTag = makeReadResult({
  id: "04EMPTY",
  parsed: {},
  recordCount: 0,
});
assert(classify(emptyTag).type === NFC_TAG_TYPES.EMPTY_TAG, "empty tag is classified as empty tag");

const genericTag = makeReadResult({
  id: "04GENERIC",
  parsed: { raw: { text1: "Test" }, text1: null },
  recordCount: 1,
});
assert(classify(genericTag).type === NFC_TAG_TYPES.GENERIC_NDEF_TAG, "generic text tag is classified as generic NDEF tag");

const expectedMetadata = buildExpectedMetadata();
assert(doesMetadataMatchExpected(baseMetadata, expectedMetadata), "expected metadata matches compact NDEF4 payload");

const wrongColour = { ...baseMetadata, k: "#00A651" };
assert(!doesMetadataMatchExpected(wrongColour, expectedMetadata), "wrong sample colour fails metadata verification");

const wrongSession = { ...baseMetadata, u: "different-session" };
assert(!doesMetadataMatchExpected(wrongSession, expectedMetadata), "wrong session UUID fails metadata verification");

const wrongSampleNumber = { ...baseMetadata, z: 2 };
assert(!doesMetadataMatchExpected(wrongSampleNumber, expectedMetadata), "wrong sample number fails metadata verification");

const smartWritePayload = buildSmartAddSampleWritePayload(smartRead, expectedMetadata);
assert(smartWritePayload.records.text1.state === 1, "smart add-sample write sets cup state to ready");
assert(
  smartWritePayload.records.text2.UUID === "E00253674FD4718D" &&
    smartWritePayload.records.text3.brewTime === 240,
  "smart add-sample write preserves NDEF2 status and NDEF3 settings"
);

const ntagWritePayload = buildNtagAddSampleWritePayload(expectedMetadata);
assert(ntagWritePayload.metadataOnly === true, "NTAG add-sample write uses metadata-only mode");
assert(
  Object.keys(ntagWritePayload.records).join(",") === "text4",
  "NTAG add-sample write does not write smart-cup NDEF1-3 records",
  ntagWritePayload.records
);

const smartRepairPayload = buildRepairSmartAddSampleWritePayload(emptySmartHardwareRead, expectedMetadata);
assert(
  smartRepairPayload.metadataOnly === false &&
    smartRepairPayload.records.text1.state === 1 &&
    smartRepairPayload.records.text2.u === "E00253674FD4718D" &&
    smartRepairPayload.records.text3.brewTime === 240,
  "repair write for collapsed smart cup rebuilds four-record smart payload",
  smartRepairPayload
);

const verifySmart = verifyScannedCup({
  readResult: smartRead,
  expectedCupUUID: "E00253674FD4718D",
  expectedMetadata,
});
assert(
  verifySmart.detectedCupUUID === "E00253674FD4718D" && verifySmart.metadataMatches,
  "verify smart cup succeeds for matching UUID and metadata",
  verifySmart
);

const wrongCupRead = makeReadResult({
  id: "E00253674FD4718E",
  parsed: {
    ...clone(baseSmartParsed),
    text2: { ...clone(baseSmartParsed.text2), UUID: "E00253674FD4718E", uuid: "E00253674FD4718E", u: "E00253674FD4718E" },
  },
  recordCount: 4,
});
const verifyWrongCup = verifyScannedCup({
  readResult: wrongCupRead,
  expectedCupUUID: "E00253674FD4718D",
  expectedMetadata,
});
assert(
  verifyWrongCup.detectedCupUUID !== "E00253674FD4718D",
  "verify detects wrong physical smart cup",
  verifyWrongCup
);

assert(
  normalizePositiveInteger("", 4) === 4 && normalizePositiveInteger("4", 1) === 4,
  "sample count fallback behaves predictably"
);

if (failures > 0) {
  console.error(`\nVirtual NFC robustness check failed: ${failures} failure(s).`);
  process.exit(1);
}

console.log("\nVirtual NFC robustness check passed.");
