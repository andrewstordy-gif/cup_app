import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Header } from "../../../components/ui/Header";
import { CupStatusStrip } from "../../../components/ui/CupStatusStrip";
import { ScoreSelector } from "../../../components/ui/ScoreSelector";
import { NotesInput } from "../../../components/ui/NotesInput";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import {
  clearSampleFeedbackFields,
  clearSampleFinalFeedbackFields,
  getSampleDefects,
  getSampleFeedback,
  markSessionCompleteIfAllSamplesComplete,
  saveSampleDefectsEntry,
  saveSampleFeedbackBatch,
} from "../../../data/sessionRepository";
import { DefectsSection } from "../components/DefectsSection";

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
const READY_FIELDS = ["Fragrance"];
const CUPPING_FIELDS = FEEDBACK_FIELDS;
const NOTE_GROUPS = [
  { afterField: "Aroma", fields: ["Fragrance", "Aroma"] },
  { afterField: "Aftertaste", fields: ["Flavour", "Aftertaste"] },
  { afterField: "Acidity", fields: ["Acidity"] },
  { afterField: "Sweetness", fields: ["Sweetness"] },
  { afterField: "Mouthfeel", fields: ["Mouthfeel"] },
  { afterField: "Overall", fields: ["Overall"] },
];
const CUP_STATE_LABELS = {
  0: "OFF",
  1: "READY",
  2: "BREWING",
  3: "CUPPING",
  4: "LOW_BATTERY",
};
const SCORE_PRECISION = 2;
const SCORE_STEP = 0.25;
const IOS_BLUE = "#3478f6";
const SAVE_GREY = "#3f4852";
const BALLOON_CONFIGS = [
  { color: "#E15A64", left: 0.14, size: 34, drift: 20 },
  { color: "#F2B84B", left: 0.32, size: 28, drift: -16 },
  { color: "#61A6D8", left: 0.5, size: 38, drift: 12 },
  { color: "#75B66A", left: 0.68, size: 30, drift: -22 },
  { color: "#C586D9", left: 0.84, size: 35, drift: 15 },
];

function getLatestFeedbackEntry(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[rows.length - 1] : null;
}

function buildFeedbackStateFromSavedRows(rowsByField = {}) {
  return FEEDBACK_FIELDS.reduce((acc, field) => {
    const latest = getLatestFeedbackEntry(rowsByField[field]);
    acc[field] = {
      score: latest?.score ?? null,
      comments: latest?.comments || "",
    };
    return acc;
  }, {});
}

function getLatestFinalEntry(rows) {
  const finalRows = (Array.isArray(rows) ? rows : []).filter((entry) => entry?.isFinal);
  return getLatestFeedbackEntry(finalRows);
}

function hasCompleteFinalScoreSet(rowsByField = {}) {
  return FEEDBACK_FIELDS.every((field) => {
    const latestFinal = getLatestFinalEntry(rowsByField[field]);
    return latestFinal?.score != null;
  });
}

function buildInitialFeedbackState() {
  return FEEDBACK_FIELDS.reduce((acc, field) => {
    acc[field] = { score: null, comments: "" };
    return acc;
  }, {});
}

function clearFeedbackFields(prev, fields) {
  const next = { ...prev };
  (fields || []).forEach((field) => {
    if (!next[field]) {
      return;
    }
    next[field] = { score: null, comments: "" };
  });
  return next;
}

function roundToStep(value, step = SCORE_STEP) {
  const numericValue = Number(value);
  const numericStep = Number(step);
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericStep) || numericStep <= 0) {
    return 0;
  }
  return Math.round((numericValue + Number.EPSILON) / numericStep) * numericStep;
}

function toNumericOrZero(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateFinalCuppingScore({
  finalScoresByField,
  nonUniformCups,
  defectiveCups,
  numberOfCups,
}) {
  const cups = Math.max(1, toNumericOrZero(numberOfCups));
  const fieldBreakdown = FEEDBACK_FIELDS.map((field) => ({
    field,
    score: toNumericOrZero(finalScoresByField?.[field]),
  }));
  const sumHi = fieldBreakdown.reduce((sum, item) => sum + item.score, 0);

  const uRaw = toNumericOrZero(nonUniformCups);
  const dRaw = toNumericOrZero(defectiveCups);
  const uNormalized = (uRaw / cups) * 5;
  const dNormalized = (dRaw / cups) * 5;

  const scoreBeforeRounding = 0.65625 * sumHi + 52.75 - 2 * uNormalized - 4 * dNormalized;
  const scoreRounded = roundToStep(scoreBeforeRounding, SCORE_STEP);

  return {
    fieldBreakdown,
    sumHi,
    numberOfCups: cups,
    uRaw,
    dRaw,
    uNormalized,
    dNormalized,
    scoreBeforeRounding,
    scoreRounded,
  };
}

function buildDefaultDefectsState() {
  return {
    moldy: false,
    phenolic: false,
    potato: false,
  };
}

function normalizeSlotSignature(slots) {
  if (!Array.isArray(slots)) {
    return "";
  }

  return slots
    .map((slot) => Number.parseInt(slot, 10))
    .filter((slot) => Number.isInteger(slot) && slot > 0)
    .sort((a, b) => a - b)
    .join(",");
}

function buildDefectsSignature({
  defects = buildDefaultDefectsState(),
  defectCupSlots = {},
  nonUniformCupSlots = [],
  defectiveCupSlots = [],
} = {}) {
  return [
    normalizeSlotSignature(nonUniformCupSlots),
    normalizeSlotSignature(defectiveCupSlots),
    normalizeSlotSignature(defectCupSlots?.moldy),
    normalizeSlotSignature(defectCupSlots?.phenolic),
    normalizeSlotSignature(defectCupSlots?.potato),
    defects?.moldy ? "1" : "0",
    defects?.phenolic ? "1" : "0",
    defects?.potato ? "1" : "0",
  ].join("|");
}

function getNoteGroupForField(field) {
  return NOTE_GROUPS.find((group) => group.afterField === field);
}

function getNoteGroupId(group) {
  return group.fields.join("-");
}

function formatTitleTemperature(value) {
  const raw = String(value || "").trim();
  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric)) {
    return `${Math.round(numeric)} °C`;
  }
  return raw.replace(/\s*C$/i, " °C") || "-- °C";
}

function resolveSampleNumber(sampleNumber, cupIndex) {
  const explicitSampleNumber = Number.parseInt(sampleNumber, 10);
  if (Number.isInteger(explicitSampleNumber) && explicitSampleNumber > 0) {
    return explicitSampleNumber;
  }

  const index = Number.parseInt(cupIndex, 10);
  return Number.isInteger(index) && index >= 0 ? index + 1 : 1;
}

function resolveSamplesInSession(samplesInSession) {
  const explicitSamplesInSession = Number.parseInt(samplesInSession, 10);
  return Number.isInteger(explicitSamplesInSession) && explicitSamplesInSession > 0
    ? explicitSamplesInSession
    : 1;
}

function CuppingTitleContent({ sampleNumber, samplesInSession, cupIndex, sampleColour, scale }) {
  const displayNumber = resolveSampleNumber(sampleNumber, cupIndex);
  const displayTotal = resolveSamplesInSession(samplesInSession);
  const markerColour = sampleColour || "#d95f63";

  return (
    <View style={[styles.cuppingHeaderTitle, { gap: 8 * scale }]}>
      <View
        style={[
          styles.cuppingHeaderDot,
          {
            width: 14 * scale,
            height: 14 * scale,
            borderRadius: 7 * scale,
            backgroundColor: markerColour,
          },
        ]}
      />
      <Text style={[styles.cuppingHeaderTitleText, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>
        {`${displayNumber}/${displayTotal}`}
      </Text>
    </View>
  );
}

function CuppingHeaderTemperature({ temp, scale }) {
  return (
    <View style={[styles.cuppingHeaderTemp, { gap: 7 * scale }]}>
      <View style={[styles.cuppingHeaderThermometer, { width: 14 * scale, height: 32 * scale }]}>
        <View
          style={[
            styles.cuppingHeaderThermometerStem,
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
            styles.cuppingHeaderThermometerBulb,
            {
              width: 14 * scale,
              height: 14 * scale,
              borderRadius: 7 * scale,
              borderWidth: 2 * scale,
            },
          ]}
        />
      </View>
      <Text style={styles.cuppingHeaderTempText}>{formatTitleTemperature(temp)}</Text>
    </View>
  );
}

function CuppingScoreRow({
  title,
  score,
  hasFinalEntry = false,
  disabled = false,
  scale,
  onScoreSelect,
  onFinalPress,
}) {
  const finalDisabled = disabled || (!hasFinalEntry && score == null);
  const scoreDisabled = disabled || hasFinalEntry;

  return (
    <View style={[styles.cuppingScoreRow, { paddingBottom: 11 * scale }, disabled && styles.feedbackSectionDisabled]}>
      <Text style={[styles.cuppingScoreTitle, { fontSize: 22 * scale, lineHeight: 28 * scale }]}>{title}</Text>
      <View style={[styles.cuppingScoreControls, { marginTop: 2 * scale }]}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => {
          const selected = score === value;
          return (
            <Pressable
              key={`${title}-${value}`}
              onPress={() => onScoreSelect(selected ? null : value)}
              disabled={scoreDisabled}
              style={[
                styles.cuppingScoreCircle,
                {
                  width: 38 * scale,
                  height: 38 * scale,
                  borderRadius: 19 * scale,
                  borderWidth: 2.3 * scale,
                },
                selected && styles.cuppingScoreCircleSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${title} score ${value}`}
              accessibilityState={{ selected, disabled: scoreDisabled }}
            >
              <Text
                style={[
                  styles.cuppingScoreText,
                  { fontSize: 27 * scale, lineHeight: 30 * scale },
                  selected && styles.cuppingScoreTextSelected,
                ]}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onFinalPress}
          disabled={finalDisabled}
          style={[
            styles.cuppingFinalPill,
            {
              minWidth: 84 * scale,
              height: 38 * scale,
              borderRadius: 19 * scale,
              marginLeft: 12 * scale,
              paddingHorizontal: 12 * scale,
            },
            hasFinalEntry && styles.cuppingFinalPillSelected,
            finalDisabled && styles.cuppingFinalPillDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${title} final score`}
          accessibilityState={{ disabled: finalDisabled, selected: hasFinalEntry }}
        >
          <Text
            style={[
              styles.cuppingFinalText,
              { fontSize: 14 * scale, lineHeight: 18 * scale },
              hasFinalEntry && styles.cuppingFinalTextSelected,
              finalDisabled && styles.cuppingFinalTextDisabled,
            ]}
          >
            FINAL
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function DefectBadgeRow({ badges = [], scale }) {
  if (!Array.isArray(badges) || badges.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.defectBadgeRow,
        {
          paddingHorizontal: 22 * scale,
          paddingTop: 4 * scale,
          paddingBottom: 14 * scale,
          gap: 10 * scale,
        },
      ]}
    >
      {badges.map((badge) => (
        <View
          key={badge.id}
          accessibilityLabel={badge.label}
          style={[
            styles.defectBadge,
            {
              minHeight: 38 * scale,
              borderRadius: 19 * scale,
              paddingLeft: 6 * scale,
              paddingRight: 13 * scale,
              gap: 6 * scale,
            },
          ]}
        >
          <View
            style={[
              styles.defectBadgeIcon,
              {
                width: 27 * scale,
                height: 27 * scale,
                borderRadius: 14 * scale,
              },
            ]}
          >
            <Text style={[styles.defectBadgeIconText, { fontSize: 13 * scale, lineHeight: 16 * scale }]}>
              {badge.icon}
            </Text>
          </View>
          <Text style={[styles.defectBadgeText, { fontSize: 14 * scale, lineHeight: 18 * scale }]}>
            {badge.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BalloonLayer({ animations, width, scale }) {
  return (
    <View pointerEvents="none" style={styles.balloonLayer}>
      {BALLOON_CONFIGS.map((balloon, index) => {
        const animation = animations[index];
        const translateY = animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -640 * scale],
        });
        const translateX = animation.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, balloon.drift * scale, -balloon.drift * scale],
        });
        const opacity = animation.interpolate({
          inputRange: [0, 0.1, 0.82, 1],
          outputRange: [0, 1, 1, 0],
        });

        return (
          <Animated.View
            key={balloon.color}
            style={[
              styles.balloon,
              {
                left: width * balloon.left,
                bottom: 92 * scale,
                width: balloon.size * scale,
                height: balloon.size * 1.28 * scale,
                borderRadius: (balloon.size / 2) * scale,
                backgroundColor: balloon.color,
                opacity,
                transform: [{ translateX }, { translateY }],
              },
            ]}
          >
            <View
              style={[
                styles.balloonKnot,
                {
                  borderLeftWidth: 5 * scale,
                  borderRightWidth: 5 * scale,
                  borderTopWidth: 8 * scale,
                  bottom: -7 * scale,
                  borderTopColor: balloon.color,
                },
              ]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

function CoffeeFeedbackSection({
  title,
  score,
  comments,
  historyEntries,
  finalEntries,
  onScoreSelect,
  onCommentsChange,
  disabled = false,
  showInputs = true,
  showTitle = true,
  showFinalTitleSuffix = false,
  isSavedView = false,
}) {
  const sectionTitle = showFinalTitleSuffix ? `${title} (final)` : title;
  const hasHistoryEntries = Array.isArray(historyEntries) && historyEntries.length > 0;
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(!isSavedView);

  useEffect(() => {
    setIsHistoryExpanded(!isSavedView);
  }, [isSavedView, title]);

  const latestFinalEntry =
    Array.isArray(finalEntries) && finalEntries.length > 0
      ? finalEntries[finalEntries.length - 1]
      : null;

  return (
    <View
      style={[styles.feedbackSection, disabled && styles.feedbackSectionDisabled]}
      accessibilityLabel={`${title} feedback section`}
    >
      <FeedbackHistoryList
        title={title}
        entries={historyEntries}
        collapseInSavedView={isSavedView}
        isExpanded={isHistoryExpanded}
        showHeader={!isSavedView || isHistoryExpanded}
      />

      {showTitle ? (
        <View style={styles.feedbackTitleRow}>
          <Text style={styles.feedbackTitle}>{sectionTitle}</Text>
          {isSavedView && hasHistoryEntries ? (
            <Pressable
              onPress={() => setIsHistoryExpanded((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={`${title} history ${isHistoryExpanded ? "collapse" : "expand"}`}
            >
              <Text style={styles.historyDrawerToggle}>{isHistoryExpanded ? "Hide" : "Show History"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {latestFinalEntry ? <FinalisedHistoryCard entry={latestFinalEntry} /> : null}

      {showInputs ? (
        <>
          <ScoreSelector value={score} onChange={onScoreSelect} sectionLabel={title} disabled={disabled} />

          <NotesInput
            value={comments}
            onChangeText={onCommentsChange}
            placeholder={`${title} notes...`}
            accessibilityLabel={`${title} comments`}
            disabled={disabled}
          />
        </>
      ) : null}
    </View>
  );
}

function FeedbackHistoryList({
  title,
  entries,
  collapseInSavedView = false,
  isExpanded = true,
  showHeader = true,
}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return (
    <View style={styles.historyWrap} accessibilityLabel={`${title} history`}>
      {showHeader && collapseInSavedView ? (
        <View style={styles.historyDrawerHeader} accessibilityLabel={`${title} history`}>
          <Text style={styles.historyTitle}>{`${title.toUpperCase()} HISTORY`}</Text>
        </View>
      ) : null}
      {showHeader && !collapseInSavedView ? (
        <Text style={styles.historyTitle}>{`${title.toUpperCase()} HISTORY`}</Text>
      ) : null}
      {isExpanded
        ? entries.map((entry, index) => (
            <View key={`${title}-${entry?.createdAt || entry?.updatedAt || index}`} style={styles.historyCard} accessibilityLabel="Saved feedback history">
              <View style={styles.historyRow}>
                <Text style={styles.historyMeta}>{`${entry?.tempSnapshot || "N/A"}|${entry?.timeSnapshot || "00:00"}`}</Text>
                {entry?.score != null ? (
                  <View style={styles.historyScoreBadge}>
                    <Text style={styles.historyScoreText}>{entry.score}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.historyBody} numberOfLines={2}>
                {entry?.comments?.trim() || "No notes saved yet."}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

function FinalisedHistoryCard({ entry }) {
  return (
    <View style={styles.finalisedWrap} accessibilityLabel="Finalised feedback history">
      <Text style={styles.finalisedTitle}>FINALISED</Text>
      <View style={styles.finalisedCard}>
        <View style={styles.historyRow}>
          <Text style={styles.historyMeta}>{`${entry?.tempSnapshot || "N/A"}|${entry?.timeSnapshot || "00:00"}`}</Text>
          {entry?.score != null ? (
            <View style={styles.historyScoreBadge}>
              <Text style={styles.historyScoreText}>{entry.score}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.historyBody} numberOfLines={2}>
          {entry?.comments?.trim() || "No notes saved yet."}
        </Text>
      </View>
    </View>
  );
}

export function CuppingScreen({
  onBackPress,
  onScanPress,
  cupUUID = "CUP-8291-XJ2",
  tagType = null,
  cupIndex = 0,
  cupTotal = 10,
  defectsCupTotal = null,
  cupStateNumber = 1,
  cupStatus = null,
  sessionId = null,
  sampleId = null,
  sampleNumber = null,
  sampleColour = null,
  startInFinalMode = false,
  startInFinalSaved = false,
  isScanInProgress = false,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const scrollRef = useRef(null);
  const noteLayoutYRef = useRef({});
  const balloonAnimations = useRef(BALLOON_CONFIGS.map(() => new Animated.Value(0))).current;
  const [feedback, setFeedback] = useState(() => buildInitialFeedbackState());
  const [savedFeedback, setSavedFeedback] = useState(() =>
    FEEDBACK_FIELDS.reduce((acc, field) => {
      acc[field] = [];
      return acc;
    }, {})
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [isFinalMode, setIsFinalMode] = useState(Boolean(startInFinalMode));
  const [isFinalSaved, setIsFinalSaved] = useState(Boolean(startInFinalSaved));
  const [defects, setDefects] = useState(() => buildDefaultDefectsState());
  const [defectCupSlots, setDefectCupSlots] = useState({});
  const [nonUniformCupSlots, setNonUniformCupSlots] = useState([]);
  const [defectiveCupSlots, setDefectiveCupSlots] = useState([]);
  const [isDefectsDrawerOpen, setIsDefectsDrawerOpen] = useState(false);
  const [selectedFinalFields, setSelectedFinalFields] = useState({});
  const [unselectedFinalFields, setUnselectedFinalFields] = useState({});
  const [savedDefectsSignature, setSavedDefectsSignature] = useState(() => buildDefectsSignature());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const nonUniformCups = nonUniformCupSlots.length;
  const defectiveCups = defectiveCupSlots.length;
  const currentDefectsSignature = useMemo(
    () =>
      buildDefectsSignature({
        defects,
        defectCupSlots,
        nonUniformCupSlots,
        defectiveCupSlots,
      }),
    [defectiveCupSlots, defectCupSlots, defects, nonUniformCupSlots]
  );
  const hasUnsavedDefectChanges = currentDefectsSignature !== savedDefectsSignature;
  const hasPendingChanges = hasUnsavedChanges || hasUnsavedDefectChanges;

  const triggerBalloons = (onComplete) => {
    balloonAnimations.forEach((animation) => animation.setValue(0));
    Animated.stagger(
      90,
      balloonAnimations.map((animation) =>
        Animated.timing(animation, {
          toValue: 1,
          duration: 1700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start(({ finished }) => {
      if (finished && typeof onComplete === "function") {
        onComplete();
      }
    });
  };

  const statusDisplay = useMemo(
    () => ({
      state: cupStatus?.state || CUP_STATE_LABELS[cupStateNumber] || "UNKNOWN",
      temp: cupStatus?.temp || "92 C",
      time: cupStatus?.time || "04:20",
    }),
    [cupStateNumber, cupStatus]
  );

  const isNtagCup = tagType === "ntag_cup";
  const isBrewing = cupStateNumber === 2;
  const isCupping = cupStateNumber === 3;
  const canCaptureFeedback = cupStateNumber === 1 || cupStateNumber === 3;
  const isFeedbackLocked = cupStateNumber === 2 && !isFinalMode;
  const showBrewingDone = isBrewing && !isFinalMode;
  const isAromaPopulated = useMemo(() => {
    const hasSavedAromaScore = (savedFeedback.Aroma || []).some((entry) => entry?.score != null);
    return hasSavedAromaScore || feedback.Aroma?.score != null;
  }, [feedback.Aroma?.score, savedFeedback.Aroma]);

  const visibleFields = useMemo(() => {
    if (isFinalMode) {
      return FEEDBACK_FIELDS;
    }

    if (canCaptureFeedback) {
      return FEEDBACK_FIELDS;
    }

    return cupStateNumber === 2 ? READY_FIELDS : [];
  }, [canCaptureFeedback, cupStateNumber, isFinalMode]);

  const enabledFields = useMemo(() => {
    if (isFinalMode) {
      return isFinalSaved ? [] : FEEDBACK_FIELDS;
    }

    if (isNtagCup) {
      return FEEDBACK_FIELDS;
    }

    if (cupStateNumber === 1) {
      return ["Fragrance"];
    }

    if (cupStateNumber === 3) {
      return isAromaPopulated ? FEEDBACK_FIELDS : ["Fragrance", "Aroma"];
    }

    return [];
  }, [cupStateNumber, isAromaPopulated, isFinalMode, isFinalSaved, isNtagCup]);

  const finalScoreSummary = useMemo(() => {
    if (!isFinalMode || !isFinalSaved) {
      return null;
    }

    const finalScoresByField = FEEDBACK_FIELDS.reduce((acc, field) => {
      const finalEntries = (savedFeedback[field] || []).filter(
        (entry) => entry?.isFinal && entry?.score != null
      );
      const latestFinalEntry =
        finalEntries.length > 0 ? finalEntries[finalEntries.length - 1] : null;
      acc[field] = latestFinalEntry?.score ?? 0;
      return acc;
    }, {});

    return calculateFinalCuppingScore({
      finalScoresByField,
      nonUniformCups,
      defectiveCups,
      numberOfCups: defectsCupTotal || cupTotal || 1,
    });
  }, [
    isFinalMode,
    isFinalSaved,
    savedFeedback,
    nonUniformCups,
    defectiveCups,
    defectsCupTotal,
    cupTotal,
  ]);
  const cupIndexDisplay = `CUP ${String(cupIndex + 1).padStart(2, "0")} / ${String(cupTotal).padStart(2, "0")}`;
  const scoreDisplay =
    isFinalMode && isFinalSaved && finalScoreSummary
      ? `  |  SCORE ${finalScoreSummary.scoreRounded.toFixed(SCORE_PRECISION)}`
      : "";
  const usesMockCuppingLayout = !isBrewing && (canCaptureFeedback || isFinalMode);
  const isFieldEnabled = (field) => enabledFields.includes(field);
  const getEnabledGroupFields = (group) => group.fields.filter((field) => isFieldEnabled(field));
  const isNoteGroupEnabled = (group) => getEnabledGroupFields(group).length > 0;
  const defectBadges = useMemo(
    () =>
      [
        {
          id: "non-uniform",
          icon: "≠",
          label: "Non-uniform",
          isVisible: nonUniformCupSlots.length > 0,
        },
        {
          id: "moldy",
          icon: "M",
          label: "Mouldy",
          isVisible: Boolean(defects.moldy) || (defectCupSlots.moldy || []).length > 0,
        },
        {
          id: "phenolic",
          icon: "Ph",
          label: "Phenolic",
          isVisible: Boolean(defects.phenolic) || (defectCupSlots.phenolic || []).length > 0,
        },
        {
          id: "potato",
          icon: "Po",
          label: "Potato",
          isVisible: Boolean(defects.potato) || (defectCupSlots.potato || []).length > 0,
        },
      ].filter((badge) => badge.isVisible),
    [defectCupSlots.moldy, defectCupSlots.phenolic, defectCupSlots.potato, defects, nonUniformCupSlots.length]
  );

  useEffect(() => {
    let isMounted = true;
    const emptyFeedbackByField = FEEDBACK_FIELDS.reduce((acc, field) => {
      acc[field] = [];
      return acc;
    }, {});

    setSavedFeedback(emptyFeedbackByField);
    setFeedback(buildInitialFeedbackState());
    setSelectedFinalFields({});
    setUnselectedFinalFields({});
    setHasUnsavedChanges(false);

    const loadSavedFeedback = async () => {
      if (!sampleId) {
        return;
      }

      try {
        const rowsByField = await getSampleFeedback(sampleId);
        if (!isMounted) {
          return;
        }

        const next = FEEDBACK_FIELDS.reduce((acc, field) => {
          acc[field] = [];
          return acc;
        }, {});
        Object.entries(rowsByField || {}).forEach(([field, rows]) => {
          if (!next[field]) {
            return;
          }
          next[field] = Array.isArray(rows) ? rows : [];
        });
        setSavedFeedback(next);
        setFeedback(buildFeedbackStateFromSavedRows(next));
      } catch (error) {
        if (isMounted) {
          setStatusMessage(error?.message || "Could not load saved cupping history.");
        }
      }
    };

    loadSavedFeedback();

    return () => {
      isMounted = false;
    };
  }, [sampleId]);

  useEffect(() => {
    let isMounted = true;

    const loadSavedDefects = async () => {
      if (!sampleId) {
        if (isMounted) {
          setDefects(buildDefaultDefectsState());
          setDefectCupSlots({});
          setNonUniformCupSlots([]);
          setDefectiveCupSlots([]);
          setSavedDefectsSignature(buildDefectsSignature());
        }
        return;
      }

      try {
        const rows = await getSampleDefects(sampleId);
        if (!isMounted) {
          return;
        }

        const preferredList = Boolean(startInFinalSaved)
          ? rows?.final || []
          : rows?.nonFinal || [];
        const fallbackList = Boolean(startInFinalSaved)
          ? rows?.nonFinal || []
          : rows?.final || [];
        const latest =
          preferredList.length > 0
            ? preferredList[preferredList.length - 1]
            : fallbackList.length > 0
              ? fallbackList[fallbackList.length - 1]
              : null;

        if (!latest) {
          setDefects(buildDefaultDefectsState());
          setDefectCupSlots({});
          setNonUniformCupSlots([]);
          setDefectiveCupSlots([]);
          setSavedDefectsSignature(buildDefectsSignature());
          return;
        }

        const nextDefects = {
          moldy: Boolean(latest.moldy),
          phenolic: Boolean(latest.phenolic),
          potato: Boolean(latest.potato),
        };
        const nextDefectCupSlots = {
          moldy: latest.moldy ? [1] : [],
          phenolic: latest.phenolic ? [1] : [],
          potato: latest.potato ? [1] : [],
        };
        const nextNonUniformCupSlots = Array.isArray(latest.nonUniformCupSlots) ? latest.nonUniformCupSlots : [];
        const nextDefectiveCupSlots = Array.isArray(latest.defectiveCupSlots) ? latest.defectiveCupSlots : [];

        setDefects(nextDefects);
        setDefectCupSlots(nextDefectCupSlots);
        setNonUniformCupSlots(nextNonUniformCupSlots);
        setDefectiveCupSlots(nextDefectiveCupSlots);
        setSavedDefectsSignature(
          buildDefectsSignature({
            defects: nextDefects,
            defectCupSlots: nextDefectCupSlots,
            nonUniformCupSlots: nextNonUniformCupSlots,
            defectiveCupSlots: nextDefectiveCupSlots,
          })
        );
      } catch (error) {
        if (isMounted) {
          setStatusMessage(error?.message || "Could not load saved defect history.");
        }
      }
    };

    loadSavedDefects();

    return () => {
      isMounted = false;
    };
  }, [sampleId, startInFinalSaved]);

  useEffect(() => {
    setIsFinalMode(Boolean(startInFinalMode));
    setIsFinalSaved(Boolean(startInFinalSaved));
    setSelectedFinalFields({});
    setUnselectedFinalFields({});
    setHasUnsavedChanges(false);
  }, [sampleId, startInFinalMode, startInFinalSaved]);

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

  const handleScoreSelect = (field, score) => {
    const hasSavedFinalEntry = (savedFeedback[field] || []).some((entry) => entry?.isFinal);
    const isFieldFinalSelected =
      (Boolean(selectedFinalFields[field]) || hasSavedFinalEntry) && !unselectedFinalFields[field];

    if (!isFieldEnabled(field) || isFieldFinalSelected) {
      return;
    }

    setHasUnsavedChanges(true);
    setFeedback((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        score,
      },
    }));
    if (score == null) {
      setSelectedFinalFields((prev) => ({
        ...prev,
        [field]: false,
      }));
    }
  };

  const getGroupComments = (group) => {
    const firstWithComments = group.fields.find((field) => String(feedback[field]?.comments || "").trim());
    return firstWithComments ? feedback[firstWithComments]?.comments || "" : feedback[group.fields[0]]?.comments || "";
  };

  const handleGroupCommentsChange = (group, comments) => {
    const enabledGroupFields = getEnabledGroupFields(group);
    if (enabledGroupFields.length === 0) {
      return;
    }

    setHasUnsavedChanges(true);
    setFeedback((prev) => {
      const next = { ...prev };
      enabledGroupFields.forEach((field) => {
        next[field] = {
          ...next[field],
          comments,
        };
      });
      return next;
    });
  };

  const handleCommentsChange = (field, comments) => {
    if (!isFieldEnabled(field)) {
      return;
    }

    setHasUnsavedChanges(true);
    setFeedback((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        comments,
      },
    }));
  };

  const handleToggleDefect = (key) => {
    setHasUnsavedChanges(true);
    setDefects((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  };

  const handleChangeDefectCupSlots = (key, slots) => {
    const normalizedSlots = Array.isArray(slots) ? slots : [];
    setHasUnsavedChanges(true);
    setDefectCupSlots((prev) => ({
      ...prev,
      [key]: normalizedSlots,
    }));
    setDefects((prev) => ({
      ...prev,
      [key]: normalizedSlots.length > 0,
    }));
  };

  const handleChangeNonUniformCupSlots = (slots) => {
    setHasUnsavedChanges(true);
    setNonUniformCupSlots(Array.isArray(slots) ? slots : []);
  };

  const handleChangeDefectiveCupSlots = (slots) => {
    setHasUnsavedChanges(true);
    setDefectiveCupSlots(Array.isArray(slots) ? slots : []);
  };

  const handleToggleFieldFinal = (field) => {
    if (!isFieldEnabled(field) || (isFinalMode && isFinalSaved)) {
      return;
    }

    const hasSavedFinalEntry = (savedFeedback[field] || []).some((entry) => entry?.isFinal);
    const isCurrentlyFinal =
      (Boolean(selectedFinalFields[field]) || hasSavedFinalEntry) && !unselectedFinalFields[field];
    if (!isCurrentlyFinal && feedback[field]?.score == null) {
      return;
    }

    setHasUnsavedChanges(true);
    setSelectedFinalFields((prev) => {
      const next = { ...prev };
      if (isCurrentlyFinal) {
        delete next[field];
      } else {
        next[field] = true;
      }
      return next;
    });
    setUnselectedFinalFields((prev) => {
      const next = { ...prev };
      if (isCurrentlyFinal) {
        next[field] = true;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const focusNoteGroup = (group) => {
    const noteId = getNoteGroupId(group);
    const measuredY = noteLayoutYRef.current[noteId];
    const fallbackY = noteId === "Fragrance-Aroma" ? 0 : 220 * scale;
    const targetY = Number.isFinite(measuredY) ? Math.max(0, measuredY - 72 * scale) : fallbackY;

    const scrollToTarget = () => {
      scrollRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    };

    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
  };

  const renderCuppingForm = () => {
    const showCombinedForm = !isBrewing && (canCaptureFeedback || isFinalMode);

    if (!showCombinedForm) {
      return visibleFields.map((field) => (
        <CoffeeFeedbackSection
          key={field}
          title={field}
          score={feedback[field].score}
          comments={feedback[field].comments}
          historyEntries={(savedFeedback[field] || []).filter((entry) => !entry?.isFinal)}
          finalEntries={(savedFeedback[field] || []).filter((entry) => entry?.isFinal)}
          onScoreSelect={(score) => handleScoreSelect(field, score)}
          onCommentsChange={(comments) => handleCommentsChange(field, comments)}
          disabled={isFeedbackLocked}
          showInputs={
            isFinalMode
              ? !isFinalSaved
              : !isBrewing && !(cupStateNumber === 3 && field === "Fragrance" && !isNtagCup)
          }
          showTitle={isFinalMode ? true : !isBrewing && !(cupStateNumber === 3 && field === "Fragrance" && !isNtagCup)}
          showFinalTitleSuffix={isFinalMode}
          isSavedView={isFinalMode && isFinalSaved}
        />
      ));
    }

    return (
      <View style={styles.cuppingForm}>
        <View style={[styles.cuppingFormTitleRow, { marginTop: 12 * scale, gap: 8 * scale }]}>
          <Text style={[styles.cuppingFormTitle, { fontSize: 22 * scale, lineHeight: 28 * scale }]}>
            Score Sample
          </Text>
          <View
            style={[
              styles.infoBadge,
              {
                width: 22 * scale,
                height: 22 * scale,
                borderRadius: 11 * scale,
                borderWidth: 2 * scale,
              },
            ]}
          >
            <Text style={[styles.infoBadgeText, { fontSize: 14 * scale, lineHeight: 17 * scale }]}>i</Text>
          </View>
        </View>

        {visibleFields.map((field) => {
          const finalEntries = (savedFeedback[field] || []).filter((entry) => entry?.isFinal);
          const noteGroup = getNoteGroupForField(field);
          const isFieldFinalSelected =
            (Boolean(selectedFinalFields[field]) || finalEntries.length > 0) && !unselectedFinalFields[field];
          const fieldEnabled = isFieldEnabled(field);
          const noteGroupEnabled = noteGroup ? isNoteGroupEnabled(noteGroup) : false;

          return (
            <View
              key={field}
              style={styles.cuppingFieldBlock}
              onLayout={(event) => {
                if (noteGroup) {
                  noteLayoutYRef.current[getNoteGroupId(noteGroup)] = event.nativeEvent.layout.y;
                }
              }}
            >
              <CuppingScoreRow
                title={field}
                score={feedback[field].score}
                hasFinalEntry={isFieldFinalSelected}
                disabled={!fieldEnabled}
                scale={scale}
                onScoreSelect={(score) => handleScoreSelect(field, score)}
                onFinalPress={() => handleToggleFieldFinal(field)}
              />
              {noteGroup ? (
                <NotesInput
                  value={getGroupComments(noteGroup)}
                  onChangeText={(comments) => handleGroupCommentsChange(noteGroup, comments)}
                  onFocus={() => focusNoteGroup(noteGroup)}
                  placeholder="Add notes"
                  accessibilityLabel={`${noteGroup.fields.join(" and ")} notes`}
                  disabled={!noteGroupEnabled}
                  style={[
                    styles.cuppingNoteInput,
                    !noteGroupEnabled && styles.cuppingNoteInputDisabled,
                    {
                      minHeight: 74 * scale,
                      borderRadius: 13 * scale,
                      paddingHorizontal: 15 * scale,
                      paddingTop: 12 * scale,
                      paddingBottom: 12 * scale,
                      fontSize: 18 * scale,
                      lineHeight: 23 * scale,
                      marginTop: 1 * scale,
                      marginBottom: 14 * scale,
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
        <DefectBadgeRow badges={defectBadges} scale={scale} />
      </View>
    );
  };

  const handleSave = async ({ stayOnScreen = false } = {}) => {
    if (!canCaptureFeedback) {
      return;
    }

    const fieldsToPersist = visibleFields.filter((field) => isFieldEnabled(field));

    try {
      const fieldsToSave = fieldsToPersist.reduce((acc, field) => {
        acc[field] = feedback[field];
        return acc;
      }, {});
      const finalFieldsToSave = fieldsToPersist.reduce((acc, field) => {
        const finalEntries = (savedFeedback[field] || []).filter((entry) => entry?.isFinal);
        const shouldSaveFinal =
          (Boolean(selectedFinalFields[field]) || finalEntries.length > 0) && !unselectedFinalFields[field];
        if (shouldSaveFinal && feedback[field]?.score != null) {
          acc[field] = feedback[field];
        }
        return acc;
      }, {});
      const finalFieldsToClear = fieldsToPersist.filter((field) => Boolean(unselectedFinalFields[field]));
      const emptyFieldsToClear = fieldsToPersist.filter((field) => {
        const entry = feedback[field];
        const isEmpty = entry?.score == null && !String(entry?.comments || "").trim();
        return isEmpty && !finalFieldsToSave[field];
      });
      const wasCompleteBeforeSave = hasCompleteFinalScoreSet(savedFeedback);
      const nowIso = new Date().toISOString();
      const nextSavedFeedback = (() => {
        const next = FEEDBACK_FIELDS.reduce((acc, field) => {
          let rows = Array.isArray(savedFeedback[field]) ? [...savedFeedback[field]] : [];
          if (emptyFieldsToClear.includes(field)) {
            rows = [];
          }
          if (finalFieldsToClear.includes(field)) {
            rows = rows.filter((entry) => !entry?.isFinal);
          }
          acc[field] = rows;
          return acc;
        }, {});

        fieldsToPersist.forEach((field) => {
          const entry = feedback[field];
          const hasValue = entry?.score != null || String(entry?.comments || "").trim();
          if (!hasValue) {
            return;
          }

          next[field] = [
            ...(Array.isArray(next[field]) ? next[field] : []),
            {
              isFinal: false,
              score: entry.score,
              comments: entry.comments,
              tempSnapshot: statusDisplay.temp,
              timeSnapshot: statusDisplay.time,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ];
        });

        Object.entries(finalFieldsToSave).forEach(([field, entry]) => {
          next[field] = [
            ...(Array.isArray(next[field]) ? next[field] : []),
            {
              isFinal: true,
              score: entry?.score ?? null,
              comments: entry?.comments || "",
              tempSnapshot: statusDisplay.temp,
              timeSnapshot: statusDisplay.time,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ];
        });

        return next;
      })();
      const willBeCompleteAfterSave = hasCompleteFinalScoreSet(nextSavedFeedback);

      if (!sessionId || !sampleId) {
        setSavedFeedback(nextSavedFeedback);
        setStatusMessage("Session linkage missing. Feedback is shown locally only.");
        setHasUnsavedChanges(false);
        if (!wasCompleteBeforeSave && willBeCompleteAfterSave) {
          triggerBalloons();
        }
        return;
      }

      if (emptyFieldsToClear.length > 0) {
        await clearSampleFeedbackFields({
          sampleId,
          fields: emptyFieldsToClear,
        });
      }
      await saveSampleFeedbackBatch({
        sessionId,
        sampleId,
        feedback: fieldsToSave,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: false,
      });
      if (Object.keys(finalFieldsToSave).length > 0) {
        await saveSampleFeedbackBatch({
          sessionId,
          sampleId,
          feedback: finalFieldsToSave,
          tempSnapshot: statusDisplay.temp,
          timeSnapshot: statusDisplay.time,
          isFinal: true,
        });
        await markSessionCompleteIfAllSamplesComplete(sessionId);
      }
      if (finalFieldsToClear.length > 0) {
        await clearSampleFinalFeedbackFields({
          sampleId,
          fields: finalFieldsToClear,
        });
      }
      await saveSampleDefectsEntry({
        sessionId,
        sampleId,
        defects,
        nonUniformCups,
        defectiveCups,
        nonUniformCupSlots,
        defectiveCupSlots,
        numberOfCups: defectsCupTotal || cupTotal || 1,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: false,
      });
      setStatusMessage("Feedback saved.");
      setSavedFeedback(nextSavedFeedback);
      const shouldNavigateAfterBalloons =
        !stayOnScreen &&
        typeof onBackPress === "function" &&
        !wasCompleteBeforeSave &&
        willBeCompleteAfterSave;
      if (!stayOnScreen && !shouldNavigateAfterBalloons) {
        setFeedback((prev) => clearFeedbackFields(prev, fieldsToPersist));
      }
      setSelectedFinalFields({});
      setIsDefectsDrawerOpen(false);
      setSavedDefectsSignature(currentDefectsSignature);
      setHasUnsavedChanges(false);
      if (stayOnScreen && !wasCompleteBeforeSave && willBeCompleteAfterSave) {
        triggerBalloons();
      } else if (!stayOnScreen && typeof onBackPress === "function") {
        if (shouldNavigateAfterBalloons) {
          triggerBalloons(() => {
            setFeedback((prev) => clearFeedbackFields(prev, fieldsToPersist));
            onBackPress();
          });
        } else {
          onBackPress();
        }
      }
    } catch (error) {
      setStatusMessage(error?.message || "Could not save feedback.");
    }
  };

  const handleFinalScore = () => {
    setIsFinalMode(true);
    setIsFinalSaved(false);
    setStatusMessage("Final scoring mode enabled.");
  };

  const handleSaveFinalScore = async () => {
    if (!sessionId || !sampleId) {
      setStatusMessage("Session linkage missing. Could not save final score.");
      return;
    }

    try {
      const fieldsToSave = FEEDBACK_FIELDS.reduce((acc, field) => {
        acc[field] = feedback[field];
        return acc;
      }, {});

      await saveSampleFeedbackBatch({
        sessionId,
        sampleId,
        feedback: fieldsToSave,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: true,
      });
      await saveSampleDefectsEntry({
        sessionId,
        sampleId,
        defects,
        nonUniformCups,
        defectiveCups,
        nonUniformCupSlots,
        defectiveCupSlots,
        numberOfCups: defectsCupTotal || cupTotal || 1,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: true,
      });
      await markSessionCompleteIfAllSamplesComplete(sessionId);

      const nowIso = new Date().toISOString();
      setSavedFeedback((prev) => {
        const next = { ...prev };
        FEEDBACK_FIELDS.forEach((field) => {
          const entry = feedback[field];
          const hasValue = entry?.score != null || String(entry?.comments || "").trim();
          if (!hasValue) {
            return;
          }
          const currentList = Array.isArray(next[field]) ? next[field] : [];
          next[field] = [
            ...currentList,
            {
              isFinal: true,
              score: entry.score,
              comments: entry.comments,
              tempSnapshot: statusDisplay.temp,
              timeSnapshot: statusDisplay.time,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ];
        });
        return next;
      });

      setFeedback((prev) => clearFeedbackFields(prev, FEEDBACK_FIELDS));
      setIsFinalSaved(true);
      setStatusMessage("Final score saved.");
      handleReturnHome();
    } catch (error) {
      setStatusMessage(error?.message || "Could not save final score.");
    }
  };

  const handleEditFinalScore = () => {
    setFeedback((prev) => {
      const next = { ...prev };
      FEEDBACK_FIELDS.forEach((field) => {
        const finalEntries = (savedFeedback[field] || []).filter((entry) => entry?.isFinal);
        const latestFinal = finalEntries.length > 0 ? finalEntries[finalEntries.length - 1] : null;
        next[field] = {
          score: latestFinal?.score ?? null,
          comments: latestFinal?.comments || "",
        };
      });
      return next;
    });
    setIsFinalSaved(false);
    setStatusMessage("Editing final score.");
  };

  const handleReturnHome = () => {
    if (typeof onBackPress === "function") {
      onBackPress();
    }
  };

  return (
    <View style={styles.screen}>
      {usesMockCuppingLayout ? (
        <View style={styles.cuppingHeaderLayer}>
          <Header
            variant="back"
            onBackPress={onBackPress}
            backAccessibilityLabel="Back"
            sideWidth={112}
            titleContent={
              <CuppingTitleContent
                sampleNumber={sampleNumber}
                samplesInSession={cupTotal}
                cupIndex={cupIndex}
                sampleColour={sampleColour}
                scale={scale}
              />
            }
            rightContent={<CuppingHeaderTemperature temp={statusDisplay.temp} scale={scale} />}
          />
        </View>
      ) : (
        <>
          <Header
            title={cupUUID}
            variant="back"
            onBackPress={onBackPress}
            backAccessibilityLabel="Back"
            onRightPress={isFinalMode && isFinalSaved ? handleEditFinalScore : undefined}
            rightIconText="✎"
            rightAccessibilityLabel="Edit final score"
          />

          <View style={styles.hero}>
            <Text style={styles.cupIndexText}>
              {cupIndexDisplay}
              {scoreDisplay ? <Text style={styles.cupIndexScoreText}>{scoreDisplay}</Text> : null}
            </Text>
          </View>

          <CupStatusStrip state={statusDisplay.state} temp={statusDisplay.temp} time={statusDisplay.time} />
        </>
      )}

      {statusMessage ? (
        <View style={styles.statusMessageWrap}>
          <Text style={styles.statusMessageText}>{statusMessage}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={72}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.feedbackListContent,
            usesMockCuppingLayout
              ? {
                  paddingBottom: Math.max(190 * scale, keyboardHeight + 170 * scale),
                }
              : null,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={usesMockCuppingLayout}
          canCancelContentTouches
          directionalLockEnabled
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {renderCuppingForm()}

          {isBrewing ? (
            <View style={styles.noticeCard} accessibilityLabel="Cup brewing notice">
              <Text style={styles.noticeTitle}>Cup is brewing</Text>
              <Text style={styles.noticeBody}>
                This cup is currently in brewing state. Cupping details can be entered once the cup reaches cupping state.
              </Text>
            </View>
          ) : null}

          {!isBrewing && !usesMockCuppingLayout ? (
            <View style={styles.defectsDrawer}>
              <Pressable
                style={styles.defectsDrawerHeader}
                onPress={() => setIsDefectsDrawerOpen((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={`${isDefectsDrawerOpen ? "Close" : "Open"} defects`}
              >
                <Text style={styles.defectsDrawerTitle}>
                  {isDefectsDrawerOpen ? "⌄" : "⌃"} Defects
                </Text>
              </Pressable>
              {isDefectsDrawerOpen ? (
                <View style={styles.defectsDrawerContent}>
                  <DefectsSection
                    cupTotal={defectsCupTotal || cupTotal}
                    defects={defects}
                    nonUniformCupSlots={nonUniformCupSlots}
                    defectiveCupSlots={defectiveCupSlots}
                    disabled={isFinalMode && isFinalSaved}
                    onToggleDefect={handleToggleDefect}
                    onChangeNonUniformCupSlots={handleChangeNonUniformCupSlots}
                    onChangeDefectiveCupSlots={handleChangeDefectiveCupSlots}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {usesMockCuppingLayout && isDefectsDrawerOpen ? (
        <View style={[styles.designCDefectDrawerOverlay, { top: 56 }]}>
          <Pressable
            style={[
              styles.designCDefectSection,
              {
                minHeight: 58 * scale,
                paddingHorizontal: 26 * scale,
              },
            ]}
            onPress={() => setIsDefectsDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close defects"
          >
            <Text style={[styles.designCDefectSectionText, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>
              ⌄ Defects
            </Text>
          </Pressable>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingTop: 34 * scale,
              paddingHorizontal: 26 * scale,
              paddingBottom: 18 * scale,
            }}
          >
            <DefectsSection
              variant="designC"
              scale={scale}
              cupTotal={defectsCupTotal || cupTotal}
              defects={defects}
              defectCupSlots={defectCupSlots}
              nonUniformCupSlots={nonUniformCupSlots}
              defectiveCupSlots={defectiveCupSlots}
              disabled={isFinalMode && isFinalSaved}
              onToggleDefect={handleToggleDefect}
              onChangeDefectCupSlots={handleChangeDefectCupSlots}
              onChangeNonUniformCupSlots={handleChangeNonUniformCupSlots}
              onChangeDefectiveCupSlots={handleChangeDefectiveCupSlots}
            />
          </ScrollView>
        </View>
      ) : null}

      {!isBrewing && usesMockCuppingLayout ? (
        <View style={styles.mockBottomDock}>
          {!isDefectsDrawerOpen ? (
            <View style={styles.mockBottomDrawer}>
              <Pressable
                style={[styles.defectsDrawerHeader, { minHeight: 58 * scale, paddingHorizontal: 26 * scale }]}
                onPress={() => setIsDefectsDrawerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open defects"
              >
                <Text style={[styles.designCDefectSectionText, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                  ⌃ Defects
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.mockBottomDrawerSpacer, { minHeight: 58 * scale }]} />
          )}
          {canCaptureFeedback && !isFinalMode ? (
            <View style={[styles.mockFooter, { paddingHorizontal: 26 * scale }]}>
              <FullPageButton
                label={isDefectsDrawerOpen || hasPendingChanges ? "Save" : "SCAN CUP"}
                onPress={
                  isDefectsDrawerOpen
                    ? () => setIsDefectsDrawerOpen(false)
                    : hasPendingChanges
                      ? () => handleSave({ stayOnScreen: true })
                      : onScanPress
                }
                loading={isScanInProgress}
                disabled={
                  isScanInProgress ||
                  (!isDefectsDrawerOpen && !hasPendingChanges && typeof onScanPress !== "function")
                }
                accessibilityLabel={
                  isDefectsDrawerOpen || hasPendingChanges ? "Save cupping feedback" : "Scan cup"
                }
                style={[
                  styles.scanButton,
                  { backgroundColor: isDefectsDrawerOpen || hasPendingChanges ? SAVE_GREY : IOS_BLUE },
                ]}
                textStyle={[
                  styles.scanButtonText,
                  { fontSize: 19 * scale, lineHeight: 23 * scale },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {canCaptureFeedback && !isFinalMode && !usesMockCuppingLayout ? (
        <View style={styles.footer}>
          <FullPageButton
            label="Save"
            onPress={handleSave}
            loading={isScanInProgress}
            disabled={isScanInProgress}
            accessibilityLabel="Save"
          />
          {isCupping && !usesMockCuppingLayout ? (
            <FullPageButton
              label="Final Score"
              onPress={handleFinalScore}
              loading={false}
              disabled={isScanInProgress}
              accessibilityLabel="Open final score"
              style={styles.finalScoreButton}
            />
          ) : null}
        </View>
      ) : null}

      {showBrewingDone ? (
        <View style={styles.footer}>
          <FullPageButton
            label="Done"
            onPress={handleReturnHome}
            loading={false}
            disabled={false}
            accessibilityLabel="Return to Home"
          />
        </View>
      ) : null}

      {isFinalMode && !isFinalSaved ? (
        <View style={styles.footer}>
          <FullPageButton
            label="Save"
            onPress={handleSaveFinalScore}
            loading={false}
            disabled={false}
            accessibilityLabel="Save final score"
          />
        </View>
      ) : null}

      {isFinalMode && isFinalSaved ? (
        <View style={styles.footer}>
          <FullPageButton
            label="Done"
            onPress={handleReturnHome}
            loading={false}
            disabled={false}
            accessibilityLabel="Return to Home"
          />
        </View>
      ) : null}
      <BalloonLayer animations={balloonAnimations} width={width} scale={scale} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cuppingHeaderLayer: {
    position: "relative",
    zIndex: 40,
    elevation: 40,
    backgroundColor: colors.surface,
  },
  cuppingHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cuppingHeaderDot: {},
  cuppingHeaderTitleText: {
    fontWeight: "700",
    color: colors.text,
  },
  cuppingHeaderTemp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cuppingHeaderThermometer: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cuppingHeaderThermometerStem: {
    position: "absolute",
    top: 1,
    borderColor: "#3f4852",
    backgroundColor: colors.surface,
  },
  cuppingHeaderThermometerBulb: {
    backgroundColor: "#3f4852",
    borderColor: "#3f4852",
  },
  cuppingHeaderTempText: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.text,
  },
  hero: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: spacing.md,
  },
  cupIndexText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 4,
    color: "#111111",
  },
  cupIndexScoreText: {
    color: "#dc2626",
  },
  keyboardWrap: {
    flex: 1,
    zIndex: 1,
    elevation: 1,
  },
  feedbackListContent: {
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 116,
    gap: 0,
  },
  cuppingForm: {
    gap: 0,
  },
  cuppingFormTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cuppingFormTitle: {
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  infoBadge: {
    borderColor: "#47515d",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBadgeText: {
    fontWeight: "800",
    color: "#47515d",
  },
  cuppingFieldBlock: {},
  cuppingScoreRow: {},
  cuppingScoreTitle: {
    fontWeight: "800",
    color: "#3f4852",
  },
  cuppingScoreControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cuppingScoreCircle: {
    borderColor: "#3f4852",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  cuppingScoreCircleSelected: {
    backgroundColor: "#3f4852",
  },
  cuppingScoreText: {
    fontWeight: "600",
    color: "#3f4852",
  },
  cuppingScoreTextSelected: {
    color: "#ffffff",
  },
  cuppingFinalPill: {
    borderWidth: 2,
    borderColor: "#3f4852",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
  },
  cuppingFinalPillSelected: {
    backgroundColor: "#3f4852",
    borderColor: "#3f4852",
  },
  cuppingFinalPillDisabled: {
    borderColor: "#b8bec5",
    opacity: 1,
  },
  cuppingFinalText: {
    fontWeight: "600",
    color: "#3f4852",
  },
  cuppingFinalTextSelected: {
    color: "#ffffff",
  },
  cuppingFinalTextDisabled: {
    color: "#b8bec5",
  },
  cuppingNoteInput: {
    backgroundColor: "#f4f5f6",
    borderColor: "#d7dadd",
  },
  cuppingNoteInputDisabled: {
    backgroundColor: "#eef0f2",
    borderColor: "#d5d8db",
    opacity: 0.55,
  },
  defectBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
  },
  defectBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef0f2",
    borderWidth: 1,
    borderColor: "#d5d8db",
  },
  defectBadgeIcon: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3f4852",
  },
  defectBadgeIconText: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0,
  },
  defectBadgeText: {
    color: "#3f4852",
    fontWeight: "800",
    letterSpacing: 0,
  },
  feedbackSection: {
    gap: spacing.xs,
  },
  feedbackTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feedbackSectionDisabled: {
    opacity: 0.7,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: "#d9e0ea",
    borderRadius: 10,
    backgroundColor: "#eef2f6",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyMeta: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
  },
  historyScoreBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  historyScoreText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  historyBody: {
    fontSize: 14,
    color: "#475569",
  },
  historyWrap: {
    gap: 8,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8a97ac",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  historyDrawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyDrawerToggle: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  noticeCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: "#f5d0a0",
    backgroundColor: "#fff8ef",
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  statusMessageWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusMessageText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  defectsDrawer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#eef0f2",
    marginHorizontal: -spacing.md,
  },
  defectsDrawerHeader: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  defectsDrawerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#3f4852",
  },
  mockBottomDrawer: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#eef0f2",
  },
  mockBottomDrawerSpacer: {
    backgroundColor: colors.surface,
  },
  mockBottomDock: {
    backgroundColor: colors.surface,
    zIndex: 30,
    elevation: 30,
  },
  designCDefectDrawerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    zIndex: 15,
    elevation: 15,
  },
  designCDefectSection: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef0f2",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  designCDefectSectionText: {
    color: "#3f4852",
    fontWeight: "800",
    letterSpacing: 0,
  },
  mockDefectsDrawerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#3f4852",
  },
  defectsDrawerContent: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#8a4b08",
  },
  noticeBody: {
    fontSize: 14,
    color: "#9a5a12",
    lineHeight: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  mockFooter: {
    backgroundColor: colors.surface,
    paddingTop: 14,
    paddingBottom: 24,
  },
  scanButton: {
    minHeight: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: IOS_BLUE,
  },
  scanButtonText: {
    letterSpacing: 1.4,
  },
  balloonLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
  },
  balloon: {
    position: "absolute",
    alignItems: "center",
  },
  balloonKnot: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  finalScoreButton: {
    backgroundColor: "#374151",
  },
  finalisedWrap: {
    gap: 6,
  },
  finalisedTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  finalisedCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 6,
  },
});
