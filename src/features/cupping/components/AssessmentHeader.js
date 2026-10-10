import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '../../../components/ui/Header';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

export function assessmentSampleNumber(sampleNumber, cupIndex) {
  const explicit = Number.parseInt(sampleNumber, 10);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const index = Number.parseInt(cupIndex, 10);
  return Number.isInteger(index) && index >= 0 ? index + 1 : 1;
}

export function measuredTemperatureLabel(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?\s*(?:°\s*)?[cC]?$/.test(raw)) return null;
  const temperature = Number.parseFloat(raw);
  return Number.isFinite(temperature) ? `${Math.round(temperature)} °C` : null;
}

export function AssessmentHeader({ sampleNumber, cupIndex, temperature, onBackPress, hideBack = false, scale = 1 }) {
  const temperatureLabel = measuredTemperatureLabel(temperature);
  return <Header variant="back" onBackPress={onBackPress} backAccessibilityLabel="Back to session"
    hideBack={hideBack} sideWidth={112}
    titleContent={<Text style={styles.sampleNumber} accessibilityLabel={`Sample ${assessmentSampleNumber(sampleNumber, cupIndex)}`}>
      {assessmentSampleNumber(sampleNumber, cupIndex)}
    </Text>}
    rightContent={<View accessible style={[styles.temperatureRow, { gap: spacing.xs * scale }]}
      accessibilityLabel={temperatureLabel ? `Measured temperature ${temperatureLabel}` : 'Temperature unavailable'}>
      <View accessible={false} style={[styles.thermometer, { width: 14 * scale, height: 32 * scale }]}>
        <View style={[styles.stem, { width: 6 * scale, height: 23 * scale, borderRadius: 3 * scale, borderWidth: 2 * scale }, !temperatureLabel && styles.unavailableStroke]} />
        <View style={[styles.bulb, { width: 14 * scale, height: 14 * scale, borderRadius: 7 * scale, borderWidth: 2 * scale }, !temperatureLabel && styles.unavailableBulb]} />
      </View>
      <Text style={[styles.temperature, !temperatureLabel && styles.unavailable]}>{temperatureLabel || '— °C'}</Text>
    </View>}
  />;
}

const styles = StyleSheet.create({
  sampleNumber: { ...typography.text_screen_title, color: colors.ink, lineHeight: 28 },
  temperatureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  thermometer: { alignItems: 'center', justifyContent: 'flex-end' },
  stem: { position: 'absolute', top: 1, borderColor: colors.ink, backgroundColor: colors.surface },
  bulb: { backgroundColor: colors.ink, borderColor: colors.ink },
  temperature: { ...typography.text_screen_title, color: colors.ink },
  unavailable: { color: colors.inkSoft },
  unavailableStroke: { borderColor: colors.inkSoft },
  unavailableBulb: { backgroundColor: colors.inkSoft, borderColor: colors.inkSoft },
});
