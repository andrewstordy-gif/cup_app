import React from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { CloseButton } from "../../../components/ui/IconButton";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { CUP_NUMBER_OPTIONS, SAMPLE_COLOUR_OPTIONS } from "../constants/sessionDetails";
import { ProcessSelector } from "./ProcessSelector";

export function AddCoffeeSampleSheet({
  visible,
  cupUUID,
  coffeeNameOrigin,
  process,
  cupNumber,
  sampleColour,
  errors,
  loading,
  statusMessage,
  onChangeCoffeeNameOrigin,
  onChangeProcess,
  onSelectCupNumber,
  onSelectSampleColour,
  onClose,
  onScanCup,
  bottomInset = 0,
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.sheetBackdrop, { paddingBottom: bottomInset }]}
        onPress={Keyboard.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss keyboard"
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add Coffee Sample</Text>
            <CloseButton
              onPress={onClose}
              style={styles.sheetCloseButton}
              accessibilityLabel="Close add sample"
            />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScroll}
          >
            <Text style={styles.sheetSubtitle}>
              {loading
                ? statusMessage || "Scan the cup to write session data..."
                : "Add coffee details, then scan the cup to write session data and add it to this session."}
            </Text>

            {cupUUID ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Cup UUID</Text>
                <Text style={styles.readOnlyValue}>{cupUUID}</Text>
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Coffee Name / Origin</Text>
              <TextInput
                value={coffeeNameOrigin}
                onChangeText={onChangeCoffeeNameOrigin}
                placeholder="e.g. Ethiopia Sidamo"
                placeholderTextColor={colors.action}
                style={styles.input}
                accessibilityLabel="Add sample coffee name origin"
              />
              {errors?.coffeeNameOrigin ? (
                <Text style={styles.errorText}>{errors.coffeeNameOrigin}</Text>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Process</Text>
              <ProcessSelector
                value={process}
                onChange={onChangeProcess}
                accessibilityLabel="Add sample process"
              />
              {errors?.process ? <Text style={styles.errorText}>{errors.process}</Text> : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Number of Cups</Text>
              <View style={styles.cupNumberSelector}>
                {CUP_NUMBER_OPTIONS.map((option) => {
                  const selected = cupNumber === option;
                  const unset = cupNumber === null || cupNumber === undefined;
                  return (
                    <Pressable
                      key={`cup-number-${option}`}
                      onPress={() => onSelectCupNumber(option)}
                      style={[styles.cupNumberOption, selected && styles.cupNumberOptionSelected, unset && styles.cupNumberOptionUnset]}
                      accessibilityRole="button"
                      accessibilityLabel={`Cup number ${option}`}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.cupNumberOptionText, selected && styles.cupNumberOptionTextSelected, unset && styles.cupNumberOptionTextUnset]}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors?.cupNumber ? <Text style={styles.errorText}>{errors.cupNumber}</Text> : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Sample Colour</Text>
              <View style={styles.sampleColourSelector}>
                {SAMPLE_COLOUR_OPTIONS.map((option) => {
                  const selected = sampleColour === option.hex;
                  return (
                    <Pressable
                      key={option.hex}
                      onPress={() => onSelectSampleColour(option.hex)}
                      style={[styles.sampleColourOption, selected && styles.sampleColourOptionSelected]}
                      accessibilityRole="button"
                      accessibilityLabel={`Sample colour ${option.label}`}
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.sampleColourSwatch, { backgroundColor: option.hex }]} />
                      <Text style={[styles.sampleColourText, selected && styles.sampleColourTextSelected]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors?.sampleColour ? <Text style={styles.errorText}>{errors.sampleColour}</Text> : null}
            </View>

            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <FullPageButton
              label="SCAN & ADD CUP"
              onPress={onScanCup}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Scan cup"
              style={styles.scanButton}
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
    paddingTop: spacing.sm,
    maxHeight: "90%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  sheetScroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  sheetFooter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetTitle: {
    ...typography.text_screen_title,
    fontSize: 20,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSubtitle: {
    ...typography.text_secondary_body,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: spacing.xs,
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
    ...typography.text_secondary_body,
    fontSize: 13,
    lineHeight: 18,
  },
  scanButton: {
    backgroundColor: colors.action,
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
  cupNumberOptionUnset: {
    borderColor: colors.action,
  },
  cupNumberOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
  },
  cupNumberOptionTextSelected: {
    color: "#ffffff",
  },
  cupNumberOptionTextUnset: {
    color: colors.action,
  },
  sampleColourSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sampleColourOption: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sampleColourOptionSelected: {
    borderColor: colors.text,
    backgroundColor: "#f3f4f6",
  },
  sampleColourSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.16)",
  },
  sampleColourText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  sampleColourTextSelected: {
    color: colors.text,
  },
});
