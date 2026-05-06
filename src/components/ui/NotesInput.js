import React from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { tokenizeFlavourKeywords } from "../../features/cupping/data/flavourKeywords";

let nextNotesInputAccessoryId = 0;

function getReadableTextColour(backgroundColour) {
  const hex = String(backgroundColour || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return "#ffffff";
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72 ? "#222222" : "#ffffff";
}

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
  const inputRef = React.useRef(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const tokens = tokenizeFlavourKeywords(value);
  const hasValue = String(value || "").length > 0;
  const flattenedInputStyle = StyleSheet.flatten([styles.input, style]);
  const previewFontSize = Number(flattenedInputStyle?.fontSize) || 18;
  const previewLineHeight = Number(flattenedInputStyle?.lineHeight) || Math.round(previewFontSize * 1.28);

  const handleFocus = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  if (!isFocused && !disabled) {
    return (
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[styles.input, styles.previewInput, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          multiline
          editable={!disabled}
          inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
          returnKeyType="default"
          blurOnSubmit={false}
          style={styles.hiddenInput}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.previewLine}>
          {hasValue ? (
            tokens.map((token, index) =>
              token.type === "pill" ? (
                <View
                  key={`${token.keyword}-${index}`}
                  style={[
                    styles.keywordPill,
                    {
                      borderRadius: Math.round(previewFontSize * 0.72),
                      paddingHorizontal: Math.round(previewFontSize * 0.5),
                      paddingVertical: Math.max(2, Math.round(previewFontSize * 0.12)),
                      backgroundColor: token.colour,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.keywordPillText,
                      {
                        color: getReadableTextColour(token.colour),
                        fontSize: previewFontSize,
                        lineHeight: previewLineHeight,
                      },
                    ]}
                  >
                    {token.text}
                  </Text>
                </View>
              ) : (
                <Text
                  key={`text-${index}`}
                  style={[
                    styles.previewText,
                    {
                      fontSize: previewFontSize,
                      lineHeight: previewLineHeight,
                    },
                  ]}
                >
                  {token.text}
                </Text>
              )
            )
          ) : (
            <Text
              style={[
                styles.placeholderText,
                {
                  fontSize: previewFontSize,
                  lineHeight: previewLineHeight,
                },
              ]}
            >
              {placeholder}
            </Text>
          )}
        </View>
        {Platform.OS === "ios" ? (
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
        ) : null}
      </Pressable>
    );
  }

  return (
    <>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        multiline
        editable={!disabled}
        inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
        returnKeyType="default"
        blurOnSubmit={false}
        style={[styles.input, disabled && styles.inputDisabled, style]}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
      />
      {Platform.OS === "ios" ? (
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
      ) : null}
    </>
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
  previewInput: {
    overflow: "hidden",
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  previewLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    rowGap: 5,
  },
  previewText: {
    color: colors.text,
  },
  placeholderText: {
    color: "#7e858b",
  },
  keywordPill: {
    marginHorizontal: 1,
  },
  keywordPillText: {
    fontWeight: "800",
    letterSpacing: 0,
  },
  accessory: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: "#d7dadd",
    backgroundColor: "#f4f5f6",
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
    color: "#3478f6",
    fontSize: 17,
    fontWeight: "700",
  },
});
