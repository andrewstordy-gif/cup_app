const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PROFILE, resolveForm, resolvePinnedForm, validateResponse, scoreResponse } = require('../src/features/forms/contract');
const { canonicalize } = require('../src/features/forms/contract/canonical');
const { createCvaDraft, changeCvaMask, toggleCvaDefectAssessment, inspectCvaResponse, cvaEnvelope, RATINGS } = require('../src/features/cupping/data/cvaResponse');
const { cvaGuidance } = require('../src/features/cupping/data/cvaResponse');
const trusted = { profile: PROFILE, f: 1, identity: resolveForm(PROFILE, 1).identity };
const hash = value => crypto.createHash('sha256').update(canonicalize(value)).digest('hex');
assert.equal(trusted.identity.form_version, '3.0.0');
for (const [file, expected] of [['cva-v1.json', '0a840b335b4af50d18db3cf210d503b870285c1706710ff803e7633103ad310d'],
  ['cva-v1.1.json', '2a9e341fb17664559875a08235a01f88571a3833682ead2a1de09558ba6bf0bb']]) {
  const manifest = require('../src/features/forms/contract/manifests/' + file);
  assert.equal(hash(manifest), expected);
  assert.equal(resolvePinnedForm(PROFILE, 1, { form_key: manifest.form_key, form_version: manifest.form_version, form_hash: expected }).ok, true);
}
assert.equal(fs.readFileSync(require.resolve('../src/features/forms/contract/fixtures/cva-v3.canonical.json'), 'utf8'), canonicalize(resolveForm(PROFILE, 1).manifest) + '\n');
assert.equal(hash(resolveForm(PROFILE, 1).manifest), trusted.identity.form_hash);
const final = n => ({ ...createCvaDraft(n), ratings: Object.fromEntries(Object.values(RATINGS).map(key => [key, 5])), non_uniform_cups: [] });
for (let n = 1; n <= 8; n++) {
  assert.equal(inspectCvaResponse(createCvaDraft(n), trusted, n).draft.ok, true);
  assert.equal(inspectCvaResponse(createCvaDraft(n), trusted, n).final.ok, false);
  const good = final(n);
  assert.equal(inspectCvaResponse(good, trusted, n).result.display_score, '79.00');
  let source = changeCvaMask(good, 'potato', [1], n);
  source = changeCvaMask(source, 'moldy', [1], n);
  if (n > 1) source.non_uniform_cups = [1];
  assert.equal(source.defective_cups.length, 1);
  assert.equal(inspectCvaResponse(source, trusted, n).final.ok, true);
  const all = { ...source, defective_cups: Array.from({ length: n }, (_, i) => i + 1),
    defect_type_masks: { phenolic: Array.from({ length: n }, (_, i) => i + 1) }, non_uniform_cups: [], evenly_defective_all_cups: null };
  assert.equal(inspectCvaResponse(all, trusted, n).draft.ok, true);
  assert.equal(inspectCvaResponse(all, trusted, n).final.ok, true);
  all.evenly_defective_all_cups = true;
  assert.equal(inspectCvaResponse(all, trusted, n).result.display_score, '59.00');
}
for (const key of ['non_uniform_cups', 'defective_cups', 'defect_type_masks']) for (const value of [undefined, null]) {
  const candidate = { ...final(5), [key]: value };
  if (value === undefined) delete candidate[key];
  assert.equal(inspectCvaResponse(candidate, trusted, 5).draft.ok, true);
  assert.equal(inspectCvaResponse(candidate, trusted, 5).final.ok, false);
}
for (const rating of ['7', 7.5, 0, 10, true]) {
  assert.equal(inspectCvaResponse({ ...final(5), ratings: { ...final(5).ratings, aroma: rating } }, trusted, 5).draft.ok, false);
}
for (const set of [[1, 1], [2, 1], [0], [6], ['1'], [1.5], true]) {
  assert.equal(inspectCvaResponse({ ...final(5), non_uniform_cups: set }, trusted, 5).draft.ok, false);
}
let observed = changeCvaMask(final(5), 'otherBean', [1], 5);
observed = changeCvaMask(observed, 'baked', [1], 5);
assert.equal(inspectCvaResponse(observed, trusted, 5).result.display_score, '79.00');
assert.deepEqual(changeCvaMask(createCvaDraft(5), 'otherBean', [1], 5).defective_cups, []);
const historicalUnassessed = { ...createCvaDraft(5), defective_cups: null, defect_type_masks: null, evenly_defective_all_cups: null };
assert.equal(changeCvaMask(historicalUnassessed, 'otherBean', [1], 5).defective_cups, null);
assert.deepEqual(toggleCvaDefectAssessment(historicalUnassessed).defective_cups, []);
const notes = { ...observed, general_affective_notes: 'Caramel and silky mouthfeel', affective_notes: { mouthfeel: 'Silky', flavor_aftertaste: 'Caramel' }, defect_description: '' };
assert.deepEqual(JSON.parse(JSON.stringify(notes)), notes);
assert.equal(inspectCvaResponse(notes, trusted, 5).final.ok, true);
assert.equal(inspectCvaResponse({ ...notes, defect_type: 'potato' }, trusted, 5).draft.ok, false);
assert.equal(inspectCvaResponse({ ...notes, defect_type_masks: { otherBean: [1] } }, trusted, 5).draft.ok, false);
assert.equal(validateResponse({ ...cvaEnvelope(notes, trusted, 5), complete: 'true' }, trusted).ok, false);
assert.equal(scoreResponse(cvaEnvelope(createCvaDraft(5), trusted, 5), trusted).ok, false);
assert.equal(validateResponse(cvaEnvelope(notes, trusted, 5), { ...trusted, identity: { ...trusted.identity, form_hash: '0'.repeat(64) } }).ok, false);
console.log('CVA successor contract checks passed. Historical hashes unchanged; typed assessment/coherence/observations preserved.');
assert.equal(cvaGuidance(inspectCvaResponse({ ...notes, 'SECRET ETHIOPIA NATURAL': true }, trusted, 5).draft.errors).join(' ').includes('SECRET'), false);
assert.equal(cvaGuidance(['ratings.SECRET:out_of_range']).join(' ').includes('SECRET'), false);
for (const key of ['__proto__', 'constructor', 'toString']) {
  const response = JSON.parse(JSON.stringify(notes).slice(0, -1) + `,${JSON.stringify(key)}:true}`);
  assert.deepEqual(cvaGuidance(inspectCvaResponse(response, trusted, 5).draft.errors), ['Review the assessment data']);
}
