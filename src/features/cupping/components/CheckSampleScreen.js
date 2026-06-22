import React from "react";
import { SafeAreaView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenFooter } from "../../../components/ui/ScreenFooter";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

export function CheckSampleScreen({
  sampleNumber,
  status = "pending",
  loading = false,
  onScanToCheck,
  onRewrite,
  onClose,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const isMismatch = status === "mismatch";
  const resolvedSampleNumber = sampleNumber || "-";

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        title={`Check Sample ${resolvedSampleNumber}`}
        variant="back"
        onBackPress={onClose}
        backAccessibilityLabel="Close check sample"
      />

      <View style={[styles.content, { paddingHorizontal: 24 * scale }]}>
        <View style={[styles.messageGroup, { gap: spacing.sm * scale }]}>
          <Text style={styles.label}>CHECK SAMPLE</Text>
          <Text style={styles.title}>
            {isMismatch ? "Sample mismatch" : "Scan the written cup"}
          </Text>
          <Text style={[styles.body, { maxWidth: 360 * scale }]}>
            {isMismatch
              ? "The scanned cup did not match the written sample data. Re-write the sample, then scan again to check it."
              : "Scan the same physical cup to confirm its stored sample data before continuing."}
          </Text>
        </View>
      </View>

      <ScreenFooter
        label={isMismatch ? "RE-WRITE SAMPLE" : "SCAN TO CHECK CUP"}
        onPress={isMismatch ? onRewrite : onScanToCheck}
        loading={loading}
        disabled={loading}
        accessibilityLabel={isMismatch ? "Re-write sample" : "Scan to check cup"}
        buttonStyle={isMismatch ? styles.rewriteButton : styles.scanButton}
        textStyle={styles.footerButtonText}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  messageGroup: {
    alignItems: "center",
  },
  label: {
    ...typography.text_caption,
    color: colors.inkSoft,
    letterSpacing: 1,
  },
  title: {
    ...typography.text_section_title,
    color: colors.ink,
    textAlign: "center",
  },
  body: {
    ...typography.text_body,
    color: colors.inkSoft,
    textAlign: "center",
  },
  scanButton: {
    backgroundColor: colors.action,
  },
  rewriteButton: {
    backgroundColor: colors.danger,
  },
  footerButtonText: {
    color: colors.surface,
  },
});
