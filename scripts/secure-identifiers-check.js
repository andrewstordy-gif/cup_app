#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { transformSync } = require("@babel/core");

const rootDir = path.resolve(__dirname, "..");
let randomValues = (bytes) => require("node:crypto").webcrypto.getRandomValues(bytes);
let existingSession = null;
let databaseWrites = 0;
let storedProfile = null;
let cryptoModuleAvailable = true;

const cryptoMock = {
  getRandomValues(bytes) {
    return randomValues(bytes);
  },
};

const db = {
  async getFirstAsync(sql, args) {
    if (sql.includes("FROM sessions WHERE id = ? OR session_uuid = ?")) {
      return existingSession ? { id: existingSession } : null;
    }
    return null;
  },
  async runAsync() {
    databaseWrites += 1;
  },
  async withTransactionAsync(callback) {
    return callback();
  },
};

function loadAppModule(relativePath, mocks = {}) {
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
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    mod._compile(code, filename);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const identifiers = loadAppModule("src/utils/secureIdentifiers.js");
const details = loadAppModule("src/features/cupping/constants/sessionDetails.js", {
  "../../../utils/secureIdentifiers": identifiers,
});
const repository = loadAppModule("src/data/sessionRepository.js", {
  "./localDatabase": { getLocalDatabase: async () => db },
  "../utils/secureIdentifiers": identifiers,
  "../features/cupping/constants/sessionDetails": details,
});
const profiles = loadAppModule("src/data/userProfileRepository.js", {
  "@react-native-async-storage/async-storage": {
    async getItem() { return storedProfile; },
    async setItem(_key, value) { storedProfile = value; },
  },
  "../utils/secureIdentifiers": identifiers,
});

async function main() {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const sessionPattern = /^[a-z0-9]{14}$/;
  for (let index = 0; index < 50; index += 1) {
    assert.match(identifiers.generateDomainId(), uuidPattern);
    assert.match(details.generateRecordId(), uuidPattern);
    const reference = details.generateSessionUUID();
    assert.match(reference, sessionPattern);
    assert.notEqual(reference, "NO-SESSION");
    assert.equal(details.buildCompactSessionMetadata({ sessionUUID: reference }).u, reference);
  }

  randomValues = (bytes) => bytes.fill(0);
  assert.equal(identifiers.generateSessionReference(), "0".repeat(14));
  randomValues = (bytes) => bytes.fill(251);
  assert.equal(identifiers.generateSessionReference(), "z".repeat(14));
  let batches = 0;
  randomValues = (bytes) => {
    batches += 1;
    return bytes.fill(batches === 1 ? 252 : 35);
  };
  assert.equal(identifiers.generateSessionReference(), "z".repeat(14));
  assert.equal(batches, 2);
  randomValues = (bytes) => bytes.fill(255);
  assert.throws(() => identifiers.generateSessionReference(), /Secure random generation is unavailable/);
  randomValues = () => { throw new Error("native module missing"); };
  assert.throws(() => details.generateSessionUUID(), /Secure random generation is unavailable/);
  assert.throws(() => details.generateRecordId(), /Secure random generation is unavailable/);
  cryptoModuleAvailable = false;
  assert.throws(() => details.generateSessionUUID(), /Secure random generation is unavailable/);
  cryptoModuleAvailable = true;
  await assert.rejects(
    profiles.saveUserProfile({ name: "No entropy" }),
    /Secure random generation is unavailable/
  );
  assert.equal(storedProfile, null, "failed profile creation must not be persisted");
  randomValues = (bytes) => require("node:crypto").webcrypto.getRandomValues(bytes);

  const createdProfile = await profiles.saveUserProfile({ name: "New" });
  assert.match(createdProfile.uuid, uuidPattern);
  storedProfile = JSON.stringify({ uuid: "legacy-profile-id", name: "Old" });
  assert.equal((await profiles.saveUserProfile({ name: "Updated" })).uuid, "legacy-profile-id");
  assert.equal(details.createSample({ id: "legacy-sample-id" }).id, "legacy-sample-id");

  const collision = "123456789abcde";
  existingSession = collision;
  await assert.rejects(
    repository.assertSessionReferenceAvailable(collision),
    /already in use/
  );
  await repository.assertSessionReferenceAvailable(collision, collision);
  await assert.rejects(
    repository.assertSessionReferenceAvailable(collision, "another-session"),
    /changed or is missing/
  );
  await assert.rejects(
    repository.saveSessionWithSamples({
      sessionUUID: collision,
      sessionName: "Collision",
      samples: [{ cupUUID: "CUP-1" }],
    }),
    /already in use/
  );
  assert.equal(databaseWrites, 0, "a colliding new session must never overwrite an existing row");
  const edited = await repository.saveSessionWithSamples({
    sessionUUID: collision,
    existingSessionId: collision,
    sessionName: "Existing session",
    samples: [{ id: "legacy-sample-id", cupUUID: "CUP-1" }],
  });
  assert.equal(edited.sessionId, collision);
  assert.ok(databaseWrites > 0, "an explicitly owned existing session remains editable");
  existingSession = null;
  await repository.assertSessionReferenceAvailable(collision);
  console.log("Secure identifier and local collision checks passed.");
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "expo-crypto") {
    if (!cryptoModuleAvailable) {
      throw new Error("ExpoCrypto is absent from the installed native client");
    }
    return cryptoMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoad;
  });
