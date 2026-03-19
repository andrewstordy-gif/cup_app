import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { HomeScreen } from "../features/home/screens/HomeScreen";
import { CuppingScreen } from "../features/cupping/screens/CuppingScreen";
import { CuppingSessionScreen } from "../features/cupping/screens/CuppingSessionScreen";
import { CuppingSessionDetailsScreen } from "../features/cupping/screens/CuppingSessionDetailsScreen";
import { NfcServiceTestScreen } from "../features/nfc/screens/NfcServiceTestScreen";
import { CoffeeLibraryScreen } from "../features/settings/screens/CoffeeLibraryScreen";
import { CupSettingsScreen } from "../features/cup-settings/screens/CupSettingsScreen";
import { AccountScreen } from "../features/account/screens/AccountScreen";
import { WarningDialog } from "../components/ui/WarningDialog";
import { colors } from "../theme/colors";
import { readNdef, writeNdef } from "../services/nfcService";
import { logAppError, shareLatestErrorLog } from "../services/errorLogger";
import { findActiveSampleByCupUUID, hasFinalFeedbackForSample } from "../data/sessionRepository";

const DRAWER_WIDTH = 300;
const DRAWER_ANIMATION_MS = 220;
const BREWING_STATE = 2;
const SCAN_COOLDOWN_MS = 1200;
const WRITE_BLOCK_FLAG = "__CUPPING_READ_ONLY_NFC_WRITE_BLOCK__";

const MENU_ITEMS = [
  { key: "cupping-sessions", label: "Cupping Sessions", route: "Cupping Session" },
  { key: "cup-settings", label: "Cup Settings", route: "Cup Settings" },
  { key: "reset-cup-off", label: "Reset Cup to OFF", action: "reset-cup-off" },
  { key: "share-error-log", label: "Share Latest Error Log", action: "share-error-log" },
  { key: "nfc-test", label: "NFC Test", route: "NFC Test" },
];

export function AppNavigator() {
  const [route, setRoute] = useState("Home");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedCupContext, setSelectedCupContext] = useState(null);
  const [homeTemperatureC, setHomeTemperatureC] = useState(null);
  const [homeStateLabel, setHomeStateLabel] = useState("Off");
  const [homeTimeLabel, setHomeTimeLabel] = useState("00:00");
  const [isScanInProgress, setIsScanInProgress] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningTitle, setWarningTitle] = useState("Notice");
  const [warningMessage, setWarningMessage] = useState("");
  const [sleepDialogVisible, setSleepDialogVisible] = useState(false);
  const [notInSessionDialogVisible, setNotInSessionDialogVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const lastScanAtRef = useRef(0);
  const nfcActionTokenRef = useRef(0);
  const nfcLaunchGuardRef = useRef(false);
  const scanInProgressRef = useRef(false);
  const warningVisibleRef = useRef(false);
  const sleepDialogVisibleRef = useRef(false);
  const notInSessionDialogVisibleRef = useRef(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    globalThis[WRITE_BLOCK_FLAG] = route === "Cupping";
  }, [route]);

  const showWarning = (title, message) => {
    warningVisibleRef.current = true;
    setWarningTitle(title);
    setWarningMessage(message);
    setWarningVisible(true);
  };

  const addFlowEvent = (events, message) => {
    events.push(`${new Date().toISOString()} ${message}`);
  };

  const logHomeError = ({ flow, friendlyMessage, error, events = [], context = {} }) => {
    const enrichedContext = {
      ...context,
      nfc_error_code: error?.nfcCode || null,
      nfc_error_stage: error?.nfcStage || null,
      nfc_raw_error: error?.nfcRawError || null,
      nfc_error_context: error?.nfcContext || null,
    };
    void logAppError({
      screen: "Home",
      route,
      flow,
      friendlyMessage,
      error,
      events,
      context: enrichedContext,
    });
  };

  const mapScanErrorMessage = (error, fallback) => {
    const raw = String(error?.message || error || "").trim();
    const lower = raw.toLowerCase();

    if (!raw || lower === "error") {
      return fallback;
    }
    if (lower.includes("scan cancelled")) {
      return "Scan cancelled.";
    }
    if (
      lower.includes("busy") ||
      lower.includes("one request at a time") ||
      lower.includes("duplicated registration")
    ) {
      return "Scanner is busy. Please wait a moment and scan again.";
    }
    if (lower.includes("tag moved too quickly") || lower.includes("tag was lost")) {
      return "Cup moved out of range. Hold your phone near the cup and retry.";
    }
    return raw;
  };

  const isTransientScanMessage = (message) => {
    const text = String(message || "").toLowerCase();
    if (!text) return false;
    return (
      text.includes("please try again") ||
      text.includes("busy") ||
      text.includes("moved out of range") ||
      text.includes("scan cancelled") ||
      text.includes("no ndef records found")
    );
  };

  const beginNfcAction = (statusMessage) => {
    const nextToken = nfcActionTokenRef.current + 1;
    nfcActionTokenRef.current = nextToken;
    nfcLaunchGuardRef.current = true;
    scanInProgressRef.current = true;
    setIsScanInProgress(true);
    setScanStatusMessage(statusMessage);
    return nextToken;
  };

  const isCurrentNfcAction = (token) => nfcActionTokenRef.current === token;

  const finishCurrentNfcAction = (token) => {
    if (!isCurrentNfcAction(token)) {
      return;
    }
    scanInProgressRef.current = false;
    setIsScanInProgress(false);
    setTimeout(() => {
      if (!scanInProgressRef.current) {
        nfcLaunchGuardRef.current = false;
      }
    }, 450);
  };

  const normalizeCupUuid = (value) => String(value || "").trim().toUpperCase();

  const formatTemp = (value) => {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
      return "N/A";
    }

    return `${(numeric / 10).toFixed(1)} C`;
  };

  const resolveTemperatureC = (parsed) => {
    const raw = parsed?.text2?.temp;
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return numeric / 10;
  };

  const getStateLabel = (stateNumber) => {
    if (stateNumber === 0) return "Off";
    if (stateNumber === 1) return "Ready";
    if (stateNumber === 2) return "Brewing";
    if (stateNumber === 3) return "Cupping";
    if (stateNumber === 4) return "Low Battery";
    return "Unknown";
  };

  const formatTime = (value) => {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return "00:00";
    }

    const minutes = Math.floor(numeric / 60);
    const seconds = numeric % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const resolveCupState = (parsed) => {
    const rawState = parsed?.text1?.state;
    const parsedState = Number.parseInt(rawState, 10);
    return Number.isFinite(parsedState) ? parsedState : null;
  };

  const resolveCupUuid = (parsed) => {
    const primaryUuid = parsed?.text2?.UUID || parsed?.text2?.uuid || parsed?.text2?.u;
    if (primaryUuid) {
      return normalizeCupUuid(primaryUuid);
    }

    return null;
  };

  const isNoSessionMode = (parsed) => {
    const sessionUuid = parsed?.text4?.sessionUUID ?? parsed?.text4?.u;
    return String(sessionUuid || "").trim().toUpperCase() === "NO-SESSION";
  };

  const resolveCupNumberFromText4 = (parsed) => {
    const rawCupNumber = parsed?.text4?.cupNumber ?? parsed?.text4?.y;
    const parsedCupNumber = Number.parseInt(rawCupNumber, 10);
    if (!Number.isFinite(parsedCupNumber) || parsedCupNumber < 1) {
      return null;
    }
    return parsedCupNumber;
  };

  const scanCupForAssessment = async ({ statusPrefix } = {}) => {
    const flowEvents = [];
    addFlowEvent(flowEvents, "SCAN_START");
    if (
      scanInProgressRef.current ||
      nfcLaunchGuardRef.current ||
      warningVisibleRef.current ||
      sleepDialogVisibleRef.current ||
      notInSessionDialogVisibleRef.current
    ) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs - lastScanAtRef.current < SCAN_COOLDOWN_MS) {
      setScanStatusMessage("Please wait a moment before scanning again.");
      addFlowEvent(flowEvents, "SCAN_ABORT_COOLDOWN");
      return;
    }
    lastScanAtRef.current = nowMs;
    const actionToken = beginNfcAction(statusPrefix || "Scan cup to start assessment...");

    try {
      const readResult = await readNdef();
      addFlowEvent(flowEvents, `READ_OK records=${Number(readResult?.recordCount) || 0}`);
      if (!isCurrentNfcAction(actionToken)) {
        addFlowEvent(flowEvents, "SCAN_ABORT_STALE_ACTION");
        return;
      }
      const parsed = readResult?.parsed || {};
      const recordCount = Number(readResult?.recordCount) || 0;

      if (recordCount === 0) {
        addFlowEvent(flowEvents, "READ_EMPTY_NDEF");
        throw new Error("No NDEF records found. Please scan the physical cup.");
      }

      const cupState = resolveCupState(parsed);
      setHomeTemperatureC(resolveTemperatureC(parsed));
      setHomeTimeLabel(formatTime(parsed?.text2?.time));
      setHomeStateLabel(getStateLabel(cupState));
      if (cupState === 0) {
        addFlowEvent(flowEvents, "STATE_SLEEPING");
        setScanStatusMessage("Cup is sleeping.");
        sleepDialogVisibleRef.current = true;
        setSleepDialogVisible(true);
        return;
      }

      if (![1, 2, 3].includes(cupState)) {
        addFlowEvent(flowEvents, `STATE_UNSUPPORTED value=${String(cupState)}`);
        throw new Error("Cup state is not ready for cupping assessment.");
      }

      const cupUUID = resolveCupUuid(parsed);
      if (!cupUUID) {
        addFlowEvent(flowEvents, "UUID_MISSING");
        throw new Error("Could not read cup UUID from NDEF Text 2.");
      }

      if (isNoSessionMode(parsed)) {
        addFlowEvent(flowEvents, `NO_SESSION_MODE state=${String(cupState)}`);
        setSelectedCupContext(null);
        setRoute("Home");
        if (cupState === BREWING_STATE) {
          setScanStatusMessage("No-session cup is brewing.");
        } else if (cupState === 3) {
          setScanStatusMessage("No-session cup is in cupping state.");
        } else {
          setScanStatusMessage("No-session cup ready.");
        }
        return;
      }

      const activeSample = await findActiveSampleByCupUUID(cupUUID);
      if (!activeSample) {
        addFlowEvent(flowEvents, `NO_ACTIVE_SAMPLE uuid=${cupUUID}`);
        setScanStatusMessage("Cup is not associated with a cupping session.");
        notInSessionDialogVisibleRef.current = true;
        setNotInSessionDialogVisible(true);
        return;
      }
      const hasFinalFeedback = await hasFinalFeedbackForSample(activeSample.sampleId);

      const cupStatus = {
        state: cupState === 1 ? "READY" : cupState === BREWING_STATE ? "BREWING" : "CUPPING",
        temp: formatTemp(parsed?.text2?.temp),
        time: formatTime(parsed?.text2?.time),
      };
      const ndefCupNumber = resolveCupNumberFromText4(parsed);

      setSelectedCupContext({
        cupUUID,
        cupStateNumber: cupState,
        cupStatus,
        sessionId: activeSample.sessionId,
        sampleId: activeSample.sampleId,
        cupIndex: activeSample.cupIndex,
        cupTotal: activeSample.cupTotal,
        defectsCupTotal: ndefCupNumber || activeSample.cupNumber || 1,
        startInFinalMode: hasFinalFeedback,
        startInFinalSaved: hasFinalFeedback,
      });

      if (cupState === BREWING_STATE) {
        setScanStatusMessage("Cup is brewing. Assessment is locked until cupping state.");
      } else {
        setScanStatusMessage("");
      }
      setRoute("Cupping");
      addFlowEvent(flowEvents, `ROUTE_CUPPING uuid=${cupUUID}`);
    } catch (error) {
      if (!isCurrentNfcAction(actionToken)) {
        addFlowEvent(flowEvents, "SCAN_ABORT_STALE_ERROR");
        return;
      }
      const message = mapScanErrorMessage(error, "Unable to scan cup.");
      addFlowEvent(flowEvents, `ERROR ${message}`);
      setScanStatusMessage(message);
      logHomeError({
        flow: "home_scan",
        friendlyMessage: message,
        error,
        events: flowEvents,
      });
      if (!isTransientScanMessage(message)) {
        showWarning("Scan Failed", message);
      }
    } finally {
      finishCurrentNfcAction(actionToken);
    }
  };

  const handleScanCupFromHome = async () => {
    await scanCupForAssessment({ statusPrefix: "Scan cup to start assessment..." });
  };

  const handleScanNextCupFromCupping = async () => {
    await scanCupForAssessment({ statusPrefix: "Scan next cup..." });
  };

  const handleAddCupToSessionFromSleepDialog = () => {
    sleepDialogVisibleRef.current = false;
    notInSessionDialogVisibleRef.current = false;
    setSleepDialogVisible(false);
    setNotInSessionDialogVisible(false);
    setSelectedSessionId(null);
    setRoute("Cupping Session");
  };

  const handleUseWithoutSessionFromSleepDialog = async () => {
    const flowEvents = [];
    addFlowEvent(flowEvents, "USE_WITHOUT_SESSION_FROM_SLEEP_START");
    sleepDialogVisibleRef.current = false;
    notInSessionDialogVisibleRef.current = false;
    setSleepDialogVisible(false);
    setNotInSessionDialogVisible(false);
    const actionToken = beginNfcAction("Scan sleeping cup to wake it up...");

    try {
      const result = await readNdef();
      const parsed = result?.parsed || {};
      const currentState = resolveCupState(parsed || {});
      addFlowEvent(flowEvents, `READ_STATE value=${String(currentState)}`);
      if (currentState !== 0) {
        throw new Error("Scanned cup is not in sleeping state.");
      }

      await writeNdef({
        text1: {
          ...(parsed?.text1 || {}),
          state: 1,
        },
        text2: parsed?.text2 ?? parsed?.raw?.text2 ?? {},
        text3: parsed?.text3 ?? parsed?.raw?.text3 ?? {},
        text4: {
          coffeeName: "",
          coffeeProcess: "",
          cupNumber: "",
          sessionName: "",
          sessionType: "",
          sessionDate: "",
          sessionUUID: "NO-SESSION",
        },
      });

      setHomeTemperatureC(resolveTemperatureC(parsed || {}));
      setHomeTimeLabel(formatTime(parsed?.text2?.time));
      setHomeStateLabel("Ready");
      setScanStatusMessage("Cup wake successful. State set to READY.");
      addFlowEvent(flowEvents, "WRITE_OK_READY");
    } catch (error) {
      if (!isCurrentNfcAction(actionToken)) {
        return;
      }
      const message = mapScanErrorMessage(error, "Unable to wake cup.");
      addFlowEvent(flowEvents, `ERROR ${message}`);
      setScanStatusMessage(message);
      logHomeError({
        flow: "use_without_session_from_sleep",
        friendlyMessage: message,
        error,
        events: flowEvents,
      });
      showWarning("Wake Failed", message);
    } finally {
      finishCurrentNfcAction(actionToken);
    }
  };

  const handleUseWithoutSessionFromNotInSessionDialog = async () => {
    const flowEvents = [];
    addFlowEvent(flowEvents, "USE_WITHOUT_SESSION_NOT_IN_SESSION_START");
    notInSessionDialogVisibleRef.current = false;
    setNotInSessionDialogVisible(false);
    const actionToken = beginNfcAction("Scan cup to set it to READY...");

    try {
      const result = await readNdef();
      const parsed = result?.parsed || {};
      const currentState = resolveCupState(parsed || {});
      addFlowEvent(flowEvents, `READ_STATE value=${String(currentState)}`);
      if (![1, 2, 3].includes(currentState)) {
        throw new Error("Scanned cup is not in state READY, BREWING, or CUPPING.");
      }

      await writeNdef({
        text1: {
          ...(parsed?.text1 || {}),
          state: 1,
        },
        text2: parsed?.text2 ?? parsed?.raw?.text2 ?? {},
        text3: parsed?.text3 ?? parsed?.raw?.text3 ?? {},
        text4: {
          coffeeName: "",
          coffeeProcess: "",
          cupNumber: "",
          sessionName: "",
          sessionType: "",
          sessionDate: "",
          sessionUUID: "NO-SESSION",
        },
      });

      setHomeTemperatureC(resolveTemperatureC(parsed || {}));
      setHomeTimeLabel(formatTime(parsed?.text2?.time));
      setHomeStateLabel("Ready");
      setScanStatusMessage("Cup updated. State set to READY.");
      addFlowEvent(flowEvents, "WRITE_OK_READY");
    } catch (error) {
      if (!isCurrentNfcAction(actionToken)) {
        return;
      }
      const message = mapScanErrorMessage(error, "Unable to update cup state.");
      addFlowEvent(flowEvents, `ERROR ${message}`);
      setScanStatusMessage(message);
      logHomeError({
        flow: "use_without_session_from_not_in_session",
        friendlyMessage: message,
        error,
        events: flowEvents,
      });
      showWarning("Update Failed", message);
    } finally {
      finishCurrentNfcAction(actionToken);
    }
  };

  const handleResetCupToOffFromMenu = async () => {
    const flowEvents = [];
    addFlowEvent(flowEvents, "RESET_TO_OFF_START");
    closeDrawer();
    setRoute("Home");
    setSelectedCupContext(null);
    const actionToken = beginNfcAction("Scan cup to reset state to OFF...");

    try {
      const result = await readNdef();
      const parsed = result?.parsed || {};

      await writeNdef({
        text1: {
          ...(parsed?.text1 || {}),
          state: 0,
        },
        text2: parsed?.text2 ?? parsed?.raw?.text2 ?? {},
        text3: parsed?.text3 ?? parsed?.raw?.text3 ?? {},
        text4: parsed?.text4 ?? parsed?.raw?.text4 ?? {},
      });

      setHomeTemperatureC(resolveTemperatureC(parsed || {}));
      setHomeTimeLabel(formatTime(parsed?.text2?.time));
      setHomeStateLabel("Off");
      setScanStatusMessage("Cup reset successful. State set to OFF.");
      addFlowEvent(flowEvents, "WRITE_OK_OFF");
    } catch (error) {
      if (!isCurrentNfcAction(actionToken)) {
        return;
      }
      const message = mapScanErrorMessage(error, "Unable to reset cup state.");
      addFlowEvent(flowEvents, `ERROR ${message}`);
      setScanStatusMessage(message);
      logHomeError({
        flow: "reset_cup_to_off",
        friendlyMessage: message,
        error,
        events: flowEvents,
      });
      showWarning("Reset Failed", message);
    } finally {
      finishCurrentNfcAction(actionToken);
    }
  };

  const handleShareLatestErrorLog = async () => {
    closeDrawer();
    try {
      const uri = await shareLatestErrorLog();
      setScanStatusMessage(`Shared error log: ${uri.split("/").pop()}`);
    } catch (error) {
      const message = error?.message || "Could not share error log.";
      setScanStatusMessage(message);
      showWarning("Share Log Failed", message);
    }
  };

  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.timing(anim, {
      toValue: 1,
      duration: DRAWER_ANIMATION_MS,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(anim, {
      toValue: 0,
      duration: DRAWER_ANIMATION_MS,
      useNativeDriver: true,
    }).start(() => setDrawerVisible(false));
  };

  const navigate = (nextRoute) => {
    setRoute(nextRoute);
    closeDrawer();
  };

  const content = useMemo(() => {
    if (route === "Cupping") {
      return (
        <CuppingScreen
          onBackPress={() => setRoute("Home")}
          cupUUID={selectedCupContext?.cupUUID}
          cupStateNumber={selectedCupContext?.cupStateNumber}
          cupStatus={selectedCupContext?.cupStatus}
          cupIndex={selectedCupContext?.cupIndex}
          cupTotal={selectedCupContext?.cupTotal}
          defectsCupTotal={selectedCupContext?.defectsCupTotal}
          sessionId={selectedCupContext?.sessionId}
          sampleId={selectedCupContext?.sampleId}
          startInFinalMode={selectedCupContext?.startInFinalMode}
          startInFinalSaved={selectedCupContext?.startInFinalSaved}
          onScanNextSample={handleScanNextCupFromCupping}
          isScanInProgress={isScanInProgress}
        />
      );
    }
    if (route === "NFC Test") {
      return <NfcServiceTestScreen onBackPress={() => setRoute("Home")} />;
    }
    if (route === "Cupping Session") {
      return (
        <CuppingSessionScreen
          onBackPress={() => setRoute("Home")}
          onSearchPress={() => {}}
          onNewSessionPress={() => {
            setSelectedSessionId(null);
            setRoute("Cupping Session Details");
          }}
          onSessionPress={(session) => {
            setSelectedSessionId(session?.id || null);
            setRoute("Cupping Session Details");
          }}
        />
      );
    }
    if (route === "Cupping Session Details") {
      return (
        <CuppingSessionDetailsScreen
          onBackPress={() => setRoute("Cupping Session")}
          sessionId={selectedSessionId}
        />
      );
    }
    if (route === "Coffee Library") {
      return <CoffeeLibraryScreen onBackPress={() => setRoute("Home")} onSearchPress={() => {}} />;
    }
    if (route === "Cup Settings") {
      return <CupSettingsScreen onBackPress={() => setRoute("Home")} />;
    }
    if (route === "Account") {
      return <AccountScreen onBackPress={() => setRoute("Home")} />;
    }
    return (
      <HomeScreen
        onMenuPress={openDrawer}
        onScanCupPress={handleScanCupFromHome}
        isScanInProgress={isScanInProgress}
        scanStatusMessage={scanStatusMessage}
        temperatureC={homeTemperatureC}
        stateLabel={homeStateLabel}
        timeLabel={homeTimeLabel}
      />
    );
  }, [
    route,
    selectedSessionId,
    selectedCupContext,
    isScanInProgress,
    scanStatusMessage,
    homeTemperatureC,
    homeStateLabel,
    homeTimeLabel,
  ]);

  const drawerTranslateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });

  return (
    <View style={styles.root}>
      <View style={styles.content}>{content}</View>

      {drawerVisible ? (
        <View style={styles.overlayContainer} pointerEvents="box-none">
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable
              style={styles.backdropPressArea}
              onPress={closeDrawer}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            />
          </Animated.View>

          <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerTranslateX }] }]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>CUP Menu</Text>
              <Pressable
                onPress={closeDrawer}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              >
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.drawerList}>
              {MENU_ITEMS.map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.drawerItem, item.key === "nfc-test" ? styles.hiddenDrawerItem : null]}
                  onPress={() => {
                    if (item.action === "reset-cup-off") {
                      handleResetCupToOffFromMenu();
                      return;
                    }
                    if (item.action === "share-error-log") {
                      handleShareLatestErrorLog();
                      return;
                    }
                    navigate(item.route);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.label}`}
                >
                  <Text
                    style={[styles.drawerItemText, item.key === "nfc-test" ? styles.hiddenDrawerItemText : null]}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[styles.drawerChevron, item.key === "nfc-test" ? styles.hiddenDrawerItemText : null]}
                  >
                    ›
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </View>
      ) : null}

      <WarningDialog
        visible={sleepDialogVisible}
        title="Cup Sleeping zz"
        message="To use the cup you need wake it up."
        secondaryLabel="Add cup to session"
        onSecondary={handleAddCupToSessionFromSleepDialog}
        okLabel="Use without session"
        onOk={handleUseWithoutSessionFromSleepDialog}
      />

      <WarningDialog
        visible={notInSessionDialogVisible}
        title="Cup Not in Session"
        message="This cup is not associated with a cupping session."
        secondaryLabel="Add cup to session"
        onSecondary={handleAddCupToSessionFromSleepDialog}
        okLabel="Use without session"
        onOk={handleUseWithoutSessionFromNotInSessionDialog}
      />

      <WarningDialog
        visible={warningVisible}
        title={warningTitle}
        message={warningMessage}
        okLabel="OK"
        onOk={() => {
          warningVisibleRef.current = false;
          setWarningVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
  backdropPressArea: {
    flex: 1,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingTop: 52,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  drawerList: {
    paddingHorizontal: 12,
    paddingTop: 16,
    gap: 6,
  },
  drawerItem: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  drawerItemText: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  hiddenDrawerItem: {
    borderColor: "#ffffff",
    backgroundColor: "#ffffff",
  },
  hiddenDrawerItemText: {
    color: "#ffffff",
  },
  drawerChevron: {
    fontSize: 20,
    color: colors.textMuted,
  },
});
