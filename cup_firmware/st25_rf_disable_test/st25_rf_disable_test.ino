#include <Arduino.h>
#include <Wire.h>

// Standalone ST25DV dynamic-register monitor sketch.
// Purpose:
// - power the tag
// - leave RF enabled
// - poll the dynamic-register window over I2C
// - log any changes while a phone reads or writes the tag
//
// This is intended to answer a practical question:
// can the MCU observe RF activity from the ST25DV while a phone is talking to it?

// Copied from config.h so this sketch stays standalone in Arduino IDE.
static constexpr uint8_t ST25DVLPD_PIN = 4;
static constexpr uint8_t ST25DVPWR_PIN = 5;
static constexpr uint8_t ST25_SYSTEM_ADDR = 0x57;
static constexpr uint8_t ST25_DATA_ADDR = 0x53;

static constexpr uint16_t REG_DYN_BASE = 0x2000;
static constexpr uint8_t DYN_REG_COUNT = 8;
static constexpr uint8_t WATCH_REG_INDEX = 5; // IT_STS_Dyn by default

static constexpr uint8_t POLL_INTERVAL_MS = 25;
static constexpr uint16_t HEARTBEAT_INTERVAL_MS = 1000;
static constexpr uint16_t RF_BUSY_HOLDOFF_MS = 300;

static const char *const DYN_REG_LABELS[DYN_REG_COUNT] = {
  "GPO_CTRL_Dyn",  // 0x2000
  "EH_CTRL_Dyn?",  // 0x2001 or reserved depending on variant
  "EH_CTRL_Dyn",   // 0x2002
  "RF_MNGT_Dyn",   // 0x2003
  "I2C_SSO_Dyn",   // 0x2004
  "IT_STS_Dyn",    // 0x2005
  "MB_CTRL_Dyn",   // 0x2006
  "MB_LEN_Dyn",    // 0x2007
};

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

static void printHexByte(uint8_t value)
{
  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

static void printRegValue(const char *label, uint8_t value)
{
  Serial.print(label);
  Serial.print('=');
  printHexByte(value);
}

static void printBitFlag(const __FlashStringHelper *label, bool enabled)
{
  Serial.print(label);
  Serial.print('=');
  Serial.print(enabled ? 1 : 0);
}

static bool readDynamicRegister(uint8_t regIndex, uint8_t &value)
{
  if (regIndex >= DYN_REG_COUNT) {
    return false;
  }

  return st25ReadByte(ST25_DATA_ADDR, REG_DYN_BASE + regIndex, value);
}

static void printRegisterLine(const __FlashStringHelper *prefix, unsigned long nowMs, uint8_t regIndex, uint8_t value)
{
  Serial.print(prefix);
  Serial.print(F(",ms="));
  Serial.print(nowMs);
  Serial.print(F(",reg=0x"));
  printHexByte(uint8_t(REG_DYN_BASE + regIndex));
  Serial.print(F(","));
  printRegValue(DYN_REG_LABELS[regIndex], value);
  Serial.println();
}

static bool isRfActivityEvent(uint8_t value)
{
  const bool rfActivity = (value & (1 << 1)) != 0;
  const bool rfPutMsg = (value & (1 << 5)) != 0;
  const bool rfGetMsg = (value & (1 << 6)) != 0;
  const bool rfWrite = (value & (1 << 7)) != 0;
  return rfActivity || rfPutMsg || rfGetMsg || rfWrite;
}

static void printRfEventLine(unsigned long nowMs, uint8_t regIndex, uint8_t value, unsigned long rfBusyUntilMs)
{
  const bool rfActivity = (value & (1 << 1)) != 0;
  const bool rfPutMsg = (value & (1 << 5)) != 0;
  const bool rfGetMsg = (value & (1 << 6)) != 0;
  const bool rfWrite = (value & (1 << 7)) != 0;

  Serial.print(F("dyn_event,ms="));
  Serial.print(nowMs);
  Serial.print(F(",reg=0x"));
  printHexByte(uint8_t(REG_DYN_BASE + regIndex));
  Serial.print(F(","));
  printRegValue(DYN_REG_LABELS[regIndex], value);
  Serial.print(F(","));
  printBitFlag(F("rfActivity"), rfActivity);
  Serial.print(F(","));
  printBitFlag(F("rfPutMsg"), rfPutMsg);
  Serial.print(F(","));
  printBitFlag(F("rfGetMsg"), rfGetMsg);
  Serial.print(F(","));
  printBitFlag(F("rfWrite"), rfWrite);
  Serial.print(F(","));
  printBitFlag(F("rfBusy"), nowMs < rfBusyUntilMs);
  Serial.print(F(",busyUntil="));
  Serial.print(rfBusyUntilMs);
  Serial.println();
}

static void printRfErrorLine(unsigned long nowMs, uint8_t regIndex, unsigned long rfBusyUntilMs)
{
  Serial.print(F("dyn_error_event,ms="));
  Serial.print(nowMs);
  Serial.print(F(",reg=0x"));
  printHexByte(uint8_t(REG_DYN_BASE + regIndex));
  Serial.print(F(","));
  Serial.print(DYN_REG_LABELS[regIndex]);
  Serial.print(F("=NoAck"));
  Serial.print(F(","));
  printBitFlag(F("rfBusy"), nowMs < rfBusyUntilMs);
  Serial.print(F(",busyUntil="));
  Serial.print(rfBusyUntilMs);
  Serial.println();
}

static void printBusyStateLine(const __FlashStringHelper *prefix, unsigned long nowMs, unsigned long rfBusyUntilMs)
{
  Serial.print(prefix);
  Serial.print(F(",ms="));
  Serial.print(nowMs);
  Serial.print(F(","));
  printBitFlag(F("rfBusy"), nowMs < rfBusyUntilMs);
  Serial.print(F(",busyUntil="));
  Serial.print(rfBusyUntilMs);
  Serial.println();
}

void setup()
{
  Serial.swap();
  Serial.begin(9600);
  delay(100);

  Serial.println(F("st25_rf_activity_monitor"));
  Serial.println(F("format: dyn_boot,ms=<ms>,reg=0x<addr>,<name>=<hex>"));
  Serial.println(F("format: dyn_event,ms=<ms>,reg=0x<addr>,<name>=<hex>,rfActivity=<0|1>,rfPutMsg=<0|1>,rfGetMsg=<0|1>,rfWrite=<0|1>,rfBusy=<0|1>,busyUntil=<ms>"));
  Serial.println(F("format: dyn_error_event,ms=<ms>,reg=0x<addr>,<name>=NoAck,rfBusy=<0|1>,busyUntil=<ms>"));
  Serial.println(F("format: dyn_heartbeat,ms=<ms>,reg=0x<addr>,<name>=<hex>,rfBusy=<0|1>,busyUntil=<ms>"));
  Serial.println(F("format: busy_clear,ms=<ms>,rfBusy=0,busyUntil=<ms>"));
  Serial.print(F("watching reg index="));
  Serial.print(WATCH_REG_INDEX);
  Serial.print(F(" addr=0x"));
  printHexByte(uint8_t(REG_DYN_BASE + WATCH_REG_INDEX));
  Serial.print(F(" name="));
  Serial.println(DYN_REG_LABELS[WATCH_REG_INDEX]);
  Serial.println(F("action: keep this sketch running, then hold the phone near the cup and perform NFC reads/writes"));

  powerOn();
  Wire.begin();

  const bool busOk = st25IsConnected(ST25_SYSTEM_ADDR);
  Serial.print(F("bus="));
  Serial.println(busOk ? 1 : 0);
}

void loop()
{
  static bool initialized = false;
  static unsigned long lastPollMs = 0;
  static unsigned long lastHeartbeatMs = 0;
  static unsigned long rfBusyUntilMs = 0;
  static bool busyWasActive = false;

  const unsigned long nowMs = millis();
  if ((nowMs - lastPollMs) < POLL_INTERVAL_MS) {
    return;
  }
  lastPollMs = nowMs;

  uint8_t currentValue = 0;
  const bool readOk = readDynamicRegister(WATCH_REG_INDEX, currentValue);
  if (!readOk) {
    rfBusyUntilMs = nowMs + RF_BUSY_HOLDOFF_MS;
    printRfErrorLine(nowMs, WATCH_REG_INDEX, rfBusyUntilMs);
    busyWasActive = true;
    delay(100);
    return;
  }

  if (!initialized) {
    printRegisterLine(F("dyn_boot"), nowMs, WATCH_REG_INDEX, currentValue);
    initialized = true;
    lastHeartbeatMs = nowMs;
    return;
  }

  if (isRfActivityEvent(currentValue)) {
    rfBusyUntilMs = nowMs + RF_BUSY_HOLDOFF_MS;
    printRfEventLine(nowMs, WATCH_REG_INDEX, currentValue, rfBusyUntilMs);
    busyWasActive = true;
  }

  const bool busyIsActive = nowMs < rfBusyUntilMs;
  if (busyWasActive && !busyIsActive) {
    printBusyStateLine(F("busy_clear"), nowMs, rfBusyUntilMs);
  }
  busyWasActive = busyIsActive;

  if ((nowMs - lastHeartbeatMs) >= HEARTBEAT_INTERVAL_MS) {
    Serial.print(F("dyn_heartbeat,ms="));
    Serial.print(nowMs);
    Serial.print(F(",reg=0x"));
    printHexByte(uint8_t(REG_DYN_BASE + WATCH_REG_INDEX));
    Serial.print(F(","));
    printRegValue(DYN_REG_LABELS[WATCH_REG_INDEX], currentValue);
    Serial.print(F(","));
    printBitFlag(F("rfBusy"), nowMs < rfBusyUntilMs);
    Serial.print(F(",busyUntil="));
    Serial.print(rfBusyUntilMs);
    Serial.println();
    lastHeartbeatMs = nowMs;
  }
}
