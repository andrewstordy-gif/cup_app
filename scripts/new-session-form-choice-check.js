#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const { cvaIdentity, formIdentity, isSessionFormReady } = require('../src/features/forms/sessionFormRoute');

const source = fs.readFileSync(path.join(__dirname, '../src/features/cupping/screens/CuppingSessionDetailsScreen.js'), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
function find(root, predicate) {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  for (const value of Object.values(root)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  return null;
}
function declaration(name) {
  const node = find(ast, item => item.type === 'VariableDeclarator' && item.id?.name === name);
  assert.ok(node, `${name} must exist`);
  return node.init;
}
function evaluate(node, dependencies) {
  return new Function(...Object.keys(dependencies), `return (${generate(node).code});`)(...Object.values(dependencies));
}

const formState = find(ast, node => node.type === 'VariableDeclarator' &&
  node.id?.type === 'ArrayPattern' && node.id.elements?.[0]?.name === 'sessionForm');
assert.ok(formState, 'session form state must exist');
const initialChoice = formState.init.arguments[0];
assert.equal(evaluate(initialChoice, { sessionId: null, quickStartSessionTypeKey: null, cvaIdentity })(), null,
  'ordinary New Session starts without a selected form');
assert.equal(evaluate(initialChoice, { sessionId: 'saved', quickStartSessionTypeKey: null, cvaIdentity })(), null,
  'saved session waits for its persisted form');
assert.equal(evaluate(initialChoice, { sessionId: null, quickStartSessionTypeKey: 7, cvaIdentity })().f, 1,
  'separate CVA quick-start route retains its current choice');

const resetChoice = find(ast, node => node.type === 'CallExpression' && node.callee?.name === 'setSessionForm' &&
  node.arguments?.[0]?.type === 'ConditionalExpression');
assert.ok(resetChoice, 'new-session reset must set its form explicitly');
assert.equal(evaluate(resetChoice.arguments[0], { quickStartSessionTypeValue: null, cvaIdentity }), null);
assert.equal(evaluate(resetChoice.arguments[0], { quickStartSessionTypeValue: 7, cvaIdentity }).f, 1);
assert.equal(isSessionFormReady(null, null), false, 'no form cannot be saved or assigned to a cup');

for (const f of [1, 2]) {
  const pin = formIdentity(f);
  assert.equal(isSessionFormReady(null, pin), true, `selected form ${f} is ready`);
  const state = { form: null, mode: undefined, dirty: false };
  const select = evaluate(declaration('selectSessionForm'), {
    canSelectSessionForm: true, formIdentity, draftRemovalRef:{current:null}, draftRemovalBusyRef:{current:null},cupReassignmentRef:{current:null},cupReassignmentBusyRef:{current:null},
    setSessionForm: value => { state.form = value; }, sessionId: null,
    setSessionMode: value => { state.mode = value; },
    setScanStatusMessage: () => {}, setIsSessionDirty: value => { state.dirty = value; },
  });
  select(f);
  assert.deepEqual(state.form, pin, `form ${f} is selected without fallback`);
  assert.equal(state.mode, f === 2 ? 'open' : null);
  assert.equal(state.dirty, true);
}

const blockedState = { form: null };
evaluate(declaration('selectSessionForm'), {
  canSelectSessionForm: false, draftRemovalRef:{current:null}, draftRemovalBusyRef:{current:null},cupReassignmentRef:{current:null},cupReassignmentBusyRef:{current:null},
  setSessionForm: value => { blockedState.form = value; },
})(1);
assert.equal(blockedState.form, null, 'unsupported/locked saved session cannot change form');

const save = evaluate(declaration('handleSave'), {
  canEditSessionSetup: true, draftRemovalRef:{current:null}, draftRemovalBusyRef:{current:null}, lockOperationRef:{current:null}, pendingAdditionRef:{current:null}, pendingAdditionBusyRef:{current:null},cupReassignmentRef:{current:null},cupReassignmentBusyRef:{current:null},
  isSessionFormSupported: false,
  setScanStatusMessage: message => { assert.match(message, /Select a session form/); },
  setIsSaving: () => { throw new Error('save must not begin without a form'); },
});
save().then(() => console.log('Explicit New Session form-choice checks passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
