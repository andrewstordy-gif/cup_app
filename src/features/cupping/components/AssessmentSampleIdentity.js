import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

// The caller must pass only identity approved for display in the current mode.
export function AssessmentSampleIdentity({ name, process, scale = 1, onLayout }) {
  return <View style={[styles.container, { paddingHorizontal: 26 * scale }]} onLayout={onLayout}>
    <Text style={styles.name}>{name}</Text>
    <Text style={styles.process}>{process}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
    zIndex: 1,
  },
  name: { ...typography.text_section_title, letterSpacing: 0 },
  process: { ...typography.text_secondary_body, color: colors.inkSoft, marginTop: 2 },
});
