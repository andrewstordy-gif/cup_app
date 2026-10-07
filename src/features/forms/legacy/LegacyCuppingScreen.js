import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { Header } from '../../../components/ui/Header';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getLegacyResponse, saveLegacyResponse } from '../../../data/sessionRepository';

const QUALITY = [
  ['fragrance_aroma', 'Fragrance / Aroma'], ['flavor', 'Flavor'], ['aftertaste', 'Aftertaste'],
  ['acidity', 'Acidity'], ['body', 'Body'], ['balance', 'Balance'], ['overall', 'Overall'],
];
const OPTIONAL_TICKS = [
  ['dry_aroma_intensity', 'Dry aroma intensity'], ['break_aroma_intensity', 'Break aroma intensity'],
  ['wet_aroma_intensity', 'Wet aroma intensity'], ['acidity_intensity', 'Acidity intensity'],
  ['body_level', 'Body level'],
];
const OPTIONAL_TEXT = [
  ['roast_level_note', 'Roast level note'], ['aroma_qualities', 'Aroma qualities'], ['notes', 'Notes'],
];
const QUALITY_MARKS = Array.from({ length: 16 }, (_, i) => 24 + i);
const scoreText = quarter => (quarter / 4).toFixed(2);
const errorText = errors => (errors || []).map(error => error.replaceAll('_', ' ').replaceAll(':', ': ')).join('\n');

function Choice({ label, selected, onPress, disabled = false, accessibilityLabel = label }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected, disabled }} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.choiceDisabled]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

function CupSet({ label, value, count, onChange, fixed = false, readOnly = false }) {
  const selected = Array.isArray(value) ? value : [];
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>{label}</Text>
    <Text style={styles.hint}>{fixed ? 'One cup: Uniformity is always 10.' : value == null ? 'Not assessed yet' : selected.length ? `${selected.length} of ${count} cups` : 'Assessed: none qualify'}</Text>
    <View style={styles.wrap}>{Array.from({ length: count }, (_, i) => i + 1).map(cup =>
      <Choice key={cup} label={`Cup ${cup}`} accessibilityLabel={`${label}, cup ${cup}, ${selected.includes(cup) ? 'qualifies' : 'does not qualify'}`}
        selected={selected.includes(cup)} disabled={fixed || readOnly} onPress={() => onChange(selected.includes(cup) ? selected.filter(n => n !== cup) : [...selected, cup].sort((a,b) => a-b))} />
    )}</View>
    {!fixed && <View style={styles.wrap}>
      <Choice label="None qualify" selected={Array.isArray(value) && value.length === 0} disabled={readOnly} onPress={() => onChange([])} />
      <Choice label="Not assessed" selected={value == null} disabled={readOnly} onPress={() => onChange(null)} />
    </View>}
  </View>;
}

export function LegacyCuppingScreen({ sessionId, sampleId, cupCount, coffeeNameOrigin, onBackPress }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const n = Number(cupCount);
  const [response, setResponse] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [qualityField, setQualityField] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLegacyResponse(sessionId, sampleId).then(saved => {
      if (cancelled) return;
      setResponse(saved?.response || { quality_ratings: {}, consistent_cups: n === 1 ? [1] : null });
      setResult(saved?.result || null);
      setReadOnly(Boolean(saved?.sessionComplete));
      setErrors(saved?.errors || []);
      setLoading(false);
    }).catch(error => { if (!cancelled) { setMessage(error?.message || 'Could not load Legacy response.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [sessionId, sampleId, n]);

  const edit = change => {
    if (!response || readOnly) return;
    const next = change(response);
    setResponse(next);
    setResult(null);
    setErrors([]);
    setMessage('Saving draft locally…');
    queue.current = queue.current.catch(() => {}).then(() => saveLegacyResponse({ sessionId, sampleId, response: next, complete: false }))
      .then(saved => {
        if (saved.ok) setMessage('Draft saved locally.');
        else setMessage(`Could not save draft: ${errorText(saved.errors)}`);
      }).catch(error => setMessage(error?.message || 'Could not save draft.'));
  };

  const complete = async () => {
    if (!response || readOnly) return;
    await queue.current;
    try {
      const saved = await saveLegacyResponse({ sessionId, sampleId, response, complete: true });
      if (!saved.ok) {
        setErrors(saved.errors);
        setMessage('Complete the highlighted assessment fields before a final score is available. Draft remains saved.');
        return;
      }
      setErrors([]);
      setResult(saved.result);
      setMessage('Legacy assessment completed and saved locally.');
    } catch (error) { setMessage(error?.message || 'Could not complete the assessment.'); }
  };

  if (loading || !response) return <View style={styles.screen}><Header title="SCA Legacy" variant="back" onBackPress={onBackPress} /><Text style={styles.hint}>{message || 'Loading saved assessment…'}</Text></View>;
  const defect = response.scored_defect;
  return <View style={styles.screen}>
    <Header title="SCA Legacy" variant="back" onBackPress={onBackPress} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingHorizontal: 24 * scale }]}>
      <Text style={styles.heading}>{coffeeNameOrigin || 'Sample'}</Text>
      <Text style={styles.hint}>SCA Legacy (2004–2023) · Open Cupping · {n} {n === 1 ? 'cup' : 'cups'}</Text>
      <Text style={styles.hint}>Select the paper-form quarter marks. Your draft is saved on this device as you go.</Text>
      {readOnly ? <Text style={styles.hint}>This Session is complete. Its Legacy result is read-only; reset the Session to Pending before editing.</Text> : null}

      <Text style={styles.sectionTitle}>Quality ratings</Text>
      {QUALITY.map(([key, label]) => <Pressable key={key} onPress={() => setQualityField(key)} disabled={readOnly} accessibilityRole="button"
        accessibilityState={{ disabled: readOnly }}
        accessibilityLabel={`${label}, ${response.quality_ratings?.[key] == null ? 'not assessed' : scoreText(response.quality_ratings[key])}, choose rating`}
        style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{response.quality_ratings?.[key] == null ? 'Choose mark' : scoreText(response.quality_ratings[key])}</Text></Pressable>)}

      <CupSet label="Uniformity" value={n === 1 ? [1] : response.consistent_cups} count={n} fixed={n === 1} readOnly={readOnly} onChange={value => edit(r => ({ ...r, consistent_cups: value }))} />
      <CupSet label="Sweetness" value={response.sweet_cups} count={n} readOnly={readOnly} onChange={value => edit(r => ({ ...r, sweet_cups: value }))} />
      <CupSet label="Clean Cup" value={response.clean_cups} count={n} readOnly={readOnly} onChange={value => edit(r => ({ ...r, clean_cups: value }))} />

      <View style={styles.section}><Text style={styles.sectionTitle}>One scored defect</Text>
        <Text style={styles.hint}>Choose no scored defect or one taint/fault. Affected cups cannot also be marked Clean Cup.</Text>
        <View style={styles.wrap}>
          <Choice label="Not assessed" selected={defect === undefined} disabled={readOnly} onPress={() => edit(r => { const { scored_defect, ...rest } = r; return rest; })} />
          <Choice label="No scored defect" selected={defect === null} disabled={readOnly} onPress={() => edit(r => ({ ...r, scored_defect: null }))} />
          {['taint', 'fault'].map(kind => <Choice key={kind} label={kind === 'taint' ? 'Taint · 2' : 'Fault · 4'} selected={defect?.kind === kind} disabled={readOnly}
            onPress={() => edit(r => ({ ...r, scored_defect: { kind, description: r.scored_defect?.description || '', affected_cups: r.scored_defect?.affected_cups || [] } }))} />)}
        </View>
        {defect && <><TextInput value={defect.description} onChangeText={value => edit(r => ({ ...r, scored_defect: { ...r.scored_defect, description: value } }))}
          placeholder="Describe the defect" placeholderTextColor={colors.inkSoft} accessibilityLabel="Scored defect description" editable={!readOnly} style={styles.input} />
          <CupSet label="Affected cups" value={defect.affected_cups} count={n}
            readOnly={readOnly}
            onChange={value => edit(r => ({ ...r, scored_defect: { ...r.scored_defect, affected_cups: value || [] } }))} />
          {Array.isArray(response.clean_cups) && defect.affected_cups.some(cup => response.clean_cups.includes(cup)) ?
            <Text style={styles.error}>Affected cups cannot also be marked Clean Cup. Change one of those judgments.</Text> : null}
        </>}
      </View>

      <View style={styles.section}><Text style={styles.sectionTitle}>Optional observations</Text>
        <Text style={styles.rowLabel}>Roast shade (paper-form position)</Text>
        <View style={styles.wrap}>{[1,2,3,4].map(value => <Choice key={value} label={String(value)} selected={response.roast_shade_tick === value} disabled={readOnly}
          accessibilityLabel={`Roast shade position ${value} of 4`} onPress={() => edit(r => ({ ...r, roast_shade_tick: r.roast_shade_tick === value ? null : value }))} />)}</View>
        {OPTIONAL_TICKS.map(([key, label]) => <View key={key} style={styles.observation}><Text style={styles.rowLabel}>{label}</Text><View style={styles.wrap}>
          {[1,2,3,4,5].map(value => <Choice key={value} label={String(value)} selected={response[key] === value} disabled={readOnly} accessibilityLabel={`${label} ${value} of 5`}
            onPress={() => edit(r => ({ ...r, [key]: r[key] === value ? null : value }))} />)}
        </View></View>)}
        {OPTIONAL_TEXT.map(([key, label]) => <View key={key} style={styles.observation}><Text style={styles.rowLabel}>{label}</Text>
          <TextInput value={response[key] || ''} onChangeText={value => edit(r => ({ ...r, [key]: value }))} multiline editable={!readOnly}
            placeholder={`Add ${label.toLowerCase()}`} placeholderTextColor={colors.inkSoft} accessibilityLabel={label} style={styles.input} />
        </View>)}
      </View>

      {errors.length > 0 && <View style={styles.section}><Text style={styles.error}>Assessment needs attention:</Text><Text style={styles.error}>{errorText(errors)}</Text></View>}
      {result?.ok ? <View style={styles.section}><Text style={styles.sectionTitle}>Legacy result</Text>
        {QUALITY.map(([key, label]) => <Text key={key} style={styles.resultRow}>{label}: {scoreText(response.quality_ratings[key])}</Text>)}
        <Text style={styles.resultRow}>Uniformity: {(result.components.uniformity.numerator / result.components.uniformity.denominator).toFixed(2)}</Text>
        <Text style={styles.resultRow}>Sweetness: {(result.components.sweetness.numerator / result.components.sweetness.denominator).toFixed(2)}</Text>
        <Text style={styles.resultRow}>Clean Cup: {(result.components.clean_cup.numerator / result.components.clean_cup.denominator).toFixed(2)}</Text>
        <Text style={styles.resultRow}>Defect deduction: −{(result.components.defect_deduction.numerator / result.components.defect_deduction.denominator).toFixed(2)}</Text>
        <Text style={styles.total}>{result.display_score}</Text><Text style={styles.hint}>{result.label}</Text>
      </View> : <Text style={styles.hint}>No final score until this assessment is complete.</Text>}
      {message ? <Text style={styles.hint}>{message}</Text> : null}
      {!readOnly ? <Pressable onPress={complete} accessibilityRole="button" accessibilityLabel="Complete Legacy assessment and calculate result" style={styles.completeButton}>
        <Text style={styles.completeText}>COMPLETE & SCORE</Text>
      </Pressable> : null}
    </ScrollView>
    <Modal visible={Boolean(qualityField)} transparent animationType="fade" onRequestClose={() => setQualityField(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
        <Text style={styles.sectionTitle}>{QUALITY.find(([key]) => key === qualityField)?.[1] || 'Quality mark'}</Text>
        <Text style={styles.hint}>Select one quarter-point mark from 6.00 to 9.75.</Text>
        <View style={styles.grid}>{QUALITY_MARKS.map(mark => <Choice key={mark} label={scoreText(mark)} selected={response.quality_ratings?.[qualityField] === mark}
          onPress={() => { edit(r => ({ ...r, quality_ratings: { ...(r.quality_ratings || {}), [qualityField]: mark } })); setQualityField(null); }} />)}</View>
        <Pressable onPress={() => setQualityField(null)} accessibilityRole="button" accessibilityLabel="Close quality marks" style={styles.closeButton}><Text style={styles.rowLabel}>Close</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  heading: { ...typography.text_screen_title, color: colors.ink },
  section: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  sectionTitle: { ...typography.text_section_title, color: colors.ink },
  hint: { ...typography.text_secondary_body, color: colors.inkSoft },
  row: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { ...typography.text_body, color: colors.ink },
  rowValue: { ...typography.text_body, color: colors.action },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minWidth: 54, minHeight: 44, paddingHorizontal: spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  choiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceDisabled: { opacity: 0.7 },
  choiceText: { ...typography.text_secondary_body, color: colors.ink },
  choiceTextSelected: { color: colors.surface },
  input: { minHeight: 56, padding: spacing.sm, backgroundColor: colors.input, borderRadius: 8, ...typography.text_body, color: colors.ink, textAlignVertical: 'top' },
  observation: { gap: spacing.xs },
  error: { ...typography.text_secondary_body, color: colors.danger },
  resultRow: { ...typography.text_secondary_body, color: colors.ink },
  total: { ...typography.text_primary_metric, color: colors.ink },
  completeButton: { minHeight: 56, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  completeText: { ...typography.text_button_primary, color: colors.surface },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing.md },
  modalPanel: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
