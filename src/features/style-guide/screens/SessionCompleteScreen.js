import React, { useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";
import { spacing } from "../../../theme/spacing";
import { getSessionTypeLabel, getCuppingModeLabel } from "../../cupping/constants/sessionDetails";
import { SampleCard, makeScores } from "../components/SampleCard";

const COMPLETE_SAMPLES = [
  {
    coffeeName: "Ethiopia Yirgacheffe", process: "Washed", scores: makeScores([8, 8, 9, 8, 8, 7, 8, 8]),
    fragranceAromaNotes: "Jasmine, bergamot, peach",
    fragranceAromaPills: [
      { keyword: "jasmine", colour: "#F4F0E8", tempC: 92 },
      { keyword: "floral", colour: "#E61E8A", tempC: 92 },
    ],
    flavourNotes: "Stone fruit, citrus, floral",
    flavourPills: [
      { keyword: "peach", colour: "#FFAB76", tempC: 71 },
      { keyword: "lemon", colour: "#D9D42E", tempC: 60 },
      { keyword: "floral", colour: "#E61E8A", tempC: 55 },
    ],
    beanDefects: [], roastDefects: [],
  },
  {
    coffeeName: "Colombia Huila", process: "Natural", scores: makeScores([8, 7, 8, 7, 7, 7, 7, 8]),
    fragranceAromaNotes: "Dark cherry, cocoa",
    fragranceAromaPills: [
      { keyword: "fruity", colour: "#E51C2D", tempC: 92 },
      { keyword: "nutty cocoa", colour: "#7B5A52", tempC: 92 },
    ],
    flavourNotes: "Red fruit, milk chocolate",
    flavourPills: [
      { keyword: "raspberry", colour: "#FF1493", tempC: 70 },
      { keyword: "nutty cocoa", colour: "#7B5A52", tempC: 58 },
    ],
    beanDefects: [{ key: "phenolic", title: "PHENOLIC" }], roastDefects: [],
  },
  {
    coffeeName: "Kenya Kirinyaga AA", process: "Washed", scores: makeScores([9, 8, 8, 8, 9, 8, 8, 8]),
    fragranceAromaNotes: "Blackcurrant, tomato leaf",
    fragranceAromaPills: [
      { keyword: "fruity", colour: "#E51C2D", tempC: 92 },
      { keyword: "blackberry", colour: "#111111", tempC: 92 },
    ],
    flavourNotes: "Grapefruit, redcurrant",
    flavourPills: [
      { keyword: "sour fermented", colour: "#D9D42E", tempC: 72 },
      { keyword: "blackberry", colour: "#111111", tempC: 56 },
    ],
    beanDefects: [], roastDefects: [],
  },
  {
    coffeeName: "Guatemala Antigua", process: "Honey", scores: makeScores([7, 7, 7, 7, 8, 7, 7, 7]),
    fragranceAromaNotes: "Brown sugar, almond",
    fragranceAromaPills: [
      { keyword: "sweet", colour: "#E46C2C", tempC: 92 },
      { keyword: "brown sugar", colour: "#C77C8A", tempC: 92 },
    ],
    flavourNotes: "Caramel, peach, light body",
    flavourPills: [
      { keyword: "caramelized", colour: "#D89B2B", tempC: 68 },
      { keyword: "peach", colour: "#FFAB76", tempC: 55 },
    ],
    beanDefects: [], roastDefects: [{ key: "underdeveloped", title: "UNDERDEVELOPED" }],
  },
  {
    coffeeName: "Panama Gesha", process: "Washed", scores: makeScores([9, 9, 9, 9, 9, 8, 9, 9]),
    fragranceAromaNotes: "Bergamot, jasmine, peach",
    fragranceAromaPills: [
      { keyword: "floral", colour: "#E61E8A", tempC: 92 },
      { keyword: "jasmine", colour: "#F4F0E8", tempC: 92 },
      { keyword: "sweet aromatics", colour: "#D98C9C", tempC: 92 },
    ],
    flavourNotes: "Tropical fruit, floral, tea",
    flavourPills: [
      { keyword: "fruity", colour: "#E51C2D", tempC: 74 },
      { keyword: "floral", colour: "#E61E8A", tempC: 65 },
      { keyword: "black tea", colour: "#4A2A2A", tempC: 54 },
    ],
    beanDefects: [], roastDefects: [],
  },
  {
    coffeeName: "Burundi Kayanza", process: "Washed", scores: makeScores([8, 8, 8, 7, 8, 8, 7, 8]),
    fragranceAromaNotes: "Redcurrant, hibiscus",
    fragranceAromaPills: [
      { keyword: "fruity", colour: "#E51C2D", tempC: 92 },
      { keyword: "floral", colour: "#E61E8A", tempC: 92 },
    ],
    flavourNotes: "Plum, citrus, clean",
    flavourPills: [
      { keyword: "prune", colour: "#6F42C1", tempC: 69 },
      { keyword: "lemon", colour: "#D9D42E", tempC: 57 },
    ],
    beanDefects: [], roastDefects: [],
  },
  {
    coffeeName: "Costa Rica Tarrazu", process: "Honey", scores: makeScores([7, 7, 8, 7, 7, 8, 7, 7]),
    fragranceAromaNotes: "Honey, stone fruit",
    fragranceAromaPills: [
      { keyword: "honey", colour: "#F28C28", tempC: 92 },
      { keyword: "sweet", colour: "#E46C2C", tempC: 92 },
    ],
    flavourNotes: "Apricot, brown sugar",
    flavourPills: [
      { keyword: "caramelized", colour: "#D89B2B", tempC: 67 },
      { keyword: "vanilla", colour: "#E6B8A2", tempC: 55 },
    ],
    beanDefects: [], roastDefects: [{ key: "baked", title: "BAKED" }],
  },
  {
    coffeeName: "Rwanda Nyamasheke", process: "Natural", scores: makeScores([8, 8, 8, 8, 7, 8, 8, 7]),
    fragranceAromaNotes: "Strawberry, cream",
    fragranceAromaPills: [
      { keyword: "strawberry", colour: "#E63946", tempC: 92 },
      { keyword: "sweet", colour: "#E46C2C", tempC: 92 },
    ],
    flavourNotes: "Berry, milk chocolate",
    flavourPills: [
      { keyword: "raspberry", colour: "#FF1493", tempC: 71 },
      { keyword: "nutty cocoa", colour: "#7B5A52", tempC: 58 },
    ],
    beanDefects: [], roastDefects: [],
  },
  {
    coffeeName: "Indonesia Sumatra Mandheling", process: "Wet Hulled", scores: makeScores([7, 7, 7, 8, 7, 7, 8, 7]),
    fragranceAromaNotes: "Cedar, dark chocolate, earth",
    fragranceAromaPills: [
      { keyword: "roasted", colour: "#C24A2C", tempC: 92 },
      { keyword: "nutty cocoa", colour: "#7B5A52", tempC: 92 },
    ],
    flavourNotes: "Tobacco, dark fruit, syrupy",
    flavourPills: [
      { keyword: "roasted", colour: "#C24A2C", tempC: 70 },
      { keyword: "prune", colour: "#6F42C1", tempC: 57 },
    ],
    beanDefects: [{ key: "potato", title: "POTATO" }], roastDefects: [{ key: "overdeveloped", title: "OVERDEVELOPED" }],
  },
  {
    coffeeName: "Yemen Haraaz", process: "Natural", scores: makeScores([8, 8, 9, 8, 7, 8, 8, 8]),
    fragranceAromaNotes: "Dried fruit, mocha",
    fragranceAromaPills: [
      { keyword: "nutty cocoa", colour: "#7B5A52", tempC: 92 },
      { keyword: "raisin", colour: "#7D3C98", tempC: 92 },
    ],
    flavourNotes: "Blueberry, wine, dark honey",
    flavourPills: [
      { keyword: "blueberry", colour: "#5B5EA6", tempC: 73 },
      { keyword: "honey", colour: "#F28C28", tempC: 59 },
    ],
    beanDefects: [{ key: "mouldy", title: "MOULDY" }], roastDefects: [],
  },
];

export function SessionCompleteScreen({ onBackPress }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [samples, setSamples] = useState(COMPLETE_SAMPLES);

  const deleteSample = (index) => setSamples(prev => prev.filter((_, i) => i !== index));

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Header
          title="Session"
          variant="back"
          onBackPress={onBackPress}
          backAccessibilityLabel="Back to Style Guide"
          debugTag="SessionCompleteScreen"
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
                <Text style={styles.statusBadgeText}>Complete</Text>
              </View>
            </View>
          </View>

          <View style={[styles.samplesHeader, { marginTop: 32 * scale }]}>
            <Text style={styles.samplesHeading}>SAMPLES</Text>
          </View>

          {samples.map((sample, index) => (
            <SampleCard
              key={index}
              sample={sample}
              index={index}
              scale={scale}
              showFinalLabel={false}
              defaultExpanded={true}
              onDelete={() => deleteSample(index)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <View style={styles.shareButton} accessibilityRole="button" accessibilityLabel="Share session">
          <Ionicons name="share-outline" size={24} color={colors.surface} />
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    alignItems: "center",
  },
  shareButton: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
});
