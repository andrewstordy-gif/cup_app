#pragma once

#include "drivers_json.h"

namespace drivers::nfc {

void begin();
void end();

bool writeCupRecords(
  const drivers::json::State    &state,
  const drivers::json::Status   &status,
  const drivers::json::Settings &settings
);

bool readSettings(drivers::json::Settings &settings);
bool readState (drivers::json::State  &state);
bool readStatus(drivers::json::Status &status);

} // namespace drivers::nfc
