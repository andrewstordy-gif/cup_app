#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
const bridge = {
  async execAsync(sql) { sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) { return sqlite.prepare(sql).run(...args); },
  async withExclusiveTransactionAsync(callback) { return bridge.withTransactionAsync(() => callback(bridge)); },
  async withTransactionAsync(callback) {
    sqlite.exec('BEGIN');
    try { const result = await callback(); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const load = require('./helpers/load-project-module')(root, {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
  '../../../utils/secureIdentifiers': { generateDomainId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  '../utils/secureIdentifiers': { generateDomainId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
});
const details = load('src/features/cupping/constants/sessionDetails.js');
const repo = load('src/data/sessionRepository.js');
const { projectSavedSessionIdentity } = load('src/features/cupping/screens/savedSessionIdentity.js');
const { projectActiveSessionIdentity, buildActiveSessionShareMessage } = load('src/features/cupping/screens/activeSessionIdentity.js');
const diagnosticLogs = [];
const Ndef = {
  TNF_WELL_KNOWN: 1, RTD_TEXT: [84],
  text: {
    encodePayload: text => [...Buffer.from(text)],
    decodePayload: payload => Buffer.from(payload).toString(),
  },
  record: (tnf, type, id, payload) => ({ tnf, type, id, payload }),
  encodeMessage: records => [...Buffer.from(JSON.stringify(records))],
};
let nativeTag;
let nativeFailure = null;
let nativeWrites = 0;
const transport = {
  isSupported: async () => true, start: async () => {},
  requestTechnology: async () => {}, cancelTechnologyRequest: async () => {},
  getTag: async () => { if (nativeFailure) throw nativeFailure; return nativeTag; },
  ndefHandler: { writeNdefMessage: async () => { nativeWrites++; if (nativeFailure) throw nativeFailure; } },
};
const nfc = require('./helpers/load-project-module')(root, {
  'react-native-nfc-manager': { __esModule: true, default: transport, Ndef, NfcTech: { Ndef: 'Ndef' } },
  'react-native': { Platform: { OS: 'android' } },
})('src/services/nfcServiceMinimal.js');
function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  // The import API and SQLite are real; only the native SQLite adapter is bridged.
  const uuid = 'abcdef12345678';
  const secretType = 'SECRET KENYA TYPE';
  const secretDate = 'SECRET ETHIOPIA DATE';
  await repo.resolveActiveSampleFromCupMetadata({ cupUUID: '04ABCDEF123456', metadata: {
    f: 1, m: 'b', u: uuid, e: 'SECRET SESSION', n: 'SECRET COFFEE', p: 1,
    y: 5, z: 1, i: 1, t: secretType, d: secretDate,
  } });
  const loaded = await repo.getSessionById(uuid);
  assert.equal(loaded.sessionType, secretType, 'raw imported type remains in SQLite');
  assert.equal(loaded.sessionDate, secretDate, 'raw imported date remains in SQLite');
  assert.equal(loaded.sessionName, 'SECRET SESSION');
  const saved = projectSavedSessionIdentity(loaded, { allowOpen: true });
  const active = projectActiveSessionIdentity(loaded, loaded.samples, { allowOpen: true });
  assert.equal(saved.sessionType, 'Type unavailable');
  assert.equal(saved.sessionDate, 'Date unavailable');
  assert.equal(saved.sessionName, 'SECRET SESSION', 'session name is visible metadata independent of blind coffee identity');
  assert.equal(active.session.sessionName, 'SECRET SESSION');
  for (const output of [JSON.stringify(saved), JSON.stringify(active), buildActiveSessionShareMessage(active.session, active.cups)]) {
    for (const value of [secretType, secretDate, 'SECRET COFFEE']) assert.ok(!output.includes(value));
  }
  for (const value of [null, undefined, {}, [], true, false, NaN, Infinity, '0x1', '1e0', '1 SECRET', secretType]) {
    assert.equal(details.getSessionTypeDisplayLabel(value), 'Type unavailable');
  }
  for (const option of details.SESSION_TYPE_OPTIONS) {
    for (const value of [option.key, String(option.key), option.label]) assert.equal(details.getSessionTypeDisplayLabel(value), option.label);
  }
  for (const value of [null, undefined, {}, [], true, false, NaN, Infinity,
    secretDate, 'SECRET COFFEE 2026', '15 Oct 2026 SECRET', '31 Feb 2026', '29 Feb 2025', '260231', 260231,
    '00 Oct 2026', '32 Jan 2026', '261301', '2026-10-15 SECRET', '16 Ethiopian 2026']) {
    assert.equal(details.getSessionDateDisplayLabel(value), 'Date unavailable', `reject malformed date ${String(value)}`);
  }
  for (const value of ['261015', 261015, '15 Oct 2026']) assert.equal(details.getSessionDateDisplayLabel(value), '15 Oct 2026');
  assert.equal(details.getSessionDateDisplayLabel('29 Feb 2024'), '29 Feb 2024');
  assert.equal(details.getSessionDateDisplayLabel(240229), '29 Feb 2024');
  for (let month = 0; month < 12; month++) {
    const canonical = details.formatSessionDate(new Date(2026, month, 1, 12));
    const compact = Number(`26${String(month + 1).padStart(2, '0')}01`);
    for (const input of [canonical, compact, String(compact)]) {
      const firstPass = details.getSessionDateDisplayLabel(input);
      assert.equal(firstPass, canonical, `month ${month + 1} retains its canonical display`);
      assert.equal(details.getSessionDateDisplayLabel(firstPass), canonical, 'display normalization is idempotent');
      const view = projectActiveSessionIdentity({ ...loaded, sessionDate: input }, loaded.samples, { allowOpen: true });
      assert.match(buildActiveSessionShareMessage(view.session, view.cups), new RegExp(`Date: ${canonical}`),
        'Active projection date remains valid when passed to share');
    }
  }
  assert.equal(details.getSessionDateDisplayLabel('1 Sep 2026'), details.formatSessionDate(new Date(2026, 8, 1, 12)));
  for (const value of ['1 SeptemberSECRET 2026', '1 SeptSECRET 2026', 'SECRET 1 Sept 2026', '1 Sept 2026 SECRET']) {
    assert.equal(details.getSessionDateDisplayLabel(value), 'Date unavailable');
  }

  const records = { text1: { s: 1 }, text2: { u: '04ABCDEF123456' }, text3: {}, text4: {
    f: 1, m: 'b', u: uuid, e: 'SECRET SESSION', n: 'SECRET COFFEE', p: 1, y: 5,
  } };
  nativeTag = { id: '04ABCDEF123456', ndefMessage: nfc.buildNdefRecordsMinimal(records) };
  const originalLog = console.log;
  console.log = (...args) => diagnosticLogs.push(args);
  try {
    const read = await nfc.readNdefMinimal();
    assert.equal(read.parsed.text4.coffeeName, 'SECRET COFFEE', 'raw returned protocol remains intact');
    await nfc.writeNdefMinimal(records);
    await nfc.writeNdefMetadataOnlyMinimal(records);
    await nfc.readAndWriteNdefMinimal(async () => ({ records }));
    await nfc.readAndWriteNdefMinimal(async () => ({ records: { text4: records.text4 }, metadataOnly: true }));
    nativeFailure = new Error('SECRET NATIVE ERROR');
    nativeFailure.code = 'SECRET NATIVE CODE';
    await assert.rejects(nfc.readNdefMinimal());
    await assert.rejects(nfc.writeNdefMinimal(records));
    nativeFailure = null;
  } finally {
    console.log = originalLog;
  }
  assert.equal(nativeWrites, 5);
  const ordinaryLogs = JSON.stringify(diagnosticLogs);
  for (const value of ['SECRET', '04ABCDEF123456', uuid, Buffer.from('SECRET').toString('hex')]) {
    assert.ok(!ordinaryLogs.includes(value), `native diagnostic leaked ${value}`);
  }
  assert.ok(diagnosticLogs.some(args => String(args[0]).includes('read result')));
  assert.ok(diagnosticLogs.some(args => String(args[0]).includes('metadata-only')));

  // Execute the actual screen callback, including its write-preparation boundary
  // and catch/logger arguments, against the real duplicate lookup above.
  const source = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingSessionDetailsScreen.js'), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const declaration = findNode(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'handleScanCup');
  assert.ok(declaration);
  const logArguments = [];
  const statuses = [];
  let blocked;
  let written = false;
  let persisted = false;
  const setupSaves = [];
  const dependencies = {
    canEditSessionSetup: true,
    ...details,
    setupEpochRef: { current: 1 },
    setCupBlockedMessage: value => { blocked = value; }, hideSavedIdentity: false,
    setScanStatusMessage: value => statuses.push(value), isSessionFormSupported: true,
    samples: [], selectedForm: 1, isLegacy: false, validateAddSheet: () => true,
    isQuickStartSession: false, sheetCoffeeNameOrigin: 'NEW SECRET COFFEE',
    sessionName: 'NEW SECRET SESSION', sessionType: secretType, sessionDate: secretDate,
    setIsNfcWriting: () => {}, assertSessionReferenceAvailable: async () => {},
    sessionUUID: 'newref12345678', savedSessionIdRef: { current: 'newref12345678' },
    getSessionSetupAccess: async () => ({ canManageSetup: true }),
    readAndWriteNdefMinimal: nfc.readAndWriteNdefMinimal,
    classifyNfcTagReadResult: () => ({ type: 'ntag' }),
    isSmartCupHardwareTag: () => false,
    NFC_TAG_TYPES: { SMART_CUP: 'smart', NTAG_CUP: 'ntag' },
    getNfcTagIdentifier: () => '04ABCDEF123456',
    findPendingSessionByCupUUID: repo.findPendingSessionByCupUUID,
    playNfcFailureFeedback: async () => {},
    logAppError: input => { logArguments.push(input); },
    formState: {samples:[]}, setSessionStatus: () => {},
    saveSessionWithSamples: async input => { setupSaves.push(input); if (setupSaves.length > 1 || input.samples?.length) persisted = true; return {sessionId:'newref12345678',status:'new'}; },
  };
  const scan = new Function(...Object.keys(dependencies), `return (${generate(declaration.init).code});`)(...Object.values(dependencies));
  const writesBeforeConflict = nativeWrites;
  console.log = (...args) => diagnosticLogs.push(args);
  try { await scan(); } finally { console.log = originalLog; }
  written = nativeWrites !== writesBeforeConflict;
  assert.match(blocked, /already assigned to another active session/);
  assert.match(blocked, /Remove it.*different cup/);
  assert.equal(written, false, 'duplicate is rejected before write');
  assert.equal(persisted, false, 'duplicate is rejected before sample persistence');
  assert.equal(setupSaves.length, 1, 'only conservative pre-write Draft persistence is allowed before conflict');
  assert.equal(setupSaves[0].intent, 'setup');
  assert.deepEqual(setupSaves[0].samples, []);
  assert.equal(logArguments.length, 1);
  assert.equal(logArguments[0].error.code, details.PENDING_CONFLICT_ERROR);
  assert.equal(logArguments[0].context.assignmentConflict, true, 'real service retains conflict code into screen catch');
  const diagnostics = JSON.stringify(logArguments.map(input => ({ ...input,
    error: { message: input.error.message, stack: input.error.stack, code: input.error.code } })));
  for (const value of ['SECRET', '04ABCDEF123456', uuid]) assert.ok(!diagnostics.includes(value), `logger leaked ${value}`);
  assert.ok(!JSON.stringify(diagnosticLogs).includes('SECRET'), 'conflict service diagnostics contain no identity');
  assert.ok(statuses.includes(blocked));
  const unchanged = await repo.getSessionById(uuid);
  assert.equal(unchanged.samples.length, 1);
  assert.equal(unchanged.sessionType, secretType);
  assert.equal(unchanged.sessionDate, secretDate);
  const saveDeclaration = findNode(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'handleSave');
  const saveLogs = [];
  const saveMessages = [];
  const saveDependencies = {
    canEditSessionSetup: true,
    isSessionFormSupported: true, hideSavedIdentity: true,
    sessionUUID: 'SECRET SESSION ID', sessionName: 'SECRET SESSION', sessionType: secretType,
    formState: loaded, samples: loaded.samples, savedSessionIdRef: { current: uuid },
    setScanStatusMessage: value => saveMessages.push(value), setIsSaving: () => {},
    saveSessionWithSamples: async () => { throw new Error(`SQLITE_FULL ${secretType} ${secretDate}`); },
    logAppError: input => saveLogs.push(input),
    saveOperationRef: { current: null }, setupEpochRef: { current: 1 },
    setupContinuationRef: { current: false }, sessionId: uuid, isQuickStartSession: false,
    sessionForm: loaded,
    setupWarningSnapshot: new Function(`return (${generate(findNode(ast, node =>
      node.type === 'FunctionDeclaration' && node.id?.name === 'setupWarningSnapshot')).code});`)(),
  };
  const save = new Function(...Object.keys(saveDependencies), `return (${generate(saveDeclaration.init).code});`)(...Object.values(saveDependencies));
  await save();
  assert.deepEqual(saveMessages, ['Save failed.']);
  assert.equal(saveLogs.length, 1);
  assert.ok(!JSON.stringify(saveLogs.map(input => ({ ...input, error: input.error.stack }))).includes('SECRET'),
    'saved blind failure cannot log imported metadata or raw database error');
  // Exercise the actual logger argument expressions for all sibling screen
  // errors, so newly retained context/error fields cannot bypass the boundary.
  function inspectDiagnostics(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.name === 'logAppError') {
      const safeError = details.createPendingConflictError();
      const input = new Function('safeError', 'PENDING_CONFLICT_ERROR', 'message', 'samples',
        `return (${generate(node.arguments[0]).code});`)(safeError, details.PENDING_CONFLICT_ERROR, safeError.message, loaded.samples);
      assert.ok(!JSON.stringify({ ...input, error: input.error.stack }).includes('SECRET'));
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) inspectDiagnostics(child);
    }
  }
  inspectDiagnostics(ast);
  // Screen consumers use the same safe fields for visual/search/a11y/share copy.
  const list = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingSessionScreen.js'), 'utf8');
  assert.match(list, /category: visibleIdentity\.sessionType/);
  assert.match(list, /date: visibleIdentity\.sessionDate/);
  assert.match(source, /sessionId \? visibleIdentity\.sessionType/);
  assert.match(source, /sessionId \? visibleIdentity\.sessionDate/);
  console.log('Blind malformed metadata real SQLite import, safe saved/Active/share display, calendar validation and duplicate write/logger boundary passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
