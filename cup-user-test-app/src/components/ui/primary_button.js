import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

export function primary_button({
  label,
  onPress,
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  testID,
  style,
  textStyle,
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
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
          <Text style={[styles.label, textStyle]} numberOfLines={1}>
            {label}
          </Text>
          {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 4,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    alignSelf: "flex-start",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    backgroundColor: colors.textMuted,
    shadowOpacity: 0,
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
