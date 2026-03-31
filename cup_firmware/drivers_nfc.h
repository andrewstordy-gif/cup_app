#pragma once

#include "drivers_json.h"

namespace drivers::nfc {

enum WriteCupFailCode : uint8_t {
  WriteCupFailNone = 0,
  WriteCupFailTagNotInitialised = 1,
  WriteCupFailRfDisable = 2,
  WriteCupFailUidRead = 3,
  WriteCupFailRecord4Read = 4,
  WriteCupFailWriteAllRecords = 5,
  WriteCupFailRfEnable = 6,
};

struct Stage1Result {
  uint8_t mask;
  uint8_t failCode;
};

struct Stage2Result {
  uint8_t mask;
};

void begin();
void end();
bool disableRfAccess();
bool enableRfAccess();
void waitForRfIdle();

bool writeCupRecords(
  const drivers::json::State    &state,
  const drivers::json::Status   &status,
  const drivers::json::Settings &settings
);

bool writeBootstrapRecords(
  const drivers::json::State    &state,
  const drivers::json::Status   &status,
  const drivers::json::Settings &settings
);

Stage1Result runStage1(
  drivers::json::State    &state,
  drivers::json::Status   &status,
  const drivers::json::Settings &settings
);

Stage2Result runStage2(
  drivers::json::State    &state,
  drivers::json::Settings *settings
);

uint8_t lastWriteCupFailCode();

bool readSettings(drivers::json::Settings &settings);
bool readState (drivers::json::State  &state);

} // namespace drivers::nfc
