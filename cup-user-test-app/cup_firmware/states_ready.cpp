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

namespace states::ready {
void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::READY;
}


CupState run() {
  drivers::nfc::runStage1(gState, gStatus, gSettings);
  drivers::power::sleepLockoutMs(5000);
  drivers::nfc::runStage2(gState, &gSettings);


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
