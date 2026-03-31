#include "drivers_led.h"
#include "config.h"
#include "drivers_power.h"
#include "drivers_json.h"

extern drivers::json::State gState;
extern drivers::json::Status gStatus;
extern drivers::json::Settings gSettings;


namespace drivers::led {

static bool g_inited = false;

void begin() {

  drivers::power::enablePwm();

  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);


  // Force PWM timers to re-initialise after deep sleep
  analogWrite(LED1_PIN, 0);
  analogWrite(LED2_PIN, 0);
  analogWrite(LED3_PIN, 0);

  g_inited = true;
}

void on() {
  if (!g_inited) begin();

  // Serial.swap();
  // Serial.begin(9600);
  // Serial.println(gSettings.ledBrightness);
  // Serial.flush();

  // Use analog Write
  analogWrite(LED1_PIN, gSettings.ledBrightness);
  analogWrite(LED2_PIN, gSettings.ledBrightness);
  analogWrite(LED3_PIN, gSettings.ledBrightness);
}

void off() {
  if (!g_inited) begin();
  analogWrite(LED1_PIN, 0);
  analogWrite(LED2_PIN, 0);
  analogWrite(LED3_PIN, 0);
}

void end() {
  off();

  // reduce leakage.
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);

  g_inited = false;
}

}
