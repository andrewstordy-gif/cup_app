#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_ST25DV64KC_Arduino_Library.h>

// Standalone ST25DV64KC pre-init RF-disable test sketch.
// Purpose:
// - power the tag
// - disable RF directly over raw I2C before library init
// - then try tag.begin(Wire) while RF is still disabled
// - finally re-enable RF and verify the register transitions

// Copied from config.h so this sketch stays standalone in Arduino IDE.
static constexpr uint8_t ST25DVLPD_PIN = 4;
static constexpr uint8_t ST25DVPWR_PIN = 5;
static constexpr uint8_t ST25_SYSTEM_ADDR = 0x57;
static constexpr uint8_t ST25_DATA_ADDR = 0x53;

static constexpr uint16_t REG_RF_MNGT_DYN = 0x2003;
static constexpr uint8_t BIT_RF_DISABLE = (1 << 0);

static SFE_ST25DV64KC tag;

static void powerOn()
{
  pinMode(ST25DVLPD_PIN, OUTPUT);
  digitalWrite(ST25DVLPD_PIN, HIGH);
  delay(1);

  pinMode(ST25DVPWR_PIN, OUTPUT);
  digitalWrite(ST25DVPWR_PIN, HIGH);
  delay(5);

  digitalWrite(ST25DVLPD_PIN, LOW);
  delay(30);
}

static void powerOff()
{
  pinMode(ST25DVLPD_PIN, OUTPUT);
  digitalWrite(ST25DVLPD_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(ST25DVPWR_PIN, LOW);
  pinMode(ST25DVPWR_PIN, INPUT);
  pinMode(ST25DVLPD_PIN, INPUT);
}

static void printBool(const __FlashStringHelper *label, bool value)
{
  Serial.print(label);
  Serial.print('=');
  Serial.print(value ? 1 : 0);
}

static void printHexByte(const __FlashStringHelper *label, bool ok, uint8_t value)
{
  Serial.print(label);
  Serial.print('=');
  if (!ok) {
    Serial.print(F("ERR"));
    return;
  }

  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

static bool st25IsConnected(uint8_t devAddr)
{
  Wire.beginTransmission(devAddr);
  return Wire.endTransmission() == 0;
}

static bool st25ReadByte(uint8_t devAddr, uint16_t reg, uint8_t &value)
{
  Wire.beginTransmission(devAddr);
  Wire.write(uint8_t(reg >> 8));
  Wire.write(uint8_t(reg & 0xFF));
  if (Wire.endTransmission() != 0) return false;

  if (Wire.requestFrom(int(devAddr), 1) != 1) return false;
  value = Wire.read();
  return true;
}

static bool st25WriteByte(uint8_t devAddr, uint16_t reg, uint8_t value)
{
  Wire.beginTransmission(devAddr);
  Wire.write(uint8_t(reg >> 8));
  Wire.write(uint8_t(reg & 0xFF));
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

static void runPreInitRfDisableTest(uint32_t attempt)
{
  powerOn();
  Wire.begin();

  const unsigned long t0 = millis();
  const bool busOk = st25IsConnected(ST25_SYSTEM_ADDR);

  uint8_t rf0 = 0;
  uint8_t rf1 = 0;
  uint8_t rf2 = 0;

  const bool read0Ok = busOk && st25ReadByte(ST25_DATA_ADDR, REG_RF_MNGT_DYN, rf0);
  const bool setOk = read0Ok && st25WriteByte(ST25_DATA_ADDR, REG_RF_MNGT_DYN, rf0 | BIT_RF_DISABLE);
  const bool read1Ok = setOk && st25ReadByte(ST25_DATA_ADDR, REG_RF_MNGT_DYN, rf1);

  const unsigned long t1 = millis();
  const bool initOk = read1Ok && tag.begin(Wire);
  const unsigned long t2 = millis();

  const bool clearOk = initOk && st25WriteByte(ST25_DATA_ADDR, REG_RF_MNGT_DYN, rf1 & ~BIT_RF_DISABLE);
  const bool read2Ok = clearOk && st25ReadByte(ST25_DATA_ADDR, REG_RF_MNGT_DYN, rf2);
  const unsigned long t3 = millis();

  Wire.end();
  powerOff();

  Serial.print(F("preinit_rf_test,attempt="));
  Serial.print(attempt);
  Serial.print(F(",disable_ms="));
  Serial.print(t1 - t0);
  Serial.print(F(",init_ms="));
  Serial.print(t2 - t1);
  Serial.print(F(",total_ms="));
  Serial.print(t3 - t0);
  Serial.print(',');
  printBool(F("bus"), busOk);
  Serial.print(',');
  printHexByte(F("rf0"), read0Ok, rf0);
  Serial.print(',');
  printBool(F("set"), setOk);
  Serial.print(',');
  printHexByte(F("rf1"), read1Ok, rf1);
  Serial.print(',');
  printBool(F("init_after_disable"), initOk);
  Serial.print(',');
  printBool(F("clear"), clearOk);
  Serial.print(',');
  printHexByte(F("rf2"), read2Ok, rf2);
  Serial.println();
  Serial.flush();
}

void setup()
{
  Serial.swap();
  Serial.begin(9600);
  delay(100);
  Serial.println(F("st25_rf_disable_test"));
  Serial.println(F("format: preinit_rf_test,attempt=<n>,disable_ms=<ms>,init_ms=<ms>,total_ms=<ms>,bus=<0|1>,rf0=<hex|ERR>,set=<0|1>,rf1=<hex|ERR>,init_after_disable=<0|1>,clear=<0|1>,rf2=<hex|ERR>"));
}

void loop()
{
  static uint32_t attempt = 0;
  attempt++;
  runPreInitRfDisableTest(attempt);
  delay(5000);
}
