const { canonicalize, sha256 } = require('./canonical');
const cva = require('./manifests/cva.json');
const legacy = require('./manifests/legacy.json');

const PROFILE = 'ndef4-r1';
const ADAPTED_LABEL = 'Adapted — five-cup-equivalent Cup App score';
const REGISTRY = Object.freeze([
  Object.freeze({ profile: PROFILE, f: 1, form_key: 'sca_cva_affective_104_2024', form_version: '1.0.0', form_hash: '0a840b335b4af50d18db3cf210d503b870285c1706710ff803e7633103ad310d' }),
  Object.freeze({ profile: PROFILE, f: 2, form_key: 'scaa_legacy_2009a_cupapp', form_version: '1.0.0', form_hash: 'c915e4678f968567091e7eb4b24e97fe19506ebd58bcdd0dbdec2433ea4fb2d4' }),
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

function checkText(value, name, errors) {
  if (value != null && typeof value !== 'string') errors.push(`${name}:invalid_text`);
}

function checkOptionalInteger(value, definition, errors) {
  if (value != null && (!Number.isInteger(value) || value < definition.minimum || value > definition.maximum)) {
    errors.push(`${definition.id}:out_of_range`);
  }
}

function validateCva(response, manifest, n, errors, complete) {
  checkMapping(response.ratings, field(manifest, 'ratings'), 'ratings', errors, complete);
  if (response.affective_notes != null) {
    const definition = field(manifest, 'affective_notes');
    if (!plain(response.affective_notes) || Object.keys(response.affective_notes).some(key => !definition.keys.includes(key))) {
      errors.push('affective_notes:invalid_keys');
    } else {
      Object.keys(response.affective_notes).forEach(key => checkText(response.affective_notes[key], `affective_notes.${key}`, errors));
    }
  }
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

function validateLegacy(response, manifest, n, errors, complete) {
  checkMapping(response.quality_ratings, field(manifest, 'quality_ratings'), 'quality_ratings', errors, complete);
  for (const name of ['consistent_cups', 'sweet_cups', 'clean_cups']) checkCupSet(response[name], name, n, errors, complete);
  if (n === 1 && Array.isArray(response.consistent_cups) && (response.consistent_cups.length !== 1 || response.consistent_cups[0] !== 1)) {
    errors.push('consistent_cups:one_cup_must_be_one');
  }
  if (!own(response, 'scored_defect') || response.scored_defect === undefined) {
    if (complete) errors.push('scored_defect:unassessed');
  } else if (response.scored_defect !== null) {
    const defect = response.scored_defect;
    if (!plain(defect) || Object.keys(defect).some(key => !['kind', 'description', 'affected_cups'].includes(key))) {
      errors.push('scored_defect:invalid_object');
    } else {
      if (!field(manifest, 'scored_defect').kinds.includes(defect.kind)) errors.push('scored_defect.kind:invalid_enum');
      if (typeof defect.description !== 'string' || defect.description.trim() === '') errors.push('scored_defect.description:required');
      checkCupSet(defect.affected_cups, 'scored_defect.affected_cups', n, errors, true);
      if (Array.isArray(defect.affected_cups) && defect.affected_cups.length === 0) errors.push('scored_defect.affected_cups:empty');
      if (Array.isArray(defect.affected_cups) && Array.isArray(response.clean_cups) && defect.affected_cups.some(cup => response.clean_cups.includes(cup))) {
        errors.push('scored_defect.affected_cups:marked_clean');
      }
    }
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
  const pinned = resolveForm(expectedSession.profile, expectedSession.f, registry);
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
  const resolved = resolveForm(profile, f, registry);
  if (!resolved.ok) errors.push(resolved.error);
  if (!cupCountValid(cup_count)) errors.push('cup_count:out_of_range');
  if (!plain(identity) || !resolved.ok || Object.keys(identity).length !== 3 ||
      identity.form_key !== resolved.identity.form_key || identity.form_version !== resolved.identity.form_version || identity.form_hash !== resolved.identity.form_hash) {
    errors.push('identity:not_session_pinned');
  }
  if (!plain(response)) errors.push('response:invalid_object');
  if (errors.length) return { ok: false, errors };
  const manifest = resolved.manifest;
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
  if (!validation.ok) return { ok: false, errors: validation.errors };
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
    const severity = response.scored_defect === null ? 0 : (response.scored_defect.kind === 'taint' ? 2 : 4);
    const a = response.scored_defect === null ? 0 : response.scored_defect.affected_cups.length;
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
  }
  const adapted = n !== 5;
  const label = adapted ? ADAPTED_LABEL : (f === 1 ? 'SCA-104 Affective score' : 'SCAA Legacy five-cup score');
  const result = { ok: true, identity: { ...identity }, cup_count: n, adapted, label, ...value };
  // The pure export projection repeats identity and adaptation provenance;
  // later persistence/network adapters must use an allowlist of their own.
  return { ...result, export_projection: { identity: { ...identity }, cup_count: n, adapted, label, display_score: value.display_score, exact_score: value.exact_score } };
}

module.exports = { PROFILE, REGISTRY, resolveForm, validateResponse, scoreResponse };
