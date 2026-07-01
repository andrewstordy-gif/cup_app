import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { readNdefMinimal, readAndWriteNdefMinimal } from "../../../services/nfcServiceMinimal";
import { playNfcFailureFeedback } from "../../../services/nfcFailureFeedback";
import { logAppError } from "../../../services/errorLogger";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

const DEFAULT_FIELDS = {
  triggerTemp: "-",
  maxWaterTemp: "-",
  brewMinutes: "-",
  brewSeconds: "-",
  maxCupTemp: "-",
  ledBrightnessPercent: "-",
};

const DEFAULT_BATTERY_LEVEL = "-";
const DEFAULT_FIRMWARE_VERSION = "-";
const DEFAULT_CUP_STATUS = "-";

// Mirrors AppNavigator's getStateLabel mapping (text1.s/state) — state 4 is
// a real firmware-reported value, not a battery-percentage threshold.
function buildCupStatusFromParsed(parsed) {
  const rawState = parsed?.text1?.s ?? parsed?.text1?.state;
  const state = Number(rawState);
  if (!Number.isFinite(state)) {
    return DEFAULT_CUP_STATUS;
  }
  if (state === 0) return "OFF";
  if (state === 1) return "READY";
  if (state === 2) return "BREWING";
  if (state === 3) return "CUPPING";
  if (state === 4) return "LOW BATTERY";
  return "UNKNOWN";
}

function buildBatteryLevelFromParsed(parsed) {
  const text2 = parsed?.text2 || {};
  const battery = Number(text2.battery ?? text2.b);
  return Number.isFinite(battery) ? `${battery}%` : DEFAULT_BATTERY_LEVEL;
}

function buildFirmwareVersionFromParsed(parsed) {
  const text2 = parsed?.text2 || {};
  // Optional/nullable on the cup side — omitted entirely by firmware <0.3.0.
  const firmwareVersion = text2.firmwareVersion ?? text2.v;
  return typeof firmwareVersion === "string" && firmwareVersion.trim()
    ? firmwareVersion.trim()
    : DEFAULT_FIRMWARE_VERSION;
}

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
  maxCupTemp: { min: 0, max: 100, label: "Max Cupping Temp" },
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
  scale,
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.helpText, { marginTop: 2 * scale }]}>{helpText}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        editable={!disabled}
        style={[
          styles.input,
          { borderRadius: 10 * scale, marginTop: spacing.sm },
          disabled && styles.inputDisabled,
          error && styles.inputError,
        ]}
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
  scale,
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>Brew Time</Text>
      <Text style={[styles.helpText, { marginTop: 2 * scale }]}>
        The brewing time before the crust is broken (SCA specifies 3-5 min)
      </Text>
      <View style={[styles.timeRow, { marginTop: spacing.sm, gap: spacing.xs }]}>
        <TextInput
          value={minutesValue}
          onChangeText={onChangeMinutes}
          keyboardType="number-pad"
          editable={!disabled}
          style={[
            styles.input,
            styles.timeInput,
            { borderRadius: 10 * scale },
            disabled && styles.inputDisabled,
            error && styles.inputError,
          ]}
          accessibilityLabel="Brew Time minutes input"
          maxLength={2}
        />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput
          value={secondsValue}
          onChangeText={onChangeSeconds}
          keyboardType="number-pad"
          editable={!disabled}
          style={[
            styles.input,
            styles.timeInput,
            { borderRadius: 10 * scale },
            disabled && styles.inputDisabled,
            error && styles.inputError,
          ]}
          accessibilityLabel="Brew Time seconds input"
          maxLength={2}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function CupSettingsScreen({ onBackPress, onResetCupToOff, onSwitchCupToBrewing }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [fieldErrors, setFieldErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState("Scan a cup to read settings.");
  const [isSyncing, setIsSyncing] = useState(false);
  const [warning, setWarning] = useState({ visible: false, title: "", message: "" });
  const [canEdit, setCanEdit] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastReadCupState, setLastReadCupState] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(DEFAULT_BATTERY_LEVEL);
  const [firmwareVersion, setFirmwareVersion] = useState(DEFAULT_FIRMWARE_VERSION);
  const [cupStatus, setCupStatus] = useState(DEFAULT_CUP_STATUS);

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
    if (canEdit) {
      setIsDirty(true);
    }
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
      setBatteryLevel(buildBatteryLevelFromParsed(parsed));
      setFirmwareVersion(buildFirmwareVersionFromParsed(parsed));
      setCupStatus(buildCupStatusFromParsed(parsed));
      setLastReadCupState(Number.isFinite(state) ? state : null);
      setCanEdit(true);
      setIsDirty(false);
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
      await readAndWriteNdefMinimal(async (result) => ({
        records: {
          text1: {},
          text2: {},
          text3: settingsPayload,
          text4: result?.parsed?.text4 || {},
        },
      }));

      setCanEdit(false);
      setIsDirty(false);
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
    if (!isDirty) {
      await handleReadSettings();
      return;
    }

    await handleWriteSettings();
  };

  return (
    <View style={styles.screen}>
      <Header title="Cup Settings" variant="back" onBackPress={onBackPress} backAccessibilityLabel="Back" debugTag="CupSettingsScreen" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: 26 * scale, paddingTop: 24 * scale, paddingBottom: 48 * scale, gap: spacing.lg },
        ]}
      >
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Cup Status</Text>
          <Text style={[styles.helpText, { marginTop: 2 * scale }]}>
            The cup's last reported status
          </Text>
          <Text
            style={[styles.readOnlyValue, { marginTop: spacing.sm }]}
            accessibilityLabel={`Cup status: ${cupStatus}`}
          >
            {cupStatus}
          </Text>
        </View>
        <SettingsField
          label="Trigger Temp"
          helpText="The temp the sensor must read to start the brewing stage"
          value={fields.triggerTemp}
          onChangeText={(value) => handleFieldChange("triggerTemp", value)}
          accessibilityLabel="Trigger Temp input"
          error={fieldErrors.triggerTemp}
          disabled={!canEdit}
          scale={scale}
        />
        <SettingsField
          label="Max Water Temp"
          helpText="The max water temp at the start of brewing (SCA specifies 96°C)"
          value={fields.maxWaterTemp}
          onChangeText={(value) => handleFieldChange("maxWaterTemp", value)}
          accessibilityLabel="Max Water Temp input"
          error={fieldErrors.maxWaterTemp}
          disabled={!canEdit}
          scale={scale}
        />
        <BrewTimeField
          minutesValue={fields.brewMinutes}
          secondsValue={fields.brewSeconds}
          onChangeMinutes={(value) => handleFieldChange("brewMinutes", value)}
          onChangeSeconds={(value) => handleFieldChange("brewSeconds", value)}
          error={fieldErrors.brewTime}
          disabled={!canEdit}
          scale={scale}
        />
        <SettingsField
          label="Max Cupping Temp"
          helpText="The temp the coffee must cool to before liquoring begins (SCA specifies 70°C)"
          value={fields.maxCupTemp}
          onChangeText={(value) => handleFieldChange("maxCupTemp", value)}
          accessibilityLabel="Max Cupping Temp input"
          error={fieldErrors.maxCupTemp}
          disabled={!canEdit}
          scale={scale}
        />
        <SettingsField
          label="LED Brightness"
          helpText="Brighter LEDs will run the battery down, recommend 50%"
          value={fields.ledBrightnessPercent}
          onChangeText={(value) => handleFieldChange("ledBrightnessPercent", value)}
          accessibilityLabel="LED Brightness percent input"
          error={fieldErrors.ledBrightnessPercent}
          disabled={!canEdit}
          scale={scale}
        />
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Battery Level</Text>
          <Text style={[styles.helpText, { marginTop: 2 * scale }]}>
            The cup's last reported battery level
          </Text>
          <Text
            style={[styles.readOnlyValue, { marginTop: spacing.sm }]}
            accessibilityLabel={`Battery level: ${batteryLevel}`}
          >
            {batteryLevel}
          </Text>
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Firmware Version</Text>
          <Text style={[styles.helpText, { marginTop: 2 * scale }]}>
            The cup's reported firmware version
          </Text>
          <Text
            style={[styles.readOnlyValue, { marginTop: spacing.sm }]}
            accessibilityLabel={`Firmware version: ${firmwareVersion}`}
          >
            {firmwareVersion}
          </Text>
        </View>
        {typeof onResetCupToOff === "function" || typeof onSwitchCupToBrewing === "function" ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Cup Actions</Text>
            <Text style={[styles.helpText, { marginTop: 2 * scale }]}>
              Scan a cup to change its state directly
            </Text>
            {typeof onResetCupToOff === "function" ? (
              <FullPageButton
                label="Reset Cup to OFF"
                onPress={onResetCupToOff}
                accessibilityLabel="Reset cup to off"
                style={[styles.actionButton, { marginTop: spacing.sm }]}
                textStyle={styles.actionButtonText}
              />
            ) : null}
            {typeof onSwitchCupToBrewing === "function" ? (
              <FullPageButton
                label="Switch Cup to BREWING"
                onPress={onSwitchCupToBrewing}
                accessibilityLabel="Switch cup to brewing"
                style={[styles.actionButton, { marginTop: spacing.sm }]}
                textStyle={styles.actionButtonText}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingHorizontal: 26 * scale }]}>
        <Text style={styles.statusText} accessibilityLabel={`Cup settings status: ${statusMessage}`}>
          {statusMessage}
        </Text>
        <FullPageButton
          label={isDirty ? "Write Settings" : "Read Settings"}
          onPress={handlePrimaryAction}
          loading={isSyncing}
          accessibilityLabel={isDirty ? "Write cup settings" : "Read cup settings"}
          style={styles.scanButton}
        />
      </View>

      <WarningDialog
        visible={warning.visible}
        title={warning.title}
        message={warning.message}
        onDismiss={closeWarning}
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
  body: {
    flexGrow: 1,
  },
  fieldBlock: {
    gap: 0,
  },
  fieldLabel: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  helpText: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
  },
  readOnlyValue: {
    ...typography.text_body,
    color: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.quietBorder,
    backgroundColor: colors.input,
    color: colors.ink,
    ...typography.text_body,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  inputDisabled: {
    backgroundColor: colors.panel,
    color: colors.muted,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeInput: {
    width: 72,
    textAlign: "center",
  },
  timeSeparator: {
    ...typography.text_section_title,
    letterSpacing: 0,
    marginHorizontal: 2,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.text_secondary_body,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  statusText: {
    ...typography.text_secondary_body,
    textAlign: "center",
    color: colors.inkSoft,
  },
  scanButton: {
    backgroundColor: colors.action,
  },
  actionButton: {
    backgroundColor: colors.muted,
  },
  actionButtonText: {
    color: colors.ink,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.quietBorder,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
});
