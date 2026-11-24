import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { AppIcon } from '../../../components/ui/AppIcon';
import { IconButton } from '../../../components/ui/IconButton';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getProcessLabel } from '../../cupping/constants/sessionDetails';
import { legacyCardPresentation, legacyCardScoreLayout } from './legacyCardPresentation';

function Section({ title, children, scale }) {
  return <View style={[styles.section, { padding: spacing.md * scale }]}>
    <Text style={styles.heading}>{title}</Text>{children}
  </View>;
}

// Legacy has seven exact quarter-point marks, not CVA's eight integer ratings.
export function LegacySampleCard({ sample, index, status, scale = 1, fontScale = 1,
  sessionId = null, refreshKey = null, readSavedAssessment, onPress, onRemove,
  canRemove = false, showRemove = false, inactive = false }) {
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [retry, setRetry] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  const sampleId = sample.id;
  const canRead = Boolean(!inactive && sessionId && sampleId && readSavedAssessment);
  useEffect(() => {
    if (!canRead) return undefined;
    let cancelled = false;
    const context = { sessionId, sampleId, status, refreshKey, retry, reader: readSavedAssessment };
    Promise.resolve().then(() => cancelled ? null : readSavedAssessment(sessionId, sampleId)).then(saved => {
      if (!cancelled) setSnapshot({ ...context, saved });
    }).catch(() => {
      if (!cancelled) setSnapshot({ ...context, failed: true });
    });
    return () => { cancelled = true; };
  }, [canRead, sessionId, sampleId, status, refreshKey, retry, readSavedAssessment]);

  // Hide old data during render, before effect cleanup can run. A note-only
  // edit still replaces the parent's status snapshot/presentation revision.
  const current = canRead && snapshot?.sessionId === sessionId && snapshot?.sampleId === sampleId &&
    snapshot?.status === status && snapshot?.refreshKey === refreshKey && snapshot?.retry === retry &&
    snapshot?.reader === readSavedAssessment ? snapshot : null;
  const presentation = legacyCardPresentation(current?.saved);
  const loading = canRead && !current;
  const number = sample.sampleCode || sample.sampleNumber || index + 1;
  const name = sample.coffeeNameOrigin || 'Unnamed sample';
  const state = inactive ? 'Scan cup to include in your tasting' : loading ? 'Loading saved assessment…' :
    current?.failed ? 'Saved assessment unavailable.' : presentation.final ? 'Saved' : presentation.hasSavedResponse ? 'Draft saved' : 'Not assessed';
  const layout = legacyCardScoreLayout(rowWidth, fontScale, scale);

  return <View style={[styles.card, inactive && styles.inactive, { marginTop: spacing.md * scale }]}>
    <View style={[styles.top, { paddingHorizontal: spacing.md * scale, paddingTop: spacing.sm * scale }]}>
      <Pressable disabled={inactive || !onPress} onPress={inactive ? undefined : onPress}
        accessibilityRole="button" accessibilityState={{ disabled: inactive || !onPress }}
        accessibilityLabel={`${inactive ? 'Legacy sample' : 'Open Legacy sample'} ${number}, ${name}, ${state}`}
        style={styles.openArea}>
        <Text style={styles.number}>{number}</Text><Text style={styles.state}>{state}</Text>
      </Pressable>
      {showRemove && !inactive ? <IconButton name="close" color={colors.inkSoft} disabled={!canRemove}
        accessibilityLabel={`Remove sample ${number}`} onPress={() => { if (canRemove) onRemove?.(sample.id); }} /> : null}
    </View>
    {!inactive ? <Pressable disabled={!onPress} onPress={onPress} accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      accessibilityLabel={`Open Legacy sample ${number}. ${[...presentation.quality, { label: 'Total score', value: presentation.total }].map(score => `${score.label}: ${score.value ?? 'not scored'}`).join(', ')}`}
      style={{ paddingHorizontal: spacing.xs * scale }}>
      <ScrollView horizontal onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
        showsHorizontalScrollIndicator={layout.contentWidth > rowWidth}>
        <View style={[styles.scoreRow, { gap: layout.gap }]}>
          {[...presentation.quality, { key: 'total', caption: 'TOTAL', label: 'Total score', value: presentation.total }].map((score, i) => (
            <View key={score.key} accessible accessibilityLabel={`${score.label}: ${score.value ?? 'not scored'}`}
              style={{ width: i === 7 ? layout.totalWidth : layout.qualityWidth, gap: spacing.xs * scale }}>
              <Text style={styles.caption}>{score.caption}</Text>
              <View style={[styles.scoreBox, presentation.final && i !== 7 && styles.finalBox,
                i === 7 && styles.totalBox, { minHeight: 36 * scale, borderRadius: 7 * scale }]}>
                <Text style={[styles.scoreValue, presentation.final && i !== 7 && styles.finalValue]}>{score.value ?? '—'}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      {presentation.resultLabel ? <Text style={[styles.state, { margin: spacing.xs * scale }]}>{presentation.resultLabel}</Text> : null}
    </Pressable> : <View style={{ paddingHorizontal: spacing.md * scale, paddingBottom: spacing.md * scale }}>
      <Text style={styles.value}>{name}</Text><Text style={styles.state}>{getProcessLabel(sample.process) || 'Process not set'}</Text>
    </View>}
    {!inactive ? <Pressable onPress={() => setExpanded(value => !value)} accessibilityRole="button"
      accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} sample ${number}`} accessibilityState={{ expanded }} style={styles.expand}>
      <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} role="icon_navigation" />
    </Pressable> : null}
    {!inactive && expanded ? <>
      <Section title="Coffee / Process" scale={scale}>
        <Text style={styles.value}>{name}</Text><Text style={styles.state}>{getProcessLabel(sample.process) || 'Process not set'}</Text>
      </Section>
      {loading || current?.failed ? <View style={[styles.section, { padding: spacing.md * scale }]}>
        <Text style={styles.state} accessibilityLiveRegion="polite">{state}</Text>
        {current?.failed ? <Pressable onPress={() => setRetry(value => value + 1)} accessibilityRole="button" style={styles.retry}>
          <Text style={styles.value}>Retry</Text>
        </Pressable> : null}
      </View> : null}
      {presentation.aromaNotes ? <Section title="Fragrance / Aroma" scale={scale}><Text style={styles.notes}>{presentation.aromaNotes}</Text></Section> : null}
      {presentation.generalNotes ? <Section title="General notes" scale={scale}><Text style={styles.notes}>{presentation.generalNotes}</Text></Section> : null}
      {presentation.beanDefects.length || presentation.scoredDefect ? <Section title="Bean defects" scale={scale}>
        {presentation.beanDefects.map(value => <Text key={value} style={styles.value}>{value}</Text>)}
        {presentation.scoredDefect ? <Text style={styles.state}>{presentation.scoredDefect}</Text> : null}
      </Section> : null}
      {presentation.defectNotes ? <Section title="Defect notes" scale={scale}><Text style={styles.notes}>{presentation.defectNotes}</Text></Section> : null}
      {presentation.hasSavedResponse ? <Section title="Cup assessment" scale={scale}>
        {presentation.checks.map(check => <View key={check.key} style={styles.checkRow}>
          <Text style={styles.state}>{check.label}</Text><Text style={styles.value}>{check.value ?? '—'}</Text>
        </View>)}
      </Section> : null}
      {presentation.roastNotes || presentation.roastDefects.length ? <Section title="Roast" scale={scale}>
        {presentation.roastNotes ? <><Text style={styles.heading}>Roast notes</Text><Text style={styles.notes}>{presentation.roastNotes}</Text></> : null}
        {presentation.roastDefects.length ? <><Text style={styles.heading}>Roast defects</Text>
          {presentation.roastDefects.map(value => <Text key={value} style={styles.value}>{value}</Text>)}
        </> : null}
      </Section> : null}
      {presentation.final ? <Section title="Final score" scale={scale}>
        <Text style={styles.score}>{presentation.total}</Text><Text style={styles.state}>{presentation.resultLabel}</Text>
        {presentation.extendedNote ? <Text style={styles.state}>{presentation.extendedNote}</Text> : null}
      </Section> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
  inactive: { backgroundColor: colors.panel },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  openArea: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  number: { ...typography.text_section_title, color: colors.ink },
  state: { ...typography.text_secondary_body, color: colors.inkSoft, flexShrink: 1 },
  value: { ...typography.text_body, color: colors.ink },
  scoreRow: { flexDirection: 'row', paddingVertical: spacing.sm },
  caption: { ...typography.text_caption, color: colors.inkSoft, letterSpacing: 0, textAlign: 'center' },
  scoreValue: { ...typography.text_caption, color: colors.ink, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  scoreBox: { borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  finalBox: { backgroundColor: colors.ink, borderColor: colors.ink },
  finalValue: { color: colors.surface },
  totalBox: { borderColor: colors.inkSoft, borderStyle: 'dashed' },
  expand: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  section: { borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  heading: { ...typography.text_caption, color: colors.inkSoft },
  notes: { ...typography.text_body, color: colors.ink, backgroundColor: colors.input, padding: spacing.sm, borderRadius: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.sm },
  score: { ...typography.text_primary_metric, color: colors.ink },
});
