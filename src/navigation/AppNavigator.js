import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { HomeScreen } from "../features/home/screens/HomeScreen";
import { CuppingScreen } from "../features/cupping/screens/CuppingScreen";
import { CuppingSessionScreen } from "../features/cupping/screens/CuppingSessionScreen";
import { CuppingSessionDetailsScreen } from "../features/cupping/screens/CuppingSessionDetailsScreen";
import { ActiveSessionScreen } from "../features/cupping/screens/ActiveSessionScreen";
import { NfcServiceTestScreen } from "../features/nfc/screens/NfcServiceTestScreen";
import { CoffeeLibraryScreen } from "../features/settings/screens/CoffeeLibraryScreen";
import { CupSettingsScreen } from "../features/cup-settings/screens/CupSettingsScreen";
import { AccountScreen } from "../features/account/screens/AccountScreen";
import { WarningDialog } from "../components/ui/WarningDialog";
import { colors } from "../theme/colors";
import { readNdefMinimal, writeNdefMinimal } from "../services/nfcServiceMinimal";
import { playNfcFailureFeedback } from "../services/nfcFailureFeedback";
import { logAppError } from "../services/errorLogger";
import {
  findActiveSampleByCupUUID,
  resolveActiveSampleFromCupMetadata,
} from "../data/sessionRepository";

const DRAWER_WIDTH = 300;
const DRAWER_ANIMATION_MS = 220;
const BREWING_STATE = 2;
const SCAN_COOLDOWN_MS = 1200;
const HOME_WRITE_HANDOFF_MS = 700;
const WRITE_BLOCK_FLAG = "__CUPPING_READ_ONLY_NFC_WRITE_BLOCK__";

const MENU_ITEMS = [
  { key: "active-session", label: "Active Session", route: "Active Session" },
  { key: "cupping-sessions", label: "Cupping Sessions", route: "Cupping Session" },
  { key: "cup-settings", label: "Cup Settings", route: "Cup Settings" },
  { key: "reset-cup-off", label: "Reset Cup to OFF", action: "reset-cup-off" },
  { key: "switch-cup-brewing", label: "Switch Cup to BREWING", action: "switch-cup-brewing" },
  { key: "nfc-test", label: "NFC Test", route: "NFC Test" },
];

export function AppNavigator() {
  const [route, setRoute] = useState("Home");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedCupContext, setSelectedCupContext] = useState(null);
  const [homeTemperatureC, setHomeTemperatureC] = useState(null);
  const [homeStateLabel, setHomeStateLabel] = useState("Off");
  const [homeTimeLabel, setHomeTimeLabel] = useState("00:00");
  const [homeElapsedSeconds, setHomeElapsedSeconds] = useState(null);
  const [homeBrewTimeSeconds, setHomeBrewTimeSeconds] = useState(null);
  const [homeSampleColour, setHomeSampleColour] = useState(null);
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

  const delay = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

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
    if (lower.includes("scan cancelled") || lower.includes("session was cancelled")) {
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
      text.includes("session was cancelled") ||
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

  const resolveElapsedSeconds = (parsed) => {
    const rawTime = parsed?.text1?.time ?? parsed?.text1?.m ?? parsed?.text2?.time ?? parsed?.text2?.m;
    const numeric = Number.parseInt(rawTime, 10);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  };

  const resolveBrewTimeSeconds = (parsed) => {
    const rawBrewTime = parsed?.text3?.brewTime ?? parsed?.text3?.w;
    const numeric = Number.parseInt(rawBrewTime, 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
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
      const readResult = await readNdefMinimal();
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
      const elapsedSeconds = resolveElapsedSeconds(parsed);
      setHomeTemperatureC(resolveTemperatureC(parsed));
      setHomeTimeLabel(formatTime(elapsedSeconds));
      setHomeElapsedSeconds(elapsedSeconds);
      setHomeBrewTimeSeconds(resolveBrewTimeSeconds(parsed));
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
        setHomeSampleColour(null);
        setRoute("Home");
        if (cupState === BREWING_STATE) {
          setHomeStateLabel("Brewing");
          setScanStatusMessage("No-session cup is brewing.");
        } else if (cupState === 3) {
          setHomeStateLabel("Cupping");
          setScanStatusMessage("No-session cup is in cupping state.");
        } else {
          setHomeStateLabel("Ready");
          setScanStatusMessage("No-session cup ready.");
        }
        return;
      }

      const importedSample = await resolveActiveSampleFromCupMetadata({
        cupUUID,
        metadata: parsed?.text4,
      });
      const activeSample = importedSample || (await findActiveSampleByCupUUID(cupUUID));
      if (!activeSample) {
        addFlowEvent(flowEvents, `NO_ACTIVE_SAMPLE uuid=${cupUUID}`);
        setScanStatusMessage("Cup is not associated with a cupping session.");
        notInSessionDialogVisibleRef.current = true;
        setNotInSessionDialogVisible(true);
        return;
      }
      const cupStatus = {
        state: cupState === 1 ? "READY" : cupState === BREWING_STATE ? "BREWING" : "CUPPING",
        temp: formatTemp(parsed?.text2?.temp),
        time: formatTime(elapsedSeconds),
      };
      const ndefCupNumber = resolveCupNumberFromText4(parsed);
      setHomeSampleColour(activeSample.sampleColour || null);

      setSelectedCupContext({
        cupUUID,
        cupStateNumber: cupState,
        cupStatus,
        sessionId: activeSample.sessionId,
        sampleId: activeSample.sampleId,
        cupIndex: activeSample.cupIndex,
        cupTotal: activeSample.cupTotal,
        sampleNumber: activeSample.sampleNumber,
        sampleColour: activeSample.sampleColour,
        defectsCupTotal: ndefCupNumber || activeSample.cupNumber || 1,
        startInFinalMode: false,
        startInFinalSaved: false,
      });

      if (cupState === BREWING_STATE) {
        setScanStatusMessage("Cup is brewing. Assessment is locked until cupping state.");
        setRoute("Home");
        addFlowEvent(flowEvents, `ROUTE_BREWING uuid=${cupUUID}`);
        return;
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
      await playNfcFailureFeedback(error);
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
    sleepDialogVisibleRef.current = false;
    notInSessionDialogVisibleRef.current = false;
    setSleepDialogVisible(false);
    setNotInSessionDialogVisible(false);
    setIsScanInProgress(true);
    scanInProgressRef.current = true;
    setScanStatusMessage("Scan cup to wake it and set no-session mode...");
    try {
      await delay(HOME_WRITE_HANDOFF_MS);
      await writeNdefMinimal({
        text1: { state: 1 },
        text2: {},
        text3: {},
        text4: { sessionUUID: "NO-SESSION" },
      });
      setHomeStateLabel("Ready");
      setSelectedCupContext(null);
      setRoute("Home");
      setScanStatusMessage("Cup set to READY in no-session mode.");
    } catch (error) {
      const message = error?.message || "Could not wake cup.";
      await playNfcFailureFeedback(error);
      setScanStatusMessage(message);
      logHomeError({
        flow: "home_use_without_session_sleep",
        friendlyMessage: message,
        error,
      });
      showWarning("Wake Failed", message);
    } finally {
      scanInProgressRef.current = false;
      setIsScanInProgress(false);
    }
  };

  const handleUseWithoutSessionFromNotInSessionDialog = async () => {
    notInSessionDialogVisibleRef.current = false;
    setNotInSessionDialogVisible(false);
    setIsScanInProgress(true);
    scanInProgressRef.current = true;
    setScanStatusMessage("Scan cup to set no-session mode...");
    try {
      await delay(HOME_WRITE_HANDOFF_MS);
      await writeNdefMinimal({
        text1: { state: 1 },
        text2: {},
        text3: {},
        text4: { sessionUUID: "NO-SESSION" },
      });
      setHomeStateLabel("Ready");
      setSelectedCupContext(null);
      setRoute("Home");
      setScanStatusMessage("Cup set to READY in no-session mode.");
    } catch (error) {
      const message = error?.message || "Could not update cup.";
      await playNfcFailureFeedback(error);
      setScanStatusMessage(message);
      logHomeError({
        flow: "home_use_without_session_not_in_session",
        friendlyMessage: message,
        error,
      });
      showWarning("Update Failed", message);
    } finally {
      scanInProgressRef.current = false;
      setIsScanInProgress(false);
    }
  };

  const handleResetCupToOffFromMenu = async () => {
    closeDrawer();
    setRoute("Home");
    setSelectedCupContext(null);
    setIsScanInProgress(true);
    scanInProgressRef.current = true;
    setScanStatusMessage("Scan cup to reset it to OFF...");
    try {
      await delay(HOME_WRITE_HANDOFF_MS);
      await writeNdefMinimal({
        text1: { state: 0 },
        text2: {},
        text3: {},
        text4: {},
      });
      setHomeStateLabel("Off");
      setHomeTimeLabel("00:00");
      setHomeSampleColour(null);
      setScanStatusMessage("Cup reset to OFF.");
    } catch (error) {
      const message = error?.message || "Could not reset cup.";
      await playNfcFailureFeedback(error);
      setScanStatusMessage(message);
      logHomeError({
        flow: "home_reset_cup_off",
        friendlyMessage: message,
        error,
      });
      showWarning("Reset Failed", message);
    } finally {
      scanInProgressRef.current = false;
      setIsScanInProgress(false);
    }
  };

  const handleSwitchCupToBrewingFromMenu = async () => {
    closeDrawer();
    setRoute("Home");
    setSelectedCupContext(null);
    setIsScanInProgress(true);
    scanInProgressRef.current = true;
    setScanStatusMessage("Scan cup to switch it to BREWING...");
    try {
      await delay(HOME_WRITE_HANDOFF_MS);
      await writeNdefMinimal({
        text1: { state: BREWING_STATE },
        text2: {},
        text3: {},
        text4: {},
      });
      setHomeStateLabel("Brewing");
      setHomeTimeLabel("00:00");
      setHomeElapsedSeconds(0);
      setHomeBrewTimeSeconds(null);
      setHomeSampleColour(null);
      setScanStatusMessage("Cup switched to BREWING.");
    } catch (error) {
      const message = error?.message || "Could not switch cup to brewing.";
      await playNfcFailureFeedback(error);
      setScanStatusMessage(message);
      logHomeError({
        flow: "home_switch_cup_brewing",
        friendlyMessage: message,
        error,
      });
      showWarning("Switch Failed", message);
    } finally {
      scanInProgressRef.current = false;
      setIsScanInProgress(false);
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
          key={selectedCupContext?.sampleId || selectedCupContext?.cupUUID || "cupping-screen"}
          onBackPress={() => setRoute(selectedCupContext?.sessionId ? "Active Session" : "Home")}
          onScanPress={handleScanNextCupFromCupping}
          cupUUID={selectedCupContext?.cupUUID}
          cupStateNumber={selectedCupContext?.cupStateNumber}
          cupStatus={selectedCupContext?.cupStatus}
          cupIndex={selectedCupContext?.cupIndex}
          cupTotal={selectedCupContext?.cupTotal}
          sampleNumber={selectedCupContext?.sampleNumber}
          sampleColour={selectedCupContext?.sampleColour}
          defectsCupTotal={selectedCupContext?.defectsCupTotal}
          sessionId={selectedCupContext?.sessionId}
          sampleId={selectedCupContext?.sampleId}
          startInFinalMode={selectedCupContext?.startInFinalMode}
          startInFinalSaved={selectedCupContext?.startInFinalSaved}
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
    if (route === "Active Session") {
      return (
        <ActiveSessionScreen
          sessionId={selectedCupContext?.sessionId || null}
          onBackPress={() => setRoute("Home")}
          onScanPress={handleScanCupFromHome}
          isScanInProgress={isScanInProgress}
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
        elapsedSeconds={homeElapsedSeconds}
        brewTimeSeconds={homeBrewTimeSeconds}
        sampleColour={homeSampleColour}
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
    homeElapsedSeconds,
    homeBrewTimeSeconds,
    homeSampleColour,
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
                    if (item.action === "switch-cup-brewing") {
                      handleSwitchCupToBrewingFromMenu();
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
