#pragma once

#include <stdint.h>

namespace drivers::power {

enum class WakeReason : uint8_t { None,
                                  Rtc,
                                  Nfc,
                                  Temp };

extern volatile WakeReason wakeReason;

// Lockout Ended (used for markig the end of a lockout)
 bool nfcLockoutJustEnded();   // returns true once when lockout ends

// Optional: if you want to read time from power driver
uint32_t rtcTicks250();  // 250 ms ticks
uint32_t rtcSeconds();   // ticks/4
uint32_t nfcIgnoreUntilSeconds();

void rtcStart();  // start RTC from external 32.768kHz crystal (250 ms overflow)

// Existing deep sleep entry points
void enterDeepSleepNfcWake();
void enterDeepSleepNfcTempWake();

// New: RTC-based sleep entry points (wake on RTC OR NFC)
void enterIdleSleepNfcRtcWake();     // IDLE sleep (for PWM/“con LED” style)
void enterStandbySleepNfcRtcWake();  // STANDBY sleep (“sin LED” style)

//enable periferals needed for PWM
void enablePwm();  // re-enable whatever analogWrite needs

// sleep lockout
void sleepLockoutMs(uint16_t ms);

//nfc lockout
void applyNfcLockout();






}  // namespace drivers::power
