import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";

const TABS = ["State", "Status", "Settings", "Cupping", "NDEFs"];
const CUP_STATES = ["OFF", "READY", "BREWING", "CUPPING", "LOW_BATTERY"];

const INITIAL_SETTINGS = {
  triggerTemp: "40",
  maxStartTemp: "93",
  brewTime: "240",
  maxCupTemp: "70",
  maxTime: "3600",
  ledBrightness: "100",
};

export default function App() {
  const [tab, setTab] = useState("State");
  const [stateIndex, setStateIndex] = useState(0);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [cupStatus, setCupStatus] = useState({
    temp: 873,
    time: 132,
    battery: 74,
    UUID: "E004015023AB9F10",
  });
  const [cuppingParams, setCuppingParams] = useState({
    coffeeName: "Burundi Kayanza",
    coffeeProcess: "Washed",
    dateTime: `${Math.floor(Date.now() / 1000)}`,
    sessionName: "Morning Cupping",
    sessionDate: new Date().toISOString().slice(0, 10),
    sessionUUID: `session-${Date.now()}`,
  });
  const [nfcReady, setNfcReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Ready. NFC requires a development build on iPhone (not Expo Go)."
  );

  const settingsWriteAllowed = [0, 1, 4].includes(stateIndex);

  const ndefText1 = useMemo(() => ({ state: stateIndex }), [stateIndex]);
  const ndefText2 = cupStatus;
  const ndefText3 = useMemo(
    () => ({
      triggerTemp: Number(settings.triggerTemp || 0),
      maxStartTemp: Number(settings.maxStartTemp || 0),
      brewTime: Number(settings.brewTime || 0),
      maxCupTemp: Number(settings.maxCupTemp || 0),
      maxTime: Number(settings.maxTime || 0),
      ledBrightness: Number(settings.ledBrightness || 0),
    }),
    [settings]
  );
  const ndefText4 = useMemo(
    () => ({
      coffeeName: cuppingParams.coffeeName,
      coffeeProcess: cuppingParams.coffeeProcess,
      dateTime: Number(cuppingParams.dateTime || 0),
      sessionName: cuppingParams.sessionName,
      sessionDate: cuppingParams.sessionDate,
      sessionUUID: cuppingParams.sessionUUID,
    }),
    [cuppingParams]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (!supported) {
          if (mounted) setStatusMessage("NFC is not supported on this device.");
          return;
        }
        await NfcManager.start();
        if (mounted) {
          setNfcReady(true);
          setStatusMessage("NFC initialized. Tap Read/Write then hold near the cup.");
        }
      } catch (error) {
        if (mounted) {
          setStatusMessage(
            "NFC native module unavailable. Use `npx expo run:ios` and open that app."
          );
        }
      }
    })();

    return () => {
      mounted = false;
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  const decodeTextRecord = (record) => {
    if (!record?.payload) return null;
    try {
      return Ndef.text.decodePayload(record.payload);
    } catch (_) {
      try {
        const languageCodeLength = record.payload[0] & 0x3f;
        const textBytes = record.payload.slice(languageCodeLength + 1);
        return Ndef.util.bytesToString(textBytes);
      } catch (error) {
        return null;
      }
    }
  };

  const parseTextAsJson = (record) => {
    const text = decodeTextRecord(record);
    if (!text) return null;

    const cleaned = text.replace(/\0/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch (_) {
          return null;
        }
      }
      return parsed;
    } catch (_) {
      // Some tags include leading/trailing chars around JSON text.
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch (error) {
          return null;
        }
      }
      return null;
    }
  };

  const asNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const parseLooseObjectFromText = (text) => {
    if (!text) return null;
    const src = text.replace(/\0/g, "").trim();
    const obj = {};

    const pickNum = (key) => {
      const m = src.match(new RegExp(`"${key}"\\s*:\\s*([0-9]+)`, "i"));
      if (!m) return null;
      return asNumber(m[1]);
    };

    const pickStr = (key) => {
      const m = src.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, "i"));
      return m ? m[1] : null;
    };

    const state = pickNum("state");
    if (state !== null) obj.state = state;

    const temp = pickNum("temp");
    if (temp !== null) obj.temp = temp;
    const time = pickNum("time");
    if (time !== null) obj.time = time;
    const battery = pickNum("battery");
    if (battery !== null) obj.battery = battery;
    const uuid = pickStr("UUID") || pickStr("uuid");
    if (uuid) obj.UUID = uuid;

    const triggerTemp = pickNum("triggerTemp");
    if (triggerTemp !== null) obj.triggerTemp = triggerTemp;
    const maxStartTemp = pickNum("maxStartTemp");
    if (maxStartTemp !== null) obj.maxStartTemp = maxStartTemp;
    const brewTime = pickNum("brewTime");
    if (brewTime !== null) obj.brewTime = brewTime;
    const maxCupTemp = pickNum("maxCupTemp");
    if (maxCupTemp !== null) obj.maxCupTemp = maxCupTemp;
    const maxTime = pickNum("maxTime");
    if (maxTime !== null) obj.maxTime = maxTime;
    const ledBrightness = pickNum("ledBrightness");
    if (ledBrightness !== null) obj.ledBrightness = ledBrightness;

    const coffeeName = pickStr("coffeeName");
    if (coffeeName !== null) obj.coffeeName = coffeeName;
    const coffeeProcess = pickStr("coffeeProcess");
    if (coffeeProcess !== null) obj.coffeeProcess = coffeeProcess;
    const dateTime = pickNum("dateTime");
    if (dateTime !== null) obj.dateTime = dateTime;
    const sessionName = pickStr("sessionName");
    if (sessionName !== null) obj.sessionName = sessionName;
    const sessionDate = pickStr("sessionDate");
    if (sessionDate !== null) obj.sessionDate = sessionDate;
    const sessionUUID = pickStr("sessionUUID");
    if (sessionUUID !== null) obj.sessionUUID = sessionUUID;

    return Object.keys(obj).length ? obj : null;
  };

  const mapRecordsToPayload = (records) => {
    const payload = { text1: null, text2: null, text3: null, text4: null };

    for (const record of records) {
      const rawText = decodeTextRecord(record);
      const obj = parseTextAsJson(record) || parseLooseObjectFromText(rawText);
      if (!obj || typeof obj !== "object") continue;

      if ("state" in obj) {
        payload.text1 = obj;
        continue;
      }

      if ("temp" in obj || "time" in obj || "battery" in obj || "UUID" in obj) {
        payload.text2 = obj;
        continue;
      }

      if (
        "triggerTemp" in obj ||
        "maxStartTemp" in obj ||
        "brewTime" in obj ||
        "maxCupTemp" in obj ||
        "maxTime" in obj ||
        "ledBrightness" in obj
      ) {
        payload.text3 = obj;
        continue;
      }

      if (
        "coffeeName" in obj ||
        "coffeeProcess" in obj ||
        "dateTime" in obj ||
        "sessionName" in obj ||
        "sessionDate" in obj ||
        "sessionUUID" in obj
      ) {
        payload.text4 = obj;
      }
    }

    return payload;
  };

  const applyCupPayload = (payload) => {
    if (
      payload.text1 &&
      Number.isInteger(payload.text1.state) &&
      payload.text1.state >= 0 &&
      payload.text1.state <= 4
    ) {
      setStateIndex(payload.text1.state);
    }

    if (payload.text2) {
      setCupStatus((prev) => ({
        ...prev,
        temp: Number(payload.text2.temp ?? prev.temp),
        time: Number(payload.text2.time ?? prev.time),
        battery: Number(payload.text2.battery ?? prev.battery),
        UUID: payload.text2.UUID ? String(payload.text2.UUID) : prev.UUID,
      }));
    }

    if (payload.text3) {
      setSettings((prev) => ({
        triggerTemp: String(payload.text3.triggerTemp ?? prev.triggerTemp),
        maxStartTemp: String(payload.text3.maxStartTemp ?? prev.maxStartTemp),
        brewTime: String(payload.text3.brewTime ?? prev.brewTime),
        maxCupTemp: String(payload.text3.maxCupTemp ?? prev.maxCupTemp),
        maxTime: String(payload.text3.maxTime ?? prev.maxTime),
        ledBrightness: String(payload.text3.ledBrightness ?? prev.ledBrightness),
      }));
    }

    if (payload.text4) {
      setCuppingParams((prev) => ({
        coffeeName: String(payload.text4.coffeeName ?? prev.coffeeName),
        coffeeProcess: String(payload.text4.coffeeProcess ?? prev.coffeeProcess),
        dateTime: String(payload.text4.dateTime ?? prev.dateTime),
        sessionName: String(payload.text4.sessionName ?? prev.sessionName),
        sessionDate: String(payload.text4.sessionDate ?? prev.sessionDate),
        sessionUUID: String(payload.text4.sessionUUID ?? prev.sessionUUID),
      }));
    }
  };

  const withNdefSession = async (work, actionLabel) => {
    if (!nfcReady) {
      setStatusMessage("NFC not ready. Launch a development build (`npx expo run:ios`).");
      return null;
    }

    setBusy(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: `${actionLabel}: hold phone near cup`,
      });
      const result = await work();
      return result;
    } catch (error) {
      setStatusMessage(`${actionLabel} failed: ${error?.message ?? "Unknown error"}`);
      return null;
    } finally {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
      setBusy(false);
    }
  };

  const readNdefOnce = async () =>
    withNdefSession(async () => {
      const tag = await NfcManager.getTag();
      const records = tag?.ndefMessage ?? [];
      const mapped = mapRecordsToPayload(records);
      return { ...mapped, count: records.length };
    }, "Read NDEF");

  const readNdef = async () => {
    const maxAttempts = 3;
    let payload = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      payload = await readNdefOnce();
      if (!payload) return;
      if (payload.count > 0) break;
      if (attempt < maxAttempts) {
        setStatusMessage(`Read returned 0 records. Re-scanning (${attempt + 1}/${maxAttempts})...`);
      }
    }

    if (!payload) return;
    if (payload.count === 0) {
      setStatusMessage("Read failed after retries: 0 NDEF records detected.");
      return;
    }
    applyCupPayload(payload);
    setStatusMessage(
      `Read successful. ${payload.count} record(s). Parsed: T1=${payload.text1 ? "Y" : "N"}, T2=${
        payload.text2 ? "Y" : "N"
      }, T3=${payload.text3 ? "Y" : "N"}, T4=${payload.text4 ? "Y" : "N"}`
    );
  };

  const writeNdef = async () => {
    const writePayload = [ndefText1, ndefText2, ndefText3, ndefText4];

    const wrote = await withNdefSession(async () => {
      const records = writePayload.map((obj) => Ndef.textRecord(JSON.stringify(obj)));
      const bytes = Ndef.encodeMessage(records);
      if (!bytes) throw new Error("Failed to encode NDEF message.");
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      return true;
    }, "Write NDEF");

    if (wrote) setStatusMessage("Write successful.");
  };

  const renderStateScreen = () => (
    <View style={styles.screenBlock}>
      <Text style={styles.sectionTitle}>State Control (NDEF Text 1)</Text>

      <View style={styles.stateGrid}>
        {CUP_STATES.map((s, i) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, i === stateIndex && styles.chipActive]}
            onPress={() => setStateIndex(i)}
          >
            <Text style={[styles.chipText, i === stateIndex && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.primaryButton} onPress={readNdef} disabled={busy}>
          <Text style={styles.primaryText}>Read NDEF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={writeNdef} disabled={busy}>
          <Text style={styles.secondaryText}>Write NDEF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStatusScreen = () => (
    <View style={styles.screenBlock}>
      <Text style={styles.sectionTitle}>Cup Snapshot (NDEF Text 2)</Text>

      <View style={styles.card}>
        <Text style={styles.kv}>State: {CUP_STATES[stateIndex]}</Text>
        <Text style={styles.kv}>Temp: {(cupStatus.temp / 10).toFixed(1)} C</Text>
        <Text style={styles.kv}>Timer: {cupStatus.time}s</Text>
        <Text style={styles.kv}>Battery: {cupStatus.battery}%</Text>
        <Text style={styles.kv}>UUID: {cupStatus.UUID}</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={readNdef} disabled={busy}>
        <Text style={styles.primaryText}>Read NDEF</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSettingsScreen = () => (
    <View style={styles.screenBlock}>
      <Text style={styles.sectionTitle}>Settings (NDEF Text 3)</Text>
      <Text style={styles.helperText}>
        Editable only in OFF, READY, LOW_BATTERY. Current: {CUP_STATES[stateIndex]}
      </Text>

      {Object.keys(settings).map((key) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>{key}</Text>
          <TextInput
            style={[styles.input, !settingsWriteAllowed && styles.inputDisabled]}
            value={settings[key]}
            keyboardType="number-pad"
            editable={settingsWriteAllowed}
            onChangeText={(txt) => setSettings((prev) => ({ ...prev, [key]: txt }))}
          />
        </View>
      ))}

      <View style={styles.row}>
        <TouchableOpacity style={styles.primaryButton} onPress={readNdef} disabled={busy}>
          <Text style={styles.primaryText}>Read NDEF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            (!settingsWriteAllowed || busy) && styles.buttonDisabled,
          ]}
          disabled={!settingsWriteAllowed || busy}
          onPress={writeNdef}
        >
          <Text
            style={[
              styles.secondaryText,
              (!settingsWriteAllowed || busy) && styles.buttonTextDisabled,
            ]}
          >
            Write NDEF
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCuppingScreen = () => (
    <View style={styles.screenBlock}>
      <Text style={styles.sectionTitle}>Cupping Params (NDEF Text 4)</Text>

      {Object.keys(cuppingParams).map((key) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>{key}</Text>
          <TextInput
            style={styles.input}
            value={cuppingParams[key]}
            keyboardType={key === "dateTime" ? "number-pad" : "default"}
            onChangeText={(txt) => setCuppingParams((prev) => ({ ...prev, [key]: txt }))}
          />
        </View>
      ))}

      <View style={styles.row}>
        <TouchableOpacity style={styles.primaryButton} onPress={readNdef} disabled={busy}>
          <Text style={styles.primaryText}>Read NDEF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={writeNdef} disabled={busy}>
          <Text style={styles.secondaryText}>Write NDEF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderNdefsScreen = () => (
    <View style={styles.screenBlock}>
      <Text style={styles.sectionTitle}>NDEF Payloads (Read-only)</Text>

      <View style={styles.card}>
        <Text style={styles.jsonTitle}>NDEF Text 1</Text>
        <Text style={styles.jsonBlock}>{JSON.stringify(ndefText1, null, 2)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.jsonTitle}>NDEF Text 2</Text>
        <Text style={styles.jsonBlock}>{JSON.stringify(ndefText2, null, 2)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.jsonTitle}>NDEF Text 3</Text>
        <Text style={styles.jsonBlock}>{JSON.stringify(ndefText3, null, 2)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.jsonTitle}>NDEF Text 4</Text>
        <Text style={styles.jsonBlock}>{JSON.stringify(ndefText4, null, 2)}</Text>
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.primaryButton} onPress={readNdef} disabled={busy}>
          <Text style={styles.primaryText}>Read NDEF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={writeNdef} disabled={busy}>
          <Text style={styles.secondaryText}>Write NDEF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderScreen = () => {
    if (tab === "State") return renderStateScreen();
    if (tab === "Status") return renderStatusScreen();
    if (tab === "Settings") return renderSettingsScreen();
    if (tab === "Cupping") return renderCuppingScreen();
    return renderNdefsScreen();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>NDEF Test App</Text>
        <Text style={styles.subtitle}>Read / write test app for cup firmware records</Text>
      </View>
      <View style={styles.stateBanner}>
        <Text style={styles.stateBannerText}>Current state: {CUP_STATES[stateIndex]}</Text>
      </View>
      <View style={styles.statusBanner}>
        <Text style={styles.statusBannerText}>{statusMessage}</Text>
        {busy ? <ActivityIndicator color="#734522" size="small" /> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>{renderScreen()}</ScrollView>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tabButton}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4efe6",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2d5c1",
    backgroundColor: "#f9f4ea",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#332115",
  },
  subtitle: {
    marginTop: 4,
    color: "#6f4d35",
  },
  stateBanner: {
    backgroundColor: "#4f2e1a",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stateBannerText: {
    color: "#fff8ee",
    fontWeight: "700",
  },
  statusBanner: {
    backgroundColor: "#efe6d8",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ddceba",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusBannerText: {
    color: "#4a3525",
    fontSize: 13,
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  screenBlock: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2b1b12",
  },
  card: {
    backgroundColor: "#fffdfa",
    borderWidth: 1,
    borderColor: "#e8ddcf",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  kv: {
    color: "#3f2c1f",
    fontSize: 15,
  },
  jsonTitle: {
    color: "#2e2017",
    fontSize: 14,
    fontWeight: "700",
  },
  jsonBlock: {
    marginTop: 6,
    fontFamily: "Courier",
    color: "#3f2c1f",
    fontSize: 13,
    lineHeight: 18,
  },
  stateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbb195",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff8ef",
  },
  chipActive: {
    borderColor: "#4f2e1a",
    backgroundColor: "#4f2e1a",
  },
  chipText: {
    color: "#5a3925",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fffaf2",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#734522",
  },
  primaryText: {
    color: "#fff8ee",
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#734522",
    backgroundColor: "#fff7ed",
  },
  secondaryText: {
    color: "#734522",
    fontWeight: "700",
  },
  field: {
    gap: 6,
  },
  label: {
    color: "#5f4430",
    fontWeight: "600",
  },
  helperText: {
    color: "#6f4d35",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d7c4ad",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fffdfa",
  },
  inputDisabled: {
    backgroundColor: "#f0e7dc",
    color: "#8a7664",
  },
  buttonDisabled: {
    borderColor: "#bfae9a",
    backgroundColor: "#efe7dc",
  },
  buttonTextDisabled: {
    color: "#9f8b78",
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#dbcdb8",
    backgroundColor: "#fff8ef",
  },
  tabButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tabText: {
    color: "#7f644e",
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#2f1c10",
    textDecorationLine: "underline",
  },
});
