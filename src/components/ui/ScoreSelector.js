import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const DEFAULT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function ScoreSelector({
  options = DEFAULT_OPTIONS,
  value = null,
  onChange,
  sectionLabel = "Feedback",
  style,
  disabled = false,
}) {
  return (
    <View style={[styles.scoreBar, disabled && styles.scoreBarDisabled, style]}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={`${sectionLabel}-${option}`}
            onPress={() => onChange(option)}
            disabled={disabled}
            style={styles.scoreButton}
            accessibilityRole="button"
            accessibilityLabel={`${sectionLabel} score ${option}`}
            accessibilityState={{ selected, disabled }}
          >
            <View style={[styles.scoreChip, selected && styles.scoreChipSelected]}>
              <Text style={[styles.scoreText, selected && styles.scoreTextSelected]}>{option}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scoreBar: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: "#eef2f6",
    borderWidth: 1,
    borderColor: "#e4e8ee",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  scoreBarDisabled: {
    opacity: 0.55,
  },
  scoreButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreChip: {
    width: 36,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreChipSelected: {
    backgroundColor: "#111111",
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  scoreTextSelected: {
    color: "#ffffff",
  },
});
