#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');
const { formIdentity } = require('../src/features/forms/sessionFormRoute');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/screens/activeSessionIdentity.js');
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
const savedIdentity = require('./helpers/load-project-module')(root, {
  '../../../utils/secureIdentifiers': {},
})('src/features/cupping/screens/savedSessionIdentity.js');
mod.require = request => request === '../constants/sessionDetails' ? displayHelpers : request === './savedSessionIdentity' ? savedIdentity : nativeRequire(request);
mod._compile(code, filename);
const {
  projectActiveSessionIdentity,
  buildActiveSessionCompletionWarning,
  buildActiveSessionShareMessage,
} = mod.exports;

const session = {
  cuppingForm: 1, formKey: formIdentity(1).form_key, formVersion: formIdentity(1).form_version, formHash: formIdentity(1).form_hash,
  id: 'session-1', sessionName: 'October training', sessionDate: '15 Oct 2026',
  sessionType: 'Quality Control', cuppingMode: 'blind', status: 'complete',
};
const cups = [
  { id: 'sample-a', sampleNumber: 1, cuppingForm: 1, cuppingMode: 'blind', coffeeNameOrigin: 'Ethiopia Guji',
    process: '1', scores: [], defects: [], finalScore: 80, supplier: 'Secret A' },
  { id: 'sample-b', sampleNumber: 2, cuppingForm: 1, cuppingMode: 'blind', coffeeNameOrigin: 'Kenya Kirinyaga',
    process: '2', scores: [], defects: [], finalScore: 75, supplier: 'Secret B' },
];
const incomplete = [
  { sampleId: 'sample-a', name: 'Ethiopia Guji' },
  { sampleId: 'sample-b', name: 'Kenya Kirinyaga' },
];

function assertHidden(candidate, reason) {
  const projected = projectActiveSessionIdentity(candidate, cups, { allowOpen: true });
  assert.equal(projected.identityHidden, true, reason);
  assert.equal(projected.session.sessionName, candidate.sessionName);
  assert.deepEqual(projected.cups.map((cup) => cup.coffeeNameOrigin), ['Sample 1', 'Sample 2']);
  assert.ok(projected.cups.every((cup) => cup.identityHidden && cup.process === null));
  const warning = buildActiveSessionCompletionWarning(incomplete, projected.cups, projected.identityHidden);
  const share = buildActiveSessionShareMessage(projected.session, projected.cups);
  assert.match(warning, /Sample 1[\s\S]*Sample 2/);
  assert.match(share, /October training[\s\S]*Sample 1[\s\S]*Sample 2/);
  for (const output of [JSON.stringify(projected), warning, share]) {
    for (const secret of ['Ethiopia Guji', 'Kenya Kirinyaga', 'Secret A', 'Secret B']) {
      assert.ok(!output.includes(secret), `${reason}: ${secret} leaked`);
    }
  }
}

assertHidden(session, 'blind mode remains hidden even with host status complete');
assertHidden({ ...session, cuppingMode: null }, 'null session mode with blind samples');
assertHidden({ ...session, cuppingMode: 'unexpected' }, 'malformed session mode');
assertHidden({ ...session, cuppingMode: 'open' }, 'blind sample conflicts with open session');
assertHidden({ ...session, cuppingMode: null }, 'no host completion-based reveal');

const allOpen = cups.map((cup) => ({ ...cup, cuppingMode: 'open' }));
const quickStartOpen = projectActiveSessionIdentity({ ...session, cuppingMode: null }, allOpen, { allowOpen: true });
assert.equal(quickStartOpen.identityHidden, false, 'all explicit open samples permit quick-start CVA identity');
assert.equal(quickStartOpen.session.sessionName, 'October training');
assert.deepEqual(quickStartOpen.cups.map((cup) => cup.coffeeNameOrigin), ['Ethiopia Guji', 'Kenya Kirinyaga']);
assert.deepEqual(quickStartOpen.cups.map((cup) => cup.process), ['1', '2']);
assert.match(buildActiveSessionCompletionWarning(incomplete, quickStartOpen.cups, false), /Ethiopia Guji[\s\S]*Kenya Kirinyaga/);
assert.match(buildActiveSessionShareMessage(quickStartOpen.session, quickStartOpen.cups), /Ethiopia Guji[\s\S]*Kenya Kirinyaga/);

for (const mode of [null, undefined, 'malformed', 'blind']) {
  const candidate = allOpen.map((cup, index) => index === 0 ? { ...cup, cuppingMode: mode } : cup);
  const projected = projectActiveSessionIdentity({ ...session, cuppingMode: null }, candidate, { allowOpen: true });
  assert.equal(projected.identityHidden, true, `sample mode ${String(mode)} must fail closed`);
  assert.equal(projectActiveSessionIdentity({ ...session, cuppingMode: 'open' }, candidate, { allowOpen: true }).identityHidden,
    true, `explicit open session must not overrule sample mode ${String(mode)}`);
}
assert.equal(projectActiveSessionIdentity({ ...session, cuppingMode: null }, [], { allowOpen: true }).identityHidden,
  true, 'an empty CVA quick-start session cannot infer open mode');
assert.equal(projectActiveSessionIdentity({ ...session, cuppingMode: 'blind' }, allOpen, { allowOpen: true }).identityHidden,
  false, 'valid historical session mode cannot override stored Open samples');
assert.equal(projectActiveSessionIdentity({ ...session, cuppingMode: 'weird' }, allOpen, { allowOpen: true }).identityHidden,
  true, 'invalid session mode overrules open sample data');

for (const malformedForm of ['1', null, undefined, 9]) {
  const unsupported = { ...session, cuppingForm: malformedForm, cuppingMode: 'open' };
  for (const samples of [allOpen, cups, [{ ...allOpen[0], cuppingMode: 'unknown' }, allOpen[1]]]) {
    const projection = projectActiveSessionIdentity(unsupported, samples);
    assert.equal(projection.identityHidden, true, `unsupported form ${String(malformedForm)} must fail closed`);
    for (const text of [JSON.stringify(projection),
      buildActiveSessionCompletionWarning(incomplete, projection.cups, projection.identityHidden),
      buildActiveSessionShareMessage(projection.session, projection.cups)]) {
      assert.ok(!text.includes('Ethiopia Guji') && !text.includes('Kenya Kirinyaga'));
    }
  }
}

const screen = readFileSync(path.join(root, 'src/features/cupping/screens/ActiveSessionScreen.js'), 'utf8');
assert.match(screen, /value=\{savedSessionName\(visibleSession\)\}/, 'metadata uses projected session with neutral missing-name fallback');
assert.match(screen, /visibleCups\.map\(/, 'rows must receive projected cups');
assert.match(screen, /tastingPresentation\?\.session\?\.id === loadedSession\?\.id[\s\S]*?identityHidden: tastingPresentation\.identityHidden[\s\S]*?: projectActiveSessionIdentity/,
  'only a matching repository presentation enables completion-aware identity; fallback remains fail-closed');
assert.match(screen, /!cup\.identityHidden \? \[\{ label: "Process"/, 'blind drawer must omit process');
assert.match(screen, /<LocalTastingActions[\s\S]*?tasting=\{tastingPresentation\.tasting\}/,
  'completion uses shared confirmed actor-bound local action, whose warning labels are repository-neutral');
assert.match(screen, /Share\.share\(\{ message: buildActiveSessionShareMessage\(visibleSession, visibleCups\) \}\)/, 'native share must use projection');
assert.doesNotMatch(screen, /setLoadError\(error\?\.message/, 'repository error text may contain identity');
console.log('Active Session blind/open identity, completion warning, share payload and wiring checks passed.');
