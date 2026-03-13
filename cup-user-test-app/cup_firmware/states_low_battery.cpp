// states_low_battery.cpp

#include "drivers_power.h"
#include "drivers_nfc.h"
#include <Arduino.h>
#include "states_low_battery.h"
#include "drivers_led.h"


extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;

namespace states::low_battery {
void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::LOW_BATTERY;

  // switch the LED on
  drivers::led::begin();
  drivers::led::on();

  //writes the state to NFC:
  drivers::nfc::writeCupRecords(gState, gStatus, gSettings);

  //switch the LED off:
  drivers::led::off();
}
CupState run() {


  // enters deep sleep.
  drivers::power::enterDeepSleepNfcWake();

  //wake up and wait 5000mS
  drivers::power::sleepLockoutMs(5000);

  // switch the LED on
  drivers::led::begin();
  drivers::led::on();

  // Read the state from the NFC tag and store in gState
  drivers::nfc::readState(gState);

  //switch the LED off:
  drivers::led::off();


  // act on requested state
  if (gState.state == 0) return CupState::OFF;
  if (gState.state == 1) return CupState::READY;
  if (gState.state == 2) return CupState::BREWING;
  if (gState.state == 3) return CupState::CUPPING;




  return CupState::LOW_BATTERY;
}
void exit() {
}
}
