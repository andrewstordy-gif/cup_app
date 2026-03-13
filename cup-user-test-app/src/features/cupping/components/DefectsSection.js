import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

const DEFECT_OPTIONS = [
  {
    key: "moldy",
    title: "MOULDY",
    description: "Damp, earthy, or fungal characteristics.",
  },
  {
    key: "phenolic",
    title: "PHENOLIC",
    description: "Chemical, medicinal, or smoky rubber-like taint.",
  },
  {
    key: "potato",
    title: "POTATO",
    description: "Raw vegetable or tuber-like odor (Antestia bug).",
  },
];

function DefectRow({ title, description, checked, onPress, disabled = false }) {
  return (
    <Pressable
      style={[styles.defectRow, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`${title} defect`}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
      <View style={styles.defectTextWrap}>
        <Text style={[styles.defectTitle, disabled && styles.disabledTextStrong]}>{title}</Text>
        <Text style={[styles.defectDescription, disabled && styles.disabledTextBody]}>{description}</Text>
      </View>
    </Pressable>
  );
}

function normalizeSelectedSlots(value, maxCount) {
  const limit = Math.max(1, Number(maxCount) || 1);
  const rawList = Array.isArray(value) ? value : [];
  const filtered = rawList
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= limit);
  return Array.from(new Set(filtered)).sort((a, b) => a - b);
}

function CountRow({ label, selectedSlots, maxCount, onChange, disabled = false }) {
  const totalBoxes = Math.max(1, Number(maxCount) || 1);
  const normalizedSlots = normalizeSelectedSlots(selectedSlots, totalBoxes);

  const handlePress = (index) => {
    const selectedValue = index + 1;
    const next = normalizedSlots.includes(selectedValue)
      ? normalizedSlots.filter((slot) => slot !== selectedValue)
      : [...normalizedSlots, selectedValue].sort((a, b) => a - b);
    onChange(next);
  };

  return (
    <View style={[styles.countRow, disabled && styles.rowDisabled]}>
      <Text style={[styles.countLabel, disabled && styles.disabledTextStrong]}>{label}</Text>
      <View style={styles.countBoxesWrap}>
        {Array.from({ length: totalBoxes }).map((_, index) => {
          const selected = normalizedSlots.includes(index + 1);
          return (
            <Pressable
              key={`${label}-${index}`}
              style={[styles.countBox, selected && styles.countBoxSelected]}
              onPress={() => handlePress(index)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${label} ${index + 1}`}
            />
          );
        })}
      </View>
    </View>
  );
}

export function DefectsSection({
  cupTotal = 5,
  defects = { moldy: false, phenolic: false, potato: false },
  nonUniformCupSlots = [],
  defectiveCupSlots = [],
  disabled = false,
  onToggleDefect,
  onChangeNonUniformCupSlots,
  onChangeDefectiveCupSlots,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, disabled && styles.disabledTextStrong]}>DEFECTS</Text>
      </View>

      <Text style={[styles.instructions, disabled && styles.disabledTextBody]}>
        Record specific taints or faults. Deduct -4 points per defect marked.
      </Text>

      <View style={styles.defectRowsWrap}>
        {DEFECT_OPTIONS.map((option) => (
          <DefectRow
            key={option.key}
            title={option.title}
            description={option.description}
            checked={Boolean(defects?.[option.key])}
            disabled={disabled}
            onPress={() => onToggleDefect?.(option.key)}
          />
        ))}
      </View>

      <CountRow
        label="NON-UNIFORM CUPS"
        selectedSlots={nonUniformCupSlots}
        maxCount={cupTotal}
        disabled={disabled}
        onChange={onChangeNonUniformCupSlots}
      />
      <CountRow
        label="DEFECTIVE CUPS"
        selectedSlots={defectiveCupSlots}
        maxCount={cupTotal}
        disabled={disabled}
        onChange={onChangeDefectiveCupSlots}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...typography.text_caption,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  instructions: {
    fontSize: 14,
    fontWeight: "500",
    fontStyle: "italic",
    color: colors.textMuted,
    lineHeight: 20,
  },
  defectRowsWrap: {
    gap: spacing.sm,
  },
  defectRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowDisabled: {
    backgroundColor: "#eef2f6",
    borderColor: "#d9e0ea",
  },
  checkbox: {
    width: 26,
    height: 26,
    borderWidth: 1.5,
    borderColor: "#9ca3af",
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  checkboxChecked: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  defectTextWrap: {
    flex: 1,
    gap: 4,
  },
  defectTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  defectDescription: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  countRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    flexDirection: "column",
    alignItems: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  countLabel: {
    ...typography.text_caption,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: colors.text,
  },
  countBoxesWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  countBox: {
    width: 26,
    height: 26,
    borderWidth: 1.5,
    borderColor: "#9ca3af",
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  countBoxSelected: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  disabledTextStrong: {
    color: "#4b5563",
  },
  disabledTextBody: {
    color: "#475569",
  },
});
