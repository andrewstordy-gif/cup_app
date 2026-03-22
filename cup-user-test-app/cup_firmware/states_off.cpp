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

void enter() {

  // sets the current state:
  gState.state = (uint8_t)CupState::OFF;

  // sets the time back to 0:
  gStatus.time = 0;
}

CupState run() {
  drivers::nfc::runStage1(gState, gStatus, gSettings);
  drivers::power::sleepLockoutMs(5000);
  drivers::nfc::runStage2(gState, &gSettings);

  // Any state the phone wrote into NDEF1 during the phone window becomes the
  // next firmware state here.
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
