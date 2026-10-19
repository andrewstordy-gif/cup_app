const { canonicalize, sha256 } = require('./canonical');
const cva = require('./manifests/cva.json');
const historicalCvaV1 = require('./manifests/cva-v1.json');
const historicalCvaV11 = require('./manifests/cva-v1.1.json');
const historicalCvaV2 = require('./manifests/cva-v2.json');
const legacy = require('./manifests/legacy.json');

const PROFILE = 'ndef4-r1';
const HISTORICAL_CVA_V1 = Object.freeze({
  form_key: 'sca_cva_affective_104_2024', form_version: '1.0.0',
  form_hash: '0a840b335b4af50d18db3cf210d503b870285c1706710ff803e7633103ad310d',
});
const ADAPTED_LABEL = 'Adapted — five-cup-equivalent Cup App score';
const HISTORICAL_CVA_V2 = Object.freeze({ form_key: 'sca_cva_affective_104_2024', form_version: '2.0.0',
  form_hash: '74c34bdb55364410f9ba828940b5453984188c4ac5a8cc314b567c86c52a581f' });
const HISTORICAL_CVA_V11 = Object.freeze({
  form_key: 'sca_cva_affective_104_2024', form_version: '1.1.0',
  form_hash: '2a9e341fb17664559875a08235a01f88571a3833682ead2a1de09558ba6bf0bb',
});
const HISTORICAL_LEGACY_V1 = Object.freeze({
  form_key: 'scaa_legacy_2009a_cupapp', form_version: '1.0.0',
  form_hash: 'c915e4678f968567091e7eb4b24e97fe19506ebd58bcdd0dbdec2433ea4fb2d4',
});
const HISTORICAL_LEGACY_V2 = Object.freeze({
  form_key: 'scaa_legacy_2009a_cupapp', form_version: '2.0.0',
  form_hash: '2a0c0b02bf2bf2f9c5351d45d19c2083adea1dc704241af234ebca0f0c2440de',
});
const HISTORICAL_LEGACY_V3 = Object.freeze({
  form_key: 'scaa_legacy_2009a_cupapp', form_version: '3.0.0',
  form_hash: '0ccdaeb5c5a4da72ebeec30ef5d21eecfb4b7659b25ac1895a35eceb25d8cb32',
});
const EXTENDED_QUALITY_NOTE = 'Includes Cup App-expanded quality marks outside the published 2009 6.00–9.75 table';
const REGISTRY = Object.freeze([
  Object.freeze({ profile: PROFILE, f: 1, form_key: 'sca_cva_affective_104_2024', form_version: '3.0.0', form_hash: '38d02095523c13def4dc1d29bb25cbeaebb4bcfd1d94ade60ad278642b8b6051' }),
  Object.freeze({ profile: PROFILE, f: 2, form_key: 'scaa_legacy_2009a_cupapp', form_version: '4.0.0', form_hash: '977ae56dedaa331920d40f9c62fe77a8ce67b3dac2d19db86a252746a56061bf' }),
]);
const MANIFESTS = Object.freeze({ 1: cva, 2: legacy });

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
freezeDeep(cva);
freezeDeep(historicalCvaV1);
freezeDeep(historicalCvaV11);
freezeDeep(historicalCvaV2);
freezeDeep(legacy);

function resolveForm(profile, f, registry = REGISTRY) {
  if (profile !== PROFILE || typeof f !== 'number' || !Number.isInteger(f) || !Array.isArray(registry)) {
    return { ok: false, error: 'unsupported_form_mapping' };
  }
  const matches = registry.filter(row => row && row.profile === profile && row.f === f);
  if (matches.length !== 1) return { ok: false, error: 'unsupported_form_mapping' };
  const entry = matches[0];
  const manifest = MANIFESTS[f];
  if (!manifest || manifest.protocol_profile !== profile || manifest.ndef_form_value !== f ||
      manifest.form_key !== entry.form_key || manifest.form_version !== entry.form_version ||
      sha256(canonicalize(manifest)) !== entry.form_hash) {
    return { ok: false, error: 'unsupported_form_mapping' };
  }
  return { ok: true, identity: { form_key: entry.form_key, form_version: entry.form_version, form_hash: entry.form_hash }, manifest };
}

// Historical local pins are resolved only from an independently trusted Session
// identity. NDEF still has one active mapping per numeric form value.
function resolvePinnedForm(profile, f, identity, registry = REGISTRY) {
  const active = resolveForm(profile, f, registry);
  if (active.ok && plain(identity) && Object.keys(identity).length === 3 &&
      Object.keys(active.identity).every(key => identity[key] === active.identity[key])) return active;
  if (profile === PROFILE && f === 1 && plain(identity) && Object.keys(identity).length === 3 &&
      Object.keys(HISTORICAL_CVA_V2).every(key => identity[key] === HISTORICAL_CVA_V2[key]) &&
      sha256(canonicalize(historicalCvaV2)) === HISTORICAL_CVA_V2.form_hash) {
    return { ok: true, identity: { ...HISTORICAL_CVA_V2 }, manifest: historicalCvaV2, historical: true };
  }
  if (profile === PROFILE && f === 1 && plain(identity) && Object.keys(identity).length === 3 &&
      Object.keys(HISTORICAL_CVA_V11).every(key => identity[key] === HISTORICAL_CVA_V11[key]) &&
      sha256(canonicalize(historicalCvaV11)) === HISTORICAL_CVA_V11.form_hash) {
    return { ok: true, identity: { ...HISTORICAL_CVA_V11 }, manifest: historicalCvaV11, historical: true };
  }
  if (profile === PROFILE && f === 1 && plain(identity) && Object.keys(identity).length === 3 &&
      Object.keys(HISTORICAL_CVA_V1).every(key => identity[key] === HISTORICAL_CVA_V1[key]) &&
      sha256(canonicalize(historicalCvaV1)) === HISTORICAL_CVA_V1.form_hash) {
    return { ok: true, identity: { ...HISTORICAL_CVA_V1 }, manifest: historicalCvaV1, historical: true };
  }
  return { ok: false, error: 'unsupported_form_mapping' };
}

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const cupCountValid = n => Number.isInteger(n) && n >= 1 && n <= 8;
const fieldIds = manifest => manifest.fields.map(field => field.id);
const field = (manifest, id) => manifest.fields.find(item => item.id === id);

function checkMapping(value, definition, name, errors, complete) {
  if (value == null) {
    if (complete) errors.push(`${name}:unassessed`);
    return;
  }
  if (!plain(value) || Object.keys(value).some(key => !definition.keys.includes(key))) {
    errors.push(`${name}:invalid_keys`);
    return;
  }
  for (const key of definition.keys) {
    if (!own(value, key) || value[key] == null) {
      if (complete) errors.push(`${name}.${key}:unassessed`);
    } else if (!Number.isInteger(value[key]) || value[key] < definition.minimum || value[key] > definition.maximum) {
      errors.push(`${name}.${key}:out_of_range`);
    }
  }
}

function checkCupSet(value, name, n, errors, complete) {
  if (value == null) {
    if (complete) errors.push(`${name}:unassessed`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${name}:invalid_set`);
    return;
  }
  let previous = 0;
  for (const cup of value) {
    if (!Number.isInteger(cup) || cup <= previous || cup < 1 || cup > n) {
      errors.push(`${name}:invalid_set`);
      return;
    }
    previous = cup;
  }
}

function checkDefectTypeMasks(value, definition, name, n, errors) {
  if (value == null) return [];
  if (!plain(value) || Object.keys(value).some(key => !definition.keys.includes(key))) {
    errors.push(`${name}:invalid_keys`);
    return [];
  }
  const selected = new Set();
  for (const [key, cups] of Object.entries(value)) {
    checkCupSet(cups, `${name}.${key}`, n, errors, true);
    if (Array.isArray(cups)) cups.forEach(cup => selected.add(cup));
  }
  return [...selected].sort((a, b) => a - b);
}

function checkText(value, name, errors) {
  if (value != null && typeof value !== 'string') errors.push(`${name}:invalid_text`);
}

function checkOptionalInteger(value, definition, errors) {
  if (value != null && (!Number.isInteger(value) || value < definition.minimum || value > definition.maximum)) {
    errors.push(`${definition.id}:out_of_range`);
  }
}

function validateCva(response, manifest, n, errors, complete) {
  if (['2.0.0', '3.0.0'].includes(manifest.form_version)) {
    validateCvaV2(response, manifest, n, errors, complete);
    return;
  }
  checkMapping(response.ratings, field(manifest, 'ratings'), 'ratings', errors, complete);
  if (response.affective_notes != null) {
    const definition = field(manifest, 'affective_notes');
    if (!plain(response.affective_notes) || Object.keys(response.affective_notes).some(key => !definition.keys.includes(key))) {
      errors.push('affective_notes:invalid_keys');
    } else {
      Object.keys(response.affective_notes).forEach(key => checkText(response.affective_notes[key], `affective_notes.${key}`, errors));
    }
  }
  if (field(manifest, 'defect_description')) checkText(response.defect_description, 'defect_description', errors);
  checkCupSet(response.non_uniform_cups, 'non_uniform_cups', n, errors, complete);
  checkCupSet(response.defective_cups, 'defective_cups', n, errors, complete);
  if (!own(response, 'defect_type') || response.defect_type === undefined) {
    if (complete) errors.push('defect_type:unassessed');
  } else if (response.defect_type !== null && !field(manifest, 'defect_type').values.includes(response.defect_type)) {
    errors.push('defect_type:invalid_enum');
  }
  if (!own(response, 'evenly_defective_all_cups') || response.evenly_defective_all_cups == null) {
    if (complete) errors.push('evenly_defective_all_cups:unassessed');
  } else if (typeof response.evenly_defective_all_cups !== 'boolean') {
    errors.push('evenly_defective_all_cups:invalid_boolean');
  }
  const uniform = response.non_uniform_cups;
  const defective = response.defective_cups;
  if (Array.isArray(uniform) && Array.isArray(defective)) {
    if (n === 1 && uniform.length !== 0) errors.push('non_uniform_cups:one_cup_must_be_empty');
    if (defective.length === 0 && response.defect_type !== undefined && response.defect_type !== null) errors.push('defect_type:without_cups');
    if (defective.length > 0 && response.defect_type === null) errors.push('defect_type:required_for_cups');
    if (response.evenly_defective_all_cups === true && defective.length !== n) errors.push('evenly_defective_all_cups:not_all_defective');
    if (n === 1 && defective.length === 1 && response.evenly_defective_all_cups === false) errors.push('evenly_defective_all_cups:one_cup_exception_required');
    if (defective.length === 0 && response.evenly_defective_all_cups === true) errors.push('evenly_defective_all_cups:without_defect');
    if (response.evenly_defective_all_cups === false && defective.some(cup => !uniform.includes(cup))) errors.push('defective_cups:not_non_uniform');
  }
}

// A structurally valid draft may retain unresolved qualitative judgments.
// Only complete validation certifies cross-field coherence and yields a score.
function validateCvaV2(response, manifest, n, errors, complete) {
  checkMapping(response.ratings, field(manifest, 'ratings'), 'ratings', errors, complete);
  if (response.affective_notes != null) {
    const definition = field(manifest, 'affective_notes');
    if (!plain(response.affective_notes) || Object.keys(response.affective_notes).some(key => !definition.keys.includes(key))) {
      errors.push('affective_notes:invalid_keys');
    } else {
      Object.entries(response.affective_notes).forEach(([key, value]) => checkText(value, `affective_notes.${key}`, errors));
    }
  }
  for (const name of ['general_affective_notes', 'defect_description']) checkText(response[name], name, errors);
  for (const name of ['non_uniform_cups', 'defective_cups']) checkCupSet(response[name], name, n, errors, complete);
  checkCupSet(response.other_bean_cups, 'other_bean_cups', n, errors, false);
  const source = response.defect_type_masks;
  if (source == null && complete) errors.push('defect_type_masks:unassessed');
  const sourceCups = checkDefectTypeMasks(source, field(manifest, 'defect_type_masks'), 'defect_type_masks', n, errors);
  checkDefectTypeMasks(response.roast_defect_type_masks, field(manifest, 'roast_defect_type_masks'), 'roast_defect_type_masks', n, errors);
  const even = response.evenly_defective_all_cups;
  if (even == null) {
    if (complete && manifest.form_version === '2.0.0') errors.push('evenly_defective_all_cups:unassessed');
  } else if (typeof even !== 'boolean') errors.push('evenly_defective_all_cups:invalid_boolean');
  if (!complete || errors.length) return;
  const defective = response.defective_cups;
  const uniform = response.non_uniform_cups;
  if (sourceCups.length !== defective.length || sourceCups.some((cup, index) => cup !== defective[index])) {
    errors.push('defective_cups:must_match_source_type_masks');
  }
  if (n === 1 && uniform.length !== 0) errors.push('non_uniform_cups:one_cup_must_be_empty');
  if (manifest.form_version === '3.0.0') return;
  if (even === true && defective.length !== n) errors.push('evenly_defective_all_cups:not_all_defective');
  if (n === 1 && defective.length === 1 && even !== true) errors.push('evenly_defective_all_cups:one_cup_exception_required');
  if (even === false && defective.some(cup => !uniform.includes(cup))) errors.push('defective_cups:not_non_uniform');
}

function validateLegacy(response, manifest, n, errors, complete) {
  checkMapping(response.quality_ratings, field(manifest, 'quality_ratings'), 'quality_ratings', errors, complete);
  for (const name of ['consistent_cups', 'sweet_cups', 'clean_cups']) checkCupSet(response[name], name, n, errors, complete);
  if (n === 1 && Array.isArray(response.consistent_cups) && (response.consistent_cups.length !== 1 || response.consistent_cups[0] !== 1)) {
    errors.push('consistent_cups:one_cup_must_be_one');
  }
  const beanCups = checkDefectTypeMasks(response.bean_defect_type_masks, field(manifest, 'bean_defect_type_masks'), 'bean_defect_type_masks', n, errors);
  checkDefectTypeMasks(response.roast_defect_type_masks, field(manifest, 'roast_defect_type_masks'), 'roast_defect_type_masks', n, errors);
  if (response.scored_defect != null) {
    const defect = response.scored_defect;
    if (!plain(defect) || Object.keys(defect).some(key => !['kind', 'affected_cups'].includes(key))) {
      errors.push('scored_defect:invalid_object');
    } else {
      if (!field(manifest, 'scored_defect').kinds.includes(defect.kind)) errors.push('scored_defect.kind:invalid_enum');
      checkCupSet(defect.affected_cups, 'scored_defect.affected_cups', n, errors, true);
      if (Array.isArray(defect.affected_cups) && defect.affected_cups.length === 0) errors.push('scored_defect.affected_cups:empty');
      if (Array.isArray(defect.affected_cups) && (beanCups.length !== defect.affected_cups.length || beanCups.some((cup, index) => cup !== defect.affected_cups[index]))) {
        errors.push('bean_defect_type_masks:must_match_affected_cups');
      }
      if (Array.isArray(defect.affected_cups) && Array.isArray(response.clean_cups) && defect.affected_cups.some(cup => response.clean_cups.includes(cup))) {
        errors.push('scored_defect.affected_cups:marked_clean');
      }
    }
  } else if (beanCups.length > 0) {
    errors.push('bean_defect_type_masks:without_scored_defect');
  }
  for (const definition of manifest.fields) {
    if (!own(response, definition.id)) continue;
    if (definition.type === 'optional_integer') checkOptionalInteger(response[definition.id], definition, errors);
    if (definition.type === 'optional_text') checkText(response[definition.id], definition.id, errors);
  }
}

// expectedSession must come from the caller's independently trusted Session,
// never from the untrusted response envelope or its NDEF evidence. Without it,
// a self-consistent form response could be attached to a different form Session.
// Drafts can be incomplete but never yield a final score/export projection.
function validateResponse(input, expectedSession, registry = REGISTRY) {
  const errors = [];
  if (!plain(input)) return { ok: false, errors: ['response_envelope:invalid_object'] };
  if (!plain(expectedSession)) return { ok: false, errors: ['trusted_session:required'] };
  const { profile, f, identity, cup_count, response, complete = false } = input;
  // A trusted historical pin is deliberately not remapped to the active f=2
  // definition. The caller may display its stored bytes read-only; this pure
  // contract never mutates or re-scores them.
  if (expectedSession.profile === PROFILE && expectedSession.f === 2 && plain(expectedSession.identity) &&
      Object.keys(expectedSession.identity).length === 3 &&
      [HISTORICAL_LEGACY_V1, HISTORICAL_LEGACY_V2, HISTORICAL_LEGACY_V3].some(historical =>
        Object.keys(historical).every(key => expectedSession.identity[key] === historical[key]))) {
    return { ok: false, read_only: true, errors: ['trusted_session:unsupported_historical_form_version'] };
  }
  const pinned = resolvePinnedForm(expectedSession.profile, expectedSession.f, expectedSession.identity, registry);
  if (!pinned.ok || !plain(expectedSession.identity) || Object.keys(expectedSession.identity).length !== 3 ||
      expectedSession.identity.form_key !== pinned.identity.form_key ||
      expectedSession.identity.form_version !== pinned.identity.form_version ||
      expectedSession.identity.form_hash !== pinned.identity.form_hash) {
    return { ok: false, errors: ['trusted_session:unsupported_form_mapping'] };
  }
  if (profile !== expectedSession.profile || f !== expectedSession.f || !plain(identity) ||
      Object.keys(identity).length !== 3 ||
      identity.form_key !== expectedSession.identity.form_key ||
      identity.form_version !== expectedSession.identity.form_version ||
      identity.form_hash !== expectedSession.identity.form_hash) {
    errors.push('session_form_mismatch');
  }
  const resolved = resolvePinnedForm(profile, f, identity, registry);
  if (!resolved.ok) errors.push(resolved.error);
  if (!cupCountValid(cup_count)) errors.push('cup_count:out_of_range');
  if (!plain(identity) || !resolved.ok || Object.keys(identity).length !== 3 ||
      identity.form_key !== resolved.identity.form_key || identity.form_version !== resolved.identity.form_version || identity.form_hash !== resolved.identity.form_hash) {
    errors.push('identity:not_session_pinned');
  }
  if (!plain(response)) errors.push('response:invalid_object');
  if (errors.length) return { ok: false, errors };
  const manifest = resolved.manifest;
  if (f === 1 && ['2.0.0', '3.0.0'].includes(manifest.form_version)) {
    if (Object.keys(input).some(key => !['profile', 'f', 'identity', 'cup_count', 'response', 'complete'].includes(key))) errors.push('response_envelope:unsupported_field');
    if (typeof complete !== 'boolean') errors.push('complete:invalid_boolean');
  }
  const allowed = fieldIds(manifest);
  for (const key of Object.keys(response)) if (!allowed.includes(key)) errors.push(`${key}:unsupported_field`);
  if (f === 1) validateCva(response, manifest, cup_count, errors, complete);
  if (f === 2) validateLegacy(response, manifest, cup_count, errors, complete);
  return { ok: errors.length === 0, errors, complete: complete && errors.length === 0 };
}

function roundHalfUp(numerator, denominator) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
function fraction(numerator, denominator) {
  const divisor = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
function centsText(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

function scoreResponse(input, expectedSession) {
  const validation = validateResponse(plain(input) ? { ...input, complete: true } : input, expectedSession);
  if (!validation.ok) return { ok: false, errors: validation.errors, ...(validation.read_only ? { read_only: true } : {}) };
  const { f, cup_count: n, response, identity } = input;
  let value;
  if (f === 1) {
    const sum = Object.values(response.ratings).reduce((a, b) => a + b, 0);
    const numerator = 21 * sum * n + 1688 * n - 320 * response.non_uniform_cups.length - 640 * response.defective_cups.length;
    const quarterPoints = roundHalfUp(numerator, 8 * n);
    value = { score_quarter_points: quarterPoints, exact_score: fraction(numerator, 32 * n), display_score: centsText(quarterPoints * 25) };
  } else {
    const q = Object.values(response.quality_ratings).reduce((a, b) => a + b, 0);
    const c = response.consistent_cups.length;
    const s = response.sweet_cups.length;
    const k = response.clean_cups.length;
    const severity = response.scored_defect == null ? 0 : (response.scored_defect.kind === 'taint' ? 2 : 4);
    const a = response.scored_defect == null ? 0 : response.scored_defect.affected_cups.length;
    const numerator = q * n + 40 * (c + s + k) - 20 * severity * a;
    const denominator = 4 * n;
    value = {
      exact_score: fraction(numerator, denominator),
      display_score: centsText(roundHalfUp(numerator * 100, denominator)),
      components: {
        quality: fraction(q, 4), uniformity: fraction(10 * c, n), sweetness: fraction(10 * s, n),
        clean_cup: fraction(10 * k, n), defect_deduction: fraction(5 * severity * a, n),
      },
    };
    const qualityField = field(resolveForm(PROFILE, f).manifest, 'quality_ratings');
    const outsideFields = qualityField.keys.filter(key => response.quality_ratings[key] < qualityField.published_table_minimum ||
      response.quality_ratings[key] > qualityField.published_table_maximum);
    value.quality_scale_provenance = {
      published_table: '2009 protocol 6.00–9.75',
      outside_published_table_fields: outsideFields,
      note: outsideFields.length > 0 ? EXTENDED_QUALITY_NOTE : null,
    };
  }
  const adapted = n !== 5;
  const label = f === 1 && identity.form_version === '3.0.0'
    ? (adapted ? cva.scoring.other_cup_label : cva.scoring.five_cup_label)
    : adapted ? ADAPTED_LABEL : (f === 1 ? 'SCA-104 Affective score' : 'SCAA Legacy five-cup score');
  const result = { ok: true, identity: { ...identity }, cup_count: n, adapted, label, ...value };
  // The pure export projection repeats identity and adaptation provenance;
  // later persistence/network adapters must use an allowlist of their own.
  return { ...result, export_projection: { identity: { ...identity }, cup_count: n, adapted, label, display_score: value.display_score, exact_score: value.exact_score,
    ...(value.quality_scale_provenance ? { quality_scale_provenance: value.quality_scale_provenance } : {}) } };
}

module.exports = { PROFILE, REGISTRY, resolveForm, resolvePinnedForm, validateResponse, scoreResponse };
