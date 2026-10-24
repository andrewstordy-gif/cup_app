// Isolated visual fixtures only. No application, persistence, radio or transport imports.
import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from './src/components/ui/TypographyAuditText';
import { AppIcon } from './src/components/ui/AppIcon';
import { full_page_button as FullPageButton } from './src/components/ui/full_page_button';
import { colors } from './src/theme/colors';
import { spacing } from './src/theme/spacing';
import { typography } from './src/theme/typography';

export const UPLOAD_FIXTURES = Object.freeze([
  Object.freeze({ label: 'Not uploaded', icon: null }),
  Object.freeze({ label: 'Upload queued', icon: 'cloud-clock' }),
  Object.freeze({ label: 'Uploaded', icon: 'cloud-check' }),
]);

export function UploadStatus({ fixture }) {
  return <View accessible accessibilityRole="text" accessibilityLabel={`Test data upload status: ${fixture.label}`} style={styles.status}>
    {fixture.icon ? <AppIcon name={fixture.icon} role="icon_status" color={colors.inkSoft} /> : null}
    <Text style={styles.supporting}>{fixture.label}</Text>
  </View>;
}

function CompleteBadge() {
  return <View style={styles.badge}><Text style={styles.badgeText}>COMPLETE</Text></View>;
}

export function UploadUiPreview({ onOpenTestApp }) {
  const [selected, setSelected] = useState(0);
  const fixture = UPLOAD_FIXTURES[selected];
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">UI preview · test data</Text>
      <Text style={styles.supporting}>Appearance only. Nothing uploads, scans or saves. Status choices show test data, not real upload acknowledgements.</Text>
      <View style={styles.selectors} accessibilityLabel="Choose upload status test data">
        {UPLOAD_FIXTURES.map((item, index) => <Pressable key={item.label} testID={`upload-fixture-${index}`}
          accessibilityRole="button" accessibilityLabel={`Preview ${item.label}`} accessibilityState={{ selected: selected === index }}
          onPress={() => setSelected(index)} style={({ pressed }) => [styles.selector, selected === index && styles.selectorSelected, pressed && styles.pressed]}>
          <Text style={styles.selectorText}>{item.label}</Text>
        </Pressable>)}
      </View>

      <View style={styles.details}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Session Details</Text>
        <View style={styles.heading}><Text style={styles.sectionTitle}>Harvest review</Text><CompleteBadge /></View>
        <Text style={styles.supporting}>Sourcing Decision</Text>
        <Text style={styles.supporting}>SCA CVA — Affective Assessment</Text>
        <UploadStatus fixture={fixture} />
      </View>

      <Text style={styles.supporting}>Sessions card · test data</Text>
      <View style={styles.card}>
        <View style={styles.heading}><Text style={styles.sectionTitle}>Harvest review</Text><CompleteBadge /></View>
        <Text style={styles.supporting}>Sourcing Decision</Text>
        <UploadStatus fixture={fixture} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Open unchanged test app, leaving visual preview"
        onPress={onOpenTestApp} style={({ pressed }) => [styles.openApp, pressed && styles.pressed]}>
        <Text style={styles.openAppText}>OPEN TEST APP</Text>
      </Pressable>
    </ScrollView>
    <View style={styles.footer}>
      <FullPageButton label="" disabled icon={<AppIcon name="upload" role="icon_navigation" color={colors.inkSoft} />}
        accessibilityLabel="Upload results, disabled visual preview only; nothing is sent" style={styles.uploadButton} />
      <FullPageButton label="SCAN CUP" disabled accessibilityLabel="Scan cup, disabled visual preview only; no NFC"
        style={styles.scanButton} />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...typography.text_screen_title },
  sectionTitle: { ...typography.text_section_title, flexShrink: 1 },
  supporting: { ...typography.text_secondary_body },
  selectors: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selector: { minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, justifyContent: 'center', borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 8 },
  selectorSelected: { backgroundColor: colors.panel, borderColor: colors.inkSoft },
  selectorText: { ...typography.text_secondary_body, color: colors.ink },
  pressed: { opacity: 0.88 },
  details: { gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.quietBorder },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badge: { backgroundColor: colors.panel, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { ...typography.text_caption, color: colors.inkSoft },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: { padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 18 },
  openApp: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 8 },
  openAppText: { ...typography.text_button_primary, color: colors.ink },
  footer: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderColor: colors.quietBorder, backgroundColor: colors.surface },
  uploadButton: { backgroundColor: colors.muted },
  scanButton: { backgroundColor: colors.action },
});
