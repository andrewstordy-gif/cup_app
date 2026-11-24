const FIELDS = [
  ['FR', 'Fragrance'], ['AR', 'Aroma'], ['FL', 'Flavour'], ['AF', 'Aftertaste'],
  ['AC', 'Acidity'], ['SW', 'Sweetness'], ['MF', 'Mouthfeel'], ['OV', 'Overall'],
];
const CVA_SCORE_PATTERN = 'cva-cw-quality-upright-total-v1';

// Display only: the form still records integer CVA ratings. Total is already
// normalized by the existing ScoreRow boundary, never recomputed here.
function cvaSummaryCells(scores, total) {
  const cells = FIELDS.map(([caption, label], index) => {
    const item = scores?.[index];
    const raw = item?.score;
    const value = typeof raw === 'string' && /^[1-9](?:\.0+)?$/.test(raw.trim()) ? Number(raw.trim()) : raw;
    const valid = Number.isInteger(value) && value >= 1 && value <= 9;
    return { key: `quality-${index}`, caption, label, value: valid ? value.toFixed(2) : '—', isFinal: Boolean(item?.isFinal) };
  });
  const hasTotal = typeof total === 'number' && Number.isFinite(total);
  cells.push({ key: 'total', caption: 'TOTAL', label: 'Total score', value: hasTotal ? Object.is(total, -0) ? '-0.00' : total.toFixed(2) : 'P', isFinal: false });
  return cells;
}

function recordCvaSummaryMeasurement(previous, key, metric, width, height) {
  const known = [...FIELDS.map((_, i) => `quality-${i}`), 'total'].some(field => metric === `${field}:value` || metric === `${field}:caption`);
  if (previous.key !== key || !known || !Number.isFinite(width) || width <= 0 || width >= 10000 ||
    !Number.isFinite(height) || height <= 0 || height >= 10000) return previous;
  const measured = { width: Math.ceil(width), height: Math.ceil(height) };
  if (previous.bounds[metric]?.width === measured.width && previous.bounds[metric]?.height === measured.height) return previous;
  return { key, bounds: { ...previous.bounds, [metric]: measured } };
}

function cvaSummaryLayout(width, fontScale, scale, measured, cells, fontSize = 13, lineHeight = 16, captionSize = 12) {
  const gap = 2 * scale;
  const valueBounds = cells.map(cell => ({
    width: (measured[`${cell.key}:value`]?.width || fontSize * cell.value.length * fontScale) + 1,
    height: (measured[`${cell.key}:value`]?.height || lineHeight * fontScale) + 1,
  }));
  const captionWidths = cells.map(cell => measured[`${cell.key}:caption`]?.width || captionSize * cell.caption.length * fontScale);
  const minimum = Math.max(...valueBounds.slice(0, 8).map((bounds, index) => Math.max(bounds.height, captionWidths[index]) + 3));
  const totalWidth = Math.max(56, valueBounds[8].width + 3, captionWidths[8] + 3);
  const qualityWidth = Math.max(minimum, (width - totalWidth - gap * 8) / 8);
  const cellHeight = Math.max(48, ...valueBounds.slice(0, 8).map(bounds => bounds.width + 3), valueBounds[8].height + 3);
  return { gap, totalWidth, qualityWidth, cellHeight, valueBounds, contentWidth: qualityWidth * 8 + totalWidth + gap * 8 };
}

module.exports = { CVA_SCORE_PATTERN, cvaSummaryCells, recordCvaSummaryMeasurement, cvaSummaryLayout };
