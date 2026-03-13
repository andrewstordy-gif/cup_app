import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

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
        <ActivityIndicator color="#ffffff" size="small" />
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
    height: 48,
    borderRadius: 4,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    backgroundColor: "#7a7a7a",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
