import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import {
  getSampleDefects,
  getSessionById,
  getSampleFeedback,
  getSampleFlavourObservations,
  saveCvaAssessmentAtomically,
} from "../../../data/sessionRepository";
import { formIdentity } from "../../forms/sessionFormRoute";
import { PROFILE, resolvePinnedForm } from "../../forms/contract";
import { DefectsSection } from "../components/DefectsSection";
import { AssessmentCupSelector } from "../components/AssessmentCupSelector";
import { AssessmentHeader } from "../components/AssessmentHeader";
import { AssessmentSampleIdentity } from "../components/AssessmentSampleIdentity";
import { AssessmentFormIntro } from "../components/AssessmentFormIntro";
import { AssessmentResultSection } from "../components/AssessmentResultSection";
import { focusNotesAboveKeyboard } from "../components/focusNotesAboveKeyboard";
import { ScoreBalloons, useScoreBalloons } from "../components/ScoreBalloons";
import { KeywordPillRow } from "../components/KeywordPillRow";
import { tokenizeFlavourKeywords } from "../data/flavourKeywords";
import { CanonicalCvaScreen } from './CanonicalCvaScreen';
import { CVA_SCORED_DEFECT_POLICY, getCvaScoredDefectSlots, resolveCvaDefectiveCupCount } from "../data/cvaDefectPolicy";
import { CVA_EXACT_CALCULATION_POLICY, CVA_PREVIOUS_CALCULATION_MESSAGE, CVA_UNKNOWN_CALCULATION_MESSAGE,
  calculateCvaScore, cvaCalculationLabel, getCvaScoreUpdate, isSupportedCvaCalculationPolicy } from "../data/cvaScoreCalculation";
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
const IOS_BLUE = colors.action;
const SAVE_GREY = colors.ink;
// Original-pin prototype editing remains available without certifying it as 2.0.
const ACTIVE_CVA_PIN = { form_key: 'sca_cva_affective_104_2024', form_version: '1.1.0',
  form_hash: '2a9e341fb17664559875a08235a01f88571a3833682ead2a1de09558ba6bf0bb' };
const HISTORICAL_CVA_MESSAGE = "This older CVA form is read-only. Its saved assessment has not been changed.";
const PREVIOUS_DEFECT_RULE_MESSAGE = "This saved result uses the previous defect rule, which counted Other. Under the current CVA rule, Other is an observation only. Saving may recalculate the result; the previous defect entry remains in history.";

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

function toNumericOrZero(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateFinalCuppingScore({
  finalScoresByField,
  nonUniformCups,
  defectiveCups,
  numberOfCups,
  calculationPolicy = CVA_EXACT_CALCULATION_POLICY,
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
  const scoreRounded = calculateCvaScore({ sumHi, nonUniformCups: uRaw, defectiveCups: dRaw,
    numberOfCups: cups, calculationPolicy });
  if (scoreRounded == null) return null;

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
  defectDescription = '',
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
    String(defectDescription),
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

function formatElapsedTime(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "00:00";
  }

  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

export function CuppingScreen(props) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    if (!props.sessionId) { setLoaded({ prototype: true }); return undefined; }
    getSessionById(props.sessionId).then(session => {
      if (active) setLoaded({ session });
    }).catch(() => { if (active) setLoaded({ error: true }); });
    return () => { active = false; };
  }, [props.sessionId]);
  if (!loaded) return <View><Text>Loading assessment…</Text></View>;
  if (loaded.error) return <View><Text>Could not load assessment.</Text></View>;
  const identity = { form_key: loaded.session?.formKey, form_version: loaded.session?.formVersion, form_hash: loaded.session?.formHash };
  if (['2.0.0','3.0.0'].includes(identity.form_version) && resolvePinnedForm(PROFILE,1,identity).ok) {
    return <CanonicalCvaScreen {...props} key={`${props.sessionId}:${props.sampleId}`} />;
  }
  return <PrototypeCuppingScreen {...props} />;
}

function PrototypeCuppingScreen({
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
  const cancelDefectNoteScroll = useRef(null);
  const focusDefectNote = event => {
    cancelDefectNoteScroll.current?.();
    cancelDefectNoteScroll.current = focusNotesAboveKeyboard(scrollRef, event, spacing.md * scale);
  };
  const blurDefectNote = () => { cancelDefectNoteScroll.current?.(); };
  useEffect(() => () => cancelDefectNoteScroll.current?.(), []);
  const noteLayoutYRef = useRef({});
  const noteInputOffsetYRef = useRef({});
  const fieldLayoutYRef = useRef({});
  const autoScrolledSampleRef = useRef(null);
  const explicitSavePendingRef = useRef(false);
  const editRevisionRef = useRef(0);
  const { animations: balloonAnimations, triggerBalloons } = useScoreBalloons();
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
  const [defectDescription, setDefectDescription] = useState('');
  const [supportsDefectDescription, setSupportsDefectDescription] = useState(false);
  const [cvaFormVersion, setCvaFormVersion] = useState(null);
  const [isActiveCvaSession, setIsActiveCvaSession] = useState(!sessionId);
  const [isCvaPinLoaded, setIsCvaPinLoaded] = useState(!sessionId);
  const [showResultBreakdown, setShowResultBreakdown] = useState(false);
  const [isSavedDefectsLoaded, setIsSavedDefectsLoaded] = useState(false);
  const [savedDefectsSignature, setSavedDefectsSignature] = useState(() => buildDefectsSignature());
  const [savedDefectPolicy, setSavedDefectPolicy] = useState(CVA_SCORED_DEFECT_POLICY);
  const [savedDefectiveCups, setSavedDefectiveCups] = useState(0);
  const [savedCalculationPolicy, setSavedCalculationPolicy] = useState(CVA_EXACT_CALCULATION_POLICY);
  const [savedNonUniformCups, setSavedNonUniformCups] = useState(0);
  const [savedNumberOfCups, setSavedNumberOfCups] = useState(null);
  const [hasSavedDefectEntry, setHasSavedDefectEntry] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(elapsedSeconds);
  const normalizedCuppingMode = normalizeCuppingModeKey(cuppingMode);
  const isOpenCuppingMode = normalizedCuppingMode === "open";
  const coffeeNameLabel = String(coffeeNameOrigin || "").trim();
  const processLabel = getProcessLabel(process) || String(process || "").trim();
  const nonUniformCups = nonUniformCupSlots.length;
  const currentDefectsSignature = useMemo(
    () =>
      buildDefectsSignature({
        defects,
        defectCupSlots,
        nonUniformCupSlots,
        defectiveCupSlots,
        defectDescription,
      }),
    [defectiveCupSlots, defectCupSlots, defectDescription, defects, nonUniformCupSlots]
  );
  const hasUnsavedDefectChanges = currentDefectsSignature !== savedDefectsSignature;
  const hasPreviousDefectRule = hasSavedDefectEntry && savedDefectPolicy === null;
  const sourceScoredDefectSlots = getCvaScoredDefectSlots(defectCupSlots, defectsCupTotal || cupTotal || 1);
  const defectiveCups = resolveCvaDefectiveCupCount({
    scoredSlots: sourceScoredDefectSlots, savedPolicy: savedDefectPolicy,
    hasSavedEntry: hasSavedDefectEntry, savedCount: savedDefectiveCups,
    hasUnsavedChanges: hasUnsavedChanges || hasUnsavedDefectChanges,
  });
  const willRecalculatePreviousDefectScore = hasPreviousDefectRule &&
    savedDefectiveCups !== sourceScoredDefectSlots.length;
  const hasPendingChanges = hasUnsavedChanges || hasUnsavedDefectChanges;
  const hasSavedRatings = FEEDBACK_FIELDS.some((field) => (savedFeedback[field] || []).length > 0);
  const applicableSavedCalculationPolicy = hasSavedDefectEntry ? savedCalculationPolicy
    : hasSavedRatings ? null : CVA_EXACT_CALCULATION_POLICY;
  const isCalculationSupported = isSupportedCvaCalculationPolicy(applicableSavedCalculationPolicy);
  const hasPreviousCalculation = applicableSavedCalculationPolicy === null;
  useEffect(() => {
    let active = true;
    setSupportsDefectDescription(false);
    setCvaFormVersion(null);
    setIsActiveCvaSession(!sessionId);
    setIsCvaPinLoaded(!sessionId);
    if (sessionId) getSessionById(sessionId).then(session => {
      if (active) {
        setSupportsDefectDescription(session?.cuppingForm === 1 && session?.formVersion === '1.1.0');
        setCvaFormVersion(session?.cuppingForm === 1 ? session?.formVersion || null : null);
        setIsActiveCvaSession(session?.cuppingForm === 1 &&
          session?.formKey === ACTIVE_CVA_PIN.form_key &&
          session?.formVersion === ACTIVE_CVA_PIN.form_version &&
          session?.formHash === ACTIVE_CVA_PIN.form_hash);
        setIsCvaPinLoaded(true);
      }
    }).catch(() => { if (active) { setSupportsDefectDescription(false); setCvaFormVersion(null); setIsCvaPinLoaded(true); } });
    return () => { active = false; };
  }, [sessionId]);
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
  const isFormWritable = isSavedDefectsLoaded && isCalculationSupported && (!sessionId || (isCvaPinLoaded && isActiveCvaSession));
  const isHistoricalCvaReadOnly = Boolean(sessionId && isCvaPinLoaded && cvaFormVersion && !isActiveCvaSession);
  const isFeedbackLocked = !isFormWritable || isSessionComplete || (cupStateNumber === 2 && !isFinalMode);
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
      calculationPolicy: !isCalculationSupported ? applicableSavedCalculationPolicy
        : hasPendingChanges ? CVA_EXACT_CALCULATION_POLICY : applicableSavedCalculationPolicy,
    });
  }, [
    feedback,
    savedFeedback,
    nonUniformCups,
    defectiveCups,
    defectsCupTotal,
    cupTotal,
    hasPendingChanges,
    applicableSavedCalculationPolicy,
    isCalculationSupported,
  ]);
  const isLiveScoreFinal = useMemo(
    () =>
      finalScoreSummary &&
      !hasPendingChanges &&
      isSavedDefectsLoaded &&
      FEEDBACK_FIELDS.every((field) => (savedFeedback[field] || []).some((entry) => entry?.isFinal && entry?.score != null)),
    [finalScoreSummary, hasPendingChanges, isSavedDefectsLoaded, savedFeedback]
  );
  const physicalCupCount = defectsCupTotal || cupTotal || 1;
  const isStandardFiveCupScore = Number(defectsCupTotal) === 5;
  const cupIndexDisplay = `CUP ${String(cupIndex + 1).padStart(2, "0")} / ${String(cupTotal).padStart(2, "0")}`;
  const scoreDisplay =
    isLiveScoreFinal && finalScoreSummary
      ? `  |  SCORE ${finalScoreSummary.scoreRounded.toFixed(SCORE_PRECISION)}`
      : "";
  const usesMockCuppingLayout = !isBrewing && (canCaptureFeedback || isFinalMode || isSessionComplete);
  const isFieldEnabled = (field) => isFormWritable && (!isSessionComplete || isFinalMode) && enabledFields.includes(field);
  const getEnabledGroupFields = (group) => group.fields.filter((field) => isFieldEnabled(field));
  const isNoteGroupEnabled = (group) => getEnabledGroupFields(group).length > 0;
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
    setIsSavedDefectsLoaded(false);

    const loadSavedDefects = async () => {
      if (!sampleId) {
        if (isMounted) {
          setDefects(buildDefaultDefectsState());
          setDefectCupSlots({});
          setNonUniformCupSlots([]);
          setDefectiveCupSlots([]);
          setDefectDescription('');
          setSavedDefectsSignature(buildDefectsSignature());
          setSavedDefectPolicy(CVA_SCORED_DEFECT_POLICY);
          setSavedDefectiveCups(0);
          setSavedCalculationPolicy(CVA_EXACT_CALCULATION_POLICY);
          setSavedNonUniformCups(0);
          setSavedNumberOfCups(null);
          setHasSavedDefectEntry(false);
          setIsSavedDefectsLoaded(true);
        }
        return;
      }

      try {
        const rows = await getSampleDefects(sampleId);
        if (!isMounted) {
          return;
        }

        const latest = rows?.latest || null;

        if (!latest) {
          setDefects(buildDefaultDefectsState());
          setDefectCupSlots({});
          setNonUniformCupSlots([]);
          setDefectiveCupSlots([]);
          setDefectDescription('');
          setSavedDefectsSignature(buildDefectsSignature());
          setSavedDefectPolicy(CVA_SCORED_DEFECT_POLICY);
          setSavedDefectiveCups(0);
          setSavedCalculationPolicy(CVA_EXACT_CALCULATION_POLICY);
          setSavedNonUniformCups(0);
          setSavedNumberOfCups(null);
          setHasSavedDefectEntry(false);
          setIsSavedDefectsLoaded(true);
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
        const nextDefectDescription = latest.defectDescription || '';

        setDefects(nextDefects);
        setDefectCupSlots(nextDefectCupSlots);
        setNonUniformCupSlots(nextNonUniformCupSlots);
        setDefectiveCupSlots(nextDefectiveCupSlots);
        setDefectDescription(nextDefectDescription);
        setSavedDefectPolicy(latest.scorePolicy);
        setSavedDefectiveCups(latest.defectiveCups);
        setSavedCalculationPolicy(latest.calculationPolicy);
        setSavedNonUniformCups(latest.nonUniformCups);
        setSavedNumberOfCups(latest.numberOfCups);
        setHasSavedDefectEntry(true);
        setSavedDefectsSignature(
          buildDefectsSignature({
            defects: nextDefects,
            defectCupSlots: nextDefectCupSlots,
            nonUniformCupSlots: nextNonUniformCupSlots,
            defectiveCupSlots: nextDefectiveCupSlots,
            defectDescription: nextDefectDescription,
          })
        );
        setIsSavedDefectsLoaded(true);
      } catch (error) {
        if (isMounted) {
          setStatusMessage(error?.message || "Could not load saved defect history.");
          setIsSavedDefectsLoaded(false);
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
    setShowResultBreakdown(false);
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

  const markUnsavedChange = () => {
    editRevisionRef.current += 1;
    setHasUnsavedChanges(true);
  };

  const handleScoreSelect = (field, score) => {
    if (!isFieldEnabled(field)) {
      return;
    }

    markUnsavedChange();
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

    markUnsavedChange();
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

    markUnsavedChange();
    setFeedback((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        comments,
      },
    }));
  };

  const handleToggleDefect = (key) => {
    if (!isFormWritable) return;
    markUnsavedChange();
    setDefects((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  };

  const handleChangeDefectCupSlots = (key, slots) => {
    if (!isFormWritable) return;
    const normalizedSlots = Array.isArray(slots) ? slots : [];
    markUnsavedChange();
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
    if (!isFormWritable) return;
    markUnsavedChange();
    setNonUniformCupSlots(Array.isArray(slots) ? slots : []);
  };

  const handleChangeDefectiveCupSlots = (slots) => {
    if (!isFormWritable) return;
    markUnsavedChange();
    setDefectiveCupSlots(Array.isArray(slots) ? slots : []);
  };

  const handleDefectDescriptionChange = (description) => {
    if (!isFormWritable) return;
    markUnsavedChange();
    setDefectDescription(description);
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

  const renderResultSection = () => {
    if (!isLiveScoreFinal || !finalScoreSummary) return null;
    const baseScore = 0.65625 * finalScoreSummary.sumHi + 52.75;
    const uniformityImpact = 2 * finalScoreSummary.uNormalized;
    const beanDefectImpact = 4 * finalScoreSummary.dNormalized;
    const rows = [
      ...finalScoreSummary.fieldBreakdown.map(({ field, score }) => ({ key: field, label: field, value: score.toFixed(2) })),
      { key: 'base', label: 'Base CVA score', value: baseScore.toFixed(2) },
      { key: 'uniformity', label: 'Uniformity deduction', value: uniformityImpact ? `−${uniformityImpact.toFixed(2)}` : '0.00' },
      { key: 'bean', label: 'Bean-defect deduction', value: beanDefectImpact ? `−${beanDefectImpact.toFixed(2)}` : '0.00' },
      { key: 'total', label: 'Total score', value: finalScoreSummary.scoreRounded.toFixed(SCORE_PRECISION), total: true },
    ];
    return <AssessmentResultSection
      formLabel={`SCA CVA · Affective${cvaFormVersion ? ` · version ${cvaFormVersion}` : ''} · saved prototype result`}
      provenance={[
        isStandardFiveCupScore ? 'SCA-104 Affective score' : 'Adapted — five-cup-equivalent Cup App score',
        hasPreviousDefectRule ? 'Saved under previous Cup App defect rule' : null,
        cvaCalculationLabel(applicableSavedCalculationPolicy),
      ].filter(Boolean).join(' · ')}
      rows={rows} expanded={showResultBreakdown}
      onToggle={() => setShowResultBreakdown(value => !value)} scale={scale} />;
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
        <View style={{ marginBottom: spacing.lg * scale }}>
          <AssessmentFormIntro form={1} cuppingMode={cuppingMode} cupCount={defectsCupTotal} />
        </View>
        {visibleFields.map((field) => {
          const noteGroup = getNoteGroupForField(field);
          const fieldEnabled = isFieldEnabled(field);
          const noteGroupEnabled = noteGroup ? isNoteGroupEnabled(noteGroup) : false;

          return (
            <View
              key={field}
              style={[styles.cuppingFieldBlock, { paddingVertical: spacing.md * scale }]}
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
        <View style={{ paddingVertical: spacing.md * scale, gap: spacing.sm * scale }}>
          <View style={[styles.cvaImpactTitleRow, { gap: spacing.sm * scale }]}><Text style={styles.cuppingScoreTitle}>Uniformity</Text>
            <Text style={styles.cvaImpactValue} accessibilityLiveRegion="polite">{nonUniformCupSlots.length ? '−' : ''}{(10 * nonUniformCupSlots.length / physicalCupCount).toFixed(2)}</Text></View>
          <Text style={styles.cvaUniformityHint}>Select cups that are not uniform.</Text>
          <View style={styles.cvaUniformityCups}>
            <AssessmentCupSelector label="Non-uniform" selectedSlots={nonUniformCupSlots}
              maxCount={physicalCupCount} onChange={handleChangeNonUniformCupSlots}
              disabled={!isFormWritable || (isFinalMode && isFinalSaved)} scale={scale} />
          </View>
        </View>
        <DefectsSection variant="designC" inline scale={scale} cupTotal={physicalCupCount}
          defects={defects} defectCupSlots={defectCupSlots} defectDescription={defectDescription}
          showDefectDescription={supportsDefectDescription} onChangeDefectDescription={handleDefectDescriptionChange}
          onFocusDefectDescription={focusDefectNote} onBlurDefectDescription={blurDefectNote}
          nonUniformCupSlots={nonUniformCupSlots} defectiveCupSlots={defectiveCupSlots}
          scoredDefectCount={defectiveCups}
          disabled={!isFormWritable || (isFinalMode && isFinalSaved)} onToggleDefect={handleToggleDefect}
          onChangeDefectCupSlots={handleChangeDefectCupSlots}
          onChangeNonUniformCupSlots={handleChangeNonUniformCupSlots}
          onChangeDefectiveCupSlots={handleChangeDefectiveCupSlots} />
        {renderResultSection()}
      </View>
    );
  };

  const savedScoresByField = Object.fromEntries(FEEDBACK_FIELDS.map((field) =>
    [field, getLatestFeedbackEntry((savedFeedback[field] || []).filter((entry) => entry?.score != null))?.score ?? null]));
  const savedScoreInput = countScores(savedScoresByField) === FEEDBACK_FIELDS.length ? {
    sumHi: FEEDBACK_FIELDS.reduce((sum, field) => sum + Number(savedScoresByField[field]), 0),
    nonUniformCups: savedNonUniformCups, defectiveCups: savedDefectiveCups,
    numberOfCups: savedNumberOfCups || physicalCupCount,
  } : null;
  const draftScoreInput = finalScoreSummary ? { sumHi: finalScoreSummary.sumHi,
    nonUniformCups, defectiveCups: sourceScoredDefectSlots.length, numberOfCups: physicalCupCount } : null;
  const scoreUpdate = getCvaScoreUpdate({ savedInput: savedScoreInput, draftInput: draftScoreInput,
    savedPolicy: applicableSavedCalculationPolicy, defectPolicyWillChange: willRecalculatePreviousDefectScore });
  const previousRuleConfirmationMessage = () => {
    const cups = Math.max(1, Number(physicalCupCount) || 1);
    const oldDeduction = (20 * savedDefectiveCups / (savedNumberOfCups || cups)).toFixed(2);
    const newDeduction = (20 * sourceScoredDefectSlots.length / cups).toFixed(2);
    let scoreChange = '';
    if (scoreUpdate.oldScore != null && scoreUpdate.newScore != null) {
      const oldScore = scoreUpdate.oldScore.toFixed(SCORE_PRECISION);
      const newScore = scoreUpdate.newScore.toFixed(SCORE_PRECISION);
      scoreChange = `\nSaved total score: ${oldScore} → ${newScore} with your current entries.`;
    }
    const changes = [willRecalculatePreviousDefectScore ? PREVIOUS_DEFECT_RULE_MESSAGE : null,
      hasPreviousCalculation ? CVA_PREVIOUS_CALCULATION_MESSAGE : null].filter(Boolean).join('\n\n');
    const deductionChange = willRecalculatePreviousDefectScore
      ? `\n\nBean-defect deduction: −${oldDeduction} → ${newDeduction === '0.00' ? '0.00' : `−${newDeduction}`}.` : '';
    return `${changes}${deductionChange}${scoreChange}\n\nSave with the current rules? The earlier defect and calculation entries remain in history.`;
  };

  const handleSave = async ({ stayOnScreen = false, confirmedPreviousRule = false } = {}) => {
    if (!canCaptureFeedback || !isFormWritable || explicitSavePendingRef.current) {
      return;
    }
    if (scoreUpdate.requiresConfirmation && !confirmedPreviousRule) {
      Alert.alert('Update score calculation?', previousRuleConfirmationMessage(), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save with current rule', onPress: () => handleSave({ stayOnScreen, confirmedPreviousRule: true }) },
      ]);
      return;
    }
    explicitSavePendingRef.current = true;
    const savedEditRevision = editRevisionRef.current;

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
      await saveCvaAssessmentAtomically({
        sessionId,
        sampleId,
        emptyFieldsToClear,
        finalFieldsToReplace,
        feedback: fieldsToSave,
        finalFeedback: finalFieldsToSave,
        finalFieldsToClear,
        pruneGroups,
        observations: flavourObservations,
        defectsEntry: {
          defects,
          nonUniformCups,
          defectiveCups,
          nonUniformCupSlots,
          defectiveCupSlots,
          defectCupSlots,
          defectDescription: supportsDefectDescription ? defectDescription : '',
          numberOfCups: defectsCupTotal || cupTotal || 1,
        },
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
      });
      if (flavourObservations.length > 0) {
        setSavedFlavourObservations((prev) => [...prev, ...flavourObservations]);
      }
      setStatusMessage("");
      setSavedFeedback(nextSavedFeedback);
      setSavedDefectsSignature(currentDefectsSignature);
      setSavedDefectPolicy(CVA_SCORED_DEFECT_POLICY);
      setSavedDefectiveCups(sourceScoredDefectSlots.length);
      setSavedCalculationPolicy(CVA_EXACT_CALCULATION_POLICY);
      setSavedNonUniformCups(nonUniformCups);
      setSavedNumberOfCups(physicalCupCount);
      setHasSavedDefectEntry(true);
      if (editRevisionRef.current !== savedEditRevision) {
        setStatusMessage('Earlier changes saved. Save again to include your latest edits.');
        return;
      }
      const shouldNavigateAfterBalloons =
        !stayOnScreen &&
        typeof onBackPress === "function" &&
        !wasCompleteBeforeSave &&
        willBeCompleteAfterSave;
      if (!stayOnScreen && !shouldNavigateAfterBalloons) {
        setFeedback((prev) => clearFeedbackFields(prev, fieldsToPersist));
      }
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
    } finally {
      explicitSavePendingRef.current = false;
    }
  };

  const handleFinalScore = () => {
    if (!isFormWritable) return;
    setIsFinalMode(true);
    setIsFinalSaved(false);
    setStatusMessage("Final scoring mode enabled.");
  };

  const handleSaveFinalScore = async (confirmedPreviousRule = false) => {
    if (!isFormWritable || explicitSavePendingRef.current) return;
    if (scoreUpdate.requiresConfirmation && !confirmedPreviousRule) {
      Alert.alert('Update score calculation?', previousRuleConfirmationMessage(), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save with current rule', onPress: () => handleSaveFinalScore(true) },
      ]);
      return;
    }
    if (!sessionId || !sampleId) {
      setStatusMessage("Session linkage missing. Could not save final score.");
      return;
    }
    explicitSavePendingRef.current = true;
    const savedEditRevision = editRevisionRef.current;

    try {
      const fieldsToSave = FEEDBACK_FIELDS.reduce((acc, field) => {
        acc[field] = feedback[field];
        return acc;
      }, {});

      await saveCvaAssessmentAtomically({
        sessionId,
        sampleId,
        finalFeedback: fieldsToSave,
        defectsEntry: {
          defects,
          nonUniformCups,
          defectiveCups,
          nonUniformCupSlots,
          defectiveCupSlots,
          defectCupSlots,
          defectDescription: supportsDefectDescription ? defectDescription : '',
          numberOfCups: defectsCupTotal || cupTotal || 1,
        },
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
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

      setSavedDefectPolicy(CVA_SCORED_DEFECT_POLICY);
      setSavedDefectiveCups(sourceScoredDefectSlots.length);
      setSavedCalculationPolicy(CVA_EXACT_CALCULATION_POLICY);
      setSavedNonUniformCups(nonUniformCups);
      setSavedNumberOfCups(physicalCupCount);
      setHasSavedDefectEntry(true);
      setSavedDefectsSignature(currentDefectsSignature);
      if (editRevisionRef.current !== savedEditRevision) {
        setStatusMessage('Earlier changes saved. Save again to include your latest edits.');
        return;
      }
      setFeedback((prev) => clearFeedbackFields(prev, FEEDBACK_FIELDS));
      setIsFinalSaved(true);
      setStatusMessage("Final score saved.");
      handleReturnHome();
    } catch (error) {
      setStatusMessage(error?.message || "Could not save final score.");
    } finally {
      explicitSavePendingRef.current = false;
    }
  };

  const handleEditFinalScore = () => {
    if (!isFormWritable) return;
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
          <AssessmentHeader
            onBackPress={onBackPress}
            sampleNumber={sampleNumber}
            cupIndex={cupIndex}
            temperature={cupStatus?.temp}
            scale={scale}
          />
        </View>
      ) : (
        <>
          <Header
            title={cupUUID}
            variant="back"
            onBackPress={onBackPress}
            backAccessibilityLabel="Back"
            onRightPress={isFormWritable && isFinalMode && isFinalSaved ? handleEditFinalScore : undefined}
            rightIconName="edit"
            rightAccessibilityLabel="Edit final score"
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
        <AssessmentSampleIdentity
          name={coffeeNameLabel}
          process={processLabel}
          scale={scale}
        />
      ) : null}

      {statusMessage ? (
        <View style={styles.statusMessageWrap}>
          <Text style={styles.statusMessageText}>{statusMessage}</Text>
        </View>
      ) : null}
      {isHistoricalCvaReadOnly ? (
        <View style={styles.statusMessageWrap}>
          <Text style={styles.statusMessageText}>{HISTORICAL_CVA_MESSAGE}</Text>
        </View>
      ) : null}
      {hasPreviousDefectRule ? (
        <View style={styles.statusMessageWrap}>
          <Text style={styles.statusMessageText}>{PREVIOUS_DEFECT_RULE_MESSAGE}</Text>
        </View>
      ) : null}
      {hasPreviousCalculation || !isCalculationSupported ? (
        <View style={styles.statusMessageWrap}>
          <Text style={styles.statusMessageText}>{isCalculationSupported ? CVA_PREVIOUS_CALCULATION_MESSAGE : CVA_UNKNOWN_CALCULATION_MESSAGE}</Text>
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
            <DefectsSection
              cupTotal={physicalCupCount}
              defects={defects}
              nonUniformCupSlots={nonUniformCupSlots}
              defectiveCupSlots={defectiveCupSlots}
              disabled={!isFormWritable || (isFinalMode && isFinalSaved)}
              onToggleDefect={handleToggleDefect}
              onChangeNonUniformCupSlots={handleChangeNonUniformCupSlots}
              onChangeDefectiveCupSlots={handleChangeDefectiveCupSlots}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {!isBrewing && usesMockCuppingLayout ? (
        <View style={styles.mockBottomDock}>
          {(canCaptureFeedback || isSessionComplete) && !isFinalMode ? (
            <View style={[styles.mockFooter, { paddingHorizontal: 26 * scale, paddingTop: 14 * scale, paddingBottom: 24 * scale }]}>
              <View style={[styles.cvaFooterTotal, { gap: spacing.sm * scale, marginBottom: spacing.md * scale }]} accessibilityLiveRegion="polite">
                <Text style={styles.cvaFooterLabel}>{isLiveScoreFinal && !isStandardFiveCupScore ? 'Total score · adapted' : 'Total score'}</Text>
                <Text style={styles.cvaFooterValue}>{isLiveScoreFinal && finalScoreSummary ? finalScoreSummary.scoreRounded.toFixed(SCORE_PRECISION) : '—'}</Text>
              </View>
              <FullPageButton
                label={hasPendingChanges ? "Save" : "SCAN CUP"}
                onPress={hasPendingChanges ? () => handleSave({ stayOnScreen: true }) : onScanPress}
                loading={isScanInProgress}
                disabled={
                  !isFormWritable ||
                  isScanInProgress ||
                  (!hasPendingChanges && typeof onScanPress !== "function")
                }
                accessibilityLabel={hasPendingChanges ? "Save cupping feedback" : "Scan cup"}
                style={[
                  styles.scanButton,
                  { backgroundColor: hasPendingChanges ? SAVE_GREY : IOS_BLUE },
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
            disabled={!isFormWritable || isScanInProgress}
            accessibilityLabel="Save"
          />
          {isCupping && !usesMockCuppingLayout ? (
            <FullPageButton
              label="Final Score"
              onPress={handleFinalScore}
              loading={false}
              disabled={!isFormWritable || isScanInProgress}
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
            onPress={() => handleSaveFinalScore()}
            loading={false}
            disabled={!isFormWritable}
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
      <ScoreBalloons animations={balloonAnimations} width={width} scale={scale} />
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
  cuppingFieldBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  cvaImpactTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cvaImpactValue: {
    ...typography.text_body,
    color: colors.action,
  },
  cvaUniformityHint: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
  },
  cvaUniformityCups: {
    alignItems: 'center',
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
  mockBottomDock: {
    backgroundColor: colors.surface,
    zIndex: 30,
    elevation: 30,
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
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    paddingTop: 14,
    paddingBottom: 24,
  },
  cvaFooterTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cvaFooterLabel: {
    ...typography.text_body,
  },
  cvaFooterValue: {
    ...typography.text_secondary_metric,
  },
  scanButton: {
    minHeight: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: IOS_BLUE,
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
