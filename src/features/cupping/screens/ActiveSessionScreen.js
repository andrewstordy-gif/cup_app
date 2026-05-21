import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import {
  getSampleDefects,
  getSampleFeedback,
  getSessionById,
  getSessionSampleFinalStatus,
  listSessions,
} from "../../../data/sessionRepository";
import {
  getProcessLabel,
  getSessionTypeLabel,
} from "../constants/sessionDetails";
import { KeywordPillRow } from "../components/KeywordPillRow";
import { findFlavourKeywordPills } from "../data/flavourKeywords";
import { colors } from "../../../theme/colors";

const INK = "#3f4852";
const IOS_BLUE = "#3478f6";
const SCORE_FIELDS = ["Fragrance", "Aroma", "Flavour", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"];
const SCORE_LABELS = ["Fr", "Ar", "Fl", "Af", "Ac", "Sw", "Mf", "Ov"];
const SCORE_STEP = 0.25;

function formatStatus(value) {
  const text = String(value || "pending").trim().toLowerCase();
  return text === "complete" ? "Complete" : "Pending";
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
    latest.nonUniformCupSlots?.length > 0 || latest.nonUniformCups > 0 ? "≠" : null,
    latest.moldy ? "M" : null,
    latest.phenolic ? "Ph" : null,
    latest.potato ? "Po" : null,
  ].filter(Boolean);
}

function getLatestDefects(defectRows) {
  const rows = [
    ...(Array.isArray(defectRows?.nonFinal) ? defectRows.nonFinal : []),
    ...(Array.isArray(defectRows?.final) ? defectRows.final : []),
  ];
  return getLatestEntry(rows);
}

function extractFlavourPills(feedbackByField = {}) {
  const pillsByKeyword = new Map();
  Object.values(feedbackByField || {}).forEach((entries) => {
    (entries || []).forEach((entry) => {
      findFlavourKeywordPills(entry?.comments).forEach((pill) => {
        pillsByKeyword.set(pill.keyword, pill);
      });
    });
  });
  return Array.from(pillsByKeyword.values());
}

function MetaRow({ label, value, scale }) {
  return (
    <View style={[styles.metaRow, { paddingBottom: 16 * scale }]}>
      <Text style={[styles.metaLabel, { fontSize: 16 * scale, lineHeight: 20 * scale }]}>{label}</Text>
      <Text style={[styles.metaValue, { marginTop: 5 * scale, fontSize: 25 * scale, lineHeight: 31 * scale }]}>
        {value || "-"}
      </Text>
    </View>
  );
}

function ScoreBox({ item, scale }) {
  return (
    <View style={[styles.scoreItem, { gap: 3 * scale }]}>
      <Text style={[styles.scoreLabel, { fontSize: 12 * scale, lineHeight: 15 * scale }]}>{item.label}</Text>
      <View
        style={[
          styles.scoreBox,
          {
            width: 38 * scale,
            height: 38 * scale,
            borderRadius: 7 * scale,
            borderWidth: 2.2 * scale,
          },
          item.isFinal ? styles.scoreBoxFinal : null,
        ]}
      >
        <Text
          style={[
            styles.scoreBoxText,
            { fontSize: 25 * scale, lineHeight: 29 * scale },
            item.isFinal ? styles.scoreBoxTextFinal : null,
          ]}
        >
          {item.score ?? "-"}
        </Text>
      </View>
    </View>
  );
}

function ActiveSessionCupRow({ cup, index, total, scale, expanded, onToggle, onOpenSample }) {
  const isFinalScoreAvailable = cup.finalScore !== null && cup.finalScore !== undefined;
  const currentScore = isFinalScoreAvailable ? cup.finalScore : cup.currentScore;
  const isCurrentScoreAvailable = currentScore !== null && currentScore !== undefined;

  return (
    <View style={styles.cupDrawer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open cup ${index + 1} cupping screen`}
        onPress={onOpenSample}
        style={[
          styles.cupRow,
          {
            minHeight: 112 * scale,
            paddingVertical: 10 * scale,
            gap: 9 * scale,
          },
        ]}
      >
        <View style={styles.cupTopLine}>
          <View style={[styles.cupIdentity, { gap: 7 * scale }]}>
            <View
              style={[
                styles.cupDot,
                {
                  width: 17 * scale,
                  height: 17 * scale,
                  borderRadius: 9 * scale,
                  backgroundColor: cup.sampleColour || "#aeb4ba",
                },
              ]}
            />
            <Text style={[styles.cupNumber, { fontSize: 22 * scale, lineHeight: 27 * scale }]}>
              Cup {cup.sampleNumber || index + 1}/{total}
            </Text>
          </View>
          {isFinalScoreAvailable ? (
            <View
              style={[
                styles.completeBadge,
                {
                  borderRadius: 14 * scale,
                  paddingHorizontal: 10 * scale,
                  paddingVertical: 3 * scale,
                },
              ]}
            >
              <Text style={[styles.completeBadgeText, { fontSize: 12 * scale, lineHeight: 16 * scale }]}>
                Complete
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.cupScoresLine, { gap: 6 * scale }]}>
          {cup.scores.map((item) => (
            <ScoreBox key={`${cup.id}-${item.key}`} item={item} scale={scale} />
          ))}

          <View style={[styles.defectIconRow, { gap: 4 * scale }]}>
            {cup.defects.length > 0 ? (
              cup.defects.map((defect) => (
                <View
                  key={`${cup.id}-${defect}`}
                  style={[
                    styles.defectIcon,
                    {
                      width: 32 * scale,
                      height: 32 * scale,
                      borderRadius: 16 * scale,
                    },
                  ]}
                >
                  <Text style={[styles.defectIconText, { fontSize: 17 * scale, lineHeight: 21 * scale }]}>
                    {defect}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noDefectsText, { fontSize: 20 * scale, lineHeight: 24 * scale }]}>-</Text>
            )}
          </View>
        </View>

        <View style={styles.cupFinalLine}>
          <Text
            style={[
              styles.finalScore,
              { fontSize: 22 * scale, lineHeight: 27 * scale },
              !isCurrentScoreAvailable ? styles.finalScoreUnavailable : null,
            ]}
          >
            {isCurrentScoreAvailable
              ? `${isFinalScoreAvailable ? "Final score" : "Current score"} ${Number(currentScore).toFixed(2)}`
              : "Score -"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Close" : "Open"} cup ${index + 1} details`}
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggle?.();
          }}
          hitSlop={10 * scale}
        >
          <Text style={[styles.cupDrawerGlyph, { fontSize: 34 * scale, lineHeight: 38 * scale }]}>
            {expanded ? "⌃" : "⌄"}
          </Text>
        </Pressable>
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.cupDrawerBody,
            {
              paddingHorizontal: 18 * scale,
              paddingTop: 13 * scale,
              paddingBottom: 16 * scale,
              gap: 14 * scale,
            },
          ]}
        >
          {[
            { label: "Coffee", value: cup.coffeeNameOrigin },
            { label: "Process", value: getProcessLabel(cup.process) || cup.process },
          ].map((item) => (
            <View key={`${cup.id}-${item.label}`} style={styles.cupDrawerInfoRow}>
              <Text style={[styles.cupDrawerLabel, { width: 116 * scale, fontSize: 18 * scale, lineHeight: 23 * scale }]}>
                {item.label}
              </Text>
              <Text style={[styles.cupDrawerValue, { flex: 1, fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                {item.value || "-"}
              </Text>
            </View>
          ))}
          <View style={styles.cupDrawerInfoRow}>
            <Text style={[styles.cupDrawerLabel, { width: 116 * scale, fontSize: 18 * scale, lineHeight: 23 * scale }]}>
              Flavours
            </Text>
            <View style={styles.flavourPillRow}>
              {cup.flavours.length > 0 ? (
                <KeywordPillRow pills={cup.flavours} scale={scale} />
              ) : (
                <Text style={[styles.cupDrawerValue, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>-</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function ActiveSessionScreen({
  sessionId = null,
  onBackPress,
  onScanPress,
  onSamplePress,
  isScanInProgress = false,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [session, setSession] = useState(null);
  const [cups, setCups] = useState([]);
  const [expandedCupId, setExpandedCupId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadActiveSession = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const sessions = await listSessions();
        const active =
          sessionId
            ? sessions?.find((item) => item.id === sessionId) || { id: sessionId }
            : (sessions || []).find((item) => String(item.status || "").toLowerCase() !== "complete");
        if (!active) {
          if (!isCancelled) {
            setSession(null);
            setCups([]);
          }
          return;
        }

        const fullSession = await getSessionById(active.id);
        const finalStatus = await getSessionSampleFinalStatus(active.id);
        const rows = await Promise.all(
          (fullSession?.samples || []).map(async (sample, index) => {
            const feedback = await getSampleFeedback(sample.id);
            const defects = await getSampleDefects(sample.id);
            const scores = buildScoreItems(feedback);
            const latestDefects = getLatestDefects(defects);
            return {
              ...sample,
              sessionId: fullSession?.id || sample.sessionId,
              scores,
              defects: buildDefectIcons(defects),
              flavours: extractFlavourPills(feedback),
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
  }, [sessionId]);

  const status = useMemo(() => {
    if (!session) {
      return "Pending";
    }
    return formatStatus(session.status);
  }, [session]);

  return (
    <View style={styles.screen}>
      <Header
        title="Active Session"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: 26 * scale,
            paddingTop: 30 * scale,
            paddingBottom: 128 * scale,
          },
        ]}
      >
        {session ? (
          <>
            <View style={[styles.metaList, { gap: 18 * scale }]}>
              <MetaRow label="Date" value={session.sessionDate} scale={scale} />
              <MetaRow label="Session Name" value={session.sessionName} scale={scale} />
              <MetaRow label="Session Type" value={getSessionTypeLabel(session.sessionType)} scale={scale} />
              <MetaRow label="Status" value={status} scale={scale} />
            </View>

            <View style={[styles.cupList, { marginTop: 24 * scale }]}>
              {cups.map((cup, index) => (
                <ActiveSessionCupRow
                  key={cup.id}
                  cup={cup}
                  index={index}
                  total={Number(session.samplesInSession) || cups.length || 1}
                  scale={scale}
                  expanded={expandedCupId === cup.id}
                  onToggle={() => setExpandedCupId((current) => (current === cup.id ? null : cup.id))}
                  onOpenSample={
                    typeof onSamplePress === "function"
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

      <View style={[styles.footer, { paddingHorizontal: 26 * scale }]}>
        <FullPageButton
          label="SCAN CUP"
          onPress={onScanPress}
          loading={isScanInProgress}
          disabled={isScanInProgress || typeof onScanPress !== "function"}
          accessibilityLabel="Scan cup"
          style={styles.scanButton}
          textStyle={[styles.scanButtonText, { fontSize: 19 * scale, lineHeight: 23 * scale }]}
        />
      </View>
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
    borderBottomColor: "#eef0f2",
  },
  metaLabel: {
    color: "#667078",
    fontWeight: "800",
    letterSpacing: 0,
  },
  metaValue: {
    color: INK,
    fontWeight: "800",
    letterSpacing: 0,
  },
  cupList: {
    width: "100%",
  },
  cupDrawer: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f2",
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
  },
  cupDot: {},
  completeBadge: {
    backgroundColor: INK,
  },
  completeBadgeText: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0,
  },
  cupNumber: {
    color: INK,
    fontWeight: "800",
    letterSpacing: 0,
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
    color: "#667078",
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  scoreBox: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: INK,
    backgroundColor: "#ffffff",
  },
  scoreBoxFinal: {
    borderColor: INK,
    backgroundColor: INK,
  },
  scoreBoxText: {
    color: INK,
    fontWeight: "600",
    letterSpacing: 0,
  },
  scoreBoxTextFinal: {
    color: "#ffffff",
  },
  defectIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  defectIcon: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
  },
  defectIconText: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0,
  },
  noDefectsText: {
    color: "#c5cbd0",
    fontWeight: "800",
    letterSpacing: 0,
  },
  cupFinalLine: {
    width: "100%",
    alignItems: "flex-start",
  },
  finalScore: {
    color: INK,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "left",
  },
  finalScoreUnavailable: {
    color: "#aeb4ba",
  },
  cupDrawerGlyph: {
    color: INK,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  cupDrawerBody: {
    width: "100%",
    backgroundColor: "#f6f7f8",
  },
  cupDrawerInfoRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cupDrawerLabel: {
    color: "#667078",
    fontWeight: "800",
    letterSpacing: 0,
  },
  cupDrawerValue: {
    color: INK,
    fontWeight: "700",
    letterSpacing: 0,
  },
  flavourPillRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  emptyState: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: "#667078",
    textAlign: "center",
    fontWeight: "700",
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
    backgroundColor: IOS_BLUE,
  },
  scanButtonText: {
    letterSpacing: 1.4,
  },
});
