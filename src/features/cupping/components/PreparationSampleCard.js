import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getProcessLabel } from '../constants/sessionDetails';

// Projection only. Never read storage or accept scoring/setup action callbacks.
export function PreparationSampleCard({ sample }) {
  return <View style={styles.card}>
    <Text style={styles.code}>{sample.sampleCode}</Text>
    <Text style={styles.name}>{sample.coffeeNameOrigin}</Text>
    <Text style={styles.detail}>{sample.identityHidden ? 'Hidden during blind cupping' : getProcessLabel(sample.process) || 'Process not set'}</Text>
    <Text style={styles.detail}>{sample.cupNumber} {sample.cupNumber === 1 ? 'cup' : 'cups'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 12, padding: spacing.md, gap: spacing.xs, marginTop: spacing.md },
  code: { ...typography.text_section_title, letterSpacing: 0 },
  name: { ...typography.text_body },
  detail: { ...typography.text_secondary_body, color: colors.inkSoft },
});
