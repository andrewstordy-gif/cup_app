import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { IconButton } from '../../../components/ui/IconButton';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getProcessLabel } from '../../cupping/constants/sessionDetails';

// Legacy results have seven quality marks and three cup-wise checks, so the
// CVA eight-box summary is deliberately not reused here.
export function LegacySampleCard({ sample, index, status, scale = 1, onPress, onRemove, canRemove = false, showRemove = false, inactive = false }) {
  const number = sample.sampleCode || sample.sampleNumber || index + 1;
  const finalScore = inactive ? null : status?.finalScore;
  const state = inactive ? 'Scan cup to include in your tasting' : finalScore ? `Final score ${finalScore}` : status?.hasAnyFeedback ? 'Draft saved' : 'Not assessed';
  const name = sample.coffeeNameOrigin || 'Unnamed sample';
  return <Pressable onPress={inactive ? undefined : onPress} disabled={inactive || !onPress} accessibilityRole="button"
    accessibilityState={{ disabled: inactive || !onPress }}
    accessibilityLabel={`${inactive ? 'Legacy sample' : 'Open Legacy sample'} ${number}, ${name}${inactive ? `, ${getProcessLabel(sample.process) || 'Process not set'}` : ''}, ${state}`}
    style={[styles.card, inactive && { backgroundColor: colors.panel }, { marginTop: 16 * scale, padding: 16 * scale }]}>
    <View style={styles.top}><Text style={styles.number}>{number}</Text>
      <View style={styles.description}><Text style={styles.name}>{name}</Text>
        {inactive ? <Text style={styles.state}>{getProcessLabel(sample.process) || 'Process not set'}</Text> : null}
        <Text style={styles.state}>{state}</Text></View>
      {finalScore ? <Text style={styles.score}>{finalScore}</Text> : null}
      {showRemove && !inactive ? <IconButton name="close" color={colors.inkSoft} disabled={!canRemove}
        accessibilityLabel={`Remove sample ${number}`} onPress={event=>{event?.stopPropagation?.();if(canRemove)onRemove?.(sample.id);}} /> : null}</View>
    {!inactive && status?.resultLabel ? <Text style={styles.state}>{status.resultLabel}</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, gap: spacing.sm, minHeight: 74 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: { ...typography.text_section_title, color: colors.ink, minWidth: 24 },
  description: { flex: 1, gap: spacing.xs },
  name: { ...typography.text_body, color: colors.ink },
  state: { ...typography.text_secondary_body, color: colors.inkSoft },
  score: { ...typography.text_secondary_metric, color: colors.ink },
});
