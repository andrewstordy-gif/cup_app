#include <Arduino.h>
#include "drivers_battery.h"
#include "config.h"

// Using your chosen resistors:
// R1 = 1 MΩ (top), R2 = 330 kΩ (bottom)
// Arduino 2 = PA6  → low-side switch (divider to GND)
// Arduino 3 = PA7  → ADC input


namespace drivers::battery {

void begin()
{
  // Use internal 1.1 V reference
  analogReference(INTERNAL1V1);

  // Divider off initially
  pinMode(BATT_GND_PIN,   INPUT); // hi-Z
  pinMode(BATT_SENSE_PIN, INPUT);
}

float readVoltage()
{
  // 1) Enable divider: PA6 -> GND
  pinMode(BATT_GND_PIN, OUTPUT);
  digitalWrite(BATT_GND_PIN, LOW);

  // 2) ADC input on PA7
  pinMode(BATT_SENSE_PIN, INPUT);

  delay(2); // settle

  int raw = analogRead(BATT_SENSE_PIN); // 0..1023 with Vref = 1.1 V

  // 3) Disable divider to save power
  pinMode(BATT_GND_PIN, INPUT); // hi-Z again

  // Node voltage at PA7
  float v_node = (raw * ADC_VREF_VOLTS) / ADC_MAX_COUNT;

  // Battery voltage via divider gain
  float v_bat = v_node * BATT_GAIN;
  return v_bat;
}

uint8_t estimatePercent(float vBat)
{
 

  if (vBat <= V_EMPTY) return 0;
  if (vBat >= V_FULL)  return 100;

  float p = (vBat - V_EMPTY) / (V_FULL - V_EMPTY); // 0..1
  uint8_t pct = (uint8_t)(p * 100.0f + 0.5f);
  return pct;
}

} // namespace drivers::battery
