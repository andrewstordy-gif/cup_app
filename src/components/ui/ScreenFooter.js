import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { full_page_button as FullPageButton } from "./full_page_button";
import { colors } from "../../theme/colors";

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

export function ScreenFooter({ label, onPress, disabled, loading, accessibilityLabel, buttonStyle, textStyle }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  return (
    <FooterShell scale={scale}>
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
  secondaryLabel,
  onSecondaryPress,
  secondaryDisabled,
  secondaryLoading,
  secondaryAccessibilityLabel,
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
      />
      <FullPageButton
        label={secondaryLabel}
        onPress={onSecondaryPress}
        disabled={secondaryDisabled}
        loading={secondaryLoading}
        accessibilityLabel={secondaryAccessibilityLabel}
        style={styles.secondary}
        textStyle={styles.secondaryText}
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
});
