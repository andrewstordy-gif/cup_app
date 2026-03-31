# Digital Cup Project (Cup Design)

A temperature-sensing, NFC-enabled beverage vessel for cupping and beverage evaluation. The aim is to capture **temperature over time**, exchange **settings/status** via **NFC**, and provide simple **user feedback** (LEDs) while keeping **standby power extremely low**.

## What it does

- Measures beverage temperature (I²C temperature sensor)
- Stores/reads **State / Settings / Status** via **NDEF records** on an NFC tag
- Wakes on NFC field detection and/or periodic RTC ticks
- Minimises power by sleeping most of the time and disabling peripherals when idle

## Hardware (as per schematic)

### Core electronics
- **MCU:** ATtiny1616-MF  
- **NFC:** ST25DV64KC (I²C + NDEF)  
- **Temperature sensor:** STTS22H I²C + optional interrupt
- **User feedback:** 3 discrete LEDs on nets **LED1/LED2/LED3**, each with **56 Ω** series resistor to a common **GND** return  

### Clock / RTC accuracy
- **32.768 kHz crystal** on PB2/PB3 (TOSC pins) with **33 Ω** series resistors and **11 pF** load capacitors  

### NFC antenna / matching
- Antenna connected to **AC0/AC1** via nets **ANT1/ANT2**
- **R9/R10 = 0 Ω** links in series
- Optional tuning capacitor **C8 = 4 pF** is shown but crossed out (DNP / not fitted on this sheet)

### Pulls, decoupling, and power nets
- Bulk capacitor **C3 = 4.7 µF** across **VCC–GND**
- Decoupling caps **0.1 µF** on MCU and NFC rails (multiple 100 nF caps shown)
- **I²C pull-ups:** **2.2 kΩ** on **SCL** and **SDA**
- **INT2 pull-down:** **1 MΩ** to GND (NFC GPO wake line)
- **INT1 pull-up:** **100 kΩ** to VCC (sensor interrupt line)

### Battery measurement (low-leakage approach)
- Divider: **R5 = 1 MΩ** from VCC to **BAT-SEN**, and **R14 = 330 kΩ** from BAT-SEN to **BAT-GND**
- **BAT-GND** is a dedicated net driven by the MCU (use: switch the divider on only when measuring)

### Key signal mapping (from the sheet)
- **SCL/SDA** shared between MCU, ST25DV, and (optionally) STTS22H
- **INT2** comes from ST25DV **GPO(CMOS)** (wake pulse)
- **LPD** connected between MCU and ST25DV (used for NFC low-power control)
- **ST25DV-PWR** net feeds ST25DV VCC with local decoupling

## Firmware overview

### NFC + NDEF layout (matches NDEF_message_specification.xlsx)

The tag stores a **4-record NDEF layout**:

**NDEF Text 1 — Cup state (JSON)**
- `state` (uint8): 0–4 (see state table)
- Cup: Writes / Reads  
- Phone: Writes / Reads  

**NDEF Text 2 — Cup status (JSON)**
- `temp` (uint16): temperature ×10  
- `time` (uint16): seconds since water was poured into the cup  
- `battery` (uint8): 0–100 (%)  
- `UUID` (string/value): ST25DV chip UUID  
- Cup: Writes (and may read)  
- Phone: Reads  

**NDEF Text 3 — Cup settings (JSON)**
- `triggerTemp` (uint8): threshold to move from state 0 → 1  
- `maxStartTemp` (uint8): max water pour temperature  
- `brewTime` (uint16): required brew time (s)  
- `maxCupTemp` (uint8): max water temperature to start cupping  
- `maxTime` (uint16): max time before returning to state 0 (s)  
- `ledBrightness` (uint8): 0–255 PWM brightness  
- Cup: Reads  
- Phone: Writes / Reads  

**NDEF Text 4 — Cupping app parameters (JSON)**
- `coffeeName` (string)  
- `coffeeProcess` (string)  
- `dateTime` (UNIX timestamp)  
- Cup: N/A  
- Phone: Writes / Reads  

### Important serial note (board-specific)
On this hardware, serial output requires:

```cpp
Serial.swap();
```


