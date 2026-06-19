import React from "react";
import { StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { spacing } from "../../theme/spacing";

export function CupStatusStrip({
  state,
  temp,
  time,
  style,
}) {
  return (
    <View style={[styles.statusStrip, style]} accessibilityLabel="Cup status strip">
      <Text style={styles.statusStripItem} accessibilityLabel={`Cup state ${state}`}>
        {state}
      </Text>
      <Text style={styles.statusStripItem} accessibilityLabel={`Cup temperature ${temp}`}>
        {`TEMP: ${temp}`}
      </Text>
      <Text style={styles.statusStripItem} accessibilityLabel={`Cup timer ${time}`}>
        {`TIME: ${time}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusStrip: {
    minHeight: 52,
    backgroundColor: "#000000",
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusStripItem: {
    fontWeight: "600",
    color: "#ffffff",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
