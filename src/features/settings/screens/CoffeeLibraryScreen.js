import React from "react";
import { StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";

function Block({ title, text }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

export function CoffeeLibraryScreen({ onBackPress, onSearchPress }) {
  return (
    <View style={styles.screen}>
      <Header
        title="Coffee Library"
        variant="back-search"
        onBackPress={onBackPress}
        onSearchPress={onSearchPress}
        backAccessibilityLabel="Back"
        searchAccessibilityLabel="Search"
      />
      <ScreenContainer>
        <Block title="Saved Coffees" text="Burundi Kayanza, Kenya Nyeri, Guatemala Huehuetenango." />
        <Block title="Pinned Profiles" text="Filter by process, origin, and roast level." />
        <Block title="Recent Updates" text="2 new entries added this week." />
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
    ...typography.text_body,
  },
  blockText: {
    ...typography.text_secondary_body,
  },
});
