import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { full_page_button as FullPageButton } from '../../../components/ui/full_page_button';
import { NotesInput } from '../../../components/ui/NotesInput';
import { Header } from '../../../components/ui/Header';
import { CupStatusStrip } from '../../../components/ui/CupStatusStrip';
import { ScoreSelector } from '../../../components/ui/ScoreSelector';
import { AssessmentHeader } from '../components/AssessmentHeader';
import { AssessmentSampleIdentity } from '../components/AssessmentSampleIdentity';
import { AssessmentFormIntro } from '../components/AssessmentFormIntro';
import { AssessmentResultSection } from '../components/AssessmentResultSection';
import { LocalTastingActions } from '../components/LocalTastingActions';
import { AssessmentCupSelector } from '../components/AssessmentCupSelector';
import { DefectsSection } from '../components/DefectsSection';
import { ScoreBalloons, useScoreBalloons } from '../components/ScoreBalloons';
import { focusNotesAboveKeyboard } from '../components/focusNotesAboveKeyboard';
import { KeywordPillRow } from '../components/KeywordPillRow';
import { tokenizeFlavourKeywords } from '../data/flavourKeywords';
import { RATINGS, NOTES, createCvaDraft, changeCvaMask, cvaUiMasks, sourceUnion,
  inspectCvaResponse, cvaGuidance } from '../data/cvaResponse';
import { getCvaResponse, saveCvaResponse } from '../../../data/sessionRepository';
import { getProcessLabel } from '../constants/sessionDetails';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

function ZeroAssessment({ label, cups, amount, onPress, disabled }) {
  const value = cups == null ? '—' : amount ? `−${amount.toFixed(2)}` : '0.00';
  if (amount) return <Text style={styles.impact}>{value}</Text>;
  return <Pressable style={styles.zeroAction} onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityLabel={`${label}, ${cups == null ? 'not assessed. Record none' : 'assessed none. Mark unassessed'}`}
    accessibilityState={{ disabled }}><Text style={styles.impact}>{value}</Text></Pressable>;
}

function CaptureNotes({ label, value, onChange, disabled, scrollRef, showLabel = false }) {
  const cancel = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => () => cancel.current?.(), []);
  return <View style={styles.notes}>
    {showLabel ? <Text style={styles.hint}>{label}</Text> : null}
    <NotesInput value={value || ''} onChangeText={onChange} disabled={disabled}
      placeholder={`Add ${label.toLowerCase()}...`} accessibilityLabel={label}
      onFocus={event => { setFocused(true); cancel.current?.(); cancel.current = focusNotesAboveKeyboard(scrollRef, event, spacing.md); }}
      onBlur={() => { setFocused(false); cancel.current?.(); }} />
    {!focused ? <KeywordPillRow pills={tokenizeFlavourKeywords(value || '').filter(token => token.type === 'pill')}
      style={{ marginTop: spacing.xs }} /> : null}
  </View>;
}

export function CanonicalCvaScreen({ sessionId, sampleId, sampleNumber, cupIndex, cupStatus, cuppingMode,
  coffeeNameOrigin, process, onBackPress, onScanPress, isScanInProgress, scanRevision,
  canSwipeSamples, onSampleSwipe, cupTotal, initialScrollTarget, cupStateNumber = 1, tagType, captureMode, startInFinalMode,
  cupUUID, elapsedSeconds = null, brewTimeSeconds = null }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const scroll = useRef(null);
  const positions = useRef({});
  const editVersion = useRef(0);
  const saving = useRef(false);
  const mounted = useRef(true);
  const contextKey = `${sessionId}:${sampleId}`;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const [response, setResponse] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loadedContext, setLoadedContext] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const autoScrolled = useRef(null);
  const layoutReady = useRef(false);
  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(elapsedSeconds);
  const brewing = cupStateNumber === 2 && !startInFinalMode;
  useEffect(() => { setDisplayElapsedSeconds(elapsedSeconds); }, [elapsedSeconds, sampleId]);
  useEffect(() => {
    if (!brewing) return undefined;
    const interval = setInterval(() => setDisplayElapsedSeconds(previous => Number.isInteger(previous) && previous >= 0 ? previous + 1 : previous), 1000);
    return () => clearInterval(interval);
  }, [brewing, sampleId]);
  const { animations, triggerBalloons } = useScoreBalloons();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setSaved(null);
    getCvaResponse(sessionId, sampleId).then(value => {
      if (!active) return;
      setSaved(value); setResponse(value.response || createCvaDraft(value.n)); setDirty(false);
      setLoadedContext(contextKey);
      setMessage(value.revision && !value.complete ? `Draft saved. Still needed: ${cvaGuidance(value.errors).join('; ')}.` : '');
      setError(false);
    }).catch(() => { if (active) { setError(true); setMessage('Could not load this assessment. Reopen the session to try again.'); } });
    return () => { active = false; };
  }, [sessionId, sampleId, scanRevision]);
  // Route isSessionComplete is also used for response readiness. Only the
  // independently loaded host Session closure locks an already scored response.
  const disabled = !saved || saved.sessionComplete || saved.access?.canWrite !== true || (cupStateNumber === 2 && !startInFinalMode);
  const ratingDisabled = key => disabled || (!startInFinalMode &&
    (captureMode === 'aroma_only' ? !['fragrance', 'aroma'].includes(key) : tagType === 'ntag_cup' ? false
      : cupStateNumber === 1 ? key !== 'fragrance' : cupStateNumber === 3 && response?.ratings?.aroma == null ? !['fragrance', 'aroma'].includes(key) : false));
  const scrollToInitialTarget = () => {
    if (!saved || !response || dirty || brewing || !layoutReady.current) return;
    const target = initialScrollTarget || (cupStateNumber === 3 && response.ratings?.aroma != null ? 'Flavour' : 'top');
    const key = `${sessionId}:${sampleId}:${cupStateNumber}:${target}:${scanRevision ?? 'initial'}`;
    if (autoScrolled.current === key) return;
    const y = target === 'Flavour' ? positions.current.flavor : 0;
    if (!Number.isFinite(y) || !scroll.current) return;
    autoScrolled.current = key;
    scroll.current.scrollTo({ y, animated: false });
  };
  useEffect(() => {
    const frame = requestAnimationFrame(scrollToInitialTarget);
    return () => cancelAnimationFrame(frame);
  }, [saved, response, dirty, scanRevision, initialScrollTarget, cupStateNumber, brewing]);
  const pager = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Boolean(canSwipeSamples && typeof onSampleSwipe === 'function' &&
      Math.abs(gesture.dx) > 42 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6),
    onPanResponderRelease: (_, gesture) => {
      if (dirty || pending) { setMessage('Save changes before switching samples.'); return; }
      const index = Number.isInteger(sampleNumber) ? sampleNumber - 1 : cupIndex || 0;
      if (gesture.dx < -48 && index < cupTotal - 1) onSampleSwipe?.('next');
      if (gesture.dx > 48 && index > 0) onSampleSwipe?.('previous');
    },
  });
  const update = change => {
    if (disabled) return;
    editVersion.current += 1;
    setResponse(previous => typeof change === 'function' ? change(previous) : { ...previous, ...change });
    setDirty(true); setError(false); setMessage('');
  };
  const save = async () => {
    if (disabled || saving.current) return;
    saving.current = true; setPending(true);
    const submittedVersion = editVersion.current;
    const submittedContext = contextKey;
    try {
      const acknowledgement = await saveCvaResponse({ sessionId, sampleId, response,
        expectedRevision: saved.revision, expectedIdentity: saved.trusted.identity, expectedCupCount: saved.n });
      if (!mounted.current || currentContext.current !== submittedContext) return;
      setSaved(previous => ({ ...previous, ...acknowledgement }));
      const stillCurrent = submittedVersion === editVersion.current;
      setDirty(!stillCurrent);
      const text = !stillCurrent ? 'Saved. Your newer edits still need saving.' : acknowledgement.complete ? 'Assessment saved.'
        : `Draft saved. Still needed: ${cvaGuidance(acknowledgement.errors, acknowledgement.response, saved.n).join('; ')}.`;
      setMessage(text); setError(false); AccessibilityInfo.announceForAccessibility(text);
      if (acknowledgement.firstComplete && stillCurrent) triggerBalloons();
    } catch (cause) {
      if (!mounted.current || currentContext.current !== submittedContext) return;
      const text = cause?.code === 'cva:stale_revision' ? 'This assessment changed elsewhere. Reopen it before saving again; your edits are still here.'
        : 'Could not save the assessment. Your edits are still here. Reopen the session if the problem continues.';
      setMessage(text); setError(true); setDirty(true); AccessibilityInfo.announceForAccessibility(text);
    } finally { saving.current = false; if (mounted.current) setPending(false); }
  };
  const goBack = () => {
    if (pending) { setMessage('Saving the assessment. Please wait before leaving.'); return; }
    if (dirty) {
      Alert.alert('Leave unsaved edits?', 'Your last saved assessment is retained. The edits on this screen have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard unsaved edits', style: 'destructive', onPress: onBackPress },
      ]);
      return;
    }
    onBackPress?.();
  };
  if (!response || !saved || loadedContext !== contextKey) return <View style={styles.screen}>
    <AssessmentHeader sampleNumber={sampleNumber} cupIndex={cupIndex} temperature={cupStatus?.temp} onBackPress={onBackPress} scale={scale} />
    <Text style={styles.hint}>{message || 'Loading assessment…'}</Text></View>;
  const n = saved.n;
  if (brewing) {
    const timeText = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const elapsed = Number.isInteger(displayElapsedSeconds) && displayElapsedSeconds >= 0 ? timeText(displayElapsedSeconds) : null;
    const time = elapsed ? `${elapsed}${Number.isInteger(brewTimeSeconds) && brewTimeSeconds > 0 ? ` / ${timeText(brewTimeSeconds)}` : ''}` : cupStatus?.time || '—';
    return <View style={styles.screen} {...pager.panHandlers}>
      <Header title={cupUUID} variant="back" onBackPress={goBack} backAccessibilityLabel="Back" />
      <CupStatusStrip state={cupStatus?.state || 'BREWING'} temp={cupStatus?.temp || '—'} time={time} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>Fragrance</Text>
        <ScoreSelector value={saved.response?.ratings?.fragrance ?? null} disabled sectionLabel="Fragrance" />
        <CaptureNotes label="Fragrance / Aroma notes" value={saved.response?.affective_notes?.fragrance_aroma || ''}
          disabled scrollRef={scroll} />
      </ScrollView>
      <View style={styles.footer}><FullPageButton label="Done" accessibilityLabel="Return to Home" onPress={goBack} /></View>
    </View>;
  }
  const inspection = inspectCvaResponse(response, saved.trusted, n);
  const guidance = cvaGuidance(inspection.final.errors, response, saved.n);
  const nonUniform = response.non_uniform_cups;
  const independentDeductions = saved.trusted.identity.form_version === '3.0.0';
  const sourceCups = sourceUnion(response.defect_type_masks);
  // Never fill missing historical evidence just because the new-response default changed.
  const noSourceRecorded = sourceCups.length === 0 && Array.isArray(response.defective_cups) &&
    response.defective_cups.length === 0 && response.defect_type_masks != null && (independentDeductions || response.evenly_defective_all_cups === false);
  const needsNoSourceAssessment = sourceCups.length === 0 && !noSourceRecorded;
  const showEven = !independentDeductions && n > 1 && sourceCups.length === n;
  const finalResult = !dirty && saved.complete ? saved.result : null;
  const notes = (key, label) => <CaptureNotes label={`${label} notes`} showLabel={key !== 'fragrance_aroma'} value={response.affective_notes?.[key]}
    disabled={disabled} scrollRef={scroll} onChange={text => update(previous => ({ ...previous,
      affective_notes: { ...previous.affective_notes, [key]: text } }))} />;
  const jumpToMissing = () => {
    const first = inspection.final.errors[0]?.split(':')[0];
    const field = first?.startsWith('ratings.') ? first.slice(8) : first === 'ratings' ? 'fragrance'
      : first === 'non_uniform_cups' ? 'uniformity' : 'defects';
    scroll.current?.scrollTo({ y: positions.current[field] || 0, animated: true });
  };
  const beanValue = needsNoSourceAssessment ? '—' : sourceCups.length ? `−${(20 * sourceCups.length / n).toFixed(2)}` : '0.00';
  const rows = finalResult ? [
    ...Object.entries(RATINGS).map(([label, key]) => ({ key, label, value: saved.response.ratings[key].toFixed(2) })),
    { key: 'base', label: 'Base CVA score', value: (21 * Object.values(saved.response.ratings).reduce((sum, value) => sum + value, 0) / 32 + 211 / 4).toFixed(2) },
    { key: 'uniformity', label: 'Uniformity deduction', value: `−${(10 * saved.response.non_uniform_cups.length / n).toFixed(2)}` },
    { key: 'defects', label: 'Bean-defect deduction', value: `−${(20 * saved.response.defective_cups.length / n).toFixed(2)}` },
    { key: 'total', label: 'Total score', value: finalResult.display_score, total: true },
  ] : [];
  return <View style={styles.screen} {...pager.panHandlers}>
    <AssessmentHeader sampleNumber={sampleNumber} cupIndex={cupIndex} temperature={cupStatus?.temp} onBackPress={goBack} scale={scale} />
    {saved.identity?.visible ? <AssessmentSampleIdentity name={saved.identity.name} process={getProcessLabel(saved.identity.process) || saved.identity.process} scale={scale} /> : null}
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={false}
        onLayout={() => { layoutReady.current = true; scrollToInitialTarget(); }}
        contentContainerStyle={{ paddingHorizontal: 26 * scale, paddingBottom: spacing.lg * scale }}>
        <View style={{ paddingVertical: spacing.md * scale }}><AssessmentFormIntro form={1} cuppingMode={cuppingMode} cupCount={n} /></View>
        {saved.historicalReadOnly ? <Text style={styles.hint}>Historical CVA version 2.0.0 — read-only. Saved assessments retain their original scoring rules. Start a new session to use independent deductions.</Text> : null}
        <LocalTastingActions showCompletion={false} sessionId={sessionId} sampleId={sampleId} access={saved.access} tasting={saved.tasting}
          disabled={dirty || pending} onAdopted={value => { setSaved(value); setResponse(value.response || createCvaDraft(value.n)); setDirty(false); }}
          />
        {Object.entries(RATINGS).map(([label, key]) => <View key={key} style={[styles.section, { paddingVertical: spacing.md * scale }]}
          onLayout={event => { positions.current[key] = event.nativeEvent.layout.y; scrollToInitialTarget(); }}>
          <Text style={styles.title}>{label}</Text>
          <View style={[styles.ratingRow, { marginTop: spacing.sm * scale }]}>
            {Array.from({ length: 9 }, (_, index) => index + 1).map(value => <Pressable key={value}
              accessibilityRole="button" accessibilityLabel={`${label} ${value} of 9`} accessibilityState={{ selected: response.ratings?.[key] === value, disabled: ratingDisabled(key) }}
              disabled={ratingDisabled(key)} onPress={() => update(previous => ({ ...previous,
                ratings: { ...previous.ratings, [key]: previous.ratings[key] === value ? null : value } }))}
              style={[styles.rating, { width: 46 * scale, height: 46 * scale, borderRadius: 23 * scale }, response.ratings?.[key] === value && styles.selected]}>
              <Text style={[styles.ratingText, response.ratings?.[key] === value && styles.selectedText]}>{value}</Text>
            </Pressable>)}
          </View>
          {key === 'aroma' ? notes('fragrance_aroma', NOTES.fragrance_aroma) : null}
        </View>)}
        <CaptureNotes label="General tasting notes" showLabel value={response.general_affective_notes} disabled={disabled} scrollRef={scroll}
          onChange={text => update({ general_affective_notes: text })} />
        <Pressable style={styles.action} accessibilityRole="button" accessibilityState={{ expanded: categoryExpanded }}
          accessibilityLabel="Category notes optional" onPress={() => setCategoryExpanded(value => !value)}>
          <Text style={styles.actionText}>{categoryExpanded ? 'Hide category notes (optional)' : 'Category notes (optional)'}</Text>
        </Pressable>
        {categoryExpanded ? Object.entries(NOTES).filter(([key]) => key !== 'fragrance_aroma').map(([key, label]) =>
          <View key={key}>{notes(key, label)}</View>) : null}
        <View style={[styles.section, { paddingVertical: spacing.md * scale }]} onLayout={event => { positions.current.uniformity = event.nativeEvent.layout.y; }}>
          <View style={styles.titleRow}><Text style={styles.title}>Uniformity</Text>
            {n === 1 ? <Text style={styles.impact}>0.00</Text> : <ZeroAssessment label="Uniformity" cups={nonUniform}
              amount={10 * (nonUniform?.length || 0) / n} onPress={() => update({ non_uniform_cups: nonUniform == null ? [] : null })} disabled={disabled} />}
          </View>
          <Text style={styles.hint}>{n === 1 ? 'Not applicable with one cup.' : nonUniform == null
            ? 'Not assessed. Tap — to record no non-uniform cups.' : nonUniform.length ? 'Select cups that are not uniform.' : 'Assessed: none. Tap 0.00 to mark unassessed.'}</Text>
          {n > 1 ? <AssessmentCupSelector label="Non-uniform" selectedSlots={nonUniform || []} maxCount={n}
            onChange={cups => update({ non_uniform_cups: cups })} disabled={disabled} scale={scale} /> : null}
        </View>
        <View onLayout={event => { positions.current.defects = event.nativeEvent.layout.y; }}>
          <DefectsSection variant="designC" inline scale={scale} cupTotal={n} defectCupSlots={cvaUiMasks(response)}
            scoredDefectCount={sourceCups.length} defectiveCupSlots={response.defective_cups || []}
            disabled={disabled} onChangeDefectCupSlots={(key, cups) => update(previous => changeCvaMask(previous, key, cups, n))}
            beanAssessment={{ value: beanValue,
            hint: needsNoSourceAssessment ? 'Not assessed. Record no scored bean defects below, or tap a cup to add a defect. Other is an observation only.'
              : sourceCups.length ? 'Tap a cup to choose its defect types. Other is an observation only.'
                : 'No scored bean defects recorded. Tap a cup to add a defect. Other is an observation only.' }} />
          {needsNoSourceAssessment ? <Pressable style={styles.action} disabled={disabled}
            accessibilityRole="button" accessibilityLabel="Record no scored bean defects" accessibilityState={{ disabled }}
            onPress={() => update({ defective_cups: [], defect_type_masks: {}, evenly_defective_all_cups: false })}>
            <Text style={styles.actionText}>Record no scored bean defects</Text>
          </Pressable> : null}
          {showEven ? <View style={styles.section}>
            <Text style={styles.hint}>Are the defects even across all cups?</Text>
            <Text style={styles.hint}>Even means the defect is consistent across cups.</Text>
            {[['Even across cups', true], ['Different across cups', false]].map(([label, value]) => <Pressable key={label}
              style={[styles.evenChoice, response.evenly_defective_all_cups === value && styles.selected]} disabled={disabled}
              accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: response.evenly_defective_all_cups === value, disabled }}
              onPress={() => update({ evenly_defective_all_cups: value })}>
              <Text style={[styles.hint, response.evenly_defective_all_cups === value && styles.selectedText]}>{label}</Text>
            </Pressable>)}
          </View> : null}
          <CaptureNotes label="Defect description" value={response.defect_description} disabled={disabled} scrollRef={scroll}
            onChange={text => update({ defect_description: text })} />
        </View>
        {message ? <Text accessibilityLiveRegion="polite" style={[styles.hint, error && styles.error]}>{message}</Text> : null}
        {guidance.length ? <View style={styles.section}><Text style={styles.hint}>Still needed: {guidance.join('; ')}.</Text>
          <Pressable style={styles.action} accessibilityRole="button" onPress={jumpToMissing}><Text style={styles.actionText}>Review first unfinished field</Text></Pressable></View> : null}
        {finalResult ? <AssessmentResultSection formLabel={`CVA · Affective · version ${saved.trusted.identity.form_version}${saved.historicalReadOnly ? ' · historical read-only' : ''}`} provenance={finalResult.label}
          rows={rows} expanded={breakdownExpanded} onToggle={() => setBreakdownExpanded(value => !value)} scale={scale} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
    <View style={[styles.footer, { paddingHorizontal: 26 * scale, paddingBottom: spacing.lg * scale }]}>
      <View style={styles.titleRow}><Text style={styles.footerLabel}>{finalResult && n !== 5 ? 'Total score · adapted' : 'Total score'}</Text>
        <Text style={styles.total}>{finalResult?.display_score || '—'}</Text></View>
      <FullPageButton label={dirty ? 'SAVE' : 'SCAN CUP'} onPress={dirty ? save : onScanPress}
        loading={pending || isScanInProgress} disabled={pending || isScanInProgress || (dirty ? disabled : typeof onScanPress !== 'function')}
        style={{ backgroundColor: dirty ? colors.ink : colors.action }} />
    </View>
    <ScoreBalloons animations={animations} width={width} scale={scale} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  section: { borderBottomWidth: 1, borderColor: colors.quietBorder, paddingVertical: spacing.md },
  title: { ...typography.text_section_title, color: colors.ink, flexShrink: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap' },
  rating: { borderWidth: 2.3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  ratingText: { ...typography.text_body, color: colors.ink, fontWeight: '600', lineHeight: 23 },
  selected: { backgroundColor: colors.ink }, selectedText: { color: colors.surface },
  hint: { ...typography.text_secondary_body, color: colors.inkSoft, marginVertical: spacing.xs },
  impact: { ...typography.text_body, color: colors.action },
  zeroAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  notes: { marginVertical: spacing.sm },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm },
  actionText: { ...typography.text_secondary_body, color: colors.action },
  evenChoice: { minHeight: 44, borderWidth: 1, borderColor: colors.quietBorder, borderRadius: 12, padding: spacing.sm, marginVertical: spacing.xs },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.quietBorder, paddingTop: spacing.sm, gap: spacing.md },
  total: { ...typography.text_secondary_metric, color: colors.ink },
  footerLabel: { ...typography.text_body, color: colors.ink },
  error: { color: colors.danger },
});
