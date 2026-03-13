#pragma once

#include <stdint.h>

namespace drivers::json {

// Dedicated buffers for each JSON record.
extern char stateBuf[32];
extern char statusBuf[96];
extern char settingsBuf[160];  // grew a bit for the extra field

//
// State JSON (NDEF Text 1)
//
struct State {
  uint8_t state;  // on-wire key: "s" (0 = OFF, 1 = READY, 2 = BREWING, 3 = CUPPING, 4 = LOW_BATTERY)
};

void        initState(State &s);
const char* encodeState(const State &s);
bool        decodeState(const char *json, State &s);


//
// Status JSON (NDEF Text 2)
//
struct Status {
  uint16_t temp;     // on-wire key: "t" (x10)
  uint16_t time;     // on-wire key: "m" (seconds since pour)
  uint8_t  battery;  // on-wire key: "b" (0-100)
  char     uuid[17]; // on-wire key: "u" (ST25DV UID, 16 hex chars + null)
};

void        initStatus(Status &s);
const char* encodeStatus(const Status &s);


//
// Settings JSON (NDEF Text 3)
//
struct Settings {
  uint8_t  triggerTemp;   // on-wire key: "r"
  uint8_t  maxStartTemp;  // on-wire key: "a"
  uint16_t brewTime;      // on-wire key: "w"
  uint8_t  maxCupTemp;    // on-wire key: "c"
  uint16_t maxTime;       // on-wire key: "x"
  uint8_t  ledBrightness; // on-wire key: "l" (0-255)
};

void        initSettings(Settings &s);
const char* encodeSettings(const Settings &s);
bool        decodeSettings(const char *json, Settings &s);

} // namespace drivers::json
