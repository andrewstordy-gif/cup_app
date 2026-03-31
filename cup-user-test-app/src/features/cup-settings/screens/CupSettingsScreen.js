import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { readNdefMinimal, writeNdefMinimal } from "../../../services/nfcServiceMinimal";
import { playNfcFailureFeedback } from "../../../services/nfcFailureFeedback";
import { logAppError } from "../../../services/errorLogger";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

const DEFAULT_FIELDS = {
  triggerTemp: "-",
  maxWaterTemp: "-",
  brewMinutes: "-",
  brewSeconds: "-",
  maxCupTemp: "-",
  ledBrightnessPercent: "-",
};

const FALLBACK_SETTINGS_FIELDS = {
  triggerTemp: "40",
  maxWaterTemp: "96",
  brewMinutes: "4",
  brewSeconds: "00",
  maxCupTemp: "70",
  ledBrightnessPercent: "50",
};

const VALIDATION_RULES = {
  triggerTemp: { min: 0, max: 100, label: "Trigger Temp" },
  maxWaterTemp: { min: 0, max: 100, label: "Max Water Temp" },
  maxCupTemp: { min: 0, max: 100, label: "Max Cup Temp" },
  ledBrightnessPercent: { min: 0, max: 100, label: "LED Brightness" },
};

function toNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildFieldsFromParsed(parsed) {
  const text3 = parsed?.text3 || {};
  const brewSecondsTotal = Number(text3.brewTime ?? text3.w ?? Number(FALLBACK_SETTINGS_FIELDS.brewMinutes) * 60);
  const brewMinutes = Number.isFinite(brewSecondsTotal) ? Math.floor(brewSecondsTotal / 60) : 4;
  const brewSeconds = Number.isFinite(brewSecondsTotal) ? brewSecondsTotal % 60 : 0;
  const ledRaw = Number(text3.ledBrightness ?? text3.l ?? 100);
  const ledPercent = Number.isFinite(ledRaw) ? Math.round(ledRaw / 2) : 50;

  return {
    triggerTemp: String(text3.triggerTemp ?? text3.r ?? FALLBACK_SETTINGS_FIELDS.triggerTemp),
    maxWaterTemp: String(text3.maxStartTemp ?? text3.a ?? FALLBACK_SETTINGS_FIELDS.maxWaterTemp),
    brewMinutes: String(brewMinutes),
    brewSeconds: pad2(brewSeconds),
    maxCupTemp: String(text3.maxCupTemp ?? text3.c ?? FALLBACK_SETTINGS_FIELDS.maxCupTemp),
    ledBrightnessPercent: String(ledPercent),
  };
}

function validateFields(fields) {
  const errors = {};

  Object.keys(VALIDATION_RULES).forEach((key) => {
    const rule = VALIDATION_RULES[key];
    const parsed = toNumber(fields[key]);

    if (parsed === null) {
      errors[key] = `${rule.label} must be a whole number.`;
      return;
    }
    if (parsed < rule.min || parsed > rule.max) {
      errors[key] = `${rule.label} must be between ${rule.min} and ${rule.max}.`;
    }
  });

  const brewMinutes = toNumber(fields.brewMinutes);
  const brewSeconds = toNumber(fields.brewSeconds);

  if (brewMinutes === null || brewSeconds === null) {
    errors.brewTime = "Brew Time must use whole numbers for minutes and seconds.";
    return errors;
  }

  if (brewSeconds < 0 || brewSeconds > 59) {
    errors.brewTime = "Brew Time seconds must be between 0 and 59.";
    return errors;
  }

  const totalSeconds = brewMinutes * 60 + brewSeconds;
  if (totalSeconds < 0 || totalSeconds > 1200) {
    errors.brewTime = "Brew Time must be between 0 and 1200 seconds (20:00).";
  }

  return errors;
}

function toBrewSeconds(fields) {
  const brewMinutes = toNumber(fields.brewMinutes);
  const brewSeconds = toNumber(fields.brewSeconds);
  if (brewMinutes === null || brewSeconds === null) {
    return null;
  }
  return brewMinutes * 60 + brewSeconds;
}

function toLedBrightnessScaled(percentText) {
  const percent = toNumber(percentText);
  if (percent === null) {
    return null;
  }
  return percent * 2;
}

function SettingsField({
  label,
  helpText,
  value,
  onChangeText,
  accessibilityLabel,
  error,
  disabled = false,
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.helpText}>{helpText}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        editable={!disabled}
        style={[styles.input, disabled ? styles.inputDisabled : null, error ? styles.inputError : null]}
        accessibilityLabel={accessibilityLabel}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function BrewTimeField({
  minutesValue,
  secondsValue,
  onChangeMinutes,
  onChangeSeconds,
  error,
  disabled = false,
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>Brew Time</Text>
      <Text style={styles.helpText}>
        The brewing time before the crust is broken (SCA specifies 3-5 min)
      </Text>
      <View style={styles.timeRow}>
        <TextInput
          value={minutesValue}
          onChangeText={onChangeMinutes}
          keyboardType="number-pad"
          editable={!disabled}
          style={[styles.timeInput, disabled ? styles.inputDisabled : null, error ? styles.inputError : null]}
          accessibilityLabel="Brew Time minutes input"
          maxLength={2}
        />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput
          value={secondsValue}
          onChangeText={onChangeSeconds}
          keyboardType="number-pad"
          editable={!disabled}
          style={[styles.timeInput, disabled ? styles.inputDisabled : null, error ? styles.inputError : null]}
          accessibilityLabel="Brew Time seconds input"
          maxLength={2}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function CupSettingsScreen({ onBackPress }) {
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [fieldErrors, setFieldErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState("Scan a cup to read settings.");
  const [isSyncing, setIsSyncing] = useState(false);
  const [warning, setWarning] = useState({ visible: false, title: "", message: "" });
  const [mode, setMode] = useState("read");
  const [lastReadCupState, setLastReadCupState] = useState(null);

  const settingsPayload = useMemo(
    () => ({
      r: toNumber(fields.triggerTemp),
      a: toNumber(fields.maxWaterTemp),
      w: toBrewSeconds(fields),
      c: toNumber(fields.maxCupTemp),
      l: toLedBrightnessScaled(fields.ledBrightnessPercent),
    }),
    [fields],
  );

  const handleFieldChange = (key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    if ((key === "brewMinutes" || key === "brewSeconds") && fieldErrors.brewTime) {
      setFieldErrors((prev) => ({ ...prev, brewTime: undefined }));
    }
  };

  const openWarning = (title, message) => {
    setWarning({ visible: true, title, message });
  };

  const closeWarning = () => {
    setWarning((prev) => ({ ...prev, visible: false }));
  };

  const handleReadSettings = async () => {
    setIsSyncing(true);
    setStatusMessage("Hold your phone near the cup to read settings.");

    try {
      const result = await readNdefMinimal();
      const parsed = result?.parsed || {};
      const state = Number(parsed?.text1?.s ?? parsed?.text1?.state);

      setFields(buildFieldsFromParsed(parsed));
      setFieldErrors({});
      setLastReadCupState(Number.isFinite(state) ? state : null);
      setMode("write");
      setStatusMessage("Settings loaded. You can now edit and write them back.");
    } catch (error) {
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "CupSettings",
        route: "Cup Settings",
        flow: "read_settings",
        friendlyMessage: error?.message || "Could not read settings.",
        error,
      });
      setStatusMessage("Could not read settings.");
      openWarning("Read Failed", error?.message || "Could not read settings.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleWriteSettings = async () => {
    const errors = validateFields(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatusMessage("Please fix validation errors before writing.");
      return;
    }

    if (![0, 1].includes(Number(lastReadCupState))) {
      setStatusMessage("Settings update blocked by cup state.");
      openWarning(
        "Update Blocked",
        "Settings can only be changed when the last-read cup state is OFF or READY.",
      );
      return;
    }

    setIsSyncing(true);
    setStatusMessage("Hold your phone near the cup to write settings.");

    try {
      await writeNdefMinimal({
        text1: {},
        text2: {},
        text3: settingsPayload,
        text4: {},
      });

      setMode("read");
      setLastReadCupState(null);
      setStatusMessage("Settings written. Scan another cup to read settings.");
    } catch (error) {
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "CupSettings",
        route: "Cup Settings",
        flow: "write_settings",
        friendlyMessage: error?.message || "Could not write settings.",
        error,
        context: {
          fields,
          settingsPayload,
          lastReadCupState,
        },
      });
      setStatusMessage("Could not write settings.");
      openWarning("Sync Failed", error?.message || "Could not write settings.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (mode === "read") {
      await handleReadSettings();
      return;
    }

    await handleWriteSettings();
  };

  return (
    <View style={styles.screen}>
      <Header title="Cup Settings" variant="back" onBackPress={onBackPress} backAccessibilityLabel="Back" />
      <ScreenContainer>
        <SettingsField
          label="Trigger Temp"
          helpText="The temp the sensor must read to start the brewing stage"
          value={fields.triggerTemp}
          onChangeText={(value) => handleFieldChange("triggerTemp", value)}
          accessibilityLabel="Trigger Temp input"
          error={fieldErrors.triggerTemp}
          disabled={mode !== "write"}
        />
        <SettingsField
          label="Max Water Temp"
          helpText="The max water temp at the start of brewing (SCA specifies 96°C)"
          value={fields.maxWaterTemp}
          onChangeText={(value) => handleFieldChange("maxWaterTemp", value)}
          accessibilityLabel="Max Water Temp input"
          error={fieldErrors.maxWaterTemp}
          disabled={mode !== "write"}
        />
        <BrewTimeField
          minutesValue={fields.brewMinutes}
          secondsValue={fields.brewSeconds}
          onChangeMinutes={(value) => handleFieldChange("brewMinutes", value)}
          onChangeSeconds={(value) => handleFieldChange("brewSeconds", value)}
          error={fieldErrors.brewTime}
          disabled={mode !== "write"}
        />
        <SettingsField
          label="Max Cup Temp"
          helpText="The temp the coffee must cool to before liquoring begins (SCA specifies 70°C)"
          value={fields.maxCupTemp}
          onChangeText={(value) => handleFieldChange("maxCupTemp", value)}
          accessibilityLabel="Max Cup Temp input"
          error={fieldErrors.maxCupTemp}
          disabled={mode !== "write"}
        />
        <SettingsField
          label="LED Brightness"
          helpText="Brighter LEDs will run the battery down, recommend 50%"
          value={fields.ledBrightnessPercent}
          onChangeText={(value) => handleFieldChange("ledBrightnessPercent", value)}
          accessibilityLabel="LED Brightness percent input"
          error={fieldErrors.ledBrightnessPercent}
          disabled={mode !== "write"}
        />
        <View style={styles.scrollSpacer} />
      </ScreenContainer>

      <View style={styles.bottomActionArea}>
        <Text style={styles.statusText} accessibilityLabel={`Cup settings status: ${statusMessage}`}>
          {statusMessage}
        </Text>
        <FullPageButton
          label={mode === "write" ? "Write Settings" : "Read Settings"}
          onPress={handlePrimaryAction}
          loading={isSyncing}
          accessibilityLabel={mode === "write" ? "Write cup settings" : "Read cup settings"}
          style={styles.syncButton}
        />
      </View>

      <WarningDialog
        visible={warning.visible}
        title={warning.title}
        message={warning.message}
        onOk={closeWarning}
        okLabel="OK"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fieldBlock: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  helpText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  inputDisabled: {
    backgroundColor: colors.background,
    color: colors.textMuted,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  timeInput: {
    width: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    textAlign: "center",
  },
  timeSeparator: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginHorizontal: 2,
  },
  inputError: {
    borderColor: "#b91c1c",
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
  },
  syncButton: {
    marginTop: spacing.xs,
  },
  statusText: {
    textAlign: "center",
    fontSize: 14,
    color: colors.textMuted,
  },
  bottomActionArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  scrollSpacer: {
    height: spacing.xl,
  },
});
