#pragma once

namespace drivers::temp {
  void begin();      // initalise the sensor.
  float read();      // read the temp usng one shot mode.
  void interrupt();  // set the sensor up with an inerupt.
  void end();   // force STTS22H into power-down (ODR=0, no conversions)
}

