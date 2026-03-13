import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { readNdef, readWriteNdef } from "../../../services/nfcService";
import { logAppError } from "../../../services/errorLogger";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

const DEFAULT_FIELDS = {
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
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.helpText}>{helpText}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        style={[styles.input, error ? styles.inputError : null]}
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
          style={[styles.timeInput, error ? styles.inputError : null]}
          accessibilityLabel="Brew Time minutes input"
          maxLength={2}
        />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput
          value={secondsValue}
          onChangeText={onChangeSeconds}
          keyboardType="number-pad"
          style={[styles.timeInput, error ? styles.inputError : null]}
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
  const [statusMessage, setStatusMessage] = useState("Scan a cup to read and sync settings.");
  const [isSyncing, setIsSyncing] = useState(false);
  const [warning, setWarning] = useState({ visible: false, title: "", message: "" });

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

  const handleReadWriteSettings = async () => {
    const errors = validateFields(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatusMessage("Please fix validation errors before scanning.");
      return;
    }

    setIsSyncing(true);
    setStatusMessage("Hold your phone near the cup to read and sync settings.");

    try {
      await readWriteNdef((parsed) => {
        const state = parsed?.text1?.s ?? parsed?.text1?.state;
        if (![0, 1, 4].includes(Number(state))) {
          throw new Error("STATE_BLOCKED");
        }

        return {
          text1: parsed?.text1 || {},
          text2: parsed?.text2 ?? parsed?.raw?.text2 ?? {},
          text3: {
            ...(parsed?.text3 || {}),
            ...settingsPayload,
          },
          text4: parsed?.text4 ?? parsed?.raw?.text4 ?? {},
        };
      });

      setStatusMessage("Settings synced successfully.");
    } catch (error) {
      void logAppError({
        screen: "CupSettings",
        route: "Cup Settings",
        flow: "read_write_settings",
        friendlyMessage: error?.message || "Could not read/write settings.",
        error,
        context: {
          fields,
          settingsPayload,
        },
      });
      if (error?.message === "STATE_BLOCKED") {
        setStatusMessage("Settings update blocked by cup state.");
        openWarning(
          "Update Blocked",
          "Settings can only be changed when cup is OFF, READY, or LOW_BATTERY.",
        );
      } else {
        try {
          const verification = await readNdef({
            maxAttempts: 2,
            retryDelayMs: 180,
          });
          const parsedText3 = verification?.parsed?.text3 || {};
          const verifiedTriggerTemp = Number(parsedText3.r ?? parsedText3.triggerTemp);
          const verifiedMaxWaterTemp = Number(parsedText3.a ?? parsedText3.maxStartTemp);
          const verifiedBrewTime = Number(parsedText3.w ?? parsedText3.brewTime);
          const verifiedMaxCupTemp = Number(parsedText3.c ?? parsedText3.maxCupTemp);
          const verifiedLedBrightness = Number(parsedText3.l ?? parsedText3.ledBrightness);

          const settingsVerified =
            verifiedTriggerTemp === Number(settingsPayload.r) &&
            verifiedMaxWaterTemp === Number(settingsPayload.a) &&
            verifiedBrewTime === Number(settingsPayload.w) &&
            verifiedMaxCupTemp === Number(settingsPayload.c) &&
            verifiedLedBrightness === Number(settingsPayload.l);

          if (settingsVerified) {
            setStatusMessage("Settings sync confirmed.");
            return;
          }
        } catch {
          // Ignore verification read errors and show original sync failure below.
        }

        setStatusMessage("Could not read/write settings.");
        openWarning("Sync Failed", error?.message || "Could not read/write settings.");
      }
    } finally {
      setIsSyncing(false);
    }
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
        />
        <SettingsField
          label="Max Water Temp"
          helpText="The max water temp at the start of brewing (SCA specifies 96°C)"
          value={fields.maxWaterTemp}
          onChangeText={(value) => handleFieldChange("maxWaterTemp", value)}
          accessibilityLabel="Max Water Temp input"
          error={fieldErrors.maxWaterTemp}
        />
        <BrewTimeField
          minutesValue={fields.brewMinutes}
          secondsValue={fields.brewSeconds}
          onChangeMinutes={(value) => handleFieldChange("brewMinutes", value)}
          onChangeSeconds={(value) => handleFieldChange("brewSeconds", value)}
          error={fieldErrors.brewTime}
        />
        <SettingsField
          label="Max Cup Temp"
          helpText="The temp the coffee must cool to before liquoring begins (SCA specifies 70°C)"
          value={fields.maxCupTemp}
          onChangeText={(value) => handleFieldChange("maxCupTemp", value)}
          accessibilityLabel="Max Cup Temp input"
          error={fieldErrors.maxCupTemp}
        />
        <SettingsField
          label="LED Brightness"
          helpText="Brighter LEDs will run the battery down, recommend 50%"
          value={fields.ledBrightnessPercent}
          onChangeText={(value) => handleFieldChange("ledBrightnessPercent", value)}
          accessibilityLabel="LED Brightness percent input"
          error={fieldErrors.ledBrightnessPercent}
        />

        <FullPageButton
          label="Read / Write Settings"
          onPress={handleReadWriteSettings}
          loading={isSyncing}
          accessibilityLabel="Read and write cup settings"
          style={styles.syncButton}
        />
        <Text style={styles.statusText} accessibilityLabel={`Cup settings status: ${statusMessage}`}>
          {statusMessage}
        </Text>
      </ScreenContainer>

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
    marginTop: spacing.sm,
  },
  statusText: {
    textAlign: "center",
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
});
