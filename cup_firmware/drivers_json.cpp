#include "drivers_json.h"

#include <string.h>
#include <ctype.h>
#include <stdio.h>
#include "config.h"

namespace drivers::json {

char stateBuf[32];
char statusBuf[96];
char settingsBuf[160];

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
  const char *p = findKeyValue(json, "state");
  if (!p) p = findKeyValue(json, "s");
  if (!p || !parseUint(p, v)) return false;
  if (v > 4u) return false;
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
  const char *p;

  p = findKeyValue(json, "triggerTemp");
  if (!p) p = findKeyValue(json, "r");
  if (p && parseUint(p, v)) s.triggerTemp = (uint8_t)v;

  p = findKeyValue(json, "maxStartTemp");
  if (!p) p = findKeyValue(json, "a");
  if (p && parseUint(p, v)) s.maxStartTemp = (uint8_t)v;

  p = findKeyValue(json, "brewTime");
  if (!p) p = findKeyValue(json, "w");
  if (p && parseUint(p, v)) s.brewTime = (uint16_t)v;

  p = findKeyValue(json, "maxCupTemp");
  if (!p) p = findKeyValue(json, "c");
  if (p && parseUint(p, v)) s.maxCupTemp = (uint8_t)v;

  p = findKeyValue(json, "maxTime");
  if (!p) p = findKeyValue(json, "x");
  if (p && parseUint(p, v)) s.maxTime = (uint16_t)v;

  p = findKeyValue(json, "ledBrightness");
  if (!p) p = findKeyValue(json, "l");
  if (p && parseUint(p, v)) s.ledBrightness = (uint8_t)v;

  return true;
}

} // namespace drivers::json
