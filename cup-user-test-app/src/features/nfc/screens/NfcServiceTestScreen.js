import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { readNdef } from "../../../services/nfcService";
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
  const readDisabled = busy || cooldownRemainingMs > 0;

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
            disabled={readDisabled}
            accessibilityLabel="Read NFC tag"
          />
        </View>

        <JsonCard title="Parsed Text 1" data={parsed.text1} />
        <JsonCard title="Parsed Text 2" data={parsed.text2} />
        <JsonCard title="Parsed Text 3" data={parsed.text3} />
        <JsonCard title="Parsed Text 4" data={parsed.text4} />

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
});
