#include "drivers_json.h"

#include <string.h>
#include <ctype.h>
#include <stdio.h>
#include "config.h"

namespace drivers::json {

char stateBuf[32];
char statusBuf[96];
char settingsBuf[160];
char singleRecordBuf[768];
char appBuf[384];

// ---------------- helpers ----------------

static bool parseUint(const char *p, uint32_t &out) {
  if (!p || !isdigit((unsigned char)*p)) return false;
  uint32_t v = 0;
  while (isdigit((unsigned char)*p)) {
    v = v * 10u + (uint32_t)(*p - '0');
    ++p;
  }
  out = v;
  return true;
}

static const char* findKeyValue(const char *json, const char *key) {
  if (!json || !key) return nullptr;
  const char *p = strstr(json, key);
  if (!p) return nullptr;
  p = strchr(p, ':');
  if (!p) return nullptr;
  ++p;
  while (*p == ' ' || *p == '\t') ++p;
  return p;
}

static bool parseJsonString(const char *p, char *out, size_t len) {
  if (!p || !out || len == 0 || *p != '"') return false;
  ++p;
  size_t i = 0;
  while (*p && *p != '"' && i + 1 < len) {
    out[i++] = *p++;
  }
  if (*p != '"') return false;
  out[i] = '\0';
  return true;
}

static bool extractObject(const char *json, const char *sectionKey, char *out, size_t len) {
  if (!json || !sectionKey || !out || len == 0) return false;
  const char *p = strstr(json, sectionKey);
  if (!p) return false;
  p = strchr(p, ':');
  if (!p) return false;
  while (*p && *p != '{') ++p;
  if (*p != '{') return false;

  const char *start = p;
  int depth = 0;
  while (*p) {
    if (*p == '{') {
      ++depth;
    } else if (*p == '}') {
      --depth;
      if (depth == 0) {
        size_t n = (size_t)(p - start + 1);
        if (n >= len) return false;
        memcpy(out, start, n);
        out[n] = '\0';
        return true;
      }
    }
    ++p;
  }
  return false;
}

static bool parseUintFromSection(const char *json, const char *sectionKey, const char *key, uint32_t &out) {
  char section[256];
  if (!extractObject(json, sectionKey, section, sizeof(section))) return false;
  const char *p = findKeyValue(section, key);
  return p && parseUint(p, out);
}

static bool parseStringFromSection(const char *json, const char *sectionKey, const char *key, char *out, size_t len) {
  char section[256];
  if (!extractObject(json, sectionKey, section, sizeof(section))) return false;
  const char *p = findKeyValue(section, key);
  return p && parseJsonString(p, out, len);
}

// ---------------- State ----------------

void initState(State &s) {
  s.state = 0;
}

const char* encodeState(const State &s) {
  snprintf(stateBuf, sizeof(stateBuf),
           "{\"s\":%u}", (unsigned)s.state);
  return stateBuf;
}

bool decodeState(const char *json, State &s) {
  uint32_t v;
  if (parseUintFromSection(json, "\"ctrl\"", "\"s\"", v)) {
    s.state = (uint8_t)v;
    return true;
  }
  const char *p = findKeyValue(json, "state");
  if (!p) p = findKeyValue(json, "s");
  if (!p || !parseUint(p, v)) return false;
  s.state = (uint8_t)v;
  return true;
}

// ---------------- Status ----------------

void initStatus(Status &s) {
  s.temp = 0;
  s.time = 0;
  s.battery = 100;
  s.uuid[0] = '\0';
}

const char* encodeStatus(const Status &s) {
  snprintf(statusBuf, sizeof(statusBuf),
           "{\"t\":%u,\"m\":%u,\"b\":%u,\"u\":\"%s\"}",
           (unsigned)s.temp,
           (unsigned)s.time,
           (unsigned)s.battery,
           s.uuid);
  return statusBuf;
}

bool decodeStatus(const char *json, Status &s) {
  uint32_t v;
  bool ok = false;

  if (parseUintFromSection(json, "\"status\"", "\"t\"", v)) {
    s.temp = (uint16_t)v;
    ok = true;
  } else {
    const char *p = findKeyValue(json, "temp");
    if (!p) p = findKeyValue(json, "\"t\"");
    if (p && parseUint(p, v)) {
      s.temp = (uint16_t)v;
      ok = true;
    }
  }

  if (parseUintFromSection(json, "\"status\"", "\"m\"", v)) {
    s.time = (uint16_t)v;
    ok = true;
  } else {
    const char *p = findKeyValue(json, "time");
    if (!p) p = findKeyValue(json, "\"m\"");
    if (!p) p = findKeyValue(json, "\"tm\"");
    if (p && parseUint(p, v)) {
      s.time = (uint16_t)v;
      ok = true;
    }
  }

  if (parseUintFromSection(json, "\"status\"", "\"b\"", v)) {
    s.battery = (uint8_t)v;
    ok = true;
  } else {
    const char *p = findKeyValue(json, "battery");
    if (!p) p = findKeyValue(json, "\"b\"");
    if (p && parseUint(p, v)) {
      s.battery = (uint8_t)v;
      ok = true;
    }
  }

  if (parseStringFromSection(json, "\"status\"", "\"u\"", s.uuid, sizeof(s.uuid))) {
    ok = true;
  } else {
    const char *p = findKeyValue(json, "UUID");
    if (!p) p = findKeyValue(json, "uuid");
    if (!p) p = findKeyValue(json, "\"u\"");
    if (p && parseJsonString(p, s.uuid, sizeof(s.uuid))) {
      ok = true;
    }
  }

  return ok;
}

// ---------------- Settings ----------------

#ifndef DEFAULT_LED_BRIGHTNESS
// Per your NDEF table: default value 50 (0–255). :contentReference[oaicite:1]{index=1}
#define DEFAULT_LED_BRIGHTNESS 50
#endif

void initSettings(Settings &s) {
  s.triggerTemp    = DEFAULT_TRIGGER_TEMP;
  s.maxStartTemp   = DEFAULT_MAX_START_TEMP;
  s.brewTime       = DEFAULT_BREW_TIME;
  s.maxCupTemp     = DEFAULT_MAX_CUP_TEMP;
  s.maxTime        = DEFAULT_MAX_TIME;
  s.ledBrightness  = DEFAULT_LED_BRIGHTNESS;
}

const char* encodeSettings(const Settings &s) {
  
  snprintf(settingsBuf, sizeof(settingsBuf),
           "{\"r\":%u,"
           "\"a\":%u,"
           "\"w\":%u,"
           "\"c\":%u,"
           "\"x\":%u,"
           "\"l\":%u}",
           (unsigned)s.triggerTemp,
           (unsigned)s.maxStartTemp,
           (unsigned)s.brewTime,
           (unsigned)s.maxCupTemp,
           (unsigned)s.maxTime,
           (unsigned)s.ledBrightness);
  return settingsBuf;
}

bool decodeSettings(const char *json, Settings &s) {
  uint32_t v;
  if (parseUintFromSection(json, "\"settings\"", "\"r\"", v)) s.triggerTemp = (uint8_t)v;
  else {
    const char *p = findKeyValue(json, "triggerTemp");
    if (!p) p = findKeyValue(json, "r");
    if (p && parseUint(p, v)) s.triggerTemp = (uint8_t)v;
  }

  if (parseUintFromSection(json, "\"settings\"", "\"a\"", v)) s.maxStartTemp = (uint8_t)v;
  else {
    const char *p = findKeyValue(json, "maxStartTemp");
    if (!p) p = findKeyValue(json, "a");
    if (p && parseUint(p, v)) s.maxStartTemp = (uint8_t)v;
  }

  if (parseUintFromSection(json, "\"settings\"", "\"w\"", v)) s.brewTime = (uint16_t)v;
  else {
    const char *p = findKeyValue(json, "brewTime");
    if (!p) p = findKeyValue(json, "w");
    if (p && parseUint(p, v)) s.brewTime = (uint16_t)v;
  }

  if (parseUintFromSection(json, "\"settings\"", "\"c\"", v)) s.maxCupTemp = (uint8_t)v;
  else {
    const char *p = findKeyValue(json, "maxCupTemp");
    if (!p) p = findKeyValue(json, "c");
    if (p && parseUint(p, v)) s.maxCupTemp = (uint8_t)v;
  }

  if (parseUintFromSection(json, "\"settings\"", "\"x\"", v)) s.maxTime = (uint16_t)v;
  else {
    const char *p = findKeyValue(json, "maxTime");
    if (!p) p = findKeyValue(json, "x");
    if (p && parseUint(p, v)) s.maxTime = (uint16_t)v;
  }

  if (parseUintFromSection(json, "\"settings\"", "\"l\"", v)) s.ledBrightness = (uint8_t)v;
  else {
    const char *p = findKeyValue(json, "ledBrightness");
    if (!p) p = findKeyValue(json, "l");
    if (p && parseUint(p, v)) s.ledBrightness = (uint8_t)v;
  }

  return true;
}

const char* encodeRecord(
  const State &state,
  const Status &status,
  const Settings &settings,
  const char *appJson
) {
  const char *ctrlJson = encodeState(state);
  const char *statusJson = encodeStatus(status);
  const char *settingsJson = encodeSettings(settings);
  const char *safeAppJson = (appJson && appJson[0] == '{') ? appJson : "{}";

  snprintf(singleRecordBuf, sizeof(singleRecordBuf),
           "{\"v\":1,\"fv\":\"%s\",\"ctrl\":%s,\"status\":%s,\"settings\":%s,\"app\":%s}",
           FIRMWARE_VERSION,
           ctrlJson,
           statusJson,
           settingsJson,
           safeAppJson);
  return singleRecordBuf;
}

bool extractAppSection(const char *json, char *out, uint16_t len) {
  if (!out || len == 0) return false;
  if (extractObject(json, "\"app\"", out, len)) return true;
  if (len > 2) {
    strcpy(out, "{}");
  }
  return false;
}

} // namespace drivers::json
