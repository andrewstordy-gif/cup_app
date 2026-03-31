# ST25DVxxKC – RF Activity Detection via I²C (README)

## Objective
Determine how an MCU can detect:
1. “Phone is currently interacting with the tag”
2. “An RF event just occurred”

via I²C dynamic registers on the ST25DVxxKC.

---

## 1. Dynamic Register Summary

| Register | Address | Purpose | Type |
|----------|--------|--------|------|
| GPO_CTRL_Dyn | 0x2000 | Enable/disable GPO output | Control |
| RF_MNGT_Dyn | 0x2003 | RF mode (off/sleep/disabled) | State |
| IT_STS_Dyn | 0x2005 | RF event flags (interrupt status) | Event / latched |
| MB_CTRL_Dyn | 0x2006 | Mailbox (FTM) status | State |

---

## 2. IT_STS_Dyn (Key Register)

Address: 0x2005  
Type: Event / Latching register  

Behavior:
- Accumulates RF events
- Reading clears all bits

### Bits

| Bit | Name | Meaning |
|-----|------|--------|
| b0 | RF_USER | GPO control event |
| b1 | RF_ACTIVITY | RF access occurred |
| b2 | RF_INTERRUPT | RF interrupt request |
| b3 | FIELD_FALLING | RF field removed |
| b4 | FIELD_RISING | RF field detected |
| b5 | RF_PUT_MSG | RF wrote mailbox |
| b6 | RF_GET_MSG | RF read mailbox |
| b7 | RF_WRITE | EEPROM write via RF |

---

## 3. MB_CTRL_Dyn (Mailbox State)

Address: 0x2006  
Type: Continuous state  

| Bit | Name | Meaning |
|-----|------|--------|
| b0 | MB_EN | Mailbox enabled |
| b1 | HOST_PUT_MSG | I²C wrote message |
| b2 | RF_PUT_MSG | RF wrote message |
| b4 | HOST_MISS_MSG | Host missed RF read |
| b5 | RF_MISS_MSG | RF missed host read |
| b6 | HOST_CURRENT_MSG | Current msg from host |
| b7 | RF_CURRENT_MSG | Current msg from RF |

Behavior:
- Not cleared on read
- Updates with mailbox state

---

## 4. RF_MNGT_Dyn

Address: 0x2003  

| Bit | Name | Meaning |
|-----|------|--------|
| b0 | RF_DISABLE | Blocks RF commands |
| b1 | RF_SLEEP | RF silent |
| b2 | RF_OFF | RF fully off/reset |

---

## 5. GPO_CTRL_Dyn

Address: 0x2000  

| Bit | Name | Meaning |
|-----|------|--------|
| b0 | GPO_EN | Enable GPO output |

---

## 6. GPO Static Configuration (GPO1 @ 0x0000)

| Bit | Signal |
|-----|--------|
| b2 | RF_ACTIVITY_EN |
| b3 | RF_INTERRUPT_EN |
| b4 | FIELD_CHANGE_EN |
| b5 | RF_PUT_MSG_EN |
| b6 | RF_GET_MSG_EN |

---

## 7. Event vs State

| Register | Type | Clears on Read |
|----------|------|----------------|
| IT_STS_Dyn | Event | Yes |
| MB_CTRL_Dyn | State | No |
| RF_MNGT_Dyn | State | No |
| GPO_CTRL_Dyn | Control | No |

---

## 8. Detection Strategy

### RF event occurred
Use IT_STS_Dyn

### RF currently active
- Best I²C option: IT_STS_Dyn.RF_ACTIVITY (event-based)
- Best real-time: GPO pin with RF_ACTIVITY_EN

### Mailbox communication
Use MB_CTRL_Dyn

---

## 9. Conclusion

- I²C provides event detection (not continuous RF state)
- GPO pin provides real-time RF activity indication

Recommended:
Use GPO interrupt + IT_STS_Dyn read
