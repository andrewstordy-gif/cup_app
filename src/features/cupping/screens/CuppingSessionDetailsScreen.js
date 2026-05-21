import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import {
  readAndWriteNdefMinimal,
  readNdefMinimal,
  writeNdefMetadataOnlyMinimal,
  writeNdefMinimal,
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
import { CoffeeSampleCard } from "../components/CoffeeSampleCard";
import {
  buildCompactSessionMetadata,
  CUP_NUMBER_OPTIONS,
  createPendingConflictError,
  createSample,
  doesMetadataMatchExpected,
  formatSessionDate,
  formatSessionDisplayId,
  generateSessionUUID,
  getSessionTypeLabel,
  normalizeProcessKey,
  normalizePositiveInteger,
  normalizeSessionTypeKey,
  normalizeCupUuid,
  normalizeSampleColour,
  PENDING_CONFLICT_ERROR,
  resolveCupUUIDFromReadResult,
  SAMPLE_COLOUR_OPTIONS,
  SESSION_TYPE_OPTIONS,
} from "../constants/sessionDetails";
import {
  deleteSessionById,
  findPendingSessionByCupUUID,
  getSessionById,
  getSessionSampleFinalStatus,
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

export function CuppingSessionDetailsScreen({ onBackPress, sessionId = null }) {
  const [sessionUUID, setSessionUUID] = useState(() => generateSessionUUID());
  const [sessionDisplayId, setSessionDisplayId] = useState(() => formatSessionDisplayId(sessionUUID));
  const [sessionDate, setSessionDate] = useState(() => formatSessionDate(new Date()));
  const [sessionName, setSessionName] = useState("");
  const [sessionType, setSessionType] = useState("1");
  const [samplesInSession, setSamplesInSession] = useState("");
  const [sessionStatus, setSessionStatus] = useState("pending");
  const [showSessionTypeMenu, setShowSessionTypeMenu] = useState(false);

  const [samples, setSamples] = useState([]);

  const [isAddSheetVisible, setIsAddSheetVisible] = useState(false);
  const [sheetCoffeeNameOrigin, setSheetCoffeeNameOrigin] = useState("");
  const [sheetProcess, setSheetProcess] = useState("");
  const [sheetCupNumber, setSheetCupNumber] = useState(3);
  const [sheetSampleColour, setSheetSampleColour] = useState(SAMPLE_COLOUR_OPTIONS[0].hex);
  const [sheetErrors, setSheetErrors] = useState({});
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [isNfcWriting, setIsNfcWriting] = useState(false);
  const [verifyingSampleId, setVerifyingSampleId] = useState(null);
  const [rewritingSampleId, setRewritingSampleId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [overwriteDialogMessage, setOverwriteDialogMessage] = useState("");
  const [isOverwriteDialogVisible, setIsOverwriteDialogVisible] = useState(false);
  const [isCupBlockedDialogVisible, setIsCupBlockedDialogVisible] = useState(false);
  const [cupBlockedMessage, setCupBlockedMessage] = useState("");
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [sampleStatusById, setSampleStatusById] = useState({});
  const sampleIdsKey = useMemo(
    () => samples.map((sample) => sample.id).join("|"),
    [samples]
  );
  const isSessionComplete =
    sessionStatus === "complete" ||
    (samples.length > 0 && samples.every((sample) => Boolean(sampleStatusById?.[sample.id]?.isComplete)));
  const canDeleteSession = Boolean(sessionId);

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
        setSessionType("1");
        setSamplesInSession("");
        setSessionStatus("pending");
        setSamples([]);
        setShowSessionTypeMenu(false);
        setScanStatusMessage("");
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
        setSamples(
          (loaded.samples || []).map((sample) =>
            createSample({
              id: sample.id,
              coffeeNameOrigin: sample.coffeeNameOrigin,
              process: sample.process,
              cupUUID: sample.cupUUID,
              cupNumber: sample.cupNumber,
              sampleNumber: sample.sampleNumber,
              sampleColour: sample.sampleColour,
              verificationStatus: sample.verificationStatus,
            })
          )
        );
        setShowSessionTypeMenu(false);
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
  }, [sessionId]);

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
    setSheetCoffeeNameOrigin("");
    setSheetProcess("");
    setSheetCupNumber(3);
    setSheetSampleColour(SAMPLE_COLOUR_OPTIONS[0].hex);
    setSheetErrors({});
    setScanStatusMessage("");
    setIsAddSheetVisible(true);
  };

  const handleCloseAddSheet = () => {
    setIsAddSheetVisible(false);
    setSheetErrors({});
    setScanStatusMessage("");
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

    if (!normalizeSampleColour(sheetSampleColour)) {
      nextErrors.sampleColour = "Sample colour is required.";
    }

    setSheetErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleScanCup = async () => {
    if (!validateAddSheet()) {
      return;
    }

    if (!sessionName.trim()) {
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
        const sampleColour = normalizeSampleColour(sheetSampleColour);
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
          sampleColour,
          sessionName: sessionName.trim(),
          sessionType: normalizeSessionTypeKey(sessionType),
          sessionDate,
          sessionUUID,
        });
        const nextSamples =
          duplicateIndex === -1
            ? [
                ...samples,
                createSample({
                  coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
                  process: String(normalizeProcessKey(sheetProcess)),
                  cupUUID: normalizedDetectedCupUUID,
                  cupNumber: sheetCupNumber,
                  sampleNumber,
                  sampleColour,
                  verificationStatus: "pending",
                }),
              ]
            : samples.map((sample, index) =>
                index === duplicateIndex
                  ? {
                      ...sample,
                      coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
                      process: String(normalizeProcessKey(sheetProcess)),
                      cupUUID: normalizedDetectedCupUUID,
                      cupNumber: sheetCupNumber,
                      sampleNumber,
                      sampleColour,
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
                text2:
                  tagClassification.type === NFC_TAG_TYPES.SMART_CUP
                    ? parsed?.text2 || {}
                    : buildRecoveredSmartCupText2(tag),
                text3:
                  tagClassification.type === NFC_TAG_TYPES.SMART_CUP
                    ? parsed?.text3 || {}
                    : RECOVERED_SMART_CUP_TEXT3,
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
        sessionName,
        sessionType,
        samplesInSession,
        status: sessionStatus,
        samples: nextSamples,
      });
      setSamples(nextSamples);

      setIsAddSheetVisible(false);
      if (duplicateIndex !== -1) {
        setOverwriteDialogMessage(`Cup UUID ${normalizedDetectedCupUUID} overwritten.`);
        setIsOverwriteDialogVisible(true);
        setScanStatusMessage(`Cup UUID ${normalizedDetectedCupUUID} overwritten.`);
      } else {
        setScanStatusMessage(`Cup ${normalizedDetectedCupUUID} linked successfully and sample added.`);
      }
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
          sheetSampleColour,
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
      return;
    }

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
        return;
      }

      const expectedSampleNumber = samples.findIndex((entry) => entry.id === sampleId) + 1;
      const expectedSamplesInSession = normalizePositiveInteger(
        samplesInSession,
        Math.max(samples.length, expectedSampleNumber)
      );
      const expectedMetadata = buildCompactSessionMetadata({
        coffeeNameOrigin: sample.coffeeNameOrigin,
        process: sample.process,
        cupNumber: sample.cupNumber,
        samplesInSession: expectedSamplesInSession,
        sampleNumber: expectedSampleNumber,
        sampleColour: sample.sampleColour,
        sessionName,
        sessionType,
        sessionDate,
        sessionUUID,
      });
      const actualMetadata =
        tagClassification.metadataPayload ||
        (parsed?.raw?.text4 ? JSON.parse(parsed.raw.text4) : parsed?.text4);

      if (doesMetadataMatchExpected(actualMetadata, expectedMetadata)) {
        setSampleVerificationStatus(sampleId, "verified");
        setScanStatusMessage(`Cup ${expectedCupUUID} verified successfully.`);
      } else {
        setSampleVerificationStatus(sampleId, "pending");
        setScanStatusMessage(`Cup ${expectedCupUUID} does not match the expected session data. Please write again.`);
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
    } finally {
      setVerifyingSampleId(null);
    }
  };

  const handleRewriteSample = async (sampleId) => {
    const sample = samples.find((entry) => entry.id === sampleId);
    if (!sample) {
      return;
    }

    const expectedCupUUID = normalizeCupUuid(sample.cupUUID);
    const expectedSampleNumber = samples.findIndex((entry) => entry.id === sampleId) + 1;
    const expectedSamplesInSession = normalizePositiveInteger(
      samplesInSession,
      Math.max(samples.length, expectedSampleNumber)
    );
    const expectedMetadata = buildCompactSessionMetadata({
      coffeeNameOrigin: sample.coffeeNameOrigin,
      process: sample.process,
      cupNumber: sample.cupNumber,
      samplesInSession: expectedSamplesInSession,
      sampleNumber: expectedSampleNumber,
      sampleColour: sample.sampleColour,
      sessionName,
      sessionType,
      sessionDate,
      sessionUUID,
    });

    setRewritingSampleId(sampleId);

    try {
      setScanStatusMessage(`Scan cup ${expectedCupUUID} to rewrite its session data...`);
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

      if (isNtagCup) {
        const detectedTagId = normalizeCupUuid(getNfcTagIdentifier(tag));
        if (!detectedTagId || detectedTagId !== expectedCupUUID) {
          throw new Error(`Scanned cup ${detectedTagId || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`);
        }

        await writeNdefMetadataOnlyMinimal({
          text4: expectedMetadata,
        });
      } else if (tagClassification.type === NFC_TAG_TYPES.SMART_CUP || isRepairableSmartCup) {
        const detectedCupUUID = normalizeCupUuid(
          isRepairableSmartCup ? getNfcTagIdentifier(tag) : resolveCupUUIDFromReadResult({ parsed, tag })
        );
        if (!detectedCupUUID || detectedCupUUID !== expectedCupUUID) {
          throw new Error(`Scanned cup ${detectedCupUUID || "UNKNOWN"} does not match sample cup ${expectedCupUUID}.`);
        }

        await writeNdefMinimal({
          text1:
            tagClassification.type === NFC_TAG_TYPES.SMART_CUP
              ? parsed?.text1 || {}
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
        });
      } else {
        throw new Error("NFC tag format is not recognised yet. Please scan the matching cup or NTAG sticker.");
      }

      setSampleVerificationStatus(sampleId, "pending");
      setScanStatusMessage(`Cup ${expectedCupUUID} rewritten. Please run Check Cup to verify it.`);
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
    } finally {
      setRewritingSampleId(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const result = await saveSessionWithSamples(formState);
      setScanStatusMessage(`Session saved locally (${result.savedSampleCount} samples).`);
      if (onBackPress) {
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

  return (
    <View style={styles.screen}>
      <Header
        title="Session Detials"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
      />

      <ScreenContainer>
        <View style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>UUID</Text>
            <Text style={styles.uuidValue} accessibilityLabel="Session UUID">
              {sessionDisplayId}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.readOnlyValue} accessibilityLabel="Session date">
              {sessionDate}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Session Name</Text>
            <TextInput
              value={sessionName}
              onChangeText={setSessionName}
              placeholder="Enter session name"
              style={[styles.input, isSessionLocked && styles.inputDisabled]}
              editable={!isSessionLocked}
              selectTextOnFocus={!isSessionLocked}
              accessibilityLabel="Session name"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Session Type</Text>
            <View style={styles.dropdownWrap}>
              <Pressable
                onPress={() => {
                  if (!isSessionLocked) {
                    setShowSessionTypeMenu((prev) => !prev);
                  }
                }}
                style={[styles.dropdownTrigger, isSessionLocked && styles.dropdownTriggerDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Session type selector. Current value ${getSessionTypeLabel(sessionType)}`}
                accessibilityState={{ expanded: showSessionTypeMenu, disabled: isSessionLocked }}
              >
                <Text style={[styles.dropdownValue, isSessionLocked && styles.dropdownValueDisabled]}>
                  {getSessionTypeLabel(sessionType)}
                </Text>
                <Text style={[styles.dropdownChevron, isSessionLocked && styles.dropdownChevronDisabled]}>
                  {showSessionTypeMenu ? "▴" : "▾"}
                </Text>
              </Pressable>

              {showSessionTypeMenu && !isSessionLocked ? (
                <View style={styles.dropdownMenu}>
                  {SESSION_TYPE_OPTIONS.map((option, index) => {
                    const selected = normalizeSessionTypeKey(sessionType) === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          setSessionType(String(option.key));
                          setShowSessionTypeMenu(false);
                        }}
                        style={[
                          styles.dropdownItem,
                          index === 0 && styles.dropdownItemFirst,
                          selected && styles.dropdownItemSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Session type ${option.label}`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Samples in Session</Text>
            <TextInput
              value={samplesInSession}
              onChangeText={setSamplesInSession}
              placeholder="e.g. 5"
              keyboardType="number-pad"
              style={[styles.input, isSessionLocked && styles.inputDisabled]}
              editable={!isSessionLocked}
              selectTextOnFocus={!isSessionLocked}
              accessibilityLabel="Samples in session"
            />
          </View>
        </View>

        <View style={styles.samplesSection}>
          <Text style={styles.sectionTitle}>Coffee Samples</Text>

          {samples.map((sample, index) => (
            <CoffeeSampleCard
              key={sample.id}
              sample={sample}
              index={index}
              onUpdate={handleUpdateSample}
              onRemove={handleRemoveSample}
              onVerify={handleVerifySample}
              onRewrite={handleRewriteSample}
              isVerifying={verifyingSampleId === sample.id}
              isRewriting={rewritingSampleId === sample.id}
              canRemove={samples.length > 0}
              status={sampleStatusById?.[sample.id]}
            />
          ))}

          {!isSessionComplete ? (
            <FullPageButton
              label="Add"
              onPress={handleOpenAddSheet}
              accessibilityLabel="Open add sample sheet"
              style={styles.addButton}
              textStyle={styles.addButtonText}
              icon={<Text style={styles.addButtonIcon}>＋</Text>}
              iconPosition="left"
            />
          ) : null}
        </View>

        {scanStatusMessage ? <Text style={styles.scanStatusText}>{scanStatusMessage}</Text> : null}

        <FullPageButton
          label="Save"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving || isDeleting || isNfcWriting}
          accessibilityLabel="Save cupping session details"
          style={styles.saveButton}
        />

        {canDeleteSession ? (
          <FullPageButton
            label="Delete Session"
            onPress={() => setIsDeleteDialogVisible(true)}
            disabled={isSaving || isDeleting || isNfcWriting}
            loading={isDeleting}
            accessibilityLabel="Delete cupping session"
            style={styles.deleteButton}
            textStyle={styles.deleteButtonText}
          />
        ) : null}
      </ScreenContainer>

      <AddCoffeeSampleSheet
        visible={isAddSheetVisible}
        cupUUID=""
        coffeeNameOrigin={sheetCoffeeNameOrigin}
        process={sheetProcess}
        cupNumber={sheetCupNumber}
        sampleColour={sheetSampleColour}
        errors={sheetErrors}
        loading={isNfcWriting}
        statusMessage={scanStatusMessage}
        onChangeCoffeeNameOrigin={setSheetCoffeeNameOrigin}
        onChangeProcess={setSheetProcess}
        onSelectCupNumber={setSheetCupNumber}
        onSelectSampleColour={setSheetSampleColour}
        onClose={handleCloseAddSheet}
        onScanCup={handleScanCup}
      />

      <WarningDialog
        visible={isOverwriteDialogVisible}
        title="Cup Updated"
        message={overwriteDialogMessage}
        okLabel="OK"
        onOk={() => setIsOverwriteDialogVisible(false)}
      />

      <WarningDialog
        visible={isCupBlockedDialogVisible}
        title="Cup In Use"
        message={cupBlockedMessage}
        okLabel="OK"
        onOk={() => setIsCupBlockedDialogVisible(false)}
      />

      <WarningDialog
        visible={isDeleteDialogVisible}
        title="Delete Session?"
        message="This will permanently delete the session and all saved sample feedback stored on this device."
        okLabel="Delete Session"
        onOk={handleConfirmDelete}
        secondaryLabel="Cancel"
        onSecondary={() => setIsDeleteDialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  readOnlyValue: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#f8f8f8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  dropdownWrap: {
    gap: 6,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownValue: {
    fontSize: 15,
    color: colors.text,
  },
  dropdownValueDisabled: {
    color: colors.textMuted,
  },
  dropdownChevron: {
    fontSize: 16,
    color: colors.textMuted,
  },
  dropdownChevronDisabled: {
    color: "#9ca3af",
  },
  dropdownTriggerDisabled: {
    backgroundColor: "#f3f4f6",
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  dropdownItem: {
    minHeight: 42,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderTopWidth: 1,
    borderColor: "#f0f0f0",
  },
  dropdownItemFirst: {
    borderTopWidth: 0,
  },
  dropdownItemSelected: {
    backgroundColor: "#111111",
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  dropdownItemTextSelected: {
    color: "#ffffff",
  },
  uuidValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#8a97ac",
  },
  samplesSection: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: "#f3f4f6",
    color: colors.textMuted,
  },
  addButton: {
    marginTop: 4,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  addButtonText: {
    color: colors.text,
    textTransform: "none",
    letterSpacing: 0,
    fontWeight: "600",
  },
  addButtonIcon: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  scanStatusText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  saveButton: {
    marginBottom: 12,
  },
  deleteButton: {
    marginBottom: 12,
    backgroundColor: "#b42318",
  },
  deleteButtonText: {
    color: "#ffffff",
  },
});
