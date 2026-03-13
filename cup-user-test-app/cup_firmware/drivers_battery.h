#pragma once

#include <stdint.h>
#include "config.h"

namespace drivers::battery {

  // Call once at startup (after Serial.swap / Serial.begin).
  // Sets ADC reference to INTERNAL1V1 and disables the divider.
  void begin();

  // Measure battery voltage in volts.
  // Uses Arduino pin 2 (PA6) as low-side switch and pin 3 (PA7) as ADC input.
  float readVoltage();

  // Optional helper: map voltage to 0–100 % (simple linear estimate).
  uint8_t estimatePercent(float vBat);

} // namespace drivers::battery
