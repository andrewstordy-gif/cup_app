import React, { useEffect, useMemo, useRef, useState } from "react";
import { tagContext as readCodeTagContext, canonicalize } from '../../../data/sampleCodeProfile';
import { BackHandler, Modal, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { ScreenFooter, ScreenFooterDual } from "../../../components/ui/ScreenFooter";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { AppIcon } from "../../../components/ui/AppIcon";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { LocalTastingActions } from '../components/LocalTastingActions';
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { cvaIdentity, formIdentity, isSessionFormReady, UNSUPPORTED_MESSAGE } from "../../forms/sessionFormRoute";
import { typography } from "../../../theme/typography";
import {
  readAndWriteNdefMinimal,
  readNdefMinimal,
} from "../../../services/nfcServiceMinimal";
import {
  NFC_TAG_TYPES,
  classifyNfcTagReadResult,
  getNfcTagIdentifier,
  isSmartCupHardwareTag,
} from "../../../services/nfcTagClassifier";
import { playNfcFailureFeedback } from "../../../services/nfcFailureFeedback";
import { logAppError } from "../../../services/errorLogger";
import { AddCoffeeSampleSheet } from "../components/AddCoffeeSampleSheet";
import { CheckSampleScreen } from "../components/CheckSampleScreen";
import { CoffeeSampleCard } from "../components/CoffeeSampleCard";
import { LegacySampleCard } from "../../forms/legacy/LegacySampleCard";
import { SessionStatusBadge } from "../../style-guide/components/SessionStatusBadge";
import { SessionTitleSummary } from "../components/SessionTitleSummary";
import { canShowSavedSessionIdentity, projectSavedSessionIdentity, projectSessionDetailsCard } from "./savedSessionIdentity";
import {
  buildCompactSessionMetadata,
  CUP_NUMBER_OPTIONS,
  CUPPING_FORM_OPTIONS,
  createPendingConflictError,
  createSample,
  doesMetadataMatchExpected,
  formatSessionDate,
  formatSessionDisplayId,
  generateSessionUUID,
  getSessionStatusBadgeLabel,
  getSessionTypeLabel,
  getCuppingFormLabel,
  normalizeCuppingModeKey,
  normalizeProcessKey,
  normalizePositiveInteger,
  normalizeSessionTypeKey,
  normalizeCupUuid,
  PENDING_CONFLICT_ERROR,
  resolveCupUUIDFromReadResult,
  SESSION_TYPE_OPTIONS,
} from "../constants/sessionDetails";
import {
  assertSessionReferenceAvailable,
  deleteSessionById,
  removeParticipantSample,
  findPendingSessionByCupUUID,
  getLocalTastingPresentation,
  getSessionSampleFinalStatus,
  saveSessionWithSamples,
  getSessionSetupAccess,
  getPendingSampleAddition,
  stagePendingSampleAddition,
  markPendingSampleAdditionWritten,
  markPendingSampleAdditionVerified,
  commitPendingSampleAddition,
} from "../../../data/sessionRepository";

const RECOVERED_SMART_CUP_TEXT3 = {
  triggerTemp: 40,
  maxStartTemp: 93,
  brewTime: 240,
  maxCupTemp: 70,
  maxTime: 3600,
  ledBrightness: 100,
};

// Only a warning decision, never saved-record identity or host authority.
function setupWarningSnapshot(input, pin) {
  return {
    cuppingForm: input.cuppingForm,
    cuppingMode: input.cuppingForm === 2 ? "open" : null,
    formKey: pin?.formKey ?? pin?.form_key,
    formVersion: pin?.formVersion ?? pin?.form_version,
    formHash: pin?.formHash ?? pin?.form_hash,
    samples: (input.samples || []).filter(sample => sample.cupUUID).map(sample => ({
      cuppingForm: sample.cuppingForm,
      cuppingMode: sample.cuppingMode,
    })),
  };
}

function SessionTypeDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
  if (!anchorRect) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.dropdownBackdrop} onPress={onDismiss} />
      <View
        style={[
          styles.dropdownMenu,
          { top: anchorRect.y + anchorRect.height, left: anchorRect.x, width: anchorRect.width },
        ]}
      >
        {SESSION_TYPE_OPTIONS.map((option, index) => (
          <Pressable
            key={option.key}
            onPress={() => {
              onSelect(String(option.key));
              onDismiss();
            }}
            style={[
              styles.dropdownOption,
              { paddingVertical: 14 * scale },
              index < SESSION_TYPE_OPTIONS.length - 1 && styles.dropdownOptionBorder,
              normalizeSessionTypeKey(selected) === option.key && styles.dropdownOptionSelected,
            ]}
            accessibilityRole="menuitem"
            accessibilityLabel={option.label}
          >
            <Text
              style={[
                styles.dropdownOptionText,
                normalizeSessionTypeKey(selected) === option.key && styles.dropdownOptionTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function SessionFormDropdown({ anchorRect, selected, onSelect, onDismiss, scale }) {
  if (!anchorRect) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.dropdownBackdrop} onPress={onDismiss} />
      <View style={[styles.dropdownMenu, { top: anchorRect.y + anchorRect.height, left: anchorRect.x, width: anchorRect.width }]}>
        {CUPPING_FORM_OPTIONS.map((option, index) => (
          <Pressable key={option.key} onPress={() => { onSelect(option.key); onDismiss(); }}
            accessibilityRole="menuitem" accessibilityLabel={option.label}
            style={[styles.dropdownOption, { paddingVertical: 14 * scale }, index < CUPPING_FORM_OPTIONS.length - 1 && styles.dropdownOptionBorder, selected === option.key && styles.dropdownOptionSelected]}>
            <Text style={[styles.dropdownOptionText, selected === option.key && styles.dropdownOptionTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function canRepairSmartCupNdefShape(tagClassification) {
  return (
    tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
    tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
    tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG
  );
}

function buildRecoveredSmartCupText2(tag) {
  return {
    u: getNfcTagIdentifier(tag),
    t: 0,
    m: 0,
    b: 0,
  };
}

export function CuppingSessionDetailsScreen({
  onBackPress,
  onSaveSuccess,
  onOpenSample,
  onScanCupForAssessment,
  quickStartSessionTypeKey,
  onQuickStartSampleReady,
  sessionId = null,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [sessionUUID, setSessionUUID] = useState("");
  const [sessionDisplayId, setSessionDisplayId] = useState("");
  const savedSessionIdRef = useRef(sessionId);
  const [sessionDate, setSessionDate] = useState(() => formatSessionDate(new Date()));
  const [sessionName, setSessionName] = useState("");
  const [sessionType, setSessionType] = useState(null);
  const [samplesInSession, setSamplesInSession] = useState("");
  const [sessionStatus, setSessionStatus] = useState("pending");
  const sessionTypeRowRef = useRef(null);
  const sessionFormRowRef = useRef(null);
  const [sessionTypeAnchor, setSessionTypeAnchor] = useState(null);
  const [sessionFormAnchor, setSessionFormAnchor] = useState(null);

  const [samples, setSamples] = useState([]);
  const [participantRemoval, setParticipantRemoval] = useState(null);
  const participantRemovalRef = useRef(null);
  const participantRemovalBusyRef = useRef(null);
  const [isRemovingParticipantSample, setIsRemovingParticipantSample] = useState(false);

  const [isAddSheetVisible, setIsAddSheetVisible] = useState(false);
  const [sheetCoffeeNameOrigin, setSheetCoffeeNameOrigin] = useState("");
  const [sheetProcess, setSheetProcess] = useState("");
  const [sheetCupNumber, setSheetCupNumber] = useState(5);
  const [isSheetCupNumberDefault, setIsSheetCupNumberDefault] = useState(true);
  const [sessionForm, setSessionForm] = useState(() => sessionId || !quickStartSessionTypeKey ? null : cvaIdentity());
  const [sessionMode, setSessionMode] = useState(null);
  const [savedOpenEvidence, setSavedOpenEvidence] = useState(null);
  const [setupAccess, setSetupAccess] = useState(null);
  const [tastingPresentation, setTastingPresentation] = useState(null);
  const [presentationRevision, setPresentationRevision] = useState(0);
  const ownsSavedSetup = setupAccess?.sessionId === sessionId && setupAccess.canManageSetup;
  const [sheetCuppingMode, setSheetCuppingMode] = useState("blind");
  const [isSheetCuppingModeDefault, setIsSheetCuppingModeDefault] = useState(true);
  const [sheetErrors, setSheetErrors] = useState({});
  const [editingSampleId, setEditingSampleId] = useState(null);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [isNfcWriting, setIsNfcWriting] = useState(false);
  const [verifyingSampleId, setVerifyingSampleId] = useState(null);
  const [rewritingSampleId, setRewritingSampleId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveOperationRef = useRef(null);
  const setupEpochRef = useRef(0);
  const setupContinuationRef = useRef(false);
  const savedSetupSnapshotRef = useRef(null);
  const savedSetupInputKeyRef = useRef(null);
  const currentSetupInputKeyRef = useRef(null);
  const pendingSetupExitRef = useRef(null);
  const [setupExitMessage, setSetupExitMessage] = useState("");
  const [isSessionDirty, setIsSessionDirty] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [overwriteDialogMessage, setOverwriteDialogMessage] = useState("");
  const [isOverwriteDialogVisible, setIsOverwriteDialogVisible] = useState(false);
  const [cupBlockedMessage, setCupBlockedMessage] = useState("");
  const [completeSessionMessage, setCompleteSessionMessage] = useState("");
  const [isCompleteSessionDialogVisible, setIsCompleteSessionDialogVisible] = useState(false);
  const completionBusyRef = useRef(null);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [sampleStatusById, setSampleStatusById] = useState({});
  const [checkingSampleId, setCheckingSampleId] = useState(null);
  const [checkSampleStatus, setCheckSampleStatus] = useState("pending");
  const [isCheckingCup, setIsCheckingCup] = useState(false);
  const quickStartAddSheetOpenedRef = useRef(false);
  const pendingQuickStartReadyRef = useRef(null);
  const pendingVerifiedQuickStartRef = useRef(null);
  const pendingCheckSampleOverridesRef = useRef({});
  const pendingAdditionRef = useRef(null);
  const verifiedObservationRef = useRef(null);
  const pendingAdditionBusyRef = useRef(null);
  const reopenPendingDrawerRef = useRef(false);
  const [pendingSaveError, setPendingSaveError] = useState("");
  const quickStartSessionTypeValue = normalizeSessionTypeKey(quickStartSessionTypeKey);
  const isQuickStartSession = !sessionId && Boolean(quickStartSessionTypeValue);
  const sampleIdsKey = useMemo(
    () => samples.map((sample) => sample.id).join("|"),
    [samples]
  );
  const isSessionComplete = sessionStatus === "complete";
  const visibleIdentity = useMemo(() => tastingPresentation?.session?.id === sessionId ? {
    identityHidden: tastingPresentation.identityHidden,
    sessionName,
    sessionType: getSessionTypeLabel(sessionType),
    sessionDate,
    samples,
  } : projectSavedSessionIdentity({
    cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f,
    formKey: sessionForm?.formKey,
    formVersion: sessionForm?.formVersion,
    formHash: sessionForm?.formHash,
    cuppingMode: sessionMode,
    sessionName,
    sessionType,
    sessionDate,
    samples,
  }, { allowOpen: savedOpenEvidence?.sessionId === sessionId && savedOpenEvidence.allowOpen }),
  [sessionForm, sessionMode, sessionName, sessionType, sessionDate, samples, savedOpenEvidence, sessionId, tastingPresentation]);
  const hideSavedIdentity = Boolean(sessionId) && visibleIdentity.identityHidden;
  const sessionStatusBadgeLabel = getSessionStatusBadgeLabel({
    status: isSessionDirty ? 'new' : sessionStatus,
    sessionId,
    tastingPresentation,
    samples,
    sampleStatusById,
    isSessionComplete: isSessionComplete && tastingPresentation?.session?.id === sessionId,
  });
  const canCompleteSession = sessionStatusBadgeLabel === "In Progress";

  useEffect(() => {
    setupEpochRef.current += 1;
    if (pendingAdditionBusyRef.current) pendingAdditionBusyRef.current.cancelled = true;
    pendingAdditionRef.current = null;
    pendingVerifiedQuickStartRef.current = null;
    reopenPendingDrawerRef.current = false;
    setPendingSaveError("");
    setupContinuationRef.current = false;
    savedSetupSnapshotRef.current = null;
    savedSetupInputKeyRef.current = null;
    pendingSetupExitRef.current = null;
    saveOperationRef.current = null;
    completionBusyRef.current = null;
    participantRemovalRef.current = null;
    setParticipantRemoval(null);
    setIsRemovingParticipantSample(false);
    setSetupExitMessage("");
    setIsSaving(false);
    setIsCompletingSession(false);
    return () => {
      setupEpochRef.current += 1;
      if (pendingAdditionBusyRef.current) pendingAdditionBusyRef.current.cancelled = true;
      pendingVerifiedQuickStartRef.current = null;
      pendingSetupExitRef.current = null;
      saveOperationRef.current = null;
      completionBusyRef.current = null;
    };
  }, [sessionId, quickStartSessionTypeValue]);

  const requestSetupExit = (action) => {
    const pendingSetupWork = saveOperationRef.current || pendingAdditionBusyRef.current || isNfcWriting || isCheckingCup ||
      isCompletingSession || isDeleting || participantRemovalBusyRef.current || isRemovingParticipantSample || verifyingSampleId || rewritingSampleId;
    if (!setupContinuationRef.current && !pendingSetupWork && !isSessionDirty) return action?.();
    if (pendingSetupWork) {
      setScanStatusMessage("Please wait for saving or cup setup to finish before leaving.");
      return;
    }
    const hasUnsavedSetupChanges = savedSetupInputKeyRef.current !== null
      ? savedSetupInputKeyRef.current !== currentSetupInputKeyRef.current : isSessionDirty;
    if (hasUnsavedSetupChanges) {
      pendingSetupExitRef.current = { action, epoch: setupEpochRef.current };
      setSetupExitMessage("Saved records will remain. Changes since your last Save will not be retained. Stay to finish setup?");
      return;
    }
    return action?.();
  };
  const stayInSetup = () => {
    pendingSetupExitRef.current = null;
    setSetupExitMessage("");
  };
  const leaveSetup = () => {
    if (saveOperationRef.current || pendingAdditionBusyRef.current || isNfcWriting || isCheckingCup ||
        isCompletingSession || isDeleting || verifyingSampleId || rewritingSampleId) return;
    const pending = pendingSetupExitRef.current;
    stayInSetup();
    if (pending?.epoch === setupEpochRef.current) pending.action?.();
  };

  useEffect(() => {
    const ready = pendingVerifiedQuickStartRef.current;
    if (!ready || isCheckingCup || pendingAdditionBusyRef.current || !samples.some(sample => sample.id === ready.sample.id)) return;
    pendingVerifiedQuickStartRef.current = null;
    requestSetupExit(() => onQuickStartSampleReady?.(ready));
  }, [samples, isCheckingCup, requestSetupExit, onQuickStartSampleReady]);

  useEffect(() => {
    if (!setupContinuationRef.current && !saveOperationRef.current?.protectSetup && !isSessionDirty) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestSetupExit(onBackPress);
      return true;
    });
    return () => subscription.remove();
  }, [requestSetupExit, onBackPress]);

  useEffect(() => {
    let isCancelled = false;

    const loadSessionForEditing = async () => {
      setSetupAccess(null);
      setTastingPresentation(null);
      setSamples([]);
      setIsAddSheetVisible(false);
      setEditingSampleId(null);
      setSheetCoffeeNameOrigin('');
      setSheetProcess('');
      if (!sessionId) {
        let nextSessionUUID;
        try {
          nextSessionUUID = generateSessionUUID();
        } catch (error) {
          if (!isCancelled) {
            setSessionUUID("");
            setSessionDisplayId("");
            setScanStatusMessage(error?.message || "Secure session reference is unavailable.");
          }
          return;
        }
        if (isCancelled) {
          return;
        }

        savedSessionIdRef.current = null;
        setSessionUUID(nextSessionUUID);
        setSessionDisplayId(formatSessionDisplayId(nextSessionUUID));
        setSessionDate(formatSessionDate(new Date()));
        setSessionName("");
        setSessionType(quickStartSessionTypeValue ? String(quickStartSessionTypeValue) : null);
        setSamplesInSession("");
        setSessionStatus("new");
        setSessionForm(quickStartSessionTypeValue ? cvaIdentity() : null);
        setSessionMode(null);
        setSavedOpenEvidence(null);
        setSamples([]);
        setIsSessionDirty(false);
        setSessionTypeAnchor(null);
        setScanStatusMessage("");
        quickStartAddSheetOpenedRef.current = false;
        return;
      }

      try {
        const presentation = await getLocalTastingPresentation(sessionId, { purpose: 'setup' });
        const access = presentation.tasting;
        const loaded = presentation.session;
        if (!loaded || isCancelled) {
          return;
        }

        const loadedUuid = loaded.sessionUUID || loaded.id || generateSessionUUID();
        savedSessionIdRef.current = loaded.id;
        setSetupAccess({ sessionId, ...access });
        setTastingPresentation(presentation);
        setSessionUUID(loadedUuid);
        setSessionDisplayId(loaded.sessionDisplayId || formatSessionDisplayId(loadedUuid));
        setSessionDate(loaded.sessionDate ?? "");
        setSessionName(loaded.sessionName || "");
        setSessionType(loaded.sessionType ?? null);
        setSamplesInSession(String(loaded.samplesInSession || ""));
        setSessionStatus(loaded.status || "pending");
        setSessionForm({
          loadedSessionId: loaded.id,
          cuppingForm: loaded.cuppingForm,
          formKey: loaded.formKey,
          formVersion: loaded.formVersion,
          formHash: loaded.formHash,
          formLocked: Number(loaded.formLocked) === 1,
        });
        setSessionMode(loaded.cuppingMode || null);
        setSavedOpenEvidence({ sessionId, allowOpen: canShowSavedSessionIdentity(loaded) });
        setIsSessionDirty(false);
        setSamples(
          (loaded.samples || []).map((sample) =>
            ({
              ...createSample({
                id: sample.id,
                coffeeNameOrigin: sample.coffeeNameOrigin,
                process: sample.process,
                cupUUID: sample.cupUUID,
                cupNumber: sample.cupNumber,
                cuppingForm: sample.cuppingForm,
                sampleNumber: sample.sampleNumber,
                sampleCode: sample.sampleCode,
                verificationStatus: sample.verificationStatus,
              }),
              cuppingMode: normalizeCuppingModeKey(sample.cuppingMode),
              identityHidden: sample.identityHidden,
              localRemoval: sample.localRemoval,
            })
          )
        );
        setSessionTypeAnchor(null);
        if (access.canManageSetup) {
          const pending = await getPendingSampleAddition(loaded.id);
          if (isCancelled) return;
          if (pending) {
            pendingAdditionRef.current = pending;
            restorePendingAdditionFields(pending);
            setIsSessionDirty(true);
          }
        }
        setScanStatusMessage("Loaded saved session.");
      } catch (error) {
        void logAppError({
          screen: "CuppingSessionDetails",
          route: "Cupping Session Details",
          flow: "load_session",
          friendlyMessage: "Failed to load session.",
          error: new Error("Failed to load session."),
        });
        if (!isCancelled) {
          setSetupAccess({ sessionId, canManageSetup: false, failed: true });
          setScanStatusMessage("Failed to load session.");
        }
      }
    };

    loadSessionForEditing();

    return () => {
      isCancelled = true;
    };
  }, [sessionId, quickStartSessionTypeValue, presentationRevision]);

  useEffect(() => {
    let isCancelled = false;

    const loadSampleStatuses = async () => {
      if (!sessionId) {
        setSampleStatusById({});
        return;
      }

      try {
        const statusMap = await getSessionSampleFinalStatus(sessionId);
        if (!isCancelled) {
          setSampleStatusById(statusMap || {});
        }
      } catch (error) {
        void logAppError({
          screen: "CuppingSessionDetails",
          route: "Cupping Session Details",
          flow: "load_sample_statuses",
          friendlyMessage: "Could not load sample completion status.",
          error: new Error("Could not load sample completion status."),
        });
        if (!isCancelled) {
          setScanStatusMessage("Could not load sample completion status.");
        }
      }
    };

    loadSampleStatuses();

    return () => {
      isCancelled = true;
    };
  }, [sessionId, sampleIdsKey]);

  const formState = useMemo(
    () => ({
      sessionUUID,
      sessionDisplayId,
      sessionDate,
      sessionName,
      sessionType,
      samplesInSession,
      status: sessionStatus,
      cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f,
      cuppingMode: sessionMode,
      samples,
    }),
    [
      sessionUUID,
      sessionDisplayId,
      sessionDate,
      sessionName,
      sessionType,
      samplesInSession,
      sessionStatus,
      sessionForm,
      sessionMode,
      samples,
    ]
  );
  currentSetupInputKeyRef.current = JSON.stringify(formState);
  const isSessionLocked = samples.length > 0 || Boolean(sessionForm?.formLocked) || Boolean(pendingAdditionRef.current);
  const selectedForm = sessionForm?.cuppingForm ?? sessionForm?.f;
  const isLegacy = selectedForm === 2;
  const isSessionFormSupported = isSessionFormReady(sessionId, sessionForm) && (!isLegacy || sessionMode === 'open');
  const isSessionFormLoading = Boolean(sessionId) && sessionForm?.loadedSessionId !== sessionId;
  const canEditSessionSetup = !sessionId || (isSessionFormSupported && ownsSavedSetup);
  const canSelectSessionForm = !isSessionLocked && !isQuickStartSession && canEditSessionSetup;

  const openSessionFormMenu = () => {
    if (!canSelectSessionForm) return;
    sessionFormRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setSessionFormAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };
  const selectSessionForm = (f) => {
    if (!canSelectSessionForm) return;
    const pin = formIdentity(f);
    setSessionForm(sessionId ? { loadedSessionId: sessionId, cuppingForm: f, formKey: pin.form_key, formVersion: pin.form_version, formHash: pin.form_hash } : pin);
    setSessionMode(f === 2 ? 'open' : null);
    setScanStatusMessage(f === 2 ? 'Legacy currently supports Open Cupping only. Blind tasting is not yet available in this prototype.' : '');
    setIsSessionDirty(true);
  };

  const openSessionTypeMenu = () => {
    if (isSessionLocked || !canEditSessionSetup) {
      return;
    }

    sessionTypeRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setSessionTypeAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const handleUpdateSample = (sampleId, field, value) => {
    if (!canEditSessionSetup) return;
    setIsSessionDirty(true);
    setSamples((prev) =>
      prev.map((sample) => {
        if (sample.id !== sampleId) {
          return sample;
        }
        if (sampleStatusById?.[sample.id]?.isComplete) {
          return sample;
        }
        return { ...sample, [field]: value };
      })
    );
  };

  const handleRemoveSample = (sampleId) => {
    const permission = samples.find(sample=>sample.id===sampleId)?.localRemoval;
    if (permission?.canRemove && permission.removalToken && !participantRemovalBusyRef.current && savedSessionIdRef.current === sessionId && tastingPresentation?.session?.id === sessionId) {
      const candidate = { sessionId, sampleId, token:permission.removalToken, label:permission.label, epoch:setupEpochRef.current };
      participantRemovalRef.current = candidate;
      setParticipantRemoval(candidate);
      return;
    }
    if (!canEditSessionSetup) return;
    setIsSessionDirty(true);
    setSamples((prev) => prev.filter((sample) => sample.id !== sampleId));
  };

  const dismissParticipantRemoval = (expected = participantRemovalRef.current, settled = false) => {
    if (participantRemovalRef.current !== expected || participantRemovalBusyRef.current && !settled) return;
    participantRemovalRef.current = null;
    setParticipantRemoval(null);
  };
  const confirmParticipantRemoval = async (expected = participantRemovalRef.current) => {
    const candidate = participantRemovalRef.current;
    if (!candidate || candidate !== expected || participantRemovalBusyRef.current || candidate.sessionId !== sessionId || savedSessionIdRef.current !== sessionId || candidate.epoch !== setupEpochRef.current) return;
    participantRemovalBusyRef.current = candidate;
    setIsRemovingParticipantSample(true);
    try {
      const result = await removeParticipantSample({sessionId:candidate.sessionId,sampleId:candidate.sampleId,expectedRemovalToken:candidate.token});
      if (candidate.epoch !== setupEpochRef.current || participantRemovalRef.current !== candidate) return;
      setTastingPresentation(result.presentation);
      setSamples(result.presentation.session.samples);
      setSessionStatus(result.presentation.session.status);
      setSetupAccess({sessionId:candidate.sessionId,...result.presentation.tasting});
      setSampleStatusById(result.statuses);
      setIsSessionDirty(false);
      dismissParticipantRemoval(candidate, true);
      setPresentationRevision(value=>value+1);
    } catch {
      if (candidate.epoch !== setupEpochRef.current || participantRemovalRef.current !== candidate) return;
      dismissParticipantRemoval(candidate, true);
      setScanStatusMessage('Could not remove this local sample. Reopen the session and try again.');
      setPresentationRevision(value=>value+1);
    } finally {
      if (participantRemovalBusyRef.current === candidate) participantRemovalBusyRef.current = null;
      if (candidate.epoch === setupEpochRef.current) setIsRemovingParticipantSample(false);
    }
  };

  const setSampleVerificationStatus = (sampleId, verificationStatus) => {
    setSamples((prev) =>
      prev.map((sample) =>
        sample.id === sampleId
          ? {
              ...sample,
              verificationStatus,
            }
          : sample
      )
    );
  };

  const restorePendingAdditionFields = (pending) => {
    const sample = pending.candidate;
    setEditingSampleId(null);
    setSheetCoffeeNameOrigin(sample.coffeeNameOrigin);
    setSheetProcess(sample.process);
    setSheetCupNumber(sample.cupNumber);
    setIsSheetCupNumberDefault(false);
    setSheetCuppingMode(sample.cuppingMode);
    setIsSheetCuppingModeDefault(false);
    setSessionName(pending.saveInput.sessionName);
    setSessionType(pending.saveInput.sessionType);
    setSheetErrors({});
    setCupBlockedMessage("");
  };
  const pendingFieldsUnchanged = (pending) => pending.candidate.coffeeNameOrigin === sheetCoffeeNameOrigin.trim() &&
    String(pending.candidate.process) === String(normalizeProcessKey(sheetProcess)) &&
    pending.candidate.cupNumber === sheetCupNumber && pending.candidate.cuppingMode === normalizeCuppingModeKey(sheetCuppingMode);
  const handleOpenAddSheet = () => {
    if (!canEditSessionSetup) return;
    if (saveOperationRef.current || pendingAdditionBusyRef.current) return;
    if (pendingAdditionRef.current) {
      restorePendingAdditionFields(pendingAdditionRef.current);
      setIsAddSheetVisible(true);
      return;
    }
    if (hideSavedIdentity) {
      setScanStatusMessage("Sample setup is unavailable here until a host-only view is available.");
      return;
    }
    if (!isSessionFormSupported) {
      setScanStatusMessage(UNSUPPORTED_MESSAGE);
      return;
    }
    setEditingSampleId(null);
    setSheetCoffeeNameOrigin("");
    setSheetProcess("");
    setSheetCupNumber(5);
    setIsSheetCupNumberDefault(true);
    setSheetCuppingMode(isLegacy ? "open" : "blind");
    setIsSheetCuppingModeDefault(!isLegacy);
    setSheetErrors({});
    setScanStatusMessage("");
    setCupBlockedMessage("");
    setIsAddSheetVisible(true);
  };

  useEffect(() => {
    if (
      !isQuickStartSession ||
      quickStartAddSheetOpenedRef.current ||
      samples.length > 0 ||
      isAddSheetVisible
    ) {
      return;
    }

    quickStartAddSheetOpenedRef.current = true;
    handleOpenAddSheet();
  }, [isAddSheetVisible, isQuickStartSession, samples.length]);

  const handleCloseAddSheet = () => {
    if (pendingAdditionBusyRef.current?.kind === 'write') pendingAdditionBusyRef.current.cancelled = true;
    setIsAddSheetVisible(false);
    setEditingSampleId(null);
    setSheetErrors({});
    setScanStatusMessage("");
    setCupBlockedMessage("");
  };

  const handleOpenEditSheet = (sample) => {
    if (!canEditSessionSetup) return;
    if (pendingAdditionRef.current) { handleOpenAddSheet(); return; }
    if (hideSavedIdentity || !isSessionFormSupported || !sample || sampleStatusById?.[sample.id]?.isComplete) {
      return;
    }

    setEditingSampleId(sample.id);
    setSheetCoffeeNameOrigin(sample.coffeeNameOrigin || "");
    setSheetProcess(sample.process || "");
    setIsSheetCupNumberDefault(false);
    setSheetCupNumber(
      CUP_NUMBER_OPTIONS.includes(Number(sample.cupNumber)) ? Number(sample.cupNumber) : 5
    );
    setSheetCuppingMode(normalizeCuppingModeKey(sample.cuppingMode));
    setIsSheetCuppingModeDefault(false);
    setSheetErrors({});
    setScanStatusMessage("");
    setCupBlockedMessage("");
    setIsAddSheetVisible(true);
  };

  const validateAddSheet = () => {
    const nextErrors = {};

    if (!sheetCoffeeNameOrigin.trim()) {
      nextErrors.coffeeNameOrigin = "Coffee Name / Origin is required.";
    }

    if (!normalizeProcessKey(sheetProcess)) {
      nextErrors.process = "Process is required.";
    }

    if (!CUP_NUMBER_OPTIONS.includes(sheetCupNumber)) {
      nextErrors.cupNumber = "Cup number must be between 1 and 5.";
    }

    setSheetErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateEditSheet = () => {
    const nextErrors = {};

    if (!sheetCoffeeNameOrigin.trim()) {
      nextErrors.coffeeNameOrigin = "Coffee Name / Origin is required.";
    }

    if (!normalizeProcessKey(sheetProcess)) {
      nextErrors.process = "Process is required.";
    }

    setSheetErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSaveEditedSample = async () => {
    if (!canEditSessionSetup) return;
    if (hideSavedIdentity || !isSessionFormSupported || !editingSampleId || !validateEditSheet()) {
      return;
    }
    if (isLegacy && (sessionMode !== 'open' || sheetCuppingMode !== 'open')) {
      setScanStatusMessage('Legacy Blind Cupping is not yet available. No cup was written.');
      return;
    }

    const editedSampleId = editingSampleId;
    const overrides = {
      coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
      process: String(normalizeProcessKey(sheetProcess)),
      cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f,
      cuppingMode: normalizeCuppingModeKey(sheetCuppingMode),
    };

    setIsNfcWriting(true);
    const didRewriteCup = await handleRewriteSample(editedSampleId, overrides);
    setIsNfcWriting(false);

    if (!didRewriteCup) {
      return;
    }

    handleUpdateSample(editedSampleId, "coffeeNameOrigin", sheetCoffeeNameOrigin.trim());
    handleUpdateSample(editedSampleId, "process", String(normalizeProcessKey(sheetProcess)));
    handleUpdateSample(editedSampleId, "cuppingMode", normalizeCuppingModeKey(sheetCuppingMode));
    pendingCheckSampleOverridesRef.current = {
      ...pendingCheckSampleOverridesRef.current,
      [editedSampleId]: overrides,
    };
    setIsSessionDirty(true);
    setIsAddSheetVisible(false);
    setEditingSampleId(null);
    setSheetErrors({});
    setCheckingSampleId(editedSampleId);
    setCheckSampleStatus("pending");
  };

  const assertPendingCodeDispatch = async (operationId,epoch) => {
    if(epoch!==setupEpochRef.current||pendingAdditionBusyRef.current?.cancelled)throw new Error('Session setup changed. No cup was written.');
    const current=await getPendingSampleAddition(savedSessionIdRef.current);
    if(epoch!==setupEpochRef.current||pendingAdditionBusyRef.current?.cancelled||current?.operationId!==operationId||current.phase!=='check')throw new Error('Pending sample changed. No cup was written.');
  };

  const handleScanCup = async () => {
    const setupEpoch = setupEpochRef.current;
    if (pendingAdditionBusyRef.current || saveOperationRef.current) return;
    setCupBlockedMessage("");
    if (!canEditSessionSetup) {
      setScanStatusMessage("Session setup is read-only on this profile.");
      return;
    }
    if (!isSessionFormSupported || samples.some((sample) => sample.cuppingForm !== selectedForm)) {
      setScanStatusMessage(UNSUPPORTED_MESSAGE);
      return;
    }
    if (isLegacy && (sessionMode !== 'open' || sheetCuppingMode !== 'open')) {
      setScanStatusMessage('Legacy Blind Cupping is not yet available. No cup was written.');
      return;
    }
    if (!validateAddSheet()) {
      return;
    }
    if (pendingAdditionRef.current?.phase === 'verified' && pendingFieldsUnchanged(pendingAdditionRef.current)) {
      if (isQuickStartSession && samples.length === 0 && typeof onQuickStartSampleReady === 'function') {
        pendingQuickStartReadyRef.current = { sessionId: sessionUUID, sample: pendingAdditionRef.current.candidate };
      }
      setPendingSaveError("");
      setIsAddSheetVisible(false);
      setCheckingSampleId(pendingAdditionRef.current.candidate.id);
      setCheckSampleStatus("pending");
      return;
    }

    const effectiveSessionName = isQuickStartSession ? sheetCoffeeNameOrigin.trim() : sessionName.trim();
    const effectiveSessionType = isQuickStartSession ? String(quickStartSessionTypeValue) : sessionType;
    const isFirstQuickStartSample = isQuickStartSession && samples.length === 0;

    if (!isQuickStartSession && !effectiveSessionName) {
      setScanStatusMessage("Please enter Session Name before scanning cup.");
      return;
    }

    const additionOperation = { epoch: setupEpoch, cancelled: false, kind: 'write' };
    pendingAdditionBusyRef.current = additionOperation;
    setIsNfcWriting(true);

    try {
      if (!pendingAdditionRef.current) {
        // Trust the locally pinned Open mode even before the first cup exists.
        const saved = await saveSessionWithSamples({ ...formState, sessionName: effectiveSessionName,
          sessionType: effectiveSessionType, existingSessionId: savedSessionIdRef.current, intent: 'setup' });
        if (setupEpoch !== setupEpochRef.current) return;
        savedSessionIdRef.current = saved.sessionId;
        setSessionStatus(saved.status);
      }
      if (setupEpoch !== setupEpochRef.current) return;
      if (!(await getSessionSetupAccess(savedSessionIdRef.current)).canManageSetup) throw new Error('Session setup is read-only on this profile.');
      await assertSessionReferenceAvailable(sessionUUID, savedSessionIdRef.current);
      setScanStatusMessage("Scan cup to write session data...");
      const writeResult = await readAndWriteNdefMinimal(async (result) => {
        if (setupEpoch !== setupEpochRef.current || !(await getSessionSetupAccess(savedSessionIdRef.current)).canManageSetup) throw new Error('Session setup changed. No cup was written.');
        await assertSessionReferenceAvailable(sessionUUID, savedSessionIdRef.current);
        const parsed = result?.parsed || {};
        const tag = result?.tag;
        const tagClassification = classifyNfcTagReadResult(result);
        const isSmartCupHardware = isSmartCupHardwareTag(tag);
        const isRepairableSmartCup =
          isSmartCupHardware &&
          tagClassification.type !== NFC_TAG_TYPES.SMART_CUP &&
          canRepairSmartCupNdefShape(tagClassification);
        if (isRepairableSmartCup) throw new Error('Incomplete Smart Cup records are not supported by this test. No cup was written.');
        if (isSmartCupHardware && tagClassification.type !== NFC_TAG_TYPES.SMART_CUP && !isRepairableSmartCup) {
          throw new Error("Smart cup records could not be read. Please retry and hold the phone still.");
        }
        const canUseNtagIdentifier =
          !isSmartCupHardware &&
          (tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
            tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
            tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG);
        const detectedCupUUID =
          tagClassification.type === NFC_TAG_TYPES.SMART_CUP
            ? getNfcTagIdentifier(tag)
            : isRepairableSmartCup
              ? getNfcTagIdentifier(tag)
            : canUseNtagIdentifier
              ? getNfcTagIdentifier(tag)
              : null;
        if (!detectedCupUUID) {
          throw new Error("NFC tag format is not recognised yet. Please scan a smart cup or NTAG sticker.");
        }

        const normalizedDetectedCupUUID = normalizeCupUuid(detectedCupUUID);
        const conflictingSession = await findPendingSessionByCupUUID({
          cupUUID: normalizedDetectedCupUUID,
          excludeSessionId: sessionUUID,
        });

        if (conflictingSession) {
          throw createPendingConflictError();
        }

        const duplicateIndex = samples.findIndex(
          (sample) => normalizeCupUuid(sample.cupUUID) === normalizedDetectedCupUUID
        );
        if (duplicateIndex !== -1) throw new Error('This cup already has a sample in this session. Use another cup.');
        const sampleNumber = duplicateIndex === -1 ? samples.length + 1 : duplicateIndex + 1;
        const sessionSampleCount = Math.max(
          normalizePositiveInteger(samplesInSession, 0),
          samples.length + 1
        );
        const isNtagCup =
          !isSmartCupHardware &&
          (tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
            tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
            tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG);
        let sessionMetadata = buildCompactSessionMetadata({
          coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
          process: normalizeProcessKey(sheetProcess),
          cupNumber: sheetCupNumber,
          samplesInSession: sessionSampleCount,
          sampleNumber,
          cuppingMode: normalizeCuppingModeKey(sheetCuppingMode),
          cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f,
          sessionName: effectiveSessionName,
          sessionType: normalizeSessionTypeKey(effectiveSessionType),
          sessionDate,
          sessionUUID,
        });
        let nextSamples =
          duplicateIndex === -1
            ? [
                ...samples,
                {
                  ...createSample({
                    id: pendingAdditionRef.current?.candidate.id,
                    coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
                    process: String(normalizeProcessKey(sheetProcess)),
                    cupUUID: normalizedDetectedCupUUID,
                    cupNumber: sheetCupNumber,
                    cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f,
                    sampleNumber,
                    verificationStatus: "pending",
                  }),
                  cuppingMode: normalizeCuppingModeKey(sheetCuppingMode),
                },
              ]
            : samples.map((sample, index) =>
                index === duplicateIndex
                  ? {
                      ...sample,
                      coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
                      process: String(normalizeProcessKey(sheetProcess)),
                      cupUUID: normalizedDetectedCupUUID,
                      cupNumber: sheetCupNumber,
                      cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f,
                      cuppingMode: normalizeCuppingModeKey(sheetCuppingMode),
                      sampleNumber,
                      verificationStatus: "pending",
                    }
                  : sample
              );

        const candidate = duplicateIndex === -1 ? nextSamples[nextSamples.length - 1] : nextSamples[duplicateIndex];
        const pending = await stagePendingSampleAddition({
          tagContext: readCodeTagContext(result),
          observedMetadata: tagClassification.metadataPayload,
          sessionId: savedSessionIdRef.current,
          expectedOperationId: pendingAdditionRef.current?.operationId ?? null,
          candidate,
          payload: sessionMetadata,
          saveInput: { sessionUUID, existingSessionId: savedSessionIdRef.current,
            cuppingForm: sessionForm?.cuppingForm ?? sessionForm?.f, cuppingMode: sessionMode,
            sessionDisplayId, sessionDate, sessionName: effectiveSessionName, sessionType: effectiveSessionType,
            samplesInSession: sessionSampleCount, status: sessionStatus, samples: nextSamples, intent: 'setup' },
        });
        sessionMetadata = pending.payload;
        nextSamples = pending.saveInput.samples;
        if (setupEpoch === setupEpochRef.current) pendingAdditionRef.current = pending;
        if (setupEpoch !== setupEpochRef.current || additionOperation.cancelled) throw new Error('Session setup changed. No cup was written.');
        return {
          metadataOnly: isNtagCup,
          beforeWrite: () => assertPendingCodeDispatch(pending.operationId,setupEpoch),
          records: isNtagCup
            ? { text4: sessionMetadata }
            : {
                text1: {
                  ...(tagClassification.type === NFC_TAG_TYPES.SMART_CUP ? parsed?.text1 || {} : {}),
                  state: 1,
                },
                text2: {},
                text3: tagClassification.type === NFC_TAG_TYPES.SMART_CUP ? parsed?.text3 : RECOVERED_SMART_CUP_TEXT3,
                text4: sessionMetadata,
              },
          result: {
            duplicateIndex,
            normalizedDetectedCupUUID,
            nextSamples,
          },
        };
      });
      if (setupEpoch !== setupEpochRef.current || additionOperation.cancelled || !(await getSessionSetupAccess(savedSessionIdRef.current)).canManageSetup) {
        setPresentationRevision(value => value + 1);
        return;
      }
      const writtenPending = await markPendingSampleAdditionWritten({
        sessionId: savedSessionIdRef.current,
        operationId: pendingAdditionRef.current.operationId,
      });
      if (setupEpoch === setupEpochRef.current) pendingAdditionRef.current = writtenPending;
      if (setupEpoch !== setupEpochRef.current || additionOperation.cancelled) return;
      const {
        duplicateIndex,
        normalizedDetectedCupUUID,
        nextSamples,
      } = writeResult.result || {};

      setSessionName(effectiveSessionName);
      setIsSessionDirty(true);
      setPendingSaveError("");

      const writtenSample =
        duplicateIndex !== -1
          ? nextSamples[duplicateIndex]
          : nextSamples[nextSamples.length - 1];
      setIsAddSheetVisible(false);
      if (duplicateIndex !== -1) {
        setScanStatusMessage(`Cup UUID ${normalizedDetectedCupUUID} overwritten. Check the cup to confirm.`);
      } else {
        setScanStatusMessage(`Cup ${normalizedDetectedCupUUID} written. Check the cup to add the sample.`);
      }
      if (
        isFirstQuickStartSample &&
        duplicateIndex === -1 &&
        typeof onQuickStartSampleReady === "function"
      ) {
        pendingQuickStartReadyRef.current = {
          sessionId: sessionUUID,
          sample: writtenSample,
        };
      }
      setCheckingSampleId(writtenSample?.id || null);
      setCheckSampleStatus("pending");
    } catch (error) {
      const safeError = error?.code === PENDING_CONFLICT_ERROR ? createPendingConflictError() : error;
      const message = safeError?.message || "NFC write failed.";
      const normalizedMessage = String(message).toLowerCase();
      const isUserCancelled =
        normalizedMessage.includes("scan cancelled") ||
        normalizedMessage.includes("session was cancelled");

      await playNfcFailureFeedback(safeError);
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "scan_add_sample",
        friendlyMessage: safeError?.code === PENDING_CONFLICT_ERROR ? message : "NFC cup assignment failed.",
        error: safeError?.code === PENDING_CONFLICT_ERROR ? safeError : new Error("NFC cup assignment failed."),
        context: {
          assignmentConflict: safeError?.code === PENDING_CONFLICT_ERROR,
        },
      });
      if (isUserCancelled) {
        setScanStatusMessage("");
      } else if (safeError?.code === PENDING_CONFLICT_ERROR) {
        const userMessage = message;
        // Keep the sheet open and show the conflict beside the retry action.
        // A second iOS modal can disappear behind the dismissing sheet.
        setCupBlockedMessage(userMessage);
        setScanStatusMessage(userMessage);
      } else {
        setScanStatusMessage(message);
      }
    } finally {
      if (pendingAdditionBusyRef.current === additionOperation) {
        pendingAdditionBusyRef.current = null;
        if (setupEpoch === setupEpochRef.current) setIsNfcWriting(false);
      }
    }
  };

  const handleVerifySample = async (sampleId) => {
    verifiedObservationRef.current=null;
    const pending = pendingAdditionRef.current?.candidate.id === sampleId ? pendingAdditionRef.current : null;
    const sample = pending?.candidate || samples.find((entry) => entry.id === sampleId);
    if (!sample) {
      return false;
    }

    const sampleForMetadata = {
      ...sample,
      ...(pendingCheckSampleOverridesRef.current[sampleId] || {}),
    };
    setVerifyingSampleId(sampleId);

    try {
      setScanStatusMessage(`Scan cup ${sample.cupUUID} to verify its session data...`);
      const result = await readNdefMinimal();
      const parsed = result?.parsed || {};
      const tag = result?.tag;
      const tagClassification = classifyNfcTagReadResult(result);
      const isSmartCupHardware = isSmartCupHardwareTag(tag);
      const isRepairableSmartCup =
        isSmartCupHardware &&
        tagClassification.type !== NFC_TAG_TYPES.SMART_CUP &&
        canRepairSmartCupNdefShape(tagClassification);
      if (isSmartCupHardware && tagClassification.type !== NFC_TAG_TYPES.SMART_CUP && !isRepairableSmartCup) {
        throw new Error("Smart cup records could not be read. Please retry and hold the phone still.");
      }
      const isNtagCup =
        !isSmartCupHardware &&
        (tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
          tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
          tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG);
      const detectedCupUUID = normalizeCupUuid(
        getNfcTagIdentifier(tag)
      );
      const expectedCupUUID = normalizeCupUuid(sample.cupUUID);

      if (!detectedCupUUID || detectedCupUUID !== expectedCupUUID) {
        setSampleVerificationStatus(sampleId, "pending");
        setScanStatusMessage(
          `Scanned cup ${detectedCupUUID || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`
        );
        return false;
      }

      const expectedSampleNumber = samples.findIndex((entry) => entry.id === sampleId) + 1;
      const expectedSamplesInSession = normalizePositiveInteger(
        samplesInSession,
        Math.max(samples.length, expectedSampleNumber)
      );
      const expectedMetadata = pending?.payload || buildCompactSessionMetadata({
        coffeeNameOrigin: sampleForMetadata.coffeeNameOrigin,
        process: sampleForMetadata.process,
        cupNumber: sampleForMetadata.cupNumber,
        samplesInSession: expectedSamplesInSession,
        sampleNumber: expectedSampleNumber,
        cuppingMode: sampleForMetadata.cuppingMode,
        cuppingForm: sampleForMetadata.cuppingForm,
        sessionName: sessionName || pendingQuickStartReadyRef.current?.sample?.coffeeNameOrigin || sampleForMetadata.coffeeNameOrigin,
        sessionType,
        sessionDate,
        sessionUUID,
      });
      const actualMetadata =
        tagClassification.metadataPayload ||
        (parsed?.raw?.text4 ? JSON.parse(parsed.raw.text4) : parsed?.text4);

      const sameTagContext = !pending || canonicalize(readCodeTagContext(result)) === canonicalize(pending.tagContext);
      if (sameTagContext && doesMetadataMatchExpected(actualMetadata, expectedMetadata)) {
        const cupState = parsed?.text1?.s ?? parsed?.text1?.state;
        if (!isNtagCup && cupState !== 1) {
          setSampleVerificationStatus(sampleId, "pending");
          setScanStatusMessage(
            `Cup ${expectedCupUUID} session data verified but NDEF1 state is not ready (s=${cupState ?? "unknown"}). Check the cup hardware.`
          );
          return false;
        } else {
          if (!pending) setSampleVerificationStatus(sampleId, "verified");
          if (pending) verifiedObservationRef.current={operationId:pending.operationId,payload:actualMetadata,physicalUID:detectedCupUUID,tagContext:readCodeTagContext(result)};
          setScanStatusMessage(`Cup ${expectedCupUUID} verified successfully.`);
          const { [sampleId]: _verifiedOverride, ...remainingOverrides } = pendingCheckSampleOverridesRef.current;
          pendingCheckSampleOverridesRef.current = remainingOverrides;
          return true;
        }
      } else {
        setSampleVerificationStatus(sampleId, "pending");
        setScanStatusMessage(`Cup ${expectedCupUUID} does not match the expected session data. Please write again.`);
        return false;
      }
    } catch (error) {
      const message = error?.message || "Unable to verify cup.";
      const normalizedMessage = String(message).toLowerCase();
      const isUserCancelled =
        normalizedMessage.includes("scan cancelled") ||
        normalizedMessage.includes("session was cancelled");

      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "verify_sample_cup",
        friendlyMessage: "Cup verification failed.",
        error: new Error("Cup verification failed."),
      });

      if (isUserCancelled) {
        setScanStatusMessage("");
      } else {
        setScanStatusMessage(message);
      }
      return false;
    } finally {
      setVerifyingSampleId(null);
    }
  };

  const handleRewriteSample = async (sampleId, overrides = {}) => {
    const setupEpoch = setupEpochRef.current;
    if (!canEditSessionSetup) return false;
    if (!isSessionFormSupported || samples.some((sample) => sample.cuppingForm !== selectedForm)) {
      setScanStatusMessage(UNSUPPORTED_MESSAGE);
      return false;
    }
    const pending = pendingAdditionRef.current?.candidate.id === sampleId ? pendingAdditionRef.current : null;
    const sample = pending?.candidate || samples.find((entry) => entry.id === sampleId);
    if (!sample) {
      return false;
    }

    const sampleForMetadata = { ...sample, ...overrides };
    const expectedCupUUID = normalizeCupUuid(sample.cupUUID);
    const expectedSampleNumber = samples.findIndex((entry) => entry.id === sampleId) + 1;
    const expectedSamplesInSession = normalizePositiveInteger(
      samplesInSession,
      Math.max(samples.length, expectedSampleNumber)
    );
    let expectedMetadata = pending?.payload || buildCompactSessionMetadata({
      coffeeNameOrigin: sampleForMetadata.coffeeNameOrigin,
      process: sampleForMetadata.process,
      cupNumber: sampleForMetadata.cupNumber,
      samplesInSession: expectedSamplesInSession,
      sampleNumber: expectedSampleNumber,
      cuppingMode: sampleForMetadata.cuppingMode,
      cuppingForm: sampleForMetadata.cuppingForm,
      sessionName,
      sessionType,
      sessionDate,
      sessionUUID,
    });

    setRewritingSampleId(sampleId);

    try {
      if (!(await getSessionSetupAccess(savedSessionIdRef.current)).canManageSetup) throw new Error('Session setup is read-only on this profile.');
      setScanStatusMessage(`Scan cup ${expectedCupUUID} to rewrite its session data...`);
      await readAndWriteNdefMinimal(async (result) => {
        if (setupEpoch !== setupEpochRef.current || !(await getSessionSetupAccess(savedSessionIdRef.current)).canManageSetup) throw new Error('Session setup changed. No cup was written.');
        if (pending) {
          const current = await getPendingSampleAddition(pending.sessionId);
          if (!current || current.operationId !== pending.operationId) throw new Error('Pending cup setup changed. No cup was written.');
        }
        const parsed = result?.parsed || {};
        const tag = result?.tag;
        const tagClassification = classifyNfcTagReadResult(result);
        const isSmartCupHardware = isSmartCupHardwareTag(tag);
        const isRepairableSmartCup =
          isSmartCupHardware &&
          tagClassification.type !== NFC_TAG_TYPES.SMART_CUP &&
          canRepairSmartCupNdefShape(tagClassification);
        if (isRepairableSmartCup) throw new Error('Incomplete Smart Cup records are not supported by this test. No cup was written.');
        if (isSmartCupHardware && tagClassification.type !== NFC_TAG_TYPES.SMART_CUP && !isRepairableSmartCup) {
          throw new Error("Smart cup records could not be read. Please retry and hold the phone still.");
        }
        const isNtagCup =
          !isSmartCupHardware &&
          (tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
            tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
            tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG);

        if (isNtagCup) {
          const detectedTagId = normalizeCupUuid(getNfcTagIdentifier(tag));
          if (!detectedTagId || detectedTagId !== expectedCupUUID) {
            throw new Error(`Scanned cup ${detectedTagId || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`);
          }
          if (!pending) throw new Error('Editing a committed code assignment is not enabled in this test.');
          const staged = await stagePendingSampleAddition({sessionId:pending.sessionId,expectedOperationId:pending.operationId,candidate:pending.candidate,saveInput:pending.saveInput,tagContext:readCodeTagContext(result),observedMetadata:tagClassification.metadataPayload});
          if(setupEpoch!==setupEpochRef.current)throw new Error('Session setup changed. No cup was written.');
          pendingAdditionRef.current=staged;
          expectedMetadata=staged.payload;
          return {
            metadataOnly: true,
            beforeWrite: () => assertPendingCodeDispatch(staged.operationId,setupEpoch),
            records: { text4: expectedMetadata },
          };
        } else if (tagClassification.type === NFC_TAG_TYPES.SMART_CUP || isRepairableSmartCup) {
          const detectedCupUUID = normalizeCupUuid(
            getNfcTagIdentifier(tag)
          );
          if (!detectedCupUUID || detectedCupUUID !== expectedCupUUID) {
            throw new Error(`Scanned cup ${detectedCupUUID || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`);
          }
          if (!pending) throw new Error('Editing a committed code assignment is not enabled in this test.');
          const staged = await stagePendingSampleAddition({sessionId:pending.sessionId,expectedOperationId:pending.operationId,candidate:pending.candidate,saveInput:pending.saveInput,tagContext:readCodeTagContext(result),observedMetadata:tagClassification.metadataPayload});
          if(setupEpoch!==setupEpochRef.current)throw new Error('Session setup changed. No cup was written.');
          pendingAdditionRef.current=staged;
          expectedMetadata=staged.payload;
          return {
            metadataOnly: false,
            beforeWrite: () => assertPendingCodeDispatch(staged.operationId,setupEpoch),
            records: {
              text1:
                tagClassification.type === NFC_TAG_TYPES.SMART_CUP
                  ? { ...parsed?.text1, state: 1 }
                  : { state: 1 },
              text2: {},
              text3:
                tagClassification.type === NFC_TAG_TYPES.SMART_CUP
                  ? parsed?.text3 || {}
                  : RECOVERED_SMART_CUP_TEXT3,
              text4: expectedMetadata,
            },
          };
        } else {
          throw new Error("NFC tag format is not recognised yet. Please scan the matching cup or NTAG sticker.");
        }
      });
      if (pending) {
        const written=await markPendingSampleAdditionWritten({sessionId:pending.sessionId,operationId:pendingAdditionRef.current.operationId});
        if(setupEpoch!==setupEpochRef.current)return false;
        pendingAdditionRef.current=written;
        setCheckingSampleId(written.candidate.id);
      }
      if (setupEpoch !== setupEpochRef.current || !(await getSessionSetupAccess(savedSessionIdRef.current)).canManageSetup) {
        setPresentationRevision(value => value + 1);
        return false;
      }
      setSampleVerificationStatus(sampleId, "pending");
      setScanStatusMessage(`Cup ${expectedCupUUID} rewritten. Please run Check Cup to verify it.`);
      return true;
    } catch (error) {
      const message = error?.message || "Unable to rewrite cup.";
      const normalizedMessage = String(message).toLowerCase();
      const isUserCancelled =
        normalizedMessage.includes("scan cancelled") ||
        normalizedMessage.includes("session was cancelled");

      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "rewrite_sample_cup",
        friendlyMessage: "Cup rewrite failed.",
        error: new Error("Cup rewrite failed."),
      });

      if (isUserCancelled) {
        setScanStatusMessage("");
      } else {
        setScanStatusMessage(message);
      }
      return false;
    } finally {
      setRewritingSampleId(null);
    }
  };

  const checkedSample = checkingSampleId
    ? pendingAdditionRef.current?.candidate.id === checkingSampleId ? pendingAdditionRef.current.candidate : samples.find((entry) => entry.id === checkingSampleId)
    : null;
  const checkedSampleIndex = checkedSample
    ? samples.findIndex((entry) => entry.id === checkedSample.id)
    : -1;
  const checkedSampleNumber = Number(checkedSample?.sampleNumber) > 0
    ? Number(checkedSample.sampleNumber)
    : checkedSampleIndex + 1;

  const handleCloseCheckSample = () => {
    if (pendingAdditionRef.current?.candidate.id === checkingSampleId) {
      if (pendingAdditionBusyRef.current) return;
      restorePendingAdditionFields(pendingAdditionRef.current);
      setCheckingSampleId(null);
      setCheckSampleStatus("pending");
      setPendingSaveError("");
      if (Platform.OS === 'ios') reopenPendingDrawerRef.current = true;
      else setIsAddSheetVisible(true);
      return;
    }
    if (checkingSampleId) {
      const { [checkingSampleId]: _closedOverride, ...remainingOverrides } = pendingCheckSampleOverridesRef.current;
      pendingCheckSampleOverridesRef.current = remainingOverrides;
    }
    pendingQuickStartReadyRef.current = null;
    setCheckingSampleId(null);
    setCheckSampleStatus("pending");
    setIsCheckingCup(false);
  };

  const handleScanToCheckCup = async () => {
    if (!checkingSampleId) {
      return;
    }

    const pending = pendingAdditionRef.current?.candidate.id === checkingSampleId ? pendingAdditionRef.current : null;
    if (pending) {
      if (pendingAdditionBusyRef.current) return;
      const operation = { epoch: setupEpochRef.current, operationId: pending.operationId, kind: 'check', cancelled: false };
      pendingAdditionBusyRef.current = operation;
      const current = () => !operation.cancelled && operation.epoch === setupEpochRef.current && pendingAdditionRef.current?.operationId === operation.operationId;
      setIsCheckingCup(true);
      setPendingSaveError("");
      try {
        const verified = pending.phase === 'verified' || await handleVerifySample(checkingSampleId);
        if (!current()) return;
        if (!verified) { setCheckSampleStatus("mismatch"); return; }
        if (pending.phase !== 'verified') {
          const observation=verifiedObservationRef.current;
          if(observation?.operationId!==pending.operationId)throw new Error('Cup check changed.');
          const marked = await markPendingSampleAdditionVerified({sessionId:pending.sessionId,...observation});
          if (!current()) return;
          pendingAdditionRef.current = marked;
        }
        operation.kind = 'commit';
        const saved = await commitPendingSampleAddition({sessionId:pending.sessionId,operationId:pending.operationId});
        if (!current()) return;
        const nextSamples = pending.saveInput.samples.map(sample => ({
          ...samples.find(prior => prior.id === sample.id), ...sample,
          ...(sample.id === pending.candidate.id ? { verificationStatus: 'verified' } : {}),
        }));
        savedSessionIdRef.current = saved.sessionId;
        setSessionStatus(saved.status);
        setSamples(nextSamples);
        setSessionName(pending.saveInput.sessionName);
        setIsSessionDirty(true);
        savedSetupSnapshotRef.current = setupWarningSnapshot({cuppingForm:pending.saveInput.cuppingForm,samples:nextSamples},sessionForm);
        savedSetupInputKeyRef.current = JSON.stringify({...formState, sessionName:pending.saveInput.sessionName,
          sessionType:pending.saveInput.sessionType, samples:nextSamples});
        pendingAdditionRef.current = null;
        setCheckingSampleId(null);
        setCheckSampleStatus("pending");
        setScanStatusMessage("Cup verified and sample saved locally.");
        const quickStart = pendingQuickStartReadyRef.current;
        pendingQuickStartReadyRef.current = null;
        if (quickStart && typeof onQuickStartSampleReady === 'function') pendingVerifiedQuickStartRef.current = quickStart;
      } catch (error) {
        if (current()) {
          setCheckSampleStatus("pending");
          setPendingSaveError(pendingAdditionRef.current?.phase === 'verified'
            ? "The cup was verified, but saving could not be confirmed. Retry or reopen the session; no re-write is needed."
            : "The verification result could not be saved. Scan the same cup again to retry.");
        }
      } finally {
        if (pendingAdditionBusyRef.current === operation) {
          pendingAdditionBusyRef.current = null;
          if (operation.epoch === setupEpochRef.current) setIsCheckingCup(false);
        }
      }
      return;
    }

    setIsCheckingCup(true);
    const verified = await handleVerifySample(checkingSampleId);
    setIsCheckingCup(false);

    if (verified) {
      const pendingQuickStartReady = pendingQuickStartReadyRef.current;
      pendingQuickStartReadyRef.current = null;
      setCheckingSampleId(null);
      setCheckSampleStatus("pending");

      if (pendingQuickStartReady && typeof onQuickStartSampleReady === "function") {
        requestSetupExit(() => onQuickStartSampleReady(pendingQuickStartReady));
      }
      return;
    }

    setCheckSampleStatus("mismatch");
  };

  const handleRewriteFromCheckScreen = async () => {
    if (!checkingSampleId) {
      return;
    }
    const pending = pendingAdditionRef.current?.candidate.id === checkingSampleId ? pendingAdditionRef.current : null;
    if (pending) {
      if (pendingAdditionBusyRef.current) return;
      const operation = { epoch: setupEpochRef.current, operationId: pending.operationId, kind: 'rewrite', cancelled: false };
      pendingAdditionBusyRef.current = operation;
      setIsCheckingCup(true);
      try {
        const rewritten = await handleRewriteSample(checkingSampleId);
        if (!operation.cancelled && operation.epoch === setupEpochRef.current) {
          setCheckSampleStatus(rewritten ? "pending" : "mismatch");
        }
      } finally {
        if (pendingAdditionBusyRef.current === operation) {
          pendingAdditionBusyRef.current = null;
          if (operation.epoch === setupEpochRef.current) setIsCheckingCup(false);
        }
      }
      return;
    }

    setIsCheckingCup(true);
    const rewritten = await handleRewriteSample(
      checkingSampleId,
      pendingCheckSampleOverridesRef.current[checkingSampleId] || {}
    );
    setIsCheckingCup(false);

    if (rewritten) {
      setCheckSampleStatus("pending");
    } else {
      setCheckSampleStatus("mismatch");
    }
  };

  const handleSave = async () => {
    if (pendingAdditionRef.current || pendingAdditionBusyRef.current) {
      setScanStatusMessage("Finish the pending cup check from Add Sample before saving.");
      return;
    }
    if (!canEditSessionSetup) return;
    if (!isSessionFormSupported) {
      setScanStatusMessage('Select a session form before saving.');
      return;
    }
    if (saveOperationRef.current) return;
    const request = { ...formState, samples: formState.samples.map(sample => ({ ...sample })) };
    const requestKey = JSON.stringify(request);
    const snapshot = setupWarningSnapshot(request, sessionForm);
    const startsContinuation = !sessionId && !isQuickStartSession &&
      request.cuppingForm === 1 && request.samples.length === 0;
    const operation = { epoch: setupEpochRef.current, protectSetup: startsContinuation || setupContinuationRef.current };
    saveOperationRef.current = operation;
    setIsSaving(true);

    try {
      const result = await saveSessionWithSamples({
        ...request,
        existingSessionId: savedSessionIdRef.current,
      });
      if (operation.epoch !== setupEpochRef.current) return;
      savedSessionIdRef.current = result.sessionId;
      savedSetupSnapshotRef.current = snapshot;
      const hasNewerChanges = currentSetupInputKeyRef.current !== requestKey;
      savedSetupInputKeyRef.current = JSON.stringify({ ...request, status: result.status });
      setSessionStatus(result.status);
      setIsSessionDirty(hasNewerChanges);
      if (startsContinuation) setupContinuationRef.current = true;
      if (hasNewerChanges) {
        setScanStatusMessage("Earlier draft saved locally. You have newer changes to save before leaving setup.");
        return;
      }
      if (setupContinuationRef.current && request.cuppingForm === 1) {
        setScanStatusMessage(`Draft saved locally (${result.savedSampleCount} samples). You can return to this draft from Sessions.`);
        return;
      }
      setScanStatusMessage(`Session saved locally (${result.savedSampleCount} samples).`);
      if (onSaveSuccess) {
        onSaveSuccess(result.sessionId);
      } else if (onBackPress) {
        onBackPress();
      }
    } catch (error) {
      if (operation.epoch !== setupEpochRef.current) return;
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "save_session",
        friendlyMessage: "Save failed.",
        error: new Error("Save failed."),
        context: {
          sampleCount: samples.length,
        },
      });
      setScanStatusMessage(hideSavedIdentity ? "Save failed." : error?.message || "Save failed.");
    } finally {
      if (saveOperationRef.current === operation && operation.epoch === setupEpochRef.current) {
        saveOperationRef.current = null;
        setIsSaving(false);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionId) {
      setIsDeleteDialogVisible(false);
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteSessionById(sessionId);
      if (!result?.deleted) {
        setScanStatusMessage("Session was already removed.");
      } else {
        setScanStatusMessage("Session deleted.");
      }

      setIsDeleteDialogVisible(false);
      if (onBackPress) {
        onBackPress();
      }
    } catch (error) {
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "delete_session",
        friendlyMessage: "Delete failed.",
        error: new Error("Delete failed."),
        context: {
          sampleCount: samples.length,
        },
      });
      setScanStatusMessage(hideSavedIdentity ? "Delete failed." : error?.message || "Delete failed.");
      setIsDeleteDialogVisible(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const showScanFooter = sessionStatusBadgeLabel === "Pending" && !isSessionDirty;
  const showInProgressFooter = canCompleteSession;
  const footerDisabled = isSaving || isCompletingSession || isDeleting || isNfcWriting || isRemovingParticipantSample;
  const showCompactSessionTitle = ["Pending", "In Progress", "Complete"].includes(sessionStatusBadgeLabel);

  return (
    <View style={styles.screen}>
      <Header
        title={sessionId ? "Session Details" : "New Session"}
        variant="back"
        onBackPress={() => requestSetupExit(onBackPress)}
        backAccessibilityLabel="Back"
        debugTag="CuppingSessionDetailsScreen"
      />

      <ScreenContainer>
        {showCompactSessionTitle ? (
          <>
            <SessionTitleSummary
              name={sessionId ? visibleIdentity.sessionName : sessionName}
              sessionType={sessionId ? visibleIdentity.sessionType : getSessionTypeLabel(sessionType)}
              formLabel={isSessionFormLoading ? "Checking saved session form…" : isSessionFormSupported ? getCuppingFormLabel(selectedForm) : "Older or unsupported prototype form"}
              dateLabel={sessionId ? visibleIdentity.sessionDate : sessionDate}
              sessionCode={sessionDisplayId}
              status={sessionStatusBadgeLabel.toUpperCase()}
            />
            {isSessionFormLoading || !isSessionFormSupported ? (
              <Text style={styles.metaValueMuted}>
                {isSessionFormLoading ? "Tasting actions are unavailable until the session form is checked." : UNSUPPORTED_MESSAGE}
              </Text>
            ) : null}
          </>
        ) : (
        <View style={[styles.metaList, { gap: 14 * scale }]}>
          <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
            <Text style={styles.metaLabel}>Session Name</Text>
            <TextInput
              value={sessionId ? visibleIdentity.sessionName : sessionName}
              onChangeText={value => { setSessionName(value); setIsSessionDirty(true); }}
              placeholder="Enter session name"
              placeholderTextColor={colors.action}
              style={[styles.input, { marginTop: 4 * scale }, (isSessionLocked || !canEditSessionSetup) && styles.metaInputDisabled]}
              editable={!isSessionLocked && canEditSessionSetup}
              selectTextOnFocus={!isSessionLocked && canEditSessionSetup}
              accessibilityLabel="Session name"
              accessibilityState={{ disabled: isSessionLocked || !canEditSessionSetup }}
            />
          </View>

          <Pressable
            ref={sessionTypeRowRef}
            onPress={openSessionTypeMenu}
            disabled={isSessionLocked || !canEditSessionSetup}
            accessibilityRole="button"
            accessibilityLabel="Select session type"
            accessibilityState={{ expanded: Boolean(sessionTypeAnchor), disabled: isSessionLocked || !canEditSessionSetup }}
            style={[styles.metaRow, { paddingBottom: 14 * scale }]}
          >
            <Text style={styles.metaLabel}>Session Type</Text>
            <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
              <Text
                style={[
                  styles.metaValue,
                  !sessionType && styles.metaValuePlaceholder,
                  (isSessionLocked || !canEditSessionSetup) && styles.metaValueDisabled,
                ]}
              >
                {sessionId ? visibleIdentity.sessionType : sessionType ? getSessionTypeLabel(sessionType) : "Select type"}
              </Text>
              <AppIcon
                name="chevron-down"
                role="icon_navigation"
                size={22}
                color={isSessionLocked || !canEditSessionSetup ? colors.muted : colors.inkSoft}
              />
            </View>
          </Pressable>

          <Pressable ref={sessionFormRowRef} onPress={openSessionFormMenu}
            disabled={!canSelectSessionForm}
            accessibilityRole="button" accessibilityLabel={isSessionLocked || isQuickStartSession
              ? `Session form, ${getCuppingFormLabel(selectedForm)}, locked after cup assignment`
              : selectedForm ? `Select session form, current ${getCuppingFormLabel(selectedForm)}` : 'Select session form, required'}
            accessibilityState={{ disabled: !canSelectSessionForm, expanded: Boolean(sessionFormAnchor) }}
            style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
            <Text style={styles.metaLabel}>Session Form</Text>
            <Text style={[styles.metaValue, { marginTop: 4 * scale }, !selectedForm && !sessionId && styles.metaValuePlaceholder]}>
              {isSessionFormLoading ? "Checking saved session form…" : !sessionId && !selectedForm ? "Select form" : isSessionFormSupported ? getCuppingFormLabel(selectedForm) : "Older or unsupported prototype form"}
            </Text>
            <Text style={styles.metaValueMuted}>
              {isSessionFormLoading ? "Tasting actions are unavailable until the session form is checked." : !sessionId && !selectedForm ? "Choose CVA or Legacy before saving or adding cups." : isSessionFormSupported ? (isLegacy ? "Open Cupping only in this prototype. Blind Legacy tasting is not yet available." : "Pinned for this session once cups are assigned.") : UNSUPPORTED_MESSAGE}
            </Text>
          </Pressable>

          <View style={{ paddingBottom: 14 * scale, gap: spacing.sm }}>
            <Text style={styles.metaValueMuted} accessibilityLabel="Session date">
              {sessionId ? visibleIdentity.sessionDate : sessionDate}
            </Text>
            <Text style={styles.metaValueMuted} accessibilityLabel={`Session code ${sessionDisplayId}`}>
              {sessionDisplayId}
            </Text>
            <SessionStatusBadge status={sessionStatusBadgeLabel} />
          </View>
        </View>
        )}

        <View style={styles.samplesSection}>
          <View style={[styles.samplesHeader, { marginTop: showCompactSessionTitle ? spacing.md : 32 * scale }]}>
            <Text style={styles.samplesHeading}>SAMPLES</Text>
          </View>

          {samples.map((sample, index) => isSessionFormSupported && isLegacy ? (
            <LegacySampleCard key={sample.id} sample={sessionId ? visibleIdentity.samples[index] : sample} index={index} scale={scale} status={sampleStatusById?.[sample.id]}
              onRemove={handleRemoveSample} canRemove={Boolean(sample.localRemoval?.canRemove) && !isRemovingParticipantSample}
              showRemove={Boolean(sample.localRemoval?.canRemove)}
              onPress={sessionStatusBadgeLabel !== 'Draft' && !isSessionDirty && sample.cupUUID && typeof onOpenSample === 'function'
                ? () => requestSetupExit(() => onOpenSample(sample, index, samples.length, { sessionId: savedSessionIdRef.current, isSessionComplete: Boolean(sampleStatusById?.[sample.id]?.isComplete) }))
                : undefined} />
          ) : isSessionFormSupported ? (
            <CoffeeSampleCard
              key={sample.id}
              sample={projectSessionDetailsCard(sessionId ? visibleIdentity.samples[index] : sample, sessionStatusBadgeLabel, index)}
              index={index}
              scale={scale}
              onRemove={handleRemoveSample}
              canRemove={!isRemovingParticipantSample && (sample.localRemoval?.canRemove || samples.length > 0 && canEditSessionSetup)}
              showRemove={canEditSessionSetup || Boolean(sample.localRemoval?.canRemove)}
              participantLocalRemoval={Boolean(sample.localRemoval?.canRemove)}
              status={sampleStatusById?.[sample.id]}
              defaultExpanded={isSessionComplete}
              onEditSample={showInProgressFooter || !canEditSessionSetup ? undefined : () => handleOpenEditSheet(sample)}
              onOpenSample={
                sessionStatusBadgeLabel !== 'Draft' && !isSessionDirty && isSessionFormSupported && sample.cupUUID && typeof onOpenSample === "function"
                  ? () =>
                      requestSetupExit(() => onOpenSample(sample, index, samples.length, {
                        sessionId: savedSessionIdRef.current,
                        isSessionComplete: Boolean(sampleStatusById?.[sample.id]?.isComplete),
                      }))
                  : undefined
              }
            />
          ) : (
            <View key={sample.id} style={[styles.metaRow, { marginTop: 16 * scale, paddingBottom: 14 * scale }]}>
              <Text style={styles.metaLabel}>Sample {index + 1}</Text>
              <Text style={styles.metaValueMuted}>Older prototype record — scoring and editing unavailable.</Text>
            </View>
          ))}

          {!isSessionComplete && !showInProgressFooter && isSessionFormSupported && canEditSessionSetup ? (
            <FullPageButton
              label="ADD SAMPLE"
              onPress={handleOpenAddSheet}
              accessibilityLabel="Open add sample sheet"
              style={[styles.addSampleButton, { marginTop: 24 * scale }]}
              textStyle={styles.addSampleButtonText}
            />
          ) : null}
        </View>

        {sessionId && !ownsSavedSetup ? <Text style={styles.scanStatusText}>{setupAccess?.sessionId === sessionId
          ? setupAccess.failed ? "Local ownership could not be checked. Session setup is unavailable; reopen the session to retry."
          : setupAccess.isLocalCreator && setupAccess.started ? "Tasting has already begun, so session setup is read-only. You can still review available tasting assessments."
          : "Session setup is read-only on this profile. You can still open available tasting assessments."
          : "Checking local session ownership…"}</Text> : null}
        {scanStatusMessage ? <Text style={styles.scanStatusText}>{scanStatusMessage}</Text> : null}
        {sessionId && tastingPresentation?.session?.id === sessionId && isSessionFormSupported ?
          <LocalTastingActions sessionId={sessionId} tasting={tastingPresentation.tasting}
            disabled={isSessionDirty || isSaving || isNfcWriting || isRemovingParticipantSample}
            onCompleted={() => setPresentationRevision(value => value + 1)} /> : null}

      </ScreenContainer>

      {sessionId && (!ownsSavedSetup || tastingPresentation?.tasting?.started || isSessionComplete) ? (isSessionFormSupported && typeof onScanCupForAssessment === 'function' ? (
        <ScreenFooter label="SCAN CUP" onPress={onScanCupForAssessment} disabled={footerDisabled}
          accessibilityLabel="Scan cup for assessment" buttonStyle={styles.scanFooterButton} />
      ) : null) : sessionId && !isSessionFormSupported ? null : showScanFooter ? (
        <ScreenFooter
          label="SCAN CUP"
          onPress={() => requestSetupExit(onScanCupForAssessment)}
          disabled={footerDisabled || !isSessionFormSupported || typeof onScanCupForAssessment !== "function"}
          accessibilityLabel="Scan cup for assessment"
          buttonStyle={styles.scanFooterButton}
        />
      ) : sessionStatusBadgeLabel === "Draft" ? (
        <ScreenFooterDual
          primaryLabel="SAVE"
          onPrimaryPress={handleSave}
          primaryLoading={isSaving}
          primaryDisabled={footerDisabled || !isSessionFormSupported}
          primaryAccessibilityLabel="Save cupping session details"
          secondaryLabel="LOCK SESSION"
          secondaryDisabled
          secondaryStyle={{ backgroundColor: colors.muted }}
          secondaryTextStyle={{}}
        />
      ) : (
        <ScreenFooter
          label="SAVE"
          onPress={handleSave}
          loading={isSaving}
          disabled={footerDisabled || !isSessionFormSupported}
          accessibilityLabel="Save cupping session details"
        />
      )}

      <Modal
        visible={Boolean(checkingSampleId)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCheckSample}
        onDismiss={() => {
          if (reopenPendingDrawerRef.current && pendingAdditionRef.current) {
            reopenPendingDrawerRef.current = false;
            setIsAddSheetVisible(true);
          }
        }}
      >
        <CheckSampleScreen
          sampleNumber={checkedSampleNumber}
          status={checkSampleStatus}
          loading={isCheckingCup}
          onScanToCheck={handleScanToCheckCup}
          onRewrite={handleRewriteFromCheckScreen}
          onClose={handleCloseCheckSample}
          closeDisabled={Boolean(pendingAdditionRef.current) && isCheckingCup}
          saveError={pendingSaveError}
          retrySave={pendingAdditionRef.current?.phase === 'verified'}
        />
      </Modal>

      <AddCoffeeSampleSheet
        visible={isAddSheetVisible}
        mode={editingSampleId ? "edit" : "add"}
        cupUUID=""
        coffeeNameOrigin={sheetCoffeeNameOrigin}
        process={sheetProcess}
        cupNumber={sheetCupNumber}
        isCupNumberDefault={isSheetCupNumberDefault}
        cuppingForm={sessionForm?.cuppingForm ?? sessionForm?.f}
        cuppingMode={sheetCuppingMode}
        lockedCuppingMode={isLegacy}
        isCuppingModeDefault={isSheetCuppingModeDefault}
        errors={sheetErrors}
        loading={isNfcWriting || Boolean(pendingAdditionRef.current) && isCheckingCup}
        statusMessage={scanStatusMessage}
        errorMessage={cupBlockedMessage}
        onChangeCoffeeNameOrigin={value => { if (!pendingAdditionBusyRef.current) setSheetCoffeeNameOrigin(value); }}
        onChangeProcess={value => { if (!pendingAdditionBusyRef.current) setSheetProcess(value); }}
        onSelectCupNumber={(value) => {
          if (pendingAdditionBusyRef.current) return;
          setSheetCupNumber(value);
          setIsSheetCupNumberDefault(false);
        }}
        onSelectCuppingMode={(value) => {
          if (pendingAdditionBusyRef.current) return;
          setSheetCuppingMode(value);
          setIsSheetCuppingModeDefault(false);
        }}
        onClose={handleCloseAddSheet}
        onScanCup={handleScanCup}
        onSave={handleSaveEditedSample}
      />

      <WarningDialog
        visible={Boolean(setupExitMessage)}
        title="Leave setup?"
        message={setupExitMessage}
        okLabel="Stay"
        onOk={stayInSetup}
        onDismiss={stayInSetup}
        secondaryLabel="Leave"
        onSecondary={leaveSetup}
      />

      <WarningDialog visible={Boolean(participantRemoval) && participantRemoval.sessionId === sessionId && tastingPresentation?.session?.id === sessionId && participantRemoval.epoch === setupEpochRef.current}
        title="Remove local sample?"
        message={`Delete ${participantRemoval?.label || 'this sample'} and its saved scores and notes from this phone? The physical cup and creator's copy will not change.`}
        okLabel="Cancel" onOk={()=>dismissParticipantRemoval(participantRemoval)} onDismiss={()=>dismissParticipantRemoval(participantRemoval)}
        secondaryLabel="Delete" onSecondary={()=>confirmParticipantRemoval(participantRemoval)} />

      <WarningDialog
        visible={isOverwriteDialogVisible}
        title="Cup Updated"
        message={overwriteDialogMessage}
        okLabel="OK"
        onDismiss={() => setIsOverwriteDialogVisible(false)}
        onOk={() => setIsOverwriteDialogVisible(false)}
      />

      <WarningDialog
        visible={isCompleteSessionDialogVisible}
        title="Complete Session"
        message={completeSessionMessage}
        okLabel="OK"
        onDismiss={() => setIsCompleteSessionDialogVisible(false)}
        onOk={() => setIsCompleteSessionDialogVisible(false)}
      />

      <WarningDialog
        visible={isDeleteDialogVisible}
        title="Delete Session?"
        message="This will permanently delete the session and all saved sample feedback stored on this device."
        okLabel="Delete Session"
        onDismiss={() => setIsDeleteDialogVisible(false)}
        onOk={handleConfirmDelete}
        secondaryLabel="Cancel"
        onSecondary={() => setIsDeleteDialogVisible(false)}
      />
      <SessionTypeDropdown
        anchorRect={sessionTypeAnchor}
        selected={sessionType}
        onSelect={value => { setSessionType(value); setIsSessionDirty(true); }}
        onDismiss={() => setSessionTypeAnchor(null)}
        scale={scale}
      />
      <SessionFormDropdown
        anchorRect={sessionFormAnchor}
        selected={selectedForm}
        onSelect={selectSessionForm}
        onDismiss={() => setSessionFormAnchor(null)}
        scale={scale}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  metaList: {
    width: "100%",
  },
  metaRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  metaLabel: {
    ...typography.text_secondary_body,
    fontWeight: "700",
    letterSpacing: 0,
  },
  metaValueMuted: {
    ...typography.text_field_auto,
    letterSpacing: 0,
  },
  metaValue: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  metaValuePlaceholder: {
    color: colors.action,
  },
  metaValueDisabled: {
    color: colors.muted,
  },
  input: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0,
    color: "#414B53",
    padding: 0,
  },
  metaInputDisabled: {
    color: colors.muted,
  },
  typeRowValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dropdownMenu: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownOption: {
    paddingHorizontal: 16,
  },
  dropdownOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.quietBorder,
  },
  dropdownOptionSelected: {
    backgroundColor: colors.panel,
  },
  dropdownOptionText: {
    ...typography.text_body,
    letterSpacing: 0,
  },
  dropdownOptionTextSelected: {
    fontWeight: "800",
  },
  samplesSection: {
    gap: spacing.sm,
  },
  samplesHeader: {
    paddingTop: 16,
  },
  samplesHeading: {
    ...typography.text_caption,
  },
  addSampleButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
  },
  addSampleButtonText: {
    color: colors.ink,
  },
  scanStatusText: {
    ...typography.text_secondary_body,
    fontSize: 13,
    marginTop: 2,
  },
  completeButton: {
    backgroundColor: colors.ink,
  },
  completeButtonText: {
    color: colors.surface,
  },
  scanFooterButton: {
    backgroundColor: colors.action,
  },
  scanFooterButtonText: {
    color: colors.surface,
  },
  uploadFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    alignItems: "center",
  },
  uploadButton: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadButtonPressed: {
    opacity: 0.88,
  },
});
