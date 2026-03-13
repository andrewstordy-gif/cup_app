import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import {
  cancel,
  readNdef,
  readWriteNdef,
  sampleNdefPayload,
  start,
} from "../../../services/nfcService";
import { logAppError } from "../../../services/errorLogger";

function JsonCard({ title, data }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{JSON.stringify(data || {}, null, 2)}</Text>
    </View>
  );
}

function buildSingleRecordPreview(records) {
  return {
    v: records?.v ?? 1,
    ctrl: toCompactRecord1(records?.text1),
    status: toCompactRecord2(records?.text2),
    settings: toCompactRecord3(records?.text3),
    app: toCompactRecord4(records?.text4),
  };
}

function toCompactRecord1(data) {
  if (!data || typeof data !== "object") return null;
  const state = data.s ?? data.state;
  return state === undefined ? {} : { s: state };
}

function toCompactRecord2(data) {
  if (!data || typeof data !== "object") return null;
  const temp = data.t ?? data.temp;
  const time = data.m ?? data.tm ?? data.time;
  const battery = data.b ?? data.battery;
  const uuid = data.u ?? data.UUID ?? data.uuid;
  return {
    ...(temp !== undefined ? { t: temp } : {}),
    ...(time !== undefined ? { m: time } : {}),
    ...(battery !== undefined ? { b: battery } : {}),
    ...(uuid !== undefined ? { u: uuid } : {}),
  };
}

function toCompactRecord3(data) {
  if (!data || typeof data !== "object") return null;
  const triggerTemp = data.r ?? data.triggerTemp;
  const maxStartTemp = data.a ?? data.maxStartTemp;
  const brewTime = data.w ?? data.brewTime;
  const maxCupTemp = data.c ?? data.maxCupTemp;
  const maxTime = data.x ?? data.maxTime;
  const ledBrightness = data.l ?? data.ledBrightness;
  return {
    ...(triggerTemp !== undefined ? { r: triggerTemp } : {}),
    ...(maxStartTemp !== undefined ? { a: maxStartTemp } : {}),
    ...(brewTime !== undefined ? { w: brewTime } : {}),
    ...(maxCupTemp !== undefined ? { c: maxCupTemp } : {}),
    ...(maxTime !== undefined ? { x: maxTime } : {}),
    ...(ledBrightness !== undefined ? { l: ledBrightness } : {}),
  };
}

function toCompactRecord4(data) {
  if (!data || typeof data !== "object") return null;
  const coffeeName = data.n ?? data.coffeeName;
  const coffeeProcess = data.p ?? data.coffeeProcess;
  const cupNumber = data.y ?? data.cupNumber;
  const sessionName = data.e ?? data.sessionName;
  const sessionType = data.t ?? data.sessionType;
  const sessionDate = data.d ?? data.sessionDate;
  const sessionUUID = data.u ?? data.sessionUUID;
  return {
    ...(coffeeName !== undefined ? { n: coffeeName } : {}),
    ...(coffeeProcess !== undefined ? { p: coffeeProcess } : {}),
    ...(cupNumber !== undefined ? { y: cupNumber } : {}),
    ...(sessionName !== undefined ? { e: sessionName } : {}),
    ...(sessionType !== undefined ? { t: sessionType } : {}),
    ...(sessionDate !== undefined ? { d: sessionDate } : {}),
    ...(sessionUUID !== undefined ? { u: sessionUUID } : {}),
  };
}

export function NfcServiceTestScreen({ onBackPress }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [records, setRecords] = useState({
    text1: null,
    text2: null,
    text3: null,
    text4: null,
  });
  const [stateValue, setStateValue] = useState(String(sampleNdefPayload.text1.state));
  const [triggerTemp, setTriggerTemp] = useState(String(sampleNdefPayload.text3.triggerTemp));
  const [maxStartTemp, setMaxStartTemp] = useState(String(sampleNdefPayload.text3.maxStartTemp));
  const [brewTime, setBrewTime] = useState(String(sampleNdefPayload.text3.brewTime));
  const [maxCupTemp, setMaxCupTemp] = useState(String(sampleNdefPayload.text3.maxCupTemp));
  const [maxTime, setMaxTime] = useState(String(sampleNdefPayload.text3.maxTime));
  const [ledBrightness, setLedBrightness] = useState(String(sampleNdefPayload.text3.ledBrightness));
  const [coffeeName, setCoffeeName] = useState(sampleNdefPayload.text4.coffeeName);
  const [coffeeProcess, setCoffeeProcess] = useState(sampleNdefPayload.text4.coffeeProcess);
  const [cupNumber, setCupNumber] = useState(String(sampleNdefPayload.text4.cupNumber ?? 3));
  const [sessionType, setSessionType] = useState(sampleNdefPayload.text4.sessionType || "Sourcing Decision");
  const [sessionName, setSessionName] = useState(sampleNdefPayload.text4.sessionName);
  const [sessionDate, setSessionDate] = useState(sampleNdefPayload.text4.sessionDate);
  const [sessionUUID, setSessionUUID] = useState(sampleNdefPayload.text4.sessionUUID);

  const withBusy = async (action) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_action",
        friendlyMessage: error?.message || "Unknown NFC error",
        error,
      });
      setStatus(error?.message || "Unknown NFC error");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    await withBusy(async () => {
      const result = await start();
      setStatus(result.alreadyStarted ? "NFC service already started" : "NFC service started");
    });
  };

  const handleRead = async () => {
    await withBusy(async () => {
      const result = await readNdef();
      const parsed = result?.parsed || {};
      setRecords(parsed);

      const text1 = parsed?.text1 || {};
      const text3 = parsed?.text3 || {};
      const text4 = parsed?.text4 || {};

      if (text1.state !== undefined) {
        setStateValue(String(text1.state));
      }

      if (text3.triggerTemp !== undefined) {
        setTriggerTemp(String(text3.triggerTemp));
      }
      if (text3.maxStartTemp !== undefined) {
        setMaxStartTemp(String(text3.maxStartTemp));
      }
      if (text3.brewTime !== undefined) {
        setBrewTime(String(text3.brewTime));
      }
      if (text3.maxCupTemp !== undefined) {
        setMaxCupTemp(String(text3.maxCupTemp));
      }
      if (text3.maxTime !== undefined) {
        setMaxTime(String(text3.maxTime));
      }
      if (text3.ledBrightness !== undefined) {
        setLedBrightness(String(text3.ledBrightness));
      }

      if (text4.coffeeName !== undefined) {
        setCoffeeName(String(text4.coffeeName));
      }
      if (text4.coffeeProcess !== undefined) {
        setCoffeeProcess(String(text4.coffeeProcess));
      }
      if (text4.cupNumber !== undefined) {
        setCupNumber(String(text4.cupNumber));
      }
      if (text4.sessionType !== undefined) {
        setSessionType(String(text4.sessionType));
      }
      if (text4.sessionName !== undefined) {
        setSessionName(String(text4.sessionName));
      }
      if (text4.sessionDate !== undefined) {
        setSessionDate(String(text4.sessionDate));
      }
      if (text4.sessionUUID !== undefined) {
        setSessionUUID(String(text4.sessionUUID));
      }

      setStatus(`Read successful (${result.recordCount} record(s))`);
    });
  };

  const handleWrite = async () => {
    await withBusy(async () => {
      const toInt = (value) => Number.parseInt(value, 10);

      const parsed = {
        state: toInt(stateValue),
        triggerTemp: toInt(triggerTemp),
        maxStartTemp: toInt(maxStartTemp),
        brewTime: toInt(brewTime),
        maxCupTemp: toInt(maxCupTemp),
        maxTime: toInt(maxTime),
        ledBrightness: toInt(ledBrightness),
      };

      if (
        Number.isNaN(parsed.state) ||
        Number.isNaN(parsed.triggerTemp) ||
        Number.isNaN(parsed.maxStartTemp) ||
        Number.isNaN(parsed.brewTime) ||
        Number.isNaN(parsed.maxCupTemp) ||
        Number.isNaN(parsed.maxTime) ||
        Number.isNaN(parsed.ledBrightness)
      ) {
        setStatus("Please enter valid numeric values for ctrl.s and settings fields.");
        return;
      }

      const parsedCupNumber = Number.parseInt(cupNumber, 10);
      if (Number.isNaN(parsedCupNumber) || parsedCupNumber < 1 || parsedCupNumber > 5) {
        setStatus("Please set app.cupNumber to a value between 1 and 5.");
        return;
      }

      if (!coffeeName.trim() || !coffeeProcess.trim() || !sessionType.trim() || !sessionName.trim() || !sessionDate.trim() || !sessionUUID.trim()) {
        setStatus("Please fill all app fields before writing.");
        return;
      }

      const result = await readWriteNdef((currentParsed) => ({
        text1: {
          state: parsed.state,
        },
        text2: currentParsed?.text2 ?? currentParsed?.raw?.text2 ?? {},
        text3: {
          triggerTemp: parsed.triggerTemp,
          maxStartTemp: parsed.maxStartTemp,
          brewTime: parsed.brewTime,
          maxCupTemp: parsed.maxCupTemp,
          maxTime: parsed.maxTime,
          ledBrightness: parsed.ledBrightness,
        },
        text4: {
          coffeeName: coffeeName.trim(),
          coffeeProcess: coffeeProcess.trim(),
          cupNumber: parsedCupNumber,
          sessionType: sessionType.trim(),
          sessionName: sessionName.trim(),
          sessionDate: sessionDate.trim(),
          sessionUUID: sessionUUID.trim(),
        },
      }));
      setRecords(result?.parsed || null);
      setStatus("Write successful (single-record payload written)");
    });
  };

  const handleReadWriteSingleTap = async () => {
    await withBusy(async () => {
      const toInt = (value) => Number.parseInt(value, 10);

      const parsedFields = {
        state: toInt(stateValue),
        triggerTemp: toInt(triggerTemp),
        maxStartTemp: toInt(maxStartTemp),
        brewTime: toInt(brewTime),
        maxCupTemp: toInt(maxCupTemp),
        maxTime: toInt(maxTime),
        ledBrightness: toInt(ledBrightness),
      };

      if (
        Number.isNaN(parsedFields.state) ||
        Number.isNaN(parsedFields.triggerTemp) ||
        Number.isNaN(parsedFields.maxStartTemp) ||
        Number.isNaN(parsedFields.brewTime) ||
        Number.isNaN(parsedFields.maxCupTemp) ||
        Number.isNaN(parsedFields.maxTime) ||
        Number.isNaN(parsedFields.ledBrightness)
      ) {
        setStatus("Please enter valid numeric values for ctrl.s and settings fields.");
        return;
      }

      if (
        Number.isNaN(Number.parseInt(cupNumber, 10)) ||
        Number.parseInt(cupNumber, 10) < 1 ||
        Number.parseInt(cupNumber, 10) > 5 ||
        !coffeeName.trim() ||
        !coffeeProcess.trim() ||
        !sessionType.trim() ||
        !sessionName.trim() ||
        !sessionDate.trim() ||
        !sessionUUID.trim()
      ) {
        setStatus("Please fill all app fields and set cupNumber (1-5) before writing.");
        return;
      }
      const parsedCupNumber = Number.parseInt(cupNumber, 10);

      const result = await readWriteNdef((parsed) => ({
        text1: {
          state: parsedFields.state,
        },
        // Keep current status/settings from the tag in this single-tap experiment.
        text2: parsed?.text2 ?? parsed?.raw?.text2 ?? {},
        text3: parsed?.text3 ?? parsed?.raw?.text3 ?? {},
        text4: {
          coffeeName: coffeeName.trim(),
          coffeeProcess: coffeeProcess.trim(),
          cupNumber: parsedCupNumber,
          sessionType: sessionType.trim(),
          sessionName: sessionName.trim(),
          sessionDate: sessionDate.trim(),
          sessionUUID: sessionUUID.trim(),
        },
      }));

      setRecords(result.parsed);
      const readCupUuid = result?.parsed?.text2?.UUID;
      setStatus(
        readCupUuid
          ? `Single-tap read+write success (cup UUID ${readCupUuid})`
          : "Single-tap read+write success"
      );
    });
  };

  const handleCancel = async () => {
    await withBusy(async () => {
      await cancel();
      setStatus("NFC request cancelled");
    });
  };

  return (
    <View style={styles.screen}>
      <Header
        title="NFC Test"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
      />

      <ScreenContainer>
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <View style={styles.actions}>
          <FullPageButton
            label="Start NFC"
            onPress={handleStart}
            loading={busy}
            disabled={busy}
            accessibilityLabel="Start NFC service"
          />
          <FullPageButton
            label="Read NDEF"
            onPress={handleRead}
            loading={busy}
            disabled={busy}
            accessibilityLabel="Read NDEF records"
          />
          <FullPageButton
            label="Write Test NDEF"
            onPress={handleWrite}
            loading={busy}
            disabled={busy}
            accessibilityLabel="Write test NDEF records"
            style={styles.secondaryButton}
          />
          <FullPageButton
            label="Read + Write (Single Tap)"
            onPress={handleReadWriteSingleTap}
            loading={busy}
            disabled={busy}
            accessibilityLabel="Read and write NDEF in one scan"
            style={styles.secondaryButtonAlt}
          />
          <FullPageButton
            label="Cancel"
            onPress={handleCancel}
            loading={busy}
            disabled={busy}
            accessibilityLabel="Cancel NFC request"
            style={styles.tertiaryButton}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Write Payload Fields</Text>
          <Text style={styles.cardCaption}>Edit field values for the single NDEF record sections.</Text>

          <View style={styles.editorBlock}>
            <Text style={styles.editorLabel}>ctrl</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>state</Text>
              <TextInput
                value={stateValue}
                onChangeText={setStateValue}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit ctrl state"
              />
            </View>
          </View>

          <View style={styles.editorBlock}>
            <Text style={styles.editorLabel}>settings</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>triggerTemp</Text>
              <TextInput
                value={triggerTemp}
                onChangeText={setTriggerTemp}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit settings triggerTemp"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>maxStartTemp</Text>
              <TextInput
                value={maxStartTemp}
                onChangeText={setMaxStartTemp}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit settings maxStartTemp"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>brewTime</Text>
              <TextInput
                value={brewTime}
                onChangeText={setBrewTime}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit settings brewTime"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>maxCupTemp</Text>
              <TextInput
                value={maxCupTemp}
                onChangeText={setMaxCupTemp}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit settings maxCupTemp"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>maxTime</Text>
              <TextInput
                value={maxTime}
                onChangeText={setMaxTime}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit settings maxTime"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>ledBrightness</Text>
              <TextInput
                value={ledBrightness}
                onChangeText={setLedBrightness}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit settings ledBrightness"
              />
            </View>
          </View>

          <View style={styles.editorBlock}>
            <Text style={styles.editorLabel}>app</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>coffeeName</Text>
              <TextInput
                value={coffeeName}
                onChangeText={setCoffeeName}
                style={styles.fieldInput}
                accessibilityLabel="Edit app coffeeName"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>coffeeProcess</Text>
              <TextInput
                value={coffeeProcess}
                onChangeText={setCoffeeProcess}
                style={styles.fieldInput}
                accessibilityLabel="Edit app coffeeProcess"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>sessionName</Text>
              <TextInput
                value={sessionName}
                onChangeText={setSessionName}
                style={styles.fieldInput}
                accessibilityLabel="Edit app sessionName"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>cupNumber</Text>
              <TextInput
                value={cupNumber}
                onChangeText={setCupNumber}
                keyboardType="number-pad"
                style={styles.fieldInput}
                accessibilityLabel="Edit app cupNumber"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>sessionType</Text>
              <TextInput
                value={sessionType}
                onChangeText={setSessionType}
                style={styles.fieldInput}
                accessibilityLabel="Edit app sessionType"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>sessionDate</Text>
              <TextInput
                value={sessionDate}
                onChangeText={setSessionDate}
                style={styles.fieldInput}
                accessibilityLabel="Edit app sessionDate"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldName}>sessionUUID</Text>
              <TextInput
                value={sessionUUID}
                onChangeText={setSessionUUID}
                style={styles.fieldInput}
                accessibilityLabel="Edit app sessionUUID"
              />
            </View>
          </View>
        </View>

        <JsonCard title="NDEF Record" data={buildSingleRecordPreview(records)} />
        <JsonCard title="ctrl" data={toCompactRecord1(records.text1)} />
        <JsonCard title="status" data={toCompactRecord2(records.text2)} />
        <JsonCard title="settings" data={toCompactRecord3(records.text3)} />
        <JsonCard title="app" data={toCompactRecord4(records.text4)} />
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
  },
  actions: {
    gap: spacing.xs,
  },
  secondaryButton: {
    backgroundColor: "#4b5563",
  },
  secondaryButtonAlt: {
    backgroundColor: "#1f2937",
  },
  tertiaryButton: {
    backgroundColor: "#6b7280",
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  cardCaption: {
    fontSize: 12,
    color: colors.textMuted,
  },
  editorBlock: {
    gap: 6,
  },
  editorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldRow: {
    gap: 4,
  },
  fieldName: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  fieldInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    paddingHorizontal: spacing.xs,
    fontSize: 14,
    color: colors.text,
  },
  cardBody: {
    fontFamily: "Courier",
    fontSize: 13,
    color: colors.textMuted,
  },
});
