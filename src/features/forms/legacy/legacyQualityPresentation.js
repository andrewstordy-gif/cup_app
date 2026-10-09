const ORDINARY_MARKS = Object.freeze(Array.from({ length: 17 }, (_, i) => 24 + i));
const LOWER_MARKS = Object.freeze(Array.from({ length: 24 }, (_, i) => i));
const ALL_MARKS = Object.freeze([...LOWER_MARKS, ...ORDINARY_MARKS]);

function scoreText(quarter) { return (quarter / 4).toFixed(2); }
function visibleMarks(showLowerScores) { return showLowerScores ? ALL_MARKS : ORDINARY_MARKS; }
function isExtendedMark(quarter) { return quarter != null && (quarter < 24 || quarter > 39); }
function revealLowerForSelected(quarter) { return quarter != null && quarter < 24; }
function defectDeductionText(fraction) {
  const value = fraction.numerator / fraction.denominator;
  return fraction.numerator === 0 ? '0.00' : `−${value.toFixed(2)}`;
}

module.exports = { ORDINARY_MARKS, LOWER_MARKS, visibleMarks, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText };
