import React from "react";
import { StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

function formatTemperature(temperatureC) {
  const numeric = Number.parseFloat(temperatureC);
  if (!Number.isFinite(numeric)) {
    return "--.-°C";
  }
  return `${numeric.toFixed(1)}°C`;
}

export function HomeStatusElement({
  temperatureC = null,
  stateLabel = "Off",
  timeLabel = "00:00",
}) {
  return (
    <View style={styles.container}>
      <Text style={typography.text_instruction_emphasis} accessibilityLabel="Sync with cup">
        SYNC WITH CUP
      </Text>
      <Text style={styles.tagLine} accessibilityLabel="Hold cup near base of cup">
        Hold cup near base of cup
      </Text>
      <Text style={styles.temperature} accessibilityLabel={`Temperature ${formatTemperature(temperatureC)}`}>
        {formatTemperature(temperatureC)}
      </Text>
      <Text style={styles.stateTime} accessibilityLabel={`${stateLabel} time ${timeLabel}`}>
        {`${stateLabel} | ${timeLabel}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  tagLine: {
    ...typography.text_secondary_body,
    fontSize: 13,
  },
  temperature: {
    ...typography.text_secondary_metric,
    fontSize: 36,
    lineHeight: 40,
  },
  stateTime: {
    ...typography.text_secondary_body,
    fontSize: 13,
    textTransform: "none",
  },
});
