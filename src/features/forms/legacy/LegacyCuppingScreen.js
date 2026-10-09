import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { Header } from '../../../components/ui/Header';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getLegacyResponse, saveLegacyResponse } from '../../../data/sessionRepository';
import { ORDINARY_MARKS, LOWER_MARKS, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText } from './legacyQualityPresentation';

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
const errorText = errors => (errors || []).map(error => {
  if (error.startsWith('quality_ratings.')) {
    const field = error.split(':')[0].split('.')[1];
    return `Choose a quarter-point mark for ${QUALITY.find(([key]) => key === field)?.[1] || 'each quality rating'}.`;
  }
  if (error.startsWith('quality_ratings:')) return 'Choose all seven quality ratings.';
  if (error.startsWith('consistent_cups:')) return 'Assess Uniformity for each cup.';
  if (error.startsWith('sweet_cups:')) return 'Assess Sweetness for each cup.';
  if (error.startsWith('clean_cups:')) return 'Assess Clean Cup for each cup.';
  if (error === 'scored_defect:unassessed') return 'Choose No scored defect, Taint, or Fault.';
  if (error === 'scored_defect.description:required') return 'Describe the scored defect.';
  if (error === 'scored_defect.affected_cups:empty' || error === 'scored_defect.affected_cups:unassessed') return 'Select at least one cup affected by the scored defect.';
  if (error === 'scored_defect.affected_cups:marked_clean') return 'A scored-defect cup cannot also be marked Clean Cup.';
  if (error === 'session:complete_read_only') return 'This Session is complete. Reset it to Pending before editing.';
  return 'Some assessment data could not be saved. Reopen this Session and review its saved form.';
}).filter((message, index, list) => list.indexOf(message) === index).join('\n');

function Choice({ label, selected, onPress, disabled = false, accessibilityLabel = label, role = 'button' }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={role} accessibilityLabel={accessibilityLabel}
    accessibilityState={role === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.choiceDisabled]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

function QualityRuler({ label, value, onPress, disabled }) {
  const isLow = value != null && value < 24;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityState={{ disabled }} accessibilityLabel={`${label}, ${value == null ? 'not assessed' : `${scoreText(value)}${isExtendedMark(value) ? ', Cup App extended range' : ''}`}, choose exact quarter-point mark`}
    style={styles.qualityRow}>
    <View style={styles.qualityTitleRow}><Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value == null ? 'Choose mark' : scoreText(value)}</Text></View>
    <View style={styles.rulerTicks}>{ORDINARY_MARKS.map(mark => <View key={mark} style={[styles.rulerTick,
      mark % 4 === 0 && styles.rulerMajorTick, value === mark && styles.rulerSelectedTick]} />)}</View>
    <View style={styles.rulerLabels}>{[6, 7, 8, 9, 10].map(mark => <Text key={mark} style={styles.rulerLabel}>{mark}</Text>)}</View>
    {isLow ? <Text style={styles.hint}>Selected below ruler range: {scoreText(value)} · Cup App extended range</Text> : null}
    {value === 40 ? <Text style={styles.hint}>10.00 · Cup App extended range</Text> : null}
  </Pressable>;
}

function CupSet({ label, value, count, onChange, fixed = false, readOnly = false }) {
  const selected = Array.isArray(value) ? value : [];
  const affected = label === 'Affected cups';
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>{label}</Text>
    <Text style={styles.hint}>{fixed ? 'One cup: Uniformity is always 10.' : value == null ? 'Not assessed yet' : selected.length ? `${selected.length} of ${count} cups` : affected ? 'Choose at least one affected cup' : 'Assessed: none qualify'}</Text>
    <View style={styles.wrap}>{Array.from({ length: count }, (_, i) => i + 1).map(cup =>
      <Choice key={cup} label={`Cup ${cup}`} role="checkbox" accessibilityLabel={affected ? `Affected cup ${cup}` : `${label}, cup ${cup}`}
        selected={selected.includes(cup)} disabled={fixed || readOnly} onPress={() => onChange(selected.includes(cup) ? selected.filter(n => n !== cup) : [...selected, cup].sort((a,b) => a-b))} />
    )}</View>
    {!fixed && !affected && <View style={styles.wrap}>
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
  const [showLowerScores, setShowLowerScores] = useState(false);
  const [expandedSection, setExpandedSection] = useState('quality');
  const [showResultBreakdown, setShowResultBreakdown] = useState(false);
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
        setMessage('Review the items listed below before a final score is available. Your draft remains saved.');
        const first = saved.errors?.[0] || '';
        setExpandedSection(first.startsWith('quality_ratings') ? 'quality'
          : first.startsWith('scored_defect') ? 'defect'
          : ['consistent_cups', 'sweet_cups', 'clean_cups'].some(key => first.startsWith(key)) ? 'cups' : 'quality');
        return;
      }
      setErrors([]);
      setResult(saved.result);
      setMessage('Legacy assessment completed and saved locally.');
    } catch (error) { setMessage(error?.message || 'Could not complete the assessment.'); }
  };

  if (loading || !response) return <View style={styles.screen}><Header title="SCA Legacy" variant="back" onBackPress={onBackPress} /><Text style={styles.hint}>{message || 'Loading saved assessment…'}</Text></View>;
  const defect = response.scored_defect;
  const assessedQualityCount = QUALITY.filter(([key]) => response.quality_ratings?.[key] != null).length;
  const openQuality = key => { setShowLowerScores(revealLowerForSelected(response.quality_ratings?.[key])); setQualityField(key); };
  return <View style={styles.screen}>
    <Header title="SCA Legacy" variant="back" onBackPress={onBackPress} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[styles.content, { paddingHorizontal: 24 * scale }]}>
      <Text style={styles.heading}>{coffeeNameOrigin || 'Sample'}</Text>
      <Text style={styles.hint}>SCA Legacy (2004–2023) · Open Cupping · {n} {n === 1 ? 'cup' : 'cups'}</Text>
      <Text style={styles.hint}>Tap a ruler to choose an exact quarter-point mark. Your draft is saved on this device as you go.</Text>
      {readOnly ? <Text style={styles.hint}>This Session is complete. Its Legacy result is read-only; reset the Session to Pending before editing.</Text> : null}
      {message ? <Text style={styles.hint} accessibilityLiveRegion="polite">{message}</Text> : null}

      <Pressable onPress={() => setExpandedSection(expandedSection === 'quality' ? null : 'quality')} accessibilityRole="button"
        accessibilityState={{ expanded: expandedSection === 'quality' }} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quality ratings</Text><Text style={styles.hint}>{assessedQualityCount}/7 · {expandedSection === 'quality' ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expandedSection === 'quality' ? QUALITY.map(([key, label]) => <QualityRuler key={key} label={label} value={response.quality_ratings?.[key]}
        onPress={() => openQuality(key)} disabled={readOnly} />) : null}

      <Pressable onPress={() => setExpandedSection(expandedSection === 'cups' ? null : 'cups')} accessibilityRole="button"
        accessibilityState={{ expanded: expandedSection === 'cups' }} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Cup-by-cup checks</Text><Text style={styles.hint}>{expandedSection === 'cups' ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expandedSection === 'cups' ? <>
      <CupSet label="Uniformity" value={n === 1 ? [1] : response.consistent_cups} count={n} fixed={n === 1} readOnly={readOnly} onChange={value => edit(r => ({ ...r, consistent_cups: value }))} />
      <CupSet label="Sweetness" value={response.sweet_cups} count={n} readOnly={readOnly} onChange={value => edit(r => ({ ...r, sweet_cups: value }))} />
      <CupSet label="Clean Cup" value={response.clean_cups} count={n} readOnly={readOnly} onChange={value => edit(r => ({ ...r, clean_cups: value }))} />
      </> : null}

      <Pressable onPress={() => setExpandedSection(expandedSection === 'defect' ? null : 'defect')} accessibilityRole="button"
        accessibilityState={{ expanded: expandedSection === 'defect' }} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>One scored defect</Text><Text style={styles.hint}>{defect === null ? 'None' : defect?.kind || 'Not assessed'} · {expandedSection === 'defect' ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expandedSection === 'defect' ? <View style={styles.section}>
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
      </View> : null}

      <Pressable onPress={() => setExpandedSection(expandedSection === 'optional' ? null : 'optional')} accessibilityRole="button"
        accessibilityState={{ expanded: expandedSection === 'optional' }} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Optional observations</Text><Text style={styles.hint}>{expandedSection === 'optional' ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expandedSection === 'optional' ? <View style={styles.section}>
        <Text style={styles.rowLabel}>Roast shade (paper-form position)</Text>
        <View style={styles.wrap}>{[1,2,3,4].map(value => <Choice key={value} label={String(value)} selected={response.roast_shade_tick === value} disabled={readOnly}
          accessibilityLabel={`Roast shade position ${value} of 4`} onPress={() => edit(r => ({ ...r, roast_shade_tick: r.roast_shade_tick === value ? null : value }))} />)}</View>
        {OPTIONAL_TICKS.map(([key, label]) => <View key={key} style={styles.observation}><Text style={styles.rowLabel}>{label}</Text><View style={styles.wrap}>
          {[1,2,3,4,5].map(value => <Choice key={value} label={String(value)} selected={response[key] === value} disabled={readOnly} accessibilityLabel={`${label} ${value} of 5`}
            onPress={() => edit(r => ({ ...r, [key]: r[key] === value ? null : value }))} />)}
        </View></View>)}
        {OPTIONAL_TEXT.map(([key, label]) => <View key={key} style={styles.observation}><Text style={styles.rowLabel}>{label}</Text>
          <TextInput value={response[key] || ''} onChangeText={value => edit(r => ({ ...r, [key]: value }))} multiline editable={!readOnly}
            returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={Keyboard.dismiss}
            placeholder={`Add ${label.toLowerCase()}`} placeholderTextColor={colors.inkSoft} accessibilityLabel={label} style={styles.input} />
        </View>)}
      </View> : null}

      {errors.length > 0 && <View style={styles.section}><Text style={styles.error}>Assessment needs attention:</Text><Text style={styles.error}>{errorText(errors)}</Text></View>}
      {result?.ok ? <View style={styles.resultCard}><Text style={styles.sectionTitle}>Legacy result</Text>
        <Text style={styles.total}>{result.display_score}</Text><Text style={styles.hint}>{result.label}</Text>
        <Text style={styles.hint}>SCA Legacy · version {result.identity.form_version}</Text>
        {result.quality_scale_provenance?.outside_published_table_fields?.length ? <Text style={styles.hint}>{result.quality_scale_provenance.note}</Text> : null}
        <Pressable onPress={() => setShowResultBreakdown(!showResultBreakdown)} accessibilityRole="button"
          accessibilityState={{ expanded: showResultBreakdown }} style={styles.sectionHeader}>
          <Text style={styles.rowValue}>{showResultBreakdown ? 'Hide score breakdown' : 'Show score breakdown'}</Text></Pressable>
        {showResultBreakdown ? <View style={styles.breakdown}>
          {QUALITY.map(([key, label]) => <Text key={key} style={styles.resultRow}>{label}: {scoreText(response.quality_ratings[key])}</Text>)}
          <Text style={styles.resultRow}>Uniformity: {(result.components.uniformity.numerator / result.components.uniformity.denominator).toFixed(2)}</Text>
          <Text style={styles.resultRow}>Sweetness: {(result.components.sweetness.numerator / result.components.sweetness.denominator).toFixed(2)}</Text>
          <Text style={styles.resultRow}>Clean Cup: {(result.components.clean_cup.numerator / result.components.clean_cup.denominator).toFixed(2)}</Text>
          <Text style={styles.resultRow}>Defect deduction: {defectDeductionText(result.components.defect_deduction)}</Text>
        </View> : null}
      </View> : <Text style={styles.hint}>No final score until this assessment is complete.</Text>}
      {!readOnly && !result?.ok ? <Pressable onPress={complete} accessibilityRole="button" accessibilityLabel="Complete Legacy assessment and calculate result" style={styles.completeButton}>
        <Text style={styles.completeText}>COMPLETE & SCORE</Text>
      </Pressable> : null}
      {result?.ok && !readOnly ? <Text style={styles.hint}>Assessment saved. Change a mark to revise this result while the Session is Pending.</Text> : null}
    </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={Boolean(qualityField)} transparent animationType="fade" onRequestClose={() => setQualityField(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{QUALITY.find(([key]) => key === qualityField)?.[1] || 'Quality mark'}</Text>
          <Pressable onPress={() => setQualityField(null)} accessibilityRole="button" accessibilityLabel="Close quality marks" style={styles.modalClose}><Text style={styles.rowLabel}>Close</Text></Pressable></View>
        <Text style={styles.hint}>Choose an exact quarter-point mark. 6.00–9.75 is the protocol's printed table; other values are a Cup App extension.</Text>
        <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.selectorScroll}>
        <View style={styles.grid}>{ORDINARY_MARKS.map(mark => <Choice key={mark} label={scoreText(mark)} selected={response.quality_ratings?.[qualityField] === mark}
          onPress={() => { edit(r => ({ ...r, quality_ratings: { ...(r.quality_ratings || {}), [qualityField]: mark } })); setQualityField(null); }} />)}</View>
        <Pressable onPress={() => setShowLowerScores(!showLowerScores)} accessibilityRole="button" accessibilityState={{ expanded: showLowerScores }} style={styles.lowerToggle}>
          <Text style={styles.rowValue}>{showLowerScores ? 'Hide lower scores' : 'Show lower scores (0.00–5.75)'}</Text></Pressable>
        {showLowerScores ? <View style={styles.grid}>{LOWER_MARKS.map(mark => <Choice key={mark} label={scoreText(mark)} selected={response.quality_ratings?.[qualityField] === mark}
          onPress={() => { edit(r => ({ ...r, quality_ratings: { ...(r.quality_ratings || {}), [qualityField]: mark } })); setQualityField(null); }} />)}</View> : null}
        </ScrollView>
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
  qualityRow: { minHeight: 90, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center', gap: spacing.xs },
  qualityTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rulerTicks: { height: 18, borderBottomWidth: 1, borderBottomColor: colors.ink, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  rulerTick: { width: 1, height: 8, backgroundColor: colors.inkSoft },
  rulerMajorTick: { height: 15, backgroundColor: colors.ink },
  rulerSelectedTick: { width: 3, height: 18, backgroundColor: colors.action },
  rulerLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  rulerLabel: { ...typography.text_caption, color: colors.inkSoft },
  sectionHeader: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
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
  resultCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  breakdown: { gap: spacing.xs },
  total: { ...typography.text_primary_metric, color: colors.ink },
  completeButton: { minHeight: 56, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  completeText: { ...typography.text_button_primary, color: colors.surface },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing.md },
  modalPanel: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.sm, maxHeight: '85%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  selectorScroll: { gap: spacing.sm, paddingBottom: spacing.sm },
  modalClose: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  lowerToggle: { minHeight: 44, justifyContent: 'center' },
});
