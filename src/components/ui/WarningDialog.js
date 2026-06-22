import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { CloseButton } from "./IconButton";
import { full_page_button as FullPageButton } from "./full_page_button";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export function WarningDialog({
  visible,
  title = "Warning",
  message,
  onOk,
  onDismiss,
  okLabel = "OK",
  secondaryLabel,
  onSecondary,
  variant = "default",
  secondaryButtonStyle,
  secondaryButtonTextStyle,
  okButtonStyle,
  okButtonTextStyle,
}) {
  const hasSecondaryAction = Boolean(secondaryLabel && onSecondary);
  const isCuppingChoice = variant === "cupping-choice";
  const handleDismissRequest = () => onDismiss?.();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleDismissRequest}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropPressArea}
          onPress={handleDismissRequest}
          accessibilityLabel={isCuppingChoice ? "Cup choice dialog background" : "Dismiss warning"}
        />
        <View style={[styles.dialog, isCuppingChoice && styles.cuppingChoiceDialog]}>
          <CloseButton
            onPress={handleDismissRequest}
            style={styles.closeButton}
            accessibilityLabel="Close dialog"
          />
          {title ? (
            <Text style={[styles.title, isCuppingChoice && styles.cuppingChoiceTitle]}>{title}</Text>
          ) : null}
          <Text style={[styles.message, isCuppingChoice && styles.cuppingChoiceMessage]}>{message}</Text>
          {hasSecondaryAction ? (
            <View style={[styles.actions, isCuppingChoice && styles.cuppingChoiceActions]}>
              <FullPageButton
                label={secondaryLabel}
                onPress={onSecondary}
                accessibilityLabel={secondaryLabel}
                style={[
                  isCuppingChoice ? styles.cuppingChoicePrimaryButton : styles.secondaryButton,
                  secondaryButtonStyle,
                ]}
                textStyle={[!isCuppingChoice ? styles.secondaryButtonText : null, secondaryButtonTextStyle]}
              />
              <FullPageButton
                label={okLabel}
                onPress={onOk}
                accessibilityLabel={okLabel}
                style={[isCuppingChoice ? styles.cuppingChoiceSecondaryButton : null, okButtonStyle]}
                textStyle={okButtonTextStyle}
              />
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
  closeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  title: {
    ...typography.text_body,
    paddingRight: 32,
  },
  message: {
    ...typography.text_secondary_body,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.xs,
  },
  secondaryButton: {
    backgroundColor: colors.muted,
  },
  secondaryButtonText: {
    color: colors.ink,
  },
  cuppingChoiceDialog: {
    borderWidth: 0,
    borderRadius: 18,
    padding: 20,
    gap: 8,
  },
  cuppingChoiceTitle: {
    ...typography.text_section_title,
    lineHeight: 28,
    textAlign: "center",
  },
  cuppingChoiceMessage: {
    ...typography.text_body,
    textAlign: "center",
    paddingHorizontal: 28,
    marginBottom: 10,
  },
  cuppingChoiceActions: {
    gap: 10,
  },
  cuppingChoicePrimaryButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.action,
  },
  cuppingChoiceSecondaryButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
  },
});
