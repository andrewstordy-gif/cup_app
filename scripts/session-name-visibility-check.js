#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = path.resolve(__dirname, '..');
const load = require('./helpers/load-project-module')(root, { '../../../utils/secureIdentifiers': {} });
const { projectSavedSessionIdentity } = load('src/features/cupping/screens/savedSessionIdentity.js');
const { projectActiveSessionIdentity } = load('src/features/cupping/screens/activeSessionIdentity.js');
const { formIdentity } = require('../src/features/forms/sessionFormRoute');
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      const result = find(item, predicate);
      if (result) return result;
    }
  }
  return null;
}
const listSource = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingSessionScreen.js'), 'utf8');
const listAst = parse(listSource, { sourceType: 'module', plugins: ['jsx'] });
const filtered = find(listAst, node => node.type === 'VariableDeclarator' && node.id?.name === 'filteredSessions');
const filter = new Function('sessions', 'query', `return (${generate(filtered.init.arguments[0]).code})();`);
const rows = [];
for (const form of [1, 2, 9]) {
  for (const mode of ['blind', 'open', null, 'invalid']) {
    for (const owner of [null, 'current-profile', 'foreign-profile']) {
      for (const populated of [false, true]) {
        const pin = formIdentity(form === 2 ? 2 : 1);
        const session = { sessionName: `CVA draft ${form} ${mode} ${owner} ${populated}`,
          localCreatorProfileId: owner, cuppingForm: form, cuppingMode: mode,
          formKey: pin.form_key, formVersion: pin.form_version, formHash: pin.form_hash,
          samples: populated ? [{ id: 'sample', sampleNumber: 1, cuppingForm: form,
            cuppingMode: mode, coffeeNameOrigin: 'PRIVATE COFFEE', process: 'PRIVATE PROCESS', supplier: 'PRIVATE SUPPLIER' }] : [] };
        const saved = projectSavedSessionIdentity(session, { allowOpen: true });
        const active = projectActiveSessionIdentity(session, session.samples);
        assert.equal(saved.sessionName, session.sessionName);
        assert.equal(active.session.sessionName, session.sessionName);
        assert.equal(active.identityHidden, true, 'session label alone never enables coffee reveal');
        assert.ok(!JSON.stringify(active).includes('PRIVATE COFFEE'));
        if (saved.identityHidden) {
          for (const value of ['PRIVATE COFFEE', 'PRIVATE PROCESS', 'PRIVATE SUPPLIER']) {
            assert.ok(!JSON.stringify(saved).includes(value));
          }
        }
        rows.push({ title: saved.sessionName, code: '', category: saved.sessionType, date: saved.sessionDate });
      }
    }
  }
}
assert.equal(filter(rows, 'cva draft').length, rows.length);
assert.deepEqual(filter(rows, 'PRIVATE COFFEE'), [], 'actual list search must not use coffee metadata');
assert.deepEqual(filter(rows, 'PRIVATE PROCESS'), []);
assert.deepEqual(filter(rows, 'PRIVATE SUPPLIER'), []);
assert.equal(filter(rows, ` ${rows[0].title.toUpperCase()} `).length, 1, 'actual filter trims query and ignores case');
for (const sessionName of ['', '   ', null, undefined, 123]) {
  const session = { sessionName, cuppingMode: 'blind', samples: [{ coffeeNameOrigin: 'PRIVATE FALLBACK' }] };
  assert.equal(projectSavedSessionIdentity(session).sessionName, 'Untitled Session');
  assert.equal(projectActiveSessionIdentity(session, session.samples).session.sessionName, 'Untitled Session');
}
// Session metadata remains public even when deliberately identical to coffee text.
const overlap = { sessionName: 'PRIVATE COFFEE', cuppingMode: 'blind', samples: [{ coffeeNameOrigin: 'PRIVATE COFFEE' }] };
assert.equal(projectSavedSessionIdentity(overlap).sessionName, 'PRIVATE COFFEE');
assert.equal(projectSavedSessionIdentity(overlap).samples[0].coffeeNameOrigin, 'Sample 1');
assert.equal(projectActiveSessionIdentity(overlap, overlap.samples).session.sessionName, 'PRIVATE COFFEE');
assert.equal(projectActiveSessionIdentity(overlap, overlap.samples).cups[0].coffeeNameOrigin, 'Sample 1');
assert.equal(filter([{ title: 'PRIVATE COFFEE' }], 'private coffee').length, 1);
const details = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingSessionDetailsScreen.js'), 'utf8');
const detailsAst = parse(details, { sourceType: 'module', plugins: ['jsx'] });
const nameInput = find(detailsAst, node => node.type === 'JSXOpeningElement' && node.name.name === 'TextInput' &&
  node.attributes.some(attr => attr.name?.name === 'accessibilityLabel' && attr.value?.value === 'Session name'));
assert.ok(nameInput, 'actual Details input announces visible session name');
const editable = nameInput.attributes.find(attr => attr.name?.name === 'editable').value.expression;
const canEdit = new Function('isSessionLocked', 'canEditSessionSetup', `return ${generate(editable).code}`);
assert.equal(canEdit(false, false), false, 'unowned session is read-only despite visible name');
assert.equal(canEdit(true, true), false, 'lifecycle lock stays enforced');
assert.equal(canEdit(false, true), true);
assert.doesNotMatch(details, /Session name hidden for blind cupping|Identity is hidden in this shared view/);
console.log(`PASS session-name visibility: ${rows.length} actual projections, actual list filter, missing/overlap names and Details accessibility/edit guards`);
