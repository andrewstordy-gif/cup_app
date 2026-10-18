// Calculation provenance is independent of the defect taxonomy policy.
// NULL means the original prototype floating-point calculation, not the new rule.
export const CVA_EXACT_CALCULATION_POLICY = 'sca104-exact-quarter-v1';
export const CVA_UNKNOWN_CALCULATION_MESSAGE = 'This saved result uses an unsupported calculation rule. Its total is unavailable and its assessment is read-only. The saved data has not been changed.';
export const CVA_PREVIOUS_CALCULATION_MESSAGE = 'This saved result uses the previous Cup App rounding calculation. Its saved total is retained until you explicitly save with the current calculation.';

export function isSupportedCvaCalculationPolicy(policy) {
  return policy === null || policy === CVA_EXACT_CALCULATION_POLICY;
}

export function calculateCvaScore({ sumHi, nonUniformCups = 0, defectiveCups = 0, numberOfCups = 1,
  calculationPolicy = CVA_EXACT_CALCULATION_POLICY } = {}) {
  if (!isSupportedCvaCalculationPolicy(calculationPolicy)) return null;
  const sum = Number(sumHi);
  const n = Number(numberOfCups);
  const u = Number(nonUniformCups);
  const d = Number(defectiveCups);
  if (![sum, n, u, d].every(Number.isFinite) || n < 1) return null;
  if (calculationPolicy === null) {
    // Preserve the old operation order exactly for saved prototype results.
    const uNormalized = (u / n) * 5;
    const dNormalized = (d / n) * 5;
    const value = 0.65625 * sum + 52.75 - 2 * uNormalized - 4 * dNormalized;
    return Math.round((value + Number.EPSILON) / 0.25) * 0.25;
  }
  if (![sum, n, u, d].every(Number.isInteger) || n > 8 || sum < 8 || sum > 72 || u < 0 || u > n || d < 0 || d > n) return null;
  const numerator = 21 * sum * n + 1688 * n - 320 * u - 640 * d;
  // Exact nearest quarter, ties upward, once after all deductions.
  return Math.floor((2 * numerator + 8 * n) / (16 * n)) / 4;
}

export function cvaCalculationLabel(policy) {
  if (policy === null) return 'Saved under previous Cup App rounding calculation';
  if (policy !== CVA_EXACT_CALCULATION_POLICY) return 'Unsupported saved calculation · total unavailable';
  return null;
}

export function cvaResultLabel(policy, numberOfCups, defectPolicy) {
  return [Number(numberOfCups) !== 5 ? 'Adapted — five-cup-equivalent Cup App score' : null,
    defectPolicy === null ? 'Saved under previous Cup App defect rule' : null,
    cvaCalculationLabel(policy)].filter(Boolean).join(' · ') || null;
}

// Both explicit Save entry points use this decision before starting any writes.
export function getCvaScoreUpdate({ savedInput, draftInput, savedPolicy, defectPolicyWillChange = false } = {}) {
  const oldScore = savedInput ? calculateCvaScore({ ...savedInput, calculationPolicy: savedPolicy }) : null;
  const newScore = draftInput ? calculateCvaScore({ ...draftInput, calculationPolicy: CVA_EXACT_CALCULATION_POLICY }) : null;
  const correctedSavedScore = savedInput ? calculateCvaScore({ ...savedInput, calculationPolicy: CVA_EXACT_CALCULATION_POLICY }) : null;
  const historicalDraftScore = draftInput ? calculateCvaScore({ ...draftInput, calculationPolicy: null }) : null;
  const roundingWillChange = savedPolicy === null && oldScore != null && (
    (oldScore != null && correctedSavedScore != null && oldScore !== correctedSavedScore) ||
    (newScore != null && historicalDraftScore != null && newScore !== historicalDraftScore));
  return { requiresConfirmation: defectPolicyWillChange || roundingWillChange, roundingWillChange, oldScore, newScore };
}
