import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { HomeStatusElement } from "../../../components/ui/HomeStatusElement";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

export function HomeScreen({
  onMenuPress,
  onScanCupPress,
  isScanInProgress = false,
  scanStatusMessage = "",
  temperatureC = null,
  stateLabel = "Off",
  timeLabel = "00:00",
}) {
  return (
    <View style={styles.screen}>
      <Header
        title="Home"
        variant="menu"
        onMenuPress={onMenuPress}
        menuAccessibilityLabel="Open menu"
      />

      {scanStatusMessage ? (
        <View style={styles.topStatusWrap}>
          <Text style={styles.topStatusText}>{scanStatusMessage}</Text>
        </View>
      ) : null}

      <View style={styles.content}>
        <View style={styles.heroGroup}>
          <View style={styles.cupImageContainer}>
            <Image
              source={require("../../../assets/images/cup_image.png")}
              style={styles.cupImage}
              resizeMode="contain"
            />
            <Pressable
              onPress={onScanCupPress || (() => {})}
              disabled={isScanInProgress}
              accessibilityRole="button"
              accessibilityLabel="Scan cup"
              style={({ pressed }) => [
                styles.scanOverlayButton,
                pressed && !isScanInProgress ? styles.scanOverlayButtonPressed : null,
              ]}
            />
          </View>

          <View style={styles.instructionsGroup}>
            <HomeStatusElement
              temperatureC={temperatureC}
              stateLabel={stateLabel}
              timeLabel={timeLabel}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  topStatusWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  topStatusText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  heroGroup: {
    alignItems: "center",
    marginTop: -80,
  },
  instructionsGroup: {
    marginTop: -120,
    alignItems: "center",
    width: "100%",
  },
  cupImageContainer: {
    width: 450,
    height: 450,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  cupImage: {
    width: "100%",
    height: "100%",
  },
  scanOverlayButton: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "transparent",
    top: 180,
    left: 181,
    borderWidth: 0,
    borderColor: "transparent",
    opacity: 1,
  },
  scanOverlayButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
});
