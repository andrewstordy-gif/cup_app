import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { SessionStatusBadge } from '../../style-guide/components/SessionStatusBadge';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

const SUMMARY_STATES = ['PENDING', 'IN PROGRESS', 'COMPLETE'];

// Display-only: callers supply already-approved presentation strings.
// No state, actions, storage or navigation are owned by this component.
export function SessionTitleSummary({
  name,
  sessionType,
  formLabel,
  dateLabel,
  sessionCode,
  status,
  uploadStatusLabel,
}) {
  if (!SUMMARY_STATES.includes(status)) return null;

  return (
    <View style={styles.summary} testID="session-title-summary">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.name}>{name}</Text>
        <SessionStatusBadge status={status} />
      </View>
      <View style={styles.description}>
        <Text style={styles.detail}>{sessionType}</Text>
        <Text style={styles.detail}>{formLabel}</Text>
      </View>
      <View style={styles.metadata}>
        <Text style={styles.metadataText}>{dateLabel}</Text>
        <Text style={styles.metadataText}>{sessionCode}</Text>
      </View>
      {uploadStatusLabel ? <Text style={styles.uploadStatus}>{uploadStatusLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    borderBottomColor: colors.quietBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.text_screen_title,
    color: colors.ink,
    fontWeight: '600',
    flexShrink: 1,
  },
  description: { gap: spacing.xs },
  detail: {
    ...typography.text_secondary_body,
    color: colors.ink,
    fontWeight: '400',
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
    marginTop: spacing.sm,
  },
  metadataText: {
    ...typography.text_caption,
    color: colors.inkSoft,
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: 0,
    flexShrink: 1,
  },
  uploadStatus: {
    ...typography.text_secondary_body,
    fontWeight: '400',
    marginTop: spacing.xs,
  },
});
