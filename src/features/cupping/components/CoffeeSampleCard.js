import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { ProcessSelector } from "./ProcessSelector";

export function CoffeeSampleCard({
  sample,
  index,
  onUpdate,
  onRemove,
  onVerify,
  onRewrite,
  isVerifying,
  isRewriting,
  canRemove,
  status,
}) {
  const displayCupNumber = Number.isInteger(sample.cupNumber) ? sample.cupNumber : 3;
  const isComplete = Boolean(status?.isComplete);
  const finalScore = Number.isFinite(Number(status?.finalScore)) ? Number(status.finalScore) : null;
  const isLocked = isComplete;
  const verificationStatus = sample.verificationStatus || "unverified";
  const isVerified = verificationStatus === "verified";
  const isPendingVerification = verificationStatus === "pending";
  const sampleNumber =
    Number.isInteger(Number(sample.sampleNumber)) && Number(sample.sampleNumber) > 0
      ? Number(sample.sampleNumber)
      : index + 1;
  const sampleColour = sample.sampleColour || "#111111";

  return (
    <View style={[styles.sampleCard, isLocked && styles.sampleCardLocked]}>
      <View style={styles.sampleHeader}>
        <View style={styles.sampleUuidBlock}>
          <Text style={styles.uuidLabel}>UUID</Text>
          <Text style={styles.uuidValue} accessibilityLabel={`Sample ${index + 1} cup UUID`}>
            {sample.cupUUID || "CUP-0000-XXX"}
          </Text>
          <View style={styles.sampleMetaRow}>
            <View style={[styles.sampleColourDot, { backgroundColor: sampleColour }]} />
            <Text style={styles.sampleMetaText}>Sample {sampleNumber}</Text>
          </View>
          <View
            style={styles.cupDotsRow}
            accessibilityLabel={`Sample ${index + 1} has ${displayCupNumber} cups`}
          >
            {Array.from({ length: displayCupNumber }).map((_, dotIndex) => (
              <View key={`cup-dot-${dotIndex}`} style={styles.cupDot} />
            ))}
          </View>
        </View>
        <Pressable
          onPress={() => onRemove(sample.id)}
          disabled={!canRemove || isLocked}
          style={[styles.removeButton, (!canRemove || isLocked) && styles.removeButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Remove sample ${index + 1}`}
        >
          <Text style={[styles.removeButtonText, (!canRemove || isLocked) && styles.removeButtonTextDisabled]}>
            Remove
          </Text>
        </Pressable>
      </View>

      {isComplete ? (
        <View style={styles.completeBadge}>
          <Text style={styles.completeBadgeText}>Complete</Text>
        </View>
      ) : null}

      {!isComplete ? (
        <View
          style={[
            styles.verificationBadge,
            isVerified
              ? styles.verificationBadgeVerified
              : isPendingVerification
                ? styles.verificationBadgePending
                : styles.verificationBadgeUnverified,
          ]}
        >
          <Text
            style={[
              styles.verificationBadgeText,
              isVerified
                ? styles.verificationBadgeTextVerified
                : isPendingVerification
                  ? styles.verificationBadgeTextPending
                  : styles.verificationBadgeTextUnverified,
            ]}
          >
            {isVerified ? "Verified" : isPendingVerification ? "Pending Verification" : "Unverified"}
          </Text>
        </View>
      ) : null}

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Coffee Name / Origin</Text>
        <TextInput
          value={sample.coffeeNameOrigin}
          onChangeText={(value) => onUpdate(sample.id, "coffeeNameOrigin", value)}
          placeholder="e.g. Ethiopia Sidamo"
          style={[styles.input, isLocked && styles.inputDisabled]}
          editable={!isLocked}
          selectTextOnFocus={!isLocked}
          accessibilityLabel={`Sample ${index + 1} coffee name or origin`}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Process</Text>
        <ProcessSelector
          value={sample.process}
          onChange={(value) => onUpdate(sample.id, "process", value)}
          disabled={isLocked}
          accessibilityLabel={`Sample ${index + 1} process`}
        />
      </View>

      {isComplete && finalScore != null ? (
        <View style={styles.finalScoreWrap}>
          <Text style={styles.finalScoreText}>{finalScore.toFixed(2)}</Text>
        </View>
      ) : null}

      {!isComplete ? (
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => onVerify(sample.id)}
            disabled={isVerifying || isRewriting}
            style={[styles.verifyButton, (isVerifying || isRewriting) && styles.verifyButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Check cup ${index + 1}`}
          >
            <Text
              style={[styles.verifyButtonText, (isVerifying || isRewriting) && styles.verifyButtonTextDisabled]}
            >
              {isVerifying ? "Checking..." : "Check Cup"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onRewrite(sample.id)}
            disabled={isRewriting || isVerifying}
            style={[styles.rewriteButton, (isRewriting || isVerifying) && styles.rewriteButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Rewrite cup ${index + 1}`}
          >
            <Text
              style={[styles.rewriteButtonText, (isRewriting || isVerifying) && styles.rewriteButtonTextDisabled]}
            >
              {isRewriting ? "Rewriting..." : "Rewrite Cup"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sampleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  sampleCardLocked: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  completeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ecfdf3",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  verificationBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verificationBadgeVerified: {
    backgroundColor: "#ecfdf3",
    borderColor: "#a7f3d0",
  },
  verificationBadgePending: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  verificationBadgeUnverified: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  verificationBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  verificationBadgeTextVerified: {
    color: "#047857",
  },
  verificationBadgeTextPending: {
    color: "#c2410c",
  },
  verificationBadgeTextUnverified: {
    color: "#6b7280",
  },
  sampleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sampleUuidBlock: {
    gap: 2,
    flex: 1,
  },
  uuidLabel: {
    ...typography.text_caption,
    fontSize: 12,
    fontWeight: "700",
    color: "#8a97ac",
    letterSpacing: 0.4,
  },
  uuidValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#8a97ac",
  },
  cupDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  sampleMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  sampleColourDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.16)",
  },
  sampleMetaText: {
    ...typography.text_caption,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  cupDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#111111",
  },
  removeButton: {
    borderWidth: 1,
    borderColor: "#d73a49",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeButtonDisabled: {
    borderColor: colors.border,
  },
  removeButtonText: {
    ...typography.text_secondary_body,
    fontSize: 13,
    color: "#d73a49",
  },
  removeButtonTextDisabled: {
    color: colors.textMuted,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    ...typography.text_caption,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: "#f3f4f6",
    color: colors.textMuted,
  },
  finalScoreWrap: {
    marginTop: 2,
    paddingTop: 4,
  },
  finalScoreText: {
    ...typography.text_secondary_metric,
    fontSize: 34,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  verifyButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#111111",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
  },
  verifyButtonDisabled: {
    borderColor: colors.border,
  },
  verifyButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111111",
  },
  verifyButtonTextDisabled: {
    color: colors.textMuted,
  },
  rewriteButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#c2410c",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff7ed",
  },
  rewriteButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: "#f3f4f6",
  },
  rewriteButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#c2410c",
  },
  rewriteButtonTextDisabled: {
    color: colors.textMuted,
  },
});
