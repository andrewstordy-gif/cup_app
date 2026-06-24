import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { CupStatusStrip } from "../../../components/ui/CupStatusStrip";
import { ScoreSelector } from "../../../components/ui/ScoreSelector";
import { NotesInput } from "../../../components/ui/NotesInput";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { AppIcon } from "../../../components/ui/AppIcon";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import {
  clearSampleFeedbackFields,
  clearSampleFinalFeedbackFields,
  getSampleDefects,
  getSampleFeedback,
  getSampleFlavourObservations,
  saveSampleDefectsEntry,
  saveSampleFeedbackBatch,
  saveSampleFlavourObservations,
  pruneSampleFlavourObservations,
} from "../../../data/sessionRepository";
import { DefectsSection } from "../components/DefectsSection";
import { KeywordPillRow } from "../components/KeywordPillRow";
import { tokenizeFlavourKeywords } from "../data/flavourKeywords";
import { getProcessLabel, normalizeCuppingModeKey } from "../constants/sessionDetails";

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
  { afterField: "Aroma", fields: ["Fragrance", "Aroma"], label: "Fragrance / Aroma Notes" },
  { afterField: "Overall", fields: ["Flavour", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"], label: "Flavour Notes" },
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
const IOS_BLUE = colors.action;
const SAVE_GREY = colors.ink;
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

function hasAnyScore(scoresByField = {}) {
  return FEEDBACK_FIELDS.some((field) => scoresByField?.[field] != null);
}

function countScores(scoresByField = {}) {
  return FEEDBACK_FIELDS.filter((field) => scoresByField?.[field] != null).length;
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
    normalizeSlotSignature(defectCupSlots?.otherBean),
    normalizeSlotSignature(defectCupSlots?.underdeveloped),
    normalizeSlotSignature(defectCupSlots?.baked),
    normalizeSlotSignature(defectCupSlots?.unevenRoast),
    normalizeSlotSignature(defectCupSlots?.overdeveloped),
    defects?.moldy ? "1" : "0",
    defects?.phenolic ? "1" : "0",
    defects?.potato ? "1" : "0",
    defects?.otherBean ? "1" : "0",
    defects?.underdeveloped ? "1" : "0",
    defects?.baked ? "1" : "0",
    defects?.unevenRoast ? "1" : "0",
    defects?.overdeveloped ? "1" : "0",
  ].join("|");
}

function parseTemperatureSnapshot(value) {
  const text = String(value || "");
  if (!text || text.toLowerCase().includes("n/a")) {
    return null;
  }

  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function parseTimeSnapshot(value) {
  const text = String(value || "").split("/")[0].trim();
  if (!text) {
    return null;
  }

  const parts = text.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  const seconds = parts.pop();
  const minutes = parts.pop();
  const hours = parts.length > 0 ? parts.pop() : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatObservationElapsedTime(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatObservationPillLabel(observation) {
  const parts = [];
  if (observation?.tempC != null && Number.isFinite(Number(observation.tempC))) {
    parts.push(`${Math.round(Number(observation.tempC))} °C`);
  }

  parts.push(observation?.label || observation?.keyword || "");
  return parts.filter(Boolean).join("|");
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


function buildFlavourObservationCommentGroups(feedback, fields) {
  const includedFields = new Set(Array.isArray(fields) ? fields : []);
  const groupedFields = new Set();
  const groups = [];

  NOTE_GROUPS.forEach((group) => {
    const sourceFields = group.fields.filter((field) => includedFields.has(field));
    if (sourceFields.length === 0) {
      return;
    }

    sourceFields.forEach((field) => groupedFields.add(field));
    const firstWithComments = sourceFields.find((field) => String(feedback?.[field]?.comments || "").trim());
    const comments = firstWithComments ? String(feedback?.[firstWithComments]?.comments || "").trim() : "";
    if (comments) {
      groups.push({ comments, fields: sourceFields });
    }
  });

  Array.from(includedFields).forEach((field) => {
    if (groupedFields.has(field)) {
      return;
    }

    const comments = String(feedback?.[field]?.comments || "").trim();
    if (comments) {
      groups.push({ comments, fields: [field] });
    }
  });

  return groups;
}

function buildFlavourObservationsFromFeedback({
  feedback,
  fields,
  existingObservations,
  tempSnapshot,
  timeSnapshot,
  createdAt,
}) {
  const tempC = parseTemperatureSnapshot(tempSnapshot);
  const elapsedSeconds = parseTimeSnapshot(timeSnapshot);
  const observationsBySourceAndKeyword = new Map();

  buildFlavourObservationCommentGroups(feedback, fields).forEach(({ comments, fields: sourceFields }) => {
    const keywordsByName = tokenizeFlavourKeywords(comments).reduce((acc, token) => {
      if (token.type !== "pill") {
        return acc;
      }

      const keyword = String(token.keyword || "").trim().toLowerCase();
      if (!keyword) {
        return acc;
      }

      if (!acc[keyword]) {
        acc[keyword] = {
          keyword,
          label: token.keyword,
          colour: token.colour,
          count: 0,
        };
      }
      acc[keyword].count += 1;
      return acc;
    }, {});

    Object.values(keywordsByName).forEach((pill) => {
      const existingCount = (Array.isArray(existingObservations) ? existingObservations : []).filter(
        (observation) =>
          String(observation?.keyword || "").trim().toLowerCase() === pill.keyword &&
          observationMatchesFields(observation, sourceFields)
      ).length;
      if (existingCount >= pill.count) {
        return;
      }

      const observationKey = `${sourceFields.join(",")}:${pill.keyword}`;
      if (observationsBySourceAndKeyword.has(observationKey)) {
        return;
      }

      observationsBySourceAndKeyword.set(observationKey, {
        keyword: pill.keyword,
        label: pill.label || pill.keyword,
        colour: pill.colour,
        tempC,
        elapsedSeconds,
        sourceField: sourceFields.join(","),
        createdAt,
      });
    });
  });

  return Array.from(observationsBySourceAndKeyword.values());
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

function formatElapsedTime(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "00:00";
  }

  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveSampleNumber(sampleNumber, cupIndex) {
  const explicitSampleNumber = Number.parseInt(sampleNumber, 10);
  if (Number.isInteger(explicitSampleNumber) && explicitSampleNumber > 0) {
    return explicitSampleNumber;
  }

  const index = Number.parseInt(cupIndex, 10);
  return Number.isInteger(index) && index >= 0 ? index + 1 : 1;
}

function CuppingTitleContent({ sampleNumber, cupIndex, scale }) {
  const displayNumber = resolveSampleNumber(sampleNumber, cupIndex);

  return (
    <View style={[styles.cuppingHeaderTitleStack, { gap: 2 * scale }]}>
      <Text style={styles.cuppingHeaderTitleText}>{displayNumber}</Text>
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

function SamplePagerIndicator({ current, total, scale, compact = false }) {
  if (!total || total <= 1) {
    return null;
  }

  return (
    <View
      style={[
        styles.samplePager,
        {
          gap: compact ? 5 * scale : 7 * scale,
          paddingBottom: compact ? 0 : 8 * scale,
        },
      ]}
    >
      {Array.from({ length: total }).map((_, index) => {
        const active = index === current;
        return (
          <View
            key={`sample-page-${index}`}
            style={[
              styles.samplePagerDot,
              {
                width: (active ? 18 : 9) * scale * (compact ? 0.78 : 1),
                height: 9 * scale * (compact ? 0.78 : 1),
                borderRadius: 5 * scale,
              },
              active ? styles.samplePagerDotActive : null,
            ]}
          />
        );
      })}
    </View>
  );
}

function DefectsDrawerLabel({ expanded, scale = 1, textStyle }) {
  return (
    <View style={styles.defectsDrawerLabel}>
      <AppIcon
        name={expanded ? "chevron-down" : "chevron-up"}
        role="icon_navigation"
      />
      <Text style={textStyle}>Defects</Text>
    </View>
  );
}

function CuppingScoreRow({
  title,
  score,
  disabled = false,
  scale,
  onScoreSelect,
}) {
  return (
    <View style={[styles.cuppingScoreRow, disabled && styles.feedbackSectionDisabled]}>
      <Text style={styles.cuppingScoreTitle}>{title}</Text>
      <View style={[styles.cuppingScoreControls, { marginTop: spacing.xs }]}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => {
          const selected = score === value;
          return (
            <Pressable
              key={`${title}-${value}`}
              onPress={() => onScoreSelect(selected ? null : value)}
              disabled={disabled}
              style={[
                styles.cuppingScoreCircle,
                {
                  width: 46 * scale,
                  height: 46 * scale,
                  borderRadius: 23 * scale,
                  borderWidth: 2.3 * scale,
                },
                selected && styles.cuppingScoreCircleSelected,
                disabled && styles.cuppingScoreCircleDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${title} score ${value}`}
              accessibilityState={{ selected, disabled }}
            >
              <Text
                style={[
                  styles.cuppingScoreText,
                  selected && styles.cuppingScoreTextSelected,
                  disabled && styles.cuppingScoreTextDisabled,
                ]}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
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
          paddingTop: 14 * scale,
          gap: 6 * scale,
        },
      ]}
    >
      {badges.map((badge) => (
        <View key={badge.id} accessibilityLabel={badge.label} style={styles.defectBadge}>
          <Text style={styles.defectBadgeText}>{badge.label.toUpperCase()}</Text>
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
  cuppingMode = "blind",
  coffeeNameOrigin = "",
  process = "",
  startInFinalMode = false,
  startInFinalSaved = false,
  isScanInProgress = false,
  canSwipeSamples = false,
  onSampleSwipe,
  elapsedSeconds = null,
  brewTimeSeconds = null,
  scanRevision = null,
  initialScrollTarget = null,
  captureMode = null,
  isSessionComplete = false,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const scrollRef = useRef(null);
  const noteLayoutYRef = useRef({});
  const noteInputOffsetYRef = useRef({});
  const fieldLayoutYRef = useRef({});
  const autoScrolledSampleRef = useRef(null);
  const balloonAnimations = useRef(BALLOON_CONFIGS.map(() => new Animated.Value(0))).current;
  const [feedback, setFeedback] = useState(() => buildInitialFeedbackState());
  const [savedFeedback, setSavedFeedback] = useState(() =>
    FEEDBACK_FIELDS.reduce((acc, field) => {
      acc[field] = [];
      return acc;
    }, {})
  );
  const [savedFlavourObservations, setSavedFlavourObservations] = useState([]);
  const [isSavedFeedbackLoaded, setIsSavedFeedbackLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isFinalMode, setIsFinalMode] = useState(Boolean(startInFinalMode));
  const [isFinalSaved, setIsFinalSaved] = useState(Boolean(startInFinalSaved));
  const [defects, setDefects] = useState(() => buildDefaultDefectsState());
  const [defectCupSlots, setDefectCupSlots] = useState({});
  const [nonUniformCupSlots, setNonUniformCupSlots] = useState([]);
  const [defectiveCupSlots, setDefectiveCupSlots] = useState([]);
  const [isDefectsDrawerOpen, setIsDefectsDrawerOpen] = useState(false);
  const [savedDefectsSignature, setSavedDefectsSignature] = useState(() => buildDefectsSignature());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [coffeeMetaHeight, setCoffeeMetaHeight] = useState(0);
  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(elapsedSeconds);
  const normalizedCuppingMode = normalizeCuppingModeKey(cuppingMode);
  const isOpenCuppingMode = normalizedCuppingMode === "open";
  const coffeeNameLabel = String(coffeeNameOrigin || "").trim();
  const processLabel = getProcessLabel(process) || String(process || "").trim();
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
  const samplePagerTotal = Number(cupTotal) || 0;
  const samplePagerIndex = Math.max(
    0,
    Math.min(samplePagerTotal - 1, Number.isInteger(Number(sampleNumber)) ? Number(sampleNumber) - 1 : Number(cupIndex) || 0)
  );
  const canSwipeSamplePages = Boolean(canSwipeSamples && samplePagerTotal > 1 && typeof onSampleSwipe === "function");
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (!canSwipeSamplePages) {
            return false;
          }
          return Math.abs(gestureState.dx) > 42 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.6;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!canSwipeSamplePages) {
            return;
          }
          if (hasPendingChanges) {
            setStatusMessage("Save changes before switching samples.");
            return;
          }
          if (gestureState.dx < -48 && samplePagerIndex < samplePagerTotal - 1) {
            onSampleSwipe("next");
          } else if (gestureState.dx > 48 && samplePagerIndex > 0) {
            onSampleSwipe("previous");
          }
        },
      }),
    [canSwipeSamplePages, hasPendingChanges, onSampleSwipe, samplePagerIndex, samplePagerTotal]
  );

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
      time:
        cupStateNumber === 2 && displayElapsedSeconds !== null
          ? `${formatElapsedTime(displayElapsedSeconds)}${brewTimeSeconds ? ` / ${formatElapsedTime(brewTimeSeconds)}` : ""}`
          : cupStatus?.time || "04:20",
    }),
    [brewTimeSeconds, cupStateNumber, cupStatus, displayElapsedSeconds]
  );

  const isNtagCup = tagType === "ntag_cup";
  const isBrewing = cupStateNumber === 2;
  const isCupping = cupStateNumber === 3;
  const canCaptureFeedback = !isSessionComplete && (cupStateNumber === 1 || cupStateNumber === 3);
  const isFeedbackLocked = isSessionComplete || (cupStateNumber === 2 && !isFinalMode);
  const showBrewingDone = isBrewing && !isFinalMode;
  const hasSavedAromaScore = useMemo(
    () => (savedFeedback.Aroma || []).some((entry) => entry?.score != null),
    [savedFeedback.Aroma]
  );
  const isAromaPopulated = useMemo(() => {
    return hasSavedAromaScore || feedback.Aroma?.score != null;
  }, [feedback.Aroma?.score, hasSavedAromaScore]);

  const visibleFields = useMemo(() => {
    if (isFinalMode) {
      return FEEDBACK_FIELDS;
    }

    if (isSessionComplete) {
      return FEEDBACK_FIELDS;
    }

    if (canCaptureFeedback) {
      return FEEDBACK_FIELDS;
    }

    return cupStateNumber === 2 ? READY_FIELDS : [];
  }, [canCaptureFeedback, cupStateNumber, isFinalMode, isSessionComplete]);

  const enabledFields = useMemo(() => {
    if (isFinalMode) {
      return isFinalSaved ? [] : FEEDBACK_FIELDS;
    }

    if (captureMode === "aroma_only") {
      return ["Fragrance", "Aroma"];
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
  }, [captureMode, cupStateNumber, isAromaPopulated, isFinalMode, isFinalSaved, isNtagCup]);

  const finalScoreSummary = useMemo(() => {
    const scoresByField = FEEDBACK_FIELDS.reduce((acc, field) => {
      const savedEntries = (savedFeedback[field] || []).filter((entry) => entry?.score != null);
      const latestSavedEntry =
        savedEntries.length > 0 ? savedEntries[savedEntries.length - 1] : null;
      acc[field] = feedback[field]?.score ?? latestSavedEntry?.score ?? null;
      return acc;
    }, {});

    if (!hasAnyScore(scoresByField) || countScores(scoresByField) < FEEDBACK_FIELDS.length) {
      return null;
    }

    return calculateFinalCuppingScore({
      finalScoresByField: scoresByField,
      nonUniformCups,
      defectiveCups,
      numberOfCups: defectsCupTotal || cupTotal || 1,
    });
  }, [
    feedback,
    savedFeedback,
    nonUniformCups,
    defectiveCups,
    defectsCupTotal,
    cupTotal,
  ]);
  const isLiveScoreFinal = useMemo(
    () =>
      finalScoreSummary &&
      !hasPendingChanges &&
      FEEDBACK_FIELDS.every((field) => (savedFeedback[field] || []).some((entry) => entry?.isFinal && entry?.score != null)),
    [finalScoreSummary, hasPendingChanges, savedFeedback]
  );
  const liveScoreTitle = finalScoreSummary
    ? `Score ${finalScoreSummary.scoreRounded.toFixed(SCORE_PRECISION)}`
    : "Score Pending";
  const cupIndexDisplay = `CUP ${String(cupIndex + 1).padStart(2, "0")} / ${String(cupTotal).padStart(2, "0")}`;
  const scoreDisplay =
    isLiveScoreFinal && finalScoreSummary
      ? `  |  SCORE ${finalScoreSummary.scoreRounded.toFixed(SCORE_PRECISION)}`
      : "";
  const usesMockCuppingLayout = !isBrewing && (canCaptureFeedback || isFinalMode || isSessionComplete);
  const isFieldEnabled = (field) => (!isSessionComplete || isFinalMode) && enabledFields.includes(field);
  const getEnabledGroupFields = (group) => group.fields.filter((field) => isFieldEnabled(field));
  const isNoteGroupEnabled = (group) => getEnabledGroupFields(group).length > 0;
  const defectBadges = useMemo(
    () =>
      [
        {
          id: "non-uniform",
          iconName: "defect-non-uniform",
          label: "Non-uniform",
          isVisible: nonUniformCupSlots.length > 0,
        },
        {
          id: "moldy",
          iconName: "defect-mouldy",
          label: "Mouldy",
          isVisible: Boolean(defects.moldy) || (defectCupSlots.moldy || []).length > 0,
        },
        {
          id: "phenolic",
          iconName: "defect-phenolic",
          label: "Phenolic",
          isVisible: Boolean(defects.phenolic) || (defectCupSlots.phenolic || []).length > 0,
        },
        {
          id: "potato",
          iconName: "defect-potato",
          label: "Potato",
          isVisible: Boolean(defects.potato) || (defectCupSlots.potato || []).length > 0,
        },
        {
          id: "otherBean",
          iconName: "defect-other-bean",
          label: "Other",
          isVisible: Boolean(defects.otherBean) || (defectCupSlots.otherBean || []).length > 0,
        },
        {
          id: "underdeveloped",
          iconName: "defect-underdeveloped",
          label: "Underdeveloped",
          isVisible: Boolean(defects.underdeveloped) || (defectCupSlots.underdeveloped || []).length > 0,
        },
        {
          id: "baked",
          iconName: "defect-baked",
          label: "Baked",
          isVisible: Boolean(defects.baked) || (defectCupSlots.baked || []).length > 0,
        },
        {
          id: "unevenRoast",
          iconName: "defect-uneven-roast",
          label: "Uneven roast",
          isVisible: Boolean(defects.unevenRoast) || (defectCupSlots.unevenRoast || []).length > 0,
        },
        {
          id: "overdeveloped",
          iconName: "defect-overdeveloped",
          label: "Overdeveloped",
          isVisible: Boolean(defects.overdeveloped) || (defectCupSlots.overdeveloped || []).length > 0,
        },
      ].filter((badge) => badge.isVisible),
    [defectCupSlots, defects, nonUniformCupSlots.length]
  );

  useEffect(() => {
    let isMounted = true;
    const emptyFeedbackByField = FEEDBACK_FIELDS.reduce((acc, field) => {
      acc[field] = [];
      return acc;
    }, {});

    setSavedFeedback(emptyFeedbackByField);
    setSavedFlavourObservations([]);
    setIsSavedFeedbackLoaded(false);
    setFeedback(buildInitialFeedbackState());
    setHasUnsavedChanges(false);

    const loadSavedFeedback = async () => {
      if (!sampleId) {
        if (isMounted) {
          setIsSavedFeedbackLoaded(true);
        }
        return;
      }

      try {
        const rowsByField = await getSampleFeedback(sampleId);
        const flavourObservations = await getSampleFlavourObservations(sampleId);
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
        setSavedFlavourObservations(flavourObservations);
        setFeedback(buildFeedbackStateFromSavedRows(next));
        setIsSavedFeedbackLoaded(true);
      } catch (error) {
        if (isMounted) {
          setIsSavedFeedbackLoaded(true);
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
          otherBean: Boolean(latest.otherBean),
          underdeveloped: Boolean(latest.underdeveloped),
          baked: Boolean(latest.baked),
          unevenRoast: Boolean(latest.unevenRoast),
          overdeveloped: Boolean(latest.overdeveloped),
        };
        const nextDefectCupSlots =
          latest.defectCupSlots && Object.keys(latest.defectCupSlots).length > 0
            ? latest.defectCupSlots
            : {
                moldy: latest.moldy ? [1] : [],
                phenolic: latest.phenolic ? [1] : [],
                potato: latest.potato ? [1] : [],
                otherBean: latest.otherBean ? [1] : [],
                underdeveloped: latest.underdeveloped ? [1] : [],
                baked: latest.baked ? [1] : [],
                unevenRoast: latest.unevenRoast ? [1] : [],
                overdeveloped: latest.overdeveloped ? [1] : [],
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
    setHasUnsavedChanges(false);
  }, [sampleId, startInFinalMode, startInFinalSaved]);

  useEffect(() => {
    if (!usesMockCuppingLayout || !isSavedFeedbackLoaded) {
      return undefined;
    }

    if (![1, 3].includes(Number(cupStateNumber))) {
      return undefined;
    }

    const scrollTarget = initialScrollTarget || (cupStateNumber === 3 && hasSavedAromaScore ? "Flavour" : "top");
    const scrollKey = `${sampleId || cupUUID || "sample"}:${cupStateNumber}:${scrollTarget}:${scanRevision || "initial"}`;
    if (autoScrolledSampleRef.current === scrollKey) {
      return undefined;
    }
    autoScrolledSampleRef.current = scrollKey;

    const scrollToInitialTarget = () => {
      const measuredY = scrollTarget === "Flavour" ? fieldLayoutYRef.current.Flavour : 0;
      const y = Number.isFinite(measuredY) ? Math.max(0, measuredY) : 0;
      scrollRef.current?.scrollTo({ y, animated: false });
    };

    requestAnimationFrame(scrollToInitialTarget);
    const timeoutId = setTimeout(scrollToInitialTarget, 220);

    return () => clearTimeout(timeoutId);
  }, [
    cupStateNumber,
    cupUUID,
    hasSavedAromaScore,
    initialScrollTarget,
    isSavedFeedbackLoaded,
    sampleId,
    scanRevision,
    usesMockCuppingLayout,
  ]);

  useEffect(() => {
    const numericElapsed = Number.parseInt(elapsedSeconds, 10);
    setDisplayElapsedSeconds(Number.isFinite(numericElapsed) && numericElapsed >= 0 ? numericElapsed : null);
  }, [elapsedSeconds, sampleId]);

  useEffect(() => {
    if (!isBrewing) {
      return undefined;
    }

    const interval = setInterval(() => {
      setDisplayElapsedSeconds((prev) => {
        if (prev === null || prev === undefined) {
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isBrewing, sampleId]);

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
    if (!isFieldEnabled(field)) {
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

  const focusNoteGroup = (group) => {
    const noteId = getNoteGroupId(group);
    const measuredFieldY = noteLayoutYRef.current[noteId];

    if (!usesMockCuppingLayout) {
      const fallbackY = noteId === "Fragrance-Aroma" ? 0 : 220 * scale;
      const targetY = Number.isFinite(measuredFieldY) ? Math.max(0, measuredFieldY - 72 * scale) : fallbackY;

      const scrollToTarget = () => {
        scrollRef.current?.scrollTo({
          y: targetY,
          animated: true,
        });
      };

      requestAnimationFrame(scrollToTarget);
      setTimeout(scrollToTarget, 180);
      return;
    }

    const measuredInputOffsetY = noteInputOffsetYRef.current[noteId];
    const measuredInputY =
      Number.isFinite(measuredFieldY) && Number.isFinite(measuredInputOffsetY)
        ? measuredFieldY + measuredInputOffsetY
        : null;
    const measuredY = Number.isFinite(measuredInputY) ? measuredInputY : measuredFieldY;
    const focusedNotesTopOffset = isOpenCuppingMode ? 72 * scale : 128 * scale;
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

  const renderScoreSummary = ({ placement = "bottom" } = {}) => {
    const hasDefectBadges = defectBadges.length > 0;
    const isDrawerPlacement = placement === "drawer";

    return (
      <View
        style={[
          styles.cuppingScoreSummary,
          {
            marginTop: isDrawerPlacement ? spacing.lg : spacing.md,
            marginBottom: isDrawerPlacement
              ? spacing.lg
              : hasDefectBadges
                ? spacing.xs
                : spacing.lg,
          },
        ]}
      >
        <View style={[styles.cuppingFormTitleRow, { gap: 8 * scale }]}>
          <Text style={styles.cuppingFormTitle}>{liveScoreTitle}</Text>
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
            <AppIcon
              name="info"
              role="icon_status"
              size={14 * scale}
              style={styles.infoBadgeText}
            />
          </View>
        </View>
        <DefectBadgeRow badges={defectBadges} scale={scale} />
      </View>
    );
  };

  const renderCuppingForm = () => {
    const showCombinedForm = !isBrewing && (canCaptureFeedback || isFinalMode || isSessionComplete);

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
        {visibleFields.map((field) => {
          const noteGroup = getNoteGroupForField(field);
          const fieldEnabled = isFieldEnabled(field);
          const noteGroupEnabled = noteGroup ? isNoteGroupEnabled(noteGroup) : false;

          return (
            <View
              key={field}
              style={styles.cuppingFieldBlock}
              onLayout={(event) => {
                fieldLayoutYRef.current[field] = event.nativeEvent.layout.y;
                if (noteGroup) {
                  noteLayoutYRef.current[getNoteGroupId(noteGroup)] = event.nativeEvent.layout.y;
                }
              }}
            >
              <CuppingScoreRow
                title={field}
                score={feedback[field].score}
                disabled={!fieldEnabled}
                scale={scale}
                onScoreSelect={(score) => handleScoreSelect(field, score)}
              />
              {noteGroup ? (() => {
                const groupComments = getGroupComments(noteGroup);
                const savedObsByKeyword = {};
                savedFlavourObservations
                  .filter((o) => observationMatchesFields(o, noteGroup.fields))
                  .forEach((o) => {
                    const kw = String(o.keyword || "").toLowerCase();
                    if (!savedObsByKeyword[kw]) savedObsByKeyword[kw] = o;
                  });
                const livePills = tokenizeFlavourKeywords(groupComments)
                  .filter((t) => t.type === "pill")
                  .reduce((acc, t) => {
                    const kw = String(t.keyword || "").toLowerCase();
                    if (!acc.seen.has(kw)) {
                      acc.seen.add(kw);
                      const savedObs = savedObsByKeyword[kw];
                      const label = savedObs ? formatObservationPillLabel(savedObs) : t.keyword;
                      acc.pills.push({ keyword: t.keyword, label, colour: t.colour });
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
                        value={groupComments}
                        onChangeText={(comments) => handleGroupCommentsChange(noteGroup, comments)}
                        onFocus={() => focusNoteGroup(noteGroup)}
                        placeholder={`Add ${noteGroup.label.toLowerCase()}...`}
                        accessibilityLabel={noteGroup.label}
                        disabled={!noteGroupEnabled}
                        style={[
                          styles.cuppingNoteInput,
                          !noteGroupEnabled && styles.cuppingNoteInputDisabled,
                          {
                            minHeight: 114 * scale,
                            borderRadius: 13 * scale,
                            paddingHorizontal: 15 * scale,
                            paddingTop: 8 * scale,
                            paddingBottom: 8 * scale,
                            marginTop: spacing.sm,
                            marginBottom: livePills.length > 0 ? spacing.xs : 0,
                          },
                        ]}
                      />
                    </View>
                    {livePills.length > 0 ? (
                      <KeywordPillRow
                        pills={livePills}
                        scale={scale}
                        outline
                        style={{
                          marginBottom: noteGroup.afterField === "Aroma" ? spacing.md : 14 * scale,
                        }}
                      />
                    ) : null}
                  </>
                );
              })() : null}
            </View>
          );
        })}
        {renderScoreSummary({ placement: "bottom" })}
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
        if (feedback[field]?.score != null) {
          acc[field] = feedback[field];
        }
        return acc;
      }, {});
      const finalFieldsToClear = fieldsToPersist.filter((field) => feedback[field]?.score == null);
      const finalFieldsToReplace = Object.keys(finalFieldsToSave);
      const emptyFieldsToClear = fieldsToPersist.filter((field) => {
        const entry = feedback[field];
        const isEmpty = entry?.score == null && !String(entry?.comments || "").trim();
        return isEmpty && !finalFieldsToSave[field];
      });
      const wasCompleteBeforeSave = hasCompleteFinalScoreSet(savedFeedback);
      const nowIso = new Date().toISOString();
      const flavourObservations = buildFlavourObservationsFromFeedback({
        feedback,
        fields: fieldsToPersist,
        existingObservations: savedFlavourObservations,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        createdAt: nowIso,
      });
      const nextSavedFeedback = (() => {
        const next = FEEDBACK_FIELDS.reduce((acc, field) => {
          let rows = Array.isArray(savedFeedback[field]) ? [...savedFeedback[field]] : [];
          if (emptyFieldsToClear.includes(field)) {
            rows = [];
          }
          if (finalFieldsToClear.includes(field) || finalFieldsToReplace.includes(field)) {
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
      if (finalFieldsToReplace.length > 0) {
        await clearSampleFinalFeedbackFields({
          sampleId,
          fields: finalFieldsToReplace,
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
      }
      if (finalFieldsToClear.length > 0) {
        await clearSampleFinalFeedbackFields({
          sampleId,
          fields: finalFieldsToClear,
        });
      }
      const pruneGroups = NOTE_GROUPS.map((noteGroup) => {
        const keepKeywords = new Set();
        buildFlavourObservationCommentGroups(feedback, noteGroup.fields).forEach(({ comments }) => {
          tokenizeFlavourKeywords(comments).forEach((token) => {
            if (token.type === "pill") {
              keepKeywords.add(String(token.keyword || "").trim().toLowerCase());
            }
          });
        });
        return { includeSourceFields: noteGroup.fields, keepKeywords: Array.from(keepKeywords) };
      });
      await pruneSampleFlavourObservations({ sampleId, pruneGroups });
      await saveSampleFlavourObservations({
        sessionId,
        sampleId,
        observations: flavourObservations,
      });
      if (flavourObservations.length > 0) {
        setSavedFlavourObservations((prev) => [...prev, ...flavourObservations]);
      }
      await saveSampleDefectsEntry({
        sessionId,
        sampleId,
        defects,
        nonUniformCups,
        defectiveCups,
        nonUniformCupSlots,
        defectiveCupSlots,
        defectCupSlots,
        numberOfCups: defectsCupTotal || cupTotal || 1,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: true,
      });
      setStatusMessage("");
      setSavedFeedback(nextSavedFeedback);
      const shouldNavigateAfterBalloons =
        !stayOnScreen &&
        typeof onBackPress === "function" &&
        !wasCompleteBeforeSave &&
        willBeCompleteAfterSave;
      if (!stayOnScreen && !shouldNavigateAfterBalloons) {
        setFeedback((prev) => clearFeedbackFields(prev, fieldsToPersist));
      }
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
        defectCupSlots,
        numberOfCups: defectsCupTotal || cupTotal || 1,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: true,
      });
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
    <View style={styles.screen} {...panResponder.panHandlers}>
      {usesMockCuppingLayout ? (
        <View style={styles.cuppingHeaderLayer}>
          <Header
            variant="back"
            onBackPress={onBackPress}
            backAccessibilityLabel="Back"
            hideBack={isDefectsDrawerOpen}
            sideWidth={112}
            titleContent={
              <CuppingTitleContent
                sampleNumber={sampleNumber}
                samplesInSession={cupTotal}
                cupIndex={cupIndex}
                scale={scale}
              />
            }
            rightContent={<CuppingHeaderTemperature temp={statusDisplay.temp} scale={scale} />}
            debugTag="CuppingScreen"
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
            rightIconName="edit"
            rightAccessibilityLabel="Edit final score"
            debugTag="CuppingScreen"
          />

          <View style={styles.hero}>
            <Text style={styles.cupIndexText}>
              {cupIndexDisplay}
              {scoreDisplay ? <Text style={styles.cupIndexScoreText}>{scoreDisplay}</Text> : null}
            </Text>
          </View>

          <CupStatusStrip state={statusDisplay.state} temp={statusDisplay.temp} time={statusDisplay.time} />
          <SamplePagerIndicator current={samplePagerIndex} total={samplePagerTotal} scale={scale} />
        </>
      )}

      {usesMockCuppingLayout && isOpenCuppingMode ? (
        <View
          style={[styles.coffeeMetaBlock, { paddingHorizontal: 26 * scale }]}
          onLayout={(event) => setCoffeeMetaHeight(event.nativeEvent.layout.height)}
        >
          <Text style={styles.coffeeName}>{coffeeNameLabel}</Text>
          <Text style={styles.coffeeProcess}>{processLabel}</Text>
        </View>
      ) : null}

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
                  paddingHorizontal: 26 * scale,
                  paddingTop: spacing.sm,
                  paddingBottom: Math.max(190 * scale, keyboardHeight + 170 * scale),
                }
              : null,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={usesMockCuppingLayout && Platform.OS === "ios"}
          canCancelContentTouches
          directionalLockEnabled
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {renderCuppingForm()}

          {!isBrewing && !usesMockCuppingLayout ? (
            <View style={styles.defectsDrawer}>
              <Pressable
                style={styles.defectsDrawerHeader}
                onPress={() => setIsDefectsDrawerOpen((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={`${isDefectsDrawerOpen ? "Close" : "Open"} defects`}
              >
                <DefectsDrawerLabel expanded={isDefectsDrawerOpen} textStyle={styles.defectsDrawerTitle} />
              </Pressable>
              {isDefectsDrawerOpen ? (
                <View style={styles.defectsDrawerContent}>
                  <DefectsSection
                    cupTotal={defectsCupTotal || 1}
                    defects={defects}
                    nonUniformCupSlots={nonUniformCupSlots}
                    defectiveCupSlots={defectiveCupSlots}
                    disabled={isFinalMode && isFinalSaved}
                    onToggleDefect={handleToggleDefect}
                    onChangeNonUniformCupSlots={handleChangeNonUniformCupSlots}
                    onChangeDefectiveCupSlots={handleChangeDefectiveCupSlots}
                  />
                  {renderScoreSummary({ placement: "drawer" })}
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {usesMockCuppingLayout && isDefectsDrawerOpen ? (
        <View
          style={[
            styles.designCDefectDrawerOverlay,
            { top: 56 + (isOpenCuppingMode ? coffeeMetaHeight : 0), bottom: 152 * scale },
          ]}
        >
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
            <DefectsDrawerLabel
              expanded
              scale={scale}
              textStyle={styles.designCDefectSectionText}
            />
          </Pressable>
          <ScrollView
            style={styles.designCDefectDrawerScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            contentContainerStyle={{
              paddingTop: 34 * scale,
              paddingHorizontal: 26 * scale,
              paddingBottom: spacing.lg * 4 * scale,
            }}
          >
            <DefectsSection
              variant="designC"
              scale={scale}
              cupTotal={defectsCupTotal || 1}
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
            {renderScoreSummary({ placement: "drawer" })}
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
                <DefectsDrawerLabel
                  expanded={false}
                  scale={scale}
                  textStyle={styles.designCDefectSectionText}
                />
              </Pressable>
            </View>
          ) : (
            <View style={[styles.mockBottomDrawerSpacer, { minHeight: 58 * scale }]} />
          )}
          {(canCaptureFeedback || isSessionComplete) && !isFinalMode ? (
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
  cuppingHeaderTitleStack: {
    alignItems: "center",
    justifyContent: "center",
  },
  cuppingHeaderTitleText: {
    ...typography.text_screen_title,
    lineHeight: 28,
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
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  cuppingHeaderThermometerBulb: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  cuppingHeaderTempText: {
    ...typography.text_screen_title,
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
  samplePager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  samplePagerDot: {
    backgroundColor: colors.subtle,
  },
  samplePagerDotActive: {
    backgroundColor: colors.ink,
  },
  hero: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: spacing.md,
  },
  cupIndexText: {
    ...typography.text_caption,
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: 4,
    color: colors.ink,
  },
  cupIndexScoreText: {
    color: colors.danger,
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
  cuppingScoreSummary: {},
  cuppingFormTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cuppingFormTitle: {
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
  cuppingFieldBlock: {
    marginBottom: spacing.sm,
  },
  cuppingScoreRow: {
    paddingBottom: spacing.sm,
  },
  cuppingScoreTitle: {
    ...typography.text_section_title,
    lineHeight: 28,
  },
  cuppingScoreControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cuppingScoreCircle: {
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  cuppingScoreCircleSelected: {
    backgroundColor: colors.ink,
  },
  cuppingScoreCircleDisabled: {
    borderColor: colors.muted,
  },
  cuppingScoreText: {
    ...typography.text_body,
    lineHeight: 23,
    fontWeight: "600",
    color: colors.ink,
  },
  cuppingScoreTextSelected: {
    color: colors.surface,
  },
  cuppingScoreTextDisabled: {
    color: colors.muted,
  },
  cuppingNoteInput: {
    backgroundColor: colors.input,
    borderColor: colors.quietBorder,
  },
  cuppingNoteInputDisabled: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
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
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defectBadgeText: {
    ...typography.text_caption,
    fontSize: 11,
    letterSpacing: 0.3,
    color: colors.ink,
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
    ...typography.text_body,
    fontWeight: "700",
  },
  historyCard: {
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 10,
    backgroundColor: colors.panel,
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
    ...typography.text_secondary_body,
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  historyScoreBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  historyScoreText: {
    ...typography.text_secondary_body,
    color: colors.surface,
    fontSize: 14,
    fontWeight: "700",
  },
  historyBody: {
    ...typography.text_secondary_body,
    fontSize: 14,
    color: colors.inkSoft,
  },
  historyWrap: {
    gap: 8,
  },
  historyTitle: {
    ...typography.text_caption,
    fontWeight: "700",
    color: colors.inkSoft,
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
    ...typography.text_secondary_body,
    fontSize: 13,
  },
  defectsDrawer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    marginHorizontal: -spacing.md,
  },
  defectsDrawerHeader: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  defectsDrawerTitle: {
    ...typography.text_section_title,
  },
  defectsDrawerLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  mockBottomDrawer: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
    backgroundColor: colors.surface,
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
  designCDefectDrawerScroll: {
    flex: 1,
  },
  designCDefectSection: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  designCDefectSectionText: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  mockDefectsDrawerTitle: {
    ...typography.text_section_title,
  },
  defectsDrawerContent: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
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
    ...typography.text_caption,
    fontSize: 12,
    fontWeight: "700",
    color: "#4b5563",
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
