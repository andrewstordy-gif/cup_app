import React from 'react';
import { StyleSheet } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { getCuppingFormLabel, getCuppingModeLabel } from '../constants/sessionDetails';

// Place at the start of scrolling form content, below the fixed assessment header/identity.
export function AssessmentFormIntro({ form, cuppingMode, cupCount }) {
  const count = Number(cupCount);
  const physicalCups = Number.isInteger(count) && count >= 1 && count <= 8
    ? `${count} ${count === 1 ? 'cup' : 'cups'}` : null;
  const context = [getCuppingFormLabel(form), getCuppingModeLabel(cuppingMode), physicalCups].filter(Boolean).join(' · ');
  return <Text style={styles.context}>{context}</Text>;
}

const styles = StyleSheet.create({
  context: { ...typography.text_secondary_body, color: colors.inkSoft },
});
