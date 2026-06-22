import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { full_page_button as FullPageButton } from "./full_page_button";
import { TypographyAuditText as Text } from "./TypographyAuditText";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

function FooterShell({ scale, gap = false, children }) {
  return (
    <View
      style={[
        styles.footer,
        {
          paddingHorizontal: 26 * scale,
          paddingTop: 12 * scale,
          paddingBottom: 32 * scale,
          gap: gap ? 10 * scale : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function ScreenFooter({
  label,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
  buttonStyle,
  textStyle,
  instructions,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  return (
    <FooterShell scale={scale} gap={Boolean(instructions)}>
      {instructions ? (
        <Text style={styles.instructionsText} accessibilityLabel={`Footer instructions: ${instructions}`}>
          {instructions}
        </Text>
      ) : null}
      <FullPageButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        accessibilityLabel={accessibilityLabel}
        style={buttonStyle}
        textStyle={textStyle}
      />
    </FooterShell>
  );
}

export function ScreenFooterDual({
  primaryLabel,
  onPrimaryPress,
  primaryDisabled,
  primaryLoading,
  primaryAccessibilityLabel,
  primaryStyle,
  primaryTextStyle,
  secondaryLabel,
  onSecondaryPress,
  secondaryDisabled,
  secondaryLoading,
  secondaryAccessibilityLabel,
  secondaryStyle,
  secondaryTextStyle,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  return (
    <FooterShell scale={scale} gap>
      <FullPageButton
        label={primaryLabel}
        onPress={onPrimaryPress}
        disabled={primaryDisabled}
        loading={primaryLoading}
        accessibilityLabel={primaryAccessibilityLabel}
        style={primaryStyle}
        textStyle={primaryTextStyle}
      />
      <FullPageButton
        label={secondaryLabel}
        onPress={onSecondaryPress}
        disabled={secondaryDisabled}
        loading={secondaryLoading}
        accessibilityLabel={secondaryAccessibilityLabel}
        style={secondaryStyle || styles.secondary}
        textStyle={secondaryTextStyle || styles.secondaryText}
      />
    </FooterShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    backgroundColor: colors.surface,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  secondaryText: {
    color: colors.ink,
  },
  instructionsText: {
    ...typography.text_secondary_body,
    textAlign: "center",
    color: colors.inkSoft,
  },
});
