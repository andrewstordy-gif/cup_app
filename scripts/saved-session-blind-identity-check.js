#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const { formIdentity } = require('../src/features/forms/sessionFormRoute');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/screens/savedSessionIdentity.js');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const displayHelpers = require('./helpers/load-project-module')(root, {
  '../../../utils/secureIdentifiers': {},
})('src/features/cupping/constants/sessionDetails.js');
const nativeRequire = mod.require.bind(mod);
mod.require = request => request === '../constants/sessionDetails' ? displayHelpers : nativeRequire(request);
mod._compile(code, filename);
const { projectSavedSessionIdentity, projectSavedAssessmentContext } = mod.exports;

const cvaPin = formIdentity(1);
const legacyPin = formIdentity(2);
const samples = [
  { id: 'a', sampleNumber: 1, cupUUID: 'CUP-A', cupNumber: 5, cuppingForm: 1,
    cuppingMode: 'blind', coffeeNameOrigin: 'SECRET KENYA AA', process: '1', supplier: 'Hidden Supplier' },
  { id: 'b', sampleNumber: 2, cupUUID: 'CUP-B', cupNumber: 5, cuppingForm: 1,
    cuppingMode: 'blind', coffeeNameOrigin: 'SECRET ETHIOPIA', process: '2', supplier: 'Secret Other' },
];
const session = {
  id: 's', sessionName: 'October blind training', status: 'complete',
  cuppingForm: 1, cuppingMode: 'blind',
  formKey: cvaPin.form_key, formVersion: cvaPin.form_version, formHash: cvaPin.form_hash,
  samples,
};
const protectedValues = [...samples.map((sample) => sample.coffeeNameOrigin),
  'Hidden Supplier', 'Secret Other', 'Washed (Wet)', 'Natural (Dry)'];

function assertHidden(candidate, reason) {
  const projected = projectSavedSessionIdentity(candidate, { allowOpen: true });
  assert.equal(projected.identityHidden, true, reason);
  assert.equal(projected.sessionName, candidate.sessionName);
  assert.deepEqual(projected.samples.map((sample) => sample.coffeeNameOrigin),
    (candidate.samples || []).map((sample, index) => `Sample ${sample.sampleNumber || index + 1}`));
  assert.ok(projected.samples.every((sample) => sample.process === null && sample.identityHidden));
  const output = JSON.stringify(projected);
  for (const value of protectedValues) assert.ok(!output.includes(value), `${reason}: ${value} leaked`);
}

assertHidden(session, 'host-complete blind session does not reveal');
for (const mode of [null, undefined, 'broken', 'open']) {
  assertHidden({ ...session, cuppingMode: mode }, `session mode ${String(mode)} cannot overrule blind samples`);
}
for (const mode of [null, undefined, 'broken']) {
  const mixed = samples.map((sample, index) => index === 0 ? { ...sample, cuppingMode: mode } : { ...sample, cuppingMode: 'open' });
  assertHidden({ ...session, cuppingMode: 'open', samples: mixed }, `sample mode ${String(mode)} must fail closed`);
}
const mixedProjection = projectSavedSessionIdentity({ ...session, samples: [samples[0], { ...samples[1], cuppingMode: 'open' }] }, { allowOpen: true });
assert.deepEqual(mixedProjection.samples.map(sample => sample.identityHidden), [true, false]);
assertHidden({ ...session, formHash: 'invalid', cuppingMode: 'open', samples: samples.map((sample) => ({ ...sample, cuppingMode: 'open' })) }, 'invalid CVA pin');
assertHidden({ ...session, cuppingForm: '1', cuppingMode: 'open', samples: samples.map((sample) => ({ ...sample, cuppingMode: 'open' })) }, 'malformed form value');
assertHidden({ ...session, cuppingMode: null, samples: [] }, 'empty null-mode session');

const openSamples = samples.map((sample) => ({ ...sample, cuppingMode: 'open' }));
const open = projectSavedSessionIdentity({ ...session, cuppingMode: null, samples: openSamples }, { allowOpen: true });
assert.equal(open.identityHidden, false, 'quick-start CVA with all explicit open samples');
assert.equal(open.sessionName, session.sessionName);
assert.deepEqual(open.samples.map((sample) => sample.coffeeNameOrigin), samples.map((sample) => sample.coffeeNameOrigin));
assert.deepEqual(open.samples.map((sample) => sample.process), ['1', '2']);

const legacy = projectSavedSessionIdentity({ ...session,
  cuppingForm: 2, cuppingMode: 'open', formKey: legacyPin.form_key,
  formVersion: legacyPin.form_version, formHash: legacyPin.form_hash,
  samples: openSamples.map((sample) => ({ ...sample, cuppingForm: 2 })),
}, { allowOpen: true });
assert.equal(legacy.identityHidden, false, 'validated Legacy Open stays visible');
assert.equal(legacy.samples[0].coffeeNameOrigin, samples[0].coffeeNameOrigin);
assert.equal(projectSavedSessionIdentity({ ...session, cuppingMode: 'open', samples: openSamples }).identityHidden,
  true, 'a saved view cannot show identity before its loaded-session evidence is installed');

const rawAssessment = { sessionId: 's', sampleId: 'a', sampleNumber: 1, cupIndex: 0,
  cuppingForm: 1, cuppingMode: 'open', coffeeNameOrigin: samples[0].coffeeNameOrigin,
  process: samples[0].process, defectsCupTotal: 5 };
for (const candidate of [session,
  { ...session, cuppingMode: null, samples: [] }]) {
  const visible = projectSavedAssessmentContext(candidate, rawAssessment);
  assert.equal(visible.cuppingMode, 'blind', 'mixed or missing mode cannot turn on the scorer identity strip');
  assert.equal(visible.coffeeNameOrigin, 'Sample 1');
  assert.equal(visible.process, '');
  assert.equal(visible.sampleId, rawAssessment.sampleId, 'scoring identity remains usable');
  assert.equal(visible.defectsCupTotal, 5, 'score/cup data is unchanged');
}
for (const mode of [null, 'open', 'blind']) {
  const candidate = { ...session, cuppingMode: mode, samples: [{ ...samples[0], cuppingMode: 'open' }, samples[1]] };
  assert.deepEqual(projectSavedAssessmentContext(candidate, rawAssessment), rawAssessment, 'stored Open target remains visible beside Blind');
  assert.equal(projectSavedAssessmentContext(candidate, { ...rawAssessment, sampleId: 'b' }).coffeeNameOrigin, 'Sample 2', 'caller Open cannot reveal stored Blind target');
}
const openAssessment = projectSavedAssessmentContext({ ...session, cuppingMode: null, samples: openSamples }, rawAssessment);
assert.deepEqual(openAssessment, rawAssessment, 'validated Open CVA scorer presentation is unchanged');
const legacyAssessment = projectSavedAssessmentContext({ ...session, cuppingForm: 2, cuppingMode: 'open',
  formKey: legacyPin.form_key, formVersion: legacyPin.form_version, formHash: legacyPin.form_hash,
  samples: openSamples.map((sample) => ({ ...sample, cuppingForm: 2 })) }, rawAssessment);
assert.deepEqual(legacyAssessment, rawAssessment, 'validated Legacy Open scorer presentation is unchanged');

const list = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingSessionScreen.js'), 'utf8');
assert.match(list, /title: visibleIdentity\.sessionName/, 'list title must use projection');
assert.doesNotMatch(list, /title: row\.sessionName/, 'raw session name must not reach card/search/dialog');
assert.match(list, /session\.title,[\s\S]*session\.category/, 'search must use projected title');
assert.match(list, /code: visibleIdentity\.identityHidden \? `Session \$\{index \+ 1\}` : ""/,
  'blind list card derives its distinguishing label solely from UI order');
assert.doesNotMatch(list, /code:.*row\.sessionDisplayId/, 'raw saved display ID cannot become a blind list code');
assert.doesNotMatch(list, /code:.*row\.id/, 'raw database ID cannot become a blind list code');
assert.doesNotMatch(list, /code:.*row\.sessionUUID/, 'even a well-formed saved UUID cannot become a blind list code');
assert.match(list, /session\.code,/, 'search can match neutral code');
assert.match(list, /Delete "\$\{deleteCandidate\.title\}\$\{deleteCandidate\.code/, 'delete confirmation uses projected title and code');
assert.match(list, /accessibilityLabel=\{`Open session \$\{item\.title\}\$\{item\.code/, 'open accessibility label includes code');
assert.match(list, /accessibilityLabel=\{`Delete session \$\{item\.title\}\$\{item\.code/, 'delete accessibility label includes code');

const details = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingSessionDetailsScreen.js'), 'utf8');
assert.match(details, /value=\{sessionId \? visibleIdentity\.sessionName : sessionName\}/, 'saved name input must project independently of coffee visibility');
assert.match(details, /editable=\{!isSessionLocked && canEditSessionSetup\}/, 'session name edits still require setup rights and lifecycle permission');
assert.match(details, /sample=\{sessionId \? visibleIdentity\.samples\[index\] : sample\}/, 'saved card receives projected sample');
assert.match(details, /onEditSample=\{showInProgressFooter \|\| !canEditSessionSetup \? undefined/, 'unowned sample cannot open raw edit sheet');
assert.match(details, /canEditSessionSetup = !sessionId \|\| \(isSessionFormSupported && ownsSavedSetup\)/,
  'saved setup requires local ownership, not merely an Open projection');
assert.match(details, /permission\?\.canRemove && permission\.removalToken/, 'participant local removal requires trusted scoped permission and token');
assert.match(details, /if \(!canEditSessionSetup\) return;\s*setIsSessionDirty\(true\);\s*setSamples\(\(prev\) => prev\.filter/, 'creator setup removal remains ownership guarded');
assert.match(details, /showRemove=\{canEditSessionSetup \|\| Boolean\(sample\.localRemoval\?\.canRemove\)\}/, 'only creator setup or trusted participant local removal exposes a cross');
assert.match(details, /accessibilityLabel=\{hideSavedIdentity \? "Session code unavailable"/, 'saved blind Details never speaks a stored reference');
assert.match(details, /hideSavedIdentity \? "Session code unavailable" : sessionDisplayId/, 'saved blind Details never prints a stored reference');
assert.doesNotMatch(readFileSync(filename, 'utf8'), /safeSavedSessionCode/, 'no stored reference formatter exists for blind views');
const craftedIdentifiers = { sessionDisplayId: 'SECRET COFFEE', sessionUUID: 'secretcoffeexy', id: 'SECRET COFFEE ID' };
const blindListLabel = `Session ${1}`;
const blindDetailsLabel = 'Session code unavailable';
for (const value of Object.values(craftedIdentifiers)) {
  assert.ok(!blindListLabel.includes(value) && !blindDetailsLabel.includes(value), 'stored identity-bearing identifiers are absent from blind labels');
}
assert.match(details, /accessibilityLabel="Session name"/, 'visible session name has truthful accessible label');
assert.doesNotMatch(details, /Session name hidden for blind cupping|Identity is hidden in this shared view/, 'session name is not announced as hidden coffee identity');
const card = readFileSync(path.join(root, 'src/features/cupping/components/CoffeeSampleCard.js'), 'utf8');
assert.match(card, /sample\.identityHidden \? "Hidden during blind cupping"/, 'expanded process explains redaction');
assert.match(card, /\{showRemove \? <IconButton/, 'card omits removal control unless trusted permission exposes it');
const nav = readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
assert.equal((nav.match(/if \(!await selectSavedAssessment\(\{/g) || []).length, 4,
  'both NFC branches, aroma capture and completed review project scorer context');
assert.match(nav, /handleSessionDetailsSampleOpen[\s\S]*if \(!await selectSavedAssessment\(context\)\) return/,
  'Details card tap projects scorer context');
assert.match(nav, /handleCuppingSampleSwipe[\s\S]*if \(!await selectSavedAssessment\(nextContext\)\) return/,
  'swipe cannot restore a raw scorer context');
assert.match(nav, /handleQuickStartSampleReady[\s\S]*if \(!await selectSavedAssessment\(context\)\) return/,
  'quick-start scorer handoff also applies saved-session projection');

const ast = parse(nav, { sourceType: 'module', plugins: ['jsx'] });
function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = findNode(entry, predicate);
        if (found) return found;
      }
    } else {
      const found = findNode(value, predicate);
      if (found) return found;
    }
  }
  return null;
}
const quickStartDeclaration = findNode(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'handleQuickStartSampleReady');
assert.ok(quickStartDeclaration);
let quickStartScorer = null;
const quickStartDependencies = {
  setIsQuickCuppingPending: () => {},
  buildContextFromSessionSample: () => rawAssessment,
  canOpenSample: async () => true,
  setSelectedSessionId: () => {},
  setSelectedCupContext: context => { quickStartScorer = context; },
  setScanStatusMessage: () => {},
  goToCupping: () => {},
  projectAssessmentContextForSavedSession: async context => projectSavedAssessmentContext(session, context),
};
const selectDeclaration = findNode(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'selectSavedAssessment');
const selectDependencies = { assessmentReadEpoch: { current: 0 }, currentRoute: { current: 'New Session' },
  projectAssessmentContextForSavedSession: quickStartDependencies.projectAssessmentContextForSavedSession,
  setSelectedCupContext: quickStartDependencies.setSelectedCupContext };
quickStartDependencies.selectSavedAssessment = new Function(...Object.keys(selectDependencies),
  `return (${generate(selectDeclaration.init).code});`)(...Object.values(selectDependencies));
const quickStart = new Function(...Object.keys(quickStartDependencies),
  `return (${generate(quickStartDeclaration.init).code});`)(...Object.values(quickStartDependencies));
quickStart({ sessionId: session.id, sample: { ...samples[0], cuppingMode: 'open' } }).then(() => {
  assert.equal(quickStartScorer?.cuppingMode, 'blind', 'quick-start cannot reveal a blind session');
  assert.equal(quickStartScorer?.coffeeNameOrigin, 'Sample 1');
  assert.equal(quickStartScorer?.process, '');
  console.log('Saved Sessions and Details blind/open identity, search, dialog, accessibility and edit-route checks passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
