#pragma once

// Firmware version
static constexpr uint8_t FIRMWARE_VERSION_MAJOR = 1;
static constexpr uint8_t FIRMWARE_VERSION_MINOR = 0;
static constexpr uint8_t FIRMWARE_VERSION_PATCH = 1;
static constexpr char FIRMWARE_VERSION[] = "1.0.1";

// Default cup settings
constexpr uint8_t DEFAULT_TRIGGER_TEMP = 40;  // Temp that the cup swiches on
constexpr uint8_t DEFAULT_MAX_START_TEMP = 93; // Max alowable water temp when brew state starts
constexpr uint16_t DEFAULT_BREW_TIME = 240; // Max brew time
constexpr uint8_t DEFAULT_MAX_CUP_TEMP = 70; // Max temp for cupping
constexpr uint16_t DEFAULT_MAX_TIME = 3600;  // max total time of cuppong and brewing
constexpr uint8_t DEFAULT_LED_BRIGHTNESS = 100;              // LED power 0-255 (brightness/current)



// I²C address of the STTS22H temperature sensor
constexpr uint8_t I2C_ADDR_STTS = 0x3F;    // I2C Adress for STTS temp sensor (0111 111 (0x7E write, 0x7F read))
constexpr uint8_t TEMP_H_LIMIT_REG = 126;  // ≈ +40 °C
constexpr uint8_t TEMP_L_LIMIT_REG = 0x00;    // ≈ −39.68 °C (lowest possible)


//PINS

constexpr uint8_t LED2_PIN = 0;               // PA4
constexpr uint8_t LED3_PIN = 1;               // PA5
static constexpr uint8_t BATT_GND_PIN   = 2;  // PA6
static constexpr uint8_t BATT_SENSE_PIN = 3;  // PA7
static constexpr uint8_t ST25DVLPD_PIN = 4;   // LPD pin for NFC.
constexpr uint8_t ST25DVPWR_PIN = 5;          // Power pin for NFC.
static constexpr uint8_t TOSC2_PIN = 6;       // PB2 TOSC2
static constexpr uint8_t TOSC1_PIN = 7;       // PB3 TOSC1
static constexpr uint8_t SDA_PIN = 8;         // PB1
static constexpr uint8_t SCL_PIN = 9;         // PB0
static constexpr uint8_t NC1_PIN = 10;        // PC0
static constexpr uint8_t INT2_PIN = 11;       // PC1
constexpr uint8_t INT1_PIN = 12;              // PC2
static constexpr uint8_t NC2_PIN = 13;        // PC3
static constexpr uint8_t TX_PIN = 14;         // PA1 TX
static constexpr uint8_t RX_PIN = 15;         // PA2 RX
constexpr uint8_t LED1_PIN = 16;              // PA3

//BATTERY

// Divider gain = (R1 + R2) / R2 = 1.33M / 330k ≈ 4.03
static constexpr float BATT_R1_OHMS = 1000000.0f; // resister 1
static constexpr float BATT_R2_OHMS = 330000.0f;  // resister 2
static constexpr float BATT_GAIN    = (BATT_R1_OHMS + BATT_R2_OHMS) / BATT_R2_OHMS;

// ADC reference (megaTinyCore INTERNAL1V1)
static constexpr float ADC_VREF_VOLTS = 1.1f;
static constexpr float ADC_MAX_COUNT  = 1023.0f;

 // Simple linear mapping: 2.6 V = 0 %, 3.1 V = 100 %
static const float V_EMPTY = 2.6f;
static const float V_FULL  = 3.1f;
