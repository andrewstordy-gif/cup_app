import React from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { CloseButton } from "../../../components/ui/IconButton";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

// The existing verification caller still owns every operation and transition.
export function CheckSampleScreen({
  status = "pending",
  loading = false,
  onScanToCheck,
  onRewrite,
  onClose,
  closeDisabled = false,
  saveError = "",
  retrySave = false,
}) {
  const isMismatch = status === "mismatch";
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {isMismatch ? "Re-write Sample" : "Check Cup"}
            </Text>
            <CloseButton accessibilityLabel="Close dialog" onPress={onClose} disabled={closeDisabled} />
          </View>
          <Text style={styles.message}>
            {saveError || (retrySave ? "The cup is verified. Retry saving the sample; no re-write is needed." : isMismatch
              ? "Verification failed. Re-write the same cup, then check again."
              : "Scan the same cup again to verify its details.")}
          </Text>
          <FullPageButton
            label={retrySave ? "RETRY SAVE" : isMismatch ? "RE-WRITE SAMPLE TO CUP" : "SCAN & CHECK CUP"}
            onPress={isMismatch ? onRewrite : onScanToCheck}
            loading={loading}
            disabled={loading}
            accessibilityLabel={retrySave ? "Retry save verified sample" : isMismatch ? "Re-write sample" : "Scan to check cup"}
            style={retrySave ? null : styles.scanButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.35)" },
  backdrop: { flexGrow: 1, justifyContent: "center", padding: spacing.md },
  dialog: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { ...typography.text_section_title, flexShrink: 1 },
  message: { ...typography.text_secondary_body },
  scanButton: { backgroundColor: colors.action },
});
