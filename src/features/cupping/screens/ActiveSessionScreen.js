import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { AppIcon } from "../../../components/ui/AppIcon";
import {
  deleteSampleFromSession,
  getSessionCompletionSummary,
  getSampleDefects,
  getSampleFeedback,
  getSampleFlavourObservations,
  getSessionById,
  getSessionSampleFinalStatus,
  listSessions,
  manuallyMarkSessionComplete,
} from "../../../data/sessionRepository";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import {
  getProcessLabel,
  getSessionTypeLabel,
} from "../constants/sessionDetails";
import { KeywordPillRow } from "../components/KeywordPillRow";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";

const SCORE_FIELDS = ["Fragrance", "Aroma", "Flavour", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"];
const SCORE_LABELS = ["Fr", "Ar", "Fl", "Af", "Ac", "Sw", "Mf", "Ov"];
const SCORE_STEP = 0.25;

const BEAN_DEFECT_OPTIONS = [
  { key: "moldy",     iconName: "defect-mouldy",        title: "Mouldy" },
  { key: "phenolic",  iconName: "defect-phenolic",       title: "Phenolic" },
  { key: "potato",    iconName: "defect-potato",         title: "Potato" },
  { key: "otherBean", iconName: "defect-other-bean",     title: "Other" },
];
const ROAST_DEFECT_OPTIONS = [
  { key: "underdeveloped", iconName: "defect-underdeveloped", title: "Underdeveloped" },
  { key: "baked",          iconName: "defect-baked",          title: "Baked" },
  { key: "unevenRoast",    iconName: "defect-uneven-roast",   title: "Uneven roast" },
  { key: "overdeveloped",  iconName: "defect-overdeveloped",  title: "Overdeveloped" },
];

function unionDefectSlots(keys, defectCupSlots, total) {
  const all = keys.flatMap((k) => (defectCupSlots?.[k] || []));
  return [...new Set(all)].filter((s) => s >= 1 && s <= total).sort((a, b) => a - b);
}

function formatStatus(value) {
  const text = String(value || "new").trim().toLowerCase();
  if (text === "complete") return "Complete";
  if (text === "pending") return "Pending";
  return "New";
}

function getLatestEntry(entries = []) {
  return Array.isArray(entries) && entries.length > 0 ? entries[entries.length - 1] : null;
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

function calculateCurrentScore({ scores, defects, numberOfCups }) {
  const scoreCount = (scores || []).filter((item) => item?.score != null).length;
  if (scoreCount < SCORE_FIELDS.length) {
    return null;
  }

  const cups = Math.max(1, toNumericOrZero(numberOfCups));
  const sumHi = SCORE_FIELDS.reduce((sum, field) => {
    const scoreItem = (scores || []).find((item) => item.key === field);
    return sum + toNumericOrZero(scoreItem?.score);
  }, 0);
  const nonUniformCups = toNumericOrZero(defects?.nonUniformCups);
  const defectiveCups = toNumericOrZero(defects?.defectiveCups);
  const uNormalized = (nonUniformCups / cups) * 5;
  const dNormalized = (defectiveCups / cups) * 5;
  return roundToStep(0.65625 * sumHi + 52.75 - 2 * uNormalized - 4 * dNormalized);
}

function buildScoreItems(feedbackByField = {}) {
  return SCORE_FIELDS.map((field, index) => {
    const rows = Array.isArray(feedbackByField[field]) ? feedbackByField[field] : [];
    const finalRows = rows.filter((entry) => entry?.isFinal);
    const latestFinal = getLatestEntry(finalRows);
    const latest = latestFinal || getLatestEntry(rows);

    return {
      key: field,
      label: SCORE_LABELS[index],
      score: latest?.score ?? null,
      isFinal: Boolean(latestFinal),
    };
  });
}

function buildDefectIcons(defectRows) {
  const latest = getLatestDefects(defectRows);
  if (!latest) {
    return [];
  }

  return [
    latest.nonUniformCupSlots?.length > 0 || latest.nonUniformCups > 0 ? "defect-non-uniform" : null,
    latest.moldy ? "defect-mouldy" : null,
    latest.phenolic ? "defect-phenolic" : null,
    latest.potato ? "defect-potato" : null,
    latest.otherBean ? "defect-other-bean" : null,
    latest.underdeveloped ? "defect-underdeveloped" : null,
    latest.baked ? "defect-baked" : null,
    latest.unevenRoast ? "defect-uneven-roast" : null,
    latest.overdeveloped ? "defect-overdeveloped" : null,
  ].filter(Boolean);
}

function getLatestDefects(defectRows) {
  const rows = [
    ...(Array.isArray(defectRows?.nonFinal) ? defectRows.nonFinal : []),
    ...(Array.isArray(defectRows?.final) ? defectRows.final : []),
  ];
  return getLatestEntry(rows);
}

const FRAGRANCE_AROMA_FIELDS = new Set(["Fragrance", "Aroma"]);

function isFragranceAromaSource(sourceField) {
  return String(sourceField || "").split(",").some((f) => FRAGRANCE_AROMA_FIELDS.has(f.trim()));
}

function extractNotesForFields(feedbackByField = {}, includeFields, excludeFields) {
  const seen = new Set();
  const notes = [];
  Object.entries(feedbackByField || {}).forEach(([field, entries]) => {
    if (includeFields && !includeFields.has(field)) return;
    if (excludeFields && excludeFields.has(field)) return;
    const latest = getLatestEntry(entries || []);
    const comment = String(latest?.comments || "").trim();
    if (comment && !seen.has(comment)) {
      seen.add(comment);
      notes.push(comment);
    }
  });
  return notes.join("\n\n");
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

function buildObservationPills(observations = []) {
  return (Array.isArray(observations) ? observations : [])
    .filter((observation) => observation?.keyword || observation?.label)
    .map((observation, index) => ({
      keyword: `${observation.keyword || observation.label}-${observation.createdAt || index}`,
      label: formatObservationPillLabel(observation),
      colour: observation.colour,
    }));
}

function MetaRow({ label, value, scale }) {
  return (
    <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, { marginTop: 4 * scale }]}>
        {value || "-"}
      </Text>
    </View>
  );
}

function ScoreBox({ item, scale }) {
  return (
    <View style={[styles.scoreItem, { gap: 4 * scale }]}>
      <Text style={styles.scoreLabel}>{item.label}</Text>
      <View
        style={[
          styles.scoreBox,
          {
            width: 46 * scale,
            height: 46 * scale,
            borderRadius: 7 * scale,
            borderWidth: 2 * scale,
          },
          item.isFinal ? styles.scoreBoxFinal : null,
        ]}
      >
        <Text style={[styles.scoreBoxText, item.isFinal ? styles.scoreBoxTextFinal : null]}>
          {item.score ?? "-"}
        </Text>
      </View>
    </View>
  );
}

function ReadOnlyCupCircles({ total, highlightedSlots = [], scale }) {
  const slots = Array.from({ length: total }, (_, i) => i + 1);
  const highlighted = new Set(highlightedSlots);
  return (
    <View style={[styles.cupCircleRow, { gap: 6 * scale }]}>
      {slots.map((slot) => {
        const active = highlighted.has(slot);
        return (
          <View
            key={slot}
            style={[
              styles.cupCircleOuter,
              {
                width: 46 * scale,
                height: 46 * scale,
                borderRadius: 23 * scale,
                borderWidth: 2.3 * scale,
                borderColor: active ? colors.ink : colors.inkSoft,
                backgroundColor: active ? colors.ink : colors.surface,
              },
            ]}
          >
            <View
              style={[
                styles.cupCircleInner,
                {
                  width: 39 * scale,
                  height: 39 * scale,
                  borderRadius: 19.5 * scale,
                  borderWidth: 1 * scale,
                  borderColor: active ? colors.surface : colors.quietBorder,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function DefectPillsRow({ options, latestDefects, scale }) {
  const active = options.filter((opt) => latestDefects?.[opt.key]);
  if (active.length === 0) return null;
  return (
    <View style={[styles.defectPillsRow, { gap: 6 * scale, marginTop: 8 * scale }]}>
      {active.map((opt) => (
        <View
          key={opt.key}
          style={[
            styles.defectPill,
            {
              borderRadius: 15 * scale,
              paddingHorizontal: 10 * scale,
              paddingVertical: 4 * scale,
              gap: 5 * scale,
            },
          ]}
        >
          <AppIcon name={opt.iconName} role="icon_compact" size={14 * scale} style={styles.defectPillIcon} />
          <Text style={styles.defectPillText}>{opt.title}</Text>
        </View>
      ))}
    </View>
  );
}

function DefectsSummary({ latestDefects, numberOfCups, scale }) {
  if (!latestDefects) return null;

  const total = Math.max(1, Number(numberOfCups) || 1);
  const nonUniformSlots = latestDefects.nonUniformCupSlots || [];
  const allDefectiveSlots = [
    ...new Set([
      ...(latestDefects.nonUniformCupSlots || []),
      ...Object.values(latestDefects.defectCupSlots || {}).flat(),
    ]),
  ];

  const hasBeanDefects = BEAN_DEFECT_OPTIONS.some((opt) => latestDefects[opt.key]);
  const hasRoastDefects = ROAST_DEFECT_OPTIONS.some((opt) => latestDefects[opt.key]);

  const hasAnything = nonUniformSlots.length > 0 || allDefectiveSlots.length > 0 || hasBeanDefects || hasRoastDefects;
  if (!hasAnything) return null;

  return (
    <View style={[styles.cupDrawerSection, { paddingHorizontal: 24 * scale, paddingTop: 16 * scale, paddingBottom: 24 * scale, gap: 16 * scale }]}>
      {/* Non-uniform cups */}
      {(nonUniformSlots.length > 0 || allDefectiveSlots.length > 0) ? (
        <View>
          <Text style={styles.cupDrawerLabel}>Cups</Text>
          <ReadOnlyCupCircles
            total={total}
            highlightedSlots={allDefectiveSlots}
            scale={scale}
          />
        </View>
      ) : null}

      {/* Bean defects */}
      {hasBeanDefects ? (
        <View>
          <Text style={styles.cupDrawerLabel}>Bean Defects</Text>
          <DefectPillsRow options={BEAN_DEFECT_OPTIONS} latestDefects={latestDefects} scale={scale} />
        </View>
      ) : null}

      {/* Roast defects */}
      {hasRoastDefects ? (
        <View>
          <Text style={styles.cupDrawerLabel}>Roast Defects</Text>
          <DefectPillsRow options={ROAST_DEFECT_OPTIONS} latestDefects={latestDefects} scale={scale} />
        </View>
      ) : null}
    </View>
  );
}

function ActiveSessionCupRow({ cup, index, total, scale, expanded, canDelete, onDeleteSample, onToggle, onOpenSample, onLayout }) {
  const isFinalScoreAvailable = cup.finalScore !== null && cup.finalScore !== undefined;
  const currentScore = isFinalScoreAvailable ? cup.finalScore : cup.currentScore;
  const isCurrentScoreAvailable = currentScore !== null && currentScore !== undefined;

  return (
    <View style={styles.cupDrawer} onLayout={onLayout}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open sample ${index + 1} cupping screen`}
        onPress={onOpenSample}
        style={[styles.cupRow, { paddingVertical: 14 * scale, gap: 10 * scale }]}
      >
        {/* Identity line: colour dot + cup number left, complete badge + chevron right */}
        <View style={styles.cupTopLine}>
          <View style={[styles.cupIdentity, { gap: 8 * scale }]}>
            <View
              style={[
                styles.cupDot,
                {
                  width: 14 * scale,
                  height: 14 * scale,
                  borderRadius: 7 * scale,
                  backgroundColor: cup.sampleColour || colors.muted,
                },
              ]}
            />
            <Text style={styles.cupNumber}>
              Sample {cup.sampleNumber || index + 1}/{total}
            </Text>
          </View>

          <View style={[styles.cupTopRight, { gap: 8 * scale }]}>
            {isFinalScoreAvailable ? (
              <View
                style={[
                  styles.completeBadge,
                  {
                    borderRadius: 12 * scale,
                    paddingHorizontal: 10 * scale,
                    paddingVertical: 3 * scale,
                  },
                ]}
              >
                <Text style={styles.completeBadgeText}>Complete</Text>
              </View>
            ) : null}
            {canDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove sample ${index + 1}`}
                onPress={(e) => { e?.stopPropagation?.(); onDeleteSample?.(); }}
                style={styles.chevronButton}
              >
                <AppIcon name="close" role="icon_navigation" size={20} style={styles.deleteIcon} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? "Collapse" : "Expand"} sample ${index + 1} details`}
              onPress={(event) => {
                event?.stopPropagation?.();
                onToggle?.();
              }}
              style={styles.chevronButton}
            >
              <AppIcon
                name={expanded ? "chevron-up" : "chevron-down"}
                role="icon_navigation"
                size={24}
                style={styles.cupDrawerGlyph}
              />
            </Pressable>
          </View>
        </View>

        {/* Score boxes */}
        <View style={[styles.cupScoresLine, { gap: 5 * scale }]}>
          {cup.scores.map((item) => (
            <ScoreBox key={`${cup.id}-${item.key}`} item={item} scale={scale} />
          ))}
        </View>

        {/* Score summary */}
        <Text
          style={[
            styles.finalScore,
            !isCurrentScoreAvailable ? styles.finalScoreUnavailable : null,
          ]}
        >
          {isCurrentScoreAvailable
            ? `${isFinalScoreAvailable ? "Final score" : "Current score"} ${Number(currentScore).toFixed(2)}`
            : "Score pending"}
        </Text>

        {/* Defect icons — only shown when defects are present */}
        {cup.defects.length > 0 ? (
          <View style={[styles.defectIconRow, { gap: 6 * scale }]}>
            {cup.defects.map((defect) => (
              <View
                key={`${cup.id}-${defect}`}
                style={[
                  styles.defectIcon,
                  {
                    width: 30 * scale,
                    height: 30 * scale,
                    borderRadius: 15 * scale,
                  },
                ]}
              >
                <AppIcon
                  name={defect}
                  role="icon_compact"
                  size={16 * scale}
                  style={styles.defectIconGlyph}
                />
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>

      {/* Expanded detail drawer */}
      {expanded ? (
        <View style={styles.cupDrawerBody}>
          {/* Coffee details — white surface */}
          <View style={[styles.cupDrawerSection, { paddingHorizontal: 24 * scale, paddingTop: 16 * scale, paddingBottom: 16 * scale, gap: 12 * scale }]}>
            {[
              { label: "Coffee", value: cup.coffeeNameOrigin },
              { label: "Process", value: getProcessLabel(cup.process) || cup.process },
            ].map((item) => (
              <View key={`${cup.id}-${item.label}`}>
                <Text style={styles.cupDrawerLabel}>{item.label}</Text>
                <Text style={[styles.cupDrawerValue, { marginTop: 2 * scale }]}>{item.value || "-"}</Text>
              </View>
            ))}
          </View>

          {/* Divider */}
          <View style={styles.cupDrawerDivider} />

          {/* Notes sections — grey input boxes */}
          <View style={[styles.cupDrawerSection, { paddingHorizontal: 24 * scale, paddingTop: 16 * scale, paddingBottom: 24 * scale, gap: 16 * scale }]}>
            {[
              { label: "Fragrance / Aroma Notes", notes: cup.fragranceAromaNotes, obs: cup.fragranceAromaObs },
              { label: "Flavour Notes", notes: cup.flavourNotes, obs: cup.flavourObs },
            ].map((section) => {
              const pills = buildObservationPills(section.obs);
              return (
                <View key={section.label}>
                  <Text style={styles.cupDrawerLabel}>{section.label}</Text>
                  <View style={[styles.notesBox, { borderRadius: 12 * scale, marginTop: 6 * scale }]}>
                    <Text style={section.notes ? styles.notesBoxText : styles.notesBoxPlaceholder}>
                      {section.notes || "No notes recorded"}
                    </Text>
                  </View>
                  {pills.length > 0 ? (
                    <KeywordPillRow
                      pills={pills}
                      scale={scale}
                      style={{ marginTop: 10 * scale }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Defects summary */}
          {cup.latestDefects ? (
            <>
              <View style={styles.cupDrawerDivider} />
              <DefectsSummary
                latestDefects={cup.latestDefects}
                numberOfCups={cup.cupNumber}
                scale={scale}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ActiveSessionScreen({
  mode = "pending",
  sessionId = null,
  onBackPress,
  onSessionComplete,
  onResetToPending,
  onScanPress,
  onSamplePress,
  onEditSession,
  isScanInProgress = false,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [session, setSession] = useState(null);
  const [cups, setCups] = useState([]);
  const [expandedCupId, setExpandedCupId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [markCompleteDialogVisible, setMarkCompleteDialogVisible] = useState(false);
  const [markCompleteDialogMessage, setMarkCompleteDialogMessage] = useState("");
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const scrollViewRef = useRef(null);
  const cupListY = useRef(0);
  const cupYPositions = useRef({});
  const sessionIdRef = useRef(sessionId);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((n) => n + 1);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let isCancelled = false;

    const loadActiveSession = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        // If a sessionId is provided, load that session directly.
        // Otherwise fall back to finding the first non-complete session.
        let targetId = sessionId;
        if (!targetId) {
          const sessions = await listSessions();
          const active = (sessions || []).find(
            (item) => String(item.status || "").toLowerCase() !== "complete"
          );
          targetId = active?.id || null;
        }

        if (!targetId) {
          if (!isCancelled) {
            setSession(null);
            setCups([]);
          }
          return;
        }

        const fullSession = await getSessionById(targetId);
        const finalStatus = await getSessionSampleFinalStatus(targetId);
        const rows = await Promise.all(
          (fullSession?.samples || []).map(async (sample, index) => {
            const feedback = await getSampleFeedback(sample.id);
            const defects = await getSampleDefects(sample.id);
            const flavourObservations = await getSampleFlavourObservations(sample.id);
            const scores = buildScoreItems(feedback);
            const latestDefects = getLatestDefects(defects);
            return {
              ...sample,
              sessionId: fullSession?.id || sample.sessionId,
              scores,
              defects: buildDefectIcons(defects),
              latestDefects,
              fragranceAromaNotes: extractNotesForFields(feedback, FRAGRANCE_AROMA_FIELDS),
              flavourNotes: extractNotesForFields(feedback, null, FRAGRANCE_AROMA_FIELDS),
              fragranceAromaObs: flavourObservations.filter((o) => isFragranceAromaSource(o.sourceField)),
              flavourObs: flavourObservations.filter((o) => !isFragranceAromaSource(o.sourceField)),
              finalScore: finalStatus?.[sample.id]?.finalScore ?? null,
              currentScore: calculateCurrentScore({
                scores,
                defects: latestDefects,
                numberOfCups: sample.cupNumber,
              }),
              sampleNumber: Number(sample.sampleNumber) || index + 1,
            };
          })
        );

        if (!isCancelled) {
          setSession(fullSession);
          setCups(rows);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error?.message || "Could not load active session.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadActiveSession();

    return () => {
      isCancelled = true;
    };
  }, [sessionId, reloadCount]);

  const status = useMemo(() => {
    if (!session) {
      return "Pending";
    }
    return formatStatus(session.status);
  }, [session]);

  const handleMarkComplete = async () => {
    const sid = sessionIdRef.current || session?.id;
    if (!sid) return;
    setIsMarkingComplete(true);
    try {
      const summary = await getSessionCompletionSummary(sid);
      if (!summary.allComplete) {
        const names = summary.incompleteSamples.map((s) => `• ${s.name}`).join("\n");
        setMarkCompleteDialogMessage(
          `The following samples have incomplete cupping scores:\n\n${names}\n\nComplete the scores for each sample, or remove it from the session before marking complete.`
        );
        setMarkCompleteDialogVisible(true);
      } else {
        await manuallyMarkSessionComplete(sid);
        onSessionComplete?.(sid);
      }
    } finally {
      setIsMarkingComplete(false);
    }
  };

  const handleShare = async () => {
    if (!session) return;
    const lines = [];
    lines.push(`CUP Session: ${session.sessionName || "Untitled"}`);
    if (session.sessionDate) lines.push(`Date: ${session.sessionDate}`);
    if (session.sessionType) lines.push(`Type: ${session.sessionType}`);
    lines.push("");
    cups.forEach((cup, i) => {
      const name = cup.coffeeNameOrigin || `Sample ${cup.sampleNumber || i + 1}`;
      const score = cup.finalScore != null
        ? Number(cup.finalScore).toFixed(2)
        : cup.currentScore != null
          ? Number(cup.currentScore).toFixed(2)
          : "—";
      lines.push(`${cup.sampleNumber || i + 1}. ${name}  ${score}`);
    });
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // user cancelled or share sheet unavailable
    }
  };

  const handleDeleteSample = async (sampleId) => {
    try {
      await deleteSampleFromSession(sampleId);
      reload();
    } catch {
      // silent — sample may already be gone
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title={mode === "new" ? "New Session" : mode === "complete" ? "Session Review" : "Pending Session"}
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
        hideBack={!!expandedCupId}
        debugTag={`ActiveSessionScreen:${mode}`}
      />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: 26 * scale,
            paddingTop: 24 * scale,
            paddingBottom: 128 * scale,
          },
        ]}
      >
        {session ? (
          <>
            {/* Session meta */}
            <View style={[styles.metaList, { gap: 14 * scale }]}>
              <MetaRow label="Date" value={session.sessionDate} scale={scale} />
              <MetaRow label="Session Name" value={session.sessionName} scale={scale} />
              <MetaRow label="Session Type" value={getSessionTypeLabel(session.sessionType)} scale={scale} />
              <MetaRow label="Status" value={status} scale={scale} />
            </View>

            {/* Cups section header */}
            <View style={[styles.cupsHeader, { marginTop: 28 * scale, marginBottom: 4 * scale }]}>
              <Text style={styles.cupsHeaderLabel}>CUPS</Text>
            </View>

            {/* Cup rows */}
            <View
              style={styles.cupList}
              onLayout={(e) => { cupListY.current = e.nativeEvent.layout.y; }}
            >
              {cups.map((cup, index) => (
                <ActiveSessionCupRow
                  key={cup.id}
                  cup={cup}
                  index={index}
                  total={Number(session.samplesInSession) || cups.length || 1}
                  scale={scale}
                  expanded={expandedCupId === cup.id}
                  canDelete={mode === "new" || mode === "pending"}
                  onDeleteSample={() => handleDeleteSample(cup.id)}
                  onLayout={(e) => { cupYPositions.current[cup.id] = e.nativeEvent.layout.y; }}
                  onToggle={() => {
                    const isOpening = expandedCupId !== cup.id;
                    setExpandedCupId((current) => (current === cup.id ? null : cup.id));
                    if (isOpening) {
                      const rowY = cupYPositions.current[cup.id];
                      if (rowY != null) {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({
                            y: cupListY.current + rowY,
                            animated: true,
                          });
                        }, 50);
                      }
                    }
                  }}
                  onOpenSample={
                    mode !== "new" && typeof onSamplePress === "function"
                      ? () => onSamplePress(cup, index, Number(session.samplesInSession) || cups.length || 1)
                      : undefined
                  }
                />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{isLoading ? "Loading" : "No Active Session"}</Text>
            <Text style={styles.emptyBody}>
              {loadError || (isLoading ? "Loading active session..." : "Create or scan a session cup to start.")}
            </Text>
          </View>
        )}
      </ScrollView>

      {mode === "new" ? (
        <View style={[styles.footer, { paddingHorizontal: 26 * scale }]}>
          <FullPageButton
            label="EDIT SESSION"
            onPress={onEditSession}
            disabled={typeof onEditSession !== "function"}
            accessibilityLabel="Edit session"
          />
        </View>
      ) : mode === "pending" ? (
        <View style={[styles.footer, { paddingHorizontal: 26 * scale, gap: 10 * scale }]}>
          <FullPageButton
            label="MARK COMPLETE"
            onPress={handleMarkComplete}
            loading={isMarkingComplete}
            disabled={isMarkingComplete || !session}
            accessibilityLabel="Mark session complete"
          />
          <FullPageButton
            label="SCAN CUP"
            onPress={onScanPress}
            loading={isScanInProgress}
            disabled={isScanInProgress || typeof onScanPress !== "function"}
            accessibilityLabel="Scan cup"
            style={styles.scanButton}
          />
        </View>
      ) : mode === "complete" ? (
        <View style={[styles.footer, { paddingHorizontal: 26 * scale, gap: 10 * scale }]}>
          <FullPageButton
            label="UPLOAD RESULTS"
            onPress={handleShare}
            disabled={!session}
            accessibilityLabel="Upload session results"
          />
          <FullPageButton
            label="RESET TO PENDING"
            onPress={() => onResetToPending?.(session?.id)}
            disabled={!session || typeof onResetToPending !== "function"}
            accessibilityLabel="Reset session to pending"
            style={styles.scanButton}
          />
        </View>
      ) : null}

      <WarningDialog
        visible={markCompleteDialogVisible}
        title="Incomplete Scores"
        message={markCompleteDialogMessage}
        okLabel="Got it"
        onDismiss={() => setMarkCompleteDialogVisible(false)}
        onOk={() => setMarkCompleteDialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flexGrow: 1,
  },
  metaList: {
    width: "100%",
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
  cupsHeader: {
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    paddingTop: 16,
  },
  cupsHeaderLabel: {
    ...typography.text_caption,
    color: colors.inkSoft,
  },
  cupList: {
    width: "100%",
  },
  cupDrawer: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  cupRow: {
    width: "100%",
    alignItems: "stretch",
  },
  cupTopLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cupIdentity: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  cupTopRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  cupDot: {},
  completeBadge: {
    backgroundColor: colors.ink,
  },
  completeBadgeText: {
    ...typography.text_caption,
    color: colors.surface,
    letterSpacing: 0,
    textTransform: "none",
  },
  cupNumber: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  chevronButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cupDrawerGlyph: {
    color: colors.inkSoft,
  },
  deleteIcon: {
    color: colors.muted,
  },
  cupScoresLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  scoreItem: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  scoreLabel: {
    ...typography.text_caption,
    color: colors.inkSoft,
    letterSpacing: 0,
    textTransform: "none",
    textAlign: "center",
  },
  scoreBox: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  scoreBoxFinal: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  scoreBoxText: {
    ...typography.text_body,
    fontWeight: "600",
    letterSpacing: 0,
  },
  scoreBoxTextFinal: {
    color: colors.surface,
  },
  defectIconRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  defectIcon: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  defectIconGlyph: {
    color: colors.surface,
  },
  finalScore: {
    ...typography.text_body,
    color: colors.ink,
    letterSpacing: 0,
  },
  finalScoreUnavailable: {
    color: colors.muted,
  },
  cupDrawerBody: {
    width: "100%",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cupDrawerSection: {
    width: "100%",
  },
  cupDrawerDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  cupDrawerLabel: {
    ...typography.text_secondary_body,
    fontWeight: "700",
    color: colors.inkSoft,
    letterSpacing: 0,
  },
  cupDrawerValue: {
    ...typography.text_body,
    letterSpacing: 0,
  },
  notesBox: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
  },
  notesBoxText: {
    ...typography.text_secondary_body,
    color: colors.ink,
    letterSpacing: 0,
  },
  notesBoxPlaceholder: {
    ...typography.text_secondary_body,
    color: colors.muted,
    letterSpacing: 0,
  },
  cupCircleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  cupCircleOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  cupCircleInner: {
    backgroundColor: "transparent",
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
  defectPillIcon: {
    color: colors.ink,
  },
  defectPillText: {
    ...typography.text_secondary_body,
    color: colors.ink,
    letterSpacing: 0,
  },
  emptyState: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    ...typography.text_section_title,
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
  },
  emptyBody: {
    ...typography.text_secondary_body,
    marginTop: 8,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingTop: 14,
    paddingBottom: 24,
  },
  scanButton: {
    minHeight: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.action,
  },
});
