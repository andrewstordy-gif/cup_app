import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const BASE_DIR = FileSystem.documentDirectory || FileSystem.cacheDirectory || null;
const LOG_DIR = BASE_DIR ? `${BASE_DIR}error-logs/` : null;
const LATEST_POINTER_FILE = LOG_DIR ? `${LOG_DIR}latest.txt` : null;
let latestLogUriInMemory = null;

function nowIso() {
  return new Date().toISOString();
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function timestampForFile() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

function safeValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function ensureLogDir() {
  if (!LOG_DIR) {
    throw new Error("No writable app directory available for error logs.");
  }
  const dirInfo = await FileSystem.getInfoAsync(LOG_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true });
  }
}

function buildLogText({
  screen = "Unknown",
  route = "",
  flow = "unknown_flow",
  friendlyMessage = "",
  rawError = "",
  errorCode = "",
  errorStage = "",
  nativeRawError = "",
  events = [],
  context = {},
}) {
  const lines = [];
  lines.push(`timestamp: ${nowIso()}`);
  lines.push(`screen: ${screen}`);
  lines.push(`route: ${route || "-"}`);
  lines.push(`flow: ${flow}`);
  lines.push(`friendly_message: ${friendlyMessage || "-"}`);
  lines.push(`raw_error: ${rawError || "-"}`);
  lines.push(`error_code: ${errorCode || "-"}`);
  lines.push(`error_stage: ${errorStage || "-"}`);
  lines.push(`native_raw_error: ${nativeRawError || "-"}`);
  lines.push("");
  lines.push("events:");
  if (Array.isArray(events) && events.length > 0) {
    events.forEach((event) => lines.push(`- ${event}`));
  } else {
    lines.push("- (none)");
  }
  lines.push("");
  lines.push("context:");
  const contextEntries = Object.entries(context || {});
  if (contextEntries.length === 0) {
    lines.push("- (none)");
  } else {
    contextEntries.forEach(([key, value]) => {
      lines.push(`- ${key}: ${safeValue(value)}`);
    });
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function logAppError({
  screen,
  route,
  flow,
  friendlyMessage,
  error,
  events,
  context,
}) {
  try {
    await ensureLogDir();
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const fileName = `error_${timestampForFile()}_${suffix}.txt`;
    const uri = `${LOG_DIR}${fileName}`;
    const rawError = String(error?.stack || error?.message || error || "").trim();
    const text = buildLogText({
      screen,
      route,
      flow,
      friendlyMessage,
      rawError,
      errorCode: error?.nfcCode || "",
      errorStage: error?.nfcStage || "",
      nativeRawError: error?.nfcRawError || "",
      events,
      context,
    });

    await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
    latestLogUriInMemory = uri;
    if (LATEST_POINTER_FILE) {
      await FileSystem.writeAsStringAsync(LATEST_POINTER_FILE, uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
    return uri;
  } catch (error) {
    latestLogUriInMemory = null;
    // Keep this visible in metro logs while still avoiding app crashes.
    // eslint-disable-next-line no-console
    console.warn("errorLogger: failed to write log", error?.message || error);
    return null;
  }
}

export async function getLatestErrorLogUri() {
  try {
    if (latestLogUriInMemory) {
      const memFileInfo = await FileSystem.getInfoAsync(latestLogUriInMemory);
      if (memFileInfo.exists) {
        return latestLogUriInMemory;
      }
    }

    if (LATEST_POINTER_FILE) {
      const info = await FileSystem.getInfoAsync(LATEST_POINTER_FILE);
      if (info.exists) {
        const uri = (await FileSystem.readAsStringAsync(LATEST_POINTER_FILE)).trim();
        if (uri) {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo.exists) {
            latestLogUriInMemory = uri;
            return uri;
          }
        }
      }
    }

    if (!LOG_DIR) {
      return null;
    }
    const dirInfo = await FileSystem.getInfoAsync(LOG_DIR);
    if (!dirInfo.exists) {
      return null;
    }

    const files = await FileSystem.readDirectoryAsync(LOG_DIR);
    const candidates = files.filter((name) => name.startsWith("error_") && name.endsWith(".txt"));
    if (candidates.length === 0) {
      return null;
    }
    const sorted = candidates.sort().reverse();
    const latestUri = `${LOG_DIR}${sorted[0]}`;
    latestLogUriInMemory = latestUri;
    return latestUri;
  } catch {
    return null;
  }
}

export async function shareLatestErrorLog() {
  const uri = await getLatestErrorLogUri();
  if (!uri) {
    throw new Error("No error logs available yet.");
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "text/plain",
    UTI: "public.plain-text",
    dialogTitle: "Share Error Log",
  });

  return uri;
}
