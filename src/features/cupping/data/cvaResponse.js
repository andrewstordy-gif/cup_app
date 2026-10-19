// Typed successor capture. Prototype feedback rows are deliberately not an input:
// their shared comments and missing assessment evidence cannot certify a response.
const { PROFILE, validateResponse, scoreResponse } = require('../../forms/contract');
const { canonicalize } = require('../../forms/contract/canonical');

const RATINGS = Object.freeze({ Fragrance: 'fragrance', Aroma: 'aroma', Flavour: 'flavor', Aftertaste: 'aftertaste',
  Acidity: 'acidity', Sweetness: 'sweetness', Mouthfeel: 'mouthfeel', Overall: 'overall' });
const SOURCE_TYPES = Object.freeze(['moldy', 'phenolic', 'potato']);
const ROAST_TYPES = Object.freeze(['underdeveloped', 'baked', 'unevenRoast', 'overdeveloped']);
const NOTES = Object.freeze({ fragrance_aroma: 'Fragrance / Aroma', flavor_aftertaste: 'Flavour / Aftertaste',
  acidity: 'Acidity', sweetness: 'Sweetness', mouthfeel: 'Mouthfeel', overall: 'Overall' });

function createCvaDraft(n) {
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error('Physical cup count must be an integer from 1 to 8.');
  return { ratings: {}, affective_notes: {}, general_affective_notes: '', non_uniform_cups: [],
    defective_cups: [], defect_type_masks: {}, other_bean_cups: [], roast_defect_type_masks: {},
    defect_description: '', evenly_defective_all_cups: false };
}

function sourceUnion(masks) {
  return [...new Set(SOURCE_TYPES.flatMap(key => masks?.[key] || []))].sort((a, b) => a - b);
}

function cvaUiMasks(response) {
  return { ...(response.defect_type_masks || {}), otherBean: response.other_bean_cups || [],
    ...(response.roast_defect_type_masks || {}) };
}

function changeCvaMask(response, key, cups, n) {
  if (key === 'otherBean') return { ...response, other_bean_cups: cups };
  if (ROAST_TYPES.includes(key)) return { ...response, roast_defect_type_masks: { ...response.roast_defect_type_masks, [key]: cups } };
  if (!SOURCE_TYPES.includes(key)) throw new Error('Unsupported CVA defect type.');
  const previous = response.defect_type_masks?.[key] || [];
  if (canonicalize(previous) === canonicalize(cups)) return response;
  const masks = { ...response.defect_type_masks, [key]: cups };
  const defective = sourceUnion(masks);
  return { ...response, defect_type_masks: masks, defective_cups: defective,
    evenly_defective_all_cups: defective.length < n ? false : n === 1 ? true : null };
}

function toggleCvaDefectAssessment(response) {
  if (sourceUnion(response.defect_type_masks).length) return response;
  const assessed = response.defect_type_masks != null;
  return { ...response, defective_cups: assessed ? null : [], defect_type_masks: assessed ? null : {},
    evenly_defective_all_cups: assessed ? null : false };
}

function cvaEnvelope(response, trusted, n, complete = false) {
  return { profile: PROFILE, f: 1, identity: { ...trusted.identity }, cup_count: n, response, complete };
}

function inspectCvaResponse(response, trusted, n) {
  const envelope = cvaEnvelope(response, trusted, n);
  const draft = validateResponse(envelope, trusted);
  const final = validateResponse({ ...envelope, complete: true }, trusted);
  return { draft, final, result: final.ok ? scoreResponse({ ...envelope, complete: true }, trusted) : null };
}

function cvaGuidance(errors = [], response = null, n = null) {
  const labels = {
    ratings: 'Choose all eight quality ratings', non_uniform_cups: 'Assess Uniformity', defective_cups: 'Assess Bean defects',
    defect_type_masks: 'Assess Bean defects', evenly_defective_all_cups: 'Choose whether the defects are even across all cups',
  };
  return [...new Set(errors.map(error => {
    if (error === 'defective_cups:not_non_uniform') return n > 1 && response?.defective_cups?.length === n
      ? 'Mark the affected cups in Uniformity, or confirm the defects are even across all cups'
      : 'Mark each scored-defect cup as non-uniform in Uniformity';
    const [field] = error.split(':');
    const rating = Object.entries(RATINGS).find(([, key]) => field === `ratings.${key}`)?.[0];
    if (rating) return `Choose ${rating}`;
    return Object.prototype.hasOwnProperty.call(labels, field) ? labels[field] : 'Review the assessment data';
  }))];
}

function cvaNoteGroups(response) {
  return [...Object.entries(NOTES).map(([key, label]) => ({ key, label: `${label} notes`, notes: response?.affective_notes?.[key] || '' })),
    { key: 'general_affective_notes', label: 'General tasting notes', notes: response?.general_affective_notes || '' }]
    .filter(group => group.notes.length > 0);
}

module.exports = { RATINGS, SOURCE_TYPES, ROAST_TYPES, NOTES, createCvaDraft, sourceUnion, cvaUiMasks,
  changeCvaMask, toggleCvaDefectAssessment, cvaEnvelope, inspectCvaResponse, cvaGuidance, cvaNoteGroups };
