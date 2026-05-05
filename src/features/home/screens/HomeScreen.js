import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

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
  isScanInProgress = false,
  scanStatusMessage = "",
  temperatureC = null,
  stateLabel = "Off",
  timeLabel = "00:00",
  elapsedSeconds = null,
  brewTimeSeconds = null,
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
  const scanButtonWidth = width - 52 * scale;

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
        title={effectiveHomeState.title}
        variant="menu"
        onMenuPress={onMenuPress}
        menuAccessibilityLabel="Open menu"
      />
      {effectiveStatusMessage ? (
        <Text style={styles.titleStatusText}>{effectiveStatusMessage}</Text>
      ) : null}

      <View style={[styles.content, { paddingHorizontal: 24 * scale, paddingBottom: 24 * scale }]}>
        <View style={[styles.heroGroup, { marginTop: -80 * scale }]}>
          {brewingTimeLabel ? (
            <Text
              style={[
                styles.brewingPercent,
                {
                  top: 76 * scale,
                  fontSize: 38 * scale,
                  lineHeight: 44 * scale,
                },
              ]}
            >
              {brewingTimeLabel}
            </Text>
          ) : null}
          {cuppingTimeLabel ? (
            <Text
              style={[
                styles.brewingPercent,
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
                  fontSize: 44 * scale,
                  lineHeight: 50 * scale,
                },
              ]}
              accessibilityLabel={`Temperature ${formatTemperature(temperatureC)}`}
            >
              {formatTemperature(temperatureC)}
            </Text>
          ) : null}

          <Text
            style={[
              styles.scanInstruction,
              {
                marginTop: effectiveHomeState.showTemperature ? 0 : -106 * scale,
                marginBottom: 18 * scale,
                paddingHorizontal: 18 * scale,
                fontSize: 30 * scale,
                lineHeight: 36 * scale,
              },
            ]}
          >
            Press scan and hold your phone near the base of the cup.
          </Text>
        </View>

        <View style={styles.bottomArea}>
          {shouldShowCupTime && effectiveHomeState.isBrewing ? (
            <Text style={styles.stateTime} accessibilityLabel={`${stateLabel} time ${timeLabel}`}>
              {timeLabel}
            </Text>
          ) : null}
          <Pressable
            onPress={onScanCupPress || (() => {})}
            disabled={isScanInProgress}
            accessibilityRole="button"
            accessibilityLabel="Scan cup"
            style={({ pressed }) => [
              styles.scanButton,
              { width: scanButtonWidth },
              pressed && !isScanInProgress ? styles.scanButtonPressed : null,
              isScanInProgress ? styles.scanButtonDisabled : null,
            ]}
          >
            <Text style={[styles.scanButtonText, { fontSize: 19 * scale, lineHeight: 23 * scale }]}>
              {isScanInProgress ? "Scanning" : "Scan"}
            </Text>
          </Pressable>
        </View>
      </View>
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
    position: "absolute",
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
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
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  scanInstruction: {
    maxWidth: 390,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  titleStatusText: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
  },
  bottomArea: {
    width: "100%",
    alignItems: "center",
    marginTop: 0,
    gap: spacing.sm,
  },
  stateTime: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  scanButton: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  scanButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  scanButtonDisabled: {
    backgroundColor: colors.textMuted,
    shadowOpacity: 0,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
});
