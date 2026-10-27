import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

// Presentation only: each form supplies its own saved score and breakdown.
export function AssessmentResultSection({ formLabel, provenance, details = [], rows = [], expanded, onToggle, scale = 1 }) {
  const rowLayout = { gap: spacing.sm * scale, paddingVertical: spacing.xs * scale };
  return <View style={[styles.section, { paddingTop: spacing.md * scale, paddingBottom: spacing.lg * scale }]}>
    <Text style={styles.title}>Result</Text>
    <View style={{ marginTop: spacing.sm * scale, gap: spacing.xs * scale }}>
      <Text style={styles.metadata}>{provenance}</Text>
      <Text style={styles.metadata}>{formLabel}</Text>
      {details.filter(Boolean).map((detail, index) => <Text key={`${index}-${detail}`} style={styles.metadata}>{detail}</Text>)}
    </View>
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel="Score breakdown"
      accessibilityState={{ expanded: Boolean(expanded) }} style={[styles.toggle, { marginTop: spacing.md * scale }]}>
      <Text style={styles.action}>{expanded ? 'Hide score breakdown' : 'Show score breakdown'}</Text>
    </Pressable>
    {expanded ? <View style={{ marginTop: spacing.sm * scale }}>
      {rows.map(({ key, label, value, total }) => <View key={key || label}
        style={[styles.row, rowLayout, total && styles.totalRow, total && { marginTop: spacing.xs * scale }]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>)}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, borderTopColor: colors.quietBorder },
  title: { ...typography.text_section_title, color: colors.ink },
  metadata: { ...typography.text_secondary_body, color: colors.inkSoft },
  toggle: { minHeight: 44, justifyContent: 'center' },
  action: { ...typography.text_body, color: colors.action },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLabel: { ...typography.text_secondary_body, color: colors.inkSoft, flexShrink: 1 },
  rowValue: { ...typography.text_secondary_body, color: colors.inkSoft, textAlign: 'right' },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.quietBorder },
});
