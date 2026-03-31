#include <Wire.h>
#include "drivers_temp_sensor.h"
#include "config.h"

// -----------------------------
// I²C register helpers
// -----------------------------
uint8_t readReg(uint8_t addr, uint8_t reg) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(addr, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0xFF;
}

bool writeReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  uint8_t rc = Wire.endTransmission();
  return rc == 0;
}

namespace drivers::temp {

void begin() {
  Wire.begin();
  delay(12);   // boot time from datasheet

  // CTRL register (0x04)
  // You currently set 0x78 (BDU=1, IF_ADD_INC=1, AVG=??, etc.)
  writeReg(I2C_ADDR_STTS, 0x04, 0x78);
  //delay(30);
  Wire.end();
}

float read() {
  Wire.begin();
  // Re-use same config but set ONE_SHOT=1
  writeReg(I2C_ADDR_STTS, 0x04, 0x79);

  // Poll BUSY (STATUS bit0) until conversion complete
  while (readReg(I2C_ADDR_STTS, 0x05) & 0x01) {
    delay(2);
  }

  // Burst read 2 bytes starting from 0x06
  Wire.beginTransmission(I2C_ADDR_STTS);
  Wire.write(0x06);
  Wire.endTransmission(false);
  Wire.requestFrom(I2C_ADDR_STTS, (uint8_t)2);

  if (Wire.available() < 2) return NAN;

  uint8_t lo = Wire.read();
  uint8_t hi = Wire.read();

  int16_t raw = (int16_t)((hi << 8) | lo);
  return (float)raw / 100.0f;
  Wire.end();
}

void interrupt() {
  Wire.begin();
  // Clear any existing latch
  readReg(I2C_ADDR_STTS, 0x05);

  writeReg(I2C_ADDR_STTS, 0x02, TEMP_H_LIMIT_REG);
  writeReg(I2C_ADDR_STTS, 0x03, 0x00);

  // CTRL = 0xB8 (your known-good threshold + low ODR config)
  writeReg(I2C_ADDR_STTS, 0x04, 0xB8);
  Wire.end();
}

void end() {
  Wire.begin();
  // Optional: clear latched flags
  readReg(I2C_ADDR_STTS, 0x05);

  // Force power-down: ODR = 0, no conversions running.
  // Minimal safe setting: CTRL = 0x00.
  writeReg(I2C_ADDR_STTS, 0x04, 0x00);
  Wire.end();
}

}  // namespace drivers::temp
