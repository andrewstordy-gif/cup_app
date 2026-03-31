import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export function Header({
  title,
  variant = "menu",
  onMenuPress,
  onBackPress,
  onSearchPress,
  onRightPress,
  rightIconText = "✎",
  menuAccessibilityLabel = "Open menu",
  backAccessibilityLabel = "Go back",
  searchAccessibilityLabel = "Search",
  rightAccessibilityLabel = "Header action",
}) {
  const showBack = variant === "back" || variant === "back-search";
  const showSearchField = variant === "back-search";

  return (
    <View>
      <View style={styles.container}>
        <View style={styles.left}>
          {showBack ? (
            <Pressable
              style={styles.action}
              onPress={onBackPress}
              accessibilityRole="button"
              accessibilityLabel={backAccessibilityLabel}
            >
              <Text style={styles.iconText}>←</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.action}
              onPress={onMenuPress}
              accessibilityRole="button"
              accessibilityLabel={menuAccessibilityLabel}
            >
              <Text style={styles.iconText}>☰</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.right}>
          {typeof onRightPress === "function" ? (
            <Pressable
              style={styles.action}
              onPress={onRightPress}
              accessibilityRole="button"
              accessibilityLabel={rightAccessibilityLabel}
            >
              <Text style={styles.iconText}>{rightIconText}</Text>
            </Pressable>
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
      </View>
      {showSearchField ? (
        <View style={styles.searchWrap}>
          <Pressable
            style={styles.searchIconButton}
            onPress={onSearchPress}
            accessibilityRole="button"
            accessibilityLabel={searchAccessibilityLabel}
          >
            <Text style={styles.searchIcon}>⌕</Text>
          </Pressable>
          <TextInput placeholder="Search" style={styles.searchInput} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
  },
  left: {
    width: 48,
    alignItems: "flex-start",
  },
  right: {
    width: 48,
    alignItems: "flex-end",
  },
  title: {
    ...typography.text_screen_title,
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    paddingRight: 8,
  },
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
  },
  spacer: {
    width: 40,
    height: 40,
  },
  searchWrap: {
    height: 56,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  searchIconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIcon: {
    color: colors.textMuted,
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    color: colors.text,
  },
});
