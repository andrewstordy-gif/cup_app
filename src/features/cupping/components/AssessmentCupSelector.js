import React, { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { cupSelectorRows } from './assessmentCupLayout';

function normalizeSelectedSlots(value, maxCount) {
  const limit = Math.max(1, Number(maxCount) || 1);
  const rawList = Array.isArray(value) ? value : [];
  const filtered = rawList
    .map(item => Number.parseInt(item, 10))
    .filter(item => Number.isInteger(item) && item >= 1 && item <= limit);
  return Array.from(new Set(filtered)).sort((a, b) => a - b);
}

export function AssessmentCupSelector({ label, selectedSlots, maxCount, onChange, onSlotPress, disabled = false,
  disabledSlots = [], disabledReason = '', scale = 1 }) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(null);
  const totalCups = Math.max(1, Number(maxCount) || 1);
  const selectedCups = normalizeSelectedSlots(selectedSlots, totalCups);
  const unavailableCups = normalizeSelectedSlots(disabledSlots, totalCups);
  const visibleCupSize = 46 * scale;
  const touchTargetSize = Math.max(44, visibleCupSize);
  const columnGap = totalCups === 8 ? 0 : spacing.xs * scale;
  const availableWidth = Math.min(windowWidth - 2 * spacing.lg * scale, measuredWidth || Infinity);
  const rows = cupSelectorRows(totalCups, touchTargetSize, columnGap, availableWidth);

  const handlePress = cup => {
    const selected = selectedCups.includes(cup);
    if (typeof onSlotPress === 'function') {
      onSlotPress(cup, selected);
      return;
    }
    onChange?.(selected ? selectedCups.filter(slot => slot !== cup) : [...selectedCups, cup].sort((a, b) => a - b));
  };

  return <View style={[styles.row, { rowGap: spacing.xs * scale }]}
    onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)}>
    {rows.map((row, rowIndex) => <View key={rowIndex} style={[styles.cupRow, { columnGap }]}>{row.map(cup => {
      const selected = selectedCups.includes(cup);
      const unavailable = unavailableCups.includes(cup);
      const cupDisabled = disabled || unavailable;
      return <Pressable key={`${label}-${cup}`} style={[styles.touchTarget, { width: touchTargetSize, height: touchTargetSize }]}
        onPress={() => handlePress(cup)} disabled={cupDisabled} accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled: cupDisabled }}
        accessibilityLabel={`${label} cup ${cup}${unavailable && disabledReason ? `, ${disabledReason}` : ''}`}>
        <View style={[styles.cup, { width: visibleCupSize, height: visibleCupSize, borderRadius: 23 * scale, borderWidth: 2.3 * scale },
          selected && styles.cupSelected, cupDisabled && styles.cupDisabled]}>
          <View style={[styles.innerRim, { width: 39 * scale, height: 39 * scale, borderRadius: 19.5 * scale, borderWidth: 1 * scale },
            selected && styles.innerRimSelected, cupDisabled && styles.innerRimDisabled]} />
        </View>
      </Pressable>;
    })}</View>)}
  </View>;
}

const styles = StyleSheet.create({
  row: { width: '100%', alignItems: 'center' },
  cupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  touchTarget: { alignItems: 'center', justifyContent: 'center' },
  cup: { borderColor: colors.inkSoft, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cupSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  cupDisabled: { borderColor: colors.muted, backgroundColor: colors.panel },
  innerRim: { borderColor: colors.quietBorder },
  innerRimSelected: { borderColor: colors.surface },
  innerRimDisabled: { borderColor: colors.muted },
});
