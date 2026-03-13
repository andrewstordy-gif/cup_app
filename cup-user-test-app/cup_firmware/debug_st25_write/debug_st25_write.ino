#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_ST25DV64KC_Arduino_Library.h>

constexpr uint8_t ST25DVLPD_PIN = 4;   // LPD
constexpr uint8_t ST25DVPWR_PIN = 5;   // VCC switch
constexpr uint8_t LED2_PIN = 0;        // PA4
constexpr uint8_t LED3_PIN = 1;        // PA5
constexpr uint8_t LED1_PIN = 16;       // PA3

SFE_ST25DV64KC_NDEF tag;

static void ledsOff() {
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);
}

static void ledsOn() {
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, HIGH);
  digitalWrite(LED3_PIN, HIGH);
}

static void blink(uint8_t count, uint16_t onMs = 180, uint16_t offMs = 180) {
  for (uint8_t i = 0; i < count; ++i) {
    ledsOn();
    delay(onMs);
    ledsOff();
    delay(offMs);
  }
}

static void powerOnTag() {
  pinMode(ST25DVLPD_PIN, OUTPUT);
  digitalWrite(ST25DVLPD_PIN, HIGH);
  delayMicroseconds(10);

  pinMode(ST25DVPWR_PIN, OUTPUT);
  digitalWrite(ST25DVPWR_PIN, HIGH);
  delay(5);

  digitalWrite(ST25DVLPD_PIN, LOW);
  delay(30);
}

void setup() {
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);
  ledsOff();

  blink(1, 300, 200); // boot marker

  powerOnTag();
  Wire.begin();

  if (!tag.begin(Wire)) {
    blink(2, 400, 250); // could not talk to tag
    return;
  }

  if (!tag.writeCCFile8Byte()) {
    blink(3, 400, 250); // CC write failed
    return;
  }

  uint16_t memLoc = tag.getCCFileLen();
  const char *payload = "{\"v\":9,\"boot\":1}";

  if (!tag.writeNDEFText(payload, &memLoc, true, true)) {
    blink(4, 400, 250); // NDEF write failed
    return;
  }

  ledsOn(); // success
}

void loop() {
  // Hold success/error state for scanning.
}
