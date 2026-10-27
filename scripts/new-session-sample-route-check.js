#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const {
  formIdentity, requireFormRoute, UNSUPPORTED_MESSAGE,
} = require('../src/features/forms/sessionFormRoute');

const readAst = relativePath => parse(
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'),
  { sourceType: 'module', plugins: ['jsx'] },
);
function findNode(root, predicate) {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findNode(item, predicate);
        if (found) return found;
      }
    } else {
      const found = findNode(value, predicate);
      if (found) return found;
    }
  }
  return null;
}
function screenCallback(ast, componentName, propName, dependencies) {
  const opening = findNode(ast, node => node.type === 'JSXOpeningElement' &&
    node.name?.name === componentName &&
    node.attributes?.some(attr => attr.name?.name === propName));
  assert.ok(opening, `${componentName}.${propName} must exist`);
  const expression = opening.attributes.find(attr => attr.name?.name === propName).value.expression;
  return new Function(...Object.keys(dependencies), `return (${generate(expression).code});`)(
    ...Object.values(dependencies),
  );
}
function navigatorCallback(ast, name, dependencies) {
  const declaration = findNode(ast, node => node.type === 'VariableDeclarator' && node.id?.name === name);
  assert.ok(declaration, `${name} must exist`);
  return new Function(...Object.keys(dependencies), `return (${generate(declaration.init).code});`)(
    ...Object.values(dependencies),
  );
}

async function main() {
  assert.throws(() => requireFormRoute(null, null), error =>
    error instanceof Error && error.message === UNSUPPORTED_MESSAGE,
    'a missing session fails closed without a property-access TypeError');

  const detailsAst = readAst('src/features/cupping/screens/CuppingSessionDetailsScreen.js');
  const navigatorAst = readAst('src/navigation/AppNavigator.js');
  for (const [form, component, prop] of [
    [1, 'CoffeeSampleCard', 'onOpenSample'],
    [2, 'LegacySampleCard', 'onPress'],
  ]) {
    const savedSessionId = `persisted-${form}`;
    const sample = { id: `sample-${form}`, cupUUID: `cup-${form}`, cuppingForm: form,
      cuppingMode: 'open' };
    const pin = formIdentity(form);
    const savedSession = { id: savedSessionId, cuppingForm: form, cuppingMode: 'open',
      formKey: pin.form_key, formVersion: pin.form_version, formHash: pin.form_hash,
      samples: [sample] };
    const warnings = [];
    let opened = null;
    const canOpenSample = navigatorCallback(navigatorAst, 'canOpenSample', {
      getLocalTastingPresentation: async id => ({ session: id === savedSessionId ? savedSession : null }),
      getSessionById: async id => id === savedSessionId ? savedSession : null,
      requireFormRoute,
      showWarning: (...args) => warnings.push(args),
      UNSUPPORTED_MESSAGE,
    });
    const projectAssessmentContextForSavedSession = navigatorCallback(navigatorAst, 'projectAssessmentContextForSavedSession', {
      getLocalTastingPresentation: async id => ({ session: id === savedSessionId ? savedSession : null }),
      UNSUPPORTED_MESSAGE,
    });
    const selectSavedAssessment = navigatorCallback(navigatorAst, 'selectSavedAssessment', {
      assessmentReadEpoch: { current: 0 }, currentRoute: { current: 'Cupping Session Details' },
      projectAssessmentContextForSavedSession, setSelectedCupContext: context => { opened = context; },
    });
    const handleOpen = navigatorCallback(navigatorAst, 'handleSessionDetailsSampleOpen', {
      showWarning: (...args) => warnings.push(args), UNSUPPORTED_MESSAGE,
      buildContextFromSessionSample: (entry, _index, _total, options) =>
        ({ sessionId: options.sessionId, sampleId: entry.id }),
      canOpenSample,
      selectSavedAssessment,
      setScanStatusMessage: () => {}, goToCupping: () => {},
    });
    const callback = screenCallback(detailsAst, component, prop, {
      sample, index: 0, samples: [sample], sampleStatusById: {},
      savedSessionIdRef: { current: savedSessionId }, onOpenSample: handleOpen,
      isSessionFormSupported: true,
      sessionStatusBadgeLabel: 'Pending', isSessionDirty: false,
      requestSetupExit: action => action(),
    });
    assert.equal(typeof callback, 'function');
    const draftCallback = screenCallback(detailsAst, component, prop, {
      sample, index: 0, samples: [sample], sampleStatusById: {},
      savedSessionIdRef: {current:savedSessionId}, onOpenSample: handleOpen,
      isSessionFormSupported: true, sessionStatusBadgeLabel:'Draft', isSessionDirty:false,
      requestSetupExit: action=>action(),
    });
    assert.equal(draftCallback, undefined, 'durably assigned Draft cannot bypass explicit Session Save through a sample card');
    await callback();
    assert.deepEqual(opened, { sessionId: savedSessionId, sampleId: sample.id, cuppingMode: 'open',
      coffeeNameOrigin: undefined, process: '', isSessionComplete: false },
      `${component} passes the persisted session ID after Session Details Save`);
    assert.deepEqual(warnings, []);

    opened = null;
    await handleOpen(sample, 0, 1, { sessionId: 'missing-session' });
    assert.equal(opened, null, 'missing session must not open a form');
    assert.deepEqual(warnings.at(-1), ['Form unavailable', UNSUPPORTED_MESSAGE]);
    opened = null;
    await handleOpen(sample, 0, 1, {});
    assert.equal(opened, null, 'missing handoff must not use a previous sample or form');
    assert.deepEqual(warnings.at(-1), ['Form unavailable', UNSUPPORTED_MESSAGE]);
  }
  console.log('New-session CVA/Legacy sample handoff and null route fail-closed checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
