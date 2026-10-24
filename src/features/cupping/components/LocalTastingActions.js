import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TypographyAuditText as Text } from '../../../components/ui/TypographyAuditText';
import { WarningDialog } from '../../../components/ui/WarningDialog';
import { adoptSavedTasting, completeLocalTasting, getLocalTastingPresentation } from '../../../data/sessionRepository';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

export const LOCAL_COMPLETION_MESSAGE = "This completes the saved tasting on this phone and reveals its blind coffee details here. It does not close anyone else's session or upload results.";
export const ADOPTION_MESSAGE = 'These saved scores have no recorded local author. Review them before using them as your tasting on this phone. The original saved record will be retained. This does not complete your tasting, reveal coffee details or share results.';

// The tokens come only from repository reads. They are stale-context checks,
// never authority supplied by a route, creator flag, or this component.
export function LocalTastingActions({ sessionId, sampleId, access, tasting, disabled = false,
  onAdopted, onCompleted, showCompletion = true }) {
  const [dialog, setDialog] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const epoch = useRef(0);
  const busy = useRef(false);
  const currentDialog = useRef(null);
  const context = `${sessionId || ''}:${sampleId || ''}:${tasting?.contextToken || ''}:${access?.sourceToken || ''}`;
  const current = useRef(context);
  current.current = context;
  useEffect(() => {
    epoch.current += 1; busy.current = false; currentDialog.current = null; setPending(false); setDialog(null); setMessage('');
    return () => { epoch.current += 1; busy.current = false; currentDialog.current = null; };
  }, [context]);
  const run = async () => {
    if (!dialog || currentDialog.current !== dialog || busy.current || disabled || dialog.context !== current.current || dialog.epoch !== epoch.current) return;
    const operation = dialog;
    const isCurrent = () => current.current === operation.context && epoch.current === operation.epoch;
    busy.current = true; setPending(true); currentDialog.current = null; setDialog(null);
    try {
      if (operation.kind === 'adopt') {
        const saved = await adoptSavedTasting({ sessionId: operation.sessionId, sampleId: operation.sampleId, expectedSourceToken: operation.sourceToken });
        if (!isCurrent()) return;
        await onAdopted?.(saved);
        if (!isCurrent()) return;
        setMessage('Saved scores are now your tasting on this phone. They have not been completed or shared.');
      } else {
        const result = await completeLocalTasting(operation.sessionId, { expectedContextToken: operation.contextToken });
        if (!isCurrent()) return;
        if (result.status !== 'complete') {
          const labels = (result.incompleteSamples || []).map(item => /^Sample \d+$/.test(item.label) ? item.label : 'Sample').join(', ');
          const warning = { ...operation, kind: 'incomplete', message: `Open each unfinished assessment, finish the required fields and tap Save before completing the session.${labels ? ` Still needed: ${labels}.` : ''}` };
          currentDialog.current = warning; setDialog(warning);
          return;
        }
        const refreshed = await getLocalTastingPresentation(operation.sessionId, { purpose: 'tasting' });
        if (!isCurrent() || refreshed?.tasting?.contextToken !== operation.contextToken) return;
        await onCompleted?.(refreshed);
        if (!isCurrent()) return;
      }
    } catch {
      if (isCurrent()) setMessage('This tasting could not be updated. Reopen and review the latest saved assessment before trying again.');
    } finally {
      if (isCurrent()) { busy.current = false; setPending(false); }
    }
  };
  const canAdopt = access?.state === 'unattributed' && access.canAdopt === true && Boolean(access.sourceToken);
  const canComplete = showCompletion && !tasting?.activeSelection && Boolean(tasting?.contextToken) && tasting?.canComplete && tasting?.started && !tasting.completed;
  const blocked = disabled || pending;
  const dismiss = expected => {
    if (currentDialog.current !== expected) return;
    currentDialog.current = null; setDialog(null);
  };
  const open = kind => {
    if (blocked || busy.current) return;
    const next = { kind, context, epoch: epoch.current, sessionId, sampleId,
      contextToken: tasting?.contextToken, sourceToken: access?.sourceToken };
    currentDialog.current = next; setDialog(next);
  };
  if (!(access && !access.canWrite) && !canAdopt && !canComplete && !message && !dialog) return null;
  return <View style={styles.container}>
    {access && !access.canWrite ? <Text style={styles.hint}>{canAdopt ? ADOPTION_MESSAGE
      : access.state === 'foreign' ? 'These saved scores belong to another local profile and are read-only.'
        : 'This saved assessment is read-only.'}</Text> : null}
    {canAdopt ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }}
      accessibilityLabel="Use these saved scores as my tasting" disabled={blocked}
      style={styles.action} onPress={() => open('adopt')}>
      <Text style={styles.actionText}>Use these saved scores as my tasting</Text></Pressable> : null}
    {canComplete ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }}
      accessibilityLabel="Complete session" disabled={blocked} style={styles.action} onPress={() => open('complete')}>
      <Text style={styles.actionText}>{pending ? 'Completing…' : 'Complete session'}</Text></Pressable> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{message}</Text> : null}
    <WarningDialog visible={Boolean(dialog) && dialog.context === context && !blocked} title={dialog?.kind === 'incomplete' ? 'Session not complete' : dialog?.kind === 'adopt' ? 'Use these saved scores?' : 'Complete session?'}
      message={dialog?.kind === 'incomplete' ? dialog.message : dialog?.kind === 'adopt' ? ADOPTION_MESSAGE : LOCAL_COMPLETION_MESSAGE}
      okLabel={dialog?.kind === 'incomplete' ? 'OK' : dialog?.kind === 'adopt' ? 'Use these saved scores as my tasting' : 'Complete session'} okButtonTextStyle={styles.confirmText}
      onOk={dialog?.kind === 'incomplete' ? () => dismiss(dialog) : run}
      secondaryLabel={dialog?.kind === 'incomplete' ? undefined : 'Cancel'} onSecondary={() => dismiss(dialog)} onDismiss={() => dismiss(dialog)} />
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, paddingVertical: spacing.sm },
  hint: { ...typography.text_secondary_body, color: colors.inkSoft },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm },
  actionText: { ...typography.text_secondary_body, color: colors.action },
  confirmText: { flexShrink: 1, textAlign: 'center' },
});
