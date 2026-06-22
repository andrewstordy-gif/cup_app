import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenFooter, ScreenFooterDual } from "../../../components/ui/ScreenFooter";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

function formatTemperature(temperatureC) {
  const numeric = Number.parseFloat(temperatureC);
  if (!Number.isFinite(numeric)) {
    return "-- °C";
  }
  return `${Math.round(numeric)} °C`;
}

function toFiniteNumber(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDurationLabel(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "-:--";
  }

  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function resolveHomeState(stateLabel) {
  const state = String(stateLabel || "").trim().toLowerCase();
  if (state === "brewing") {
    return { title: "Brewing", isBrewing: true, showTemperature: true };
  }
  if (state === "cupping") {
    return { title: "Cupping", isBrewing: false, showTemperature: true };
  }
  if (state === "ready") {
    return { title: "Ready", isBrewing: false, showTemperature: true };
  }
  return { title: "Home", isBrewing: false, showTemperature: false };
}

export function HomeScreen({
  onMenuPress,
  onScanCupPress,
  onAddAromaPress,
  isScanInProgress = false,
  scanStatusMessage = "",
  temperatureC = null,
  stateLabel = "Off",
  timeLabel = "00:00",
  elapsedSeconds = null,
  brewTimeSeconds = null,
  sampleColour = null,
  sampleNumber = null,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const homeState = resolveHomeState(stateLabel);
  const scannedElapsed = toFiniteNumber(elapsedSeconds);
  const brewTime = toFiniteNumber(brewTimeSeconds);
  const [displayElapsedState, setDisplayElapsedState] = useState({
    sourceElapsed: scannedElapsed,
    currentElapsed: scannedElapsed,
  });
  const displayElapsedSeconds =
    displayElapsedState.sourceElapsed === scannedElapsed ? displayElapsedState.currentElapsed : scannedElapsed;
  const elapsed = toFiniteNumber(displayElapsedSeconds);
  const normalizedScanStatus = String(scanStatusMessage || "").toLowerCase();
  const isNoSessionCup = normalizedScanStatus.includes("no-session");
  const isCuppingStatus = isNoSessionCup && normalizedScanStatus.includes("cupping");
  const brewingComplete =
    homeState.isBrewing && isNoSessionCup && elapsed !== null && brewTime !== null && brewTime > 0 && elapsed >= brewTime;
  const effectiveHomeState =
    brewingComplete || isCuppingStatus ? resolveHomeState("cupping") : homeState;
  const isCuppingView = effectiveHomeState.title === "Cupping";
  const displayedElapsed =
    !isCuppingView && elapsed !== null && brewTime !== null && brewTime > 0 ? Math.min(elapsed, brewTime) : elapsed;
  const effectiveStatusMessage = brewingComplete ? "No-session cup is in cupping state." : scanStatusMessage;
  const brewingProgress =
    effectiveHomeState.isBrewing && displayedElapsed !== null && brewTime !== null && brewTime > 0
      ? clamp(displayedElapsed / brewTime, 0, 1)
      : 0;
  const shouldShowCupTime = !isScanInProgress;
  const brewingTimeLabel = shouldShowCupTime && effectiveHomeState.isBrewing
    ? `${formatDurationLabel(displayedElapsed)} | ${formatDurationLabel(brewTimeSeconds)}`
    : null;
  const cuppingTimeLabel =
    shouldShowCupTime && isCuppingView && displayedElapsed !== null ? formatDurationLabel(displayedElapsed) : null;
  const ringSegments = 120;
  const activeRingSegments = Math.round(brewingProgress * ringSegments);
  const showAddAromaButton = effectiveHomeState.isBrewing && typeof onAddAromaPress === "function";
  const headerTitle =
    effectiveHomeState.isBrewing && sampleNumber !== null
      ? String(sampleNumber)
      : effectiveHomeState.title;

  useEffect(() => {
    setDisplayElapsedState({
      sourceElapsed: scannedElapsed,
      currentElapsed: scannedElapsed,
    });
  }, [scannedElapsed]);

  useEffect(() => {
    if (
      scannedElapsed === null ||
      (!homeState.isBrewing && !isCuppingView) ||
      (!isNoSessionCup && homeState.isBrewing && brewTime !== null && brewTime > 0 && elapsed !== null && elapsed >= brewTime)
    ) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setDisplayElapsedState((current) => {
        const numeric = toFiniteNumber(current.currentElapsed);
        if (numeric === null) {
          const nextScannedElapsed = scannedElapsed + 1;
          return {
            sourceElapsed: scannedElapsed,
            currentElapsed:
              !isNoSessionCup && brewTime !== null && brewTime > 0
                ? Math.min(nextScannedElapsed, brewTime)
                : nextScannedElapsed,
          };
        }
        const nextElapsed = numeric + 1;
        return {
          sourceElapsed: scannedElapsed,
          currentElapsed:
            !isNoSessionCup && brewTime !== null && brewTime > 0 ? Math.min(nextElapsed, brewTime) : nextElapsed,
        };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [homeState.isBrewing, isCuppingView, isNoSessionCup, scannedElapsed, elapsed, brewTime]);

  return (
    <View style={styles.screen}>
      <Header
        title={headerTitle}
        variant="menu"
        onMenuPress={onMenuPress}
        menuAccessibilityLabel="Open menu"
        debugTag="HomeScreen"
      />
      {effectiveStatusMessage ? (
        <Text style={styles.titleStatusText}>{effectiveStatusMessage}</Text>
      ) : null}

      <View style={[styles.content, { paddingHorizontal: 24 * scale }]}>
        <View style={[styles.heroGroup, { marginTop: -80 * scale }]} pointerEvents="none">
          {brewingTimeLabel ? (
            <View
              style={[
                styles.brewingTimerWrap,
                {
                  top: 76 * scale,
                  gap: 9 * scale,
                },
              ]}
            >
              <Text
                style={[
                  styles.brewingPercent,
                  {
                    fontSize: 38 * scale,
                    lineHeight: 44 * scale,
                  },
                ]}
              >
                {brewingTimeLabel}
              </Text>
            </View>
          ) : null}
          {cuppingTimeLabel ? (
            <Text
              style={[
                styles.brewingPercent,
                styles.timerSingleLabel,
                {
                  top: 76 * scale,
                  fontSize: 38 * scale,
                  lineHeight: 44 * scale,
                },
              ]}
            >
              {cuppingTimeLabel}
            </Text>
          ) : null}

          <View style={styles.cupImageContainer}>
            <Image
              source={require("../../../assets/images/cup_image.png")}
              style={styles.cupImage}
              resizeMode="contain"
            />
            {effectiveHomeState.isBrewing ? (
              <View pointerEvents="none" style={styles.timerRing}>
                <View style={styles.timerTrack} />
                {Array.from({ length: activeRingSegments }).map((_, index) => {
                  const angle = -90 + (index * 360) / ringSegments;
                  const radians = (angle * Math.PI) / 180;
                  const segmentWidth = 5.8;
                  const segmentHeight = 8;
                  const segmentRadius = 112;

                  return (
                    <View
                      key={`timer-segment-${index}`}
                      style={[
                        styles.timerProgressSegment,
                        {
                          left: 116 + Math.cos(radians) * segmentRadius - segmentWidth / 2,
                          top: 116 + Math.sin(radians) * segmentRadius - segmentHeight / 2,
                          width: segmentWidth,
                          height: segmentHeight,
                          transform: [{ rotate: `${angle + 90}deg` }],
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>

          {effectiveHomeState.showTemperature ? (
            <Text
              style={[
                styles.temperature,
                {
                  marginTop: -166 * scale,
                  marginBottom: 10 * scale,
                },
              ]}
              accessibilityLabel={`Temperature ${formatTemperature(temperatureC)}`}
            >
              {formatTemperature(temperatureC)}
            </Text>
          ) : null}

        </View>

      </View>

      {showAddAromaButton ? (
        <ScreenFooterDual
          primaryLabel="ADD AROMA"
          onPrimaryPress={onAddAromaPress}
          primaryDisabled={isScanInProgress}
          primaryAccessibilityLabel="Add aroma"
          primaryStyle={styles.addAromaButton}
          primaryTextStyle={styles.addAromaButtonText}
          secondaryLabel={isScanInProgress ? "Scanning" : "SCAN CUP"}
          onSecondaryPress={onScanCupPress}
          secondaryDisabled={isScanInProgress}
          secondaryLoading={isScanInProgress}
          secondaryAccessibilityLabel="Scan cup"
          secondaryStyle={styles.scanButton}
          secondaryTextStyle={styles.scanButtonText}
        />
      ) : (
        <ScreenFooter
          label={isScanInProgress ? "Scanning" : "SCAN CUP"}
          onPress={onScanCupPress}
          disabled={isScanInProgress}
          loading={isScanInProgress}
          accessibilityLabel="Scan cup"
          buttonStyle={styles.scanButton}
          instructions={
            effectiveHomeState.isBrewing ? undefined : "Press scan and hold your phone near the base of the cup."
          }
        />
      )}
    </View>
  );
}

const ink = "#414B53";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  heroGroup: {
    alignItems: "center",
  },
  brewingPercent: {
    ...typography.text_primary_metric,
    textAlign: "center",
  },
  brewingTimerWrap: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  timerSingleLabel: {
    position: "absolute",
    zIndex: 4,
  },
  cupImageContainer: {
    width: 450,
    height: 450,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cupImage: {
    width: "100%",
    height: "100%",
  },
  timerRing: {
    position: "absolute",
    width: 232,
    height: 232,
    borderRadius: 116,
    backgroundColor: "transparent",
    zIndex: 3,
  },
  timerTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 116,
    borderWidth: 8,
    borderColor: "#C5CBD0",
  },
  timerProgressSegment: {
    position: "absolute",
    borderRadius: 4,
    backgroundColor: ink,
  },
  temperature: {
    ...typography.text_primary_metric,
    textAlign: "center",
  },
  titleStatusText: {
    ...typography.text_secondary_body,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 0,
    textAlign: "center",
  },
  scanButton: {
    backgroundColor: colors.action,
  },
  scanButtonText: {
    color: colors.surface,
  },
  addAromaButton: {
    backgroundColor: colors.muted,
  },
  addAromaButtonText: {
    color: colors.ink,
  },
});
