import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { full_page_button as FullPageButton } from "./full_page_button";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

export function WarningDialog({
  visible,
  title = "Warning",
  message,
  onOk,
  okLabel = "OK",
  secondaryLabel,
  onSecondary,
}) {
  const hasSecondaryAction = Boolean(secondaryLabel && onSecondary);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onOk}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressArea} onPress={onOk} accessibilityLabel="Dismiss warning" />
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {hasSecondaryAction ? (
            <View style={styles.actions}>
              <FullPageButton
                label={secondaryLabel}
                onPress={onSecondary}
                accessibilityLabel={secondaryLabel}
                style={styles.secondaryButton}
              />
              <FullPageButton label={okLabel} onPress={onOk} accessibilityLabel={okLabel} />
            </View>
          ) : (
            <FullPageButton label={okLabel} onPress={onOk} accessibilityLabel={okLabel} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "center",
    padding: spacing.md,
  },
  backdropPressArea: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.xs,
  },
  secondaryButton: {
    backgroundColor: "#4b5563",
  },
});
