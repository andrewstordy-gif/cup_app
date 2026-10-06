# CUP App — Current NDEF Message Format

> `docs/PRODUCT_SPEC.md` is the highest authority for product behaviour. This file is the normative application-side specification for the CUP NDEF protocol only where it does not conflict with the Product Specification. Protocol changes must update this document and the corresponding implementation/tests in the same change.

Implementation-facing protocol note for agents working on the CUP app NFC integration.

This document defines the current approved protocol contract. Source code, serializers, parsers, tests, and `README.md` are implementation and conformance evidence, not normative specifications. If implementation evidence disagrees with the Product Specification or this protocol, record a defect or unresolved migration issue; do not treat the implementation as authoritative. This document does not resolve product-policy decisions reserved by the Product Specification.

## 1. Message structure

A smart cup uses one NDEF message containing four ordered records. Record meaning is positional: the first text record is NDEF1, the second is NDEF2, and so on. The records do not carry custom names identifying them as NDEF1–4.

- Each record is an NFC Forum Well-Known Text record: `TNF_WELL_KNOWN` with `RTD_TEXT`.
- The language code written by the app is `en`.
- The text content of each record is a compact JSON object encoded by the NDEF text-record helper.
- The parser accepts only Well-Known Text records; any other TNF or record type decodes as `null`.
- For full smart-cup writes, the app always serializes four records in the fixed NDEF1, NDEF2, NDEF3, NDEF4 order.
- A missing, null, or non-object input payload serializes as the JSON object `{}`.
- Write-side serializers are allowlists. Unknown properties are dropped rather than copied to the physical tag.

## 2. NDEF1 — Cup state

NDEF1 carries the cup’s operating state. It is read and written by both the phone and cup firmware.

```json
{"s":1}
```

- `s` — integer cup state.
- `0` — OFF / sleeping.
- `1` — READY.
- `2` — BREWING.
- `3` — CUPPING.
- `4` — LOW BATTERY.

The write serializer accepts either `s` or the long alias `state` and always writes `s`. The read parser preserves `s` and also exposes `state`.

## 3. NDEF2 — Live cup status

NDEF2 is cup-owned telemetry. Under normal operation the firmware publishes it and the app reads it. The app should not fabricate or preserve stale live values when performing an app-owned write.

```json
{"t":235,"m":180,"b":78,"u":"<physical-cup-uuid>","v":"0.4.3"}
```

- `t` — temperature in tenths of a degree Celsius. For example, `235` represents 23.5 °C.
- `m` — elapsed time in seconds since water was poured.
- `b` — battery level as a percentage.
- `u` — physical cup UUID, normally the ST25DV tag/chip identifier.
- `v` — optional firmware version as a semantic-version string. Older firmware may omit it.

Read aliases: `t` becomes `temp`; `m` becomes `time`; `b` becomes `battery`; `u` becomes `UUID` and `uuid`; `v` becomes `firmwareVersion`. The parser also accepts legacy time keys `tm` and `ti`.

Write behavior: the generic serializer can write `t`, `m`, `b`, and `u`, but deliberately does not write `v`. Firmware version is read-only from the app’s perspective. For normal application writes, NDEF2 should be exactly `{}` so firmware can republish current status.

## 4. NDEF3 — Cup settings

NDEF3 stores firmware settings. The phone reads and writes these values; cup firmware consumes them.

```json
{"r":40,"a":96,"w":240,"c":70,"x":3600,"l":50,"k":3}
```

- `r` — trigger temperature in degrees Celsius; threshold associated with moving from OFF toward READY.
- `a` — maximum starting / water-pour temperature in degrees Celsius.
- `w` — brew time in seconds.
- `c` — maximum cupping temperature in degrees Celsius.
- `x` — maximum time in seconds before the firmware returns the cup to OFF.
- `l` — raw LED brightness value. The current settings UI displays a percentage and writes percentage × 2.
- `k` — LED count. The current UI supports 1 or 3.

Long write aliases are `triggerTemp`, `maxStartTemp`, `brewTime`, `maxCupTemp`, `maxTime`, `ledBrightness`, and `ledCount`. The parser expands `r`, `a`, `w`, `c`, `x`, and `l` to those long names while retaining the original compact properties. It currently retains `k` but does not add a separate `ledCount` alias; callers that need it read `text3.k` directly.

## 5. NDEF4 — Session and sample metadata

NDEF4 is app-owned metadata linking a physical cup to a coffee sample and cupping session.

```json
{"n":"Burundi","p":6,"y":3,"i":4,"z":2,"m":"b","f":1,"e":"Production QC","t":2,"d":260930,"u":"nfzyy8y0pqizn6"}
```

- `n` — coffee name and/or origin.
- `p` — coffee processing-method key.
- `y` — number of physical cups used for this sample.
- `i` — total number of samples in the session. Written when a valid integer is available.
- `z` — this sample’s one-based position in the session. Written when a valid integer is available.
- `m` — cupping mode: `b` for Blind Cupping or `o` for Open Cupping.
- `f` — cupping-form key. Release 1 defines `1` for SCA CVA and `2` for SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023).
- `e` — session name.
- `t` — session-type key.
- `d` — compact session date as a six-digit `YYMMDD` number.
- `u` — session UUID. Newly generated session IDs are 14 lowercase alphanumeric characters. `NO-SESSION` is also used as a sentinel for cups not attached to a saved session.

For both open and blind sessions, `n` may contain the real coffee name/origin and `p` may contain the real processing-method key. In blind mode, `m=b` instructs Cup App to retain those fields locally but exclude them from every participant-facing app projection until that participant explicitly completes the session. Completion durably reveals the locally held metadata on that device; it does not rewrite NDEF4, require connectivity or a host-global reveal, or share/upload results.

NDEF is participant-readable and is not a confidentiality boundary. Deliberate raw inspection with a third-party NFC reader can expose `n` and `p` and is outside the Release 1 threat model. This exception is limited to the documented session/sample metadata: results, tasting notes, participant data, credentials, access grants, tenant secrets, and device secrets remain forbidden from NDEF.

NDEF4 no longer contains a sample-colour field. Older examples may show `k` as a colour hex value; current code ignores that field and drops it on subsequent writes.

The read parser expands `n`, `p`, `y`, `i`, `z`, `e`, `t`, `d`, and `u` to `coffeeName`, `coffeeProcess`, `cupNumber`, `samplesInSession`, `sampleNumber`, `sessionName`, `sessionType`, `sessionDate`, and `sessionUUID`. Compact `m` and `f` remain present through object preservation; downstream code reads them directly or normalizes them as `cuppingMode` and `cuppingForm`.

## 6. NDEF4 enum mappings

### Processing method `p`

1 Washed (Wet); 2 Natural (Dry); 3 Honey (Pulped Natural); 4 White Honey; 5 Yellow Honey; 6 Red Honey; 7 Black Honey; 8 Anaerobic; 9 Anaerobic Washed; 10 Anaerobic Natural; 11 Carbonic Maceration; 12 Lactic Fermentation; 13 Extended Fermentation; 14 Hybrid; 15 Semi-Washed; 16 Pulped Natural; 17 Double Fermentation; 18 Reposado; 19 Experimental; 20 Yeast-Inoculated Fermentation; 21 Thermal Shock; 22 Co-Fermented; 23 Enzymatic Processing.

### Session type `t`

1 Sourcing Decision; 2 Quality Control; 3 Product Development; 4 Training Session; 5 Competition; 6 Other; 7 Quick Cupping.

### Cupping mode `m`

`b` Blind Cupping; `o` Open Cupping.

### Cupping form `f`

`1` SCA CVA Affective Assessment only; `2` SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023). No separate Release 1 value is assigned to CVA Descriptive, Physical, or Extrinsic assessments.

#### Approved Release 1 mapping — FR-028B

Product Specification requirement **FR-028B** is resolved for the two Release 1 forms by the mapping above. A reader or writer MUST treat any other `f` value as unsupported, fail visibly, and never guess or silently map it to SCA CVA. The application-level form registry MUST bind each supported NDEF value to exactly one immutable `(form_key, form_version, form-definition hash)` for a given protocol profile; an unambiguous bundled mapping is required for offline use.

Quick QC and Purchasing/selection are subsequent-release concepts and have no assigned or reserved NDEF values. An implementation agent MUST NOT invent, alias, persist, or transmit production values for them. Any future addition requires an approved protocol change, compatibility rules, and conformance evidence; it must not reinterpret `1` or `2`.

## 7. Read and write normalization

- `parseNdefMessageMinimal` reads records strictly by array position: indexes 0–3 become `text1`–`text4`.
- The parsed result contains both normalized objects and raw decoded strings under `parsed.raw.text1` through `parsed.raw.text4`.
- `buildNdefRecordsMinimal` always creates four records and compacts accepted long names to the one-letter keys documented above.
- Because each serializer is an allowlist, read-modify-write code must pass every supported value it intends to keep.
- A full-record write is not a patch. It replaces the tag’s NDEF message.

## 8. NTAG and metadata-only format

Standard NTAG sticker cups do not use the four-record smart-cup protocol. The app writes a single Well-Known Text record containing the same compact JSON that would normally be stored in NDEF4.

Because parsing is positional, this single record initially appears as `parsed.text1`. `nfcTagClassifier.js` recognizes the NDEF4-shaped metadata in that sole record and classifies the tag as an NTAG cup. NTAG tags do not supply smart-cup state, temperature, elapsed time, battery, firmware version, or NDEF3 settings.

## 9. Important smart-cup write contract

- Write the complete four-record message in fixed order for smart cups.
- For app-owned metadata or settings updates, write NDEF2 as exactly `{}`. Do not write cached or fabricated telemetry.
- Write the complete intended session/sample payload in NDEF4 rather than attempting a partial-field update.
- Preserve or intentionally set NDEF1 and NDEF3 according to the flow being implemented.
- Firmware 0.4.3 can restore a stale cached NDEF4 value after a later scan unless an app write invalidates the firmware cache by writing NDEF2 as `{}`.
- Review any caller that writes `parsed.text2` back into a full message: that conflicts with the documented firmware 0.4.3 integration contract.
- After changes to write behavior, verify the tag over multiple later scans, not only the immediate write response.

## 10. What is not stored in NDEF4

Scores, aroma/flavour selections, defects, notes, final results, live temperature, live timing, battery state, and the physical cup UUID are not part of NDEF4. Assessment data is stored in the app database. Live cup data belongs to NDEF2, while the physical cup identity is `NDEF2.u` on smart cups or the hardware tag ID on NTAG cups.

NDEF4 also never stores participant identity, completion/reveal state, share consent/state, outbox data, credentials, access grants, tenant secrets, or device secrets. A blind participant completing in Cup App changes only that participant's durable local presentation state; the tag payload is unchanged.

## 11. Implementation and conformance evidence

The following files show current implementation behaviour and are useful for conformance review. They are not normative specifications and do not override `docs/PRODUCT_SPEC.md` or this protocol:

- `src/services/nfcServiceMinimal.js` — record decoding, normalization, compaction, encoding, and NFC read/write operations.
- `src/features/cupping/constants/sessionDetails.js` — NDEF4 metadata construction, enum normalization, date compaction, and comparison.
- `src/services/nfcTagClassifier.js` — smart-cup versus NTAG classification and single-record metadata detection.
- `README.md` — descriptive protocol overview and firmware integration notes.
- Do not treat `archive/original-root-app` as the current protocol. It documents an older long-key schema.
