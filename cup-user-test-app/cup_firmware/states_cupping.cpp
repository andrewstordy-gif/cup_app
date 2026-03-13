#include "drivers_nfc.h"
#include "drivers_temp_sensor.h"
#include <Arduino.h>
#include "states_brewing.h"
#include "drivers_led.h"
#include "config.h"
#include "drivers_power.h"

extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;

static uint32_t lastSeconds = UINT32_MAX;


namespace states::cupping {

void enter() {

  // sets the current state:
  gState.state = (uint8_t)CupState::CUPPING;

  // write the state to the tag:
  drivers::nfc::begin();
  drivers::nfc::writeCupRecords(gState, gStatus, gSettings);

  //swich off the led
  drivers::led::begin();
  drivers::led::off();

  // start the temp sensor
  drivers::temp::begin();
}
CupState run() {

  // ----- Timekeeping -----
  uint32_t ticks = drivers::power::rtcTicks250();
  uint32_t seconds = ticks / 4;
  gStatus.time = seconds;

  // 1s ON / 1s OFF when above maxCupTemp
  if ((gStatus.temp / 10) > gSettings.maxCupTemp) {

    if ((seconds % 2) == 0) {
      drivers::led::on();  // even second
    } else {
      drivers::led::off();  // odd second
    }

    // Idle sleep
    drivers::power::enterIdleSleepNfcRtcWake();

  } else {
    drivers::led::off();
    // Stanby sleep
    drivers::power::enterStandbySleepNfcRtcWake();
  }

  // ----- Print once per second -----
  
  //keep seconds:
  if (seconds != lastSeconds) {
    lastSeconds = seconds;

 // // ----- Read temp -----
  float t = drivers::temp::read();
  gStatus.temp = (uint16_t)(t * 10.0f);
  }

  // ----- NFC handling with lockout -----
  drivers::power::applyNfcLockout();

 // actions that hapen when the lockout ends
  if (drivers::power::nfcLockoutJustEnded()) {
   
   // the state is read from the NFC chip
    drivers::nfc::readState(gState);

  }

// actions that happen whent the cup wakes up.
  if (drivers::power::wakeReason == drivers::power::WakeReason::Nfc) {

    drivers::led::on();
    drivers::nfc::writeCupRecords(gState, gStatus, gSettings);
    drivers::led::off();
   
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
}