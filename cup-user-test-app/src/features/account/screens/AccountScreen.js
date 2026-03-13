import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { colors } from "../../../theme/colors";

function Block({ title, text }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

export function AccountScreen({ onBackPress }) {
  return (
    <View style={styles.screen}>
      <Header title="Account" variant="back" onBackPress={onBackPress} backAccessibilityLabel="Back" />
      <ScreenContainer>
        <Block title="Profile" text="Name, organization, and preferred cupping profile." />
        <Block title="Permissions" text="Manage app access and notifications." />
        <Block title="About" text="Prototype account and app information." />
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  block: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  blockText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
