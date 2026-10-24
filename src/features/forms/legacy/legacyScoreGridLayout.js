function legacyScoreGridLayout({ screenWidth, fontScale = 1, fontSize, panelPadding, gap }) {
  const availableWidth = Math.max(0, screenWidth - 4 * panelPadding);
  // Allow more than four character widths for the widest exact label, "10.00".
  const minimumChoiceWidth = Math.max(44, Math.ceil(4.5 * fontSize * fontScale + 2 * gap));
  const columns = Math.max(1, Math.min(4, Math.floor((availableWidth + gap) / (minimumChoiceWidth + gap))));
  return {
    columns,
    choiceWidth: Math.max(44, (availableWidth - (columns - 1) * gap) / columns),
  };
}

module.exports = { legacyScoreGridLayout };
