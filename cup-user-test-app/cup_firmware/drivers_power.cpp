#include <Arduino.h>
#include <avr/sleep.h>
#include <avr/interrupt.h>
#include <Wire.h>

#include "config.h"
#include "drivers_power.h"
#include "drivers_nfc.h"
#include "drivers_temp_sensor.h"

namespace {

// ---------- Shared state ----------
static volatile uint32_t g_ticks250 = 0;

// NFC lockout (seconds, derived from crystal RTC)
static uint32_t g_nfcIgnoreUntil_s = 0;
static constexpr uint32_t NFC_LOCKOUT_S = 5;

static bool g_lockoutWasActive = false;
static bool g_lockoutJustEnded = false;

// ---------- Pin leakage helpers ----------

// Use for RTC-running modes (IDLE/STANDBY): crystal pins MUST be inputs, no pulls
static void pinsToLowLeakage_keepCrystal() {
  pinMode(LED2_PIN, OUTPUT);
  digitalWrite(LED2_PIN, LOW);
  pinMode(LED3_PIN, OUTPUT);
  digitalWrite(LED3_PIN, LOW);

  pinMode(BATT_GND_PIN, OUTPUT);
  digitalWrite(BATT_GND_PIN, LOW);
  pinMode(BATT_SENSE_PIN, OUTPUT);
  digitalWrite(BATT_SENSE_PIN, LOW);

  //pinMode(ST25DVLPD_PIN, OUTPUT); // not messing with these.
  // digitalWrite(ST25DVLPD_PIN, LOW);
  // pinMode(ST25DVPWR_PIN, OUTPUT);
  // digitalWrite(ST25DVPWR_PIN, HIGH);

  // Crystal pins MUST stay inputs, no pulls (RTC uses them)
  pinMode(TOSC2_PIN, INPUT);
  pinMode(TOSC1_PIN, INPUT);
  PORTB.PIN2CTRL = 0;
  PORTB.PIN3CTRL = 0;

  pinMode(SDA_PIN, INPUT);
  pinMode(SCL_PIN, INPUT);

  pinMode(NC1_PIN, OUTPUT);
  digitalWrite(NC1_PIN, LOW);

  pinMode(INT2_PIN, INPUT);  // external pulldown fitted
  pinMode(INT1_PIN, INPUT);  // external pullup fitted

  pinMode(NC2_PIN, OUTPUT);
  digitalWrite(NC2_PIN, LOW);

  pinMode(TX_PIN, OUTPUT);
  digitalWrite(TX_PIN, LOW);
  pinMode(RX_PIN, OUTPUT);
  digitalWrite(RX_PIN, LOW);

 pinMode(LED1_PIN, OUTPUT);
 digitalWrite(LED1_PIN, LOW);
}

// Use for RTC-running modes (IDLE/STANDBY): crystal pins MUST be inputs, no pulls
static void pinsToLowLeakage_keepCrystal_keepLEDs() {
  // pinMode(LED2_PIN, OUTPUT);
  // digitalWrite(LED2_PIN, LOW);
  // pinMode(LED3_PIN, OUTPUT);
  // digitalWrite(LED3_PIN, LOW);

  pinMode(BATT_GND_PIN, OUTPUT);
  digitalWrite(BATT_GND_PIN, LOW);
  pinMode(BATT_SENSE_PIN, OUTPUT);
  digitalWrite(BATT_SENSE_PIN, LOW);

  //pinMode(ST25DVLPD_PIN, OUTPUT); // not messing with these as want to avoid switching on and off NFC.
  //digitalWrite(ST25DVLPD_PIN, LOW);
 // pinMode(ST25DVPWR_PIN, OUTPUT);
  //digitalWrite(ST25DVPWR_PIN, HIGH);

  // Crystal pins MUST stay inputs, no pulls (RTC uses them)
  pinMode(TOSC2_PIN, INPUT);
  pinMode(TOSC1_PIN, INPUT);
  PORTB.PIN2CTRL = 0;
  PORTB.PIN3CTRL = 0;

  pinMode(SDA_PIN, INPUT);
  pinMode(SCL_PIN, INPUT);

  pinMode(NC1_PIN, OUTPUT);
  digitalWrite(NC1_PIN, LOW);

  pinMode(INT2_PIN, INPUT);  // external pulldown fitted
  pinMode(INT1_PIN, INPUT);  // external pullup fitted

  pinMode(NC2_PIN, OUTPUT);
  digitalWrite(NC2_PIN, LOW);

  pinMode(TX_PIN, OUTPUT);
  digitalWrite(TX_PIN, LOW);
  pinMode(RX_PIN, OUTPUT);
  digitalWrite(RX_PIN, LOW);

//  pinMode(LED1_PIN, OUTPUT);
//  digitalWrite(LED1_PIN, LOW);
}




// Use for POWER-DOWN: your measurement says TOSC pins as OUTPUT LOW reduces leakage <1uA
static void pinsToLowLeakage_powerDown() {
  pinMode(LED2_PIN, OUTPUT);
  digitalWrite(LED2_PIN, LOW);
  pinMode(LED3_PIN, OUTPUT);
  digitalWrite(LED3_PIN, LOW);

  pinMode(BATT_GND_PIN, OUTPUT);
  digitalWrite(BATT_GND_PIN, LOW);
  pinMode(BATT_SENSE_PIN, OUTPUT);
  digitalWrite(BATT_SENSE_PIN, LOW);

  pinMode(ST25DVLPD_PIN, OUTPUT);
  digitalWrite(ST25DVLPD_PIN, LOW);
  pinMode(ST25DVPWR_PIN, OUTPUT);
  digitalWrite(ST25DVPWR_PIN, HIGH);

  // POWER-DOWN: drive crystal pins low for lowest leakage (RTC is off here)
  pinMode(TOSC2_PIN, OUTPUT);
  digitalWrite(TOSC2_PIN, LOW);
  pinMode(TOSC1_PIN, OUTPUT);
  digitalWrite(TOSC1_PIN, LOW);

  pinMode(SDA_PIN, INPUT);
  pinMode(SCL_PIN, INPUT);

  pinMode(NC1_PIN, OUTPUT);
  digitalWrite(NC1_PIN, LOW);

  pinMode(INT2_PIN, INPUT);  // external pulldown fitted
  pinMode(INT1_PIN, INPUT);  // external pullup fitted

  pinMode(NC2_PIN, OUTPUT);
  digitalWrite(NC2_PIN, LOW);

  pinMode(TX_PIN, OUTPUT);
  digitalWrite(TX_PIN, LOW);
  pinMode(RX_PIN, OUTPUT);
  digitalWrite(RX_PIN, LOW);

  pinMode(LED1_PIN, OUTPUT);
  digitalWrite(LED1_PIN, LOW);
}

// ---------- Peripheral helpers ----------

static void disablePeripherals_powerDownOnly() {
  Wire.begin();
  ADC0.CTRLA = 0;
  TWI0.MCTRLA = 0;
  USART0.CTRLA = 0;
  USART0.CTRLB = 0;
  SPI0.CTRLA = 0;
  TCA0.SINGLE.CTRLA = 0;
  TCB0.CTRLA = 0;
  TCB1.CTRLA = 0;
  RTC.CTRLA = 0;
  AC0.CTRLA = 0;
  VREF.CTRLA = 0;
  Wire.end();
}





// ---------- Sleep helpers ----------
static void enterPowerDownSleep() {
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  noInterrupts();
  interrupts();
  sleep_cpu();
}




// NFC ISR
static void int2Isr() {
  drivers::power::wakeReason = drivers::power::WakeReason::Nfc;
}

// TEMP ISR (INT1)
static void int1Isr() {
  drivers::power::wakeReason = drivers::power::WakeReason::Temp;
}

}  // namespace

// ---------- RTC ISR ----------
ISR(RTC_CNT_vect) {
  RTC.INTFLAGS = RTC_OVF_bm;
  g_ticks250++;
  if (drivers::power::wakeReason == drivers::power::WakeReason::None) {
    drivers::power::wakeReason = drivers::power::WakeReason::Rtc;
  }
}

namespace drivers::power {

volatile WakeReason wakeReason = WakeReason::None;

// Optional getters
uint32_t rtcTicks250() {
  uint32_t t;
  uint8_t s = SREG;
  cli();
  t = g_ticks250;
  SREG = s;
  return t;
}

uint32_t rtcSeconds() {
  return rtcTicks250() / 4;
}

// Start RTC from XOSC32K, 250 ms overflow
// void rtcStart() {
//   // Crystal pins inputs, no pulls
//   pinMode(TOSC2_PIN, INPUT);
//   pinMode(TOSC1_PIN, INPUT);
//   PORTB.PIN2CTRL = 0;
//   PORTB.PIN3CTRL = 0;

//   CCP = CCP_IOREG_gc;
//   // CSUT=11, RUNSTDBY=1, SEL=0 (crystal), ENABLE=1
//   CLKCTRL.XOSC32KCTRLA = 0b11001001;

//   RTC.CLKSEL = RTC_CLKSEL_XOSC32K_gc;
//   RTC.CNT = 0;
//   RTC.PER = 256 - 1;  // 250 ms
//   RTC.INTFLAGS = RTC_OVF_bm;
//   RTC.INTCTRL = RTC_OVF_bm;
//   RTC.CTRLA = RTC_RTCEN_bm | RTC_RUNSTDBY_bm | RTC_PRESCALER_DIV32_gc;
// }


void rtcStart() {
  // Reset software timebase (atomic)
  uint8_t s = SREG;
  cli();
  g_ticks250 = 0;

  // Optional but recommended: reset NFC lockout timing too
  g_nfcIgnoreUntil_s = 0;
  g_lockoutWasActive = false;
  g_lockoutJustEnded = false;

  SREG = s;

  // Crystal pins inputs, no pulls
  pinMode(TOSC2_PIN, INPUT);
  pinMode(TOSC1_PIN, INPUT);
  PORTB.PIN2CTRL = 0;
  PORTB.PIN3CTRL = 0;

  CCP = CCP_IOREG_gc;
  // CSUT=11, RUNSTDBY=1, SEL=0 (crystal), ENABLE=1
  CLKCTRL.XOSC32KCTRLA = 0b11001001;

  RTC.CLKSEL = RTC_CLKSEL_XOSC32K_gc;
  RTC.CNT = 0;
  RTC.PER = 256 - 1;  // 250 ms
  RTC.INTFLAGS = RTC_OVF_bm;
  RTC.INTCTRL = RTC_OVF_bm;
  RTC.CTRLA = RTC_RTCEN_bm | RTC_RUNSTDBY_bm | RTC_PRESCALER_DIV32_gc;
}





// -------- Deep sleep functions --------

void enterDeepSleepNfcWake() {
  wakeReason = WakeReason::None;

  pinsToLowLeakage_powerDown();
  drivers::nfc::end();
  disablePeripherals_powerDownOnly();

  attachInterrupt(digitalPinToInterrupt(INT2_PIN), int2Isr, CHANGE);
  enterPowerDownSleep();
  sleep_disable();
  detachInterrupt(digitalPinToInterrupt(INT2_PIN));
}





// lets test this
void enterDeepSleepNfcTempWake() {
  wakeReason = WakeReason::None;

  drivers::temp::interrupt();  //confure teh sensor with the intereupt

  pinsToLowLeakage_powerDown();
  drivers::nfc::end();
  disablePeripherals_powerDownOnly();

  attachInterrupt(digitalPinToInterrupt(INT2_PIN), int2Isr, CHANGE);
  attachInterrupt(digitalPinToInterrupt(INT1_PIN), int1Isr, FALLING);

  enterPowerDownSleep();

  sleep_disable();
  detachInterrupt(digitalPinToInterrupt(INT1_PIN));
  detachInterrupt(digitalPinToInterrupt(INT2_PIN));
}




// -------- RTC + NFC sleep functions --------


bool nfcLockoutJustEnded() {
  const bool v = g_lockoutJustEnded;
  g_lockoutJustEnded = false;   // one-shot
  return v;
}




void applyNfcLockout() {
  const uint32_t sec = rtcSeconds();

  const bool lockoutActive = (sec < g_nfcIgnoreUntil_s);

  // detect end of lockout (active -> inactive)
  if (g_lockoutWasActive && !lockoutActive) {
    g_lockoutJustEnded = true;
  }
  g_lockoutWasActive = lockoutActive;

  if (wakeReason == WakeReason::Nfc) {
    if (lockoutActive) {
      wakeReason = WakeReason::None;   // ignore NFC during lockout
    } else {
      g_nfcIgnoreUntil_s = sec + NFC_LOCKOUT_S; // start lockout
      g_lockoutWasActive = true;
    }
  }
}





// use when you need leds
void enterIdleSleepNfcRtcWake() {
  //wakeReason = WakeReason::None;
  drivers::temp::end();
  //drivers::nfc::end();
  pinsToLowLeakage_keepCrystal_keepLEDs();
  attachInterrupt(digitalPinToInterrupt(INT2_PIN), int2Isr, CHANGE);

  set_sleep_mode(SLEEP_MODE_IDLE);
  sleep_enable();
  sei();
  sleep_cpu();
  sleep_disable();

  //detachInterrupt(digitalPinToInterrupt(INT2_PIN));

 // applyNfcLockout();
}


uint32_t nfcIgnoreUntilSeconds() { return g_nfcIgnoreUntil_s; }


void enterStandbySleepNfcRtcWake() {
  wakeReason = WakeReason::None;
  drivers::temp::end();
  //drivers::nfc::end();
  pinsToLowLeakage_keepCrystal();
  attachInterrupt(digitalPinToInterrupt(INT2_PIN), int2Isr, CHANGE);

  set_sleep_mode(SLEEP_MODE_STANDBY);
  sleep_enable();
  sei();
  sleep_cpu();
  sleep_disable();

 // detachInterrupt(digitalPinToInterrupt(INT2_PIN));

  //applyNfcLockout();
}

///timed sleep for NFC lockout:
static volatile bool s_pitWoke = false;

ISR(RTC_PIT_vect) {
  RTC.PITINTFLAGS = RTC_PI_bm;  // clear interrupt flag
  s_pitWoke = true;
}

static void pitStartApproxMs(uint16_t ms) {
  // Use RTC PIT running from 32kHz ULP oscillator.
  // PIT periods are fixed; pick the closest.
  // Common: 4s (CYC131072) + 1s (CYC32768) etc. For simplicity:
  // Use 1s ticks and count in software.

  // Enable PIT with 1 second period
  while (RTC.STATUS & (0x01 | 0x04 | 0x08)) {}
  RTC.CLKSEL = RTC_CLKSEL_OSC32K_gc;


  RTC.PITINTCTRL = RTC_PI_bm;            // enable PIT interrupt
  RTC.PITCTRLA = RTC_PERIOD_CYC32768_gc  // 1 second
                 | RTC_PITEN_bm;
}

void sleepLockoutMs(uint16_t ms) {
  // Detach NFC interrupt BEFORE calling this (important).
  // Sleep in STANDBY so RTC runs.
  uint8_t seconds = (ms + 999) / 1000;
  if (seconds == 0) seconds = 1;

  // Start PIT at 1Hz
  pitStartApproxMs(ms);

  set_sleep_mode(SLEEP_MODE_STANDBY);

  while (seconds) {
    s_pitWoke = false;
    sleep_enable();
    sei();
    sleep_cpu();
    sleep_disable();

    if (s_pitWoke) seconds--;
  }

  // Stop PIT to save power
  RTC.PITCTRLA = 0;
  RTC.PITINTCTRL = 0;
}











//used by the led driver
void enablePwm() {
  // Re-enable timer clocks; analogWrite will configure mode/channels as needed.
  TCA0.SINGLE.CTRLA = TCA_SINGLE_ENABLE_bm | TCA_SINGLE_CLKSEL_DIV1_gc;
  TCB0.CTRLA = TCB_ENABLE_bm | TCB_CLKSEL_DIV1_gc;
  TCB1.CTRLA = TCB_ENABLE_bm | TCB_CLKSEL_DIV1_gc;
}


}  // namespace drivers::power
