import React, { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { AppIcon } from "../../../components/ui/AppIcon";
import { ScreenFooter } from "../../../components/ui/ScreenFooter";
import { CloseButton } from "../../../components/ui/IconButton";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";
import { spacing } from "../../../theme/spacing";
import {
  SESSION_TYPE_OPTIONS,
  getSessionTypeLabel,
  CUP_NUMBER_OPTIONS,
  PROCESS_OPTIONS,
  getProcessLabel,
  CUPPING_MODE_OPTIONS,
} from "../../cupping/constants/sessionDetails";
import { SampleCard, EMPTY_SCORES } from "../components/SampleCard";

function MetaRow({ label, value, scale, muted = false }) {
  return (
    <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[muted ? styles.metaValueMuted : styles.metaValue, { marginTop: 4 * scale }]}>
        {value || "-"}
      </Text>
    </View>
  );
}

function SessionTypeDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
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
        {SESSION_TYPE_OPTIONS.map((option, index) => (
          <Pressable
            key={option.key}
            onPress={() => { onSelect(option.key); onDismiss(); }}
            style={[
              styles.dropdownOption,
              { paddingVertical: 14 * scale },
              index < SESSION_TYPE_OPTIONS.length - 1 && styles.dropdownOptionBorder,
              option.key === selected && styles.dropdownOptionSelected,
            ]}
            accessibilityRole="menuitem"
            accessibilityLabel={option.label}
          >
            <Text style={[
              styles.dropdownOptionText,
              option.key === selected && styles.dropdownOptionTextSelected,
            ]}>
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
      <View style={[styles.dropdownMenu, { top: anchorRect.y + anchorRect.height, left: anchorRect.x, width: anchorRect.width }]}>
        {CUPPING_MODE_OPTIONS.map((option, index) => (
          <Pressable
            key={option.key}
            onPress={() => { onSelect(option.key); onDismiss(); }}
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

const CUPPING_FORM_OPTIONS = [
  { key: "sca_cva", label: "SCA CVA" },
];

function AddSampleDrawer({ scale, onClose, coffeeNameOrigin, onChangeCoffeeNameOrigin, process, onChangeProcess, cupNumber, onSelectCupNumber }) {
  const [processMenuVisible, setProcessMenuVisible] = useState(false);
  const processRowRef = useRef(null);
  const [processAnchor, setProcessAnchor] = useState(null);
  const [cuppingForm, setCuppingForm] = useState(null);
  const cupCountRowRef = useRef(null);
  const [cupCountAnchor, setCupCountAnchor] = useState(null);

  const openCupCountMenu = () => {
    cupCountRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setCupCountAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };
  const cuppingFormRowRef = useRef(null);
  const [cuppingFormAnchor, setCuppingFormAnchor] = useState(null);

  const openCuppingFormMenu = () => {
    cuppingFormRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setCuppingFormAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const cuppingFormLabel = cuppingForm ? CUPPING_FORM_OPTIONS.find(o => o.key === cuppingForm)?.label : null;

  const openProcessMenu = () => {
    processRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setProcessAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const processLabel = process ? getProcessLabel(process) : null;

  return (
    <View style={styles.drawer}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Add Coffee Sample</Text>
        <CloseButton onPress={onClose} accessibilityLabel="Close add sample" />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.drawerScroll, { paddingHorizontal: 26 * scale, gap: 14 * scale }]}
      >
        <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
          <Text style={styles.metaLabel}>Coffee Name / Origin</Text>
          <TextInput
            value={coffeeNameOrigin}
            onChangeText={onChangeCoffeeNameOrigin}
            placeholder="e.g. Ethiopia Sidamo"
            placeholderTextColor={colors.action}
            style={[styles.input, { marginTop: 4 * scale }]}
            accessibilityLabel="Coffee name origin"
          />
        </View>

        <Pressable
          ref={processRowRef}
          onPress={openProcessMenu}
          accessibilityRole="button"
          accessibilityLabel="Select process"
          style={[styles.metaRow, { paddingBottom: 14 * scale }]}
        >
          <Text style={styles.metaLabel}>Process</Text>
          <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
            <Text style={[styles.metaValue, !processLabel && styles.metaValuePlaceholder]}>
              {processLabel || "Select process"}
            </Text>
            <AppIcon name="chevron-down" role="icon_navigation" size={22} />
          </View>
        </Pressable>

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
          style={[styles.metaRow, { paddingBottom: 14 * scale }]}
        >
          <Text style={styles.metaLabel}>Number of Cups</Text>
          <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
            <Text style={[styles.metaValue, cupNumber === null && styles.metaValuePlaceholder]}>
              {cupNumber ?? "Select cups"}
            </Text>
            <AppIcon name="chevron-down" role="icon_navigation" size={22} />
          </View>
        </Pressable>

        <Pressable
          ref={cuppingFormRowRef}
          onPress={openCuppingFormMenu}
          accessibilityRole="button"
          accessibilityLabel="Select cupping form"
          style={[styles.metaRow, { paddingBottom: 14 * scale }]}
        >
          <Text style={styles.metaLabel}>Form</Text>
          <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
            <Text style={[styles.metaValue, !cuppingFormLabel && styles.metaValuePlaceholder]}>
              {cuppingFormLabel || "Select form"}
            </Text>
            <AppIcon name="chevron-down" role="icon_navigation" size={22} />
          </View>
        </Pressable>
      </ScrollView>

      {cupCountAnchor ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setCupCountAnchor(null)}>
          <Pressable style={styles.dropdownBackdrop} onPress={() => setCupCountAnchor(null)} />
          <View style={[styles.dropdownMenu, { top: cupCountAnchor.y + cupCountAnchor.height, left: cupCountAnchor.x, width: cupCountAnchor.width }]}>
            {[1,2,3,4,5,6,7,8,9].map((option, index) => (
              <Pressable
                key={option}
                onPress={() => { onSelectCupNumber(option); setCupCountAnchor(null); }}
                style={[
                  styles.dropdownOption,
                  { paddingVertical: 14 * scale },
                  index < 8 && styles.dropdownOptionBorder,
                  cupNumber === option && styles.dropdownOptionSelected,
                ]}
                accessibilityRole="menuitem"
                accessibilityLabel={String(option)}
              >
                <Text style={[styles.dropdownOptionText, cupNumber === option && styles.dropdownOptionTextSelected]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </Modal>
      ) : null}

      {cuppingFormAnchor ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setCuppingFormAnchor(null)}>
          <Pressable style={styles.dropdownBackdrop} onPress={() => setCuppingFormAnchor(null)} />
          <View style={[styles.dropdownMenu, { top: cuppingFormAnchor.y + cuppingFormAnchor.height, left: cuppingFormAnchor.x, width: cuppingFormAnchor.width }]}>
            {CUPPING_FORM_OPTIONS.map((option, index) => (
              <Pressable
                key={option.key}
                onPress={() => { setCuppingForm(option.key); setCuppingFormAnchor(null); }}
                style={[
                  styles.dropdownOption,
                  { paddingVertical: 14 * scale },
                  index < CUPPING_FORM_OPTIONS.length - 1 && styles.dropdownOptionBorder,
                  option.key === cuppingForm && styles.dropdownOptionSelected,
                ]}
                accessibilityRole="menuitem"
                accessibilityLabel={option.label}
              >
                <Text style={[styles.dropdownOptionText, option.key === cuppingForm && styles.dropdownOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Modal>
      ) : null}

      {processAnchor ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setProcessAnchor(null)}>
          <Pressable style={styles.dropdownBackdrop} onPress={() => setProcessAnchor(null)} />
          <View style={[styles.dropdownMenu, { top: processAnchor.y + processAnchor.height, left: processAnchor.x, width: processAnchor.width, maxHeight: 280 }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {PROCESS_OPTIONS.map((option, index) => (
                <Pressable
                  key={option.key}
                  onPress={() => { onChangeProcess(String(option.key)); setProcessAnchor(null); }}
                  style={[
                    styles.dropdownOption,
                    { paddingVertical: 14 * scale },
                    index < PROCESS_OPTIONS.length - 1 && styles.dropdownOptionBorder,
                    option.key === process && styles.dropdownOptionSelected,
                  ]}
                  accessibilityRole="menuitem"
                  accessibilityLabel={option.label}
                >
                  <Text style={[styles.dropdownOptionText, option.key === process && styles.dropdownOptionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const PROTO_SAMPLES = [
  { coffeeName: "Ethiopia Yirgacheffe",         process: "Washed" },
  { coffeeName: "Colombia Huila",               process: "Natural" },
  { coffeeName: "Kenya Kirinyaga AA",           process: "Washed" },
  { coffeeName: "Guatemala Antigua",            process: "Honey" },
  { coffeeName: "Panama Gesha",                 process: "Washed" },
  { coffeeName: "Burundi Kayanza",              process: "Washed" },
  { coffeeName: "Costa Rica Tarrazu",           process: "Honey" },
  { coffeeName: "Rwanda Nyamasheke",            process: "Natural" },
  { coffeeName: "Indonesia Sumatra Mandheling", process: "Wet Hulled" },
  { coffeeName: "Yemen Haraaz",                 process: "Natural" },
].map((s) => ({ ...s, scores: EMPTY_SCORES, fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] }));


export function SessionPrototypeScreen({ onBackPress }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [sessionName, setSessionName] = useState("");
  const [sessionType, setSessionType] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const typeRowRef = useRef(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [coffeeNameOrigin, setCoffeeNameOrigin] = useState("");
  const [process, setProcess] = useState(null);
  const [cupNumber, setCupNumber] = useState(null);
  const [cuppingMode, setCuppingMode] = useState(null);
  const cuppingModeRowRef = useRef(null);
  const [cuppingModeAnchor, setCuppingModeAnchor] = useState(null);
  const [samples, setSamples] = useState(PROTO_SAMPLES);

  const deleteSample = (index) => setSamples(prev => prev.filter((_, i) => i !== index));

  const openDropdown = () => {
    typeRowRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setAnchorRect({ x: pageX, y: pageY, width, height });
    });
  };

  const closeDropdown = () => setAnchorRect(null);

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
      <Header
        title="Session"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back to Style Guide"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: 26 * scale,
            paddingTop: 24 * scale,
            paddingBottom: 48 * scale,
          },
        ]}
      >
        <View style={[styles.metaList, { gap: 14 * scale }]}>
          <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
            <Text style={styles.metaLabel}>Session Name</Text>
            <TextInput
              value={sessionName}
              onChangeText={setSessionName}
              placeholder="Enter session name"
              placeholderTextColor={colors.action}
              style={[styles.input, { marginTop: 4 * scale }]}
              accessibilityLabel="Session name"
            />
          </View>
          <Pressable
            ref={typeRowRef}
            onPress={openDropdown}
            accessibilityRole="button"
            accessibilityLabel="Select session type"
            style={[styles.metaRow, { paddingBottom: 14 * scale }]}
          >
            <Text style={styles.metaLabel}>Session Type</Text>
            <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
              <Text style={[styles.metaValue, !sessionType && styles.metaValuePlaceholder]}>
                {sessionType ? getSessionTypeLabel(sessionType) : "Select type"}
              </Text>
              <AppIcon name="chevron-down" role="icon_navigation" size={22} />
            </View>
          </Pressable>
          <Pressable
            ref={cuppingModeRowRef}
            onPress={() => cuppingModeRowRef.current?.measure((x, y, w, h, pageX, pageY) => setCuppingModeAnchor({ x: pageX, y: pageY, width: w, height: h }))}
            accessibilityRole="button"
            accessibilityLabel="Select cupping mode"
            style={[styles.metaRow, { paddingBottom: 14 * scale }]}
          >
            <Text style={styles.metaLabel}>Cupping Mode</Text>
            <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
              <Text style={[styles.metaValue, !cuppingMode && styles.metaValuePlaceholder]}>
                {cuppingMode ? CUPPING_MODE_OPTIONS.find(o => o.key === cuppingMode)?.label : "Select mode"}
              </Text>
              <AppIcon name="chevron-down" role="icon_navigation" size={22} />
            </View>
          </Pressable>
          <View style={{ paddingBottom: 14 * scale, gap: spacing.sm }}>
            <Text style={styles.metaValueMuted}>17 Jun 2026</Text>
            <Text style={styles.metaValueMuted}>SESSION-A1B2C3D4</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Draft</Text>
            </View>
          </View>
        </View>

        <View style={[styles.samplesHeader, { marginTop: 32 * scale }]}>
          <Text style={styles.samplesHeading}>SAMPLES</Text>
        </View>

        {samples.map((sample, index) => (
          <SampleCard key={index} sample={sample} index={index} scale={scale} onEdit={() => setAddSheetVisible(true)} onDelete={() => deleteSample(index)} />
        ))}

        <FullPageButton
          label="ADD SAMPLE"
          onPress={() => setAddSheetVisible(true)}
          accessibilityLabel="Add sample"
          style={styles.addSampleButton}
          textStyle={styles.addSampleButtonText}
        />
      </ScrollView>

      </View>

      <View onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
        <ScreenFooter
          label="SAVE"
          onPress={() => {}}
          accessibilityLabel="Save session"
        />
      </View>

      <Modal
        visible={addSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddSheetVisible(false)}
      >
        <View style={styles.modalLayout}>
          <Pressable style={styles.drawerOverlay} onPress={() => setAddSheetVisible(false)} />
          <AddSampleDrawer
            scale={scale}
            onClose={() => setAddSheetVisible(false)}
            coffeeNameOrigin={coffeeNameOrigin}
            onChangeCoffeeNameOrigin={setCoffeeNameOrigin}
            process={process}
            onChangeProcess={setProcess}
            cupNumber={cupNumber}
            onSelectCupNumber={setCupNumber}
          />
          <View style={[styles.modalFooter, { paddingHorizontal: 26 * scale }]}>
            <FullPageButton
              label="SCAN & ADD CUP"
              onPress={() => {}}
              accessibilityLabel="Scan and add cup"
              style={styles.scanButton}
            />
          </View>
        </View>
      </Modal>

      <SessionTypeDropdown
        anchorRect={anchorRect}
        selected={sessionType}
        onSelect={setSessionType}
        onDismiss={closeDropdown}
        scale={scale}
      />
      <CuppingModeDropdown
        anchorRect={cuppingModeAnchor}
        selected={cuppingMode}
        onSelect={setCuppingMode}
        onDismiss={() => setCuppingModeAnchor(null)}
        scale={scale}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
  },
  metaList: {
    width: "100%",
  },
  autoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8EAED",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    ...typography.text_caption,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    color: "#414B53",
    padding: 0,
  },
  typeRowValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  samplesHeader: {
    paddingTop: 16,
  },
  samplesHeading: {
    ...typography.text_caption,
  },
  addSampleButton: {
    marginTop: 24,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
  },
  addSampleButtonText: {
    color: colors.ink,
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
  scanButton: {
    backgroundColor: colors.action,
  },
  modalFooter: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 48,
  },
  modalLayout: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
    maxHeight: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  drawerTitle: {
    ...typography.text_screen_title,
    fontSize: 20,
  },
  drawerScroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
