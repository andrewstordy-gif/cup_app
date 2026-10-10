import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

// Legacy results have seven quality marks and three cup-wise checks, so the
// CVA eight-box summary is deliberately not reused here.
export function LegacySampleCard({ sample, index, status, scale = 1, onPress }) {
  const number = sample.sampleNumber || index + 1;
  const finalScore = status?.finalScore;
  const state = finalScore ? `Final score ${finalScore}` : status?.hasAnyFeedback ? 'Draft saved' : 'Not assessed';
  const name = sample.coffeeNameOrigin || 'Unnamed sample';
  return <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button"
    accessibilityState={{ disabled: !onPress }}
    accessibilityLabel={`Open Legacy sample ${number}, ${name}, ${state}`}
    style={[styles.card, { marginTop: 16 * scale, padding: 16 * scale }]}>
    <View style={styles.top}><Text style={styles.number}>{number}</Text>
      <View style={styles.description}><Text style={styles.name}>{name}</Text>
        <Text style={styles.state}>{state}</Text></View>
      {finalScore ? <Text style={styles.score}>{finalScore}</Text> : null}</View>
    {status?.resultLabel ? <Text style={styles.state}>{status.resultLabel}</Text> : null}
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
