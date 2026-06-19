import React from "react";
import { StyleSheet, Text as NativeText } from "react-native";

// Temporary visual audit: approved typography tokens clear this highlight.
const TYPOGRAPHY_AUDIT_ENABLED = true;

export function TypographyAuditText({ style, ...props }) {
  return (
    <NativeText
      {...props}
      style={[TYPOGRAPHY_AUDIT_ENABLED ? styles.unclassified : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  unclassified: {
    backgroundColor: "#fff59d",
  },
});
