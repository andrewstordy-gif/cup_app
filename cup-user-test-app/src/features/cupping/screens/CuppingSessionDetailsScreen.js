import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { readWriteNdef } from "../../../services/nfcService";
import { logAppError } from "../../../services/errorLogger";
import { AddCoffeeSampleSheet } from "../components/AddCoffeeSampleSheet";
import { CoffeeSampleCard } from "../components/CoffeeSampleCard";
import {
  CUP_NUMBER_OPTIONS,
  createPendingConflictError,
  createSample,
  formatSessionDate,
  formatSessionDisplayId,
  generateSessionUUID,
  normalizeCupUuid,
  PENDING_CONFLICT_ERROR,
  resolveCupUUIDFromReadResult,
  SESSION_TYPE_OPTIONS,
} from "../constants/sessionDetails";
import {
  findPendingSessionByCupUUID,
  getSessionById,
  getSessionSampleFinalStatus,
  saveSessionWithSamples,
} from "../../../data/sessionRepository";

export function CuppingSessionDetailsScreen({ onBackPress, sessionId = null }) {
  const [sessionUUID, setSessionUUID] = useState(() => generateSessionUUID());
  const [sessionDisplayId, setSessionDisplayId] = useState(() => formatSessionDisplayId(sessionUUID));
  const [sessionDate, setSessionDate] = useState(() => formatSessionDate(new Date()));
  const [sessionName, setSessionName] = useState("");
  const [sessionType, setSessionType] = useState("Sourcing Decision");
  const [sessionStatus, setSessionStatus] = useState("pending");
  const [showSessionTypeMenu, setShowSessionTypeMenu] = useState(false);

  const [samples, setSamples] = useState([]);

  const [isAddSheetVisible, setIsAddSheetVisible] = useState(false);
  const [sheetCoffeeNameOrigin, setSheetCoffeeNameOrigin] = useState("");
  const [sheetProcess, setSheetProcess] = useState("");
  const [sheetCupNumber, setSheetCupNumber] = useState(3);
  const [sheetErrors, setSheetErrors] = useState({});
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [isNfcWriting, setIsNfcWriting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [overwriteDialogMessage, setOverwriteDialogMessage] = useState("");
  const [isOverwriteDialogVisible, setIsOverwriteDialogVisible] = useState(false);
  const [isCupBlockedDialogVisible, setIsCupBlockedDialogVisible] = useState(false);
  const [cupBlockedMessage, setCupBlockedMessage] = useState("");
  const [sampleStatusById, setSampleStatusById] = useState({});
  const sampleIdsKey = useMemo(
    () => samples.map((sample) => sample.id).join("|"),
    [samples]
  );
  const isSessionComplete =
    sessionStatus === "complete" ||
    (samples.length > 0 && samples.every((sample) => Boolean(sampleStatusById?.[sample.id]?.isComplete)));

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
        setSessionType("Sourcing Decision");
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
        setSessionType(loaded.sessionType || "Sourcing Decision");
        setSessionStatus(loaded.status || "pending");
        setSamples(
          (loaded.samples || []).map((sample) =>
            createSample({
              id: sample.id,
              coffeeNameOrigin: sample.coffeeNameOrigin,
              process: sample.process,
              cupUUID: sample.cupUUID,
              cupNumber: sample.cupNumber,
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
      status: sessionStatus,
      samples,
    }),
    [sessionUUID, sessionDisplayId, sessionDate, sessionName, sessionType, sessionStatus, samples]
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

  const handleOpenAddSheet = () => {
    setSheetCoffeeNameOrigin("");
    setSheetProcess("");
    setSheetCupNumber(3);
    setSheetErrors({});
    setIsAddSheetVisible(true);
  };

  const handleCloseAddSheet = () => {
    setIsAddSheetVisible(false);
    setSheetErrors({});
  };

  const validateAddSheet = () => {
    const nextErrors = {};

    if (!sheetCoffeeNameOrigin.trim()) {
      nextErrors.coffeeNameOrigin = "Coffee Name / Origin is required.";
    }

    if (!sheetProcess.trim()) {
      nextErrors.process = "Process is required.";
    }

    if (!CUP_NUMBER_OPTIONS.includes(sheetCupNumber)) {
      nextErrors.cupNumber = "Cup number must be between 1 and 5.";
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
      setScanStatusMessage("Scan cup to link sample and write session data...");
      const result = await readWriteNdef(async (parsed, tag) => {
        const detectedCupUUID = resolveCupUUIDFromReadResult({ parsed, tag });
        if (!detectedCupUUID) {
          throw new Error("Could not read cup UUID from tag. Please try scanning again.");
        }

        const normalizedDetectedCupUUID = normalizeCupUuid(detectedCupUUID);
        const conflictingSession = await findPendingSessionByCupUUID({
          cupUUID: normalizedDetectedCupUUID,
          excludeSessionId: sessionUUID,
        });

        if (conflictingSession) {
          const conflictName = conflictingSession.sessionName || conflictingSession.sessionDisplayId || "another session";
          const conflictType = conflictingSession.sessionType || "Pending";
          throw createPendingConflictError(
            `Cup UUID ${normalizedDetectedCupUUID} is already assigned to ${conflictName} (${conflictType}).`
          );
        }

        return {
          text1: {
            state: 1,
          },
          text2: parsed?.text2 ?? parsed?.raw?.text2 ?? {},
          text3: parsed?.text3 ?? parsed?.raw?.text3 ?? {},
          text4: {
            coffeeName: sheetCoffeeNameOrigin.trim(),
            coffeeProcess: sheetProcess.trim(),
            sessionName: sessionName.trim(),
            sessionType: sessionType.trim(),
            sessionDate: sessionDate,
            sessionUUID: sessionUUID,
            cupNumber: sheetCupNumber,
          },
        };
      });

      const detectedCupUUID = resolveCupUUIDFromReadResult(result);
      if (!detectedCupUUID) {
        throw new Error("Could not read cup UUID from tag. Please try scanning again.");
      }
      const normalizedDetectedCupUUID = normalizeCupUuid(detectedCupUUID);
      const duplicateIndex = samples.findIndex(
        (sample) => normalizeCupUuid(sample.cupUUID) === normalizedDetectedCupUUID
      );

      if (duplicateIndex === -1) {
        setSamples((prev) => [
          ...prev,
          createSample({
            coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
            process: sheetProcess.trim(),
            cupUUID: normalizedDetectedCupUUID,
            cupNumber: sheetCupNumber,
          }),
        ]);
      } else {
        setSamples((prev) =>
          prev.map((sample, index) =>
            index === duplicateIndex
              ? {
                  ...sample,
                  coffeeNameOrigin: sheetCoffeeNameOrigin.trim(),
                  process: sheetProcess.trim(),
                  cupUUID: normalizedDetectedCupUUID,
                  cupNumber: sheetCupNumber,
                }
              : sample
          )
        );
      }

      setIsAddSheetVisible(false);
      if (duplicateIndex !== -1) {
        setOverwriteDialogMessage(`Cup UUID ${normalizedDetectedCupUUID} overwritten.`);
        setIsOverwriteDialogVisible(true);
        setScanStatusMessage(`Cup UUID ${normalizedDetectedCupUUID} overwritten.`);
      } else {
        setScanStatusMessage("Cup linked successfully and sample added.");
      }
    } catch (error) {
      const message = error?.message || "NFC write failed.";
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
      if (error?.code === PENDING_CONFLICT_ERROR) {
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
                accessibilityLabel={`Session type selector. Current value ${sessionType}`}
                accessibilityState={{ expanded: showSessionTypeMenu, disabled: isSessionLocked }}
              >
                <Text style={[styles.dropdownValue, isSessionLocked && styles.dropdownValueDisabled]}>
                  {sessionType}
                </Text>
                <Text style={[styles.dropdownChevron, isSessionLocked && styles.dropdownChevronDisabled]}>
                  {showSessionTypeMenu ? "▴" : "▾"}
                </Text>
              </Pressable>

              {showSessionTypeMenu && !isSessionLocked ? (
                <View style={styles.dropdownMenu}>
                  {SESSION_TYPE_OPTIONS.map((option, index) => {
                    const selected = sessionType === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setSessionType(option);
                          setShowSessionTypeMenu(false);
                        }}
                        style={[
                          styles.dropdownItem,
                          index === 0 && styles.dropdownItemFirst,
                          selected && styles.dropdownItemSelected,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Session type ${option}`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
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
          disabled={isSaving || isNfcWriting}
          accessibilityLabel="Save cupping session details"
          style={styles.saveButton}
        />
      </ScreenContainer>

      <AddCoffeeSampleSheet
        visible={isAddSheetVisible}
        coffeeNameOrigin={sheetCoffeeNameOrigin}
        process={sheetProcess}
        cupNumber={sheetCupNumber}
        errors={sheetErrors}
        loading={isNfcWriting}
        onChangeCoffeeNameOrigin={setSheetCoffeeNameOrigin}
        onChangeProcess={setSheetProcess}
        onSelectCupNumber={setSheetCupNumber}
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
});
