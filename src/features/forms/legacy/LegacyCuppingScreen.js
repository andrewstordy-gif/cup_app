import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { NotesInput } from '../../../components/ui/NotesInput';
import { AssessmentHeader } from '../../cupping/components/AssessmentHeader';
import { AssessmentSampleIdentity } from '../../cupping/components/AssessmentSampleIdentity';
import { AssessmentFormIntro } from '../../cupping/components/AssessmentFormIntro';
import { AssessmentResultSection } from '../../cupping/components/AssessmentResultSection';
import { LocalTastingActions } from '../../cupping/components/LocalTastingActions';
import { AssessmentCupSelector } from '../../cupping/components/AssessmentCupSelector';
import { focusNotesAboveKeyboard } from '../../cupping/components/focusNotesAboveKeyboard';
import { BEAN_DEFECT_OPTIONS, ROAST_DEFECT_OPTIONS, DefectTypeDialog, DesignCDefectTypeItem } from '../../cupping/components/DefectsSection';
import { ScoreBalloons, useScoreBalloons } from '../../cupping/components/ScoreBalloons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { getLegacyResponse, saveLegacyResponse } from '../../../data/sessionRepository';
import { getProcessLabel, normalizeCuppingModeKey } from '../../cupping/constants/sessionDetails';
import { PROFILE, resolveForm, scoreResponse } from '../contract';
import { ORDINARY_MARKS, visibleMarks, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText, unavailableBeanCups } from './legacyQualityPresentation';
import { legacyScoreGridLayout } from './legacyScoreGridLayout';
import { createLegacySaveQueue } from './legacySaveQueue';
import { selectAllQualifyingCups, sameCupSelection } from './legacyCupSelection';

const QUALITY = [
  ['fragrance_aroma', 'Fragrance / Aroma'], ['flavor', 'Flavour'], ['aftertaste', 'Aftertaste'],
  ['acidity', 'Acidity'], ['body', 'Body'], ['balance', 'Balance'], ['overall', 'Overall'],
];
const VERTICAL_FIELDS = {
  dry_aroma_intensity: 'Fragrance / Aroma · Dry intensity',
  break_aroma_intensity: 'Fragrance / Aroma · Break intensity',
  acidity_intensity: 'Acidity intensity',
  body_level: 'Body level',
};
const DEFECT_GROUPS = {
  bean: { field: 'bean_defect_type_masks', options: BEAN_DEFECT_OPTIONS },
  roast: { field: 'roast_defect_type_masks', options: ROAST_DEFECT_OPTIONS },
};
const selectedTypeCups = (masks, options) => Array.from(new Set(options.flatMap(option =>
  Array.isArray(masks?.[option.key]) ? masks[option.key] : []))).sort((a, b) => a - b);
const errorText = errors => (errors || []).map(error => {
  if (error.startsWith('quality_ratings.')) {
    const field = error.split(':')[0].split('.')[1];
    return `Choose a quarter-point mark for ${QUALITY.find(([key]) => key === field)?.[1] || 'each quality rating'}.`;
  }
  if (error.startsWith('quality_ratings:')) return 'Choose all seven quality ratings.';
  if (error.startsWith('consistent_cups:')) return 'Assess Uniformity for each cup.';
  if (error.startsWith('sweet_cups:')) return 'Assess Sweetness for each cup.';
  if (error.startsWith('clean_cups:')) return 'Assess Clean Cup for each cup.';
  if (error === 'scored_defect.kind:invalid_enum') return 'Choose Taint or Fault for the selected defective cups.';
  if (error === 'scored_defect.affected_cups:empty' || error === 'scored_defect.affected_cups:unassessed') return 'Select at least one cup affected by the scored defect.';
  if (error === 'scored_defect.affected_cups:marked_clean') return 'A scored-defect cup cannot also be marked Clean Cup.';
  if (error === 'session:complete_read_only') return 'This Session is complete. Reset it to Pending before editing.';
  if (error === 'session:form_or_sample_changed') return 'The Session or sample changed while saving. Reopen it before editing; your previous saved response is unchanged.';
  if (error === 'response:stored_identity_mismatch') return 'This saved Legacy response uses a different form or cup count. It is read-only; start a new Session instead.';
  return 'Some assessment data could not be saved. Reopen this Session and review its saved form.';
}).filter((message, index, list) => list.indexOf(message) === index).join('\n');

function Choice({ label, selected, onPress, disabled = false, accessibilityLabel = label, role = 'button', style, singleLine = false }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={role} accessibilityLabel={accessibilityLabel}
    accessibilityState={role === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }} style={[styles.choice, style, selected && styles.choiceSelected, disabled && styles.choiceDisabled]}>
    <Text numberOfLines={singleLine ? 1 : undefined} style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

function QualityRuler({ label, value, onPress, disabled, showDivider = true }) {
  const isLow = value != null && value < 24;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityState={{ disabled }} accessibilityLabel={`${label}, ${value == null ? 'not assessed' : `${scoreText(value)}${isExtendedMark(value) ? ', Cup App extended range' : ''}`}, choose exact quarter-point mark`}
    style={[styles.qualityRow, !showDivider && styles.qualityRowWithoutDivider]}>
    <View style={styles.qualityTitleRow}><Text style={styles.sectionTitle}>{label}</Text>
      <Text style={styles.rowValue}>{value == null ? 'Choose mark' : scoreText(value)}</Text></View>
    <View style={styles.rulerTicks}>{ORDINARY_MARKS.map(mark => <View key={mark} style={[styles.rulerTick,
      mark % 4 === 0 && styles.rulerMajorTick, value === mark && styles.rulerSelectedTick]} />)}</View>
    <View style={styles.rulerLabels}>{[6, 7, 8, 9, 10].map(mark => <Text key={mark} style={styles.rulerLabel}>{mark}</Text>)}</View>
    {isLow ? <Text style={styles.hint}>Selected below ruler range: {scoreText(value)} · Cup App extended range</Text> : null}
    {value === 40 ? <Text style={styles.hint}>10.00 · Cup App extended range</Text> : null}
  </Pressable>;
}

function CupSet({ label, value, count, onChange, fixed = false, readOnly = false, score = null, disabledHint = null, scoreAction = false, selectAllCups = null, selectAllHint = null, scale = 1 }) {
  const selected = Array.isArray(value) ? value : [];
  const affected = label === 'Defective cups';
  const zeroAction = label === 'Uniformity' ? 'mark no cups consistent' : 'mark no cups qualifying';
  const zeroHint = label === 'Uniformity' ? 'Assessed: no cups consistent' : 'Assessed: none qualify';
  return <View style={styles.checkSection}>
    <View style={styles.qualityTitleRow}><Text style={styles.sectionTitle}>{label}</Text>{score != null && (scoreAction ?
      <Pressable onPress={() => onChange(value == null ? [] : null)} disabled={readOnly} accessibilityRole="button"
        accessibilityLabel={`${label}, ${value == null ? `not assessed; ${zeroAction}` : `${score} points; clear assessment`}`}
        accessibilityState={{ disabled: readOnly }} style={styles.inlineScoreAction}>
        <Text style={styles.rowValue}>{score}</Text></Pressable> : <Text style={styles.rowValue}>{score}</Text>)}</View>
    <Text style={styles.hint}>{disabledHint || (fixed ? 'One cup: Uniformity is always 10.' : value == null ?
      scoreAction && !readOnly ? 'Not assessed · Tap score to record zero' : 'Not assessed yet' : selected.length ?
      `${selected.length} of ${count} cups` : affected ? 'Choose at least one defective cup' : zeroHint)}</Text>
    <View style={styles.cupSelectorRow}>
      <AssessmentCupSelector label={label} selectedSlots={selected} maxCount={count} onChange={onChange} disabled={fixed || readOnly} scale={scale} />
    </View>
    {selectAllCups && <View style={styles.selectAllGroup}>
      <Pressable onPress={() => onChange(selectAllCups)} disabled={readOnly} accessibilityRole="button"
        accessibilityLabel={`${label}: ${label === 'Clean Cup' ? 'select all eligible cups; cups with bean defects are excluded' : 'select all cups'}`}
        accessibilityState={{ disabled: readOnly, selected: sameCupSelection(value, selectAllCups) }}
        style={[styles.selectAllAction, { paddingHorizontal: spacing.md * scale, borderRadius: 8 * scale }, readOnly && styles.choiceDisabled]}>
        <Text style={styles.selectAllText}>{label === 'Clean Cup' ? 'Select all eligible cups' : 'Select all cups'}</Text>
      </Pressable>
      {selectAllHint ? <Text style={styles.hint}>{selectAllHint}</Text> : null}
    </View>}
    {!fixed && !affected && !scoreAction && <View style={styles.wrap}>
      <Choice label="None qualify" selected={Array.isArray(value) && value.length === 0} disabled={readOnly} onPress={() => onChange([])} />
      <Choice label="Not assessed" selected={value == null} disabled={readOnly} onPress={() => onChange(null)} />
    </View>}
  </View>;
}

function VerticalRuler({ label, accessibilityContext = label, value, onPress, readOnly, lowLabel, highLabel, scale }) {
  return <Pressable onPress={onPress} disabled={readOnly} accessibilityRole="button"
    accessibilityLabel={`${accessibilityContext}, ${value == null ? 'not assessed' : `${value} of 5`}, choose intensity`}
    accessibilityState={{ disabled: readOnly }} style={[styles.verticalGroup, { minWidth: 80 * scale, paddingVertical: spacing.xs * scale }]}>
    {label ? <Text style={styles.hint}>{label}</Text> : null}
    <View style={[styles.verticalRow, { gap: spacing.xs * scale }]}>
      <View style={[styles.verticalTrack, { width: 56 * scale, height: 96 * scale }]}>
        <View pointerEvents="none" style={styles.verticalSpine} />
        {[5, 4, 3, 2, 1].map(mark => <View key={mark}
          style={[styles.verticalTick, value === mark && styles.verticalTickSelected]} />)}
      </View>
      {(highLabel || lowLabel) && <View style={styles.verticalLabels}>
        <Text style={styles.hint}>{highLabel}</Text><Text style={styles.hint}>{lowLabel}</Text>
      </View>}
    </View>
    <Text style={styles.verticalValue}>{value == null ? 'Choose' : `${value} / 5`}</Text>
  </Pressable>;
}

function VerticalObservationSection({ heading, children, footer }) {
  return <View style={styles.verticalObservationSection}>
    <Text style={[styles.hint, styles.intensityHeading]}>{heading}</Text>
    <View style={styles.verticalRulerGroup}>{children}</View>
    {footer}
  </View>;
}

function NotesField({ label, value, onChange, onFocus, onBlur, readOnly, placeholder, scale, showLabel = true }) {
  return <View style={styles.observation}>{showLabel && <Text style={styles.rowLabel}>{label}</Text>}<NotesInput
    value={value || ''} onChangeText={onChange} onFocus={onFocus} onBlur={onBlur} disabled={readOnly}
    placeholder={placeholder || `Add ${label.toLowerCase()}`} accessibilityLabel={label}
    style={{ minHeight: 114 * scale, borderRadius: 13 * scale, paddingHorizontal: 15 * scale,
      paddingTop: 8 * scale, paddingBottom: 8 * scale, marginTop: spacing.sm }} /></View>;
}

function componentScore(value, n, oneCupUniformity = false) {
  if (oneCupUniformity && n === 1) return '10.00';
  return Array.isArray(value) ? (10 * value.length / n).toFixed(2) : '—';
}

export function LegacyCuppingScreen({ sessionId, sampleId, cupCount, coffeeNameOrigin, process, cuppingMode, sampleNumber, sampleCode, cupIndex, cupStatus, onBackPress, onScanPress }) {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const { choiceWidth: scoreChoiceWidth } = legacyScoreGridLayout({
    screenWidth: width, fontScale, fontSize: typography.text_secondary_body.fontSize,
    panelPadding: spacing.md, gap: spacing.xs,
  });
  const n = Number(cupCount);
  const [savedContext, setSavedContext] = useState(null);
  const operationEpoch = useRef(0);
  const currentContext = useRef(`${sessionId}:${sampleId}`);
  currentContext.current = `${sessionId}:${sampleId}`;
  const showOpenIdentity = savedContext?.identity?.visible === true;
  const [response, setResponse] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [qualityField, setQualityField] = useState(null);
  const [verticalField, setVerticalField] = useState(null);
  const [showLowerScores, setShowLowerScores] = useState(false);
  const [pendingDefectChoice, setPendingDefectChoice] = useState(null);
  const [showResultBreakdown, setShowResultBreakdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const { animations: balloonAnimations, triggerBalloons } = useScoreBalloons();
  const saveQueue = useRef(null);
  const savedFingerprints = useRef(new Map());
  if (!saveQueue.current) saveQueue.current = createLegacySaveQueue(async command => {
    const key = `${command.sessionId}:${command.sampleId}`;
    const expectedFingerprint = savedFingerprints.current.get(key);
    if (!expectedFingerprint) return { ok: false, errors: ['tasting:stale_context'] };
    const saved = await saveLegacyResponse({ ...command, expectedFingerprint });
    if (saved?.ok && command.intent === 'save') savedFingerprints.current.set(key, saved.savedFingerprint);
    return saved;
  });
  const responseRef = useRef(null);
  const savedCompleteRef = useRef(false);
  const selectorScroll = useRef(null);
  const formScroll = useRef(null);
  const cancelFocusScroll = useRef(null);
  const focusNotes = event => {
    cancelFocusScroll.current?.();
    cancelFocusScroll.current = focusNotesAboveKeyboard(formScroll, event, spacing.md * scale);
  };
  const blurNotes = () => { cancelFocusScroll.current?.(); };
  useEffect(() => () => cancelFocusScroll.current?.(), []);
  const form = resolveForm(PROFILE, 2);

  useEffect(() => {
    let cancelled = false;
    operationEpoch.current += 1;
    setLoading(true);
    setReadOnly(true);
    setSavedContext(null);
    setShowResultBreakdown(false);
    getLegacyResponse(sessionId, sampleId).then(saved => {
      if (cancelled) return;
      const loaded = saved?.recoveryDraft || saved?.response || { quality_ratings: {}, consistent_cups: n === 1 ? [1] : null };
      savedFingerprints.current.set(`${sessionId}:${sampleId}`, saved.savedFingerprint);
      responseRef.current = loaded;
      setResponse(loaded);
      setSavedContext(saved);
      setResult(saved?.recoveryDraft ? null : saved?.result || null);
      savedCompleteRef.current = Boolean(saved?.complete && saved?.result?.ok);
      setReadOnly(Boolean(saved?.sessionComplete) || saved?.access?.canWrite !== true);
      setErrors(saved?.errors || []);
      setHasPendingChanges(Boolean(saved?.recoveryDraft));
      setLoading(false);
    }).catch(error => { if (!cancelled) { setMessage(error?.message || 'Could not load Legacy response.'); setLoading(false); } });
    return () => { cancelled = true; operationEpoch.current += 1; };
  }, [sessionId, sampleId, n]);

  const edit = change => {
    if (!responseRef.current || readOnly) return;
    const next = change(responseRef.current);
    responseRef.current = next;
    setResponse(next);
    setResult(null);
    setErrors([]);
    setHasPendingChanges(true);
    const operation = saveQueue.current.enqueue(next, false, { intent: 'recovery', sessionId, sampleId });
    const epoch = operationEpoch.current;
    operation.promise.then(saved => {
      if (epoch !== operationEpoch.current || operation.revision !== saveQueue.current.revision) return;
      if (saved.ok) { setSavedContext(previous => ({ ...previous, ...saved })); setMessage(''); }
      else setMessage(`Could not save draft: ${saved.error?.message || errorText(saved.errors)}`);
    });
  };

  const saveAssessment = async () => {
    if (!responseRef.current || readOnly || isSavingDraft) return;
    if (!form.ok) {
      setMessage('The selected Legacy form is unavailable. No response was saved.');
      return;
    }
    const currentResponse = responseRef.current;
    const score = scoreResponse({ profile: PROFILE, f: 2, identity: form.identity, cup_count: n,
      response: currentResponse }, { profile: PROFILE, f: 2, identity: form.identity });
    const shouldComplete = Boolean(score?.ok);
    const wasComplete = savedCompleteRef.current;
    setIsSavingDraft(true);
    const operation = saveQueue.current.enqueue(currentResponse, shouldComplete, { intent: 'save', sessionId, sampleId });
    const epoch = operationEpoch.current;
    try {
      const saved = await operation.promise;
      if (epoch !== operationEpoch.current || operation.revision !== saveQueue.current.revision) return;
      if (saved.ok) {
        setSavedContext(previous => ({ ...previous, ...saved }));
        savedCompleteRef.current = shouldComplete;
        setResult(shouldComplete ? saved.result : null);
        setErrors([]);
        setHasPendingChanges(false);
        setMessage('');
        if (shouldComplete && !wasComplete) triggerBalloons();
      } else {
        setMessage(`Could not save assessment: ${saved.error?.message || errorText(saved.errors)}`);
      }
    } finally {
      if (epoch === operationEpoch.current) setIsSavingDraft(false);
    }
  };

  const scanNextCup = async () => {
    if (hasPendingChanges || isSavingDraft) {
      setMessage('Save changes before scanning another cup.');
      return;
    }
    const epoch = operationEpoch.current;
    const context = `${sessionId}:${sampleId}`;
    const saved = await saveQueue.current.drain();
    if (epoch !== operationEpoch.current || currentContext.current !== context) return;
    if (saved && !saved.ok) {
      setMessage(`Could not save the latest assessment edit: ${saved.error?.message || errorText(saved.errors)} Scan was not started.`);
      return;
    }
    if (typeof onScanPress === 'function') onScanPress();
  };

  if (loading || !response) return <View style={styles.screen}><AssessmentHeader sampleNumber={sampleNumber} sampleCode={sampleCode} cupIndex={cupIndex} temperature={cupStatus?.temp} onBackPress={onBackPress} scale={scale} /><Text style={styles.hint}>{message || 'Loading saved assessment…'}</Text></View>;
  const defect = response.scored_defect;
  const beanTypeCups = selectedTypeCups(response.bean_defect_type_masks, BEAN_DEFECT_OPTIONS);
  const scoredBeanCups = Array.isArray(defect?.affected_cups) ? defect.affected_cups : [];
  const eligibleCleanCups = selectAllQualifyingCups(n, [...beanTypeCups, ...scoredBeanCups]);
  const allSweetCups = selectAllQualifyingCups(n);
  const disabledBeanCups = unavailableBeanCups(response.clean_cups);
  const roastTypeCups = selectedTypeCups(response.roast_defect_type_masks, ROAST_DEFECT_OPTIONS);
  const pendingGroup = pendingDefectChoice && DEFECT_GROUPS[pendingDefectChoice.group];
  const pendingSelectedTypes = pendingGroup ? pendingGroup.options.filter(option =>
    (response[pendingGroup.field]?.[option.key] || []).includes(pendingDefectChoice.cup)).map(option => option.key) : [];
  const selectDefectType = key => {
    if (!pendingDefectChoice || !pendingGroup) return;
    const { cup, group } = pendingDefectChoice;
    edit(r => {
      const field = DEFECT_GROUPS[group].field;
      const current = r[field] || {};
      const slots = Array.isArray(current[key]) ? current[key] : [];
      const nextMasks = { ...current, [key]: slots.includes(cup) ? slots.filter(value => value !== cup) : [...slots, cup].sort((a, b) => a - b) };
      if (group === 'roast') return { ...r, [field]: nextMasks };
      const affected = selectedTypeCups(nextMasks, BEAN_DEFECT_OPTIONS);
      return { ...r, [field]: nextMasks, scored_defect: affected.length ? {
        kind: r.scored_defect?.kind || null, affected_cups: affected,
      } : null };
    });
  };
  const displayedResult = result?.ok ? result : null;
  const defectDeduction = defect?.kind && Array.isArray(defect.affected_cups)
    ? defectDeductionText({ numerator: (defect.kind === 'taint' ? 2 : 4) * defect.affected_cups.length * 5, denominator: n }) : '0.00';
  const beanDefectImpact = beanTypeCups.length > 0 && !defect?.kind ? '—' : defectDeduction;
  const openQuality = key => {
    setShowLowerScores(revealLowerForSelected(response.quality_ratings?.[key]));
    selectorScroll.current?.scrollTo({ y: 0, animated: false });
    setQualityField(key);
  };
  const resultRows = result?.ok ? [
    ...QUALITY.map(([key, label]) => ({ key, label, value: scoreText(response.quality_ratings[key]) })),
    { key: 'quality', label: 'Quality subtotal', value: (result.components.quality.numerator / result.components.quality.denominator).toFixed(2) },
    { key: 'uniformity', label: 'Uniformity', value: (result.components.uniformity.numerator / result.components.uniformity.denominator).toFixed(2) },
    { key: 'sweetness', label: 'Sweetness', value: (result.components.sweetness.numerator / result.components.sweetness.denominator).toFixed(2) },
    { key: 'clean-cup', label: 'Clean Cup', value: (result.components.clean_cup.numerator / result.components.clean_cup.denominator).toFixed(2) },
    { key: 'bean', label: 'Bean-defect deduction', value: defectDeductionText(result.components.defect_deduction) },
    { key: 'total', label: 'Total score', value: result.display_score, total: true },
  ] : [];
  const resultSummary = result?.ok ? <AssessmentResultSection
    formLabel={`SCA Legacy · version ${result.identity.form_version}`}
    provenance={result.label}
    details={result.quality_scale_provenance?.outside_published_table_fields?.length ? [result.quality_scale_provenance.note] : []}
    rows={resultRows} expanded={showResultBreakdown}
    onToggle={() => setShowResultBreakdown(value => !value)} scale={scale} /> : null;
  const renderQualitySection = ([key, label]) => <View key={key}>
    <QualityRuler label={label} value={response.quality_ratings?.[key]} onPress={() => openQuality(key)}
      disabled={readOnly} showDivider={!['fragrance_aroma', 'acidity', 'body'].includes(key)} />
    {key === 'fragrance_aroma' && <VerticalObservationSection heading="Intensity" footer={
      <NotesField label="Qualities" showLabel={false} placeholder="Add qualities..." value={response.aroma_qualities} readOnly={readOnly} scale={scale} onFocus={focusNotes} onBlur={blurNotes} onChange={value => edit(r => ({ ...r, aroma_qualities: value }))} />}>
        <VerticalRuler label="Dry" accessibilityContext={VERTICAL_FIELDS.dry_aroma_intensity} value={response.dry_aroma_intensity} readOnly={readOnly} scale={scale} onPress={() => setVerticalField('dry_aroma_intensity')} />
        <VerticalRuler label="Break" accessibilityContext={VERTICAL_FIELDS.break_aroma_intensity} value={response.break_aroma_intensity} readOnly={readOnly} scale={scale} onPress={() => setVerticalField('break_aroma_intensity')} />
    </VerticalObservationSection>}
    {key === 'acidity' && <VerticalObservationSection heading="Intensity">
      <VerticalRuler accessibilityContext={VERTICAL_FIELDS.acidity_intensity} highLabel="High" lowLabel="Low" value={response.acidity_intensity} readOnly={readOnly} scale={scale} onPress={() => setVerticalField('acidity_intensity')} />
    </VerticalObservationSection>}
    {key === 'body' && <VerticalObservationSection heading="Level">
      <VerticalRuler accessibilityContext={VERTICAL_FIELDS.body_level} highLabel="Heavy" lowLabel="Thin" value={response.body_level} readOnly={readOnly} scale={scale} onPress={() => setVerticalField('body_level')} />
    </VerticalObservationSection>}
  </View>;
  return <View style={styles.screen}>
    <AssessmentHeader sampleNumber={sampleNumber} sampleCode={sampleCode} cupIndex={cupIndex} temperature={cupStatus?.temp} onBackPress={onBackPress} scale={scale} />
    {showOpenIdentity ? <AssessmentSampleIdentity name={savedContext.identity.name}
      process={getProcessLabel(savedContext.identity.process) || savedContext.identity.process} scale={scale} /> : null}
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.formContent}>
    <ScrollView style={styles.formScroll} ref={formScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      contentContainerStyle={[styles.content, { paddingHorizontal: 24 * scale }]}>
      <AssessmentFormIntro form={2} cuppingMode={cuppingMode} cupCount={n} />
      <LocalTastingActions showCompletion={false} sessionId={sessionId} sampleId={sampleId} access={savedContext?.access} tasting={savedContext?.tasting}
        disabled={hasPendingChanges || isSavingDraft} onAdopted={saved => {
          setSavedContext(saved); responseRef.current = saved.response; setResponse(saved.response);
          setResult(saved.result || null); setReadOnly(Boolean(saved.sessionComplete) || saved.access?.canWrite !== true);
        }} />
      {message ? <Text style={styles.hint} accessibilityLiveRegion="polite">{message}</Text> : null}
      {QUALITY.slice(0, 5).map(renderQualitySection)}
      <CupSet label="Uniformity" score={componentScore(response.consistent_cups, n, true)} scoreAction={n > 1} value={n === 1 ? [1] : response.consistent_cups} count={n} fixed={n === 1} readOnly={readOnly} scale={scale} onChange={value => edit(r => ({ ...r, consistent_cups: value }))} />
      {QUALITY.slice(5, 6).map(renderQualitySection)}
      <CupSet label="Clean Cup" score={componentScore(response.clean_cups, n)} scoreAction value={response.clean_cups} count={n} readOnly={readOnly} scale={scale}
        selectAllCups={eligibleCleanCups} selectAllHint="Cups with bean defects are excluded."
        onChange={value => edit(r => ({ ...r, clean_cups: value }))} />
      <CupSet label="Sweetness" score={componentScore(response.sweet_cups, n)} scoreAction value={response.sweet_cups} count={n} readOnly={readOnly} scale={scale}
        selectAllCups={allSweetCups} onChange={value => edit(r => ({ ...r, sweet_cups: value }))} />
      {QUALITY.slice(6).map(renderQualitySection)}
      <NotesField label="Flavour Notes" showLabel={false} placeholder="Add flavour notes..." value={response.notes} readOnly={readOnly} scale={scale} onFocus={focusNotes} onBlur={blurNotes} onChange={value => edit(r => ({ ...r, notes: value }))} />
      <View style={styles.defectsSection}>
      <View style={styles.defectGroup}>
      <DesignCDefectTypeItem title="Bean defects" description="Tap a cup to choose its defect type. Clean cups are unavailable."
        selectedSlots={beanTypeCups} maxCount={n} options={BEAN_DEFECT_OPTIONS} defectCupSlots={response.bean_defect_type_masks || {}}
        disabled={readOnly} disabledSlots={disabledBeanCups} disabledReason="marked Clean Cup"
        scale={scale} isLastInGroup paddingVertical={0} scoreImpact={beanDefectImpact}
        onSlotPress={cup => setPendingDefectChoice({ group: 'bean', cup })} />
      {beanTypeCups.length > 0 && <View style={styles.severityCapsule} accessibilityRole="radiogroup" accessibilityLabel="Defect classification">
        {['taint', 'fault'].map(kind => <Pressable key={kind} onPress={() => edit(r => ({ ...r, scored_defect: { ...r.scored_defect, kind } }))}
          disabled={readOnly} accessibilityRole="radio" accessibilityState={{ checked: defect?.kind === kind, disabled: readOnly }}
          accessibilityLabel={`${kind === 'taint' ? 'Taint, intensity 2' : 'Fault, intensity 4'}`}
          style={[styles.severitySegment, defect?.kind === kind && styles.severitySegmentSelected]}>
          <Text style={[styles.choiceText, defect?.kind === kind && styles.choiceTextSelected]}>{kind === 'taint' ? 'Taint · 2' : 'Fault · 4'}</Text>
        </Pressable>)}
      </View>}
      {defect && <>
        {Array.isArray(response.clean_cups) && defect.affected_cups.some(cup => response.clean_cups.includes(cup)) ?
          <Text style={styles.error}>Defective cups cannot also be marked Clean Cup. Change one of those judgments.</Text> : null}
      </>}
      </View>
      <View style={styles.defectGroup}>
      <DesignCDefectTypeItem title="Roast defects" description="Tap a cup to choose its roast defect. No impact on score."
        selectedSlots={roastTypeCups} maxCount={n} options={ROAST_DEFECT_OPTIONS} defectCupSlots={response.roast_defect_type_masks || {}}
        disabled={readOnly} scale={scale} isLastInGroup paddingVertical={0}
        onSlotPress={cup => setPendingDefectChoice({ group: 'roast', cup })} />
      </View>
      <View style={styles.defectGroup}>
      <NotesField label="Describe the defect" showLabel={false} value={response.defect_description} readOnly={readOnly} scale={scale} placeholder="Describe the defect..." onFocus={focusNotes} onBlur={blurNotes}
        onChange={value => edit(r => ({ ...r, defect_description: value }))} />
      </View>
      </View>
      {errors.length > 0 && <View style={styles.section}><Text style={styles.error}>Assessment needs attention:</Text><Text style={styles.error}>{errorText(errors)}</Text></View>}
      {resultSummary}
    </ScrollView>
    </View>
    </KeyboardAvoidingView>
    <DefectTypeDialog visible={Boolean(pendingDefectChoice)} title={pendingDefectChoice?.group === 'roast' ? 'Select roast defect' : 'Select bean defect'}
      options={pendingGroup?.options || []} selectedKeys={pendingSelectedTypes} onSelect={selectDefectType}
      onClose={() => setPendingDefectChoice(null)} scale={scale} />
    <View style={styles.footer}>
      <View style={styles.overallRow} accessibilityLiveRegion="polite"><Text style={styles.rowLabel}>{displayedResult?.ok && n !== 5 ? 'Total score · adapted' : 'Total score'}</Text><Text style={styles.overallValue}>{displayedResult?.ok ? displayedResult.display_score : '—'}</Text></View>
      <Pressable onPress={hasPendingChanges ? saveAssessment : scanNextCup}
      disabled={isSavingDraft || (!hasPendingChanges && typeof onScanPress !== 'function')} accessibilityRole="button"
      accessibilityLabel={hasPendingChanges ? 'Save Legacy assessment' : 'Scan cup'}
      style={[styles.scanButton, hasPendingChanges && styles.saveButton,
        (isSavingDraft || (!hasPendingChanges && typeof onScanPress !== 'function')) && styles.choiceDisabled]}>
      <Text style={styles.completeText}>{hasPendingChanges ? 'SAVE' : 'SCAN CUP'}</Text></Pressable></View>
    <ScoreBalloons animations={balloonAnimations} width={width} scale={scale} />
    <Modal visible={Boolean(qualityField)} transparent animationType="fade" onRequestClose={() => setQualityField(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, styles.modalTitle]}>{QUALITY.find(([key]) => key === qualityField)?.[1] || 'Quality mark'}</Text>
          <Pressable onPress={() => setQualityField(null)} accessibilityRole="button" accessibilityLabel="Close quality marks" style={styles.modalClose}><Text style={styles.rowLabel}>Close</Text></Pressable></View>
        <Text style={styles.hint}>Choose an exact quarter-point mark. 6.00–9.75 is the protocol's printed table; other values are a Cup App extension.</Text>
        {revealLowerForSelected(response.quality_ratings?.[qualityField]) ?
          <View style={styles.selectedLow}><Text style={styles.rowLabel}>Current selection: {scoreText(response.quality_ratings[qualityField])}</Text>
            <Text style={styles.hint}>Cup App extended range · lower scores shown in the grid</Text></View> : null}
        <ScrollView ref={selectorScroll} keyboardShouldPersistTaps="always" contentContainerStyle={styles.selectorScroll}>
        <Pressable onPress={() => { setShowLowerScores(!showLowerScores); selectorScroll.current?.scrollTo({ y: 0, animated: false }); }} accessibilityRole="button" accessibilityState={{ expanded: showLowerScores }} style={styles.lowerToggle}>
          <Text style={styles.rowValue}>{showLowerScores ? 'Hide lower scores' : 'Show lower scores (0.00–5.75)'}</Text></Pressable>
        <View style={styles.grid}>{visibleMarks(showLowerScores).map(mark => <Choice key={mark} style={{ width: scoreChoiceWidth, minWidth: 44, paddingHorizontal: spacing.xs }} singleLine label={scoreText(mark)} selected={response.quality_ratings?.[qualityField] === mark}
          onPress={() => { edit(r => ({ ...r, quality_ratings: { ...(r.quality_ratings || {}), [qualityField]: mark } })); setQualityField(null); }} />)}</View>
        </ScrollView>
      </View></View>
    </Modal>
    <Modal visible={Boolean(verticalField)} transparent animationType="fade" onRequestClose={() => setVerticalField(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, styles.modalTitle]}>{VERTICAL_FIELDS[verticalField] || 'Intensity'}</Text>
          <Pressable onPress={() => setVerticalField(null)} accessibilityRole="button" accessibilityLabel="Close intensity choices" style={styles.modalClose}><Text style={styles.rowLabel}>Close</Text></Pressable></View>
        <Text style={styles.hint}>Choose one of five intensity positions.</Text>
        <View style={styles.intensityChoices}>{[1, 2, 3, 4, 5].map(mark => <Choice key={mark} label={String(mark)} style={{ width: Math.max(44, (width - 4 * spacing.md - 4 * spacing.xs) / 5), minWidth: 44 }}
          accessibilityLabel={`${VERTICAL_FIELDS[verticalField]} ${mark} of 5`} selected={response[verticalField] === mark}
          onPress={() => { edit(r => ({ ...r, [verticalField]: mark })); setVerticalField(null); }} />)}</View>
        <Pressable onPress={() => { edit(r => ({ ...r, [verticalField]: null })); setVerticalField(null); }} accessibilityRole="button"
          accessibilityLabel={`Clear ${VERTICAL_FIELDS[verticalField]} mark`} style={styles.lowerToggle}>
          <Text style={styles.rowValue}>Clear mark · Not assessed</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  section: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  sectionTitle: { ...typography.text_section_title, color: colors.ink },
  hint: { ...typography.text_secondary_body, color: colors.inkSoft },
  row: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  qualityRow: { minHeight: 90, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center', gap: spacing.xs },
  qualityRowWithoutDivider: { borderBottomWidth: 0 },
  qualityTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inlineScoreAction: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
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
  severityCapsule: { alignSelf: 'center', flexDirection: 'row', padding: 3, borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 24, backgroundColor: colors.panel },
  severitySegment: { minWidth: 105, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: 21 },
  severitySegmentSelected: { backgroundColor: colors.ink },
  checkSection: { gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md },
  cupSelectorRow: { width: '100%', flexDirection: 'row', justifyContent: 'center' },
  selectAllGroup: { alignItems: 'center', gap: spacing.xs },
  selectAllAction: { minHeight: 44, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center' },
  selectAllText: { ...typography.text_secondary_body, color: colors.ink },
  verticalObservationSection: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  intensityHeading: { alignSelf: 'center' },
  verticalRulerGroup: { alignSelf: 'center', flexDirection: 'row', gap: spacing.lg },
  verticalGroup: { alignSelf: 'center', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  verticalRow: { flexDirection: 'row', alignItems: 'stretch' },
  verticalTrack: { justifyContent: 'space-between', alignItems: 'center' },
  verticalSpine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.ink },
  verticalTick: { alignSelf: 'stretch', height: 1, backgroundColor: colors.ink, borderRadius: 1 },
  verticalTickSelected: { height: 5, backgroundColor: colors.action, borderRadius: 3 },
  verticalLabels: { justifyContent: 'space-between' },
  verticalValue: { ...typography.text_secondary_body, color: colors.action },
  intensityChoices: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  formContent: { flex: 1 },
  formScroll: { flex: 1 },
  defectsSection: { gap: 0 },
  defectGroup: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.md },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  overallValue: { ...typography.text_secondary_metric, color: colors.ink },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  scanButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action },
  saveButton: { backgroundColor: colors.ink },
  observation: { gap: spacing.xs },
  error: { ...typography.text_secondary_body, color: colors.danger },
  completeText: { ...typography.text_button_primary, color: colors.surface },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: spacing.md },
  modalPanel: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: spacing.sm, maxHeight: '85%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  selectorScroll: { gap: spacing.sm, paddingBottom: spacing.sm },
  selectedLow: { backgroundColor: colors.panel, borderRadius: 8, padding: spacing.sm, gap: spacing.xs },
  modalTitle: { flex: 1, flexShrink: 1 },
  modalClose: { minHeight: 44, minWidth: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  lowerToggle: { minHeight: 44, justifyContent: 'center' },
});
