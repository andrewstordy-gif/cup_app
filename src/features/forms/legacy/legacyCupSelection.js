function selectAllQualifyingCups(count, excludedCups = []) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1 || total > 8) return [];
  const excluded = new Set(Array.isArray(excludedCups) ? excludedCups : []);
  return Array.from({ length: total }, (_, index) => index + 1).filter(cup => !excluded.has(cup));
}

function sameCupSelection(value, cups) {
  return Array.isArray(value) && value.length === cups.length && cups.every(cup => value.includes(cup));
}

module.exports = { selectAllQualifyingCups, sameCupSelection };
