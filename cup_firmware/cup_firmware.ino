
#include <Arduino.h>
#include "config.h"
#include "drivers_power.h"
#include "drivers_led.h"
#include "states_fsm.h"
#include "drivers_json.h"
#include "drivers_nfc.h"

// Global structs as in your firmware
drivers::json::State gState;
drivers::json::Status gStatus;
drivers::json::Settings gSettings;

void setup() {

  // Initialise JSON defaults
  drivers::json::initState(gState);
  drivers::json::initStatus(gStatus);
  drivers::json::initSettings(gSettings);


  //set the defaults for the settings"
  gSettings.triggerTemp = DEFAULT_TRIGGER_TEMP;
  gSettings.maxStartTemp = DEFAULT_MAX_START_TEMP;
  gSettings.brewTime = DEFAULT_BREW_TIME;
  gSettings.maxCupTemp = DEFAULT_MAX_CUP_TEMP;
  gSettings.maxTime = DEFAULT_MAX_TIME;
  gSettings.ledBrightness = DEFAULT_LED_BRIGHTNESS;


  //write then to the NFC:
  drivers::nfc::begin();
  const bool rfOffOk = drivers::nfc::disableRfAccess();
  if (rfOffOk) {
    drivers::nfc::writeBootstrapRecords(gState, gStatus, gSettings);
    drivers::nfc::enableRfAccess();
  }
  drivers::nfc::end();

  //Set the inital state as off
  states::fsm::init(CupState::OFF);
}

void loop() {

  //drivers::led::on();
  states::fsm::run();
  delay(10);
}
