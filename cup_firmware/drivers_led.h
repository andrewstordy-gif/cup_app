#pragma once
#include <Arduino.h>
#include "config.h"

namespace drivers::led {
  void begin();
  void on();
  void off();
  void end();
}
