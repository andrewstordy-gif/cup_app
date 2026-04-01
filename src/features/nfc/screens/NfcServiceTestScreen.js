import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import {
  readNdefMinimal,
  writeSingleRecordMetadataDiagnosticMinimal,
  writeNdefMinimal,
} from "../../../services/nfcServiceMinimal";
import { playNfcFailureFeedback } from "../../../services/nfcFailureFeedback";
import { logAppError } from "../../../services/errorLogger";

const FAILURE_LOCKOUT_MS = 2000;
const SAMPLE_NDEF_PAYLOAD = {
  text1: {
    state: 1,
  },
  text3: {
    triggerTemp: 40,
    maxStartTemp: 93,
    brewTime: 240,
    maxCupTemp: 70,
    maxTime: 1200,
    ledBrightness: 128,
  },
  text4: {
    coffeeName: "AAAAAAA",
    coffeeProcess: "Washed",
    cupNumber: 3,
    sessionType: "Sourcing Decision",
    sessionName: "Test 2",
    sessionDate: "31 Mar 2026",
    sessionUUID: "19d442587b8f66b5ce2f2b298",
  },
};

function JsonCard({ title, data }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{JSON.stringify(data, null, 2)}</Text>
    </View>
  );
}

function toCupText1(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const state = payload.s ?? payload.state;
  return state === undefined ? {} : { s: state };
}

function toCupText2(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  return {
    ...(payload.t ?? payload.temp) !== undefined ? { t: payload.t ?? payload.temp } : {},
    ...(payload.m ?? payload.time ?? payload.tm) !== undefined ? { m: payload.m ?? payload.time ?? payload.tm } : {},
    ...(payload.b ?? payload.battery) !== undefined ? { b: payload.b ?? payload.battery } : {},
    ...(payload.u ?? payload.UUID ?? payload.uuid) !== undefined ? { u: payload.u ?? payload.UUID ?? payload.uuid } : {},
  };
}

function toCupText3(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  return {
    ...(payload.r ?? payload.triggerTemp) !== undefined ? { r: payload.r ?? payload.triggerTemp } : {},
    ...(payload.a ?? payload.maxStartTemp) !== undefined ? { a: payload.a ?? payload.maxStartTemp } : {},
    ...(payload.w ?? payload.brewTime) !== undefined ? { w: payload.w ?? payload.brewTime } : {},
    ...(payload.c ?? payload.maxCupTemp) !== undefined ? { c: payload.c ?? payload.maxCupTemp } : {},
    ...(payload.x ?? payload.maxTime) !== undefined ? { x: payload.x ?? payload.maxTime } : {},
    ...(payload.l ?? payload.ledBrightness) !== undefined ? { l: payload.l ?? payload.ledBrightness } : {},
  };
}

function toCupText4(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  return {
    ...(payload.n ?? payload.coffeeName) !== undefined ? { n: payload.n ?? payload.coffeeName } : {},
    ...(payload.p ?? payload.coffeeProcess) !== undefined ? { p: payload.p ?? payload.coffeeProcess } : {},
    ...(payload.y ?? payload.cupNumber) !== undefined ? { y: payload.y ?? payload.cupNumber } : {},
    ...(payload.e ?? payload.sessionName) !== undefined ? { e: payload.e ?? payload.sessionName } : {},
    ...(payload.t ?? payload.sessionType) !== undefined ? { t: payload.t ?? payload.sessionType } : {},
    ...(payload.d ?? payload.sessionDate) !== undefined ? { d: payload.d ?? payload.sessionDate } : {},
    ...(payload.u ?? payload.sessionUUID) !== undefined ? { u: payload.u ?? payload.sessionUUID } : {},
  };
}

function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.formGroup}>{children}</View>
    </View>
  );
}

function FieldRow({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  multiline = false,
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
      />
    </View>
  );
}

function createInitialDraft() {
  return {
    text1: {
      state: String(SAMPLE_NDEF_PAYLOAD.text1?.state ?? ""),
    },
    text3: {
      triggerTemp: String(SAMPLE_NDEF_PAYLOAD.text3?.triggerTemp ?? ""),
      maxStartTemp: String(SAMPLE_NDEF_PAYLOAD.text3?.maxStartTemp ?? ""),
      brewTime: String(SAMPLE_NDEF_PAYLOAD.text3?.brewTime ?? ""),
      maxCupTemp: String(SAMPLE_NDEF_PAYLOAD.text3?.maxCupTemp ?? ""),
      maxTime: String(SAMPLE_NDEF_PAYLOAD.text3?.maxTime ?? ""),
      ledBrightness: String(SAMPLE_NDEF_PAYLOAD.text3?.ledBrightness ?? ""),
    },
    text4: {
      coffeeName: String(SAMPLE_NDEF_PAYLOAD.text4?.coffeeName ?? ""),
      coffeeProcess: String(SAMPLE_NDEF_PAYLOAD.text4?.coffeeProcess ?? ""),
      cupNumber: String(SAMPLE_NDEF_PAYLOAD.text4?.cupNumber ?? ""),
      sessionName: String(SAMPLE_NDEF_PAYLOAD.text4?.sessionName ?? ""),
      sessionType: String(SAMPLE_NDEF_PAYLOAD.text4?.sessionType ?? ""),
      sessionDate: String(SAMPLE_NDEF_PAYLOAD.text4?.sessionDate ?? ""),
      sessionUUID: String(SAMPLE_NDEF_PAYLOAD.text4?.sessionUUID ?? ""),
    },
  };
}

function toFieldString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function buildDraftFromParsed(parsed) {
  return {
    text1: {
      state: toFieldString(parsed?.text1?.state ?? parsed?.text1?.s),
    },
    text3: {
      triggerTemp: toFieldString(parsed?.text3?.triggerTemp ?? parsed?.text3?.r),
      maxStartTemp: toFieldString(parsed?.text3?.maxStartTemp ?? parsed?.text3?.a),
      brewTime: toFieldString(parsed?.text3?.brewTime ?? parsed?.text3?.w),
      maxCupTemp: toFieldString(parsed?.text3?.maxCupTemp ?? parsed?.text3?.c),
      maxTime: toFieldString(parsed?.text3?.maxTime ?? parsed?.text3?.x),
      ledBrightness: toFieldString(parsed?.text3?.ledBrightness ?? parsed?.text3?.l),
    },
    text4: {
      coffeeName: toFieldString(parsed?.text4?.coffeeName ?? parsed?.text4?.n),
      coffeeProcess: toFieldString(parsed?.text4?.coffeeProcess ?? parsed?.text4?.p),
      cupNumber: toFieldString(parsed?.text4?.cupNumber ?? parsed?.text4?.y),
      sessionName: toFieldString(parsed?.text4?.sessionName ?? parsed?.text4?.e),
      sessionType: toFieldString(parsed?.text4?.sessionType ?? parsed?.text4?.t),
      sessionDate: toFieldString(parsed?.text4?.sessionDate ?? parsed?.text4?.d),
      sessionUUID: toFieldString(parsed?.text4?.sessionUUID ?? parsed?.text4?.u),
    },
  };
}

function mergeDraftWithFallback(nextDraft, fallbackDraft = createInitialDraft()) {
  const fallback = mergeDraftWithFallback.normalizeFallback(fallbackDraft);
  const pickValue = (value, fallbackValue) =>
    value === undefined || value === null || value === "" ? fallbackValue : value;

  return {
    text1: {
      state: pickValue(nextDraft?.text1?.state, fallback.text1.state),
    },
    text3: {
      triggerTemp: pickValue(nextDraft?.text3?.triggerTemp, fallback.text3.triggerTemp),
      maxStartTemp: pickValue(nextDraft?.text3?.maxStartTemp, fallback.text3.maxStartTemp),
      brewTime: pickValue(nextDraft?.text3?.brewTime, fallback.text3.brewTime),
      maxCupTemp: pickValue(nextDraft?.text3?.maxCupTemp, fallback.text3.maxCupTemp),
      maxTime: pickValue(nextDraft?.text3?.maxTime, fallback.text3.maxTime),
      ledBrightness: pickValue(nextDraft?.text3?.ledBrightness, fallback.text3.ledBrightness),
    },
    text4: {
      coffeeName: pickValue(nextDraft?.text4?.coffeeName, fallback.text4.coffeeName),
      coffeeProcess: pickValue(nextDraft?.text4?.coffeeProcess, fallback.text4.coffeeProcess),
      cupNumber: pickValue(nextDraft?.text4?.cupNumber, fallback.text4.cupNumber),
      sessionName: pickValue(nextDraft?.text4?.sessionName, fallback.text4.sessionName),
      sessionType: pickValue(nextDraft?.text4?.sessionType, fallback.text4.sessionType),
      sessionDate: pickValue(nextDraft?.text4?.sessionDate, fallback.text4.sessionDate),
      sessionUUID: pickValue(nextDraft?.text4?.sessionUUID, fallback.text4.sessionUUID),
    },
  };
}

mergeDraftWithFallback.normalizeFallback = function normalizeFallback(draft) {
  return draft && typeof draft === "object" ? draft : createInitialDraft();
};

function requireInteger(label, value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
}

function requireString(label, value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function buildWritablePayload(draft) {
  return {
    text1: {
      state: requireInteger("NDEF1 state", draft.text1.state),
    },
    text3: {
      triggerTemp: requireInteger("NDEF3 triggerTemp", draft.text3.triggerTemp),
      maxStartTemp: requireInteger("NDEF3 maxStartTemp", draft.text3.maxStartTemp),
      brewTime: requireInteger("NDEF3 brewTime", draft.text3.brewTime),
      maxCupTemp: requireInteger("NDEF3 maxCupTemp", draft.text3.maxCupTemp),
      maxTime: requireInteger("NDEF3 maxTime", draft.text3.maxTime),
      ledBrightness: requireInteger("NDEF3 ledBrightness", draft.text3.ledBrightness),
    },
    text4: {
      coffeeName: requireString("NDEF4 coffeeName", draft.text4.coffeeName),
      coffeeProcess: requireString("NDEF4 coffeeProcess", draft.text4.coffeeProcess),
      cupNumber: requireInteger("NDEF4 cupNumber", draft.text4.cupNumber),
      sessionName: requireString("NDEF4 sessionName", draft.text4.sessionName),
      sessionType: requireString("NDEF4 sessionType", draft.text4.sessionType),
      sessionDate: requireString("NDEF4 sessionDate", draft.text4.sessionDate),
      sessionUUID: requireString("NDEF4 sessionUUID", draft.text4.sessionUUID),
    },
  };
}

function buildStateUpdatePayload(draft) {
  return {
    text1: {
      state: requireInteger("NDEF1 state", draft.text1.state),
    },
  };
}

function buildSettingsUpdatePayload(draft) {
  return {
    text3: {
      triggerTemp: requireInteger("NDEF3 triggerTemp", draft.text3.triggerTemp),
      maxStartTemp: requireInteger("NDEF3 maxStartTemp", draft.text3.maxStartTemp),
      brewTime: requireInteger("NDEF3 brewTime", draft.text3.brewTime),
      maxCupTemp: requireInteger("NDEF3 maxCupTemp", draft.text3.maxCupTemp),
      maxTime: requireInteger("NDEF3 maxTime", draft.text3.maxTime),
      ledBrightness: requireInteger("NDEF3 ledBrightness", draft.text3.ledBrightness),
    },
  };
}

function buildMetadataUpdatePayload(draft) {
  return {
    text4: {
      coffeeName: requireString("NDEF4 coffeeName", draft.text4.coffeeName),
      coffeeProcess: requireString("NDEF4 coffeeProcess", draft.text4.coffeeProcess),
      cupNumber: requireInteger("NDEF4 cupNumber", draft.text4.cupNumber),
      sessionName: requireString("NDEF4 sessionName", draft.text4.sessionName),
      sessionType: requireString("NDEF4 sessionType", draft.text4.sessionType),
      sessionDate: requireString("NDEF4 sessionDate", draft.text4.sessionDate),
      sessionUUID: requireString("NDEF4 sessionUUID", draft.text4.sessionUUID),
    },
  };
}

function buildMetadataFullFramePayload(draft, preservedText2) {
  const compactText2 = toCupText2(preservedText2);
  if (!compactText2 || Object.keys(compactText2).length === 0) {
    throw new Error("Read the tag first so NDEF2 can be preserved.");
  }

  const nextPayload = buildWritablePayload(draft);
  return {
    ...nextPayload,
    text2: compactText2,
  };
}

function buildCompactWritePreview(records) {
  return {
    text1: toCupText1(records?.text1),
    text2: toCupText2(records?.text2),
    text3: toCupText3(records?.text3),
    text4: toCupText4(records?.text4),
  };
}

function buildSparseFrame({ text1 = {}, text3 = {}, text4 = {} } = {}) {
  return {
    text1,
    text2: {},
    text3,
    text4,
  };
}

export function NfcServiceTestScreen({ onBackPress }) {
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState("Ready to read");
  const [recordCount, setRecordCount] = useState(null);
  const [parsed, setParsed] = useState({
    text1: null,
    text2: null,
    text3: null,
    text4: null,
  });
  const [raw, setRaw] = useState({
    text1: null,
    text2: null,
    text3: null,
    text4: null,
  });
  const [writePreview, setWritePreview] = useState({
    text1: null,
    text2: null,
    text3: null,
    text4: null,
  });
  const [draft, setDraft] = useState(createInitialDraft);

  useEffect(() => {
    if (cooldownUntil <= now) {
      return undefined;
    }

    const timerId = setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => {
      clearInterval(timerId);
    };
  }, [cooldownUntil, now]);

  const cooldownRemainingMs = Math.max(0, cooldownUntil - now);
  const actionDisabled = busy || cooldownRemainingMs > 0;

  const setDraftField = (section, key, value) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
  };

  const triggerFailureFeedback = async () => {
    const nextNow = Date.now();
    setNow(nextNow);
    setCooldownUntil(nextNow + FAILURE_LOCKOUT_MS);
  };

  const handleRead = async () => {
    setBusy(true);
    setStatus("Reading...");
    setRecordCount(null);
    setParsed({
      text1: null,
      text2: null,
      text3: null,
      text4: null,
    });
    setRaw({
      text1: null,
      text2: null,
      text3: null,
      text4: null,
    });

    try {
      const result = await readNdefMinimal();
      const nextParsed = result?.parsed || {};
      const nextRaw = nextParsed?.raw || {};

      setParsed({
        text1: nextParsed.text1 ?? null,
        text2: nextParsed.text2 ?? null,
        text3: nextParsed.text3 ?? null,
        text4: nextParsed.text4 ?? null,
      });
      setRaw({
        text1: nextRaw.text1 ?? null,
        text2: nextRaw.text2 ?? null,
        text3: nextRaw.text3 ?? null,
        text4: nextRaw.text4 ?? null,
      });
      setDraft((current) =>
        mergeDraftWithFallback(buildDraftFromParsed(nextParsed), current),
      );

      const nextRecordCount = Number(result?.recordCount) || 0;
      setRecordCount(nextRecordCount);
      if (nextRecordCount === 0) {
        await triggerFailureFeedback();
        await playNfcFailureFeedback(new Error("No NDEF records found."));
        setStatus("Read complete (0 record(s); no NDEF payload returned)");
      } else {
        setStatus(`Read complete (${nextRecordCount} record(s))`);
      }
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_read_only",
        friendlyMessage: message,
        error,
      });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleWrite = async () => {
    setBusy(true);
    setStatus("Writing state update...");

    try {
      const nextPayload = buildStateUpdatePayload(draft);
      const outgoingPayload = buildSparseFrame({
        text1: nextPayload.text1,
      });
      setWritePreview(buildCompactWritePreview(outgoingPayload));

      await writeNdefMinimal(outgoingPayload);

      setParsed((current) => ({
        ...current,
        text1: nextPayload.text1,
      }));
      setStatus("State update write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_write",
        friendlyMessage: message,
        error,
      });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleWriteSettingsUpdate = async () => {
    setBusy(true);
    setStatus("Writing settings update...");

    try {
      const nextPayload = buildSettingsUpdatePayload(draft);
      const outgoingPayload = buildSparseFrame({
        text3: nextPayload.text3,
      });
      setWritePreview(buildCompactWritePreview(outgoingPayload));

      await writeNdefMinimal(outgoingPayload);

      setParsed((current) => ({
        ...current,
        text3: nextPayload.text3,
      }));
      setStatus("Settings update write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_write_settings_update",
        friendlyMessage: message,
        error,
      });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleWriteMetadataUpdate = async () => {
    setBusy(true);
    setStatus("Writing metadata update...");

    try {
      const outgoingPayload = buildMetadataFullFramePayload(draft, parsed.text2);
      setWritePreview(buildCompactWritePreview(outgoingPayload));

      await writeNdefMinimal(outgoingPayload);

      setParsed({
        text1: outgoingPayload.text1,
        text2: outgoingPayload.text2,
        text3: outgoingPayload.text3,
        text4: outgoingPayload.text4,
      });
      setStatus("Metadata update write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_write_metadata_update",
        friendlyMessage: message,
        error,
      });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleWriteMetadataSingleRecordDiagnostic = async () => {
    setBusy(true);
    setStatus("Writing single-record metadata diagnostic...");

    try {
      const nextPayload = buildMetadataUpdatePayload(draft);
      const outgoingPayload = buildSparseFrame({
        text4: nextPayload.text4,
      });
      setWritePreview(buildCompactWritePreview(outgoingPayload));

      await writeSingleRecordMetadataDiagnosticMinimal(outgoingPayload);

      setStatus("Single-record metadata diagnostic write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_write_metadata_single_record_diagnostic",
        friendlyMessage: message,
        error,
      });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleWriteNoSessionMetadata = async () => {
    setBusy(true);
    setStatus("Writing no-session metadata...");

    try {
      const outgoingPayload = buildSparseFrame({
        text4: { sessionUUID: "NO-SESSION" },
      });
      setWritePreview(buildCompactWritePreview(outgoingPayload));

      await writeNdefMinimal(outgoingPayload);

      setParsed((current) => ({
        ...current,
        text4: { sessionUUID: "NO-SESSION" },
      }));
      setStatus("No-session metadata write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      await playNfcFailureFeedback(error);
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_write_no_session_metadata",
        friendlyMessage: message,
        error,
      });
      setStatus(message);
    } finally {
      setBusy(false);
    }
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
          <Text style={styles.statusMeta}>
            recordCount: {recordCount === null ? "-" : String(recordCount)}
          </Text>
          {cooldownRemainingMs > 0 ? (
            <Text style={styles.statusMeta}>
              read button locked for {Math.ceil(cooldownRemainingMs / 1000)}s
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <FullPageButton
            label="Read Tag"
            onPress={handleRead}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Read NFC tag"
          />
          <FullPageButton
            label="Write State Update"
            onPress={handleWrite}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write state update to NFC tag"
          />
          <FullPageButton
            label="Write Settings Update"
            onPress={handleWriteSettingsUpdate}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write settings update to NFC tag"
          />
          <FullPageButton
            label="Write Metadata Update"
            onPress={handleWriteMetadataUpdate}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write metadata update to NFC tag"
          />
          <FullPageButton
            label="Write Metadata Single Record"
            onPress={handleWriteMetadataSingleRecordDiagnostic}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write metadata single-record diagnostic NFC tag"
          />
          <FullPageButton
            label="Write No Session"
            onPress={handleWriteNoSessionMetadata}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write no-session metadata to NFC tag"
          />
        </View>

        <JsonCard title="Last Write NDEF1" data={writePreview.text1} />
        <JsonCard title="Last Write NDEF2" data={writePreview.text2} />
        <JsonCard title="Last Write NDEF3" data={writePreview.text3} />
        <JsonCard title="Last Write NDEF4" data={writePreview.text4} />

        <SectionCard title="Write NDEF1">
          <FieldRow
            label="state"
            value={draft.text1.state}
            onChangeText={(value) => setDraftField("text1", "state", value)}
            keyboardType="number-pad"
          />
        </SectionCard>

        <SectionCard title="Write NDEF3">
          <FieldRow
            label="triggerTemp"
            value={draft.text3.triggerTemp}
            onChangeText={(value) => setDraftField("text3", "triggerTemp", value)}
            keyboardType="number-pad"
          />
          <FieldRow
            label="maxStartTemp"
            value={draft.text3.maxStartTemp}
            onChangeText={(value) => setDraftField("text3", "maxStartTemp", value)}
            keyboardType="number-pad"
          />
          <FieldRow
            label="brewTime"
            value={draft.text3.brewTime}
            onChangeText={(value) => setDraftField("text3", "brewTime", value)}
            keyboardType="number-pad"
          />
          <FieldRow
            label="maxCupTemp"
            value={draft.text3.maxCupTemp}
            onChangeText={(value) => setDraftField("text3", "maxCupTemp", value)}
            keyboardType="number-pad"
          />
          <FieldRow
            label="maxTime"
            value={draft.text3.maxTime}
            onChangeText={(value) => setDraftField("text3", "maxTime", value)}
            keyboardType="number-pad"
          />
          <FieldRow
            label="ledBrightness"
            value={draft.text3.ledBrightness}
            onChangeText={(value) => setDraftField("text3", "ledBrightness", value)}
            keyboardType="number-pad"
          />
        </SectionCard>

        <SectionCard title="Write NDEF4">
          <FieldRow
            label="coffeeName"
            value={draft.text4.coffeeName}
            onChangeText={(value) => setDraftField("text4", "coffeeName", value)}
            multiline
          />
          <FieldRow
            label="coffeeProcess"
            value={draft.text4.coffeeProcess}
            onChangeText={(value) => setDraftField("text4", "coffeeProcess", value)}
          />
          <FieldRow
            label="cupNumber"
            value={draft.text4.cupNumber}
            onChangeText={(value) => setDraftField("text4", "cupNumber", value)}
            keyboardType="number-pad"
          />
          <FieldRow
            label="sessionName"
            value={draft.text4.sessionName}
            onChangeText={(value) => setDraftField("text4", "sessionName", value)}
            multiline
          />
          <FieldRow
            label="sessionType"
            value={draft.text4.sessionType}
            onChangeText={(value) => setDraftField("text4", "sessionType", value)}
          />
          <FieldRow
            label="sessionDate"
            value={draft.text4.sessionDate}
            onChangeText={(value) => setDraftField("text4", "sessionDate", value)}
          />
          <FieldRow
            label="sessionUUID"
            value={draft.text4.sessionUUID}
            onChangeText={(value) => setDraftField("text4", "sessionUUID", value)}
          />
        </SectionCard>

        <JsonCard title="Parsed Text 1" data={toCupText1(parsed.text1)} />
        <JsonCard title="Parsed Text 2" data={toCupText2(parsed.text2)} />
        <JsonCard title="Parsed Text 3" data={toCupText3(parsed.text3)} />
        <JsonCard title="Parsed Text 4" data={toCupText4(parsed.text4)} />

        <JsonCard title="Raw Text 1" data={raw.text1} />
        <JsonCard title="Raw Text 2" data={raw.text2} />
        <JsonCard title="Raw Text 3" data={raw.text3} />
        <JsonCard title="Raw Text 4" data={raw.text4} />
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
  statusMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.xs,
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
  cardBody: {
    fontFamily: "Courier",
    fontSize: 13,
    color: colors.textMuted,
  },
  formGroup: {
    gap: spacing.xs,
  },
  fieldRow: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 14,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 72,
  },
});
