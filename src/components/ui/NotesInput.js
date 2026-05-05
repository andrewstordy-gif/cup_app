import React from "react";
import { StyleSheet, TextInput } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

export function NotesInput({
  value,
  onChangeText,
  onFocus,
  onBlur,
  placeholder = "Notes...",
  accessibilityLabel = "Notes",
  style,
  disabled = false,
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      multiline
      editable={!disabled}
      style={[styles.input, disabled && styles.inputDisabled, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e0ea",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: "top",
    fontSize: 18,
    color: colors.text,
  },
  inputDisabled: {
    opacity: 0.55,
  },
});
