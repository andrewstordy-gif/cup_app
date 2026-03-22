// states_brewing.cpp

#include "drivers_nfc.h"
#include "drivers_battery.h"
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
static float t = 0;

namespace states::brewing {

void enter() {
  // sets the current state:
  gState.state = (uint8_t)CupState::BREWING;

  // swich on the led
  drivers::led::begin();
  drivers::led::on();

  // start the temp and battery sensing paths
  drivers::temp::begin();
  drivers::battery::begin();
  t = drivers::temp::read();
  gStatus.temp = (uint16_t)(t * 10.0f);

  const float v = drivers::battery::readVoltage();
  gStatus.battery = drivers::battery::estimatePercent(v);

  // publish the initial brewing state/status to the tag
  drivers::nfc::runStage1(gState, gStatus, gSettings);

  // start the RTC
  drivers::power::rtcStart();
}

CupState run() {
  // Sleep until RTC (250 ms) or NFC
  drivers::power::enterIdleSleepNfcRtcWake();

  // ----- Timekeeping -----
  uint32_t ticks = drivers::power::rtcTicks250();
  uint32_t seconds = ticks / 4;
  gStatus.time = seconds;

  // keep seconds:
  if (seconds != lastSeconds) {
    lastSeconds = seconds;
    t = drivers::temp::read();
  }

  // error flashing if the temp exceeds max start
  bool blinkOn = (drivers::power::rtcTicks250() & 1);  // toggles every tick (250ms)

  if (t > gSettings.maxStartTemp) {
    if (blinkOn) drivers::led::on();
    else drivers::led::off();
  } else {
    drivers::led::on();
  }

  // ----- NFC handling with lockout -----
  drivers::power::applyNfcLockout();

  // actions that happen when the cup wakes up on NFC:
  if (drivers::power::wakeReason == drivers::power::WakeReason::Nfc) {
    drivers::led::off();
    drivers::nfc::runStage1(gState, gStatus, gSettings);
    drivers::led::on();
  }

  // actions that happen when the NFC lockout ends:
  if (drivers::power::nfcLockoutJustEnded()) {
    drivers::led::off();
    drivers::nfc::runStage2(gState, nullptr);
    drivers::led::on();
  }

  // ----- State transitions -----
  if (gState.state == 0) return CupState::OFF;
  if (gState.state == 1) return CupState::READY;
  if (gState.state == 3) return CupState::CUPPING;
  if (gState.state == 4) return CupState::LOW_BATTERY;
  if (seconds >= gSettings.brewTime) return CupState::CUPPING;

  return CupState::BREWING;
}

void exit() {}

}  // namespace states::brewing
