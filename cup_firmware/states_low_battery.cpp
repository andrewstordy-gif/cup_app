// states_low_battery.cpp

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

namespace states::low_battery {

void enter() {
  gState.state = (uint8_t)CupState::LOW_BATTERY;
  gStatus.time = 0;
}

CupState run() {
  drivers::power::enterDeepSleepNfcWake();

  if (drivers::power::wakeReason != drivers::power::WakeReason::Nfc) {
    return CupState::LOW_BATTERY;
  }

  drivers::nfc::runStage1(gState, gStatus, gSettings);
  drivers::power::sleepLockoutMs(5000);
  drivers::nfc::runStage2(gState, nullptr);

  if (gState.state == 1) return CupState::READY;
  if (gState.state == 2) return CupState::BREWING;
  if (gState.state == 3) return CupState::CUPPING;
  if (gState.state == 4) return CupState::LOW_BATTERY;

  return CupState::LOW_BATTERY;
}

void exit() {
}

}
