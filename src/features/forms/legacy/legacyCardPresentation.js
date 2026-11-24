const { scoreText, defectDeductionText } = require('./legacyQualityPresentation');

const QUALITY_FIELDS = [
  ['fragrance_aroma', 'F/A', 'Fragrance / Aroma'], ['flavor', 'FL', 'Flavour'],
  ['aftertaste', 'AF', 'Aftertaste'], ['acidity', 'AC', 'Acidity'], ['body', 'BD', 'Body'],
  ['balance', 'BA', 'Balance'], ['overall', 'OV', 'Overall'],
];
const BEAN_TYPES = [['moldy', 'Mouldy', 'defect-mouldy'], ['phenolic', 'Phenolic', 'defect-phenolic'], ['potato', 'Potato', 'defect-potato'], ['otherBean', 'Other', 'defect-other-bean']];
const ROAST_TYPES = [['underdeveloped', 'Underdeveloped', 'defect-underdeveloped'], ['baked', 'Baked', 'defect-baked'], ['unevenRoast', 'Uneven roast', 'defect-uneven-roast'], ['overdeveloped', 'Overdeveloped', 'defect-overdeveloped']];
const text = value => typeof value === 'string' ? value.trim() : '';
function defectDescriptions(masks, types) {
  return types.flatMap(([key, label, icon]) => {
    const cups = masks?.[key];
    return Array.isArray(cups) && cups.length ? [{ key, icon, label: `${label} · ${cups.length === 1 ? 'Cup' : 'Cups'} ${cups.join(', ')}` }] : [];
  });
}

// Present committed responses only. Complete results are repository-validated;
// incomplete drafts can retain invalid/unassessed judgments. Never score them.
function legacyCardPresentation(saved) {
  const response = saved?.response;
  const result = saved?.complete && saved?.result?.ok ? saved.result : null;
  // scoreResponse returns the physical count already checked against the saved
  // session sample. Qualifying/consistent cup sets are judgments, not this count.
  const count = result?.cup_count;
  const validCount = Number.isInteger(count) && count >= 1 && count <= 8;
  const summaryLabel = !result ? '' : !validCount ? result.label || '' : count === 5 ? '5 cups' : `Adapted · ${count} ${count === 1 ? 'cup' : 'cups'}`;
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
    final: Boolean(result), hasSavedResponse: Boolean(response), resultLabel: result?.label || '', summaryLabel,
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

const LEGACY_SCORE_PATTERN = 'legacy-cw-quality-upright-total-v1';

function recordLegacyScoreMeasurement(previous, key, metric, width, height) {
  const knownMetric = [...QUALITY_FIELDS.map(([field]) => field), 'total'].some(field => metric === `${field}:value` || metric === `${field}:caption`);
  if (previous.key !== key || !knownMetric || !Number.isFinite(width) || width <= 0 || width >= 10000 ||
    !Number.isFinite(height) || height <= 0 || height >= 10000) return previous;
  const measured = { width: Math.ceil(width), height: Math.ceil(height) };
  if (previous.widths[metric]?.width === measured.width && previous.widths[metric]?.height === measured.height) return previous;
  return { key, widths: { ...previous.widths, [metric]: measured } };
}

function legacyCardScoreLayout(width, fontScale = 1, scale = 1, measured = {}, fontSize = 13, scores = [], lineHeight = 16, captionFontSize = 12) {
  const gap = 2 * scale;
  const cells = scores.length ? scores : [...QUALITY_FIELDS.map(([key, caption]) => ({ key, caption, value: '10.00' })), { key: 'total', caption: 'TOTAL', value: '100.00' }];
  // Transform does not swap Yoga bounds. Keep an explicit unrotated text frame
  // (including rounding allowance), then allocate its rotated H×W footprint.
  const valueBounds = cells.map(({ key, value }) => ({
    width: (measured[`${key}:value`]?.width || fontSize * String(value ?? '—').length * fontScale) + 1,
    height: (measured[`${key}:value`]?.height || lineHeight * fontScale) + 1,
  }));
  const captionWidths = cells.map(({ key, caption }) => measured[`${key}:caption`]?.width || captionFontSize * caption.length * fontScale);
  const qualityMinimum = Math.max(...valueBounds.slice(0, 7).map((bounds, i) => Math.max(bounds.height, captionWidths[i]) + 3));
  const totalWidth = Math.max(56, valueBounds[7].width + 3, captionWidths[7] + 3);
  const qualityWidth = Math.max(qualityMinimum, (width - totalWidth - gap * 7) / 7);
  const cellHeight = Math.max(48, ...valueBounds.slice(0, 7).map(bounds => bounds.width + 3), valueBounds[7].height + 3);
  return { gap, totalWidth, qualityWidths: Array(7).fill(qualityWidth), cellHeight, valueBounds,
    contentWidth: qualityWidth * 7 + totalWidth + gap * 7 };
}
module.exports = { legacyCardPresentation, legacyCardScoreLayout, recordLegacyScoreMeasurement, LEGACY_SCORE_PATTERN };
