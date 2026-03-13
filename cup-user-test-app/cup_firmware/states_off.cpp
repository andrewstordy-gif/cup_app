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

  //read the temp:
  drivers::temp::begin();
  float t = drivers::temp::read();  // °C
  gStatus.temp = t * 10;            // store as ×10, update gStatus

  // read the battery:
  drivers::battery::begin();
  float v = drivers::battery::readVoltage();               // read the battery voltage
  gStatus.battery = drivers::battery::estimatePercent(v);  //store the battery

  //switch the LED on:
  drivers::led::begin();
  drivers::led::on();

  //write the cup records:
  drivers::nfc::begin();
  drivers::nfc::writeCupRecords(gState, gStatus, gSettings);
  drivers::nfc::end();

  //switch the LED off:
  drivers::led::begin();
  drivers::led::on();

  drivers::power::sleepLockoutMs(5000);  // wiat in sleep for 5 seconds (during this piriod the tag is scanned)

  //wake up and check if the status or settings have changed...

  //switch the LED on:
  drivers::led::begin();
  drivers::led::on();

  // Initialise NFC driver (powers tag, formats if needed)
  drivers::nfc::begin();

  // Read the state from the NFC tag and store in gState
  drivers::nfc::readState(gState);

  //read the Settings (record 3)
  drivers::nfc::readSettings(gSettings);
  drivers::nfc::end();

//switch the LED off:
  drivers::led::off();


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
