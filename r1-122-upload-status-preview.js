// Test-entry visual fixtures only: no session data, persistence or transport.
import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from './src/components/ui/TypographyAuditText';
import { AppIcon } from './src/components/ui/AppIcon';
import { IconButton } from './src/components/ui/IconButton';
import { ScreenFooterDual } from './src/components/ui/ScreenFooter';
import { SessionStatusBadge } from './src/features/style-guide/components/SessionStatusBadge';
import { colors } from './src/theme/colors';
import { spacing } from './src/theme/spacing';
import { typography } from './src/theme/typography';

export const STATUS_FIXTURES = Object.freeze([
  Object.freeze({ label: 'Not uploaded', icon: null }),
  Object.freeze({ label: 'Upload queued', icon: 'cloud-clock' }),
  Object.freeze({ label: 'Uploaded', icon: 'cloud-check' }),
]);
export const SESSION_FIXTURE = Object.freeze({ name: 'Fixture tasting', category: 'Quality Control', form: 'SCA CVA — Affective Assessment', date: '24 Oct 2026', code: 'SESSION-DEMO', status: 'COMPLETE' });

function FixtureStatus({ fixture, inSummary = false }) {
  return <View style={[styles.statusRow, inSummary && styles.summaryUploadStatus]} accessible accessibilityRole="text" accessibilityLabel={`Test data upload status: ${fixture.label}`}>
    {fixture.icon ? <AppIcon name={fixture.icon} role="icon_status" color={colors.inkSoft} /> : null}
    <Text style={styles.detail}>{fixture.label}</Text>
  </View>;
}

export function UploadStatusPreview({ onOpenTestApp }) {
  const [selected, setSelected] = useState(0);
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const fixture = STATUS_FIXTURES[selected];
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={[styles.previewContent, { paddingHorizontal: 26 * scale }]}>
      <Text style={styles.previewTitle} accessibilityRole="header">UI preview · test data</Text>
      <Text style={styles.detail}>Fictional examples only. Nothing sends or saves; these are not real upload acknowledgements.</Text>
      <View style={styles.selectors}>
        {STATUS_FIXTURES.map((status, index) => <Pressable key={status.label} testID={`status-fixture-${index}`}
          accessibilityRole="button" accessibilityLabel={`Preview ${status.label}`} accessibilityState={{ selected: selected === index }}
          onPress={() => setSelected(index)} style={({ pressed }) => [styles.selector, selected === index && styles.selected, pressed && styles.pressed]}>
          <Text style={styles.detail}>{status.label}</Text>
        </Pressable>)}
      </View>

      <Text style={styles.sectionLabel}>Session Details · test data</Text>
      <View style={styles.summary}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.name}>{SESSION_FIXTURE.name}</Text>
          <SessionStatusBadge status={SESSION_FIXTURE.status} />
        </View>
        <View style={styles.description}>
          <Text style={styles.detail}>{SESSION_FIXTURE.category}</Text>
          <Text style={styles.detail}>{SESSION_FIXTURE.form}</Text>
        </View>
        <View style={styles.metadata}>
          <Text style={styles.metadataText}>{SESSION_FIXTURE.date}</Text>
          <Text style={styles.metadataText}>{SESSION_FIXTURE.code}</Text>
        </View>
        <FixtureStatus fixture={fixture} inSummary />
      </View>

      <Text style={styles.sectionLabel}>Sessions card · test data</Text>
      <View style={[styles.sessionCard, { padding: 16 * scale }]}>
        <View style={styles.cardTop}>
          <Text style={styles.sessionTitle} numberOfLines={1}>{SESSION_FIXTURE.name}</Text>
          <IconButton name="close" color={colors.inkSoft} disabled accessibilityLabel="Delete unavailable in test-data preview" />
        </View>
        <Text style={styles.sessionCategory}>{SESSION_FIXTURE.category}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.sessionDate}>{SESSION_FIXTURE.date}</Text>
          <SessionStatusBadge status={SESSION_FIXTURE.status} />
        </View>
        <FixtureStatus fixture={fixture} />
      </View>
      <Pressable onPress={onOpenTestApp} accessibilityRole="button" accessibilityLabel="Open unchanged test app, leaving fixtures behind"
        style={({ pressed }) => [styles.openApp, pressed && styles.pressed]}>
        <Text style={styles.openAppText}>OPEN TEST APP</Text>
      </Pressable>
    </ScrollView>
    <ScreenFooterDual primaryLabel="" primaryIcon={<AppIcon name="upload" role="icon_navigation" color={colors.inkSoft} />}
      primaryIconOnly primaryDisabled primaryAccessibilityLabel="Upload unavailable in test-data preview; nothing is sent"
      secondaryLabel="SCAN CUP" secondaryDisabled secondaryAccessibilityLabel="Scan cup unavailable in test-data preview; no NFC"
      secondaryStyle={styles.scanFooterButton} secondaryTextStyle={styles.scanFooterButtonText} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  previewContent: { paddingVertical: spacing.sm, gap: spacing.sm },
  previewTitle: { ...typography.text_screen_title },
  sectionLabel: { ...typography.text_caption },
  selectors: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selector: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 8 },
  selected: { backgroundColor: colors.panel, borderColor: colors.inkSoft },
  pressed: { opacity: 0.88 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  summaryUploadStatus: { marginTop: spacing.xs },
  summary: { borderBottomColor: colors.quietBorder, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.md },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  name: { ...typography.text_screen_title, flexShrink: 1 },
  description: { gap: spacing.xs },
  detail: { ...typography.text_secondary_body },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.xs, marginTop: spacing.sm },
  metadataText: { ...typography.text_caption, flexShrink: 1 },
  sessionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 12, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sessionTitle: { ...typography.text_section_title, letterSpacing: 0, flex: 1 },
  sessionCategory: { ...typography.text_secondary_body, color: colors.inkSoft, letterSpacing: 0 },
  sessionDate: { ...typography.text_secondary_body, color: colors.inkSoft, letterSpacing: 0 },
  scanFooterButton: { backgroundColor: colors.action },
  scanFooterButtonText: { color: colors.surface },
  openApp: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 8 },
  openAppText: { ...typography.text_button_primary, color: colors.ink },
});
