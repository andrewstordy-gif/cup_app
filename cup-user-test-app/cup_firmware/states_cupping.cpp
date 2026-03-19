#include "drivers_nfc.h"
#include "drivers_battery.h"
#include "drivers_temp_sensor.h"
#include <Arduino.h>
#include "states_cupping.h"
#include "drivers_led.h"

#include "config.h"
#include "drivers_power.h"

extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;

static uint32_t lastSeconds = UINT32_MAX;
static float t = 0;

namespace states::cupping {

static void printCsvU16(const uint16_t *values, uint8_t count) {
  for (uint8_t i = 0; i < count; ++i) {
    if (i) Serial.write(',');
    Serial.print(values[i]);
  }
}

void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::CUPPING;

  // swich off the led
  drivers::led::begin();
  drivers::led::off();

  // start the temp and battery sensing paths
  drivers::temp::begin();
  drivers::battery::begin();
  t = drivers::temp::read();
  gStatus.temp = (uint16_t)(t * 10.0f);

  const float v = drivers::battery::readVoltage();
  gStatus.battery = drivers::battery::estimatePercent(v);

  // publish the initial cupping state/status to the tag
  drivers::nfc::begin();
  const bool rfOffOk = drivers::nfc::disableRfAccess();
  if (rfOffOk) {
    drivers::nfc::writeCupRecords(gState, gStatus, gSettings);
    drivers::nfc::enableRfAccess();
  }
  drivers::nfc::end();

  // start the RTC for cupping timing
  drivers::power::rtcStart();
}

CupState run() {
  unsigned long t0 = 0;
  unsigned long t1 = 0;
  unsigned long t2 = 0;
  unsigned long t3 = 0;
  unsigned long t4 = 0;
  unsigned long t5 = 0;
  unsigned long t6 = 0;
  unsigned long t7 = 0;
  unsigned long t8 = 0;
  unsigned long t9 = 0;
  unsigned long t9a = 0;
  unsigned long t10 = 0;
  unsigned long t11 = 0;
  unsigned long t12 = 0;
  unsigned long t13 = 0;
  unsigned long t14 = 0;

  bool begin1Ok = false;
  bool rfOff1Ok = false;
  bool writeOk = false;
  bool rfOn1Ok = false;
  bool begin2Ok = false;
  bool rfOff2Ok = false;
  bool stateOk = false;
  bool rfOn2Ok = false;
  uint8_t writeFailCode = drivers::nfc::WriteCupFailNone;
  bool shouldPrintDebug = false;

  // 1s ON / 1s OFF when above maxCupTemp, otherwise stay dark.
  // Choose the lighter sleep mode while the LED is actively blinking.
  if ((gStatus.temp / 10) > gSettings.maxCupTemp) {
    uint32_t secondsNow = drivers::power::rtcTicks250() / 4;
    if ((secondsNow % 2) == 0) {
      drivers::led::on();
    } else {
      drivers::led::off();
    }
    drivers::power::enterIdleSleepNfcRtcWake();
  } else {
    drivers::led::off();
    drivers::power::enterStandbySleepNfcRtcWake();
  }

  // ----- Timekeeping -----
  uint32_t ticks = drivers::power::rtcTicks250();
  uint32_t seconds = ticks / 4;
  gStatus.time = seconds;

  // Refresh temperature once per second.
  if (seconds != lastSeconds) {
    lastSeconds = seconds;
    t = drivers::temp::read();
    gStatus.temp = (uint16_t)(t * 10.0f);
  }

  // ----- NFC handling with lockout -----
  drivers::power::applyNfcLockout();

  // Publish fresh cup-owned records when NFC wakes the cup.
  if (drivers::power::wakeReason == drivers::power::WakeReason::Nfc) {
    shouldPrintDebug = true;
    drivers::led::off();

    t0 = millis();
    drivers::nfc::begin();
    begin1Ok = drivers::nfc::lastWriteCupFailCode() == drivers::nfc::WriteCupFailNone;
    t1 = millis();

    rfOff1Ok = drivers::nfc::disableRfAccess();
    t2 = millis();

    if (rfOff1Ok) {
      t = drivers::temp::read();
      gStatus.temp = (uint16_t)(t * 10.0f);
      t3 = millis();

      const float v = drivers::battery::readVoltage();
      gStatus.battery = drivers::battery::estimatePercent(v);
      t4 = millis();

      writeOk = drivers::nfc::writeCupRecords(gState, gStatus, gSettings);
      writeFailCode = drivers::nfc::lastWriteCupFailCode();
      t5 = millis();

      rfOn1Ok = drivers::nfc::enableRfAccess();
      t6 = millis();
    } else {
      t3 = t2;
      t4 = t3;
      t5 = t4;
      t6 = t5;
      writeFailCode = drivers::nfc::lastWriteCupFailCode();
    }

    drivers::nfc::end();
    t7 = millis();
  }

  // Read back the requested next state after the phone's lockout window ends.
  if (drivers::power::nfcLockoutJustEnded()) {
    shouldPrintDebug = true;

    t8 = millis();
    drivers::nfc::begin();
    begin2Ok = drivers::nfc::lastWriteCupFailCode() == drivers::nfc::WriteCupFailNone;
    t9 = millis();

    if (begin2Ok) {
      drivers::nfc::waitForRfIdle();
    }
    t9a = millis();

    rfOff2Ok = drivers::nfc::disableRfAccess();
    t10 = millis();

    stateOk = rfOff2Ok && drivers::nfc::readState(gState);
    t11 = millis();

    // Cupping only reads state in the second session.
    t12 = t11;

    rfOn2Ok = rfOff2Ok ? drivers::nfc::enableRfAccess() : false;
    t13 = millis();

    drivers::nfc::end();
    t14 = millis();
  }

  if (shouldPrintDebug) {
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
      (begin1Ok ? 0x01 : 0) | (rfOff1Ok ? 0x02 : 0) | (writeOk ? 0x04 : 0) | (rfOn1Ok ? 0x08 : 0);
    const uint8_t session2Mask =
      (begin2Ok ? 0x01 : 0) | (rfOff2Ok ? 0x02 : 0) | (stateOk ? 0x04 : 0) | (rfOn2Ok ? 0x10 : 0);

    Serial.swap();
    Serial.begin(9600);
    delay(100);
    Serial.print("cup2,");
    printCsvU16(timings, sizeof(timings) / sizeof(timings[0]));
    Serial.write(',');
    Serial.print(session1Mask);
    Serial.write(',');
    Serial.print(session2Mask);
    Serial.write(',');
    Serial.print(writeFailCode);
    Serial.println();
    Serial.flush();
  }

  // ----- State transitions -----
  if (gState.state == 0) return CupState::OFF;
  if (gState.state == 1) return CupState::READY;
  if (gState.state == 2) return CupState::BREWING;
  if (gState.state == 4) return CupState::LOW_BATTERY;
  if (seconds >= gSettings.maxTime) return CupState::OFF;

  return CupState::CUPPING;
}

void exit() {
  // nothing here
}

}  // namespace states::cupping
