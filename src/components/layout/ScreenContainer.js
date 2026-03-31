import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

export function ScreenContainer({ children }) {
  return <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>;
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
});
