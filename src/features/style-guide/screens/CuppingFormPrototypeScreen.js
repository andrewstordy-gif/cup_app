import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { NotesInput } from "../../../components/ui/NotesInput";
import { AppIcon } from "../../../components/ui/AppIcon";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { DefectsSection } from "../../cupping/components/DefectsSection";
import { KeywordPillRow } from "../../cupping/components/KeywordPillRow";
import { tokenizeFlavourKeywords } from "../../cupping/data/flavourKeywords";

const FEEDBACK_FIELDS = [
  "Fragrance",
  "Aroma",
  "Flavour",
  "Aftertaste",
  "Acidity",
  "Sweetness",
  "Mouthfeel",
  "Overall",
];
const CUP_TEMP_C = 92;
const NOTE_GROUPS = [
  { afterField: "Aroma", fields: ["Fragrance", "Aroma"], label: "Fragrance / Aroma Notes" },
  { afterField: "Overall", fields: ["Flavour", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"], label: "Flavour Notes" },
];

function buildInitialScores() {
  return FEEDBACK_FIELDS.reduce((acc, field) => {
    acc[field] = null;
    return acc;
  }, {});
}

function buildInitialNotes() {
  return { "Fragrance-Aroma": "", "Flavour-Aftertaste-Acidity-Sweetness-Mouthfeel-Overall": "" };
}

function getNoteGroupId(group) {
  return group.fields.join("-");
}

function buildDefaultDefectsState() {
  return {
    moldy: false,
    phenolic: false,
    potato: false,
    otherBean: false,
    underdeveloped: false,
    baked: false,
    unevenRoast: false,
    overdeveloped: false,
  };
}

const DEFECT_BADGE_DEFINITIONS = [
  { id: "non-uniform", label: "Non-uniform" },
  { id: "moldy", label: "Mouldy" },
  { id: "phenolic", label: "Phenolic" },
  { id: "potato", label: "Potato" },
  { id: "otherBean", label: "Other" },
  { id: "underdeveloped", label: "Underdeveloped" },
  { id: "baked", label: "Baked" },
  { id: "unevenRoast", label: "Uneven roast" },
  { id: "overdeveloped", label: "Overdeveloped" },
];

function ScoreRow({ title, score, scale, onScoreSelect }) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreTitle}>{title}</Text>
      <View style={[styles.scoreControls, { marginTop: spacing.xs }]}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => {
          const selected = score === value;
          return (
            <Pressable
              key={`${title}-${value}`}
              onPress={() => onScoreSelect(selected ? null : value)}
              style={[
                styles.scoreCircle,
                {
                  width: 46 * scale,
                  height: 46 * scale,
                  borderRadius: 23 * scale,
                  borderWidth: 2.3 * scale,
                },
                selected && styles.scoreCircleSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${title} score ${value}`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.scoreText, selected && styles.scoreTextSelected]}>{value}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CuppingFormPrototypeScreen({ onBackPress, mode = "blind", coffeeName = "Ethiopia Yirgacheffe", process = "Washed" }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [scores, setScores] = useState(buildInitialScores());
  const [notes, setNotes] = useState(buildInitialNotes());
  const [defects, setDefects] = useState(buildDefaultDefectsState());
  const [defectCupSlots, setDefectCupSlots] = useState({});
  const [nonUniformCupSlots, setNonUniformCupSlots] = useState([]);
  const [defectiveCupSlots, setDefectiveCupSlots] = useState([]);
  const [isDefectsDrawerOpen, setIsDefectsDrawerOpen] = useState(false);
  const [coffeeMetaHeight, setCoffeeMetaHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);
  const noteLayoutYRef = useRef({});
  const noteInputOffsetYRef = useRef({});
  const keyboardVerticalOffset = 56;
  const scrollBottomClearance = Math.max(190 * scale, keyboardHeight + 170 * scale);
  const focusedNotesTopOffset = mode === "open" ? 72 * scale : 128 * scale;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event?.endCoordinates?.height || 0);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const defectBadges = DEFECT_BADGE_DEFINITIONS.filter((badge) => {
    if (badge.id === "non-uniform") {
      return nonUniformCupSlots.length > 0;
    }
    return Boolean(defects[badge.id]) || (defectCupSlots[badge.id] || []).length > 0;
  });

  const handleScoreSelect = (field, value) => {
    setScores((prev) => ({ ...prev, [field]: value }));
  };

  const handleNotesChange = (group, value) => {
    setNotes((prev) => ({ ...prev, [getNoteGroupId(group)]: value }));
  };

  const focusNoteGroup = (group) => {
    const noteId = getNoteGroupId(group);
    const measuredFieldY = noteLayoutYRef.current[noteId];
    const measuredInputOffsetY = noteInputOffsetYRef.current[noteId];
    const measuredInputY =
      Number.isFinite(measuredFieldY) && Number.isFinite(measuredInputOffsetY)
        ? measuredFieldY + measuredInputOffsetY
        : null;
    const measuredY = Number.isFinite(measuredInputY) ? measuredInputY : measuredFieldY;
    const targetY = Number.isFinite(measuredY) ? Math.max(0, measuredY - focusedNotesTopOffset) : 0;

    const scrollToTarget = (animated) => {
      scrollRef.current?.scrollTo({ y: targetY, animated });
    };

    // The keyboard's resize animation (and the resulting KeyboardAvoidingView
    // layout change) can still be in flight when the input is focused, so a
    // single scroll attempt can be clamped to the pre-resize scroll range.
    // Retry a few times across the animation window to land correctly.
    requestAnimationFrame(() => scrollToTarget(false));
    setTimeout(() => scrollToTarget(false), 120);
    setTimeout(() => scrollToTarget(true), 280);
    setTimeout(() => scrollToTarget(true), 420);
  };

  const renderScoreSummary = ({ placement = "bottom" } = {}) => (
    <View style={[styles.scoreSummary, placement === "drawer" && styles.scoreSummaryDrawer]}>
      <View style={[styles.scoreSummaryTitleRow, { gap: 8 * scale }]}>
        <Text style={styles.scoreSummaryTitle}>Score Pending</Text>
        <View
          style={[
            styles.infoBadge,
            { width: 22 * scale, height: 22 * scale, borderRadius: 11 * scale, borderWidth: 2 * scale },
          ]}
        >
          <AppIcon name="info" role="icon_status" size={14 * scale} style={styles.infoBadgeText} />
        </View>
      </View>
      {defectBadges.length > 0 ? (
        <View
          style={[
            styles.defectPillsRow,
            { paddingTop: 14 * scale, gap: 6 * scale, justifyContent: "center" },
          ]}
        >
          {defectBadges.map((badge) => (
            <View key={badge.id} accessibilityLabel={badge.label} style={styles.defectPill}>
              <Text style={styles.defectPillText}>{badge.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.headerLayer}>
        <Header
          variant="back"
          onBackPress={onBackPress}
          backAccessibilityLabel="Back to Style Guide"
          hideBack={isDefectsDrawerOpen}
          sideWidth={112}
          debugTag={`CuppingFormPrototypeScreen:${mode}`}
          titleContent={
            <View style={styles.titleStack}>
              <Text style={styles.titleText}>1</Text>
            </View>
          }
          rightContent={
            <View style={[styles.tempRow, { gap: 7 * scale }]}>
              <View style={[styles.thermometer, { width: 14 * scale, height: 32 * scale }]}>
                <View
                  style={[
                    styles.thermometerStem,
                    {
                      width: 6 * scale,
                      height: 23 * scale,
                      borderRadius: 3 * scale,
                      borderWidth: 2 * scale,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.thermometerBulb,
                    {
                      width: 14 * scale,
                      height: 14 * scale,
                      borderRadius: 7 * scale,
                      borderWidth: 2 * scale,
                    },
                  ]}
                />
              </View>
              <Text style={styles.tempText}>{CUP_TEMP_C} °C</Text>
            </View>
          }
        />
      </View>

      {mode === "open" ? (
        <View
          style={[styles.coffeeMetaBlock, { paddingHorizontal: 26 * scale }]}
          onLayout={(event) => setCoffeeMetaHeight(event.nativeEvent.layout.height)}
        >
          <Text style={styles.coffeeName}>{coffeeName}</Text>
          <Text style={styles.coffeeProcess}>{process}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.body,
            { paddingHorizontal: 26 * scale, paddingBottom: scrollBottomClearance },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
        {FEEDBACK_FIELDS.map((field) => {
          const noteGroup = NOTE_GROUPS.find((group) => group.afterField === field);
          return (
            <View
              key={field}
              style={styles.fieldBlock}
              onLayout={(event) => {
                if (noteGroup) {
                  noteLayoutYRef.current[getNoteGroupId(noteGroup)] = event.nativeEvent.layout.y;
                }
              }}
            >
              <ScoreRow
                title={field}
                score={scores[field]}
                scale={scale}
                onScoreSelect={(value) => handleScoreSelect(field, value)}
              />
              {noteGroup ? (() => {
                const groupValue = notes[getNoteGroupId(noteGroup)] || "";
                const pills = tokenizeFlavourKeywords(groupValue)
                  .filter((token) => token.type === "pill")
                  .reduce((acc, token) => {
                    const keyword = String(token.keyword || "").toLowerCase();
                    if (!acc.seen.has(keyword)) {
                      acc.seen.add(keyword);
                      acc.pills.push({
                        keyword: token.keyword,
                        label: `${CUP_TEMP_C} °C|${token.keyword}`,
                        colour: token.colour,
                      });
                    }
                    return acc;
                  }, { seen: new Set(), pills: [] }).pills;

                return (
                  <>
                    <View
                      onLayout={(event) => {
                        noteInputOffsetYRef.current[getNoteGroupId(noteGroup)] = event.nativeEvent.layout.y;
                      }}
                    >
                      <NotesInput
                        value={groupValue}
                        onChangeText={(value) => handleNotesChange(noteGroup, value)}
                        onFocus={() => focusNoteGroup(noteGroup)}
                        placeholder={`Add ${noteGroup.label.toLowerCase()}...`}
                        accessibilityLabel={noteGroup.label}
                        style={[
                          styles.notesInput,
                          {
                            minHeight: 114 * scale,
                            borderRadius: 13 * scale,
                            paddingHorizontal: 15 * scale,
                            paddingTop: 8 * scale,
                            paddingBottom: 8 * scale,
                            marginTop: spacing.sm,
                            marginBottom: pills.length > 0 ? spacing.xs : 0,
                          },
                        ]}
                      />
                    </View>
                    {pills.length > 0 ? (
                      <KeywordPillRow pills={pills} scale={scale} outline style={{ marginBottom: 0 }} />
                    ) : null}
                  </>
                );
              })() : null}
            </View>
          );
        })}
        {renderScoreSummary({ placement: "bottom" })}
      </ScrollView>
      </KeyboardAvoidingView>

      {isDefectsDrawerOpen ? (
        <View style={[styles.drawerOverlay, { top: 56 + coffeeMetaHeight, bottom: 152 * scale }]}>
          <Pressable
            style={[styles.drawerHeader, { minHeight: 58 * scale, paddingHorizontal: 26 * scale }]}
            onPress={() => setIsDefectsDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close defects"
          >
            <AppIcon name="chevron-down" role="icon_navigation" />
            <Text style={styles.drawerHeaderText}>Defects</Text>
          </Pressable>
          <ScrollView
            contentContainerStyle={{
              paddingTop: 34 * scale,
              paddingHorizontal: 26 * scale,
              paddingBottom: spacing.lg * 4 * scale,
            }}
          >
            <DefectsSection
              variant="designC"
              scale={scale}
              cupTotal={8}
              defects={defects}
              defectCupSlots={defectCupSlots}
              nonUniformCupSlots={nonUniformCupSlots}
              defectiveCupSlots={defectiveCupSlots}
              onToggleDefect={(key) => setDefects((prev) => ({ ...prev, [key]: !prev[key] }))}
              onChangeDefectCupSlots={(key, slots) => {
                setDefectCupSlots((prev) => ({ ...prev, [key]: slots }));
                setDefects((prev) => ({ ...prev, [key]: slots.length > 0 }));
              }}
              onChangeNonUniformCupSlots={setNonUniformCupSlots}
              onChangeDefectiveCupSlots={setDefectiveCupSlots}
            />
            {renderScoreSummary({ placement: "drawer" })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.bottomDock}>
        {!isDefectsDrawerOpen ? (
          <Pressable
            style={[styles.drawerHeader, { minHeight: 58 * scale, paddingHorizontal: 26 * scale }]}
            onPress={() => setIsDefectsDrawerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open defects"
          >
            <AppIcon name="chevron-up" role="icon_navigation" />
            <Text style={styles.drawerHeaderText}>Defects</Text>
          </Pressable>
        ) : (
          <View style={[styles.drawerSpacer, { minHeight: 58 * scale }]} />
        )}
        <View style={[styles.footer, { paddingHorizontal: 26 * scale }]}>
          <FullPageButton
            label={isDefectsDrawerOpen ? "Save" : "SCAN CUP"}
            onPress={() => setIsDefectsDrawerOpen(false)}
            accessibilityLabel={isDefectsDrawerOpen ? "Save cupping feedback" : "Scan cup"}
            style={[styles.scanButton, { backgroundColor: isDefectsDrawerOpen ? colors.ink : colors.action }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerLayer: {
    backgroundColor: colors.surface,
  },
  titleStack: {
    alignItems: "center",
  },
  titleText: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  tempRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  thermometer: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  thermometerStem: {
    position: "absolute",
    top: 1,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  thermometerBulb: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tempText: {
    ...typography.text_screen_title,
  },
  keyboardWrap: {
    flex: 1,
  },
  body: {
    paddingTop: spacing.sm,
    gap: 0,
  },
  coffeeMetaBlock: {
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
    zIndex: 1,
  },
  coffeeName: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  coffeeProcess: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
    marginTop: 2,
  },
  fieldBlock: {
    marginBottom: spacing.sm,
  },
  scoreRow: {
    gap: spacing.xs,
  },
  scoreTitle: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  scoreControls: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scoreCircle: {
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircleSelected: {
    backgroundColor: colors.ink,
  },
  scoreText: {
    ...typography.text_body,
    lineHeight: 23,
    fontWeight: "600",
    color: colors.ink,
  },
  scoreTextSelected: {
    color: colors.surface,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.quietBorder,
    backgroundColor: colors.input,
  },
  drawerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  drawerHeaderText: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  drawerSpacer: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  scoreSummary: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  scoreSummaryDrawer: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  scoreSummaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreSummaryTitle: {
    ...typography.text_secondary_metric,
    textAlign: "center",
  },
  infoBadge: {
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBadgeText: {
    fontWeight: "800",
    color: colors.ink,
  },
  defectPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  defectPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defectPillText: {
    ...typography.text_caption,
    fontSize: 11,
    letterSpacing: 0.3,
    color: colors.ink,
  },
  bottomDock: {
    backgroundColor: colors.surface,
  },
  footer: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  scanButton: {
    height: 56,
    borderRadius: 28,
  },
});
