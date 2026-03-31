import React from "react";
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { CUP_NUMBER_OPTIONS } from "../constants/sessionDetails";

export function AddCoffeeSampleSheet({
  visible,
  cupUUID,
  coffeeNameOrigin,
  process,
  cupNumber,
  errors,
  loading,
  statusMessage,
  onChangeCoffeeNameOrigin,
  onChangeProcess,
  onSelectCupNumber,
  onClose,
  onScanCup,
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.sheetBackdrop}
        onPress={Keyboard.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss keyboard"
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add Coffee Sample</Text>
            <Pressable
              onPress={onClose}
              style={styles.sheetCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close add sample"
            >
              <Text style={styles.sheetCloseText}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.sheetSubtitle}>
            {loading
              ? statusMessage || "Writing session data to the selected cup..."
              : "Add details for the scanned cup, then scan it again to write the session data."}
          </Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Cup UUID</Text>
            <Text style={styles.readOnlyValue}>{cupUUID || "-"}</Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Coffee Name / Origin</Text>
            <TextInput
              value={coffeeNameOrigin}
              onChangeText={onChangeCoffeeNameOrigin}
              placeholder="e.g. Ethiopia Sidamo"
              style={styles.input}
              accessibilityLabel="Add sample coffee name origin"
            />
            {errors?.coffeeNameOrigin ? (
              <Text style={styles.errorText}>{errors.coffeeNameOrigin}</Text>
            ) : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Process</Text>
            <TextInput
              value={process}
              onChangeText={onChangeProcess}
              placeholder="e.g. Washed"
              style={styles.input}
              accessibilityLabel="Add sample process"
            />
            {errors?.process ? <Text style={styles.errorText}>{errors.process}</Text> : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Number of Cups</Text>
            <View style={styles.cupNumberSelector}>
              {CUP_NUMBER_OPTIONS.map((option) => {
                const selected = cupNumber === option;
                return (
                  <Pressable
                    key={`cup-number-${option}`}
                    onPress={() => onSelectCupNumber(option)}
                    style={[styles.cupNumberOption, selected && styles.cupNumberOptionSelected]}
                    accessibilityRole="button"
                    accessibilityLabel={`Cup number ${option}`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.cupNumberOptionText, selected && styles.cupNumberOptionTextSelected]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors?.cupNumber ? <Text style={styles.errorText}>{errors.cupNumber}</Text> : null}
          </View>

          <View style={styles.sheetActions}>
            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            <FullPageButton
              label="Scan Cup"
              onPress={onScanCup}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Scan cup"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 30,
    gap: spacing.sm,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
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
  readOnlyValue: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#f8f8f8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  errorText: {
    fontSize: 12,
    color: "#d73a49",
    fontWeight: "600",
  },
  statusText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  sheetActions: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  cupNumberSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cupNumberOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  cupNumberOptionSelected: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  cupNumberOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },
  cupNumberOptionTextSelected: {
    color: "#ffffff",
  },
});
