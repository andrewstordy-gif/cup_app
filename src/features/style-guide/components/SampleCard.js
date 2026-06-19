import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import AntDesign from "@expo/vector-icons/AntDesign";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { AppIcon } from "../../../components/ui/AppIcon";
import { KeywordPillRow } from "../../cupping/components/KeywordPillRow";
import { ScoreRow } from "./ScoreRow";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";

export const SCORE_LABELS = ["Fr", "Ar", "Fl", "Af", "Ac", "Sw", "Mf", "Ov"];

export function makeScores(values) {
  return SCORE_LABELS.map((label, i) => ({
    key: `field-${i}`,
    label,
    score: values[i] ?? null,
    isFinal: values[i] != null,
  }));
}

export const EMPTY_SCORES = SCORE_LABELS.map((label, i) => ({
  key: `field-${i}`,
  label,
  score: null,
  isFinal: false,
}));

export function computeScore(scores) {
  const values = scores.map(s => s.score).filter(v => v != null);
  if (values.length < 8) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const raw = 0.65625 * sum + 52.75;
  return Math.round(raw * 4) / 4;
}


export function SampleCard({ sample, index, scale, onEdit, onDelete, showFinalLabel = true, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const totalScore = computeScore(sample.scores);
  const allFinal = sample.scores.every(s => s.isFinal);

  return (
    <View style={[styles.card, { marginTop: 16 * scale }]}>
      {/* Collapsed header — always visible */}
      <View style={[styles.collapsedBody, { paddingHorizontal: 16 * scale, paddingTop: 18 * scale, paddingBottom: 10 * scale, gap: 12 * scale }]}>
        {/* Top row: number + score + edit on left, delete X on right */}
        <View style={styles.topLine}>
          <View style={[styles.identity, { gap: 8 * scale }]}>
            <Text style={styles.sampleLabel}>{index + 1}</Text>
            {onEdit ? (
              <Pressable
                onPress={onEdit}
                accessibilityRole="button"
                accessibilityLabel="Edit sample"
                hitSlop={8}
              >
                <AntDesign name="edit" size={16} color={colors.inkSoft} />
              </Pressable>
            ) : null}
          </View>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete sample"
              hitSlop={8}
            >
              <AntDesign name="close" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}
        </View>

        {/* 8 score boxes + total */}
        <ScoreRow scores={sample.scores} totalScore={totalScore} scale={scale} />

        {/* Chevron centred below score row */}
        <Pressable
          onPress={() => setExpanded(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse sample" : "Expand sample"}
          style={styles.chevronRow}
          hitSlop={8}
        >
          <AppIcon name={expanded ? "chevron-up" : "chevron-down"} role="icon_navigation" size={22} />
        </Pressable>
      </View>

      {/* Expanded detail */}
      {expanded ? (
        <>
          <View style={styles.divider} />

          <View style={[styles.section, { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale, gap: 12 * scale }]}>
            <View>
              <Text style={styles.sectionLabel}>Coffee</Text>
              <Text style={[styles.sectionValue, { marginTop: 2 * scale }]}>{sample.coffeeName}</Text>
            </View>
            <View>
              <Text style={styles.sectionLabel}>Process</Text>
              <Text style={[styles.sectionValue, { marginTop: 2 * scale }]}>{sample.process}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={[styles.section, { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale, gap: 16 * scale }]}>
            <View>
              <Text style={styles.sectionLabel}>Fragrance / Aroma Notes</Text>
              <View style={[styles.notesBox, { borderRadius: 10 * scale, marginTop: 6 * scale }]}>
                <Text style={styles.notesBoxText}>{sample.fragranceAromaNotes}</Text>
              </View>
              <KeywordPillRow pills={sample.fragranceAromaPills} scale={scale} style={{ marginTop: 8 * scale }} />
            </View>
            <View>
              <Text style={styles.sectionLabel}>Flavour Notes</Text>
              <View style={[styles.notesBox, { borderRadius: 10 * scale, marginTop: 6 * scale }]}>
                <Text style={styles.notesBoxText}>{sample.flavourNotes}</Text>
              </View>
              <KeywordPillRow pills={sample.flavourPills} scale={scale} style={{ marginTop: 8 * scale }} />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={[styles.section, { paddingHorizontal: 14 * scale, paddingVertical: 14 * scale, gap: 14 * scale }]}>
            <View>
              <Text style={styles.sectionLabel}>Coffee Defects</Text>
              <View style={[styles.defectPillsRow, { gap: 6 * scale, marginTop: 8 * scale }]}>
                {sample.beanDefects.map(d => (
                  <View key={d.key} style={[styles.defectPill, { borderRadius: 15 * scale, paddingHorizontal: 10 * scale, paddingVertical: 4 * scale }]}>
                    <Text style={styles.defectPillText}>{d.title}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View>
              <Text style={styles.sectionLabel}>Roast Defects</Text>
              <View style={[styles.defectPillsRow, { gap: 6 * scale, marginTop: 8 * scale }]}>
                {sample.roastDefects.map(d => (
                  <View key={d.key} style={[styles.defectPill, { borderRadius: 15 * scale, paddingHorizontal: 10 * scale, paddingVertical: 4 * scale }]}>
                    <Text style={styles.defectPillText}>{d.title}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
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
});
