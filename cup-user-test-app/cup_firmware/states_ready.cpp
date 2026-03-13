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

//extern volatile drivers::power::WakeReason wakeReason;

namespace states::ready {
void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::READY;
}


CupState run() {

  // publish fresh status
  drivers::temp::begin();
  float t = drivers::temp::read();
  gStatus.temp = (uint16_t)(t * 10.0f);

  drivers::battery::begin();
  float v = drivers::battery::readVoltage();
  gStatus.battery = drivers::battery::estimatePercent(v);

  drivers::nfc::writeCupRecords(gState, gStatus, gSettings);

  //1st blink:
  drivers::led::begin();
  drivers::led::on();
  delay(1000);
  drivers::led::off();
  delay(1000);

  // allow phone to write
  drivers::power::sleepLockoutMs(5000);

  // read latest app values
  drivers::nfc::readState(gState);
  drivers::nfc::readSettings(gSettings);

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
