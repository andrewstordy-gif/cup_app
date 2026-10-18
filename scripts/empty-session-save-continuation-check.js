#!/usr/bin/env node
// Real screen handlers and SQLite; no physical NFC or native-device claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = require('node:path').resolve(__dirname, '..');
const source = fs.readFileSync(`${root}/src/features/cupping/screens/CuppingSessionDetailsScreen.js`, 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
function declaration(name) {
  const node = find(ast, item => item.type === 'VariableDeclarator' && item.id?.name === name);
  assert.ok(node, name);
  return node.init;
}
function evaluate(node, dependencies) {
  return new Function(...Object.keys(dependencies), `return (${generate(node).code});`)(...Object.values(dependencies));
}
const sqlite = new DatabaseSync(':memory:');
const db = {
  async execAsync(sql) { sqlite.exec(sql); },
  async getFirstAsync(sql, args = []) { return sqlite.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return sqlite.prepare(sql).all(...args); },
  async runAsync(sql, args = []) { return sqlite.prepare(sql).run(...args); },
  async withExclusiveTransactionAsync(callback) { return db.withTransactionAsync(() => callback(db)); },
  async withTransactionAsync(callback) {
    sqlite.exec('BEGIN');
    try { const result = await callback(); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
let counter = 0;
const mocks = {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  'expo-sqlite': { openDatabaseAsync: async () => db },
  '../utils/secureIdentifiers': { generateDomainId: () => `test-id-${++counter}` },
  '../../../utils/secureIdentifiers': {},
};
function freshLoader() { return require('./helpers/load-project-module')(root, mocks); }
const load = freshLoader();
const repository = load('src/data/sessionRepository.js');
const { canShowSavedSessionIdentity, projectSavedSessionIdentity } = load('src/features/cupping/screens/savedSessionIdentity.js');
const { formIdentity } = require('../src/features/forms/sessionFormRoute');
const snapshotNode = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'setupWarningSnapshot');
const setupWarningSnapshot = evaluate(snapshotNode, {});

function harness({ id = `session-${++counter}`, form = 1, saved = false, quick = false } = {}) {
  const h = { message: '', dialog: '', navigations: [], back: 0, saving: false, dirty: false, opened: false };
  const pin = formIdentity(form);
  const ref = value => ({ current: value });
  Object.assign(h, {
    sessionId: saved ? id : null,
    sessionForm: pin,
    isSessionFormSupported: true,
    canEditSessionSetup: true,
    isQuickStartSession: quick,
    isNfcWriting: false,
    isCheckingCup: false, isCompletingSession: false, isDeleting: false,
    verifyingSampleId: null, rewritingSampleId: null,
    hideSavedIdentity: false,
    formState: { sessionUUID: id, sessionName: 'Typed setup name', cuppingForm: form,
      cuppingMode: form === 2 ? 'open' : null, sessionDate: '16 Oct 2026', sessionType: null, samples: [] },
    savedSessionIdRef: ref(saved ? id : null), saveOperationRef: ref(null), setupEpochRef: ref(1),
    completionBusyRef: ref(null),
    setupContinuationRef: ref(false), savedSetupSnapshotRef: ref(null), pendingSetupExitRef: ref(null),
    savedSetupInputKeyRef: ref(null), currentSetupInputKeyRef: ref(null),
    saveSessionWithSamples: repository.saveSessionWithSamples,
  });
  h.dependencies = () => {
    h.currentSetupInputKeyRef.current = JSON.stringify(h.formState);
    return { ...h, setupWarningSnapshot, canShowSavedSessionIdentity, samples: h.formState.samples,
    isSessionDirty: h.dirty, setSessionName: value => { h.formState = { ...h.formState, sessionName: value }; },
    setIsSaving: value => { h.saving = value; }, setIsSessionDirty: value => { h.dirty = value; },
    setIsCompletingSession() {},
    setScanStatusMessage: message => { h.message = message; },
    setSetupExitMessage: message => { h.dialog = message; },
    onSaveSuccess: id => h.navigations.push(id), onBackPress: () => { h.back += 1; },
    logAppError: () => {}, stayInSetup: () => h.run('stayInSetup'),
    setEditingSampleId: () => {}, setSheetCoffeeNameOrigin: () => {}, setSheetProcess: () => {},
    setSheetCupNumber: () => {}, setIsSheetCupNumberDefault: () => {},
    setSheetCuppingMode: () => {}, setIsSheetCuppingModeDefault: () => {},
    setSheetErrors: () => {}, setCupBlockedMessage: () => {},
    setIsAddSheetVisible: value => { h.opened = value; }, isLegacy: h.formState.cuppingForm === 2,
    };
  };
  h.run = (name, ...args) => evaluate(declaration(name), h.dependencies())(...args);
  h.exit = callback => h.run('requestSetupExit', callback || (() => { h.back += 1; }));
  return h;
}

// Execute the exact existing post-NFC local persistence/continuation statements.
// The physical write itself is deliberately not simulated or claimed here.
async function persistAddedSamples(h, nextSamples) {
  const handler = declaration('handleScanCup');
  const block = handler.body.body.find(node => node.type === 'TryStatement').block.body;
  const start = block.findIndex(node => node.type === 'VariableDeclaration' && node.declarations[0].id?.name === 'saved');
  assert.ok(start >= 0);
  const body = block.slice(start, start + 3).map(node => generate(node).code).join('\n');
  const dependencies = { ...h.dependencies(), sessionUUID: h.formState.sessionUUID,
    sessionMode: h.formState.cuppingMode, sessionDisplayId: '', sessionDate: h.formState.sessionDate,
    effectiveSessionName: h.formState.sessionName, effectiveSessionType: null,
    samplesInSession: '', sessionStatus: 'new', nextSamples, setupEpoch: h.setupEpochRef.current };
  await new Function(...Object.keys(dependencies), `return (async () => {${body}})();`)(...Object.values(dependencies));
  h.formState = { ...h.formState, samples: nextSamples };
  h.dirty = true;
}
function sample(index, mode = 'blind') {
  return { id: `sample-${++counter}`, cupUUID: `CUP-${counter}`, cupNumber: 1, cuppingForm: 1,
    cuppingMode: mode, sampleNumber: index, coffeeNameOrigin: `Entered sample ${index}`, process: '1' };
}

async function main() {
  const h = harness();
  await h.run('handleSave');
  assert.equal(h.setupContinuationRef.current, true);
  assert.equal(h.navigations.length, 0);
  assert.match(h.message, /Draft saved locally \(0 samples\).*return to this draft from Sessions/);
  assert.equal(h.savedSessionIdRef.current, h.formState.sessionUUID);
  h.exit(); assert.doesNotMatch(h.dialog, /Changes since/, 'clean saved empty draft does not claim unsaved changes');
  h.run('stayInSetup');
  h.run('handleOpenAddSheet'); assert.equal(h.opened, true);
  await h.run('handleSave');
  assert.equal((await db.getAllAsync('SELECT id FROM sessions')).length, 1, 'repeat saves update same row');
  const first = sample(1);
  await persistAddedSamples(h, [first]);
  await h.run('handleSave');
  assert.equal(h.navigations.length, 0, 'first Blind sample does not redirect creator');
  h.opened = false; h.run('handleOpenAddSheet'); assert.equal(h.opened, true);
  await persistAddedSamples(h, [first, sample(2)]);
  await h.run('handleSave');
  assert.equal(h.navigations.length, 0, 'intermediate saves preserve ability to add more Blind samples');
  const reopened = await freshLoader()('src/data/sessionRepository.js').getSessionById(h.formState.sessionUUID);
  assert.equal(reopened.samples.length, 2);
  assert.equal(reopened.cuppingMode, null);
  assert.equal(projectSavedSessionIdentity(reopened, { allowOpen: true }).identityHidden, true,
    'module restart still fails closed; transient continuation is not saved authority');
  assert.deepEqual([reopened.formKey, reopened.formVersion, reopened.formHash],
    [h.sessionForm.form_key, h.sessionForm.form_version, h.sessionForm.form_hash]);

  let departed = 0;
  h.exit(() => { departed += 1; });
  assert.equal(h.dialog, '', 'owned saved Blind setup can be reopened without a loss warning');
  assert.equal(departed, 1);
  h.dirty = true;
  h.formState = { ...h.formState, sessionName: 'Unsaved setup change' };
  h.exit(() => { departed += 1; });
  assert.match(h.dialog, /Changes since your last Save/);
  assert.equal(departed, 1);
  h.run('stayInSetup'); assert.equal(h.dialog, '');
  h.run('leaveSetup'); assert.equal(departed, 1, 'dismiss removes deferred exit');
  h.exit(() => { departed += 1; }); h.run('leaveSetup'); h.run('leaveSetup');
  assert.equal(departed, 2, 'explicit Leave invokes action exactly once');
  h.exit(() => { departed += 1; }); h.setupEpochRef.current += 1; h.run('leaveSetup');
  assert.equal(departed, 2, 'stale deferred action cannot leave a different context');

  const open = harness(); await open.run('handleSave');
  await persistAddedSamples(open, [sample(1, 'open')]);
  open.exit(); assert.equal(open.back, 1, 'successful cup-add snapshot also permits known Open exit');
  assert.equal(open.dialog, '');
  await open.run('handleSave');
  assert.equal(canShowSavedSessionIdentity(open.savedSetupSnapshotRef.current), true, 'new form pin mapped correctly');
  open.exit(); assert.equal(open.back, 2); assert.equal(open.dialog, '', 'saved Open can resume, no false warning');
  const nameInput = find(ast, node => node.type === 'JSXOpeningElement' && node.name?.name === 'TextInput' &&
    node.attributes.some(attr => attr.name?.name === 'onChangeText' && generate(attr.value.expression).code.includes('setSessionName')));
  const nameChange = nameInput.attributes.find(attr => attr.name?.name === 'onChangeText').value.expression;
  evaluate(nameChange, open.dependencies())('Changed name via input');
  open.exit(); assert.match(open.dialog, /Changes since your last Save/);
  assert.doesNotMatch(open.dialog, /cannot resume/);

  const changed = harness(); await changed.run('handleSave');
  changed.sessionForm = formIdentity(2);
  changed.formState = { ...changed.formState, cuppingForm: 2, cuppingMode: 'open' };
  changed.exit(); assert.match(changed.dialog, /Changes since/, 'unsaved form choice still warns about uncommitted changes');
  changed.run('stayInSetup'); await changed.run('handleSave');
  assert.deepEqual(changed.navigations, [changed.formState.sessionUUID]);
  assert.equal((await repository.getSessionById(changed.formState.sessionUUID)).cuppingMode, 'open');
  assert.equal(changed.savedSessionIdRef.current, changed.formState.sessionUUID);

  for (const options of [{ form: 2 }, { saved: true }, { quick: true }]) {
    const ordinary = harness(options);
    if (options.saved) await repository.saveSessionWithSamples(ordinary.formState);
    await ordinary.run('handleSave');
    assert.equal(ordinary.setupContinuationRef.current, false);
    assert.equal(ordinary.navigations.length, 1, 'unactivated Legacy/saved/quick-start save preserves handoff');
    ordinary.isNfcWriting = true; ordinary.exit();
    assert.equal(ordinary.back, 0, 'pending native setup is protected for saved, Legacy and quick-start flows too');
  }
  const populated = harness(); populated.formState.samples = [sample(1)];
  await populated.run('handleSave'); assert.equal(populated.navigations.length, 1, 'ordinary nonempty first Save unchanged');
  const unsupported = harness(); unsupported.isSessionFormSupported = false;
  await unsupported.run('handleSave'); assert.equal(unsupported.navigations.length, 0);
  assert.match(unsupported.message, /Select a session form/);

  const failing = harness(); failing.saveSessionWithSamples = async () => { throw new Error('save failed'); };
  await failing.run('handleSave');
  assert.equal(failing.setupContinuationRef.current, false); assert.equal(failing.saving, false);
  assert.match(failing.message, /save failed/); assert.equal(failing.savedSessionIdRef.current, null);
  let resolveSave, calls = 0;
  const pending = harness(); pending.saveSessionWithSamples = () => { calls += 1; return new Promise(resolve => { resolveSave = resolve; }); };
  const saving = pending.run('handleSave'); await pending.run('handleSave');
  assert.equal(calls, 1, 'immediate ref prevents duplicate Save before render');
  pending.run('handleOpenAddSheet'); assert.equal(pending.opened, false);
  pending.exit(); assert.equal(pending.back, 0); assert.match(pending.message, /Please wait/);
  pending.setupContinuationRef.current = true;
  pending.pendingSetupExitRef.current = { action: () => { pending.back += 1; }, epoch: pending.setupEpochRef.current };
  pending.run('leaveSetup'); assert.equal(pending.back, 0, 'Leave rechecks pending Save even with dialog already open');
  resolveSave({ sessionId: pending.formState.sessionUUID, savedSampleCount: 0 }); await saving;
  assert.equal(pending.saving, false);
  for (const busy of ['isNfcWriting', 'isCheckingCup', 'isCompletingSession', 'isDeleting', 'verifyingSampleId', 'rewritingSampleId']) {
    pending[busy] = true; pending.exit(); pending.run('leaveSetup'); assert.equal(pending.back, 0, busy);
    pending[busy] = false;
  }

  const editedPending = harness(); let finishPending;
  editedPending.saveSessionWithSamples = () => new Promise(resolve => { finishPending = resolve; });
  const earlier = editedPending.run('handleSave');
  evaluate(nameChange, editedPending.dependencies())('Newer typed name');
  editedPending.dependencies(); // model React's next render before the acknowledgement
  finishPending({ sessionId: editedPending.formState.sessionUUID, savedSampleCount: 0 }); await earlier;
  assert.equal(editedPending.dirty, true);
  assert.equal(editedPending.savedSessionIdRef.current, editedPending.formState.sessionUUID);
  assert.equal(editedPending.navigations.length, 0);
  assert.match(editedPending.message, /Earlier draft saved.*newer changes/);
  editedPending.exit(); assert.match(editedPending.dialog, /Changes since/);

  // Actual lifecycle cleanup invalidates stale Save success/failure/finally.
  const lifecycle = find(ast, node => node.type === 'CallExpression' && node.callee?.name === 'useEffect' &&
    generate(node.arguments[0]).code.includes('setupEpochRef.current += 1'));
  for (const fail of [false, true]) {
    const stale = harness();
    const cleanup = evaluate(lifecycle.arguments[0], stale.dependencies())();
    let settle;
    stale.saveSessionWithSamples = () => new Promise((resolve, reject) => { settle = () => fail ? reject(new Error('late failure')) : resolve({ sessionId: 'old', savedSampleCount: 0 }); });
    const result = stale.run('handleSave'); cleanup();
    stale.message = 'New context'; stale.saving = 'new-context-state';
    settle(); await result;
    assert.equal(stale.message, 'New context'); assert.equal(stale.saving, 'new-context-state');
    assert.equal(stale.savedSessionIdRef.current, null); assert.equal(stale.navigations.length, 0);
  }

  // Verify actual JSX event wiring and Android subscription disposal.
  for (const [prop, handler] of [['onDismiss', 'stayInSetup'], ['onOk', 'stayInSetup'], ['onSecondary', 'leaveSetup']]) {
    const dialog = find(ast, node => node.type === 'JSXOpeningElement' && node.name?.name === 'WarningDialog' &&
      node.attributes.some(attr => attr.name?.name === 'title' && attr.value?.value === 'Leave setup?'));
    const attr = dialog.attributes.find(attr => attr.name?.name === prop);
    assert.equal(attr.value.expression.name, handler);
  }
  assert.match(source, /okLabel="Stay"[\s\S]*secondaryLabel="Leave"/);
  assert.match(source, /onBackPress=\{\(\) => requestSetupExit\(onBackPress\)\}/);
  assert.match(source, /onPress=\{\(\) => requestSetupExit\(onScanCupForAssessment\)\}/);
  assert.match(source, /onPress=\{\(\) => requestSetupExit\(onScanCupForAssessment\)\}/,
    'scan action remains behind the setup exit guard after replacing global completion footer');
  assert.match(source, /requestSetupExit\(\(\) => onOpenSample\(sample, index, samples.length/);
  assert.match(source, /requestSetupExit\(\(\) => onQuickStartSampleReady\(pendingQuickStartReady\)\)/);
  const hardware = find(ast, node => node.type === 'CallExpression' && node.callee?.name === 'useEffect' &&
    generate(node.arguments[0]).code.includes('hardwareBackPress'));
  let listener, removed = false;
  const remove = evaluate(hardware.arguments[0], { BackHandler: {
    addEventListener(name, callback) { assert.equal(name, 'hardwareBackPress'); listener = callback; return { remove() { removed = true; } }; },
  }, setupContinuationRef: h.setupContinuationRef, saveOperationRef: h.saveOperationRef,
  requestSetupExit: action => h.exit(action), onBackPress: () => { departed += 1; } })();
  assert.equal(listener(), true); assert.equal(departed, 2); h.run('stayInSetup'); remove(); assert.equal(removed, true);
  sqlite.close();
  console.log('Empty CVA Save continuation, real SQLite/reload, safe exit, pending/stale lifecycle and unchanged flow checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
