import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { ScreenFooter, ScreenFooterDual } from "../../../components/ui/ScreenFooter";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { AppIcon } from "../../../components/ui/AppIcon";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
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
import { SessionStatusBadge } from "../../style-guide/components/SessionStatusBadge";
import {
  buildCompactSessionMetadata,
  CUP_NUMBER_OPTIONS,
  createPendingConflictError,
  createSample,
  doesMetadataMatchExpected,
  formatSessionDate,
  formatSessionDisplayId,
  generateSessionUUID,
  getSessionStatusBadgeLabel,
  getSessionTypeLabel,
  normalizeCuppingFormKey,
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
  deleteSessionById,
  findPendingSessionByCupUUID,
  getSessionById,
  getSessionSampleFinalStatus,
  markSessionCompleteIfAllSamplesComplete,
  saveSessionWithSamples,
} from "../../../data/sessionRepository";

const RECOVERED_SMART_CUP_TEXT3 = {
  triggerTemp: 40,
  maxStartTemp: 93,
  brewTime: 240,
  maxCupTemp: 70,
  maxTime: 3600,
  ledBrightness: 100,
};

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
  const [sessionUUID, setSessionUUID] = useState(() => generateSessionUUID());
  const [sessionDisplayId, setSessionDisplayId] = useState(() => formatSessionDisplayId(sessionUUID));
  const [sessionDate, setSessionDate] = useState(() => formatSessionDate(new Date()));
  const [sessionName, setSessionName] = useState("");
  const [sessionType, setSessionType] = useState(null);
  const [samplesInSession, setSamplesInSession] = useState("");
  const [sessionStatus, setSessionStatus] = useState("pending");
  const sessionTypeRowRef = useRef(null);
  const [sessionTypeAnchor, setSessionTypeAnchor] = useState(null);

  const [samples, setSamples] = useState([]);

  const [isAddSheetVisible, setIsAddSheetVisible] = useState(false);
  const [sheetCoffeeNameOrigin, setSheetCoffeeNameOrigin] = useState("");
  const [sheetProcess, setSheetProcess] = useState("");
  const [sheetCupNumber, setSheetCupNumber] = useState(5);
  const [isSheetCupNumberDefault, setIsSheetCupNumberDefault] = useState(true);
  const [sheetCuppingForm, setSheetCuppingForm] = useState(1);
  const [sheetCuppingMode, setSheetCuppingMode] = useState("blind");
  const [isSheetCuppingModeDefault, setIsSheetCuppingModeDefault] = useState(true);
  const [sheetErrors, setSheetErrors] = useState({});
  const [editingSampleId, setEditingSampleId] = useState(null);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [isNfcWriting, setIsNfcWriting] = useState(false);
  const [verifyingSampleId, setVerifyingSampleId] = useState(null);
  const [rewritingSampleId, setRewritingSampleId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSessionDirty, setIsSessionDirty] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [overwriteDialogMessage, setOverwriteDialogMessage] = useState("");
  const [isOverwriteDialogVisible, setIsOverwriteDialogVisible] = useState(false);
  const [isCupBlockedDialogVisible, setIsCupBlockedDialogVisible] = useState(false);
  const [cupBlockedMessage, setCupBlockedMessage] = useState("");
  const [completeSessionMessage, setCompleteSessionMessage] = useState("");
  const [isCompleteSessionDialogVisible, setIsCompleteSessionDialogVisible] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [sampleStatusById, setSampleStatusById] = useState({});
  const [checkingSampleId, setCheckingSampleId] = useState(null);
  const [checkSampleStatus, setCheckSampleStatus] = useState("pending");
  const [isCheckingCup, setIsCheckingCup] = useState(false);
  const quickStartAddSheetOpenedRef = useRef(false);
  const pendingQuickStartReadyRef = useRef(null);
  const pendingCheckSampleOverridesRef = useRef({});
  const quickStartSessionTypeValue = normalizeSessionTypeKey(quickStartSessionTypeKey);
  const isQuickStartSession = !sessionId && Boolean(quickStartSessionTypeValue);
  const sampleIdsKey = useMemo(
    () => samples.map((sample) => sample.id).join("|"),
    [samples]
  );
  const isSessionComplete = sessionStatus === "complete";
  const sessionStatusBadgeLabel = getSessionStatusBadgeLabel({
    samples,
    sampleStatusById,
    isSessionComplete,
  });
  const canCompleteSession = sessionStatusBadgeLabel === "In Progress";

  useEffect(() => {
    let isCancelled = false;

    const loadSessionForEditing = async () => {
      if (!sessionId) {
        const nextSessionUUID = generateSessionUUID();
        if (isCancelled) {
          return;
        }

        setSessionUUID(nextSessionUUID);
        setSessionDisplayId(formatSessionDisplayId(nextSessionUUID));
        setSessionDate(formatSessionDate(new Date()));
        setSessionName("");
        setSessionType(quickStartSessionTypeValue ? String(quickStartSessionTypeValue) : null);
        setSamplesInSession("");
        setSessionStatus("new");
        setSamples([]);
        setIsSessionDirty(false);
        setSessionTypeAnchor(null);
        setScanStatusMessage("");
        quickStartAddSheetOpenedRef.current = false;
        return;
      }

      try {
        const loaded = await getSessionById(sessionId);
        if (!loaded || isCancelled) {
          return;
        }

        const loadedUuid = loaded.sessionUUID || loaded.id || generateSessionUUID();
        setSessionUUID(loadedUuid);
        setSessionDisplayId(loaded.sessionDisplayId || formatSessionDisplayId(loadedUuid));
        setSessionDate(loaded.sessionDate || formatSessionDate(new Date()));
        setSessionName(loaded.sessionName || "");
        setSessionType(String(normalizeSessionTypeKey(loaded.sessionType) || 1));
        setSamplesInSession(String(loaded.samplesInSession || ""));
        setSessionStatus(loaded.status || "pending");
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
                verificationStatus: sample.verificationStatus,
              }),
              cuppingMode: normalizeCuppingModeKey(sample.cuppingMode),
            })
          )
        );
        setSessionTypeAnchor(null);
        setScanStatusMessage("Loaded saved session.");
      } catch (error) {
        void logAppError({
          screen: "CuppingSessionDetails",
          route: "Cupping Session Details",
          flow: "load_session",
          friendlyMessage: error?.message || "Failed to load session.",
          error,
          context: { sessionId },
        });
        if (!isCancelled) {
          setScanStatusMessage(error?.message || "Failed to load session.");
        }
      }
    };

    loadSessionForEditing();

    return () => {
      isCancelled = true;
    };
  }, [sessionId, quickStartSessionTypeValue]);

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
          friendlyMessage: error?.message || "Could not load sample completion status.",
          error,
          context: { sessionId, sampleIdsKey },
        });
        if (!isCancelled) {
          setScanStatusMessage(error?.message || "Could not load sample completion status.");
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
      samples,
    ]
  );
  const isSessionLocked = samples.length > 0;

  const openSessionTypeMenu = () => {
    if (isSessionLocked) {
      return;
    }

    sessionTypeRowRef.current?.measure((x, y, w, h, pageX, pageY) => {
      setSessionTypeAnchor({ x: pageX, y: pageY, width: w, height: h });
    });
  };

  const handleUpdateSample = (sampleId, field, value) => {
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
    setSamples((prev) => prev.filter((sample) => sample.id !== sampleId));
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

  const handleOpenAddSheet = () => {
    setEditingSampleId(null);
    setSheetCoffeeNameOrigin("");
    setSheetProcess("");
    setSheetCupNumber(5);
    setIsSheetCupNumberDefault(true);
    setSheetCuppingForm(1);
    setSheetCuppingMode("blind");
    setIsSheetCuppingModeDefault(true);
    setSheetErrors({});
    setScanStatusMessage("");
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
    setIsAddSheetVisible(false);
    setEditingSampleId(null);
    setSheetErrors({});
    setScanStatusMessage("");
  };

  const handleOpenEditSheet = (sample) => {
    if (!sample || sampleStatusById?.[sample.id]?.isComplete) {
      return;
    }

    setEditingSampleId(sample.id);
    setSheetCoffeeNameOrigin(sample.coffeeNameOrigin || "");
    setSheetProcess(sample.process || "");
    setIsSheetCupNumberDefault(false);
    setSheetCupNumber(
      CUP_NUMBER_OPTIONS.includes(Number(sample.cupNumber)) ? Number(sample.cupNumber) : 5
    );
    setSheetCuppingForm(normalizeCuppingFormKey(sample.cuppingForm) ?? 1);
    setSheetCuppingMode(normalizeCuppingModeKey(sample.cuppingMode));
    setIsSheetCuppingModeDefault(false);
    setSheetErrors({});
    setScanStatusMessage("");
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
    if (!editingSampleId || !validateEditSheet()) {
      return;
    }

    const editedSampleId = editingSampleId;
    const overrides = {
      coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
      process: String(normalizeProcessKey(sheetProcess)),
      cuppingForm: normalizeCuppingFormKey(sheetCuppingForm) ?? 1,
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
    handleUpdateSample(editedSampleId, "cuppingForm", normalizeCuppingFormKey(sheetCuppingForm) ?? 1);
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

  const handleScanCup = async () => {
    if (!validateAddSheet()) {
      return;
    }

    const effectiveSessionName = isQuickStartSession ? sheetCoffeeNameOrigin.trim() : sessionName.trim();
    const effectiveSessionType = isQuickStartSession ? String(quickStartSessionTypeValue) : sessionType;
    const isFirstQuickStartSample = isQuickStartSession && samples.length === 0;

    if (!isQuickStartSession && !effectiveSessionName) {
      setScanStatusMessage("Please enter Session Name before scanning cup.");
      return;
    }

    setIsNfcWriting(true);

    try {
      setScanStatusMessage("Scan cup to write session data...");
      const writeResult = await readAndWriteNdefMinimal(async (result) => {
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
        const canUseNtagIdentifier =
          !isSmartCupHardware &&
          (tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
            tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
            tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG);
        const detectedCupUUID =
          tagClassification.type === NFC_TAG_TYPES.SMART_CUP
            ? resolveCupUUIDFromReadResult({ parsed, tag })
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
          const conflictName =
            conflictingSession.sessionName || conflictingSession.sessionDisplayId || "another session";
          const conflictType = conflictingSession.sessionType || "Pending";
          throw createPendingConflictError(
            `Cup UUID ${normalizedDetectedCupUUID} is already assigned to ${conflictName} (${conflictType}).`
          );
        }

        const duplicateIndex = samples.findIndex(
          (sample) => normalizeCupUuid(sample.cupUUID) === normalizedDetectedCupUUID
        );
        const sampleNumber = duplicateIndex === -1 ? samples.length + 1 : duplicateIndex + 1;
        const sessionSampleCount = normalizePositiveInteger(
          samplesInSession,
          Math.max(samples.length, sampleNumber)
        );
        const isNtagCup =
          !isSmartCupHardware &&
          (tagClassification.type === NFC_TAG_TYPES.NTAG_CUP ||
            tagClassification.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
            tagClassification.type === NFC_TAG_TYPES.EMPTY_TAG);
        const sessionMetadata = buildCompactSessionMetadata({
          coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
          process: normalizeProcessKey(sheetProcess),
          cupNumber: sheetCupNumber,
          samplesInSession: sessionSampleCount,
          sampleNumber,
          cuppingMode: normalizeCuppingModeKey(sheetCuppingMode),
          cuppingForm: normalizeCuppingFormKey(sheetCuppingForm) ?? 1,
          sessionName: effectiveSessionName,
          sessionType: normalizeSessionTypeKey(effectiveSessionType),
          sessionDate,
          sessionUUID,
        });
        const nextSamples =
          duplicateIndex === -1
            ? [
                ...samples,
                {
                  ...createSample({
                    coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
                    process: String(normalizeProcessKey(sheetProcess)),
                    cupUUID: normalizedDetectedCupUUID,
                    cupNumber: sheetCupNumber,
                    cuppingForm: normalizeCuppingFormKey(sheetCuppingForm) ?? 1,
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
                      cuppingForm: normalizeCuppingFormKey(sheetCuppingForm) ?? 1,
                      cuppingMode: normalizeCuppingModeKey(sheetCuppingMode),
                      sampleNumber,
                      verificationStatus: "pending",
                    }
                  : sample
              );

        return {
          metadataOnly: isNtagCup,
          records: isNtagCup
            ? { text4: sessionMetadata }
            : {
                text1: {
                  ...(tagClassification.type === NFC_TAG_TYPES.SMART_CUP ? parsed?.text1 || {} : {}),
                  state: 1,
                },
                text2: {},
                text3: {},
                text4: sessionMetadata,
              },
          result: {
            duplicateIndex,
            normalizedDetectedCupUUID,
            nextSamples,
          },
        };
      });
      const {
        duplicateIndex,
        normalizedDetectedCupUUID,
        nextSamples,
      } = writeResult.result || {};

      await saveSessionWithSamples({
        sessionUUID,
        sessionDisplayId,
        sessionDate,
        sessionName: effectiveSessionName,
        sessionType: effectiveSessionType,
        samplesInSession,
        status: sessionStatus,
        samples: nextSamples,
      });
      setSessionName(effectiveSessionName);
      setSamples(nextSamples);
      setIsSessionDirty(true);

      const writtenSample =
        duplicateIndex !== -1
          ? nextSamples[duplicateIndex]
          : nextSamples[nextSamples.length - 1];
      setIsAddSheetVisible(false);
      if (duplicateIndex !== -1) {
        setScanStatusMessage(`Cup UUID ${normalizedDetectedCupUUID} overwritten. Check the cup to confirm.`);
      } else {
        setScanStatusMessage(`Cup ${normalizedDetectedCupUUID} linked. Check the cup to confirm.`);
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
      const message = error?.message || "NFC write failed.";
      const normalizedMessage = String(message).toLowerCase();
      const isUserCancelled =
        normalizedMessage.includes("scan cancelled") ||
        normalizedMessage.includes("session was cancelled");

      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "scan_add_sample",
        friendlyMessage: message,
        error,
        context: {
          sessionUUID,
          sessionName,
          sessionType,
          sessionDate,
          sheetCoffeeNameOrigin,
          sheetProcess,
          sheetCupNumber,
        },
      });
      if (isUserCancelled) {
        setScanStatusMessage("");
      } else if (error?.code === PENDING_CONFLICT_ERROR) {
        const userMessage = message;
        // Close the bottom sheet first to avoid iOS modal stacking issues.
        setIsAddSheetVisible(false);
        setCupBlockedMessage(userMessage);
        setScanStatusMessage(userMessage);
        setTimeout(() => {
          setIsCupBlockedDialogVisible(true);
        }, 0);
      } else {
        setScanStatusMessage(message);
      }
    } finally {
      setIsNfcWriting(false);
    }
  };

  const handleVerifySample = async (sampleId) => {
    const sample = samples.find((entry) => entry.id === sampleId);
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
        isNtagCup || isRepairableSmartCup ? getNfcTagIdentifier(tag) : resolveCupUUIDFromReadResult({ parsed, tag })
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
      const expectedMetadata = buildCompactSessionMetadata({
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

      if (doesMetadataMatchExpected(actualMetadata, expectedMetadata)) {
        const cupState = parsed?.text1?.s ?? parsed?.text1?.state;
        if (!isNtagCup && cupState !== 1) {
          setSampleVerificationStatus(sampleId, "pending");
          setScanStatusMessage(
            `Cup ${expectedCupUUID} session data verified but NDEF1 state is not ready (s=${cupState ?? "unknown"}). Check the cup hardware.`
          );
          return false;
        } else {
          setSampleVerificationStatus(sampleId, "verified");
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
        friendlyMessage: message,
        error,
        context: {
          sessionUUID,
          sampleId,
          sampleCupUUID: sample.cupUUID,
        },
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
    const sample = samples.find((entry) => entry.id === sampleId);
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
    const expectedMetadata = buildCompactSessionMetadata({
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
      setScanStatusMessage(`Scan cup ${expectedCupUUID} to rewrite its session data...`);
      await readAndWriteNdefMinimal(async (result) => {
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

        if (isNtagCup) {
          const detectedTagId = normalizeCupUuid(getNfcTagIdentifier(tag));
          if (!detectedTagId || detectedTagId !== expectedCupUUID) {
            throw new Error(`Scanned cup ${detectedTagId || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`);
          }
          return {
            metadataOnly: true,
            records: { text4: expectedMetadata },
          };
        } else if (tagClassification.type === NFC_TAG_TYPES.SMART_CUP || isRepairableSmartCup) {
          const detectedCupUUID = normalizeCupUuid(
            isRepairableSmartCup ? getNfcTagIdentifier(tag) : resolveCupUUIDFromReadResult({ parsed, tag })
          );
          if (!detectedCupUUID || detectedCupUUID !== expectedCupUUID) {
            throw new Error(`Scanned cup ${detectedCupUUID || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`);
          }
          return {
            metadataOnly: false,
            records: {
              text1:
                tagClassification.type === NFC_TAG_TYPES.SMART_CUP
                  ? { ...parsed?.text1, state: 1 }
                  : { state: 1 },
              text2:
                tagClassification.type === NFC_TAG_TYPES.SMART_CUP
                  ? parsed?.text2 || {}
                  : buildRecoveredSmartCupText2(tag),
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
        friendlyMessage: message,
        error,
        context: {
          sessionUUID,
          sampleId,
          sampleCupUUID: sample.cupUUID,
          expectedMetadata,
        },
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
    ? samples.find((entry) => entry.id === checkingSampleId)
    : null;
  const checkedSampleIndex = checkedSample
    ? samples.findIndex((entry) => entry.id === checkedSample.id)
    : -1;
  const checkedSampleNumber = Number(checkedSample?.sampleNumber) > 0
    ? Number(checkedSample.sampleNumber)
    : checkedSampleIndex + 1;

  const handleCloseCheckSample = () => {
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

    setIsCheckingCup(true);
    const verified = await handleVerifySample(checkingSampleId);
    setIsCheckingCup(false);

    if (verified) {
      const pendingQuickStartReady = pendingQuickStartReadyRef.current;
      pendingQuickStartReadyRef.current = null;
      setCheckingSampleId(null);
      setCheckSampleStatus("pending");

      if (pendingQuickStartReady && typeof onQuickStartSampleReady === "function") {
        onQuickStartSampleReady(pendingQuickStartReady);
      }
      return;
    }

    setCheckSampleStatus("mismatch");
  };

  const handleRewriteFromCheckScreen = async () => {
    if (!checkingSampleId) {
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
    setIsSaving(true);

    try {
      const result = await saveSessionWithSamples(formState);
      setIsSessionDirty(false);
      setScanStatusMessage(`Session saved locally (${result.savedSampleCount} samples).`);
      if (onSaveSuccess) {
        onSaveSuccess(result.sessionId);
      } else if (onBackPress) {
        onBackPress();
      }
    } catch (error) {
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "save_session",
        friendlyMessage: error?.message || "Save failed.",
        error,
        context: {
          sessionUUID,
          sessionName,
          sessionType,
          sampleCount: samples.length,
        },
      });
      setScanStatusMessage(error?.message || "Save failed.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!sessionId) {
      return;
    }

    setIsCompletingSession(true);

    try {
      const result = await markSessionCompleteIfAllSamplesComplete(sessionId);
      if (result?.status === "incomplete") {
        setCompleteSessionMessage("All samples must be fully scored before completing this session.");
        setIsCompleteSessionDialogVisible(true);
        return;
      }

      if (result?.status === "complete") {
        setSessionStatus("complete");
        setScanStatusMessage("Session completed.");
      }
    } catch (error) {
      const message = error?.message || "Unable to complete session.";
      void logAppError({
        screen: "CuppingSessionDetails",
        route: "Cupping Session Details",
        flow: "complete_session",
        friendlyMessage: message,
        error,
        context: {
          sessionUUID,
          sessionId,
          sampleCount: samples.length,
        },
      });
      setCompleteSessionMessage(message);
      setIsCompleteSessionDialogVisible(true);
    } finally {
      setIsCompletingSession(false);
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
        friendlyMessage: error?.message || "Delete failed.",
        error,
        context: {
          sessionId,
          sessionUUID,
          sessionName,
          sampleCount: samples.length,
        },
      });
      setScanStatusMessage(error?.message || "Delete failed.");
      setIsDeleteDialogVisible(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const showScanFooter = sessionStatusBadgeLabel === "Pending" && !isSessionDirty;
  const showInProgressFooter = canCompleteSession;
  const footerDisabled = isSaving || isCompletingSession || isDeleting || isNfcWriting;

  return (
    <View style={styles.screen}>
      <Header
        title={sessionId ? "Session Details" : "New Session"}
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
        debugTag="CuppingSessionDetailsScreen"
      />

      <ScreenContainer>
        <View style={[styles.metaList, { gap: 14 * scale }]}>
          <View style={[styles.metaRow, { paddingBottom: 14 * scale }]}>
            <Text style={styles.metaLabel}>Session Name</Text>
            <TextInput
              value={sessionName}
              onChangeText={setSessionName}
              placeholder="Enter session name"
              placeholderTextColor={colors.action}
              style={[styles.input, { marginTop: 4 * scale }, isSessionLocked && styles.metaInputDisabled]}
              editable={!isSessionLocked}
              selectTextOnFocus={!isSessionLocked}
              accessibilityLabel="Session name"
            />
          </View>

          <Pressable
            ref={sessionTypeRowRef}
            onPress={openSessionTypeMenu}
            accessibilityRole="button"
            accessibilityLabel="Select session type"
            accessibilityState={{ expanded: Boolean(sessionTypeAnchor), disabled: isSessionLocked }}
            style={[styles.metaRow, { paddingBottom: 14 * scale }]}
          >
            <Text style={styles.metaLabel}>Session Type</Text>
            <View style={[styles.typeRowValue, { marginTop: 4 * scale }]}>
              <Text
                style={[
                  styles.metaValue,
                  !sessionType && styles.metaValuePlaceholder,
                  isSessionLocked && styles.metaValueDisabled,
                ]}
              >
                {sessionType ? getSessionTypeLabel(sessionType) : "Select type"}
              </Text>
              <AppIcon
                name="chevron-down"
                role="icon_navigation"
                size={22}
                color={isSessionLocked ? colors.muted : colors.inkSoft}
              />
            </View>
          </Pressable>

          <View style={{ paddingBottom: 14 * scale, gap: spacing.sm }}>
            <Text style={styles.metaValueMuted} accessibilityLabel="Session date">
              {sessionDate}
            </Text>
            <Text style={styles.metaValueMuted} accessibilityLabel="Session UUID">
              {sessionDisplayId}
            </Text>
            <SessionStatusBadge status={sessionStatusBadgeLabel} />
          </View>
        </View>

        <View style={styles.samplesSection}>
          <View style={[styles.samplesHeader, { marginTop: 32 * scale }]}>
            <Text style={styles.samplesHeading}>SAMPLES</Text>
          </View>

          {samples.map((sample, index) => (
            <CoffeeSampleCard
              key={sample.id}
              sample={sample}
              index={index}
              scale={scale}
              onRemove={handleRemoveSample}
              canRemove={samples.length > 0}
              status={sampleStatusById?.[sample.id]}
              defaultExpanded={isSessionComplete}
              onEditSample={showInProgressFooter ? undefined : handleOpenEditSheet}
              onOpenSample={
                sample.cupUUID && typeof onOpenSample === "function"
                  ? () =>
                      onOpenSample(sample, index, samples.length, {
                        isSessionComplete: Boolean(sampleStatusById?.[sample.id]?.isComplete),
                      })
                  : undefined
              }
            />
          ))}

          {!isSessionComplete && !showInProgressFooter ? (
            <FullPageButton
              label="ADD SAMPLE"
              onPress={handleOpenAddSheet}
              accessibilityLabel="Open add sample sheet"
              style={[styles.addSampleButton, { marginTop: 24 * scale }]}
              textStyle={styles.addSampleButtonText}
            />
          ) : null}
        </View>

        {scanStatusMessage ? <Text style={styles.scanStatusText}>{scanStatusMessage}</Text> : null}

      </ScreenContainer>

      {isSessionComplete ? (
        <View style={styles.uploadFooter}>
          <Pressable
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="Upload session"
            style={({ pressed }) => [
              styles.uploadButton,
              pressed && styles.uploadButtonPressed,
            ]}
          >
            <Ionicons name="cloud-upload-outline" size={24} color={colors.surface} />
          </Pressable>
        </View>
      ) : showScanFooter ? (
        <ScreenFooter
          label="SCAN CUP"
          onPress={onScanCupForAssessment}
          disabled={footerDisabled || typeof onScanCupForAssessment !== "function"}
          accessibilityLabel="Scan cup for assessment"
          buttonStyle={styles.scanFooterButton}
        />
      ) : showInProgressFooter ? (
        <ScreenFooterDual
          primaryLabel="COMPLETE SESSION"
          onPrimaryPress={handleCompleteSession}
          primaryLoading={isCompletingSession}
          primaryDisabled={footerDisabled}
          primaryAccessibilityLabel="Complete cupping session"
          primaryStyle={styles.completeButton}
          primaryTextStyle={styles.completeButtonText}
          secondaryLabel="SCAN CUP"
          onSecondaryPress={onScanCupForAssessment}
          secondaryDisabled={footerDisabled || typeof onScanCupForAssessment !== "function"}
          secondaryAccessibilityLabel="Scan cup for assessment"
          secondaryStyle={styles.scanFooterButton}
          secondaryTextStyle={styles.scanFooterButtonText}
        />
      ) : (
        <ScreenFooter
          label="SAVE"
          onPress={handleSave}
          loading={isSaving}
          disabled={footerDisabled}
          accessibilityLabel="Save cupping session details"
        />
      )}

      <Modal
        visible={Boolean(checkingSampleId)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseCheckSample}
      >
        <CheckSampleScreen
          sampleNumber={checkedSampleNumber}
          status={checkSampleStatus}
          loading={isCheckingCup}
          onScanToCheck={handleScanToCheckCup}
          onRewrite={handleRewriteFromCheckScreen}
          onClose={handleCloseCheckSample}
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
        cuppingForm={sheetCuppingForm}
        cuppingMode={sheetCuppingMode}
        isCuppingModeDefault={isSheetCuppingModeDefault}
        errors={sheetErrors}
        loading={isNfcWriting}
        statusMessage={scanStatusMessage}
        onChangeCoffeeNameOrigin={setSheetCoffeeNameOrigin}
        onChangeProcess={setSheetProcess}
        onSelectCupNumber={(value) => {
          setSheetCupNumber(value);
          setIsSheetCupNumberDefault(false);
        }}
        onSelectCuppingForm={setSheetCuppingForm}
        onSelectCuppingMode={(value) => {
          setSheetCuppingMode(value);
          setIsSheetCuppingModeDefault(false);
        }}
        onClose={handleCloseAddSheet}
        onScanCup={handleScanCup}
        onSave={handleSaveEditedSample}
      />

      <WarningDialog
        visible={isOverwriteDialogVisible}
        title="Cup Updated"
        message={overwriteDialogMessage}
        okLabel="OK"
        onDismiss={() => setIsOverwriteDialogVisible(false)}
        onOk={() => setIsOverwriteDialogVisible(false)}
      />

      <WarningDialog
        visible={isCupBlockedDialogVisible}
        title="Cup In Use"
        message={cupBlockedMessage}
        okLabel="OK"
        onDismiss={() => setIsCupBlockedDialogVisible(false)}
        onOk={() => setIsCupBlockedDialogVisible(false)}
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
        onSelect={setSessionType}
        onDismiss={() => setSessionTypeAnchor(null)}
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
