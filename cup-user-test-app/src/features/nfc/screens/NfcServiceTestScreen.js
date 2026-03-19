import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import {
  readNdef,
  writeNdef,
  sampleNdefPayload,
} from "../../../services/nfcService";
import { logAppError } from "../../../services/errorLogger";

const FAILURE_LOCKOUT_MS = 2000;
const FAILURE_CLANG = require("../../../../assets/sounds/nfc-failure-clang.wav");

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
      state: String(sampleNdefPayload.text1?.state ?? ""),
    },
    text3: {
      triggerTemp: String(sampleNdefPayload.text3?.triggerTemp ?? ""),
      maxStartTemp: String(sampleNdefPayload.text3?.maxStartTemp ?? ""),
      brewTime: String(sampleNdefPayload.text3?.brewTime ?? ""),
      maxCupTemp: String(sampleNdefPayload.text3?.maxCupTemp ?? ""),
      maxTime: String(sampleNdefPayload.text3?.maxTime ?? ""),
      ledBrightness: String(sampleNdefPayload.text3?.ledBrightness ?? ""),
    },
    text4: {
      coffeeName: String(sampleNdefPayload.text4?.coffeeName ?? ""),
      coffeeProcess: String(sampleNdefPayload.text4?.coffeeProcess ?? ""),
      cupNumber: String(sampleNdefPayload.text4?.cupNumber ?? ""),
      sessionName: String(sampleNdefPayload.text4?.sessionName ?? ""),
      sessionType: String(sampleNdefPayload.text4?.sessionType ?? ""),
      sessionDate: String(sampleNdefPayload.text4?.sessionDate ?? ""),
      sessionUUID: String(sampleNdefPayload.text4?.sessionUUID ?? ""),
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

function mergeDraftWithFallback(nextDraft) {
  const fallback = createInitialDraft();
  return {
    text1: {
      state: nextDraft?.text1?.state || fallback.text1.state,
    },
    text3: {
      triggerTemp: nextDraft?.text3?.triggerTemp || fallback.text3.triggerTemp,
      maxStartTemp: nextDraft?.text3?.maxStartTemp || fallback.text3.maxStartTemp,
      brewTime: nextDraft?.text3?.brewTime || fallback.text3.brewTime,
      maxCupTemp: nextDraft?.text3?.maxCupTemp || fallback.text3.maxCupTemp,
      maxTime: nextDraft?.text3?.maxTime || fallback.text3.maxTime,
      ledBrightness: nextDraft?.text3?.ledBrightness || fallback.text3.ledBrightness,
    },
    text4: {
      coffeeName: nextDraft?.text4?.coffeeName || fallback.text4.coffeeName,
      coffeeProcess: nextDraft?.text4?.coffeeProcess || fallback.text4.coffeeProcess,
      cupNumber: nextDraft?.text4?.cupNumber || fallback.text4.cupNumber,
      sessionName: nextDraft?.text4?.sessionName || fallback.text4.sessionName,
      sessionType: nextDraft?.text4?.sessionType || fallback.text4.sessionType,
      sessionDate: nextDraft?.text4?.sessionDate || fallback.text4.sessionDate,
      sessionUUID: nextDraft?.text4?.sessionUUID || fallback.text4.sessionUUID,
    },
  };
}

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

function requirePreservedText2(text2) {
  if (!text2 || typeof text2 !== "object") {
    throw new Error("Read the tag first so NDEF2 can be preserved.");
  }
  return text2;
}

export function NfcServiceTestScreen({ onBackPress }) {
  const failureSoundRef = useRef(null);
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

  useEffect(() => {
    let active = true;

    const loadFailureSound = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
        });

        const { sound } = await Audio.Sound.createAsync(FAILURE_CLANG);
        if (!active) {
          await sound.unloadAsync();
          return;
        }

        failureSoundRef.current = sound;
      } catch {
        failureSoundRef.current = null;
      }
    };

    void loadFailureSound();

    return () => {
      active = false;
      const sound = failureSoundRef.current;
      failureSoundRef.current = null;
      if (sound) {
        void sound.unloadAsync();
      }
    };
  }, []);

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

    const sound = failureSoundRef.current;
    if (!sound) {
      return;
    }

    try {
      await sound.replayAsync();
    } catch {
      try {
        await sound.unloadAsync();
      } catch {
        // no-op
      }

      failureSoundRef.current = null;
      try {
        const { sound: reloadedSound } = await Audio.Sound.createAsync(
          FAILURE_CLANG,
          { shouldPlay: true },
        );
        failureSoundRef.current = reloadedSound;
      } catch {
        failureSoundRef.current = null;
      }
    }
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
      const result = await readNdef();
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
        mergeDraftWithFallback({
          ...current,
          ...buildDraftFromParsed(nextParsed),
        }),
      );

      const nextRecordCount = Number(result?.recordCount) || 0;
      setRecordCount(nextRecordCount);
      if (nextRecordCount === 0) {
        await triggerFailureFeedback();
        setStatus("Read complete (0 record(s); no NDEF payload returned)");
      } else {
        setStatus(`Read complete (${nextRecordCount} record(s))`);
      }
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
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
    setStatus("Writing...");

    try {
      const nextPayload = buildWritablePayload(draft);
      const text2Payload = requirePreservedText2(parsed.text2);

      await writeNdef({
        text1: nextPayload.text1,
        text2: text2Payload,
        text3: nextPayload.text3,
        text4: nextPayload.text4,
      });

      setParsed((current) => ({
        ...current,
        text1: nextPayload.text1,
        text2: text2Payload,
        text3: nextPayload.text3,
        text4: nextPayload.text4,
      }));
      setStatus("Write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
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

  const handleWriteGoodNdef = async () => {
    setBusy(true);
    setStatus("Writing known-good NDEF...");

    try {
      const text2Payload = requirePreservedText2(parsed.text2);
      const knownGoodPayload = {
        text1: { state: 0 },
        text2: text2Payload,
        text3: sampleNdefPayload.text3,
        text4: sampleNdefPayload.text4,
      };

      await writeNdef(knownGoodPayload);

      setParsed({
        text1: knownGoodPayload.text1,
        text2: knownGoodPayload.text2,
        text3: knownGoodPayload.text3,
        text4: knownGoodPayload.text4,
      });
      setDraft(createInitialDraft());
      setStatus("Known-good NDEF write complete");
    } catch (error) {
      const message = error?.message || "Unknown NFC error";
      await triggerFailureFeedback();
      void logAppError({
        screen: "NFCTest",
        route: "NFC Test",
        flow: "nfc_test_write_good_ndef",
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
            label="Write Tag"
            onPress={handleWrite}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write NFC tag"
          />
          <FullPageButton
            label="Write Good NDEF"
            onPress={handleWriteGoodNdef}
            loading={busy}
            disabled={actionDisabled}
            accessibilityLabel="Write known good NFC payload"
          />
        </View>

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
