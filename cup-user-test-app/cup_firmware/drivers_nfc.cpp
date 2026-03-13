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
static constexpr uint16_t MAX_FREE_RECORD_LEN = 256;
static constexpr uint16_t REG_RF_MNGT_DYN = 0x2003;
static constexpr uint8_t BIT_RF_DISABLE = (1 << 0);

// --------------------------------------------------


static void powerOn()
{
  // 1) Assert LPD HIGH first (per AN5733)
  pinMode(ST25DVLPD_PIN, OUTPUT);          // LPD
  digitalWrite(ST25DVLPD_PIN, HIGH);
  delayMicroseconds(10);       // allow internal switch

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

static void readUidHex(char *out, size_t len)
{
  uint8_t uid[8];

  // NOTE: correct SparkFun API
  if (!tag.getDeviceUID(uid)) {
    out[0] = '\0';
    return;
  }

  snprintf(out, len,
           "%02X%02X%02X%02X%02X%02X%02X%02X",
           uid[0], uid[1], uid[2], uid[3],
           uid[4], uid[5], uid[6], uid[7]);
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

  // Dynamic register write: temporarily disable RF command processing while
  // we rewrite the full multi-record NDEF payload over I2C.
  const SF_ST25DV64KC_ADDRESS systemAddr =
      static_cast<SF_ST25DV64KC_ADDRESS>(1); // SYSTEM
  const bool rfDisabled =
      tag.st25_io.setRegisterBit(systemAddr, REG_RF_MNGT_DYN, BIT_RF_DISABLE);

  if (!tag.writeCCFile8Byte()) {
    if (rfDisabled) {
      tag.st25_io.clearRegisterBit(systemAddr, REG_RF_MNGT_DYN, BIT_RF_DISABLE);
    }
    return false;
  }

  uint16_t memLoc = tag.getCCFileLen();

  const bool writeOk =
      tag.writeNDEFText(rec1, &memLoc, true, false) &&
      tag.writeNDEFText(rec2, &memLoc, false, false) &&
      tag.writeNDEFText(rec3, &memLoc, false, false) &&
      tag.writeNDEFText(rec4, &memLoc, false, true);

  // Best-effort re-enable: even if writes fail, try to restore RF availability.
  bool rfEnabled = true;
  if (rfDisabled) {
    rfEnabled = tag.st25_io.clearRegisterBit(systemAddr, REG_RF_MNGT_DYN, BIT_RF_DISABLE);
  }

  return writeOk && rfEnabled;
}

// --------------------------------------------------
// Public API
// --------------------------------------------------

void begin()
{
  powerOn();

  Wire.begin();

  if (!tag.begin(Wire)) {
    Wire.end();
    return;
  }

  tagInitialised = true;

  char tmp[16];
  if (!tag.readNDEFText(tmp, sizeof(tmp), 1)) {
    drivers::json::State    s;
    drivers::json::Status   st;
    drivers::json::Settings cfg;

    drivers::json::initState(s);
    drivers::json::initStatus(st);
    drivers::json::initSettings(cfg);

    writeAllRecords(
      drivers::json::encodeState(s),
      drivers::json::encodeStatus(st),
      drivers::json::encodeSettings(cfg),
      "{}"
    );
  }
  Wire.end();
}

void end()
{
  powerOff();
  tagInitialised = false;
}





// old write cup records:

bool writeCupRecords(
  const drivers::json::State    &state,
  const drivers::json::Status   &status,
  const drivers::json::Settings &settings
)
{
  Wire.begin();
  if (!tagInitialised) {
    Wire.end();
    return false;
  }

  drivers::json::Status statusCopy = status;
  readUidHex(statusCopy.uuid, sizeof(statusCopy.uuid));

  char freeBuf[MAX_FREE_RECORD_LEN] = "{}";
  tag.readNDEFText(freeBuf, sizeof(freeBuf), 4);

  const bool ok = writeAllRecords(
    drivers::json::encodeState(state),
    drivers::json::encodeStatus(statusCopy),
    drivers::json::encodeSettings(settings),
    freeBuf
  );
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

bool readStatus(drivers::json::Status &status)
{
  Wire.begin();
  char buf[sizeof(drivers::json::statusBuf)];
  if (!tag.readNDEFText(buf, sizeof(buf), 2)) {
    Wire.end();
    return false;
  }

  //uint32_t v;
  const char *p;

  p = strstr(buf, "temp");
  if (!p) p = strstr(buf, "\"t\"");
  if (p && (p = strchr(p, ':'))) status.temp = atoi(p + 1);

  p = strstr(buf, "time");
  if (!p) p = strstr(buf, "\"m\"");
  if (!p) p = strstr(buf, "\"tm\"");
  if (p && (p = strchr(p, ':'))) status.time = atoi(p + 1);

  p = strstr(buf, "battery");
  if (!p) p = strstr(buf, "\"b\"");
  if (p && (p = strchr(p, ':'))) status.battery = atoi(p + 1);

  Wire.end();
  return true;
}

} // namespace drivers::nfc
