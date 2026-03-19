// ready state

#include "drivers_power.h"
#include "drivers_battery.h"
#include "drivers_temp_sensor.h"
#include <Arduino.h>
#include "states_off.h"
#include "states_fsm.h"
#include "drivers_nfc.h"
#include "drivers_led.h"
#include "drivers_json.h"
#include "config.h"


extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;

// Helper for printing the fixed-width timing/debug CSV line.
static void printCsvU16(const uint16_t *values, uint8_t count) {
  for (uint8_t i = 0; i < count; ++i) {
    if (i) Serial.write(',');
    Serial.print(values[i]);
  }
}


//extern volatile drivers::power::WakeReason wakeReason;

namespace states::ready {
void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::READY;
}


CupState run() {

  const unsigned long t0 = millis();

  //begin NFC
  drivers::nfc::begin();

  // begin() stores its own failure code, so capture whether it came up cleanly.
  const bool begin1Ok = drivers::nfc::lastWriteCupFailCode() == drivers::nfc::WriteCupFailNone;
  const unsigned long t1 = millis();


  // Turn RF off for the first session so the cup fully owns the tag.
  const bool rfOff1Ok = drivers::nfc::disableRfAccess();
  const unsigned long t2 = millis();



  // Sample the live sensors that feed the cup-owned records.
  drivers::temp::begin();
  const float t = drivers::temp::read();
  gStatus.temp = t * 10;
  const unsigned long t3 = millis();

  drivers::battery::begin();
  const float v = drivers::battery::readVoltage();
  gStatus.battery = drivers::battery::estimatePercent(v);
  const unsigned long t4 = millis();

 // Rewrite NDEF 1/2/3 while preserving app-owned NDEF 4.
  const bool writeOk = rfOff1Ok && drivers::nfc::writeCupRecords(gState, gStatus, gSettings);
  const uint8_t writeFailCode = drivers::nfc::lastWriteCupFailCode();



  const unsigned long t5 = millis();

  // Re-enable RF so the phone can see and use the updated tag contents.
  const bool rfOn1Ok = rfOff1Ok ? drivers::nfc::enableRfAccess() : false;


  const unsigned long t6 = millis();

  drivers::nfc::end();
  const unsigned long t7 = millis();


  // Give the phone a fixed window to read/write while RF is enabled.
  drivers::power::sleepLockoutMs(5000);
  const unsigned long t8 = millis();


 // Session 2: come back after the phone window and read the app-owned values
  // back into firmware runtime state.
  drivers::nfc::begin();
  const bool begin2Ok = drivers::nfc::lastWriteCupFailCode() == drivers::nfc::WriteCupFailNone;
  const unsigned long t9 = millis();

  // Wait for RF activity to stop before stealing ownership back from the phone.
  if (begin2Ok) {
    drivers::nfc::waitForRfIdle();
  }
  const unsigned long t9a = millis();

  // Once RF is quiet, disable it again and read the tag over I2C.
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

//debug printouts:
// one stage of the two-session OFF transaction.
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
    (begin2Ok ? 0x01 : 0) | (rfOff2Ok ? 0x02 : 0) | (stateOk ? 0x04 : 0) | (settingsOk ? 0x08 : 0) | (rfOn2Ok ? 0x10 : 0);

  Serial.swap();
  Serial.begin(9600);
  delay(100);
  Serial.print("ready2,");
  printCsvU16(timings, sizeof(timings) / sizeof(timings[0]));
  Serial.write(',');
  Serial.print(session1Mask);
  Serial.write(',');
  Serial.print(session2Mask);
  Serial.write(',');
  Serial.print(writeFailCode);
  Serial.println();
  Serial.flush();










  // // act on requested state
  if (gState.state == 0) return CupState::OFF;
  if (gState.state == 2) return CupState::BREWING;
  if (gState.state == 3) return CupState::CUPPING;
  if (gState.state == 4) return CupState::LOW_BATTERY;

  //set up the temp interupt.

  // otherwise sleep and use wake reason to decide
  drivers::power::enterDeepSleepNfcTempWake();

  if (drivers::power::wakeReason == drivers::power::WakeReason::Temp) { return CupState::BREWING; }

  return CupState::READY;  // default / NFC / unknown
}


void exit() {
  //nothing here
}
}
