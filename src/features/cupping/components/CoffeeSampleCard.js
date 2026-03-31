import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

export function CoffeeSampleCard({
  sample,
  index,
  onUpdate,
  onRemove,
  canRemove,
  status,
}) {
  const displayCupNumber = Number.isInteger(sample.cupNumber) ? sample.cupNumber : 3;
  const isComplete = Boolean(status?.isComplete);
  const finalScore = Number.isFinite(Number(status?.finalScore)) ? Number(status.finalScore) : null;
  const isLocked = isComplete;

  return (
    <View style={[styles.sampleCard, isLocked && styles.sampleCardLocked]}>
      <View style={styles.sampleHeader}>
        <View style={styles.sampleUuidBlock}>
          <Text style={styles.uuidLabel}>UUID</Text>
          <Text style={styles.uuidValue} accessibilityLabel={`Sample ${index + 1} cup UUID`}>
            {sample.cupUUID || "CUP-0000-XXX"}
          </Text>
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
        <TextInput
          value={sample.process}
          onChangeText={(value) => onUpdate(sample.id, "process", value)}
          placeholder="e.g. Washed"
          style={[styles.input, isLocked && styles.inputDisabled]}
          editable={!isLocked}
          selectTextOnFocus={!isLocked}
          accessibilityLabel={`Sample ${index + 1} process`}
        />
      </View>

      {isComplete && finalScore != null ? (
        <View style={styles.finalScoreWrap}>
          <Text style={styles.finalScoreText}>{finalScore.toFixed(2)}</Text>
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
    fontSize: 12,
    fontWeight: "700",
    color: "#8a97ac",
    textTransform: "uppercase",
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
    fontSize: 13,
    fontWeight: "600",
    color: "#d73a49",
  },
  removeButtonTextDisabled: {
    color: colors.textMuted,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
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
    fontSize: 34,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.2,
  },
});
