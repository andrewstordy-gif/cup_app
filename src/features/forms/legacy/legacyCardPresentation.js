const { scoreText, defectDeductionText } = require('./legacyQualityPresentation');

const QUALITY_FIELDS = [
  ['fragrance_aroma', 'F/A', 'Fragrance / Aroma'], ['flavor', 'FL', 'Flavour'],
  ['aftertaste', 'AF', 'Aftertaste'], ['acidity', 'AC', 'Acidity'], ['body', 'BD', 'Body'],
  ['balance', 'BA', 'Balance'], ['overall', 'OV', 'Overall'],
];
const BEAN_TYPES = [['moldy', 'Mouldy'], ['phenolic', 'Phenolic'], ['potato', 'Potato'], ['otherBean', 'Other']];
const ROAST_TYPES = [['underdeveloped', 'Underdeveloped'], ['baked', 'Baked'], ['unevenRoast', 'Uneven roast'], ['overdeveloped', 'Overdeveloped']];
const text = value => typeof value === 'string' ? value.trim() : '';
function defectDescriptions(masks, types) {
  return types.flatMap(([key, label]) => {
    const cups = masks?.[key];
    return Array.isArray(cups) && cups.length ? [`${label} · ${cups.length === 1 ? 'Cup' : 'Cups'} ${cups.join(', ')}`] : [];
  });
}

// Present committed responses only. Complete results are repository-validated;
// incomplete drafts can retain invalid/unassessed judgments. Never score them.
function legacyCardPresentation(saved) {
  const response = saved?.response;
  const result = saved?.complete && saved?.result?.ok ? saved.result : null;
  const defect = response?.scored_defect;
  const severity = defect?.kind === 'taint' ? 'Taint' : defect?.kind === 'fault' ? 'Fault' : '';
  const affected = defect?.affected_cups;
  const knownCups = Array.isArray(affected) && affected.length > 0 && affected.every(cup => Number.isInteger(cup) && cup >= 1 && cup <= 8);
  const componentText = key => {
    const fraction = result?.components?.[key];
    if (!fraction) return null;
    return key === 'defect_deduction' ? defectDeductionText(fraction) : (fraction.numerator / fraction.denominator).toFixed(2);
  };
  return {
    quality: QUALITY_FIELDS.map(([key, caption, label]) => {
      const quarter = response?.quality_ratings?.[key];
      return { key, caption, label, value: Number.isInteger(quarter) && quarter >= 0 && quarter <= 40 ? scoreText(quarter) : null };
    }),
    total: result?.display_score != null ? String(result.display_score) : null,
    final: Boolean(result), hasSavedResponse: Boolean(response), resultLabel: result?.label || '',
    extendedNote: result?.quality_scale_provenance?.note || '',
    aromaNotes: text(response?.aroma_qualities), generalNotes: text(response?.notes),
    defectNotes: text(response?.defect_description), roastNotes: text(response?.roast_level_note),
    beanDefects: defectDescriptions(response?.bean_defect_type_masks, BEAN_TYPES),
    roastDefects: defectDescriptions(response?.roast_defect_type_masks, ROAST_TYPES),
    scoredDefect: severity ? `${severity} · ${knownCups ? `Cups ${affected.join(', ')}` : 'Cups not assessed'}` : '',
    checks: [['uniformity', 'Uniformity'], ['sweetness', 'Sweetness'], ['clean_cup', 'Clean Cup'], ['defect_deduction', 'Defect deduction']]
      .map(([key, label]) => ({ key, label, value: componentText(key) })),
  };
}

function recordLegacyScoreMeasurement(previous, key, metric, width) {
  const knownMetric = [...QUALITY_FIELDS.map(([field]) => field), 'total'].some(field => metric === `${field}:value` || metric === `${field}:caption`);
  if (previous.key !== key || !knownMetric || !Number.isFinite(width) || width <= 0 || width >= 10000) return previous;
  const measured = Math.ceil(width);
  if (previous.widths[metric] === measured) return previous;
  return { key, widths: { ...previous.widths, [metric]: measured } };
}

function legacyCardScoreLayout(width, fontScale = 1, scale = 1, measured = {}, fontSize = 12, scores = []) {
  const gap = 2 * scale;
  // Until native same-style glyph measurements arrive, leave generous intrinsic
  // space and scroll. Never squeeze a five-character value into a guessed 32pt.
  // Three layout points cover both 1pt borders and native rounding.
  const cells = scores.length ? scores : [...QUALITY_FIELDS.map(([key, caption]) => ({ key, caption, value: '10.00' })), { key: 'total', caption: 'TOTAL', value: '100.00' }];
  const minimumWidths = cells.map(({ key, caption, value }) => Math.max(
    measured[`${key}:value`] || fontSize * String(value ?? '—').length * fontScale,
    measured[`${key}:caption`] || fontSize * caption.length * fontScale,
  ) + 3);
  const intrinsicWidth = minimumWidths.reduce((sum, cell) => sum + cell, 0) + gap * 7;
  const extra = Math.max(0, (width - intrinsicWidth) / 8);
  const qualityWidths = minimumWidths.slice(0, 7).map(cell => cell + extra);
  const totalWidth = minimumWidths[7] + extra;
  return { gap, totalWidth, qualityWidths, contentWidth: intrinsicWidth + extra * 8 };
}
module.exports = { legacyCardPresentation, legacyCardScoreLayout, recordLegacyScoreMeasurement };
