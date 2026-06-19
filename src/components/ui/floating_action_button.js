import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

export function floating_action_button({
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
  bottomOffset = 28,
}) {
  const isDisabled = disabled || loading;

  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom: bottomOffset }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 15,
  },
  button: {
    height: 48,
    minWidth: 190,
    borderRadius: 24,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonPressed: {
    opacity: 0.92,
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
