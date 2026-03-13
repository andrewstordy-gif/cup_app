#pragma once

#include <stdint.h>

namespace drivers::json {

// Dedicated buffers for JSON sections and the full single-record payload.
extern char stateBuf[32];
extern char statusBuf[96];
extern char settingsBuf[160];  // grew a bit for the extra field
extern char singleRecordBuf[768];
extern char appBuf[384];

// ctrl section
struct State {
  uint8_t state;  // on-wire key: ctrl.s (0 = OFF, 1 = READY, 2 = BREWING, 3 = CUPPING, 4 = LOW_BATTERY)
};

void        initState(State &s);
const char* encodeState(const State &s);
bool        decodeState(const char *json, State &s);


// status section
struct Status {
  uint16_t temp;     // on-wire key: status.t (x10)
  uint16_t time;     // on-wire key: status.m (seconds since pour)
  uint8_t  battery;  // on-wire key: status.b (0-100)
  char     uuid[17]; // on-wire key: status.u (ST25DV UID, 16 hex chars + null)
};

void        initStatus(Status &s);
const char* encodeStatus(const Status &s);
bool        decodeStatus(const char *json, Status &s);


// settings section
struct Settings {
  uint8_t  triggerTemp;   // on-wire key: settings.r
  uint8_t  maxStartTemp;  // on-wire key: settings.a
  uint16_t brewTime;      // on-wire key: settings.w
  uint8_t  maxCupTemp;    // on-wire key: settings.c
  uint16_t maxTime;       // on-wire key: settings.x
  uint8_t  ledBrightness; // on-wire key: settings.l (0-255)
};

void        initSettings(Settings &s);
const char* encodeSettings(const Settings &s);
bool        decodeSettings(const char *json, Settings &s);

const char* encodeRecord(
  const State &state,
  const Status &status,
  const Settings &settings,
  const char *appJson
);
bool extractAppSection(const char *json, char *out, uint16_t len);

} // namespace drivers::json
