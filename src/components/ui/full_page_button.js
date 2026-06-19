import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

export function full_page_button({
  label = "Save",
  onPress,
  disabled = false,
  loading = false,
  testID,
  style,
  textStyle,
  icon = null,
  iconPosition = "left",
  accessibilityLabel,
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [
        styles.button,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.surface} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === "left" ? <View style={styles.iconLeft}>{icon}</View> : null}
          <Text style={[styles.label, textStyle]}>{label}</Text>
          {icon && iconPosition === "right" ? <View style={styles.iconRight}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    backgroundColor: colors.muted,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.text_button_primary,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
