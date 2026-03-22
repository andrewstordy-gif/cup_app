#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_ST25DV64KC_Arduino_Library.h>

#include "config.h"
#include "drivers_battery.h"
#include "drivers_nfc.h"
#include "drivers_json.h"
#include "drivers_temp_sensor.h"

namespace drivers::nfc {

// --------------------------------------------------

static SFE_ST25DV64KC_NDEF tag;
static bool tagInitialised = false;
static uint8_t gLastWriteCupFailCode = WriteCupFailNone;
// Record 4 is app-owned JSON, so keep a generous buffer when preserving it
// during cup-side writes to records 1-3.
static constexpr uint16_t MAX_FREE_RECORD_LEN = 512;
static char gLastMeaningfulRecord4[MAX_FREE_RECORD_LEN] = "{}";
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


// Power the ST25DV up using the VCC and LPD sequencing used throughout the
// firmware. The later tag.begin() call handles the higher-level NDEF init.
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


}



// --------------------------------------------------

// Read the tag UID and convert it into the hex string stored in NDEF2.
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

// Set the RF disable bit through the SparkFun ST25 register wrapper.
static bool disableRf()
{
  return tag.st25_io.setRegisterBit(DYN_ADDR, REG_RF_MNGT_DYN, BIT_RF_DISABLE);
}

// Raw one-byte read helper for ST25 dynamic registers. This bypasses the
// higher-level NDEF helpers and is used for RF activity polling.
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
  // tag.begin(Wire) can be touchy immediately after power-up, so retry for a
  // short window before giving up on this power cycle.
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
  // Rebuild the entire multi-record NDEF payload in one pass so the records stay
  // in a predictable order: 1=state, 2=status, 3=settings, 4=app-owned JSON.
  if (!tag.writeCCFile8Byte()) return false;

  uint16_t memLoc = tag.getCCFileLen();

  return
      tag.writeNDEFText(rec1, &memLoc, true, false) &&
      tag.writeNDEFText(rec2, &memLoc, false, false) &&
      tag.writeNDEFText(rec3, &memLoc, false, false) &&
      tag.writeNDEFText(rec4, &memLoc, false, true);
}

static const char *skipWhitespace(const char *p)
{
  while (p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')) {
    ++p;
  }
  return p;
}

static bool isEmptyJsonObject(const char *text)
{
  const char *p = skipWhitespace(text);
  if (!p || *p != '{') return false;
  p = skipWhitespace(p + 1);
  return p && *p == '}';
}

static void cacheMeaningfulRecord4(const char *record4)
{
  if (!record4 || isEmptyJsonObject(record4)) {
    return;
  }

  strncpy(gLastMeaningfulRecord4, record4, sizeof(gLastMeaningfulRecord4) - 1);
  gLastMeaningfulRecord4[sizeof(gLastMeaningfulRecord4) - 1] = '\0';
}

static const char *selectRecord4ForCupWrite(char *record4Buf, bool record4ReadOk)
{
  if (record4ReadOk && record4Buf[sizeof(gLastMeaningfulRecord4) - 1] == '\0') {
    if (!isEmptyJsonObject(record4Buf)) {
      cacheMeaningfulRecord4(record4Buf);
      return record4Buf;
    }

    if (!isEmptyJsonObject(gLastMeaningfulRecord4)) {
      return gLastMeaningfulRecord4;
    }

    return "{}";
  }

  if (!isEmptyJsonObject(gLastMeaningfulRecord4)) {
    return gLastMeaningfulRecord4;
  }

  return "{}";
}

// --------------------------------------------------
// Public API
// --------------------------------------------------

void begin()
{
  tagInitialised = false;
  gLastWriteCupFailCode = WriteCupFailNone;

  // Power cycle and re-initialise the tag until either NDEF access comes up or
  // we exhaust the small retry budget.
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
  // A second attempt helps with the occasional transient NACK on the ST25
  // dynamic register path.
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

    // IT_STS_Dyn is an event register. Poll it until we have seen a quiet
    // window long enough that the phone is no longer actively using RF.
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

  // Record 4 belongs to the app. Read and preserve it before rewriting the
  // three cup-owned records.
  char freeBuf[MAX_FREE_RECORD_LEN] = "{}";
  const bool record4Ok = tag.readNDEFText(freeBuf, sizeof(freeBuf), 4);
  // If record 4 fills the buffer without a terminator, treat it as unreadable
  // and fall back to the last meaningful cached metadata payload.
  const bool record4Terminated = freeBuf[sizeof(freeBuf) - 1] == '\0';
  const bool usableRecord4 = record4Ok && record4Terminated;
  const char *record4ToWrite = selectRecord4ForCupWrite(freeBuf, usableRecord4);
  if (!usableRecord4) {
    gLastWriteCupFailCode = WriteCupFailRecord4Read;
  }

  const bool ok = writeAllRecords(
    drivers::json::encodeState(state),
    drivers::json::encodeStatus(statusCopy),
    drivers::json::encodeSettings(settings),
    record4ToWrite
  );
  if (!ok) {
    gLastWriteCupFailCode = WriteCupFailWriteAllRecords;
  }
  Wire.end();
  return ok;
}

bool writeBootstrapRecords(
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

  // Startup recovery path: force a valid baseline NDEF payload without relying
  // on an existing readable record 4.
  strncpy(gLastMeaningfulRecord4, "{}", sizeof(gLastMeaningfulRecord4) - 1);
  gLastMeaningfulRecord4[sizeof(gLastMeaningfulRecord4) - 1] = '\0';
  const bool ok = writeAllRecords(
    drivers::json::encodeState(state),
    drivers::json::encodeStatus(statusCopy),
    drivers::json::encodeSettings(settings),
    "{}"
  );
  if (!ok) {
    gLastWriteCupFailCode = WriteCupFailWriteAllRecords;
  }
  Wire.end();
  return ok;
}

Stage1Result runStage1(
  drivers::json::State    &state,
  drivers::json::Status   &status,
  const drivers::json::Settings &settings
)
{
  bool beginOk = false;
  bool rfOffOk = false;
  bool writeOk = false;
  bool rfOnOk = false;

  begin();
  beginOk = lastWriteCupFailCode() == WriteCupFailNone;

  rfOffOk = disableRfAccess();
  if (rfOffOk) {
    drivers::temp::begin();
    const float t = drivers::temp::read();
    status.temp = (uint16_t)(t * 10.0f);

    drivers::battery::begin();
    const float v = drivers::battery::readVoltage();
    status.battery = drivers::battery::estimatePercent(v);

    writeOk = writeCupRecords(state, status, settings);
    rfOnOk = enableRfAccess();
  }

  const uint8_t failCode = lastWriteCupFailCode();
  end();

  const uint8_t mask =
    (beginOk ? 0x01 : 0) |
    (rfOffOk ? 0x02 : 0) |
    (writeOk ? 0x04 : 0) |
    (rfOnOk ? 0x08 : 0);

  return { mask, failCode };
}

Stage2Result runStage2(
  drivers::json::State    &state,
  drivers::json::Settings *settings
)
{
  bool beginOk = false;
  bool rfOffOk = false;
  bool stateOk = false;
  bool settingsOk = false;
  bool rfOnOk = false;

  begin();
  beginOk = lastWriteCupFailCode() == WriteCupFailNone;
  if (beginOk) {
    waitForRfIdle();
  }

  rfOffOk = disableRfAccess();
  if (rfOffOk) {
    stateOk = readState(state);
    if (settings) {
      settingsOk = readSettings(*settings);
    }
    rfOnOk = enableRfAccess();
  }

  end();

  const uint8_t mask =
    (beginOk ? 0x01 : 0) |
    (rfOffOk ? 0x02 : 0) |
    (stateOk ? 0x04 : 0) |
    (settingsOk ? 0x08 : 0) |
    (rfOnOk ? 0x10 : 0);

  return { mask };
}


bool readSettings(drivers::json::Settings &settings)
{
  Wire.begin();
  char buf[sizeof(drivers::json::settingsBuf)];
  // NDEF3 is the settings record written by the app and consumed by firmware.
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
  // NDEF1 is the state request record used to drive firmware state changes.
  if (!tag.readNDEFText(buf, sizeof(buf), 1)) {
    Wire.end();
    return false;
  }
  const bool ok = drivers::json::decodeState(buf, state);
  Wire.end();
  return ok;
}

} // namespace drivers::nfc
