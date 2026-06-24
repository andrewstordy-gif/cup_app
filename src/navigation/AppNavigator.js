import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../components/ui/TypographyAuditText";
import { HomeScreen } from "../features/home/screens/HomeScreen";
import { CuppingScreen } from "../features/cupping/screens/CuppingScreen";
import { CuppingSessionScreen } from "../features/cupping/screens/CuppingSessionScreen";
import { CuppingSessionDetailsScreen } from "../features/cupping/screens/CuppingSessionDetailsScreen";
import { ActiveSessionScreen } from "../features/cupping/screens/ActiveSessionScreen";
import { NfcServiceTestScreen } from "../features/nfc/screens/NfcServiceTestScreen";
import { CoffeeLibraryScreen } from "../features/settings/screens/CoffeeLibraryScreen";
import { CupSettingsScreen } from "../features/cup-settings/screens/CupSettingsScreen";
import { AccountScreen } from "../features/account/screens/AccountScreen";
import { StyleGuideScreen } from "../features/style-guide/screens/StyleGuideScreen";
import { WarningDialog } from "../components/ui/WarningDialog";
import { CloseButton } from "../components/ui/IconButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { readNdefMinimal, writeNdefMinimal } from "../services/nfcServiceMinimal";
import {
  NFC_TAG_TYPES,
  classifyNfcTagReadResult,
  getNfcTagIdentifier,
  isSmartCupHardwareTag,
  looksLikeSmartCupUuid,
} from "../services/nfcTagClassifier";
import { playNfcFailureFeedback } from "../services/nfcFailureFeedback";
import { logAppError } from "../services/errorLogger";
import {
  activateSession,
  findActiveSampleByCupUUID,
  getSessionById,
  resetSessionToPending,
  resolveActiveSampleFromCupMetadata,
} from "../data/sessionRepository";

// Map session status to the route name used by AppNavigator.
const DRAWER_WIDTH = 300;
const DRAWER_ANIMATION_MS = 220;
const BREWING_STATE = 2;
const QUICK_CUPPING_SESSION_TYPE_KEY = 7;
const SCAN_COOLDOWN_MS = 1200;
const HOME_WRITE_HANDOFF_MS = 700;
const WRITE_BLOCK_FLAG = "__CUPPING_READ_ONLY_NFC_WRITE_BLOCK__";

const MENU_ITEMS = [
  { key: "account", label: "Profile", route: "Account" },
  { key: "cupping-sessions", label: "Cupping Sessions", route: "Cupping Session" },
  { key: "cup-settings", label: "Cup Settings", route: "Cup Settings" },
];

export function AppNavigator() {
  const [route, setRoute] = useState("Home");
  const [cuppingReturnRoute, setCuppingReturnRoute] = useState("Home");

  const goToCupping = (returnRoute) => {
    setCuppingReturnRoute(returnRoute || "Home");
    setRoute("Cupping");
  };
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedCupContext, setSelectedCupContext] = useState(null);
  const [sessionSampleContexts, setSessionSampleContexts] = useState([]);
  const [sampleRuntimeById, setSampleRuntimeById] = useState({});
  const [homeTemperatureC, setHomeTemperatureC] = useState(null);
  const [homeStateLabel, setHomeStateLabel] = useState("Off");
  const [homeTimeLabel, setHomeTimeLabel] = useState("00:00");
  const [homeElapsedSeconds, setHomeElapsedSeconds] = useState(null);
  const [homeBrewTimeSeconds, setHomeBrewTimeSeconds] = useState(null);
  const [homeSampleNumber, setHomeSampleNumber] = useState(null);
  const [isScanInProgress, setIsScanInProgress] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningTitle, setWarningTitle] = useState("Notice");
  const [warningMessage, setWarningMessage] = useState("");
  const [sleepDialogVisible, setSleepDialogVisible] = useState(false);
  const [isCupCompleteSessionDialogVisible, setIsCupCompleteSessionDialogVisible] = useState(false);
  const [isQuickCuppingPending, setIsQuickCuppingPending] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const lastScanAtRef = useRef(0);
  const nfcActionTokenRef = useRef(0);
  const nfcLaunchGuardRef = useRef(false);
  const scanInProgressRef = useRef(false);
  const warningVisibleRef = useRef(false);
  const sleepDialogVisibleRef = useRef(false);
  const pendingCompleteSessionRouteRef = useRef("Home");
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    globalThis[WRITE_BLOCK_FLAG] = route === "Cupping";
  }, [route]);

  useEffect(() => {
    if (selectedSessionId) {
      setIsQuickCuppingPending(false);
    }
  }, [selectedSessionId]);

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

  const rememberSampleRuntime = (sampleId, runtime) => {
    if (!sampleId) {
      return;
    }
    setSampleRuntimeById((prev) => ({
      ...prev,
      [sampleId]: {
        ...(prev[sampleId] || {}),
        ...runtime,
      },
    }));
  };

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

  const resolveCupNumberFromMetadata = (metadata) => {
    const rawCupNumber = metadata?.cupNumber ?? metadata?.y;
    const parsedCupNumber = Number.parseInt(rawCupNumber, 10);
    if (!Number.isFinite(parsedCupNumber) || parsedCupNumber < 1) {
      return null;
    }
    return parsedCupNumber;
  };

  const isNtagCupLike = (tagClassification, tag) =>
    !isSmartCupHardwareTag(tag) &&
    (tagClassification?.type === NFC_TAG_TYPES.NTAG_CUP ||
      tagClassification?.type === NFC_TAG_TYPES.GENERIC_NDEF_TAG ||
      tagClassification?.type === NFC_TAG_TYPES.EMPTY_TAG);

  const scanCupForAssessment = async ({ statusPrefix } = {}) => {
    const flowEvents = [];
    addFlowEvent(flowEvents, "SCAN_START");
    if (
      scanInProgressRef.current ||
      nfcLaunchGuardRef.current ||
      warningVisibleRef.current ||
      sleepDialogVisibleRef.current ||
      isCupCompleteSessionDialogVisible
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
      const tagClassification = classifyNfcTagReadResult(readResult);
      addFlowEvent(flowEvents, `TAG_CLASSIFIED type=${tagClassification.type} reason=${tagClassification.reason}`);

      if (isNtagCupLike(tagClassification, readResult?.tag)) {
        const tagId = normalizeCupUuid(getNfcTagIdentifier(readResult?.tag));
        if (!tagId) {
          addFlowEvent(flowEvents, "NTAG_ID_MISSING");
          throw new Error("Could not read NTAG identifier.");
        }

        if (resolveCupState(parsed) === 0) {
          addFlowEvent(flowEvents, `NTAG_STATE_SLEEPING id=${tagId}`);
          setScanStatusMessage("Cup is sleeping.");
          sleepDialogVisibleRef.current = true;
          setSleepDialogVisible(true);
          return;
        }

        const metadata = tagClassification.metadataPayload;
        const importedSample = metadata
          ? await resolveActiveSampleFromCupMetadata({
              cupUUID: tagId,
              metadata,
            })
          : null;
        const activeSample = importedSample || (await findActiveSampleByCupUUID(tagId));
        if (!activeSample) {
          addFlowEvent(flowEvents, `NTAG_NO_ACTIVE_SAMPLE id=${tagId}`);
          setScanStatusMessage("NTAG cup is not associated with a cupping session.");
          sleepDialogVisibleRef.current = true;
          setSleepDialogVisible(true);
          return;
        }

        const ntagCupNumber = resolveCupNumberFromMetadata(metadata);
        setHomeTemperatureC(null);
        setHomeTimeLabel("00:00");
        setHomeElapsedSeconds(null);
        setHomeBrewTimeSeconds(null);
        setHomeStateLabel("Cupping");
        setHomeSampleNumber(activeSample.sampleNumber || null);
        if (activeSample.sessionId && activeSample.sessionStatus !== "complete") {
          await activateSession(activeSample.sessionId);
        }
        setSelectedCupContext({
          cupUUID: tagId,
          tagType: NFC_TAG_TYPES.NTAG_CUP,
          scanRevision: Date.now(),
          initialScrollTarget: null,
          captureMode: null,
          cupStateNumber: 3,
          cupStatus: {
            state: "CUPPING",
            temp: "N/A",
            time: "00:00",
          },
          sessionId: activeSample.sessionId,
          sampleId: activeSample.sampleId,
          cupIndex: activeSample.cupIndex,
          cupTotal: activeSample.cupTotal,
          sampleNumber: activeSample.sampleNumber,
          cuppingMode: activeSample.cuppingMode || "blind",
          coffeeNameOrigin: activeSample.coffeeNameOrigin || "",
          process: activeSample.coffeeProcess || "",
          defectsCupTotal: ntagCupNumber || activeSample.cupNumber || 1,
          startInFinalMode: false,
          startInFinalSaved: false,
          isSessionComplete: activeSample.sessionStatus === "complete",
        });
        rememberSampleRuntime(activeSample.sampleId, {
          tagType: NFC_TAG_TYPES.NTAG_CUP,
          cupStateNumber: 3,
          cupStatus: {
            state: "CUPPING",
            temp: "N/A",
            time: "00:00",
          },
        });
        setScanStatusMessage("");
        const ntagReturnRoute = activeSample.sessionId ? "Cupping Session Details" : "Home";
        if (activeSample.sessionId) {
          setSelectedSessionId(activeSample.sessionId);
        }
        if (activeSample.sessionStatus === "complete") {
          pendingCompleteSessionRouteRef.current = ntagReturnRoute;
          setIsCupCompleteSessionDialogVisible(true);
          addFlowEvent(flowEvents, `PROMPT_COMPLETE_SESSION_NTAG id=${tagId}`);
          return;
        }
        goToCupping(ntagReturnRoute);
        addFlowEvent(flowEvents, `ROUTE_NTAG_CUPPING id=${tagId}`);
        return;
      }

      if (recordCount === 0) {
        addFlowEvent(flowEvents, "READ_EMPTY_NDEF");
        throw new Error("No NDEF records found. Please scan the physical cup.");
      }

      const cupState = resolveCupState(parsed);
      const elapsedSeconds = resolveElapsedSeconds(parsed);
      const brewTimeSeconds = resolveBrewTimeSeconds(parsed);
      setHomeTemperatureC(resolveTemperatureC(parsed));
      setHomeTimeLabel(formatTime(elapsedSeconds));
      setHomeElapsedSeconds(elapsedSeconds);
      setHomeBrewTimeSeconds(brewTimeSeconds);
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

      const noSessionMode = isNoSessionMode(parsed);
      const importedSample = noSessionMode
        ? null
        : await resolveActiveSampleFromCupMetadata({
            cupUUID,
            metadata: parsed?.text4,
          });
      const activeSample = importedSample || (await findActiveSampleByCupUUID(cupUUID));
      if (activeSample && noSessionMode) {
        addFlowEvent(flowEvents, `NO_SESSION_IGNORED_ACTIVE_SAMPLE uuid=${cupUUID}`);
      }
      if (!activeSample && noSessionMode) {
        addFlowEvent(flowEvents, `NO_SESSION_MODE state=${String(cupState)}`);
        setSelectedCupContext(null);
        setHomeSampleNumber(null);
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
      if (!activeSample) {
        addFlowEvent(flowEvents, `NO_ACTIVE_SAMPLE uuid=${cupUUID}`);
        setScanStatusMessage("Cup is not associated with a cupping session.");
        sleepDialogVisibleRef.current = true;
        setSleepDialogVisible(true);
        return;
      }
      const cupStatus = {
        state: cupState === 1 ? "READY" : cupState === BREWING_STATE ? "BREWING" : "CUPPING",
        temp: formatTemp(parsed?.text2?.temp),
        time: formatTime(elapsedSeconds),
      };
      const ndefCupNumber = resolveCupNumberFromText4(parsed);
      setHomeSampleNumber(activeSample.sampleNumber || null);

      if (activeSample.sessionId && activeSample.sessionStatus !== "complete") {
        await activateSession(activeSample.sessionId);
      }
      setSelectedCupContext({
        cupUUID,
        scanRevision: Date.now(),
        initialScrollTarget: null,
        captureMode: null,
        cupStateNumber: cupState,
        cupStatus,
        sessionId: activeSample.sessionId,
        sampleId: activeSample.sampleId,
        cupIndex: activeSample.cupIndex,
        cupTotal: activeSample.cupTotal,
        sampleNumber: activeSample.sampleNumber,
        cuppingMode: activeSample.cuppingMode || "blind",
        coffeeNameOrigin: activeSample.coffeeNameOrigin || "",
        process: activeSample.coffeeProcess || "",
        defectsCupTotal: ndefCupNumber || activeSample.cupNumber || 1,
        elapsedSeconds,
        brewTimeSeconds,
        startInFinalMode: false,
        startInFinalSaved: false,
        isSessionComplete: activeSample.sessionStatus === "complete",
      });
      rememberSampleRuntime(activeSample.sampleId, {
        cupStateNumber: cupState,
        cupStatus,
        elapsedSeconds,
        brewTimeSeconds,
      });

      if (cupState === BREWING_STATE) {
        setScanStatusMessage("");
        setRoute("Home");
        addFlowEvent(flowEvents, `ROUTE_BREWING uuid=${cupUUID}`);
        return;
      } else {
        setScanStatusMessage("");
      }
      const ndefReturnRoute = activeSample.sessionId ? "Cupping Session Details" : "Home";
      if (activeSample.sessionId) {
        setSelectedSessionId(activeSample.sessionId);
      }
      if (activeSample.sessionStatus === "complete") {
        pendingCompleteSessionRouteRef.current = ndefReturnRoute;
        setIsCupCompleteSessionDialogVisible(true);
        addFlowEvent(flowEvents, `PROMPT_COMPLETE_SESSION_NDEF uuid=${cupUUID}`);
        return;
      }
      goToCupping(ndefReturnRoute);
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

  const handleAddAromaFromBrewing = () => {
    if (!selectedCupContext?.sessionId || !selectedCupContext?.sampleId) {
      return;
    }

    setSelectedCupContext((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        scanRevision: Date.now(),
        initialScrollTarget: "top",
        captureMode: "aroma_only",
        cupStateNumber: 3,
        cupStatus: {
          ...(current.cupStatus || {}),
          state: "CUPPING",
        },
      };
    });
    setScanStatusMessage("");
    setRoute("Cupping");
  };

  const handleActiveSessionBack = () => {
    if (selectedCupContext?.captureMode === "aroma_only") {
      setHomeStateLabel("Off");
      setHomeTemperatureC(null);
      setHomeTimeLabel("00:00");
      setHomeElapsedSeconds(null);
      setHomeBrewTimeSeconds(null);
      setHomeSampleNumber(null);
      setScanStatusMessage("");
      setSelectedCupContext(null);
    }
    setRoute("Home");
  };

  const handleAddCupToSessionFromSleepDialog = () => {
    sleepDialogVisibleRef.current = false;
    setSleepDialogVisible(false);
    setIsQuickCuppingPending(false);
    setSelectedSessionId(null);
    setRoute("Cupping Session");
  };

  const handleStartQuickCuppingFromSleepDialog = () => {
    sleepDialogVisibleRef.current = false;
    setSleepDialogVisible(false);
    setIsQuickCuppingPending(true);
    setSelectedSessionId(null);
    setSelectedCupContext(null);
    setRoute("Cupping Session Details");
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
      setHomeSampleNumber(null);
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
      setHomeSampleNumber(null);
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

  useEffect(() => {
    let isCancelled = false;

    const loadSessionSamples = async () => {
      const sessionId = selectedCupContext?.sessionId;
      if (!sessionId) {
        setSessionSampleContexts([]);
        return;
      }

      try {
        const session = await getSessionById(sessionId);
        if (isCancelled) {
          return;
        }
        setSessionSampleContexts(Array.isArray(session?.samples) ? session.samples : []);
      } catch {
        if (!isCancelled) {
          setSessionSampleContexts([]);
        }
      }
    };

    loadSessionSamples();

    return () => {
      isCancelled = true;
    };
  }, [selectedCupContext?.sessionId]);

  const buildContextFromSessionSample = (sample, index, total, options = {}) => {
    if (!sample) {
      return null;
    }

    const runtime = sampleRuntimeById[sample.id] || {};
    const cupStateNumber = options.cupStateNumber ?? 3;
    const isSessionComplete =
      options.isSessionComplete ?? selectedCupContext?.isSessionComplete ?? sample.sessionStatus === "complete";
    const cupStatus = options.cupStatus || { state: "CUPPING", temp: "N/A", time: "00:00" };
    const fallbackTagType = looksLikeSmartCupUuid(sample.cupUUID) ? null : NFC_TAG_TYPES.NTAG_CUP;

    return {
      cupUUID: sample.cupUUID,
      tagType: runtime.tagType || fallbackTagType,
      cupStateNumber,
      cupStatus,
      sessionId: options.sessionId || selectedCupContext?.sessionId || sample.sessionId,
      sampleId: sample.id,
      cupIndex: index,
      cupTotal: total,
      sampleNumber: Number(sample.sampleNumber) || index + 1,
      cuppingMode: sample.cuppingMode || "blind",
      coffeeNameOrigin: sample.coffeeNameOrigin || "",
      process: sample.process || "",
      defectsCupTotal: Number(sample.cupNumber) || 1,
      elapsedSeconds: runtime.elapsedSeconds ?? null,
      brewTimeSeconds: runtime.brewTimeSeconds ?? null,
      initialScrollTarget: null,
      captureMode: null,
      startInFinalMode: false,
      startInFinalSaved: false,
      isSessionComplete: Boolean(isSessionComplete),
    };
  };

  const handleCuppingSampleSwipe = (direction) => {
    const samples = sessionSampleContexts;
    if (!selectedCupContext?.sessionId || !Array.isArray(samples) || samples.length <= 1) {
      return;
    }

    const currentIndex = samples.findIndex((sample) => sample.id === selectedCupContext.sampleId);
    const fallbackIndex = Number.isInteger(Number(selectedCupContext.cupIndex))
      ? Number(selectedCupContext.cupIndex)
      : 0;
    const resolvedIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const nextIndex = direction === "previous" ? resolvedIndex - 1 : resolvedIndex + 1;
    if (nextIndex < 0 || nextIndex >= samples.length) {
      return;
    }

    const nextContext = buildContextFromSessionSample(samples[nextIndex], nextIndex, samples.length);
    if (nextContext) {
      setSelectedCupContext(nextContext);
      setScanStatusMessage("");
      setRoute("Cupping"); // keep existing cuppingReturnRoute
    }
  };

  const handleActiveSessionSamplePress = (sample, index = 0, total = 1) => {
    const context = buildContextFromSessionSample(sample, index, total);
    if (!context) {
      return;
    }

    setSelectedCupContext(context);
    setScanStatusMessage("");
    goToCupping(route); // return to whichever session screen launched this
  };

  const handleSessionDetailsSampleOpen = (sample, index = 0, total = 1, options = {}) => {
    const context = buildContextFromSessionSample(sample, index, total, {
      sessionId: selectedSessionId,
      isSessionComplete: Boolean(options.isSessionComplete),
    });
    if (!context) {
      return;
    }

    setSelectedCupContext(context);
    setScanStatusMessage("");
    goToCupping("Cupping Session Details");
  };

  const handleQuickStartSampleReady = ({ sessionId, sample } = {}) => {
    setIsQuickCuppingPending(false);

    if (!sessionId || !sample) {
      return;
    }

    const context = buildContextFromSessionSample(sample, 0, 1, {
      sessionId,
      isSessionComplete: false,
      cupStateNumber: 1,
      cupStatus: { state: "READY", temp: "N/A", time: "00:00" },
    });
    if (!context) {
      return;
    }

    setSelectedSessionId(sessionId);
    setSelectedCupContext(context);
    setScanStatusMessage("");
    goToCupping("Cupping Session Details");
  };

  const content = useMemo(() => {
    if (route === "Cupping") {
      return (
        <CuppingScreen
          key={selectedCupContext?.sampleId || selectedCupContext?.cupUUID || "cupping-screen"}
          onBackPress={() => {
            setSelectedSessionId(selectedCupContext?.sessionId || selectedSessionId || null);
            setRoute(cuppingReturnRoute);
          }}
          onScanPress={handleScanNextCupFromCupping}
          cupUUID={selectedCupContext?.cupUUID}
          tagType={selectedCupContext?.tagType}
          cupStateNumber={selectedCupContext?.cupStateNumber}
          cupStatus={selectedCupContext?.cupStatus}
          cupIndex={selectedCupContext?.cupIndex}
          cupTotal={selectedCupContext?.cupTotal}
          sampleNumber={selectedCupContext?.sampleNumber}
          cuppingMode={selectedCupContext?.cuppingMode}
          coffeeNameOrigin={selectedCupContext?.coffeeNameOrigin}
          process={selectedCupContext?.process}
          defectsCupTotal={selectedCupContext?.defectsCupTotal}
          sessionId={selectedCupContext?.sessionId}
          sampleId={selectedCupContext?.sampleId}
          startInFinalMode={selectedCupContext?.startInFinalMode}
          startInFinalSaved={selectedCupContext?.startInFinalSaved}
          isScanInProgress={isScanInProgress}
          canSwipeSamples={sessionSampleContexts.length > 1}
          onSampleSwipe={handleCuppingSampleSwipe}
          elapsedSeconds={selectedCupContext?.elapsedSeconds}
          brewTimeSeconds={selectedCupContext?.brewTimeSeconds}
          scanRevision={selectedCupContext?.scanRevision}
          initialScrollTarget={selectedCupContext?.initialScrollTarget}
          captureMode={selectedCupContext?.captureMode}
          isSessionComplete={selectedCupContext?.isSessionComplete || false}
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
            setIsQuickCuppingPending(false);
            setSelectedSessionId(null);
            setRoute("Cupping Session Details");
          }}
          onSessionPress={(session) => {
            setIsQuickCuppingPending(false);
            setSelectedSessionId(session?.id || null);
            setRoute("Cupping Session Details");
          }}
        />
      );
    }
    if (route === "Cupping Session Details") {
      return (
        <CuppingSessionDetailsScreen
          onBackPress={() => {
            setIsQuickCuppingPending(false);
            setRoute("Cupping Session");
          }}
          onSaveSuccess={(savedSessionId) => {
            setIsQuickCuppingPending(false);
            setSelectedSessionId(savedSessionId);
            setRoute("Cupping Session Details");
          }}
          onOpenSample={handleSessionDetailsSampleOpen}
          onScanCupForAssessment={() =>
            scanCupForAssessment({ statusPrefix: "Scan cup to start assessment..." })
          }
          quickStartSessionTypeKey={
            isQuickCuppingPending ? QUICK_CUPPING_SESSION_TYPE_KEY : undefined
          }
          onQuickStartSampleReady={handleQuickStartSampleReady}
          sessionId={selectedSessionId}
        />
      );
    }
    if (route === "New Session") {
      return (
        <ActiveSessionScreen
          mode="new"
          sessionId={selectedSessionId}
          onBackPress={() => setRoute("Cupping Session")}
          onEditSession={() => setRoute("Cupping Session Details")}
          isScanInProgress={isScanInProgress}
        />
      );
    }
    if (route === "Pending Session") {
      return (
        <ActiveSessionScreen
          mode="pending"
          sessionId={selectedSessionId || selectedCupContext?.sessionId || null}
          onBackPress={() => {
            if (selectedSessionId) {
              setRoute("Cupping Session");
            } else {
              handleActiveSessionBack();
            }
          }}
          onSessionComplete={(completedSessionId) => {
            setSelectedSessionId(completedSessionId || selectedSessionId);
            setRoute("Complete Session");
          }}
          onScanPress={handleScanCupFromHome}
          onSamplePress={handleActiveSessionSamplePress}
          isScanInProgress={isScanInProgress}
        />
      );
    }
    if (route === "Complete Session") {
      return (
        <ActiveSessionScreen
          mode="complete"
          sessionId={selectedSessionId}
          onBackPress={() => setRoute("Cupping Session")}
          onSamplePress={(sample, index, total) => {
            const context = buildContextFromSessionSample(sample, index, total);
            if (!context) return;
            setSelectedCupContext({ ...context, isSessionComplete: true });
            setScanStatusMessage("");
            goToCupping("Complete Session");
          }}
          onResetToPending={async (sid) => {
            await resetSessionToPending(sid || selectedSessionId);
            setSelectedSessionId(sid || selectedSessionId);
            setRoute("Pending Session");
          }}
          isScanInProgress={false}
        />
      );
    }
    if (route === "Coffee Library") {
      return <CoffeeLibraryScreen onBackPress={() => setRoute("Home")} onSearchPress={() => {}} />;
    }
    if (route === "Cup Settings") {
      return (
        <CupSettingsScreen
          onBackPress={() => setRoute("Home")}
          onResetCupToOff={handleResetCupToOffFromMenu}
          onSwitchCupToBrewing={handleSwitchCupToBrewingFromMenu}
        />
      );
    }
    if (route === "Account") {
      return <AccountScreen onBackPress={() => setRoute("Home")} />;
    }
    if (route === "Style Guide") {
      return <StyleGuideScreen onBackPress={() => setRoute("Home")} />;
    }
    return (
      <HomeScreen
        onMenuPress={openDrawer}
        onScanCupPress={handleScanCupFromHome}
        onAddAromaPress={
          selectedCupContext?.sessionId && homeStateLabel === "Brewing" ? handleAddAromaFromBrewing : undefined
        }
        isScanInProgress={isScanInProgress}
        scanStatusMessage={scanStatusMessage}
        temperatureC={homeTemperatureC}
        stateLabel={homeStateLabel}
        timeLabel={homeTimeLabel}
        elapsedSeconds={homeElapsedSeconds}
        brewTimeSeconds={homeBrewTimeSeconds}
        sampleNumber={homeSampleNumber}
      />
    );
  }, [
    route,
    selectedSessionId,
    selectedCupContext,
    sessionSampleContexts,
    sampleRuntimeById,
    isScanInProgress,
    scanStatusMessage,
    homeTemperatureC,
    homeStateLabel,
    homeTimeLabel,
    homeElapsedSeconds,
    homeBrewTimeSeconds,
    homeSampleNumber,
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
              <CloseButton
                onPress={closeDrawer}
                style={styles.closeButton}
                accessibilityLabel="Close menu"
              />
            </View>

            <View style={styles.drawerList}>
              {MENU_ITEMS.map((item) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                  onPress={() => {
                    if (item.setSessionId) {
                      setSelectedSessionId(selectedCupContext?.sessionId || null);
                    }
                    navigate(item.route);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.label}`}
                >
                  <View style={styles.drawerItemMeta}>
                    <Text style={styles.drawerItemText}>{item.label}</Text>
                  </View>
                  <Text style={styles.drawerChevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </View>
      ) : null}

      <WarningDialog
        visible={sleepDialogVisible}
        title=""
        message="How would you like to use this cup?"
        onDismiss={() => {
          sleepDialogVisibleRef.current = false;
          setSleepDialogVisible(false);
        }}
        secondaryLabel="Add cup to session"
        onSecondary={handleAddCupToSessionFromSleepDialog}
        secondaryButtonStyle={styles.sleepDialogCharcoalButton}
        okLabel="Quick cupping"
        onOk={handleStartQuickCuppingFromSleepDialog}
        okButtonStyle={styles.sleepDialogGreyButton}
        okButtonTextStyle={styles.sleepDialogGreyButtonText}
        variant="cupping-choice"
      />

      <WarningDialog
        visible={isCupCompleteSessionDialogVisible}
        title=""
        message="This session is already complete. What would you like to do with this cup?"
        onDismiss={() => {
          setIsCupCompleteSessionDialogVisible(false);
        }}
        secondaryLabel="Reset Cup to OFF"
        onSecondary={() => {
          setIsCupCompleteSessionDialogVisible(false);
          handleResetCupToOffFromMenu();
        }}
        okLabel="Stay in Session"
        onOk={() => {
          setIsCupCompleteSessionDialogVisible(false);
          goToCupping(pendingCompleteSessionRouteRef.current);
        }}
        variant="cupping-choice"
      />

      <WarningDialog
        visible={warningVisible}
        title={warningTitle}
        message={warningMessage}
        okLabel="OK"
        onDismiss={() => {
          warningVisibleRef.current = false;
          setWarningVisible(false);
        }}
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
  sleepDialogCharcoalButton: {
    backgroundColor: colors.ink,
  },
  sleepDialogGreyButton: {
    backgroundColor: colors.muted,
  },
  sleepDialogGreyButtonText: {
    color: colors.ink,
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
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
  },
  drawerTitle: {
    ...typography.text_section_title,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerList: {
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  drawerItem: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
  },
  drawerItemPressed: {
    opacity: 0.6,
  },
  drawerItemMeta: {
    flex: 1,
    gap: 2,
  },
  drawerItemText: {
    ...typography.text_body,
  },
  drawerChevron: {
    ...typography.text_body,
    color: colors.inkSoft,
    fontSize: 20,
  },
});
