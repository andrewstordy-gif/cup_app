#include <Arduino.h>

// LED pins from the cup firmware config
constexpr uint8_t LED2_PIN = 0;   // PA4
constexpr uint8_t LED3_PIN = 1;   // PA5
constexpr uint8_t LED1_PIN = 16;  // PA3

void setup() {
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);

  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, HIGH);
  digitalWrite(LED3_PIN, HIGH);
}

void loop() {
  // Keep all LEDs on continuously.
}
