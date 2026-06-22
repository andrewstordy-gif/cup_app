import React from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

let nextNotesInputAccessoryId = 0;

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
  const [accessoryId] = React.useState(
    () => `cup-notes-input-accessory-${(nextNotesInputAccessoryId += 1)}`
  );

  const accessoryView = Platform.OS === "ios" ? (
    <InputAccessoryView nativeID={accessoryId}>
      <View style={styles.accessory}>
        <Pressable
          onPress={Keyboard.dismiss}
          style={styles.doneButton}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  ) : null;

  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        multiline
        editable={!disabled}
        inputAccessoryViewID={Platform.OS === "ios" && !disabled ? accessoryId : undefined}
        pointerEvents={disabled ? "none" : "auto"}
        returnKeyType="default"
        blurOnSubmit={false}
        style={[styles.input, disabled && styles.inputDisabled, style]}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
      />
      {accessoryView}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.text_secondary_body,
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    backgroundColor: colors.input,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: "top",
  },
  inputDisabled: {
    opacity: 0.55,
  },
  accessory: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    backgroundColor: colors.input,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  doneButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  doneButtonText: {
    ...typography.text_body,
    color: colors.action,
  },
});
