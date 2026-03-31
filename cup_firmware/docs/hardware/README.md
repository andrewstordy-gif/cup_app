# Hardware Reference Docs

This folder contains the primary hardware references for the cup firmware.

## Documents

- [ATtiny1614-16-17-DataSheet-DS40002204A (1).pdf](./ATtiny1614-16-17-DataSheet-DS40002204A%20(1).pdf)
  - MCU architecture, sleep modes, RTC/PIT, clocking, GPIO, ADC, timers, TWI (I2C), interrupts.
- [stts22h.pdf](./stts22h.pdf)
  - Temperature sensor register map, one-shot operation, interrupt/threshold behavior, I2C interface.
- [st25dv04kc-2450072 (1).pdf](./st25dv04kc-2450072%20(1).pdf)
  - NFC dynamic tag behavior, NDEF over RF/I2C, LPD/GPO handling, memory map, mailbox/FTM.
- [cup_electronics.pdf](./cup_electronics.pdf)
  - Project schematic (pin mapping, pull-ups/pull-downs, power and signal wiring).

## Usage Notes

- Treat these PDFs as the source of truth for firmware behavior.
- When changing low-power logic, verify against the ATtiny sleep/RTC sections.
- When changing NFC flow, verify ST25DV power and interface arbitration requirements.
- When changing temperature flow, verify STTS22H register/interrupt details.
