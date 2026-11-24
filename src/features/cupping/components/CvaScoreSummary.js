import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { CVA_SCORE_PATTERN, cvaSummaryCells, recordCvaSummaryMeasurement, cvaSummaryLayout } from './cvaScoreSummaryPresentation';

export function CvaScoreSummary({ scores, totalScore, scale = 1 }) {
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  const cells = cvaSummaryCells(scores, totalScore);
  const key = JSON.stringify([CVA_SCORE_PATTERN, typography.text_sample_score.fontSize,
    typography.text_sample_score.fontWeight, typography.text_sample_score.lineHeight, fontScale, ...cells.map(cell => cell.value)]);
  const [measurements, setMeasurements] = useState({ key, bounds: {} });
  if (measurements.key !== key) setMeasurements({ key, bounds: {} });
  const bounds = measurements.key === key ? measurements.bounds : {};
  const measure = metric => event => {
    const lines = event?.nativeEvent?.lines;
    const line = Array.isArray(lines) && lines.length === 1 ? lines[0] : null;
    const width = typeof line?.width === 'number' ? line.width : null;
    const height = typeof line?.height === 'number' ? line.height : null;
    // Only copied primitives enter the deferred updater, never a pooled event.
    setMeasurements(previous => recordCvaSummaryMeasurement(previous, key, metric, width, height));
  };
  const layout = cvaSummaryLayout(rowWidth, fontScale, scale, bounds, cells,
    typography.text_sample_score.fontSize, typography.text_sample_score.lineHeight, typography.text_caption.fontSize);

  return <View>
    <View key={key} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={styles.probes}>
      {cells.map(cell => <React.Fragment key={cell.key}>
        <Text accessible={false} style={styles.number} onTextLayout={measure(`${cell.key}:value`)}>{cell.value}</Text>
        <Text accessible={false} style={styles.caption} onTextLayout={measure(`${cell.key}:caption`)}>{cell.caption}</Text>
      </React.Fragment>)}
    </View>
    <ScrollView horizontal onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
      showsHorizontalScrollIndicator={layout.contentWidth > rowWidth}>
      <View style={[styles.row, { gap: layout.gap }]}>
        {cells.map((cell, index) => <View key={cell.key} accessible
          accessibilityLabel={`${cell.label}: ${cell.value === '—' || cell.value === 'P' ? 'not scored' : cell.value}`}
          style={{ width: index === 8 ? layout.totalWidth : layout.qualityWidth, gap: 6 * scale }}>
          <Text style={styles.caption}>{cell.caption}</Text>
          <View style={[styles.box, index !== 8 && cell.isFinal && styles.finalBox, index === 8 && styles.totalBox,
            { height: layout.cellHeight, borderRadius: 7 * scale }]}>
            {index === 8 ? <Text style={styles.number}>{cell.value}</Text> :
              <View accessible={false} style={[styles.rotatedFrame, {
                width: layout.valueBounds[index].width, height: layout.valueBounds[index].height,
                marginLeft: -layout.valueBounds[index].width / 2, marginTop: -layout.valueBounds[index].height / 2,
              }]}>
                <Text accessible={false} style={[styles.number, cell.isFinal && styles.finalNumber]}>{cell.value}</Text>
              </View>}
          </View>
        </View>)}
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  probes: { position: 'absolute', left: 0, top: 0, width: 10000, opacity: 0, alignItems: 'flex-start' },
  row: { flexDirection: 'row' },
  caption: { ...typography.text_caption, color: colors.inkSoft, letterSpacing: 0, textAlign: 'center' },
  number: { ...typography.text_sample_score, color: colors.ink, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  box: { borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  finalBox: { backgroundColor: colors.ink, borderColor: colors.ink },
  finalNumber: { color: colors.surface },
  totalBox: { borderColor: colors.inkSoft, borderStyle: 'dashed' },
  rotatedFrame: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '90deg' }] },
});
