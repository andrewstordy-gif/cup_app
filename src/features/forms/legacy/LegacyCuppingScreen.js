import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { Header } from '../../../components/ui/Header';
import { AppIcon } from '../../../components/ui/AppIcon';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getLegacyResponse, saveLegacyResponse } from '../../../data/sessionRepository';
import { getProcessLabel } from '../../cupping/constants/sessionDetails';
import { PROFILE, resolveForm, scoreResponse } from '../contract';
import { ORDINARY_MARKS, visibleMarks, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText } from './legacyQualityPresentation';

const QUALITY = [
  ['fragrance_aroma', 'Fragrance / Aroma'], ['flavor', 'Flavour'], ['aftertaste', 'Aftertaste'],
  ['acidity', 'Acidity'], ['body', 'Body'], ['balance', 'Balance'], ['overall', 'Overall'],
];
const DEFECT_SUGGESTIONS = ['Potato', 'Mouldy', 'Phenolic'];
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
  if (error === 'session:form_or_sample_changed') return 'The Session or sample changed while saving. Reopen it before editing; your previous saved response is unchanged.';
  if (error === 'response:stored_identity_mismatch') return 'This saved Legacy response uses a different form or cup count. It is read-only; start a new Session instead.';
  return 'Some assessment data could not be saved. Reopen this Session and review its saved form.';
}).filter((message, index, list) => list.indexOf(message) === index).join('\n');

function Choice({ label, selected, onPress, disabled = false, accessibilityLabel = label, role = 'button', style }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={role} accessibilityLabel={accessibilityLabel}
    accessibilityState={role === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }} style={[styles.choice, style, selected && styles.choiceSelected, disabled && styles.choiceDisabled]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

function QualityRuler({ label, value, onPress, disabled }) {
  const isLow = value != null && value < 24;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityState={{ disabled }} accessibilityLabel={`${label}, ${value == null ? 'not assessed' : `${scoreText(value)}${isExtendedMark(value) ? ', Cup App extended range' : ''}`}, choose exact quarter-point mark`}
    style={styles.qualityRow}>
    <View style={styles.qualityTitleRow}><Text style={styles.sectionTitle}>{label}</Text>
      <Text style={styles.rowValue}>{value == null ? 'Choose mark' : scoreText(value)}</Text></View>
    <View style={styles.rulerTicks}>{ORDINARY_MARKS.map(mark => <View key={mark} style={[styles.rulerTick,
      mark % 4 === 0 && styles.rulerMajorTick, value === mark && styles.rulerSelectedTick]} />)}</View>
    <View style={styles.rulerLabels}>{[6, 7, 8, 9, 10].map(mark => <Text key={mark} style={styles.rulerLabel}>{mark}</Text>)}</View>
    {isLow ? <Text style={styles.hint}>Selected below ruler range: {scoreText(value)} · Cup App extended range</Text> : null}
    {value === 40 ? <Text style={styles.hint}>10.00 · Cup App extended range</Text> : null}
  </Pressable>;
}

function CupSet({ label, value, count, onChange, fixed = false, readOnly = false, score = null, disabledHint = null }) {
  const selected = Array.isArray(value) ? value : [];
  const affected = label === 'Defective cups';
  return <View style={styles.checkSection}>
    <View style={styles.qualityTitleRow}><Text style={styles.sectionTitle}>{label}</Text>{score != null && <Text style={styles.rowValue}>{score}</Text>}</View>
    <Text style={styles.hint}>{disabledHint || (fixed ? 'One cup: Uniformity is always 10.' : value == null ? 'Not assessed yet' : selected.length ? `${selected.length} of ${count} cups` : affected ? 'Choose at least one defective cup' : 'Assessed: none qualify')}</Text>
    <View style={styles.wrap}>{Array.from({ length: count }, (_, i) => i + 1).map(cup =>
      <Choice key={cup} label={String(cup)} role="checkbox" style={styles.cupChoice} accessibilityLabel={affected ? `Defective cup ${cup}` : `${label}, cup ${cup}`}
        selected={selected.includes(cup)} disabled={fixed || readOnly} onPress={() => onChange(selected.includes(cup) ? selected.filter(n => n !== cup) : [...selected, cup].sort((a,b) => a-b))} />
    )}</View>
    {!fixed && !affected && <View style={styles.wrap}>
      <Choice label="None qualify" selected={Array.isArray(value) && value.length === 0} disabled={readOnly} onPress={() => onChange([])} />
      <Choice label="Not assessed" selected={value == null} disabled={readOnly} onPress={() => onChange(null)} />
    </View>}
  </View>;
}

function VerticalRuler({ label, value, onChange, readOnly, lowLabel, highLabel }) {
  return <View style={styles.verticalGroup}>
    <Text style={styles.hint}>{label}</Text>
    <View style={styles.verticalRow}>
      <View style={styles.verticalTrack}><View pointerEvents="none" style={styles.verticalSpine} />{[5, 4, 3, 2, 1].map(mark => <Pressable key={mark}
        onPress={() => onChange(value === mark ? null : mark)} disabled={readOnly}
        accessibilityRole="button" accessibilityLabel={`${label} ${mark} of 5`}
        accessibilityState={{ selected: value === mark, disabled: readOnly }}
        style={[styles.verticalTick, value === mark && styles.verticalTickSelected]} />)}</View>
      {(highLabel || lowLabel) && <View style={styles.verticalLabels}><Text style={styles.hint}>{highLabel}</Text><Text style={styles.hint}>{lowLabel}</Text></View>}
    </View>
  </View>;
}

function NotesField({ label, value, onChange, readOnly, placeholder }) {
  return <View style={styles.observation}><Text style={styles.rowLabel}>{label}</Text><TextInput
    value={value || ''} onChangeText={onChange} multiline editable={!readOnly} returnKeyType="done"
    submitBehavior="blurAndSubmit" onSubmitEditing={Keyboard.dismiss} placeholder={placeholder || `Add ${label.toLowerCase()}`}
    placeholderTextColor={colors.inkSoft} accessibilityLabel={label} style={styles.input} /></View>;
}

function componentScore(value, n, oneCupUniformity = false) {
  if (oneCupUniformity && n === 1) return '10.00';
  return Array.isArray(value) ? (10 * value.length / n).toFixed(2) : '—';
}

export function LegacyCuppingScreen({ sessionId, sampleId, cupCount, coffeeNameOrigin, process, sampleNumber, cupIndex, cupStatus, onBackPress, onScanPress }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const scoreChoiceWidth = Math.max(44, (width - 4 * spacing.md - 3 * spacing.xs) / 4);
  const n = Number(cupCount);
  const [response, setResponse] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [qualityField, setQualityField] = useState(null);
  const [showLowerScores, setShowLowerScores] = useState(false);
  const [defectsOpen, setDefectsOpen] = useState(false);
  const [showResultBreakdown, setShowResultBreakdown] = useState(false);
  const [showOtherObservations, setShowOtherObservations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const queue = useRef(Promise.resolve());
  const completion = useRef(Promise.resolve(true));
  const responseRef = useRef(null);
  const selectorScroll = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLegacyResponse(sessionId, sampleId).then(saved => {
      if (cancelled) return;
      const loaded = saved?.response || { quality_ratings: {}, consistent_cups: n === 1 ? [1] : null };
      responseRef.current = loaded;
      setResponse(loaded);
      setResult(saved?.result || null);
      setReadOnly(Boolean(saved?.sessionComplete));
      setErrors(saved?.errors || []);
      setLoading(false);
    }).catch(error => { if (!cancelled) { setMessage(error?.message || 'Could not load Legacy response.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [sessionId, sampleId, n]);

  const edit = change => {
    if (!responseRef.current || readOnly) return;
    const next = change(responseRef.current);
    responseRef.current = next;
    setResponse(next);
    setResult(null);
    setErrors([]);
    completion.current = Promise.resolve(true);
    setMessage('Saving draft locally…');
    queue.current = queue.current.catch(() => {}).then(() => saveLegacyResponse({ sessionId, sampleId, response: next, complete: false }))
      .then(saved => {
        if (saved.ok) setMessage('Draft saved locally.');
        else setMessage(`Could not save draft: ${errorText(saved.errors)}`);
        return saved;
      }).catch(error => { setMessage(error?.message || 'Could not save draft.'); return { ok: false, errors: ['draft:save_failed'] }; });
  };

  const complete = async () => {
    if (!response || readOnly) return;
    await queue.current;
    try {
      const saved = await saveLegacyResponse({ sessionId, sampleId, response: responseRef.current, complete: true });
      if (!saved.ok) {
        setErrors(saved.errors);
        setMessage('Review the items listed below before a final score is available. Your draft remains saved.');
        const first = saved.errors?.[0] || '';
        if (first.startsWith('scored_defect')) setDefectsOpen(true);
        return false;
      }
      setErrors([]);
      setResult(saved.result);
      setMessage('Legacy assessment completed and saved locally.');
      return true;
    } catch (error) { setMessage(error?.message || 'Could not complete the assessment.'); return false; }
  };

  const scanNextCup = async () => {
    if (!(await completion.current)) return;
    const saved = await queue.current;
    if (saved && !saved.ok) {
      setMessage(`Could not save draft: ${errorText(saved.errors)} Scan was not started.`);
      return;
    }
    if (typeof onScanPress === 'function') onScanPress();
  };

  if (loading || !response) return <View style={styles.screen}><Header title="SCA Legacy" variant="back" onBackPress={onBackPress} /><Text style={styles.hint}>{message || 'Loading saved assessment…'}</Text></View>;
  const defect = response.scored_defect;
  const form = resolveForm(PROFILE, 2);
  const liveResult = form.ok ? scoreResponse({ profile: PROFILE, f: 2, identity: form.identity, cup_count: n, response },
    { profile: PROFILE, f: 2, identity: form.identity }) : null;
  const displayedResult = result?.ok ? result : liveResult?.ok ? liveResult : null;
  const defectDeduction = defect?.kind && Array.isArray(defect.affected_cups)
    ? defectDeductionText({ numerator: (defect.kind === 'taint' ? 2 : 4) * defect.affected_cups.length * 5, denominator: n }) : '0.00';
  const displaySampleNumber = Number(sampleNumber) || (Number(cupIndex) || 0) + 1;
  const measuredTemperature = Number.parseFloat(cupStatus?.temp);
  const temperatureText = cupStatus?.temp != null && cupStatus?.temp !== 'N/A' && Number.isFinite(measuredTemperature)
    ? `${Math.round(measuredTemperature)} °C` : null;
  const openQuality = key => {
    setShowLowerScores(revealLowerForSelected(response.quality_ratings?.[key]));
    selectorScroll.current?.scrollTo({ y: 0, animated: false });
    setQualityField(key);
  };
  const resultSummary = result?.ok ? <View style={styles.resultCard}><Text style={styles.sectionTitle}>Legacy result</Text>
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
  </View> : null;
  return <View style={styles.screen}>
    <Header variant="back" onBackPress={onBackPress} titleContent={<Text style={styles.headerNumber}>{displaySampleNumber}</Text>}
      rightContent={temperatureText ? <Text style={styles.headerTemperature}>{temperatureText}</Text> : <Text style={styles.headerUnavailable}>— °C</Text>} sideWidth={88} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[styles.content, { paddingHorizontal: 24 * scale }]}>
      <View style={styles.sampleIdentity}><Text style={styles.heading}>{coffeeNameOrigin || 'Sample'}</Text>
        <Text style={styles.hint}>{process ? `${getProcessLabel(process)} · ` : ''}SCA Legacy (2004–2023) · Open Cupping · {n} {n === 1 ? 'cup' : 'cups'}</Text></View>
      <Text style={styles.hint}>Tap a ruler to choose an exact quarter-point mark. Your draft saves on this device as you go.</Text>
      {readOnly ? <Text style={styles.hint}>This Session is complete. Its Legacy result is read-only; reset the Session to Pending before editing.</Text> : null}
      {message ? <Text style={styles.hint} accessibilityLiveRegion="polite">{message}</Text> : null}
      {resultSummary}
      {QUALITY.map(([key, label]) => <View key={key}>
        <QualityRuler label={label} value={response.quality_ratings?.[key]} onPress={() => openQuality(key)} disabled={readOnly} />
        {key === 'fragrance_aroma' && <View style={styles.fragranceExtras}>
          <Text style={styles.hint}>Intensity</Text><View style={styles.intensityPair}>
            <VerticalRuler label="Dry" value={response.dry_aroma_intensity} readOnly={readOnly} onChange={value => edit(r => ({ ...r, dry_aroma_intensity: value }))} />
            <VerticalRuler label="Break" value={response.break_aroma_intensity} readOnly={readOnly} onChange={value => edit(r => ({ ...r, break_aroma_intensity: value }))} />
          </View><NotesField label="Qualities" value={response.aroma_qualities} readOnly={readOnly} onChange={value => edit(r => ({ ...r, aroma_qualities: value }))} />
        </View>}
        {key === 'acidity' && <VerticalRuler label="Intensity" highLabel="High" lowLabel="Low" value={response.acidity_intensity} readOnly={readOnly} onChange={value => edit(r => ({ ...r, acidity_intensity: value }))} />}
        {key === 'body' && <VerticalRuler label="Level" highLabel="Heavy" lowLabel="Thin" value={response.body_level} readOnly={readOnly} onChange={value => edit(r => ({ ...r, body_level: value }))} />}
      </View>)}
      <CupSet label="Uniformity" score={componentScore(response.consistent_cups, n, true)} value={n === 1 ? [1] : response.consistent_cups} count={n} fixed={n === 1} readOnly={readOnly} onChange={value => edit(r => ({ ...r, consistent_cups: value }))} />
      <CupSet label="Sweetness" score={componentScore(response.sweet_cups, n)} value={response.sweet_cups} count={n} readOnly={readOnly} onChange={value => edit(r => ({ ...r, sweet_cups: value }))} />
      <CupSet label="Clean Cup" score={componentScore(response.clean_cups, n)} value={response.clean_cups} count={n} readOnly={readOnly} onChange={value => edit(r => ({ ...r, clean_cups: value }))} />
      <NotesField label="Flavour Notes" value={response.notes} readOnly={readOnly} onChange={value => edit(r => ({ ...r, notes: value }))} />
      <Pressable onPress={() => setShowOtherObservations(!showOtherObservations)} accessibilityRole="button"
        accessibilityState={{ expanded: showOtherObservations }} style={styles.sectionHeader}>
        <Text style={styles.rowLabel}>Other observations</Text><Text style={styles.hint}>{showOtherObservations ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {showOtherObservations ? <View style={styles.section}>
        <Text style={styles.rowLabel}>Roast shade (paper-form position)</Text>
        <View style={styles.wrap}>{[1,2,3,4].map(value => <Choice key={value} label={String(value)} selected={response.roast_shade_tick === value} disabled={readOnly}
          accessibilityLabel={`Roast shade position ${value} of 4`} onPress={() => edit(r => ({ ...r, roast_shade_tick: r.roast_shade_tick === value ? null : value }))} />)}</View>
        <VerticalRuler label="Wet aroma intensity" value={response.wet_aroma_intensity} readOnly={readOnly} onChange={value => edit(r => ({ ...r, wet_aroma_intensity: value }))} />
        <NotesField label="Roast level note" value={response.roast_level_note} readOnly={readOnly} onChange={value => edit(r => ({ ...r, roast_level_note: value }))} />
      </View> : null}

      {errors.length > 0 && <View style={styles.section}><Text style={styles.error}>Assessment needs attention:</Text><Text style={styles.error}>{errorText(errors)}</Text></View>}
      {!displayedResult?.ok ? <Text style={styles.hint}>Overall score — Complete all required marks and checks to see a score.</Text> : null}
      {!readOnly && !result?.ok ? <Pressable onPress={() => { completion.current = complete(); }} accessibilityRole="button" accessibilityLabel="Complete Legacy assessment and calculate result" style={styles.completeButton}>
        <Text style={styles.completeText}>COMPLETE & SCORE</Text>
      </Pressable> : null}
      {result?.ok && !readOnly ? <Text style={styles.hint}>Assessment saved. Change a mark to revise this result while the Session is Pending.</Text> : null}
    </ScrollView>
    {defectsOpen && <ScrollView style={styles.defectsPanel} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.defectsContent}>
      <CupSet label="Defective cups" value={defect?.affected_cups} count={n} readOnly={readOnly || !defect}
        disabledHint={!defect ? 'Choose Taint or Fault below to select cups.' : null}
        onChange={value => edit(r => ({ ...r, scored_defect: { ...r.scored_defect, affected_cups: value } }))} />
      <View style={styles.observation}><Text style={styles.sectionTitle}>Classification</Text><View style={styles.wrap}>
        <Choice label="Not assessed" selected={defect === undefined} disabled={readOnly} onPress={() => edit(r => { const { scored_defect, ...rest } = r; return rest; })} />
        <Choice label="None" selected={defect === null} disabled={readOnly} onPress={() => edit(r => ({ ...r, scored_defect: null }))} />
        {['taint', 'fault'].map(kind => <Choice key={kind} label={kind === 'taint' ? 'Taint · 2' : 'Fault · 4'} selected={defect?.kind === kind} disabled={readOnly}
          onPress={() => edit(r => ({ ...r, scored_defect: { kind, description: r.scored_defect?.description || '', affected_cups: r.scored_defect?.affected_cups || [] } }))} />)}
      </View>{defect === undefined && <Text style={styles.hint}>Not assessed yet</Text>}</View>
      {defect && <>
        <View style={styles.observation}><Text style={styles.sectionTitle}>Defect type</Text><View style={styles.wrap}>
          {DEFECT_SUGGESTIONS.map(suggestion => <Choice key={suggestion} label={suggestion} disabled={readOnly}
            selected={defect.description === suggestion} onPress={() => edit(r => ({ ...r, scored_defect: { ...r.scored_defect, description: suggestion } }))} />)}
        </View></View>
        <NotesField label="Describe the defect" value={defect.description} readOnly={readOnly} placeholder="e.g. sour, rubbery, ferment"
          onChange={value => edit(r => ({ ...r, scored_defect: { ...r.scored_defect, description: value } }))} />
        {Array.isArray(response.clean_cups) && defect.affected_cups.some(cup => response.clean_cups.includes(cup)) ?
          <Text style={styles.error}>Defective cups cannot also be marked Clean Cup. Change one of those judgments.</Text> : null}
      </>}
      <View style={styles.qualityTitleRow}><Text style={styles.rowLabel}>Score deduction</Text><Text style={styles.rowValue}>{defectDeduction}</Text></View>
    </ScrollView>}
    <Pressable onPress={() => setDefectsOpen(!defectsOpen)} accessibilityRole="button" accessibilityLabel={defectsOpen ? 'Close defects drawer' : 'Open defects drawer'}
      accessibilityState={{ expanded: defectsOpen }} style={styles.drawerHeader}><AppIcon name={defectsOpen ? 'chevron-down' : 'chevron-up'} role="icon_compact" /><Text style={styles.sectionTitle}>Defects</Text></Pressable>
    <View style={styles.overallRow} accessibilityLiveRegion="polite"><Text style={styles.sectionTitle}>Overall score</Text><Text style={styles.overallValue}>{displayedResult?.ok ? displayedResult.display_score : '—'}</Text></View>
    {displayedResult?.adapted && <Text style={styles.adaptedLabel}>{displayedResult.label}</Text>}
    {liveResult?.ok && !result?.ok && <Text style={styles.adaptedLabel}>Score preview — complete the assessment to save the final result.</Text>}
    <View style={styles.footer}><Pressable onPress={scanNextCup} disabled={typeof onScanPress !== 'function'} accessibilityRole="button"
      accessibilityLabel="Scan cup" style={[styles.scanButton, typeof onScanPress !== 'function' && styles.choiceDisabled]}>
      <Text style={styles.completeText}>SCAN CUP</Text></Pressable></View>
    </KeyboardAvoidingView>
    <Modal visible={Boolean(qualityField)} transparent animationType="fade" onRequestClose={() => setQualityField(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{QUALITY.find(([key]) => key === qualityField)?.[1] || 'Quality mark'}</Text>
          <Pressable onPress={() => setQualityField(null)} accessibilityRole="button" accessibilityLabel="Close quality marks" style={styles.modalClose}><Text style={styles.rowLabel}>Close</Text></Pressable></View>
        <Text style={styles.hint}>Choose an exact quarter-point mark. 6.00–9.75 is the protocol's printed table; other values are a Cup App extension.</Text>
        {revealLowerForSelected(response.quality_ratings?.[qualityField]) ?
          <View style={styles.selectedLow}><Text style={styles.rowLabel}>Current selection: {scoreText(response.quality_ratings[qualityField])}</Text>
            <Text style={styles.hint}>Cup App extended range · lower scores shown in the grid</Text></View> : null}
        <ScrollView ref={selectorScroll} keyboardShouldPersistTaps="always" contentContainerStyle={styles.selectorScroll}>
        <Pressable onPress={() => { setShowLowerScores(!showLowerScores); selectorScroll.current?.scrollTo({ y: 0, animated: false }); }} accessibilityRole="button" accessibilityState={{ expanded: showLowerScores }} style={styles.lowerToggle}>
          <Text style={styles.rowValue}>{showLowerScores ? 'Hide lower scores' : 'Show lower scores (0.00–5.75)'}</Text></Pressable>
        <View style={styles.grid}>{visibleMarks(showLowerScores).map(mark => <Choice key={mark} style={{ width: scoreChoiceWidth, minWidth: 44 }} label={scoreText(mark)} selected={response.quality_ratings?.[qualityField] === mark}
          onPress={() => { edit(r => ({ ...r, quality_ratings: { ...(r.quality_ratings || {}), [qualityField]: mark } })); setQualityField(null); }} />)}</View>
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
  rulerSelectedTick: { width: 5, height: 18, borderRadius: 3, backgroundColor: colors.action },
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
  cupChoice: { minWidth: 44, width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 0 },
  checkSection: { gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md },
  sampleIdentity: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md, gap: spacing.xs },
  headerNumber: { ...typography.text_screen_title, color: colors.ink },
  headerTemperature: { ...typography.text_screen_title, color: colors.ink },
  headerUnavailable: { ...typography.text_secondary_body, color: colors.inkSoft },
  fragranceExtras: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  intensityPair: { alignSelf: 'center', flexDirection: 'row', gap: spacing.lg },
  verticalGroup: { alignSelf: 'center', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  verticalRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  verticalTrack: { width: 60, borderBottomWidth: 2, borderBottomColor: colors.ink, alignItems: 'center' },
  verticalSpine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.ink },
  verticalTick: { width: 56, height: 44, borderTopWidth: 2, borderTopColor: colors.ink, borderRadius: 2 },
  verticalTickSelected: { borderTopWidth: 5, borderTopColor: colors.action, borderRadius: 3 },
  verticalLabels: { justifyContent: 'space-between', paddingVertical: spacing.sm },
  defectsPanel: { flexGrow: 0, maxHeight: '55%', backgroundColor: colors.surface },
  defectsContent: { padding: spacing.md, gap: spacing.md },
  drawerHeader: { minHeight: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  overallValue: { ...typography.text_secondary_metric, color: colors.ink },
  adaptedLabel: { ...typography.text_secondary_body, color: colors.inkSoft, paddingHorizontal: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  scanButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action },
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
  selectedLow: { backgroundColor: colors.panel, borderRadius: 8, padding: spacing.sm, gap: spacing.xs },
  modalClose: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  lowerToggle: { minHeight: 44, justifyContent: 'center' },
});
