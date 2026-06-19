import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { AppIcon } from "../../../components/ui/AppIcon";
import { CloseButton } from "../../../components/ui/IconButton";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

const BEAN_DEFECT_OPTIONS = [
  {
    key: "moldy",
    title: "MOULDY",
    description: "Musty, damp, mould-like flavour (wet cardboard / mildew).",
  },
  {
    key: "phenolic",
    title: "PHENOLIC",
    description: "Medicinal, chemical, plastic-like or smoky taint.",
  },
  {
    key: "potato",
    title: "POTATO",
    description: "Raw potato smell/taste; earthy, starchy, savoury defect.",
  },
  {
    key: "otherBean",
    title: "OTHER",
    description: "Other bean-related defect.",
  },
];

const ROAST_DEFECT_OPTIONS = [
  {
    key: "underdeveloped",
    title: "UNDERDEVELOPED",
    description: "Green, sharp, sour, low sweetness.",
  },
  {
    key: "baked",
    title: "BAKED",
    description: "Flat, dull, bready, muted.",
  },
  {
    key: "unevenRoast",
    title: "UNEVEN ROAST",
    description: "Sour and bitter, unbalanced.",
  },
  {
    key: "overdeveloped",
    title: "OVERDEVELOPED",
    description: "Burnt, ashy, bitter, roast-heavy.",
  },
];

const DEFECT_OPTIONS = [...BEAN_DEFECT_OPTIONS, ...ROAST_DEFECT_OPTIONS];
const BEAN_DEFECT_KEYS = BEAN_DEFECT_OPTIONS.map((option) => option.key);
const ROAST_DEFECT_KEYS = ROAST_DEFECT_OPTIONS.map((option) => option.key);

const DEFECT_ICON_NAMES = {
  moldy: "defect-mouldy",
  phenolic: "defect-phenolic",
  potato: "defect-potato",
  otherBean: "defect-other-bean",
  underdeveloped: "defect-underdeveloped",
  baked: "defect-baked",
  unevenRoast: "defect-uneven-roast",
  overdeveloped: "defect-overdeveloped",
};

function formatOptionTitle(title) {
  return String(title || "").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function DefectRow({ title, description, checked, onPress, disabled = false }) {
  return (
    <Pressable
      style={[styles.defectRow, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`${title} defect`}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
      <View style={styles.defectTextWrap}>
        <Text style={[styles.defectTitle, disabled && styles.disabledTextStrong]}>{title}</Text>
        <Text style={[styles.defectDescription, disabled && styles.disabledTextBody]}>{description}</Text>
      </View>
    </Pressable>
  );
}

function normalizeSelectedSlots(value, maxCount) {
  const limit = Math.max(1, Number(maxCount) || 1);
  const rawList = Array.isArray(value) ? value : [];
  const filtered = rawList
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= limit);
  return Array.from(new Set(filtered)).sort((a, b) => a - b);
}

function getUnionSlots(keys, defectCupSlots, maxCount) {
  const slots = keys.flatMap((key) => normalizeSelectedSlots(defectCupSlots?.[key], maxCount));
  return normalizeSelectedSlots(slots, maxCount);
}

function toggleSlotForKey(keys, defectCupSlots, selectedKey, slot, maxCount) {
  return keys.reduce((acc, key) => {
    const current = normalizeSelectedSlots(defectCupSlots?.[key], maxCount);
    if (key !== selectedKey) {
      acc[key] = current;
      return acc;
    }

    acc[key] = current.includes(slot)
      ? current.filter((item) => item !== slot)
      : normalizeSelectedSlots([...current, slot], maxCount);
    return acc;
  }, {});
}

function CountRow({ label, selectedSlots, maxCount, onChange, disabled = false }) {
  const totalBoxes = Math.max(1, Number(maxCount) || 1);
  const normalizedSlots = normalizeSelectedSlots(selectedSlots, totalBoxes);

  const handlePress = (index) => {
    const selectedValue = index + 1;
    const next = normalizedSlots.includes(selectedValue)
      ? normalizedSlots.filter((slot) => slot !== selectedValue)
      : [...normalizedSlots, selectedValue].sort((a, b) => a - b);
    onChange(next);
  };

  return (
    <View style={[styles.countRow, disabled && styles.rowDisabled]}>
      <Text style={[styles.countLabel, disabled && styles.disabledTextStrong]}>{label}</Text>
      <View style={styles.countBoxesWrap}>
        {Array.from({ length: totalBoxes }).map((_, index) => {
          const selected = normalizedSlots.includes(index + 1);
          return (
            <Pressable
              key={`${label}-${index}`}
              style={[styles.countBox, selected && styles.countBoxSelected]}
              onPress={() => handlePress(index)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${label} ${index + 1}`}
            />
          );
        })}
      </View>
    </View>
  );
}

function CupSlotBoxes({
  label,
  selectedSlots,
  maxCount,
  onChange,
  onSlotPress,
  disabled = false,
  scale = 1,
}) {
  const totalBoxes = Math.max(1, Number(maxCount) || 1);
  const normalizedSlots = normalizeSelectedSlots(selectedSlots, totalBoxes);

  const handlePress = (index) => {
    const selectedValue = index + 1;
    const next = normalizedSlots.includes(selectedValue)
      ? normalizedSlots.filter((slot) => slot !== selectedValue)
      : [...normalizedSlots, selectedValue].sort((a, b) => a - b);
    if (typeof onSlotPress === "function") {
      onSlotPress(selectedValue, normalizedSlots.includes(selectedValue));
      return;
    }
    onChange?.(next);
  };

  return (
    <View style={styles.designCupBoxRow}>
      {Array.from({ length: totalBoxes }).map((_, index) => {
        const selected = normalizedSlots.includes(index + 1);
        return (
          <Pressable
            key={`${label}-${index}`}
            style={[
              styles.designCupBoxTouchTarget,
              {
                width: 46 * scale,
                height: 46 * scale,
              },
            ]}
            onPress={() => handlePress(index)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={`${label} cup ${index + 1}`}
          >
            <View
              style={[
                styles.designCupBox,
                {
                  width: 46 * scale,
                  height: 46 * scale,
                  borderRadius: 23 * scale,
                  borderWidth: 2.3 * scale,
                },
                selected && styles.designCupBoxSelected,
                disabled && styles.designCupBoxDisabled,
              ]}
            >
              <View
                style={[
                  styles.designCupBoxInnerRim,
                  {
                    width: 39 * scale,
                    height: 39 * scale,
                    borderRadius: 19.5 * scale,
                    borderWidth: 1 * scale,
                  },
                  selected && styles.designCupBoxInnerRimSelected,
                  disabled && styles.designCupBoxInnerRimDisabled,
                ]}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function SelectedDefectIconRow({ options, defectCupSlots, scale = 1 }) {
  const visibleOptions = options.filter((option) => normalizeSelectedSlots(defectCupSlots?.[option.key], 99).length > 0);
  if (visibleOptions.length === 0) {
    return null;
  }

  return (
    <View style={[styles.selectedDefectIconRow, { marginTop: spacing.sm * scale }]}>
      {visibleOptions.map((option) => (
        <View key={`selected-${option.key}`} style={styles.selectedDefectIcon}>
          <AppIcon name={DEFECT_ICON_NAMES[option.key]} role="icon_compact" size={14 * scale} />
          <Text style={styles.selectedDefectIconText}>{formatOptionTitle(option.title)}</Text>
        </View>
      ))}
    </View>
  );
}

function DefectTypeDialog({
  visible,
  title,
  options,
  selectedKeys = [],
  onSelect,
  onClose,
  scale = 1,
}) {
  const selectedKeySet = new Set(selectedKeys);
  const canAdd = selectedKeySet.size > 0;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <View style={[styles.dialogCard, { borderRadius: 18 * scale }]}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <CloseButton
              style={styles.dialogCloseButton}
              onPress={onClose}
              accessibilityLabel="Close defect selector"
            />
          </View>
          <View style={styles.dialogOptionList}>
            {options.map((option) => {
              const isSelected = selectedKeySet.has(option.key);
              return (
                <Pressable
                  key={`dialog-${option.key}`}
                  style={[styles.dialogOption, isSelected && styles.dialogOptionSelected]}
                  onPress={() => onSelect(option.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${isSelected ? "Remove" : "Select"} ${formatOptionTitle(option.title)} defect`}
                >
                  <View style={[styles.dialogOptionIcon, isSelected && styles.dialogOptionIconSelected]}>
                    <AppIcon
                      name={DEFECT_ICON_NAMES[option.key]}
                      role="icon_compact"
                      size={14 * scale}
                      color={isSelected ? colors.surface : colors.inkSoft}
                    />
                  </View>
                  <View style={styles.dialogOptionText}>
                    <Text style={styles.dialogOptionTitle}>{formatOptionTitle(option.title)}</Text>
                    <Text style={styles.dialogOptionDescription}>{option.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[styles.dialogAddButton, !canAdd && styles.dialogAddButtonDisabled]}
            onPress={onClose}
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdd }}
            accessibilityLabel="Add selected defects"
          >
            <Text style={styles.dialogAddButtonText}>ADD</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DesignCDefectItem({
  title,
  description,
  selectedSlots,
  maxCount,
  onChange,
  disabled = false,
  scale = 1,
  isLastInGroup = false,
  bottomSpacing = 0,
}) {
  return (
    <View
      style={[
        styles.designDefectItem,
        { paddingVertical: spacing.sm * scale, marginBottom: bottomSpacing * scale },
        isLastInGroup && styles.designDefectItemLast,
      ]}
    >
      <Text style={styles.designDefectLabel}>{title}</Text>
      {description ? (
        <Text
          style={[
            styles.designDefectDescription,
            { marginTop: spacing.xs * scale },
            disabled && styles.disabledTextBody,
          ]}
        >
          {description}
        </Text>
      ) : null}
      <View style={[styles.designInputRow, { marginTop: spacing.sm * scale }]}>
        <CupSlotBoxes
          label={title}
          selectedSlots={selectedSlots}
          maxCount={maxCount}
          onChange={onChange}
          disabled={disabled}
          scale={scale}
        />
      </View>
    </View>
  );
}

function DesignCDefectTypeItem({
  title,
  description,
  selectedSlots,
  maxCount,
  options,
  defectCupSlots,
  onSlotPress,
  disabled = false,
  scale = 1,
  isLastInGroup = false,
}) {
  return (
    <View
      style={[
        styles.designDefectItem,
        { paddingVertical: spacing.sm * scale },
        isLastInGroup && styles.designDefectItemLast,
      ]}
    >
      <Text style={styles.designDefectLabel}>{title}</Text>
      {description ? (
        <Text
          style={[
            styles.designDefectDescription,
            { marginTop: spacing.xs * scale },
            disabled && styles.disabledTextBody,
          ]}
        >
          {description}
        </Text>
      ) : null}
      <View style={[styles.designInputRow, { marginTop: spacing.sm * scale }]}>
        <CupSlotBoxes
          label={title}
          selectedSlots={selectedSlots}
          maxCount={maxCount}
          onSlotPress={onSlotPress}
          disabled={disabled}
          scale={scale}
        />
      </View>
      <SelectedDefectIconRow options={options} defectCupSlots={defectCupSlots} scale={scale} />
    </View>
  );
}

function DesignCSingleDefectItem({
  title,
  description,
  checked,
  onPress,
  disabled = false,
  scale = 1,
  isLastInGroup = false,
}) {
  return (
    <View
      style={[
        styles.designDefectItem,
        { paddingVertical: spacing.sm * scale },
        isLastInGroup && styles.designDefectItemLast,
      ]}
    >
      <Text style={styles.designDefectLabel}>{title}</Text>
      <Text
        style={[
          styles.designDefectDescription,
          { marginTop: spacing.xs * scale },
          disabled && styles.disabledTextBody,
        ]}
      >
        {description}
      </Text>
      <Pressable
        style={[styles.designInputRow, { marginTop: spacing.sm * scale }]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={`${title} defect`}
      >
        <View style={styles.designSingleBoxTouchTarget}>
          <View
            style={[
              styles.designCupBox,
              {
                width: 28 * scale,
                height: 28 * scale,
                borderWidth: 2 * scale,
                borderRadius: 7 * scale,
              },
              checked && styles.designCupBoxSelected,
              disabled && styles.designCupBoxDisabled,
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

export function DefectsSection({
  cupTotal = 5,
  defects = {},
  defectCupSlots = {},
  nonUniformCupSlots = [],
  defectiveCupSlots = [],
  disabled = false,
  variant = "default",
  scale = 1,
  onToggleDefect,
  onChangeDefectCupSlots,
  onChangeNonUniformCupSlots,
  onChangeDefectiveCupSlots,
}) {
  const [pendingDefectChoice, setPendingDefectChoice] = useState(null);

  if (variant === "designC") {
    const totalBoxes = Math.max(1, Number(cupTotal) || 1);

    const beanDefectCupSlots = getUnionSlots(BEAN_DEFECT_KEYS, defectCupSlots, totalBoxes);
    const roastDefectCupSlots = getUnionSlots(ROAST_DEFECT_KEYS, defectCupSlots, totalBoxes);

    const applyDefectTypeMasks = (keys, nextMasks) => {
      keys.forEach((key) => {
        onChangeDefectCupSlots?.(key, nextMasks[key] || []);
      });
    };

    const handleTypedSlotPress = ({ group, slot }) => {
      setPendingDefectChoice({ group, slot });
    };

    const handleSelectDefectType = (key) => {
      if (!pendingDefectChoice) {
        return;
      }
      const { group, slot } = pendingDefectChoice;
      const keys = group === "bean" ? BEAN_DEFECT_KEYS : ROAST_DEFECT_KEYS;
      const nextMasks = toggleSlotForKey(keys, defectCupSlots, key, slot, totalBoxes);
      applyDefectTypeMasks(keys, nextMasks);
      if (group === "bean") {
        const nextBeanSlots = getUnionSlots(BEAN_DEFECT_KEYS, nextMasks, totalBoxes);
        const nextDefectiveSlots = nextBeanSlots.includes(slot)
          ? normalizeSelectedSlots([...defectiveCupSlots, slot], totalBoxes)
          : normalizeSelectedSlots(defectiveCupSlots, totalBoxes).filter((item) => item !== slot);
        onChangeDefectiveCupSlots?.(nextDefectiveSlots);
      }
    };

    const pendingOptions =
      pendingDefectChoice?.group === "roast" ? ROAST_DEFECT_OPTIONS : BEAN_DEFECT_OPTIONS;
    const pendingKeys =
      pendingDefectChoice?.group === "roast" ? ROAST_DEFECT_KEYS : BEAN_DEFECT_KEYS;
    const pendingSelectedKeys = pendingDefectChoice
      ? pendingKeys.filter((key) =>
          normalizeSelectedSlots(defectCupSlots?.[key], totalBoxes).includes(pendingDefectChoice.slot)
        )
      : [];

    return (
      <View style={styles.designSection}>
        <View style={styles.designGroupFirst}>
          <DesignCDefectItem
            title="Non-uniform cups"
            description="Identify none uniform cups. -2pt per cup."
            selectedSlots={nonUniformCupSlots}
            maxCount={totalBoxes}
            disabled={disabled}
            onChange={onChangeNonUniformCupSlots}
            scale={scale}
            isLastInGroup
            bottomSpacing={spacing.lg}
          />

          <DesignCDefectTypeItem
            title="Bean defects"
            description="Identify cups with a coffee defect. -4pt per defect."
            selectedSlots={beanDefectCupSlots}
            maxCount={totalBoxes}
            options={BEAN_DEFECT_OPTIONS}
            defectCupSlots={defectCupSlots}
            disabled={disabled}
            onSlotPress={(slot, selected) => handleTypedSlotPress({ group: "bean", slot, selected })}
            scale={scale}
            isLastInGroup
          />
        </View>

        <View style={[styles.designGroup, { marginTop: spacing.lg * scale, paddingTop: 0 }]}>
          <DesignCDefectTypeItem
            title="Roast defects"
            description="Identify cups with a roast defect. No impact on score."
            selectedSlots={roastDefectCupSlots}
            maxCount={totalBoxes}
            options={ROAST_DEFECT_OPTIONS}
            defectCupSlots={defectCupSlots}
            disabled={disabled}
            onSlotPress={(slot, selected) => handleTypedSlotPress({ group: "roast", slot, selected })}
            scale={scale}
            isLastInGroup
          />
        </View>
        <DefectTypeDialog
          visible={Boolean(pendingDefectChoice)}
          title={pendingDefectChoice?.group === "roast" ? "Select roast defect" : "Select bean defect"}
          options={pendingOptions}
          selectedKeys={pendingSelectedKeys}
          onSelect={handleSelectDefectType}
          onClose={() => setPendingDefectChoice(null)}
          scale={scale}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, disabled && styles.disabledTextStrong]}>DEFECTS</Text>
      </View>

      <Text style={[styles.instructions, disabled && styles.disabledTextBody]}>
        Record specific taints or faults. Bean defects deduct -4 points per selected cup.
      </Text>

      <View style={styles.defectRowsWrap}>
        {DEFECT_OPTIONS.map((option) => (
          <DefectRow
            key={option.key}
            title={option.title}
            description={option.description}
            checked={Boolean(defects?.[option.key])}
            disabled={disabled}
            onPress={() => onToggleDefect?.(option.key)}
          />
        ))}
      </View>

      <CountRow
        label="NON-UNIFORM CUPS"
        selectedSlots={nonUniformCupSlots}
        maxCount={cupTotal}
        disabled={disabled}
        onChange={onChangeNonUniformCupSlots}
      />
      <CountRow
        label="BEAN DEFECTS"
        selectedSlots={defectiveCupSlots}
        maxCount={cupTotal}
        disabled={disabled}
        onChange={onChangeDefectiveCupSlots}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...typography.text_secondary_body,
  },
  instructions: {
    ...typography.text_secondary_body,
  },
  defectRowsWrap: {
    gap: spacing.sm,
  },
  defectRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowDisabled: {
    backgroundColor: colors.panel,
    borderColor: colors.quietBorder,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  checkboxChecked: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  defectTextWrap: {
    flex: 1,
    gap: 4,
  },
  defectTitle: {
    ...typography.text_body,
  },
  defectDescription: {
    ...typography.text_secondary_body,
  },
  countRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    flexDirection: "column",
    alignItems: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  countLabel: {
    ...typography.text_body,
  },
  countBoxesWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  countBox: {
    width: 26,
    height: 26,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  countBoxSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  designSection: {
    width: "100%",
  },
  designGroup: {
    paddingTop: spacing.sm,
  },
  designGroupFirst: {},
  designGroupTitle: {
    ...typography.text_section_title,
    marginBottom: spacing.xs,
  },
  designDefectItem: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  designDefectItemLast: {
    borderBottomWidth: 0,
  },
  designCupFlagRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  designInputRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
  },
  designCupBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  designCupBoxTouchTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  designSingleBoxTouchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  designCupBox: {
    borderColor: colors.inkSoft,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  designCupBoxSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  designCupBoxDisabled: {
    borderColor: colors.muted,
    backgroundColor: colors.panel,
  },
  designCupBoxInnerRim: {
    borderColor: colors.quietBorder,
  },
  designCupBoxInnerRimSelected: {
    borderColor: colors.surface,
  },
  designCupBoxInnerRimDisabled: {
    borderColor: colors.muted,
  },
  selectedDefectIconRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.xs,
  },
  selectedDefectIcon: {
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    backgroundColor: colors.panel,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  selectedDefectIconText: {
    ...typography.text_secondary_body,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  dialogTitle: {
    ...typography.text_section_title,
    flex: 1,
  },
  dialogCloseButton: {
    width: 44,
    height: 44,
  },
  dialogOptionList: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  dialogAddButton: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  dialogAddButtonDisabled: {
    backgroundColor: colors.muted,
  },
  dialogAddButtonText: {
    ...typography.text_button_primary,
    color: colors.surface,
  },
  dialogOption: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dialogOptionSelected: {
    borderColor: colors.ink,
    backgroundColor: colors.panel,
  },
  dialogOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogOptionIconSelected: {
    backgroundColor: colors.ink,
  },
  dialogOptionText: {
    flex: 1,
    gap: 2,
  },
  dialogOptionTitle: {
    ...typography.text_body,
  },
  dialogOptionDescription: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
  },
  designDefectLabel: {
    ...typography.text_section_title,
  },
  designDefectDescription: {
    ...typography.text_secondary_body,
  },
  disabledTextStrong: {
    color: colors.inkSoft,
  },
  disabledTextBody: {
    color: colors.inkSoft,
  },
});
