import React from "react";
import { StyleSheet, Text as NativeText, TextInput, View } from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { BackButton, IconButton, MenuButton } from "./IconButton";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export function Header({
  title,
  titleContent = null,
  variant = "menu",
  onMenuPress,
  onBackPress,
  onSearchPress,
  onRightPress,
  rightContent = null,
  rightIconName = "edit",
  sideWidth = 48,
  menuAccessibilityLabel = "Open menu",
  backAccessibilityLabel = "Go back",
  searchAccessibilityLabel = "Search",
  rightAccessibilityLabel = "Header action",
  hideBack = false,
  debugTag,
}) {
  const showBack = variant === "back" || variant === "back-search";
  const showSearchField = variant === "back-search";
  const shouldShowDebugTag = __DEV__ && typeof debugTag === "string" && debugTag.length > 0;

  return (
    <View>
      <View style={styles.container}>
        <View style={[styles.left, { width: sideWidth }]}>
          {showBack && !hideBack ? (
            <BackButton
              onPress={onBackPress}
              accessibilityLabel={backAccessibilityLabel}
            />
          ) : !showBack ? (
            <MenuButton
              onPress={onMenuPress}
              accessibilityLabel={menuAccessibilityLabel}
            />
          ) : null}
        </View>

        {titleContent ? (
          <View style={styles.titleContent}>{titleContent}</View>
        ) : (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}

        <View style={[styles.right, { width: sideWidth }]}>
          {rightContent ? (
            rightContent
          ) : typeof onRightPress === "function" ? (
            <IconButton
              name={rightIconName}
              role="icon_action"
              onPress={onRightPress}
              accessibilityLabel={rightAccessibilityLabel}
            />
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
        {shouldShowDebugTag ? (
          <NativeText pointerEvents="none" style={styles.debugTag}>
            {debugTag}
          </NativeText>
        ) : null}
      </View>
      {showSearchField ? (
        <View style={styles.searchWrap}>
          <IconButton
            name="search"
            role="icon_compact"
            onPress={onSearchPress}
            accessibilityLabel={searchAccessibilityLabel}
            style={styles.searchIconButton}
          />
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
    position: "relative",
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
    paddingRight: 8,
  },
  titleContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    width: 40,
    height: 40,
  },
  debugTag: {
    position: "absolute",
    right: spacing.xs,
    bottom: 2,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "monospace",
    color: colors.inkSoft,
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
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    color: colors.text,
  },
});
