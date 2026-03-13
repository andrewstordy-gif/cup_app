#pragma once
#include <stdint.h>
#include "drivers_json.h"

enum class CupState : uint8_t {
  OFF         = 0,
  READY       = 1,
  BREWING     = 2,
  CUPPING     = 3,
  LOW_BATTERY = 4,
};

namespace states::fsm {
  void init(CupState start);
  void run();                 // call often from loop()
  CupState current();
  void force(CupState next);  // optional: manual jump (debug)

   // Shared parsed JSON (authoritative copies)
  drivers::json::State&    state();
  drivers::json::Status&   status();
  drivers::json::Settings& settings();
}
