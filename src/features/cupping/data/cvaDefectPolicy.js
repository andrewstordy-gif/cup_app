// A null policy identifies rows saved by the earlier prototype, where Other
// contributed to defective_cups. Keep their stored count until an explicit Save.
export const CVA_SCORED_DEFECT_POLICY = "sca104-three-types-v1";
export const CVA_SCORED_DEFECT_KEYS = ["moldy", "phenolic", "potato"];

export function getCvaScoredDefectSlots(defectCupSlots = {}, numberOfCups = 1, legacyFlags = {}) {
  const limit = Math.max(1, Number.parseInt(numberOfCups, 10) || 1);
  const hasTypedMasks = Object.keys(defectCupSlots || {}).length > 0;
  const slots = hasTypedMasks
    ? CVA_SCORED_DEFECT_KEYS.flatMap((key) => Array.isArray(defectCupSlots?.[key]) ? defectCupSlots[key] : [])
    : CVA_SCORED_DEFECT_KEYS.some((key) => legacyFlags?.[key]) ? [1] : [];
  return Array.from(new Set(slots
    .map((slot) => Number.parseInt(slot, 10))
    .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= limit)))
    .sort((a, b) => a - b);
}

export function resolveCvaDefectiveCupCount({
  scoredSlots = [], savedPolicy = CVA_SCORED_DEFECT_POLICY,
  hasSavedEntry = false, savedCount = 0, hasUnsavedChanges = false,
} = {}) {
  return hasSavedEntry && savedPolicy === null && !hasUnsavedChanges
    ? Math.max(0, Number.parseInt(savedCount, 10) || 0)
    : scoredSlots.length;
}
