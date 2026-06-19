import React from "react";
import { StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";

export function SessionStatusBadge({ status }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8EAED",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    ...typography.text_caption,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
