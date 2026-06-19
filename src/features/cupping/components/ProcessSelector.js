import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { AppIcon } from "../../../components/ui/AppIcon";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { getProcessLabel, normalizeProcessKey, PROCESS_OPTIONS } from "../constants/sessionDetails";

export function ProcessSelector({
  value,
  onChange,
  disabled = false,
  accessibilityLabel = "Process selector",
}) {
  const [open, setOpen] = useState(false);
  const selectedKey = normalizeProcessKey(value);
  const selectedLabel = selectedKey ? getProcessLabel(selectedKey) : "Select process";

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open, disabled }}
      >
        <Text style={[styles.triggerText, !selectedKey && styles.placeholderText, disabled && styles.disabledText]}>
          {selectedLabel}
        </Text>
        <AppIcon
          name={open ? "chevron-up" : "chevron-down"}
          role="icon_compact"
          color={disabled ? colors.textMuted : undefined}
        />
      </Pressable>

      {open && !disabled ? (
        <View style={styles.menu}>
          <ScrollView style={styles.menuScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {PROCESS_OPTIONS.map((option, index) => {
              const selected = option.key === selectedKey;
              return (
                <Pressable
                  key={`process-${option.key}`}
                  onPress={() => {
                    onChange?.(String(option.key));
                    setOpen(false);
                  }}
                  style={[
                    styles.option,
                    index === 0 && styles.optionFirst,
                    selected && styles.optionSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Process ${option.label}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    zIndex: 2,
  },
  trigger: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  triggerDisabled: {
    backgroundColor: "#f3f4f6",
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  placeholderText: {
    color: colors.textMuted,
  },
  disabledText: {
    color: colors.textMuted,
  },
  menu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  menuScroll: {
    maxHeight: 220,
  },
  option: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionFirst: {
    borderTopWidth: 0,
  },
  optionSelected: {
    backgroundColor: "#f3f4f6",
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
  },
  optionTextSelected: {
    fontWeight: "700",
  },
});
