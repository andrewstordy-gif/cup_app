import React, { useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";
import { spacing } from "../../../theme/spacing";
import { getSessionTypeLabel, getCuppingModeLabel } from "../../cupping/constants/sessionDetails";
import { SampleCard, makeScores } from "../components/SampleCard";

const IN_PROGRESS_SAMPLES = [
  {
    coffeeName: "Ethiopia Yirgacheffe",
    process: "Washed",
    scores: makeScores([8, 8, 9, 8, 8, 7, 8, 8]),
    fragranceAromaNotes: "Jasmine, bergamot, peach",
    fragranceAromaPills: [],
    flavourNotes: "Stone fruit, citrus, floral",
    flavourPills: [],
    beanDefects: [],
    roastDefects: [],
  },
  {
    coffeeName: "Colombia Huila",
    process: "Natural",
    scores: makeScores([8, 7, 8, 7, 7, 7, 7, 8]),
    fragranceAromaNotes: "Dark cherry, cocoa",
    fragranceAromaPills: [],
    flavourNotes: "Red fruit, milk chocolate",
    flavourPills: [],
    beanDefects: [],
    roastDefects: [],
  },
  {
    coffeeName: "Kenya Kirinyaga AA",
    process: "Washed",
    scores: makeScores([9, 8, 8, 8, null, null, null, null]),
    fragranceAromaNotes: "Blackcurrant, tomato leaf",
    fragranceAromaPills: [],
    flavourNotes: "",
    flavourPills: [],
    beanDefects: [],
    roastDefects: [],
  },
  {
    coffeeName: "Guatemala Antigua",
    process: "Honey",
    scores: makeScores([7, null, null, null, null, null, null, null]),
    fragranceAromaNotes: "",
    fragranceAromaPills: [],
    flavourNotes: "",
    flavourPills: [],
    beanDefects: [],
    roastDefects: [],
  },
  { coffeeName: "Panama Gesha",                 process: "Washed",     scores: makeScores([null,null,null,null,null,null,null,null]), fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] },
  { coffeeName: "Burundi Kayanza",              process: "Washed",     scores: makeScores([null,null,null,null,null,null,null,null]), fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] },
  { coffeeName: "Costa Rica Tarrazu",           process: "Honey",      scores: makeScores([null,null,null,null,null,null,null,null]), fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] },
  { coffeeName: "Rwanda Nyamasheke",            process: "Natural",    scores: makeScores([null,null,null,null,null,null,null,null]), fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] },
  { coffeeName: "Indonesia Sumatra Mandheling", process: "Wet Hulled", scores: makeScores([null,null,null,null,null,null,null,null]), fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] },
  { coffeeName: "Yemen Haraaz",                 process: "Natural",    scores: makeScores([null,null,null,null,null,null,null,null]), fragranceAromaNotes: "", fragranceAromaPills: [], flavourNotes: "", flavourPills: [], beanDefects: [], roastDefects: [] },
];


export function SessionInProgressScreen({ onBackPress }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [samples, setSamples] = useState(IN_PROGRESS_SAMPLES);

  const deleteSample = (index) => setSamples(prev => prev.filter((_, i) => i !== index));

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Header
          title="Session"
          variant="back"
          onBackPress={onBackPress}
          backAccessibilityLabel="Back to Style Guide"
          debugTag="SessionInProgressScreen"
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
              <Text style={[styles.metaValue, { marginTop: 4 * scale }]}>Cup of Excellence</Text>
            </View>
            <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
              <Text style={styles.metaLabel}>Session Type</Text>
              <Text style={[styles.metaValue, { marginTop: 4 * scale }]}>{getSessionTypeLabel(5)}</Text>
            </View>
            <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
              <Text style={styles.metaLabel}>Cupping Mode</Text>
              <Text style={[styles.metaValue, { marginTop: 4 * scale }]}>{getCuppingModeLabel("blind")}</Text>
            </View>
            <View style={{ paddingBottom: 14 * scale, gap: spacing.sm }}>
              <Text style={styles.metaValueMuted}>17 Jun 2026</Text>
              <Text style={styles.metaValueMuted}>SESSION-A1B2C3D4</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>In Progress</Text>
              </View>
            </View>
          </View>

          <View style={[styles.samplesHeader, { marginTop: 32 * scale }]}>
            <Text style={styles.samplesHeading}>SAMPLES</Text>
          </View>

          {samples.map((sample, index) => (
            <SampleCard key={index} sample={sample} index={index} scale={scale} onDelete={() => deleteSample(index)} showFinalLabel={false} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <FullPageButton
          label="COMPLETE SESSION"
          onPress={() => {}}
          accessibilityLabel="Complete session"
          style={styles.completeButton}
        />
        <FullPageButton
          label="SCAN CUP"
          onPress={() => {}}
          accessibilityLabel="Scan cup"
          style={styles.scanButton}
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
  },
  completeButton: {
    backgroundColor: colors.ink,
  },
  scanButton: {
    backgroundColor: colors.action,
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
  samplesHeader: {
    paddingTop: 16,
  },
  samplesHeading: {
    ...typography.text_caption,
  },
});
