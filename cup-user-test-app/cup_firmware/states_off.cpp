// states_off.cpp

#include "drivers_power.h"
#include "drivers_battery.h"
#include "drivers_temp_sensor.h"
#include <Arduino.h>
#include "states_off.h"
#include "states_fsm.h"
#include "drivers_nfc.h"
#include "drivers_led.h"
#include "drivers_json.h"

extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;

namespace states::off {

static void printCsvU16(const uint16_t *values, uint8_t count)
{
  for (uint8_t i = 0; i < count; ++i) {
    if (i) Serial.write(',');
    Serial.print(values[i]);
  }
}

void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::OFF;

  // sets the time back to 0:
  gStatus.time = 0;
}

CupState run() {

  const unsigned long t0 = millis();

  drivers::nfc::begin();
  const bool begin1Ok = drivers::nfc::lastWriteCupFailCode() == drivers::nfc::WriteCupFailNone;
  const unsigned long t1 = millis();

  const bool rfOff1Ok = drivers::nfc::disableRfAccess();
  const unsigned long t2 = millis();

  drivers::temp::begin();
  const float t = drivers::temp::read();
  gStatus.temp = t * 10;
  const unsigned long t3 = millis();

  drivers::battery::begin();
  const float v = drivers::battery::readVoltage();
  gStatus.battery = drivers::battery::estimatePercent(v);
  const unsigned long t4 = millis();

  const bool writeOk = rfOff1Ok && drivers::nfc::writeCupRecords(gState, gStatus, gSettings);
  const uint8_t writeFailCode = drivers::nfc::lastWriteCupFailCode();
  const unsigned long t5 = millis();

  const bool rfOn1Ok = rfOff1Ok ? drivers::nfc::enableRfAccess() : false;
  const unsigned long t6 = millis();

  drivers::nfc::end();
  const unsigned long t7 = millis();

  drivers::power::sleepLockoutMs(5000);
  const unsigned long t8 = millis();

  drivers::nfc::begin();
  const bool begin2Ok = drivers::nfc::lastWriteCupFailCode() == drivers::nfc::WriteCupFailNone;
  const unsigned long t9 = millis();

  if (begin2Ok) {
    drivers::nfc::waitForRfIdle();
  }
  const unsigned long t9a = millis();

  const bool rfOff2Ok = drivers::nfc::disableRfAccess();
  const unsigned long t10 = millis();

  const bool stateOk = rfOff2Ok && drivers::nfc::readState(gState);
  const unsigned long t11 = millis();

  const bool settingsOk = rfOff2Ok && drivers::nfc::readSettings(gSettings);
  const unsigned long t12 = millis();

  const bool rfOn2Ok = rfOff2Ok ? drivers::nfc::enableRfAccess() : false;
  const unsigned long t13 = millis();

  drivers::nfc::end();
  const unsigned long t14 = millis();

  const uint16_t timings[] = {
    (uint16_t)(t1 - t0),
    (uint16_t)(t2 - t1),
    (uint16_t)(t3 - t2),
    (uint16_t)(t4 - t3),
    (uint16_t)(t5 - t4),
    (uint16_t)(t6 - t5),
    (uint16_t)(t7 - t6),
    (uint16_t)(t8 - t7),
    (uint16_t)(t9 - t8),
    (uint16_t)(t9a - t9),
    (uint16_t)(t10 - t9a),
    (uint16_t)(t11 - t10),
    (uint16_t)(t12 - t11),
    (uint16_t)(t13 - t12),
    (uint16_t)(t14 - t13),
  };

  const uint8_t session1Mask =
      (begin1Ok ? 0x01 : 0) |
      (rfOff1Ok ? 0x02 : 0) |
      (writeOk ? 0x04 : 0) |
      (rfOn1Ok ? 0x08 : 0);
  const uint8_t session2Mask =
      (begin2Ok ? 0x01 : 0) |
      (rfOff2Ok ? 0x02 : 0) |
      (stateOk ? 0x04 : 0) |
      (settingsOk ? 0x08 : 0) |
      (rfOn2Ok ? 0x10 : 0);

  Serial.swap();
  Serial.begin(9600);
  delay(100);
  Serial.print("off2,");
  printCsvU16(timings, sizeof(timings) / sizeof(timings[0]));
  Serial.write(',');
  Serial.print(session1Mask);
  Serial.write(',');
  Serial.print(session2Mask);
  Serial.write(',');
  Serial.print(writeFailCode);
  Serial.println();
  Serial.flush();

  if (gState.state == 1) return CupState::READY;
  if (gState.state == 2) return CupState::BREWING;
  if (gState.state == 3) return CupState::CUPPING;
  if (gState.state == 4) return CupState::LOW_BATTERY;

  drivers::power::enterDeepSleepNfcWake();

  return CupState::OFF;
}

void exit() {
}

}
