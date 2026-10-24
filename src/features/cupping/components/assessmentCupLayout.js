function cupSelectorRows(totalCups, targetSize, gap, availableWidth) {
  const cups = Array.from({ length: totalCups }, (_, index) => index + 1);
  const requiredWidth = totalCups * targetSize + Math.max(0, totalCups - 1) * gap;
  if (requiredWidth <= availableWidth || totalCups === 1) return [cups];
  const firstRowCount = Math.ceil(totalCups / 2);
  return [cups.slice(0, firstRowCount), cups.slice(firstRowCount)];
}

module.exports = { cupSelectorRows };
