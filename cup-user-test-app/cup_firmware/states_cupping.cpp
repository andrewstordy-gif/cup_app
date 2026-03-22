#include "drivers_nfc.h"
#include "drivers_battery.h"
#include "drivers_temp_sensor.h"
#include <Arduino.h>
#include "states_cupping.h"
#include "drivers_led.h"

#include "config.h"
#include "drivers_power.h"

extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;

static uint32_t lastSeconds = UINT32_MAX;
static float t = 0;

namespace states::cupping {

void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::CUPPING;

  // swich off the led
  drivers::led::begin();
  drivers::led::off();

  // start the temp and battery sensing paths
  drivers::temp::begin();
  drivers::battery::begin();
  t = drivers::temp::read();
  gStatus.temp = (uint16_t)(t * 10.0f);

  const float v = drivers::battery::readVoltage();
  gStatus.battery = drivers::battery::estimatePercent(v);

  // publish the initial cupping state/status to the tag
  drivers::nfc::runStage1(gState, gStatus, gSettings);

  // start the RTC for cupping timing
  drivers::power::rtcStart();
}

CupState run() {
  // 1s ON / 1s OFF when above maxCupTemp, otherwise stay dark.
  // Choose the lighter sleep mode while the LED is actively blinking.
  if ((gStatus.temp / 10) > gSettings.maxCupTemp) {
    uint32_t secondsNow = drivers::power::rtcTicks250() / 4;
    if ((secondsNow % 2) == 0) {
      drivers::led::on();
    } else {
      drivers::led::off();
    }
    drivers::power::enterIdleSleepNfcRtcWake();
  } else {
    drivers::led::off();
    drivers::power::enterStandbySleepNfcRtcWake();
  }

  // ----- Timekeeping -----
  uint32_t ticks = drivers::power::rtcTicks250();
  uint32_t seconds = ticks / 4;
  gStatus.time = seconds;

  // Refresh temperature once per second.
  if (seconds != lastSeconds) {
    lastSeconds = seconds;
    t = drivers::temp::read();
    gStatus.temp = (uint16_t)(t * 10.0f);
  }

  // ----- NFC handling with lockout -----
  drivers::power::applyNfcLockout();

  // Publish fresh cup-owned records when NFC wakes the cup.
  if (drivers::power::wakeReason == drivers::power::WakeReason::Nfc) {
    drivers::led::off();
    drivers::nfc::runStage1(gState, gStatus, gSettings);
  }

  // Read back the requested next state after the phone's lockout window ends.
  if (drivers::power::nfcLockoutJustEnded()) {
    drivers::nfc::runStage2(gState, nullptr);
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

}  // namespace states::cupping
