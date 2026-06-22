import React, { useRef, useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { CloseButton } from "../../../components/ui/IconButton";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { AppIcon } from "../../../components/ui/AppIcon";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import {
  CUP_NUMBER_OPTIONS,
  CUPPING_FORM_OPTIONS,
  CUPPING_MODE_OPTIONS,
  getCuppingFormLabel,
  getCuppingModeLabel,
  getProcessLabel,
  PROCESS_OPTIONS,
} from "../constants/sessionDetails";

function ProcessDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
  if (!anchorRect) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.dropdownBackdrop} onPress={onDismiss} />
      <View
        style={[
          styles.dropdownMenu,
          { top: anchorRect.y + anchorRect.height, left: anchorRect.x, width: anchorRect.width, maxHeight: 280 },
        ]}
      >
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {PROCESS_OPTIONS.map((option, index) => (
            <Pressable
              key={option.key}
              onPress={() => {
                onSelect(String(option.key));
                onDismiss();
              }}
              style={[
                styles.dropdownOption,
                { paddingVertical: 14 * scale },
                index < PROCESS_OPTIONS.length - 1 && styles.dropdownOptionBorder,
                option.key === Number(selected) && styles.dropdownOptionSelected,
              ]}
              accessibilityRole="menuitem"
              accessibilityLabel={option.label}
            >
              <Text style={[styles.dropdownOptionText, option.key === Number(selected) && styles.dropdownOptionTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function CupNumberDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
  const { height: windowHeight } = useWindowDimensions();
  if (!anchorRect) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.dropdownBackdrop} onPress={onDismiss} />
      <View
        style={[
          styles.dropdownMenu,
          {
            top: anchorRect.y + anchorRect.height,
            left: anchorRect.x,
            width: anchorRect.width,
            maxHeight: Math.max(120, windowHeight - (anchorRect.y + anchorRect.height) - 24),
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.dropdownScrollContent}
        >
          {CUP_NUMBER_OPTIONS.map((option, index) => (
            <Pressable
              key={option}
              onPress={() => {
                onSelect(option);
                onDismiss();
              }}
              style={[
                styles.dropdownOption,
                { paddingVertical: 14 * scale },
                index < CUP_NUMBER_OPTIONS.length - 1 && styles.dropdownOptionBorder,
                selected === option && styles.dropdownOptionSelected,
              ]}
              accessibilityRole="menuitem"
              accessibilityLabel={String(option)}
            >
              <Text style={[styles.dropdownOptionText, selected === option && styles.dropdownOptionTextSelected]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function CuppingFormDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
  if (!anchorRect) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.dropdownBackdrop} onPress={onDismiss} />
      <View
        style={[
          styles.dropdownMenu,
          { top: anchorRect.y + anchorRect.height, left: anchorRect.x, width: anchorRect.width },
        ]}
      >
        {CUPPING_FORM_OPTIONS.map((option, index) => (
          <Pressable
            key={option.key}
            onPress={() => {
              onSelect(option.key);
              onDismiss();
            }}
            style={[
              styles.dropdownOption,
              { paddingVertical: 14 * scale },
              index < CUPPING_FORM_OPTIONS.length - 1 && styles.dropdownOptionBorder,
              option.key === Number(selected) && styles.dropdownOptionSelected,
            ]}
            accessibilityRole="menuitem"
            accessibilityLabel={option.label}
          >
            <Text
              style={[
                styles.dropdownOptionText,
                option.key === Number(selected) && styles.dropdownOptionTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function CuppingModeDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
  if (!anchorRect) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.dropdownBackdrop} onPress={onDismiss} />
      <View
        style={[
          styles.dropdownMenu,
          { top: anchorRect.y + anchorRect.height, left: anchorRect.x, width: anchorRect.width },
        ]}
      >
        {CUPPING_MODE_OPTIONS.map((option, index) => (
          <Pressable
            key={option.key}
            onPress={() => {
              onSelect(option.key);
              onDismiss();
            }}
            style={[
              styles.dropdownOption,
              { paddingVertical: 14 * scale },
              index < CUPPING_MODE_OPTIONS.length - 1 && styles.dropdownOptionBorder,
              option.key === selected && styles.dropdownOptionSelected,
            ]}
            accessibilityRole="menuitem"
            accessibilityLabel={option.label}
          >
            <Text style={[styles.dropdownOptionText, option.key === selected && styles.dropdownOptionTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

export function AddCoffeeSampleSheet({
  visible,
  mode = "add",
  cupUUID,
  coffeeNameOrigin,
  process,
  cupNumber,
  isCupNumberDefault = false,
  cuppingForm,
  cuppingMode,
  isCuppingModeDefault = false,
  errors,
  loading,
  statusMessage,
  onChangeCoffeeNameOrigin,
  onChangeProcess,
  onSelectCupNumber,
  onSelectCuppingForm,
  onSelectCuppingMode,
  onClose,
  onScanCup,
  onSave,
  bottomInset = 0,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const processRowRef = useRef(null);
  const cupCountRowRef = useRef(null);
  const cuppingFormRowRef = useRef(null);
  const cuppingModeRowRef = useRef(null);
  const [processAnchor, setProcessAnchor] = useState(null);
  const [cupCountAnchor, setCupCountAnchor] = useState(null);
  const [cuppingFormAnchor, setCuppingFormAnchor] = useState(null);
  const [cuppingModeAnchor, setCuppingModeAnchor] = useState(null);
  const processLabel = process ? getProcessLabel(process) : null;
  const cuppingFormLabel = getCuppingFormLabel(cuppingForm);
  const cuppingModeLabel = getCuppingModeLabel(cuppingMode);
  const isEditMode = mode === "edit";

  const openProcessMenu = () => {
    processRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setProcessAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const openCupCountMenu = () => {
    cupCountRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setCupCountAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const openCuppingFormMenu = () => {
    cuppingFormRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setCuppingFormAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const openCuppingModeMenu = () => {
    cuppingModeRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setCuppingModeAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

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
            <Text style={styles.sheetTitle}>{isEditMode ? "Edit Coffee Sample" : "Add Coffee Sample"}</Text>
            <CloseButton
              onPress={onClose}
              style={styles.sheetCloseButton}
              accessibilityLabel={isEditMode ? "Close edit sample" : "Close add sample"}
            />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.sheetScroll, { paddingHorizontal: 26 * scale, gap: 14 * scale }]}
          >
            <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
              <Text style={styles.metaLabel}>Coffee Name / Origin</Text>
              <TextInput
                value={coffeeNameOrigin}
                onChangeText={onChangeCoffeeNameOrigin}
                placeholder="Add coffee name"
                placeholderTextColor={colors.action}
                style={[styles.input, { marginTop: 4 * scale }]}
                accessibilityLabel="Add sample coffee name origin"
              />
              {errors?.coffeeNameOrigin ? (
                <Text style={styles.errorText}>{errors.coffeeNameOrigin}</Text>
              ) : null}
            </View>

            <Pressable
              ref={processRowRef}
              onPress={openProcessMenu}
              accessibilityRole="button"
              accessibilityLabel="Select process"
              accessibilityState={{ expanded: Boolean(processAnchor) }}
              style={[styles.metaRow, { paddingBottom: 14 * scale }]}
            >
              <Text style={styles.metaLabel}>Process</Text>
              <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
                <Text style={[styles.metaValue, !processLabel && styles.metaValuePlaceholder]}>
                  {processLabel || "Select process"}
                </Text>
                <AppIcon name="chevron-down" role="icon_navigation" size={22} color={colors.inkSoft} />
              </View>
              {errors?.process ? <Text style={styles.errorText}>{errors.process}</Text> : null}
            </Pressable>

            {!isEditMode && cupUUID ? (
              <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
                <Text style={styles.metaLabel}>Cup UUID</Text>
                <Text style={[styles.metaValueMuted, { marginTop: 4 * scale }]}>{cupUUID}</Text>
              </View>
            ) : null}

            <FullPageButton
              label="SCAN LABEL"
              onPress={() => {}}
              accessibilityLabel="Scan label"
              style={styles.scanLabelButton}
              textStyle={styles.scanLabelButtonText}
            />

            <View style={[styles.samplesHeader, { marginTop: 32 * scale }]}>
              <Text style={styles.samplesHeading}>CUPPING PROCESS</Text>
            </View>

            <Pressable
              ref={cupCountRowRef}
              onPress={openCupCountMenu}
              accessibilityRole="button"
              accessibilityLabel="Select number of cups"
              accessibilityState={{ expanded: Boolean(cupCountAnchor) }}
              style={[styles.metaRow, { paddingBottom: 14 * scale }]}
            >
              <Text style={styles.metaLabel}>Number of Cups</Text>
              <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
                <Text style={[styles.metaValue, isCupNumberDefault && styles.metaValuePlaceholder]}>
                  {cupNumber ?? 5}
                </Text>
                <AppIcon name="chevron-down" role="icon_navigation" size={22} color={colors.inkSoft} />
              </View>
              {errors?.cupNumber ? <Text style={styles.errorText}>{errors.cupNumber}</Text> : null}
            </Pressable>

            <Pressable
              ref={cuppingFormRowRef}
              onPress={openCuppingFormMenu}
              accessibilityRole="button"
              accessibilityLabel="Select cupping form"
              accessibilityState={{ expanded: Boolean(cuppingFormAnchor) }}
              style={[styles.metaRow, { paddingBottom: 14 * scale }]}
            >
              <Text style={styles.metaLabel}>Form</Text>
              <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
                <Text style={[styles.metaValue, !cuppingFormLabel && styles.metaValuePlaceholder]}>
                  {cuppingFormLabel || "Select form"}
                </Text>
                <AppIcon name="chevron-down" role="icon_navigation" size={22} color={colors.inkSoft} />
              </View>
            </Pressable>

            <Pressable
              ref={cuppingModeRowRef}
              onPress={openCuppingModeMenu}
              accessibilityRole="button"
              accessibilityLabel="Select cupping mode"
              accessibilityState={{ expanded: Boolean(cuppingModeAnchor) }}
              style={[styles.metaRow, { paddingBottom: 14 * scale }]}
            >
              <Text style={styles.metaLabel}>Cupping Mode</Text>
              <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
                <Text style={[styles.metaValue, isCuppingModeDefault && styles.metaValuePlaceholder]}>
                  {isCuppingModeDefault ? "Select cupping mode" : cuppingModeLabel}
                </Text>
                <AppIcon name="chevron-down" role="icon_navigation" size={22} color={colors.inkSoft} />
              </View>
            </Pressable>

            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <FullPageButton
              label={isEditMode ? "WRITE TO CUP" : "SCAN & ADD CUP"}
              onPress={isEditMode ? onSave : onScanCup}
              loading={loading}
              disabled={loading}
              accessibilityLabel={isEditMode ? "Write to cup" : "Scan cup"}
              style={styles.scanButton}
            />
          </View>
          <ProcessDropdown
            anchorRect={processAnchor}
            selected={process}
            onSelect={onChangeProcess}
            onDismiss={() => setProcessAnchor(null)}
            scale={scale}
          />
          <CupNumberDropdown
            anchorRect={cupCountAnchor}
            selected={cupNumber}
            onSelect={onSelectCupNumber}
            onDismiss={() => setCupCountAnchor(null)}
            scale={scale}
          />
          <CuppingFormDropdown
            anchorRect={cuppingFormAnchor}
            selected={cuppingForm}
            onSelect={onSelectCuppingForm}
            onDismiss={() => setCuppingFormAnchor(null)}
            scale={scale}
          />
          <CuppingModeDropdown
            anchorRect={cuppingModeAnchor}
            selected={cuppingMode}
            onSelect={onSelectCuppingMode}
            onDismiss={() => setCuppingModeAnchor(null)}
            scale={scale}
          />
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
    paddingBottom: spacing.sm,
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
  metaRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  metaLabel: {
    ...typography.text_secondary_body,
    fontWeight: "700",
    letterSpacing: 0,
  },
  input: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    color: "#414B53",
    padding: 0,
  },
  metaValue: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  metaValuePlaceholder: {
    color: colors.action,
  },
  metaValueMuted: {
    ...typography.text_field_auto,
    letterSpacing: 0,
  },
  typeRowValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  scanLabelButton: {
    marginTop: 8,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
  },
  scanLabelButtonText: {
    color: colors.ink,
  },
  samplesHeader: {
    paddingTop: 16,
  },
  samplesHeading: {
    ...typography.text_caption,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dropdownMenu: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownScrollContent: {
    paddingBottom: 64,
  },
  dropdownOption: {
    paddingHorizontal: 16,
  },
  dropdownOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  dropdownOptionSelected: {
    backgroundColor: colors.panel,
  },
  dropdownOptionText: {
    ...typography.text_body,
    letterSpacing: 0,
  },
  dropdownOptionTextSelected: {
    fontWeight: "800",
  },
});
