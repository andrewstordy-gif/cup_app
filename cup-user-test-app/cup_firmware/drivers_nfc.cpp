#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_ST25DV64KC_Arduino_Library.h>

#include "config.h"
#include "drivers_nfc.h"
#include "drivers_json.h"

namespace drivers::nfc {

// --------------------------------------------------

static SFE_ST25DV64KC_NDEF tag;
static bool tagInitialised = false;
static uint8_t gLastWriteCupFailCode = WriteCupFailNone;
static constexpr uint16_t MAX_FREE_RECORD_LEN = 512;
static constexpr uint8_t ST25_DATA_ADDR = 0x53;
static constexpr uint16_t REG_RF_MNGT_DYN = 0x2003;
static constexpr uint16_t REG_IT_STS_DYN = 0x2005;
static constexpr uint8_t BIT_RF_DISABLE = (1 << 0);
static constexpr uint8_t BIT_IT_RF_ACTIVITY = (1 << 1);
static constexpr uint8_t BIT_IT_RF_PUT_MSG = (1 << 5);
static constexpr uint8_t BIT_IT_RF_GET_MSG = (1 << 6);
static constexpr uint8_t BIT_IT_RF_WRITE = (1 << 7);
static constexpr uint8_t TAG_INIT_MAX_ATTEMPTS = 5;
static constexpr uint8_t RF_BUSY_POLL_INTERVAL_MS = 25;
static constexpr uint16_t RF_BUSY_HOLDOFF_MS = 300;
static constexpr SF_ST25DV64KC_ADDRESS DYN_ADDR =
    SF_ST25DV64KC_ADDRESS::DATA;

// --------------------------------------------------


static void powerOn()
{
  // 1) Assert LPD HIGH first (per AN5733)
  pinMode(ST25DVLPD_PIN, OUTPUT);          // LPD
  digitalWrite(ST25DVLPD_PIN, HIGH);
  delay(1);       // allow internal switch

  // 2) Apply VCC
  pinMode(ST25DVPWR_PIN, OUTPUT);
  digitalWrite(ST25DVPWR_PIN, HIGH);
  delay(5);                    // VCC stabilize

  // 3) Release LPD
  digitalWrite(ST25DVLPD_PIN, LOW);
  // ST25DV boots; ready after tbootLPD
  delay(30);
}


static void powerOff()
{
  // 1) Enter low-power mode first
  pinMode(ST25DVLPD_PIN, OUTPUT);          // LPD
  digitalWrite(ST25DVLPD_PIN, HIGH);
  delayMicroseconds(10);       // allow power-path switch

  // 2) Remove VCC
  digitalWrite(ST25DVPWR_PIN, LOW);
  pinMode(ST25DVPWR_PIN, INPUT);   // avoid back-powering


 // Now float LPD (avoids any leakage via clamp structures)
  pinMode(ST25DVLPD_PIN, INPUT);
  // Leave LPD HIGH while off (per ST recommendation)
}



// --------------------------------------------------

static bool readUidHex(char *out, size_t len)
{
  uint8_t uid[8];

  // NOTE: correct SparkFun API
  if (!tag.getDeviceUID(uid)) {
    out[0] = '\0';
    return false;
  }

  snprintf(out, len,
           "%02X%02X%02X%02X%02X%02X%02X%02X",
           uid[0], uid[1], uid[2], uid[3],
           uid[4], uid[5], uid[6], uid[7]);
  return true;
}


// --------------------------------------------------

static bool disableRf()
{
  return tag.st25_io.setRegisterBit(DYN_ADDR, REG_RF_MNGT_DYN, BIT_RF_DISABLE);
}

static bool readDynamicRegisterRaw(uint16_t reg, uint8_t &value)
{
  Wire.beginTransmission(ST25_DATA_ADDR);
  Wire.write(uint8_t(reg >> 8));
  Wire.write(uint8_t(reg & 0xFF));
  if (Wire.endTransmission() != 0) return false;

  if (Wire.requestFrom(int(ST25_DATA_ADDR), 1) != 1) return false;
  value = Wire.read();
  return true;
}

static bool isRfBusyEvent(uint8_t value)
{
  return (value & (BIT_IT_RF_ACTIVITY | BIT_IT_RF_PUT_MSG | BIT_IT_RF_GET_MSG | BIT_IT_RF_WRITE)) != 0;
}

static bool disableRfWithRetry()
{
  if (disableRf()) return true;
  delay(5);
  return disableRf();
}

static bool enableRf()
{
  return tag.st25_io.clearRegisterBit(DYN_ADDR, REG_RF_MNGT_DYN, BIT_RF_DISABLE);
}

static bool beginTagWithWait()
{
  const unsigned long start = millis();
  while ((millis() - start) < 25) {
    if (tag.begin(Wire)) return true;
    delay(5);
  }
  return false;
}


// --------------------------------------------------

static bool writeAllRecords(
  const char *rec1,
  const char *rec2,
  const char *rec3,
  const char *rec4
)
{
  if (!tagInitialised) return false;
  if (!tag.writeCCFile8Byte()) return false;

  uint16_t memLoc = tag.getCCFileLen();

  return
      tag.writeNDEFText(rec1, &memLoc, true, false) &&
      tag.writeNDEFText(rec2, &memLoc, false, false) &&
      tag.writeNDEFText(rec3, &memLoc, false, false) &&
      tag.writeNDEFText(rec4, &memLoc, false, true);
}

// --------------------------------------------------
// Public API
// --------------------------------------------------

void begin()
{
  tagInitialised = false;
  gLastWriteCupFailCode = WriteCupFailNone;

  for (uint8_t attempt = 0; attempt < TAG_INIT_MAX_ATTEMPTS; ++attempt) {
    powerOn();
    Wire.begin();

    if (beginTagWithWait()) {
      // Give the tag a brief settle period after I2C init before the first
      // higher-level accesses. This is a practical guard for the init/write path,
      // not a replacement for the datasheet tbootLPD requirement.
      delay(5);
      tagInitialised = true;
      Wire.end();
      return;
    }

    Wire.end();
    powerOff();

    if (attempt + 1 < TAG_INIT_MAX_ATTEMPTS) {
      delay(5);
    }
  }

  gLastWriteCupFailCode = WriteCupFailTagNotInitialised;
}

void end()
{
  powerOff();
  tagInitialised = false;
}

bool disableRfAccess()
{
  if (!tagInitialised) {
    gLastWriteCupFailCode = WriteCupFailTagNotInitialised;
    return false;
  }

  Wire.begin();
  const bool ok = disableRfWithRetry();
  Wire.end();
  if (!ok) {
    gLastWriteCupFailCode = WriteCupFailRfDisable;
  }
  return ok;
}

bool enableRfAccess()
{
  if (!tagInitialised) {
    gLastWriteCupFailCode = WriteCupFailTagNotInitialised;
    return false;
  }

  Wire.begin();
  const bool ok = enableRf();
  Wire.end();
  if (!ok) {
    gLastWriteCupFailCode = WriteCupFailRfEnable;
  }
  return ok;
}

void waitForRfIdle()
{
  if (!tagInitialised) {
    gLastWriteCupFailCode = WriteCupFailTagNotInitialised;
    return;
  }

  unsigned long rfBusyUntilMs = 0;

  for (;;) {
    const unsigned long nowMs = millis();
    if (nowMs < rfBusyUntilMs) {
      delay(RF_BUSY_POLL_INTERVAL_MS);
      continue;
    }

    Wire.begin();
    uint8_t itStatus = 0;
    const bool readOk = readDynamicRegisterRaw(REG_IT_STS_DYN, itStatus);
    Wire.end();

    if (!readOk) {
      rfBusyUntilMs = millis() + RF_BUSY_HOLDOFF_MS;
      delay(RF_BUSY_POLL_INTERVAL_MS);
      continue;
    }

    if (isRfBusyEvent(itStatus)) {
      rfBusyUntilMs = millis() + RF_BUSY_HOLDOFF_MS;
      delay(RF_BUSY_POLL_INTERVAL_MS);
      continue;
    }

    return;
  }
}

uint8_t lastWriteCupFailCode()
{
  return gLastWriteCupFailCode;
}





// old write cup records:

bool writeCupRecords(
  const drivers::json::State    &state,
  const drivers::json::Status   &status,
  const drivers::json::Settings &settings
)
{
  gLastWriteCupFailCode = WriteCupFailNone;
  Wire.begin();
  if (!tagInitialised) {
    gLastWriteCupFailCode = WriteCupFailTagNotInitialised;
    Wire.end();
    return false;
  }

  drivers::json::Status statusCopy = status;
  if (!readUidHex(statusCopy.uuid, sizeof(statusCopy.uuid))) {
    gLastWriteCupFailCode = WriteCupFailUidRead;
    Wire.end();
    return false;
  }

  char freeBuf[MAX_FREE_RECORD_LEN] = "{}";
  const bool record4Ok = tag.readNDEFText(freeBuf, sizeof(freeBuf), 4);
  if (!record4Ok) {
    gLastWriteCupFailCode = WriteCupFailRecord4Read;
    Wire.end();
    return false;
  }

  // If record 4 fills the buffer without a terminator, treat it as a failed read
  // rather than writing truncated JSON back to the tag.
  if (freeBuf[sizeof(freeBuf) - 1] != '\0') {
    gLastWriteCupFailCode = WriteCupFailRecord4Read;
    Wire.end();
    return false;
  }

  const bool ok = writeAllRecords(
    drivers::json::encodeState(state),
    drivers::json::encodeStatus(statusCopy),
    drivers::json::encodeSettings(settings),
    freeBuf
  );
  if (!ok) {
    gLastWriteCupFailCode = WriteCupFailWriteAllRecords;
  }
  Wire.end();
  return ok;
}


bool readSettings(drivers::json::Settings &settings)
{
  Wire.begin();
  char buf[sizeof(drivers::json::settingsBuf)];
  if (!tag.readNDEFText(buf, sizeof(buf), 3)) {
    Wire.end();
    return false;
  }
  const bool ok = drivers::json::decodeSettings(buf, settings);
  Wire.end();
  return ok;
}

bool readState(drivers::json::State &state)
{
  Wire.begin();
  char buf[sizeof(drivers::json::stateBuf)];
  if (!tag.readNDEFText(buf, sizeof(buf), 1)) {
    Wire.end();
    return false;
  }
  const bool ok = drivers::json::decodeState(buf, state);
  Wire.end();
  return ok;
}

} // namespace drivers::nfc
