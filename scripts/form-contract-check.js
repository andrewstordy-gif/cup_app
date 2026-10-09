const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { canonicalize, sha256 } = require('../src/features/forms/contract/canonical');
const { PROFILE, REGISTRY, resolveForm, validateResponse: validateRaw, scoreResponse: scoreRaw } = require('../src/features/forms/contract');

let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
function yes(condition, message) { assert.ok(condition, message); checks += 1; }
const identity = f => resolveForm(PROFILE, f).identity;
// Test convenience only. Production callers must obtain this separately from
// the trusted Session, not derive it from the response being validated.
const sessionFor = input => ({ profile: input.profile, f: input.f, identity: identity(input.f) });
const validateResponse = input => validateRaw(input, sessionFor(input));
const scoreResponse = input => scoreRaw(input, sessionFor(input));
const cups = n => Array.from({ length: n }, (_, i) => i + 1);
const cva = (n, rating = 5) => ({
  profile: PROFILE, f: 1, identity: identity(1), cup_count: n,
  response: { ratings: Object.fromEntries(['fragrance', 'aroma', 'flavor', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel', 'overall'].map(key => [key, rating])), non_uniform_cups: [], defective_cups: [], defect_type: null, evenly_defective_all_cups: false },
});
const legacy = (n, rating = 28) => ({
  profile: PROFILE, f: 2, identity: identity(2), cup_count: n,
  response: { quality_ratings: Object.fromEntries(['fragrance_aroma', 'flavor', 'aftertaste', 'acidity', 'body', 'balance', 'overall'].map(key => [key, rating])), consistent_cups: cups(n), sweet_cups: cups(n), clean_cups: cups(n), scored_defect: null },
});
const mutate = (input, callback) => { const copy = JSON.parse(JSON.stringify(input)); callback(copy); return copy; };
const reject = (input, fragment) => {
  const result = scoreResponse(input);
  yes(!result.ok && result.errors.some(error => error.includes(fragment)), `Expected ${fragment}, got ${JSON.stringify(result)}`);
};

// Independent Node crypto verifies the pure implementation and exact checked-in
// canonical lines (terminal LF belongs to the text fixture, not hashed bytes).
const sanity = { canonicalization_version: 'cup-form-definition-jcs-v1', form_key: 'sca_cva_affective_104_2024', form_version: '1.0.0', protocol_profile: 'ndef4-r1' };
equal(sha256(canonicalize(sanity)), '4fcc4ba57149e2b90204686657e20848b25a485195cab00cadda08f57c0249a3');
equal(sha256('abc'), crypto.createHash('sha256').update('abc', 'utf8').digest('hex'));
equal(canonicalize({ z: 'café — 珈琲', a: 1 }), '{"a":1,"z":"café — 珈琲"}');
assert.throws(() => canonicalize({ a: 1.5 }), /safe integers/); checks += 1;
assert.throws(() => canonicalize('\ud800'), /Unpaired/); checks += 1;
assert.throws(() => canonicalize(new Array(1)), /Sparse/); checks += 1;
for (const [name, f] of [['cva', 1], ['legacy-v2', 2]]) {
  const resolved = resolveForm(PROFILE, f);
  yes(resolved.ok);
  const canonical = canonicalize(resolved.manifest);
  const fixture = fs.readFileSync(path.join(__dirname, `../src/features/forms/contract/fixtures/${name}.canonical.json`), 'utf8');
  yes(fixture.endsWith('\n') && !fixture.slice(0, -1).includes('\n'));
  equal(canonical, fixture.slice(0, -1));
  equal(sha256(canonical), crypto.createHash('sha256').update(Buffer.from(fixture.slice(0, -1), 'utf8')).digest('hex'));
  equal(sha256(canonical), REGISTRY.find(row => row.f === f).form_hash);
  const changed = JSON.parse(JSON.stringify(resolved.manifest));
  changed.scoring.rounding += '-different';
  yes(sha256(canonicalize(changed)) !== resolved.identity.form_hash);
  const changedField = JSON.parse(JSON.stringify(resolved.manifest));
  changedField.fields[0].maximum += 1;
  yes(sha256(canonicalize(changedField)) !== resolved.identity.form_hash);
}
const historicalLegacyBytes = fs.readFileSync(path.join(__dirname, '../src/features/forms/contract/fixtures/legacy.canonical.json'), 'utf8');
const historicalLegacyHash = 'c915e4678f968567091e7eb4b24e97fe19506ebd58bcdd0dbdec2433ea4fb2d4';
equal(sha256(historicalLegacyBytes.slice(0, -1)), historicalLegacyHash);
equal(JSON.parse(historicalLegacyBytes).form_version, '1.0.0');
equal(REGISTRY.filter(row => row.profile === PROFILE && row.f === 2).length, 1);
equal(REGISTRY.find(row => row.f === 2).form_version, '2.0.0');
yes(!REGISTRY.some(row => row.form_hash === historicalLegacyHash));
equal(canonicalize({ b: 2, a: 1 }), canonicalize({ a: 1, b: 2 }));
for (const value of [undefined, null, '1', '2', true, false, 0, 3, 1.5, {}, []]) yes(!resolveForm(PROFILE, value).ok);
yes(!resolveForm('wrong-profile', 1).ok);
yes(!resolveForm(PROFILE, 1, [...REGISTRY, REGISTRY[0]]).ok, 'Ambiguous registry must fail');
yes(!resolveForm(PROFILE, 1, []).ok, 'Absent registry entry must fail');
yes(!resolveForm(PROFILE, 1, [{ ...REGISTRY[0], form_hash: '0'.repeat(64) }]).ok, 'Changed hash must fail');
for (const malformed of [null, undefined, false, 1, [], 'response']) {
  const result = validateRaw(malformed, sessionFor(cva(5)));
  yes(!result.ok && result.errors.includes('response_envelope:invalid_object'));
  const scored = scoreRaw(malformed, sessionFor(cva(5)));
  yes(!scored.ok && scored.errors.includes('response_envelope:invalid_object'));
}
for (const input of [cva(5), legacy(5)]) {
  yes(validateRaw(input).errors.includes('trusted_session:required'));
  yes(scoreRaw(input).errors.includes('trusted_session:required'));
}
const cvaSession = sessionFor(cva(5));
const legacySession = sessionFor(legacy(5));
yes(validateRaw(legacy(5), cvaSession).errors.includes('session_form_mismatch'));
yes(scoreRaw(legacy(5), cvaSession).errors.includes('session_form_mismatch'));
yes(validateRaw(cva(5), legacySession).errors.includes('session_form_mismatch'));
yes(scoreRaw(cva(5), legacySession).errors.includes('session_form_mismatch'));
yes(validateRaw(cva(5), { ...cvaSession, identity: { ...cvaSession.identity, form_hash: '0'.repeat(64) } }).errors.includes('trusted_session:unsupported_form_mapping'));
yes(validateRaw(cva(5), { ...cvaSession, f: 2 }).errors.includes('trusted_session:unsupported_form_mapping'));

equal(scoreResponse(cva(5)).display_score, '79.00');
equal(scoreResponse(cva(5, 9)).display_score, '100.00');
const tie = cva(5, 1); tie.response.ratings.fragrance = 5; // H=12.
equal(scoreResponse(tie).display_score, '60.75');
const cvaDefect = cva(5); cvaDefect.response.non_uniform_cups = [1]; cvaDefect.response.defective_cups = [1]; cvaDefect.response.defect_type = 'potato';
equal(scoreResponse(cvaDefect).display_score, '73.00');
const oneDefect = cva(1); oneDefect.response.defective_cups = [1]; oneDefect.response.defect_type = 'moldy'; oneDefect.response.evenly_defective_all_cups = true;
equal(scoreResponse(oneDefect).display_score, '59.00');
equal(scoreResponse(oneDefect).export_projection.label, 'Adapted — five-cup-equivalent Cup App score');
equal(scoreResponse(cva(5)).adapted, false);
for (let n = 1; n <= 8; n += 1) {
  equal(scoreResponse(cva(n)).display_score, '79.00');
  equal(scoreResponse(cva(n)).adapted, n !== 5);
  const all = cva(n); all.response.defective_cups = cups(n); all.response.defect_type = 'phenolic'; all.response.evenly_defective_all_cups = true;
  equal(scoreResponse(all).display_score, '59.00');
  const none = cva(n); none.response.non_uniform_cups = []; none.response.defective_cups = [];
  yes(scoreResponse(none).ok);
}
reject(mutate(cva(5), x => { x.response.defect_type = 'potato'; }), 'without_cups');
reject(mutate(cva(5), x => { x.response.defective_cups = [1]; }), 'required_for_cups');
reject(mutate(cva(5), x => { x.response.defective_cups = [1]; x.response.defect_type = 'potato'; }), 'not_non_uniform');
reject(mutate(cva(5), x => { x.response.defective_cups = cups(5); x.response.defect_type = 'potato'; x.response.evenly_defective_all_cups = true; x.response.non_uniform_cups = [1, 2, 2]; }), 'invalid_set');
reject(mutate(cva(1), x => { x.response.non_uniform_cups = [1]; }), 'one_cup');
reject(mutate(cva(1), x => { x.response.defective_cups = [1]; x.response.defect_type = 'moldy'; }), 'one_cup_exception');
reject(mutate(cva(5), x => { x.response.ratings.flavor = 0; }), 'out_of_range');
reject(mutate(cva(5), x => { x.response.ratings.extra = 8; }), 'invalid_keys');
reject(mutate(cva(5), x => { x.response.sweet_cups = []; }), 'unsupported_field');
reject(mutate(cva(5), x => { x.response.defective_cups = [6]; }), 'invalid_set');
reject(mutate(cva(5), x => { x.response.defective_cups = [1, 1]; }), 'invalid_set');
reject(mutate(cva(5), x => { delete x.response.defect_type; }), 'unassessed');
reject(mutate(cva(5), x => { delete x.response.non_uniform_cups; }), 'unassessed');
reject(mutate(cva(5), x => { x.response.non_uniform_cups = null; }), 'unassessed');
reject(mutate(cva(5), x => { delete x.response.defective_cups; }), 'unassessed');
reject(mutate(cva(5), x => { x.response.defective_cups = null; }), 'unassessed');
reject(mutate(cva(5), x => { x.identity.form_hash = '0'.repeat(64); }), 'not_session_pinned');
reject(mutate(cva(5), x => { x.identity.form_version = '2.0.0'; }), 'not_session_pinned');
reject(mutate(cva(5), x => { x.identity.form_key = identity(2).form_key; }), 'not_session_pinned');
yes(validateResponse({ ...mutate(cva(5), x => { delete x.response.defect_type; }), complete: false }).ok, 'Incomplete draft is valid but not scoreable');

equal(scoreResponse(legacy(5)).display_score, '79.00');
for (const [mark, expected, outside] of [[0, '30.00', true], [23, '70.25', true], [24, '72.00', false], [39, '98.25', false], [40, '100.00', true]]) {
  const input = legacy(5, mark);
  const scored = scoreResponse(input);
  equal(scored.display_score, expected);
  equal(scored.quality_scale_provenance.outside_published_table_fields.length, outside ? 7 : 0);
  equal(scored.export_projection.quality_scale_provenance, scored.quality_scale_provenance);
  equal(Boolean(scored.quality_scale_provenance.note), outside);
}
const mixedQuality = legacy(5);
mixedQuality.response.quality_ratings.flavor = 40;
equal(scoreResponse(mixedQuality).quality_scale_provenance.outside_published_table_fields, ['flavor']);
const historicalResponse = legacy(5);
historicalResponse.identity = { form_key: 'scaa_legacy_2009a_cupapp', form_version: '1.0.0', form_hash: historicalLegacyHash };
const historicalSession = { profile: PROFILE, f: 2, identity: { ...historicalResponse.identity } };
const historicalBefore = JSON.stringify({ historicalResponse, historicalSession });
equal(validateRaw(historicalResponse, historicalSession).errors, ['trusted_session:unsupported_historical_form_version']);
equal(scoreRaw(historicalResponse, historicalSession).read_only, true);
equal(JSON.stringify({ historicalResponse, historicalSession }), historicalBefore);
reject(historicalResponse, 'not_session_pinned');
for (const qualityKey of Object.keys(legacy(5).response.quality_ratings)) {
  reject(mutate(legacy(5), x => { delete x.response.quality_ratings[qualityKey]; }), `${qualityKey}:unassessed`);
  reject(mutate(legacy(5), x => { x.response.quality_ratings[qualityKey] = '6.00'; }), `${qualityKey}:out_of_range`);
}
const belowZeroTotal = legacy(5, 0);
belowZeroTotal.response.consistent_cups = [];
belowZeroTotal.response.sweet_cups = [];
belowZeroTotal.response.clean_cups = [];
belowZeroTotal.response.scored_defect = { kind: 'fault', description: 'rubbery', affected_cups: cups(5) };
equal(scoreResponse(belowZeroTotal).display_score, '-20.00');
const fault = legacy(5); fault.response.clean_cups = [2, 3, 4, 5]; fault.response.scored_defect = { kind: 'fault', description: 'rubbery', affected_cups: [1] };
equal(scoreResponse(fault).display_score, '73.00');
const oneFault = legacy(1); oneFault.response.scored_defect = { kind: 'fault', description: 'rubbery', affected_cups: [1] };
reject(oneFault, 'marked_clean');
oneFault.response.clean_cups = [];
equal(scoreResponse(oneFault).display_score, '49.00');
const three = legacy(3); three.response.consistent_cups = [1, 2]; three.response.sweet_cups = [1, 2]; three.response.clean_cups = [1, 2]; three.response.scored_defect = { kind: 'taint', description: 'sour', affected_cups: [3] };
equal(scoreResponse(three).exact_score, { numerator: 197, denominator: 3 });
equal(scoreResponse(three).display_score, '65.67');
for (const [n, sizes, expected] of [[6, [5, 4, 5], '72.33'], [7, [6, 5, 7], '74.71'], [8, [7, 6, 8], '75.25']]) {
  const input = legacy(n); [input.response.consistent_cups, input.response.sweet_cups, input.response.clean_cups] = sizes.map(size => cups(size));
  equal(scoreResponse(input).display_score, expected);
  equal(scoreResponse(input).export_projection.label, 'Adapted — five-cup-equivalent Cup App score');
}
for (let n = 1; n <= 8; n += 1) {
  equal(scoreResponse(legacy(n)).display_score, '79.00');
  equal(scoreResponse(legacy(n)).adapted, n !== 5);
  const none = legacy(n); none.response.consistent_cups = n === 1 ? [1] : []; none.response.sweet_cups = []; none.response.clean_cups = [];
  yes(scoreResponse(none).ok);
}
reject(mutate(legacy(1), x => { x.response.consistent_cups = []; }), 'one_cup');
reject(mutate(legacy(5), x => { x.response.quality_ratings.body = 41; }), 'out_of_range');
reject(mutate(legacy(5), x => { x.response.quality_ratings.body = -1; }), 'out_of_range');
reject(mutate(legacy(5), x => { x.response.quality_ratings.body = 0.5; }), 'out_of_range');
reject(mutate(legacy(5), x => { delete x.response.quality_ratings.body; }), 'unassessed');
reject(mutate(legacy(5), x => { x.response.quality_ratings.mouthfeel = 28; }), 'invalid_keys');
reject(mutate(legacy(5), x => { x.response.ratings = {}; }), 'unsupported_field');
reject(mutate(legacy(5), x => { x.response.scored_defect = []; }), 'invalid_object');
reject(mutate(legacy(5), x => { x.response.scored_defect = [{ kind: 'taint' }, { kind: 'fault' }]; }), 'invalid_object');
reject(mutate(legacy(5), x => { delete x.response.scored_defect; }), 'unassessed');
reject(mutate(legacy(5), x => { x.response.scored_defect = { kind: 'taint', description: '  ', affected_cups: [1] }; x.response.clean_cups = []; }), 'required');
reject(mutate(legacy(5), x => { x.response.roast_shade_tick = 5; }), 'out_of_range');
reject(mutate(legacy(5), x => { x.response.wet_aroma_intensity = 0; }), 'out_of_range');
reject(mutate(legacy(5), x => { x.identity = identity(1); }), 'not_session_pinned');
for (const name of ['consistent_cups', 'sweet_cups', 'clean_cups']) {
  reject(mutate(legacy(5), x => { delete x.response[name]; }), 'unassessed');
  reject(mutate(legacy(5), x => { x.response[name] = null; }), 'unassessed');
  const empty = mutate(legacy(5), x => { x.response[name] = []; });
  yes(scoreResponse(empty).ok);
}
for (const n of [0, 9, 1.5, null, '5']) reject(mutate(cva(5), x => { x.cup_count = n; }), 'cup_count');

console.log(`R1-011 pure form contract: ${checks} checks passed`);
