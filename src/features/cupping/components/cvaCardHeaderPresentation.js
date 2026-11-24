// Presentation only. Unknown provenance is never silently compacted away.
const ORDINARY_LABELS = new Set([
  'SCA-104 Affective score',
  'Adapted — five-cup-equivalent Cup App score',
  'Cup App CVA interpretation — independent deductions',
  'Adapted — five-cup-equivalent Cup App CVA interpretation — independent deductions',
]);

export function cvaCardHeaderPresentation(sample, status, finalScore, inactive = false) {
  if (inactive) return { saved: false, subtitle: '', warning: '', provenance: '' };
  const provenance = typeof status?.resultLabel === 'string' ? status.resultLabel : '';
  const ordinary = ORDINARY_LABELS.has(provenance);
  const warning = provenance && !ordinary ? provenance : '';
  const hasTotal = typeof finalScore === 'number' && Number.isFinite(finalScore);
  const count = sample?.cupNumber;
  const validCount = Number.isInteger(count) && count >= 1 && count <= 8;
  const subtitle = hasTotal && validCount
    ? count === 5 ? '5 cups' : `Adapted · ${count} ${count === 1 ? 'cup' : 'cups'}`
    : ordinary ? provenance : '';
  const supported = status?.canonicalCva === true || status?.calculationPolicy === 'sca104-exact-quarter-v1';
  return { saved: Boolean(status?.isComplete && hasTotal && supported && !warning), subtitle, warning, provenance };
}
