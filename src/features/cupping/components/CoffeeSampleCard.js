import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import AntDesign from "@expo/vector-icons/AntDesign";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { AppIcon } from "../../../components/ui/AppIcon";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import {
  CUPPING_SCORE_FIELDS,
  getSampleDefects,
  getSampleFeedback,
  getSampleFlavourObservations,
} from "../../../data/sessionRepository";
import { EMPTY_SCORES, makeScores } from "../../style-guide/components/SampleCard";
import { ScoreRow } from "../../style-guide/components/ScoreRow";
import { getProcessLabel } from "../constants/sessionDetails";
import { BEAN_DEFECT_OPTIONS, ROAST_DEFECT_OPTIONS } from "./DefectsSection";
import { KeywordPillRow } from "./KeywordPillRow";

const FRAGRANCE_AROMA_FIELDS = ["Fragrance", "Aroma"];
const FLAVOUR_FIELDS = ["Flavour", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"];

function getLatestFeedbackEntry(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[rows.length - 1] : null;
}

function buildFeedbackStateFromSavedRows(rowsByField = {}) {
  return CUPPING_SCORE_FIELDS.reduce((acc, field) => {
    const latest = getLatestFeedbackEntry(rowsByField[field]);
    acc[field] = {
      score: latest?.score ?? null,
      comments: latest?.comments || "",
    };
    return acc;
  }, {});
}

function getGroupComments(feedback, fields) {
  const firstWithComments = fields.find((field) => String(feedback?.[field]?.comments || "").trim());
  return firstWithComments ? String(feedback?.[firstWithComments]?.comments || "").trim() : "";
}

function getObservationSourceFields(observation) {
  return String(observation?.sourceField || "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

function observationMatchesFields(observation, fields = []) {
  const sourceFields = getObservationSourceFields(observation);
  if (sourceFields.length === 0) {
    return true;
  }

  const fieldSet = new Set((Array.isArray(fields) ? fields : []).map((field) => String(field).trim()));
  return sourceFields.some((field) => fieldSet.has(field));
}

function getLatestDefectEntry(defects) {
  const finalEntries = Array.isArray(defects?.final) ? defects.final : [];
  const nonFinalEntries = Array.isArray(defects?.nonFinal) ? defects.nonFinal : [];
  if (finalEntries.length > 0) {
    return finalEntries[finalEntries.length - 1];
  }
  if (nonFinalEntries.length > 0) {
    return nonFinalEntries[nonFinalEntries.length - 1];
  }
  return null;
}

function getSelectedDefects(defectEntry, options) {
  if (!defectEntry) {
    return [];
  }

  return options.filter((option) => Boolean(defectEntry?.[option.key]));
}

function resolveSampleNumber(sampleNumber, index) {
  const explicitSampleNumber = Number(sampleNumber);
  if (Number.isInteger(explicitSampleNumber) && explicitSampleNumber > 0) {
    return explicitSampleNumber;
  }

  return index + 1;
}

export function CoffeeSampleCard({
  sample,
  index,
  scale = 1,
  onRemove,
  canRemove,
  status,
  onOpenSample,
  onEditSample,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [detailData, setDetailData] = useState({
    feedbackRowsByField: null,
    flavourObservations: [],
    defects: null,
    loaded: false,
  });
  const isComplete = Boolean(status?.isComplete);
  const finalScore = Number.isFinite(Number(status?.finalScore)) ? Number(status.finalScore) : null;
  const totalScore = status?.finalScore ?? null;
  const scoresByField = status?.scoresByField || {};
  const hasScoreBreakdown = Boolean(status?.hasAnyFeedback) || Object.keys(scoresByField).length > 0;
  const scoreItems = hasScoreBreakdown
    ? makeScores(CUPPING_SCORE_FIELDS.map((field) => scoresByField[field] ?? null))
    : EMPTY_SCORES;
  const isLocked = isComplete;
  const removeDisabled = !canRemove || isLocked;
  const displaySampleNumber = resolveSampleNumber(sample.sampleNumber, index);
  const canOpenSample = Boolean(sample.cupUUID && typeof onOpenSample === "function");
  const editDisabled = isLocked || typeof onEditSample !== "function";
  const feedbackState = detailData.feedbackRowsByField
    ? buildFeedbackStateFromSavedRows(detailData.feedbackRowsByField)
    : {};
  const fragranceAromaNotes = getGroupComments(feedbackState, FRAGRANCE_AROMA_FIELDS);
  const flavourNotes = getGroupComments(feedbackState, FLAVOUR_FIELDS);
  const fragranceAromaPills = detailData.flavourObservations.filter((observation) =>
    observationMatchesFields(observation, FRAGRANCE_AROMA_FIELDS)
  );
  const flavourPills = detailData.flavourObservations.filter((observation) =>
    observationMatchesFields(observation, FLAVOUR_FIELDS)
  );
  const latestDefectEntry = getLatestDefectEntry(detailData.defects);
  const beanDefects = getSelectedDefects(latestDefectEntry, BEAN_DEFECT_OPTIONS);
  const roastDefects = getSelectedDefects(latestDefectEntry, ROAST_DEFECT_OPTIONS);

  useEffect(() => {
    if (!expanded || !sample.id || detailData.loaded) {
      return undefined;
    }

    let isCancelled = false;

    const loadExpandedDetails = async () => {
      try {
        const [feedbackRowsByField, flavourObservations, defects] = await Promise.all([
          getSampleFeedback(sample.id),
          getSampleFlavourObservations(sample.id),
          getSampleDefects(sample.id),
        ]);

        if (!isCancelled) {
          setDetailData({
            feedbackRowsByField: feedbackRowsByField || {},
            flavourObservations: Array.isArray(flavourObservations) ? flavourObservations : [],
            defects,
            loaded: true,
          });
        }
      } catch {
        if (!isCancelled) {
          setDetailData((prev) => ({
            ...prev,
            loaded: true,
          }));
        }
      }
    };

    loadExpandedDetails();

    return () => {
      isCancelled = true;
    };
  }, [detailData.loaded, expanded, sample.id]);

  const handleCollapsedPress = () => {
    if (canOpenSample) {
      onOpenSample(sample, index);
      return;
    }

    setExpanded((value) => !value);
  };
  const handleEditPress = (event) => {
    event?.stopPropagation?.();
    if (editDisabled) {
      return;
    }
    onEditSample(sample, index);
  };
  const handleRemovePress = (event) => {
    event?.stopPropagation?.();
    onRemove(sample.id);
  };

  return (
    <View style={[styles.card, { marginTop: 16 * scale }]}>
      <View
        style={[
          styles.collapsedBody,
          {
            paddingHorizontal: 16 * scale,
            paddingTop: 18 * scale,
            paddingBottom: 10 * scale,
            gap: 12 * scale,
          },
        ]}
      >
        <Pressable
          onPress={handleCollapsedPress}
          accessibilityRole="button"
          accessibilityLabel={
            canOpenSample ? `Open scoring for sample ${displaySampleNumber}` : `Expand sample ${displaySampleNumber}`
          }
          style={[styles.collapsedMain, { gap: 12 * scale }]}
        >
          <View style={styles.topLine}>
            <View style={[styles.identity, { gap: 8 * scale }]}>
              <Text style={styles.sampleLabel}>{displaySampleNumber}</Text>
              {onEditSample ? (
                <Pressable
                  onPress={handleEditPress}
                  disabled={editDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit sample ${displaySampleNumber}`}
                  accessibilityState={{ disabled: editDisabled }}
                  hitSlop={8}
                  style={styles.editIconButton}
                >
                  <AntDesign name="edit" size={16} color={editDisabled ? colors.muted : colors.inkSoft} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={handleRemovePress}
              disabled={removeDisabled}
              style={[styles.removeIconButton, removeDisabled && styles.removeIconButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel={`Remove sample ${displaySampleNumber}`}
              hitSlop={12}
            >
              <AntDesign name="close" size={18} color={removeDisabled ? colors.muted : colors.inkSoft} />
            </Pressable>
          </View>

          <ScoreRow scores={scoreItems} totalScore={totalScore} scale={scale} />
        </Pressable>

        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse sample" : "Expand sample"}
          accessibilityState={{ expanded }}
          style={styles.chevronRow}
          hitSlop={8}
        >
          <AppIcon name={expanded ? "chevron-up" : "chevron-down"} role="icon_navigation" size={22} />
        </Pressable>
      </View>

      {expanded ? (
        <>
          <View style={styles.divider} />

          <View
            style={[
              styles.section,
              { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale, gap: 12 * scale },
            ]}
          >
            <View style={styles.fieldBlock}>
              <Text style={styles.sectionLabel}>Coffee Name / Origin</Text>
              <Text style={[styles.sectionValue, { marginTop: 2 * scale }]}>
                {sample.coffeeNameOrigin || "Coffee not set"}
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.sectionLabel}>Process</Text>
              <Text style={[styles.sectionValue, { marginTop: 2 * scale }]}>
                {getProcessLabel(sample.process) || "Process not set"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View
            style={[
              styles.section,
              { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale, gap: 16 * scale },
            ]}
          >
            <View>
              <Text style={styles.sectionLabel}>Fragrance / Aroma Notes</Text>
              <View style={[styles.notesBox, { borderRadius: 10 * scale, marginTop: 6 * scale }]}>
                <Text style={styles.notesBoxText}>{fragranceAromaNotes || "No notes saved yet."}</Text>
              </View>
              <KeywordPillRow
                pills={fragranceAromaPills}
                scale={scale}
                style={{ marginTop: 8 * scale }}
              />
            </View>
            <View>
              <Text style={styles.sectionLabel}>Flavour Notes</Text>
              <View style={[styles.notesBox, { borderRadius: 10 * scale, marginTop: 6 * scale }]}>
                <Text style={styles.notesBoxText}>{flavourNotes || "No notes saved yet."}</Text>
              </View>
              <KeywordPillRow pills={flavourPills} scale={scale} style={{ marginTop: 8 * scale }} />
            </View>
          </View>

          <View style={styles.divider} />

          <View
            style={[
              styles.section,
              { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale, gap: 14 * scale },
            ]}
          >
            <View>
              <Text style={styles.sectionLabel}>Coffee Defects</Text>
              <View style={[styles.defectPillsRow, { gap: 6 * scale, marginTop: 8 * scale }]}>
                {beanDefects.map((defect) => (
                  <View
                    key={defect.key}
                    style={[
                      styles.defectPill,
                      {
                        borderRadius: 15 * scale,
                        paddingHorizontal: 10 * scale,
                        paddingVertical: 4 * scale,
                      },
                    ]}
                  >
                    <Text style={styles.defectPillText}>{defect.title}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View>
              <Text style={styles.sectionLabel}>Roast Defects</Text>
              <View style={[styles.defectPillsRow, { gap: 6 * scale, marginTop: 8 * scale }]}>
                {roastDefects.map((defect) => (
                  <View
                    key={defect.key}
                    style={[
                      styles.defectPill,
                      {
                        borderRadius: 15 * scale,
                        paddingHorizontal: 10 * scale,
                        paddingVertical: 4 * scale,
                      },
                    ]}
                  >
                    <Text style={styles.defectPillText}>{defect.title}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {isComplete && finalScore != null ? (
            <>
              <View style={styles.divider} />
              <View
                style={[
                  styles.section,
                  { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale },
                ]}
              >
                <Text style={styles.sectionLabel}>Final Score</Text>
                <Text style={[styles.finalScoreText, { marginTop: 2 * scale }]}>{finalScore.toFixed(2)}</Text>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  collapsedBody: {},
  collapsedMain: {},
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
  },
  sampleLabel: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  editIconButton: {
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIconButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIconButtonDisabled: {
    opacity: 0.6,
  },
  chevronRow: {
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.quietBorder,
  },
  section: {},
  sectionLabel: {
    ...typography.text_caption,
    color: colors.inkSoft,
    letterSpacing: 0.3,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  sectionValue: {
    ...typography.text_body,
    fontSize: 16,
    letterSpacing: 0,
  },
  notesBox: {
    backgroundColor: colors.panel,
    padding: 12,
  },
  notesBoxText: {
    ...typography.text_secondary_body,
    letterSpacing: 0,
  },
  defectPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  defectPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.quietBorder,
  },
  defectPillText: {
    ...typography.text_caption,
    fontSize: 11,
    letterSpacing: 0.3,
    color: colors.ink,
  },
  finalScoreText: {
    ...typography.text_secondary_metric,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 0.2,
  },
});
