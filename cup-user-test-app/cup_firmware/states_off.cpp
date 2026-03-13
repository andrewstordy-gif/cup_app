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
  // OFF is a true low-power state. Sleep until the ST25 NFC interrupt wakes us.
  drivers::led::begin();
  drivers::led::off();
  drivers::power::enterDeepSleepNfcWake();

  // When woken by NFC, refresh internal measurements and then inspect the tag
  // for requested state/settings changes.
  if (drivers::power::wakeReason == drivers::power::WakeReason::Nfc) {
    drivers::temp::begin();
    float t = drivers::temp::read();
    gStatus.temp = (uint16_t)(t * 10.0f);

    drivers::battery::begin();
    float v = drivers::battery::readVoltage();
    gStatus.battery = drivers::battery::estimatePercent(v);

    drivers::nfc::readState(gState);
    drivers::nfc::readSettings(gSettings);
  }


  // act on requested state
  if (gState.state == 1) return CupState::READY;
  if (gState.state == 2) return CupState::BREWING;
  if (gState.state == 3) return CupState::CUPPING;
  if (gState.state == 4) return CupState::LOW_BATTERY;

  drivers::power::enterDeepSleepNfcWake();  // go to sleep //

  return CupState::OFF;
}



void exit() {
}

}
