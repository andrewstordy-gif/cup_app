#include <Arduino.h>
#include <Wire.h>
#include <SparkFun_ST25DV64KC_Arduino_Library.h>

#include "config.h"
#include "drivers_nfc.h"
#include "drivers_json.h"

namespace drivers::nfc {

// --------------------------------------------------

static constexpr uint16_t MAX_RECORD_LEN = 768;

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

static bool readUidHex(SFE_ST25DV64KC_NDEF &tag, char *out, size_t len)
{
  uint8_t uid[8];

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

static bool writeSingleRecord(SFE_ST25DV64KC_NDEF &tag, const char *recordJson)
{
  if (!tag.writeCCFile8Byte()) {
    return false;
  }

  uint16_t memLoc = tag.getCCFileLen();

  const bool writeOk = tag.writeNDEFText(recordJson, &memLoc, true, true);
  return writeOk;
}

static bool ensureTagReady(SFE_ST25DV64KC_NDEF &tag)
{
  powerOn();
  Wire.begin();
  return tag.begin(Wire);
}

static void finishTagSession()
{
  Wire.end();
}

// --------------------------------------------------
// Public API
// --------------------------------------------------

void begin()
{
  SFE_ST25DV64KC_NDEF tag;
  if (!ensureTagReady(tag)) {
    finishTagSession();
    return;
  }

  char tmp[MAX_RECORD_LEN];
  if (!tag.readNDEFText(tmp, sizeof(tmp), 1)) {
    drivers::json::State    s;
    drivers::json::Status   st;
    drivers::json::Settings cfg;

    drivers::json::initState(s);
    drivers::json::initStatus(st);
    drivers::json::initSettings(cfg);

    writeSingleRecord(tag, drivers::json::encodeRecord(s, st, cfg, "{}"));
  }
  finishTagSession();
}

void end()
{
  powerOff();
}

bool writeCupRecords(
  const drivers::json::State    &state,
  const drivers::json::Status   &status,
  const drivers::json::Settings &settings
)
{
  SFE_ST25DV64KC_NDEF tag;
  if (!ensureTagReady(tag)) {
    finishTagSession();
    return false;
  }

  drivers::json::Status statusCopy = status;
  readUidHex(tag, statusCopy.uuid, sizeof(statusCopy.uuid));

  const bool ok = writeSingleRecord(
    tag,
    drivers::json::encodeRecord(state, statusCopy, settings, "{}")
  );
  finishTagSession();
  return ok;
}


bool readSettings(drivers::json::Settings &settings)
{
  SFE_ST25DV64KC_NDEF tag;
  if (!ensureTagReady(tag)) {
    finishTagSession();
    return false;
  }
  char buf[MAX_RECORD_LEN];
  if (!tag.readNDEFText(buf, sizeof(buf), 1)) {
    finishTagSession();
    return false;
  }
  const bool ok = drivers::json::decodeSettings(buf, settings);
  finishTagSession();
  return ok;
}

bool readState(drivers::json::State &state)
{
  SFE_ST25DV64KC_NDEF tag;
  if (!ensureTagReady(tag)) {
    finishTagSession();
    return false;
  }
  char buf[MAX_RECORD_LEN];
  if (!tag.readNDEFText(buf, sizeof(buf), 1)) {
    finishTagSession();
    return false;
  }
  const bool ok = drivers::json::decodeState(buf, state);
  finishTagSession();
  return ok;
}

bool readStatus(drivers::json::Status &status)
{
  SFE_ST25DV64KC_NDEF tag;
  if (!ensureTagReady(tag)) {
    finishTagSession();
    return false;
  }
  char buf[MAX_RECORD_LEN];
  if (!tag.readNDEFText(buf, sizeof(buf), 1)) {
    finishTagSession();
    return false;
  }
  const bool ok = drivers::json::decodeStatus(buf, status);
  finishTagSession();
  return ok;
}

} // namespace drivers::nfc
