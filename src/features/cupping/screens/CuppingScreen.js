import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { CupStatusStrip } from "../../../components/ui/CupStatusStrip";
import { ScoreSelector } from "../../../components/ui/ScoreSelector";
import { NotesInput } from "../../../components/ui/NotesInput";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import {
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
  "Overall",
];
const READY_FIELDS = ["Fragrance"];
const CUPPING_FIELDS = ["Fragrance", "Aroma", "Flavour", "Aftertaste", "Acidity", "Sweetness", "Overall"];
const CUP_STATE_LABELS = {
  0: "OFF",
  1: "READY",
  2: "BREWING",
  3: "CUPPING",
  4: "LOW_BATTERY",
};
const SCORE_PRECISION = 2;
const SCORE_STEP = 0.25;

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

  // TODO: include Mouthfeel when that field is added so formula covers full i=1..8.
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
  cupUUID = "CUP-8291-XJ2",
  cupIndex = 0,
  cupTotal = 10,
  defectsCupTotal = null,
  cupStateNumber = 1,
  cupStatus = null,
  sessionId = null,
  sampleId = null,
  startInFinalMode = false,
  startInFinalSaved = false,
  onScanNextSample,
  isScanInProgress = false,
}) {
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
  const [nonUniformCupSlots, setNonUniformCupSlots] = useState([]);
  const [defectiveCupSlots, setDefectiveCupSlots] = useState([]);
  const nonUniformCups = nonUniformCupSlots.length;
  const defectiveCups = defectiveCupSlots.length;

  const statusDisplay = useMemo(
    () => ({
      state: cupStatus?.state || CUP_STATE_LABELS[cupStateNumber] || "UNKNOWN",
      temp: cupStatus?.temp || "92 C",
      time: cupStatus?.time || "04:20",
    }),
    [cupStateNumber, cupStatus]
  );

  const visibleFields = useMemo(() => {
    if (isFinalMode) {
      return FEEDBACK_FIELDS;
    }

    if (cupStateNumber === 1) {
      return READY_FIELDS;
    }

    if (cupStateNumber === 2) {
      return READY_FIELDS;
    }

    if (cupStateNumber === 3) {
      return CUPPING_FIELDS;
    }

    return [];
  }, [cupStateNumber, isFinalMode]);

  const isBrewing = cupStateNumber === 2;
  const isCupping = cupStateNumber === 3;
  const canCaptureFeedback = cupStateNumber === 1 || cupStateNumber === 3;
  const isFeedbackLocked = cupStateNumber === 2 && !isFinalMode;
  const showBrewingScanNext = isBrewing && !isFinalMode;
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

  useEffect(() => {
    let isMounted = true;

    const loadSavedFeedback = async () => {
      if (!sampleId) {
        if (isMounted) {
          setSavedFeedback(
            FEEDBACK_FIELDS.reduce((acc, field) => {
              acc[field] = [];
              return acc;
            }, {})
          );
        }
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
          setNonUniformCupSlots([]);
          setDefectiveCupSlots([]);
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
          setNonUniformCupSlots([]);
          setDefectiveCupSlots([]);
          return;
        }

        setDefects({
          moldy: Boolean(latest.moldy),
          phenolic: Boolean(latest.phenolic),
          potato: Boolean(latest.potato),
        });
        setNonUniformCupSlots(Array.isArray(latest.nonUniformCupSlots) ? latest.nonUniformCupSlots : []);
        setDefectiveCupSlots(Array.isArray(latest.defectiveCupSlots) ? latest.defectiveCupSlots : []);
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
  }, [sampleId, startInFinalMode, startInFinalSaved]);

  const handleScoreSelect = (field, score) => {
    setFeedback((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        score,
      },
    }));
  };

  const handleCommentsChange = (field, comments) => {
    setFeedback((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        comments,
      },
    }));
  };

  const handleToggleDefect = (key) => {
    setDefects((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  };

  const handleSaveNextSample = async () => {
    if (!canCaptureFeedback) {
      return;
    }

    setSavedFeedback((prev) => {
      const next = { ...prev };
      visibleFields.forEach((field) => {
        const entry = feedback[field];
        const hasValue = entry?.score != null || String(entry?.comments || "").trim();
        if (!hasValue) {
          return;
        }
        const currentList = Array.isArray(next[field]) ? next[field] : [];
        next[field] = [
          ...currentList,
          {
            isFinal: false,
            score: entry.score,
            comments: entry.comments,
            tempSnapshot: statusDisplay.temp,
            timeSnapshot: statusDisplay.time,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      });
      return next;
    });

    if (!sessionId || !sampleId) {
      setStatusMessage("Session linkage missing. Feedback is shown locally only.");
      return;
    }

    try {
      const fieldsToSave = visibleFields.reduce((acc, field) => {
        acc[field] = feedback[field];
        return acc;
      }, {});

      await saveSampleFeedbackBatch({
        sessionId,
        sampleId,
        feedback: fieldsToSave,
        tempSnapshot: statusDisplay.temp,
        timeSnapshot: statusDisplay.time,
        isFinal: false,
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
        isFinal: false,
      });
      setStatusMessage("Feedback saved.");
      setFeedback((prev) => clearFeedbackFields(prev, visibleFields));

      if (typeof onScanNextSample === "function") {
        await onScanNextSample();
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

  const handleScanNextSampleFromFinal = async () => {
    if (typeof onScanNextSample === "function") {
      await onScanNextSample();
    }
  };

  return (
    <View style={styles.screen}>
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

      {statusMessage ? (
        <View style={styles.statusMessageWrap}>
          <Text style={styles.statusMessageText}>{statusMessage}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.feedbackListContent}>
        {visibleFields.map((field) => (
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
                : !isBrewing && !(cupStateNumber === 3 && field === "Fragrance")
            }
            showTitle={isFinalMode ? true : !isBrewing && !(cupStateNumber === 3 && field === "Fragrance")}
            showFinalTitleSuffix={isFinalMode}
            isSavedView={isFinalMode && isFinalSaved}
          />
        ))}
        {isBrewing ? (
          <View style={styles.noticeCard} accessibilityLabel="Cup brewing notice">
            <Text style={styles.noticeTitle}>Cup is brewing</Text>
            <Text style={styles.noticeBody}>
              This cup is currently in brewing state. Cupping details can be entered once the cup reaches cupping state.
            </Text>
          </View>
        ) : null}

        {!isBrewing ? (
          <DefectsSection
            cupTotal={defectsCupTotal || cupTotal}
            defects={defects}
            nonUniformCupSlots={nonUniformCupSlots}
            defectiveCupSlots={defectiveCupSlots}
            disabled={isFinalMode && isFinalSaved}
            onToggleDefect={handleToggleDefect}
            onChangeNonUniformCupSlots={setNonUniformCupSlots}
            onChangeDefectiveCupSlots={setDefectiveCupSlots}
          />
        ) : null}

      </ScrollView>

      {canCaptureFeedback && !isFinalMode ? (
        <View style={styles.footer}>
          <FullPageButton
            label="Save > Next Sample"
            onPress={handleSaveNextSample}
            loading={isScanInProgress}
            disabled={isScanInProgress}
            accessibilityLabel="Save and go to next sample"
          />
          {isCupping ? (
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

      {showBrewingScanNext ? (
        <View style={styles.footer}>
          <FullPageButton
            label="Scan Next Sample"
            onPress={handleScanNextSampleFromFinal}
            loading={isScanInProgress}
            disabled={isScanInProgress}
            accessibilityLabel="Scan next sample"
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
            label="Scan Next Sample"
            onPress={handleScanNextSampleFromFinal}
            loading={isScanInProgress}
            disabled={isScanInProgress}
            accessibilityLabel="Scan next sample"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  feedbackListContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 96,
    gap: spacing.md,
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
