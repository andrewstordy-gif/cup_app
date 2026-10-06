# Cup App — Product Specification v1.0

**Status:** Released
**Version:** 1.1
**Release date:** 1 October 2026
**Last reviewed:** 2 October 2026
**Evidence base:** 11 customer interviews, the MVP-filtered demand review, and the current Version 2 website
**Product principle:** Cup the coffee, not the app.
**Release constraint:** Ship first with user-supplied, off-the-shelf NFC tags; add Smart Cup capabilities without replacing the core workflow.

## 1. Executive summary

Cup App is a focused live-cupping companion for coffee professionals. Its first release works with inexpensive, off-the-shelf NFC tags applied to existing cups. Scanning a tag opens the correct sample, gives each taster a fast way to record observations, and produces a useful session record that can be exported into existing systems.

Smart Cups are a later enhancement, not a launch dependency. When the hardware is ready, the same tag identity, session, sample, form, response, and export model will accept time, temperature, and device-status data from a Smart Cup.

The account boundary is simple: a person needs an account only to create and manage a cupping session. Tasting in someone else's session—including joining, scanning NFC cups, recording results, and submitting—does not require an account.

The first release should not attempt to replace Cropster, Catador, Coffee Roast, an ERP, or a laboratory quality-management system. Its wedge is the part those systems handle poorly: fast, low-error capture at the cupping table.

### Recommended first customer and workflow

The primary initial customer is a small-to-medium roastery conducting routine QC or purchasing cuppings with 1–10 tasters using its existing cups and user-supplied NFC tags.

The primary workflow is:

1. A host creates a session and adds samples.
2. Cups are assigned to samples by scanning NFC identity.
3. Participants join without creating an account.
4. A taster scans a cup to open the correct sample and form.
5. The taster records a quick result, notes, descriptors, and optional scores.
6. After each participant explicitly shares their completed results, the host reviews them and exports a CSV or PDF summary in the online portal.

### MVP outcome

A team should be able to buy compatible NFC tags and attach one to each existing cup once, turning it into a reusable NFC cup. At the start of a session, the host assigns each NFC cup to the relevant coffee sample. For subsequent sessions, the team should move from “cups are on the table” to “everyone is recording against the right sample” in under two minutes. No Smart Cup hardware, guest accounts, or manual code matching should be required.

### Confirmed release assumptions

- Release 1 works with compatible off-the-shelf NFC stickers; Stordy may also sell tested stickers, but third-party compatible tags remain supported.
- Only hosts need paid accounts. Participants join, taste, and keep local results without an account or internet connection. Release 1 pricing remains TBC.
- The host selects one of exactly two Release 1 forms for the session: SCA CVA or SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023). Every cup scan opens that form.
- Cup App operates offline throughout setup and tasting. A participant's results stay private on their device until they deliberately press **Share results** after completion.
- Shared results and reports are available to the host through an online portal. The mobile app remains focused on running and participating in cuppings.
- Release 1 uses native device voice capture/dictation with editable text. Smart Cup timing and temperature, supplier-label extraction, and AI descriptor identification/colouring belong to Release 2.
- The NFC payload follows the project's canonical NDEF protocol rather than a second format defined by this product specification.

## 2. Evidence-led product thesis

Across the interviews, six needs recur:

| Need | Product response | Evidence strength |
| --- | --- | --- |
| Avoid notes being entered against the wrong sample | Scan the physical cup to open the assigned sample and form | Very strong |
| Keep live cupping fast and unobtrusive | Account-free participation, large tap targets, autosave, minimal required fields | Very strong |
| Add differentiated sensing when Smart Cups are ready | Extend the same tasting event with measured time and temperature | Strong, but not required to launch |
| Preserve and share useful records | Explicit participant sharing followed by portal history, summaries, and CSV/PDF export | Very strong |
| Support formal professional cupping | SCA CVA and SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023) in Release 1; shorter operational forms remain a subsequent-release opportunity | Strong |
| Work alongside existing systems | Export-first integration model | Strong |

The product is therefore best understood as a **sample-identity and sensory-capture layer**. In Version 1, the NFC tag is the physical link. Smart Cups later enrich the same record with sensor context.

## 3. Goals and non-goals

### 3.1 Goals for the first pilot release

- Eliminate or materially reduce wrong-sample data entry.
- Require an account only for creating and managing sessions; joining and tasting must remain account-free.
- Keep the common tasting action to a scan plus a small number of taps.
- Support SCA CVA and SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023).
- Operate without an internet connection throughout session setup and cupping; connectivity is required only when a participant deliberately shares results after completion.
- Defer sensory timing to Release 2, where a Smart Cup can automatically detect brew start and give note times meaningful context.
- Support blind cupping by withholding protected coffee metadata from participant-facing Cup App surfaces until that participant explicitly completes the session.
- After results are shared, give the host a clear view of completion, disagreement, and incomplete entries.
- Produce exportable records that fit spreadsheet-based and existing-system workflows.
- Launch with inexpensive, off-the-shelf, NDEF-compatible NFC tags attached to customers' existing cups.
- Preserve one identity model so Stordy NFC Cups and Smart Cups can join later without changing the user workflow.
- Remain credible in professional settings through reliability, accessibility, and transparent hardware status.

### 3.2 Non-goals for the first pilot release

- Replacing Cropster, Catador, Coffee Roast, ERP, inventory, contract, or roast-logging systems.
- Full sample lifecycle management from offer sample through contract, shipment, arrival, production, and CRM.
- Advanced calibration analytics or long-term taster drift analysis.
- Deep two-way integrations or guaranteed Cropster write-back.
- A full form builder capable of reproducing every customer workflow.
- Competition, Cup Tasters, café service, guided consumer tasting, or remote synchronized cupping modes.
- Automated AI flavour interpretation in Release 1, or automated purchasing recommendations in any initial release.
- Hardware fleet maintenance beyond essential status, battery, and identity information.

## 4. Users and jobs to be done

### 4.1 Primary users

**Session host / QC lead**

- Creates the session, adds samples, assigns cups, selects the form, and monitors completion.
- Needs confidence that each result belongs to the correct coffee.
- Needs a fast summary and an export that can be used elsewhere.

**Taster / account-free participant**

- Joins a session and records impressions while moving around the table.
- May use the app frequently, occasionally, or for the first time.
- Needs the correct sample/form to appear immediately and must not be slowed by authentication or dense controls.

**Team or company administrator**

- Manages core members, default forms, export settings, and session ownership.
- Needs sensible access control without making guest participation difficult.

### 4.2 Secondary users

- Green coffee buyer comparing samples for purchase.
- Trainer running calibration exercises.
- Large-lab operator using tablets or shared devices.
- Producer/exporter confirming sample type against pre-shipment or arrival samples.

### 4.3 Core jobs

1. **When I am tasting several coffees, help me open the correct record from the physical cup so I do not attach observations to the wrong sample.**
2. **When the table is busy, let me capture a useful result without distracting me from tasting.**
3. **When Smart Cups become available, link each observation to elapsed brew time and measured temperature.**
4. **When a session ends, give me a record I can share, search, or move into the system my team already uses.**
5. **When I run a blind session, hide identity in the participant's Cup App workflow during tasting, retain correct traceability, and reveal the locally held metadata when that participant completes.**

## 5. Scope and release strategy

### 5.1 Release 1 — NFC Tag MVP

- Host authentication, required only when a user chooses to create or manage a session.
- Host organisation/workspace.
- Paid host/workspace positioning from launch: creating and managing sessions requires a paid plan or an active trial/pilot entitlement; the actual price is TBC.
- Account-free participation remains free. Participants can join, scan NFC cups, record observations, and submit results without payment.
- Any free trial or complimentary pilot access must be explicitly limited by time or session count so it does not establish an expectation of permanent free session creation.
- A valid paid/trial entitlement is cached for offline use. Billing or connectivity problems must never interrupt an active session or prevent access to existing records; entitlement expiry may prevent creation of a new session after a clearly communicated grace period.
- Create, edit, start, complete, and archive a session.
- Add samples manually with a minimal metadata set.
- Turn existing cups into NFC cups by attaching compatible off-the-shelf NFC tags.
- Add those NFC cups to Cup App through a one-time identification/setup step.
- Assign one or more NFC cups to each sample by tapping/scanning the cup's tag or using a manual fallback.
- When an NFC cup is assigned, write the compact session and sample metadata defined by the canonical NDEF protocol. A standard NTAG sticker carries one Well-Known Text record containing the NDEF4 JSON payload.
- Scanning the NFC cup adds the referenced session to the participant's app and opens that cup within the session. Tasting notes, scores, results, and participant data are never stored on the tag.
- Account-free join by link/QR/session code with display name only.
- Scan cup to open the correct tasting screen.
- Blind mode with per-participant reveal when that participant explicitly completes the session; reveal persists on that device and is separate from sharing.
- Exactly two session forms: SCA CVA and SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023). Each includes the descriptive inputs appropriate to that form.
- Autosaved notes, descriptors, result, and optional score.
- Native device voice capture/dictation for flavour notes, producing editable text with typed input as the fallback.
- Deterministic matching of recognised SCA flavour-wheel descriptors to their established categories and colours; the text category remains visible and colour is never the only cue.
- Native voice input must not introduce a custom cloud transcription dependency into the offline tasting workflow.
- Fully offline session creation, NFC scanning, note capture, editing, and local review after the app and host account have been prepared.
- Explicit post-completion sharing: results remain private and local until the participant presses **Share results**; if offline, the share is queued until connectivity returns.
- An online host portal containing shared individual and aggregate results, incomplete-submission handling, session history, search, CSV export, and a printable/PDF summary.
- Installed mobile app support for current iOS and Android devices, with offline NFC reading and local storage treated as launch requirements.
- Clear degraded behaviour when NFC or connectivity is unavailable.
- A fresh encrypted Release 1 local database. Pre-release prototype data is disposable and has no importer or user-facing migration flow; this requirement does not authorise deleting any existing prototype data. Forward migration and recovery remain mandatory from the first production schema onward.
- Reliable access to the online Release 1 capabilities from mainland China without a mandatory Google-hosted dependency. Physical hosting in mainland China is not required.

Release 1 must be useful and commercially releasable without Stordy hardware. Smart Cup readiness is an architectural constraint, not a launch acceptance criterion.

### 5.2 Release 2 — Smart Cup and AI enrichment

- Register Stordy NFC Cups and Smart Cups through the same cup identity model.
- Pair or otherwise associate a Smart Cup's sensor identity with its NFC identity.
- Let a Smart Cup detect water addition and add a brew-start event automatically.
- Record the elapsed brew time and measured temperature associated with each tasting note.
- Attach sensor and timing provenance so the app can distinguish measured data from unavailable or manually corrected data.
- Display device health, data freshness, and graceful sensor-unavailable states.
- Provide configurable readiness/timing prompts where supported by the hardware.
- Plot temperature readings against real tasting events without inventing continuous data.
- Let a user optionally photograph a supplier's sample label.
- Use a vision-capable language model to transcribe the label and propose structured sample fields such as supplier reference, origin, producer, variety, process, altitude, and harvest information.
- Preserve the original label image, raw extracted text, and supplier-specific attributes alongside normalized fields.
- Require user review before extracted values become accepted sample data; uncertain or absent information must be flagged rather than guessed.
- Allow the photograph to be captured offline and queue model extraction until internet access is available.
- Use a language model to identify descriptor phrases automatically in free-form notes, including compound or culturally specific descriptions such as “banana bread” that are not entries in the SCA flavour wheel.
- Preserve the user's exact wording, assign each identified descriptor a colour from the closest sensory family, and display it as a coloured pill. The user can correct or remove a result, but does not need to approve every suggestion before it appears.
- Treat the SCA flavour wheel as a colour framework and starting vocabulary, not as a closed list of valid descriptors.

Release 2 must not require customers to recreate samples, retag cups, learn a different tasting flow, or migrate Release 1 records.

### 5.3 Pilot-plus — next after evidence

- Reusable organisation-specific form templates with constrained custom fields.
- Sample-stage labels and comparisons: offer, type, pre-shipment, arrival, production.
- Team disagreement view and simple calibration summary.
- Multiple temperature-linked tasting events using Smart Cups.
- Import from CSV and richer export templates.
- Shared-tablet/lab mode.
- Basic API/export connector for pilot customers.

### 5.4 Later opportunities

- Training and calibration exercises.
- Cup Tasters / triangulation with instant reveal and leaderboard.
- Remote or multi-location sessions.
- Advanced custom forms and customer-specific workflows.
- Longitudinal sample history and taster calibration analytics.
- Guided premium tasting and café presentation modes.
- Selling coffee through the app, including linking a tasted sample or coffee record to a product offer and purchase flow.
- Deep integrations with Cropster, Coffee Roast, ERP, and roast-profile systems.
- Order randomisation and bias-mitigation experiments.

## 6. Core experience

### 6.1 Navigation model

The signed-in host mobile experience has three primary destinations:

1. **Sessions** — upcoming, live, completed, and archived sessions.
2. **New session** — rapid session setup.
3. **Settings** — account, defaults, NFC cups, and offline status.

Account-free participants enter directly into one session and do not see host navigation. The signed-in host uses the online portal for shared results, session history, team administration, billing, search, and exports.

### 6.2 Host flow: create and run a session

1. Select **New session**.
2. Enter a session name; date/time defaults to now.
3. Choose a mode:
   - SCA CVA
   - SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023)
4. Add samples individually or paste/import a simple list.
5. Set blind or visible identity.
6. Assign cups:
   - Tap an NFC cup already known to the app, or add a newly tagged NFC cup.
   - Select the sample it belongs to.
   - Write and verify the protocol-defined session/sample payload on the attached NFC tag.
   - Repeat for multiple cups belonging to one sample.
7. Review readiness warnings: unassigned samples, duplicate cup assignment, unwritten protocol payloads, and failed tag verification.
8. Start the session.
9. Share a QR code, link, short join code, or the NFC cups themselves. The active session remains available without internet.
10. During offline cupping, each participant can monitor their own completion; the host sees combined team progress after devices share their results.
11. End the host session when appropriate. This does not globally reveal or conceal identity on participant devices.
12. Each participant's explicit completion has already revealed the locally held coffee metadata on that participant's device. Participants separately decide whether to share their completed results. Once connectivity is available, explicitly shared results appear in the host's online portal, where the host can manage incomplete submissions and exports.

### 6.3 Account-free participant flow: join and taste

1. Open the join link, scan the session QR code, or tap an NFC cup. An NFC tap reads the protocol-defined metadata locally and adds the session to the participant's app without contacting the internet.
2. Enter a display name; no account, password, or invitation acceptance is required.
3. Accept a short session-specific privacy notice.
4. If the participant joined by link or QR code, scan a cup or use the clearly labelled manual fallback. If they joined by tapping an NFC cup, that cup is already selected.
5. See the assigned blind code or sample name and the selected form.
6. Record observations using large controls and short free text.
7. Save or move to the next cup; autosave protects partial work.
8. Re-scan any cup to resume its entry.
9. Explicitly complete the session locally. In a blind session, that completion durably reveals the coffee metadata already held on this device and it remains revealed if the participant later reopens or edits results where policy allows. Completion/reveal creates no share consent, outbox item, or upload. Results remain private on the device unless the participant separately presses **Share results**; an offline share is then queued until connectivity returns.

### 6.4 Subsequent-release Quick QC form

Quick QC is not a Release 1 form and has no assigned NDEF form value. The following evidence-backed outline is retained for a separately approved subsequent release.

Required default fields:

- Overall result: Approve / Approve with concern / Reject.
- Defect present: Yes / No / Unsure.
- Short notes.

Optional default fields:

- Aroma/fragrance.
- Flavour.
- Consistency.
- Intended disposition: normal use / review / alternate use / hold.
- Confidence: low / medium / high.

The organisation may hide optional fields, but a future scoped release should not expose a general-purpose form builder by default.

### 6.5 Subsequent-release Purchasing/selection form

Purchasing/selection is not a Release 1 form and has no assigned NDEF form value. The following evidence-backed outline is retained for a separately approved subsequent release.

- Decision: advance / hold / decline.
- Overall score, optional.
- Descriptors and notes.
- Defects/concerns.
- Suitability tags, for example filter, espresso, blend, or customer project.
- Sample stage, optional.
- Confidence.

### 6.6 SCA forms

- Release 1 supports both SCA CVA and SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023).
- In Release 1, **SCA CVA means the CVA Affective Assessment only**. Descriptive, Physical, and Extrinsic CVA assessments are not additional Release 1 forms. Preserve the existing Affective UI where it works, subject to source-derived validation.
- Their scoring, descriptive inputs, validation, and calculated values are versioned independently so historical responses retain their original meaning.
- The Legacy form preserves the meaning of its own marked quality scales, cup-by-cup checks, and defect deductions; it is not the CVA Affective button-based input with a different label.
- Both Release 1 forms allow 1–8 physical cups per sample, as in the current cup-count selector.
- For Legacy Uniformity, one cup always scores 10. With `n` cups from 2–8, the score is `10 × c ÷ n`, where `c` is the number of cups the taster judges consistent (`0 ≤ c ≤ n`).
- For Legacy Sweetness and Clean Cup, assess each cup separately. For each attribute and `n` cups from 1–8, its sample score is `10 × q ÷ n`, where `q` is the number of cups judged to qualify for that attribute (`0 ≤ q ≤ n`). With one cup, each of these attributes scores either 0 or 10; unlike them, one-cup Uniformity is always 10.
- With five cups, these three cup-wise calculations reproduce the historical 2-points-per-qualifying-cup rule. For other counts they are Cup App adaptations.
- For each Legacy taint or fault affecting `a` of `n` cups (`1 ≤ n ≤ 8`, `0 ≤ a ≤ n`), the deduction is `severity × a × 5 ÷ n`, where severity is 2 for a taint or 4 for a fault. With five cups this reproduces the historical per-affected-cup deduction; for other counts it is a five-cup-equivalent Cup App adaptation.
- Any displayed non-five-cup Legacy total must be clearly labelled as adapted, not presented as an unqualified standard five-cup SCAA result. The exact form-definition version, numeric precision, and presentation require independent design review before implementation.
- The host selects the form for the session; participants do not select or change it during tasting.
- The product may simplify screen layout for use at the table, but it must preserve the meaning and required fields of the selected form.

Release 1 stores observations locally and does not present note timing as sensory data. Results upload only after the participant explicitly chooses **Share results**. Release 2 uses the Smart Cup's automatic brew-start event to associate each note with meaningful elapsed brew time and measured temperature.

### 6.7 Turning an existing cup into an NFC cup

1. The user attaches a compatible off-the-shelf NFC tag to an existing cup. The physical cup now functions as an NFC cup.
2. The host selects **Add NFC cup** in Cup App.
3. Cup App identifies the attached tag and creates a reusable NFC cup record.
4. The host may give the NFC cup a short internal label, for example `Cup 01`.
5. The host verifies that the attached tag can be read and written.
6. The NFC cup enters a reusable cup list.
7. When the cup is assigned in a session, Cup App writes and verifies the protocol-defined session/sample metadata. Assigning the cup to a later session replaces the earlier assignment payload.

The authoritative format is the project's [NDEF protocol](NDEF_PROTOCOL.md), implemented by `src/services/nfcServiceMinimal.js` and classified by `src/services/nfcTagClassifier.js`. A standard NTAG sticker contains one Well-Known Text record carrying the compact NDEF4 JSON. A Smart Cup contains one NDEF message with four ordered Well-Known Text records; its fourth record uses the same session/sample payload. The product specification does not redefine those fields.

For blind sessions, NDEF4 may retain the real coffee name/origin in `n` and processing method in `p`. Cup App uses `m=b` plus the participant's local completion state to keep those fields out of every participant-facing app surface during tasting, then reveal the locally held metadata permanently on that device when the participant explicitly completes. Completion does not require a tag rewrite, internet connection, host-global reveal, reveal QR, or result upload. A participant deliberately inspecting raw tag bytes with a third-party NFC reader is outside the Release 1 threat model; NDEF still must never contain results, participant data, credentials, tenant secrets, or device secrets.

## 7. Functional requirements

Priority uses **P0** for pilot blockers, **P1** for high-value follow-on work, and **P2** for later opportunities.

### 7.1 Identity, access, and organisations

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-001 | P0 | Creating or managing a cupping session requires a paid host account or active trial/pilot entitlement; price is TBC. | An unauthenticated user can join and taste but is asked to sign in only after choosing **Create session**. Expired entitlement never interrupts an active offline session or blocks existing records. |
| FR-002 | P0 | A participant can join a live session with a display name and no account. | A first-time participant reaches the tasting screen in no more than three actions after opening a join link, scanning a session QR code, or tapping an assigned NFC cup. |
| FR-003 | P0 | Account-free participant access is scoped to one session and expires. | The participant token cannot open other sessions and expires after a configurable period following session completion. |
| FR-004 | P0 | A host can remove an incomplete or invalid evaluator from aggregate results without deleting the raw record. | The summary changes, the exclusion is labelled, and an audit record is retained. |
| FR-005 | P1 | Organisations can manage core member roles. | Admin, host, and member permissions are enforced. |

### 7.2 Session and sample setup

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-010 | P0 | A host can create a session using either SCA CVA or SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023). | A session can be ready for cup assignment with only name and one of the two Release 1 forms supplied; the form identifier is included in the NDEF4 session/sample payload. |
| FR-011 | P0 | A host can add, edit, reorder, and remove samples before the session starts. | Changes are reflected consistently in assignment and participant views. |
| FR-012 | P0 | Minimal sample metadata includes name or code; optional fields include supplier, origin, process, lot, roast reference, sample stage, and notes. | Only one identifying field is required. |
| FR-013 | P0 | Blind mode substitutes neutral codes for protected coffee metadata in participant-facing Cup App surfaces until that participant completes. | Before explicit participant completion, protected coffee metadata is absent from the participant UI, accessibility output, page titles, notifications, cached previews, ordinary app diagnostics, and participant network responses. NDEF4 may still contain the real `n` name/origin and `p` process under the section 6.7 threat-model exception. |
| FR-014 | P0 | Explicit participant completion reveals the coffee metadata already held locally for that participant. | Completion and reveal are recorded durably and atomically, work offline, remain visible on that device during later permitted review/editing, and do not create share consent, an outbox item, or an upload. No host-global reveal, reveal QR, network refresh, or tag rewrite is required. |
| FR-015 | P1 | A host can duplicate a prior session. | Samples and form settings copy; results, participants, and cup assignments do not. |

### 7.3 Cup assignment and scanning

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-019 | P0 | A host can add an existing cup with an attached off-the-shelf NFC tag as an NFC cup. | Cup App creates a reusable NFC cup record and verifies that the attached tag can be read and written. |
| FR-020 | P0 | An added NFC cup has a reusable identity. | The NFC cup can be named once and reassigned between sessions while its stored session reference is updated. |
| FR-021 | P0 | A host can assign one or more cups to one sample. | Both Release 1 forms support 1–8 physical cups per sample, including common 1-, 3-, 5-, and 6-cup workflows, without special cases in assignment. |
| FR-022 | P0 | A cup cannot be assigned to two samples in the same live session. | A duplicate assignment is blocked with a corrective message. |
| FR-023 | P0 | Scanning a cup in a live session opens the correct assigned record. | The resolved sample/cup pairing is deterministic and logged. |
| FR-024 | P0 | Manual code/search fallback is available when NFC is unsupported or fails. | A taster can continue without losing work, and the UI labels that identity was manually selected. |
| FR-025 | P0 | Unknown and unassigned scans fail safely. | The app never guesses a sample; it asks the host to assign or the participant to seek help. |
| FR-026 | P1 | Cup assignment can be performed rapidly in sequence. | After assigning one cup, the host remains in scan mode with the next logical sample suggested. |
| FR-027 | P0 | A participant can tap an NFC cup while offline. | Cup App reads the canonical NDEF payload locally, adds the referenced session, and opens the scanned cup in that session without a network request. |
| FR-028 | P0 | NFC data conforms to the canonical protocol. | A standard NTAG sticker has one Well-Known Text record containing the NDEF4 JSON; a Smart Cup uses the defined four-record message. Notes, scores, results, and participant data are absent. |
| FR-028A | P0 | Assigning an NFC cup to a new session updates the session/sample metadata stored on its tag. | After a successful write and verification, scanning the cup resolves the new assignment; an interrupted write leaves a visible error and never reports success. |
| FR-028B | P0 | The canonical NDEF4 form enum supports exactly the two Release 1 forms. | `f=1` selects SCA CVA and `f=2` selects SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023); unknown or unsupported values fail visibly and are never guessed or silently mapped. Quick QC and Purchasing/selection have no assigned values. |
| FR-029 | P1 | NFC Cup and Smart Cup identities use the same resolution contract. | Adding a hardware type does not change session, assignment, response, or participant-flow APIs. |

### 7.4 Live tasting capture

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-030 | P0 | Each session selects one supported form mode. | Every scan opens the correct form without the taster choosing it again. |
| FR-031 | P0 | Partial entries autosave locally without depending on connectivity. | Closing and reopening the app restores the most recent edit with no explicit save action. |
| FR-032 | P0 | A taster can enter the notes, discrete choices, descriptors, and scores defined by the selected Release 1 SCA form. | The complete selected form can be recorded with large controls and without horizontal sliders for common inputs. |
| FR-032A | P0 | A taster can record a flavour note using the device's native voice capture/dictation. | The resulting text is editable and typed entry remains available when native voice input is unavailable; no custom cloud transcription service is required. |
| FR-032B | P0 | Recognised SCA flavour-wheel descriptors receive their established category and colour through deterministic matching. | The original words and text category remain visible, and users can correct a match. |
| FR-034 | P1 | When Smart Cup support ships, available temperature is attached to the event automatically. | The UI distinguishes measured temperature from unavailable or manually entered values. |
| FR-035 | P0 | A taster can revisit and update an entry until the host closes the session. | Revisions are persisted; latest values appear in the summary. |
| FR-036 | P0 | A participant can explicitly submit or mark their session complete. | The host sees complete/incomplete state and required-field warnings. |
| FR-037 | P1 | Multiple tasting events can be recorded for one sample as it cools. | Events remain individually timestamped and appear on a temperature/time sequence. |
| FR-038 | P1 | Forms can provide hot/warm/cool stage prompts. | Stage thresholds are configurable by the host and prompts do not overwrite sensor data. |
| FR-039 | P0 | Every tasting note or observation is stored locally with a stable event ID before any network action. | Force-closing and reopening the app while offline restores all acknowledged observations. Release 1 does not expose event time as sensory timing data. |
| FR-039A | P1 | Smart Cup tasting events include meaningful sensory timing. | Release 2 stores the Smart Cup brew-start event, elapsed brew time at note capture, measured temperature, and data provenance. |
| FR-039B | P1 | Release 2 automatically identifies descriptor phrases and assigns a sensory-family colour. | The app preserves the exact phrase, including non-SCA and culturally specific descriptors, displays it as a coloured pill, and lets the user correct or remove it without requiring approval before display. |

### 7.5 Smart Cup data and prompts

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-040 | P1 | When Smart Cup support ships, the app displays whether temperature data is current, stale, or unavailable. | No stale value is presented as a live measurement. |
| FR-041 | P1 | The app records Smart Cup data provenance. | Temperature events include source, device ID, measurement time, and quality/status where available. |
| FR-042 | P1 | Sensor failure does not block tasting. | The user can complete the form, and the missing sensor data is explicit in the record. |
| FR-043 | P1 | The host can set target stage temperatures or timing reminders. | Prompts are configurable per session and can be disabled. |
| FR-044 | P1 | The host can see cup readiness at a glance. | A live view shows assigned cup, stage, last reading time, and warning state. |
| FR-045 | P1 | Temperature readings can be plotted against tasting events. | The graph labels real observations and does not imply continuous data where none exists. |

### 7.6 Results, records, and export

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-050 | P0 | The online portal shows results that participants have explicitly shared, by sample and by taster. | Individual raw entries and included aggregate results are accessible; the portal distinguishes incomplete shared submissions but does not imply that an account-free participant joined and withheld local results. |
| FR-051 | P0 | The summary highlights completion and disagreement without judging correctness. | Missing entries and a simple spread/disagreement indicator are shown. |
| FR-052 | P0 | The host can export shared session data as CSV from the online portal. | Release 1 export includes session, sample, cup, taster, and form response; Release 2 adds sensory timing, temperature, and provenance fields. |
| FR-053 | P0 | The host can generate a printable/basic PDF summary from the online portal. | The document identifies the session, samples, participants, exclusions, and shared results. |
| FR-054 | P0 | Completed sessions and shared results remain accessible in portal history. | A host can find a record by date, session name, sample name, or sample code. |
| FR-055 | P1 | A host can compare sample stages or selected prior records. | Comparison is user-selected and does not automatically claim samples are equivalent. |
| FR-056 | P1 | A stable export schema is documented. | Existing fields retain meaning across compatible versions; new fields are additive where possible. |

### 7.7 Failure and recovery

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-060 | P0 | The app gives an explicit fallback when an NFC tap cannot open the tag URL. | The user sees manual code/search or QR options, not a dead scan control. |
| FR-061 | P0 | Core cupping operation never requires internet access. | Session creation, session joining from NFC, cup scanning, note capture, editing, local submission, and local review all work in airplane mode after initial app/account preparation. |
| FR-062 | P0 | Conflicting edits are detected. | The app preserves both versions or asks an authorised user to resolve; it never silently overwrites. |
| FR-063 | P0 | Session closure is recoverable from accidental action. | A host must confirm closure and can reopen during a defined grace period. |
| FR-064 | P0 | Results upload only after the participant explicitly presses **Share results**. | Sharing is retryable and idempotent; the app clearly distinguishes private/local, queued, sharing, shared, and failed states. No automatic end-of-session upload is enabled. |
| FR-065 | P0 | Release 1 online capabilities are reliably accessible from mainland China without a mandatory Google-hosted dependency. | Real mainland-China network evidence covers host authentication/account recovery, session access/reconciliation, explicit result sharing, the host portal, exports/downloads, and all transitive runtime dependencies; optional operational services can fail without blocking these paths. Mainland-China physical hosting is not required. |

### 7.8 Release 2 sample-label extraction

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-070 | P1 | A user can attach a photograph of a supplier label to a sample. | The original image is retained as source evidence and can be reviewed later. |
| FR-071 | P1 | A vision-capable language model can propose structured sample metadata from the photograph. | The extraction returns normalized common fields, raw transcription, flexible additional attributes, and field-level confidence/provenance where available. |
| FR-072 | P1 | Extracted data requires user review. | Nothing uncertain is silently accepted; users can accept, edit, reject, or leave fields blank. |
| FR-073 | P1 | Unfamiliar supplier information is preserved. | Information that does not map to the common schema is stored as a labelled raw attribute rather than discarded. |
| FR-074 | P1 | Image capture does not compromise offline cupping. | A photo and minimal sample record can be stored locally; extraction is clearly queued until connectivity is available. |

## 8. UX requirements

- The tasting screen must prioritise the sample/form content over navigation and branding.
- Common controls must be large enough for wet, hurried, one-handed use at a cupping table.
- Avoid fine sliders for common input; prefer discrete choices and large step controls.
- Autosave state must be visible but quiet.
- A scan must always result in one of four explicit states: assigned, unassigned, unknown, or unsupported.
- Offline state must be calm and normal rather than presented as an error. The interface must show whether results are private/local, queued for sharing, sharing, shared, or need attention.
- Before that participant completes, blind sessions must not display protected coffee metadata in participant-facing UI, screen readers, page titles, URLs, notifications, cached preview text, ordinary diagnostics, or participant network responses. Encrypted local retention of metadata read from NDEF4 is allowed solely to support the completion reveal.
- Temperature must include units and freshness; colour alone cannot communicate stage or warning state.
- Cup identifiers must be sensory-neutral; do not require bright colour coding.
- The account-free participant workflow must not contain pricing, account-upgrade, or unrelated organisation controls.
- The app must show why a piece of data is absent instead of substituting a default.
- Forms should use plain language and allow the host to choose terminology appropriate to the workflow.

## 9. Information architecture and data model

### 9.1 Core entities

**Organisation**

- `id`, `name`, `timezone`, default units, retention settings.

**User**

- `id`, organisation memberships, role, display name, authentication identity.

**Account-free participant**

- local identity, `session_id`, display name, scoped token where applicable, completion timestamp, and explicit share state/timestamps.

**Session**

- `id`, organisation, host, name, mode, status, blind state, start/end timestamps, form template/version, settings.

**Sample**

- Release 1: `id`, session, display name, blind code, external reference, supplier, origin, process, lot, roast reference, sample stage, notes, position.
- Release 2 enrichment: accepted normalized fields such as producer, farm/station, varieties, altitude, harvest/crop year, moisture, water activity, certifications, and flexible additional attributes.

**Sample label extraction**

- `id`, sample, original image reference, raw transcription, model/version, extraction status, proposed field values, field-level confidence/provenance, flexible raw attributes, reviewed by, and reviewed at.

**Cup/device**

- `id`, immutable NFC identifier, device type, capabilities, model, status, current protocol payload/version, last written/verified timestamps, tag write status, optional hardware/firmware version.

**Cup assignment**

- `id`, session, sample, cup/device, assigned by, assigned at, active state.

**Response**

- `id`, session, sample, cup assignment, participant, form/template version, current values, completion state, excluded-from-aggregate state.

**Tasting event**

- Release 1: `id`, stable local event ID, response, event type, values/descriptors, raw flavour-note text, input source (`typed` or `voice`), editable text, deterministic SCA category/colour mappings, and local/share state.
- Release 2 additions: Smart Cup brew-start event, elapsed brew seconds, measured temperature, measurement time, device identity, and data-quality/provenance state.
- Release 2 AI additions: automatically identified descriptor phrase, exact source wording, assigned sensory family/colour, model/version, and user correction/removal state.

**Sensor reading**

- `id`, device, session, measured at, temperature, units, status/quality, ingestion source.

**Export**

- `id`, session, type, schema version, created by, created at, file reference.

**Audit event**

- service/host audit: actor, action, target, timestamp, and minimized before/after metadata for host identity-mode changes, result exclusion/inclusion, session closure/reopen, and cup assignment/reassignment.
- participant completion and its local reveal evidence belong to the durable participant-local aggregate. They are not a host reveal and do not create a service Audit Event, network action, or share record. A later, separately authorised action records only its own evidence and does not retroactively turn local completion/reveal into a service audit event.

### 9.2 Important constraints

- One cup/device may have at most one active sample assignment per session.
- One sample may have many cup assignments.
- A response belongs to exactly one participant, sample, and active cup assignment context.
- A completed response remains private on the participant's device until an explicit share action creates an upload.
- Raw responses are retained when excluded from aggregates.
- Form version is immutable once a response exists.
- In blind mode, protected coffee metadata may be present in raw NDEF4 under section 6.7 but must be excluded from participant-facing Cup App projections until that participant completes. Participant network responses remain filtered at the API boundary; UI hiding alone is insufficient for data obtained from service APIs.
- Temperature values must carry provenance and measurement time.

## 10. Non-functional requirements

### 10.1 Performance

- Warm scan-to-form display: p95 under 1 second after identity resolution.
- Account-free join screen interactive: p75 under 2.5 seconds on a mid-range phone; joining from prepared offline session data must not depend on Wi-Fi or mobile service.
- Field input and acknowledged events must persist locally without a network round trip.
- A session of 200 samples, 20 participants, and 6 cups per sample must remain usable, even if the first pilot targets smaller teams.

### 10.2 Reliability

- No acknowledged response may be lost.
- Local drafts and submitted observations must survive app restart, device sleep, and the entire session without connectivity.
- An explicitly requested results share must be idempotent so retries never duplicate scan or tasting events.
- Exports must be reproducible from stored raw records.
- NFC read failure must degrade to a usable manual/QR workflow; future sensor failure must never block tasting.
- Pilot availability target: 99.5% monthly, excluding planned maintenance.

### 10.3 Security and privacy

- Organisation data is tenant-isolated.
- Participant credentials/references are session-scoped and can be created locally without an online authentication round trip.
- A session ID written to a tag must be unguessable or cryptographically verifiable; possession grants only the account-free participant access intended for that session.
- Blind sample identity is withheld from Release 1 participant network responses. Local completion reveals only metadata already retained from NDEF4 and requires no server round trip or completion upload.
- The app must obtain the participant's clear consent each time completed local results are shared with the host.
- Data is encrypted in transit and at rest.
- Hosts can remove participant display names or delete sessions in line with the retention policy.
- Audit sensitive host actions: cup reassignment, identity-mode changes, result exclusion, and session reopen/close. Participant completion/reveal state is durable locally and is not treated as host-global reveal or share consent.
- Do not expose device secrets or use raw NFC identifiers as authentication credentials.

### 10.4 Accessibility

- Target WCAG 2.2 AA for the installed mobile app experience.
- All functions work without colour as the sole cue.
- Tasting controls support screen readers and external keyboards.
- Touch targets are at least 44×44 CSS pixels where practical.
- Text enlargement to 200% does not hide required controls.

### 10.5 Compatibility

- Supported current iOS and Android versions for the installed mobile app, on phones and lab tablets.
- The installed app must read the canonical NDEF format and resolve the session/cup locally; QR and manual-code fallbacks remain mandatory and must also work offline.
- The minimum compatible tag type, memory requirement, supported NDEF record, locking policy, and writing instructions must be published before launch.
- Temperature transport is a Release 2 concern and must remain abstracted until the hardware communication path is validated.
- Initial installation, account creation, and later results sharing may require internet access, but a prepared app must not require internet during session creation or cupping.

## 11. Success measures and instrumentation

### 11.1 Pilot success criteria

- At least 95% of submitted responses are attached to the intended sample in observed pilot sessions.
- At least 99% of acknowledged tasting notes survive a complete offline pilot session and, when explicitly shared, upload without duplication afterward.
- Median account-free participant time from link open to first editable tasting screen is under 45 seconds.
- Median scan-to-record-open time is under 2 seconds end to end.
- At least 80% of started participant entries are completed locally; separately measure the percentage explicitly shared.
- At least 70% of pilot hosts export or revisit a completed session.
- At least 60% of pilot hosts run a second session within four weeks.
- Fewer than 5% of tasting attempts require host intervention because of identity or app-state confusion.
- Qualitative test: users report that the app did not distract them from tasting.

### 11.2 Product events

- Session created, configured, started, completed, reopened, archived.
- Sample added/imported and cup assigned/reassigned.
- Join link opened, participant joined, join failed.
- NFC scan attempted/resolved/unassigned/unknown/unsupported.
- Local tasting observation created.
- Manual fallback used and reason.
- Response started, autosaved, submitted, excluded.
- Smart Cup sensor data available/stale/unavailable (Release 2).
- Participant completion and local blind reveal recorded locally; completion/reveal alone emits no network analytics event and never records the protected metadata as an analytics property.
- Portal summary viewed and export generated.
- **Share results** selected; sharing started/completed/failed/retried.

Analytics must not capture free-text tasting notes or hidden sample identity as event properties.

## 12. Product decisions embodied in this draft

### 12.1 Export before deep integration

Customers repeatedly want records to flow into spreadsheets, Cropster, Coffee Roast, or internal systems. CSV and a stable schema meet the immediate need without betting the MVP on third-party APIs or corporate integration cycles.

### 12.2 Accounts are for session creators

Login and invitation friction is one of the clearest complaints about existing software. Only people who create and manage sessions need accounts, and the paid host model begins in Release 1 so a permanent-free expectation is not established. Price remains TBC. Everyone else participates through a temporary, session-scoped identity without payment or account creation.

### 12.3 Multiple cups per sample

Professional workflows vary in cup count. Both Release 1 forms support 1–8 physical cups per sample. The data model treats cup assignment as many-to-one rather than assuming one smart cup per sample or one fixed bundle.

### 12.4 Two Release 1 forms, one per session

Release 1 supports exactly SCA CVA and SCA Legacy — Specialty Coffee Association Arabica Cupping Form (2004–2023). The host chooses one form for the session and scans open it automatically. Quick QC and Purchasing/selection retain product rationale for subsequent releases, but neither is selectable in Release 1 and neither has an NDEF form value.

### 12.5 NFC tags are the product's first release, not merely a starter option

Release 1 must deliver the core value using off-the-shelf tags and existing cups. The app owns cup identity, sample linking, live capture, and records. Smart Cups later add automation and sensor context to a workflow customers already use.

### 12.6 Temperature as context, not novelty

Temperature is valuable when it explains when a descriptor or defect appeared, improves readiness prompts, or supports a decision. It should not dominate workflows where identity and traceability matter more.

### 12.7 App-first adoption

The first app release works with inexpensive NFC stickers. Embedded NFC Cups and Smart Cups adopt the same identity contract later. This allows software learning and customer adoption to begin before custom hardware is finished.

### 12.8 Explicit sharing and portal reporting

Account-free participants own their local results until they press **Share results** after completion. There is no automatic end-of-session upload. Shared results are available to the paid host in an online portal for summaries, history, CSV, and printable/PDF reports; the mobile app remains focused on live tasting.

### 12.9 An open descriptor vocabulary

The SCA flavour wheel provides Release 1's established categories and colours, but it is not treated as the complete vocabulary of flavour. Release 2 AI preserves exact compound and culturally specific phrases, assigns a closest-family colour automatically, and lets the user correct or remove the coloured pill.

### 12.10 Mainland-China accessibility without a hosting mandate

Release 1 online capabilities must be reliably accessible from mainland China without any mandatory Google-hosted service or other transitive Google-hosted dependency. This includes host authentication and account recovery, session access and reconciliation, explicit result sharing, the host portal, and exports/downloads. Offline cupping remains independent of connectivity.

Provider selection must evaluate the complete runtime dependency chain, including DNS, certificates, identity and challenge services, API and object-storage endpoints, CDNs, fonts, monitoring, analytics, crash reporting, email links, and download delivery. An optional operational dependency may fail without blocking a user-critical path. Evidence must include repeated tests over real mainland-China networks on supported devices; a VPN, proxy, simulation, or provider assertion alone is not sufficient.

This requirement does not require infrastructure to be physically hosted in mainland China, select a provider, or assert legal or regulatory compliance. Those matters require their own approved decisions and evidence.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| NFC handling or tag writing varies across phones | Core workflow or onboarding fails for some users | Use the canonical NDEF protocol, provide QR/manual fallback, and publish a tested device/tag matrix |
| Results fail or duplicate during end-of-session sharing | Team record is incomplete or misleading | Stable local event IDs, idempotent sync, durable outbox, visible per-device sync status, and retry support |
| Smart Cup work delays the NFC-tag release | Time-to-market goal is missed | Keep all sensor work out of Release 1 acceptance; preserve extension points but validate hardware in a separate Release 2 workstream |
| Scope expands into a full data platform | Pilot becomes slow and expensive | Hold non-goals; export-first; require evidence before adding lifecycle or enterprise features |
| Forms are too simple for experts or too dense for casual tasters | Low adoption at the table | Test both Release 1 SCA forms in real sessions; evaluate Quick QC and Purchasing/selection separately before adding later constrained templates |
| Blind identity appears in Cup App before participant completion | Invalid blind sessions and lost trust | Enforce participant-facing projection filtering, server-side response filtering, durable per-participant completion state, and automated blind-session tests while treating deliberate third-party raw NDEF inspection as out of scope |
| Account-free participants create duplicate identities | Fragmented team results | Use session-scoped device continuity; let host merge/rename shared submissions with audit history |
| Sensor readings are stale or inaccurate | Misleading sensory conclusions | Display freshness/provenance, never invent continuity, surface calibration/status, allow no-sensor completion |
| Hardware price limits deployment | Teams never reach useful scale | Support stickers, partial adoption, pilots, and mixed cup types from day one |
| Corporate phones or networks are restricted | Enterprise pilots stall | Plan tablet/shared-device and offline modes; keep export usable without internal-system access |
| A mandatory service or transitive dependency is unreliable or blocked in mainland China | Hosts or participants cannot authenticate, reconcile, share, use the portal, or download exports | Select provider-neutral dependencies using real mainland-China network evidence, remove mandatory Google-hosted runtime dependencies, and ensure optional telemetry/monitoring failures do not block user-critical paths |

## 14. Open decisions requiring validation

### Product

1. What is the smallest useful Release 1 descriptor vocabulary around the SCA framework: free text, organisation-defined chips, a wheel subset, or a combination?
2. Should an account-free participant be able to reopen their own completed local results after a session, and for how long?
3. How long can a host reopen a completed session?
4. For a subsequent release, which fields are required in Quick QC and Purchasing/selection, and can the host loosen/tighten them?

### Hardware and technical feasibility

5. Which off-the-shelf tag models and materials are supported at launch, including dishwasher/water/heat limitations?
6. How should Cup App authorise and protect repeated protocol payload writes while keeping the tag rewritable for the next session?
7. What happens when a tag is copied, damaged, replaced, or tapped outside a live session?
8. Does the future Smart Cup's NFC identify only the cup, or can it also retrieve sensor data?
9. If temperature uses another transport, how is the Smart Cup paired and how frequently are readings available?
10. What constitutes a stale temperature reading?
11. Can pour detection and LED prompts be configured by the app in the pilot hardware?
12. How are battery, calibration, firmware, and device health exposed?
13. Which values, if any, should a future approved protocol assign to Quick QC and Purchasing/selection while preserving compatibility? Release 1 reserves no values for them.

### Commercial and governance

14. What should the paid Release 1 host/workspace price be? Status: TBC.
15. Should the initial trial be limited by time, number of sessions, or both, and what founding-customer terms should be offered?
16. What retention and deletion promises are suitable for pilot customers?
17. Is PDF generation required for the first pilot, or is print-to-PDF sufficient initially?
18. Which export schema best fits the first three pilot customers' spreadsheets?

## 15. Recommended validation plan

Before full implementation, test a clickable prototype and a thin technical spike in four Release 1 scenarios:

1. **SCA CVA:** a representative professional session with visible and blind identity paths.
2. **SCA Legacy 2004–2023:** a representative professional session preserving the full historical form meaning.
3. **Team session:** 5+ tasters, at least two guests who have never seen the app.
4. **High-volume simulation:** 50+ samples with deliberate wrong-code, unsupported-form, and connectivity failure cases.

Measure:

- time to create and join;
- scan success and fallback rate;
- wrong-sample attempts;
- taps/time per completed observation;
- incomplete records;
- participant requests for help;
- whether the NFC-tag workflow is valuable before Smart Cup data exists;
- whether the export is usable without manual restructuring.

The first engineering spike should validate the canonical NDEF format on standard NTAG stickers across target iOS/Android devices, both approved form mappings, visible rejection of unsupported form values, full airplane-mode session operation, durable local event storage, explicit and idempotent results sharing, and blind-data isolation. Provider selection also requires repeated real-network evidence from mainland China across authentication, reconciliation, sharing, portal, and export paths with the complete transitive dependency inventory recorded. Smart Cup transport should be validated separately and must not block the Release 1 decision.

## 16. Evidence traceability

| Product decision | Supporting feedback |
| --- | --- |
| Scan cup to open the correct sample | Will: repeated wrong-sample entry; Chris: chain of custody; Judith/Ola/Diana: NFC traceability |
| Guest join without accounts | Jose: invitation/login friction; Gelo: guest/session access; Ola: occasional users |
| Quick QC as a subsequent-release opportunity | Judith: simple commercial QC; Aulia: daily roast decisions; Will: yes/no/yes-but workflow |
| Multiple cups per sample | Chris: six cups per green sample; Judith: table workflows; bundle assumptions challenged by Mauro |
| Temperature-linked observations | Reza and Mauro: descriptors/temperature; Chris: defects as coffee cools; Sepide: consistent temperature |
| Time/readiness prompts | Aulia and Gelo: missed four-minute break; Will: LED readiness prompts |
| Blind mode | Will: printed sheets and written codes; Jose/Gelo: setup friction; Reza: order/bias concerns |
| CSV/PDF export | Will: spreadsheet workflow; Judith/Chris: enterprise integration; Diana/Mauro/Jose: reports and lost records |
| Export-first integration | Multiple interviewees value existing backends and do not want another replacement system |
| NFC tag starter route | Diana, Mauro, Sepide, Will, and Chris: lower-risk adoption/pilot path |
| Large controls and no fine sliders | Ola: large buttons/no sliders; Will: form complexity; Sepide: fast, low-lag capture |
| Training as follow-on, not initial core | Gelo/Reza/Sepide show strong value, while QC/purchasing identity problems recur more broadly |

## 17. Source material

Primary current-round interviews:

- [Angelo Benedict Abordo / Gelo](user_feedback/Website%20Version%202%20reviews/angelo_benedict_abordo_demand_side_sales_readme.md)
- [Aulia Eka](user_feedback/Website%20Version%202%20reviews/aulia_eka_demand_side_sales_readme.md)
- [Chris Hallien](user_feedback/Website%20Version%202%20reviews/chris_hallien_demand_side_sales_readme.md)
- [Reza Kosar](user_feedback/Website%20Version%202%20reviews/reza_kosar_demand_side_sales_readme.md)
- [Will Woodhouse-Banks](user_feedback/Website%20Version%202%20reviews/will_woodhouse_banks_demand_side_sales_readme.md)

Earlier interviews used to test recurrence and avoid overfitting:

- [Diana Fisgativa](user_feedback/Website%20Version%201%20reviews/diana_demand_side_sales_readme.md)
- [Jose David Posada](user_feedback/Website%20Version%201%20reviews/jose_demand_side_sales_readme.md)
- [Judith Konsten](user_feedback/Website%20Version%201%20reviews/judith_demand_side_sales_readme.md)
- [Mauro Laruffa](user_feedback/Website%20Version%201%20reviews/mauro_demand_side_sales_readme.md)
- [Ola Brattas](user_feedback/Website%20Version%201%20reviews/ola_demand_side_sales_readme.md)
- [Sepide Mehrdad Vahdati](user_feedback/Website%20Version%201%20reviews/sepide_demand_side_sales_readme.md)

Synthesis and current product framing:

- [MVP-filtered demand-side review](user_feedback/Website%20Version%201%20reviews/website_demand_side_review_mvp_filtered.md)
- [Website version comparison](website_version_comparison.md)
- [Project README](README.md)

## 18. Definition of pilot-ready

The Cup App is ready for a customer pilot when:

- the end-to-end host and account-free participant flows meet all P0 acceptance criteria;
- off-the-shelf tags can be attached to existing cups, and the resulting NFC cups can be added, written with the canonical session/sample payload, verified, updated for another session, and revoked;
- supported-device NFC link tests pass and QR/manual fallbacks are verified;
- a complete multi-participant session can run in airplane mode from first cup scan through local submission;
- results remain private/local until **Share results** is pressed, and interrupted or repeated sharing does not lose or duplicate events;
- Release 1 can complete without a brew timer, note-timing interface, or Smart Cup service;
- protected coffee metadata is verified absent from participant-facing Cup App surfaces and unauthorised network responses before that participant completes, while real NDEF4 name/origin and process are covered by the documented raw-tag threat-model exception;
- local draft recovery and online-portal export round-trip tests pass;
- at least one realistic session with 10 samples and 5 tasters completes without developer intervention;
- the exported CSV is accepted by the pilot customer's real spreadsheet workflow;
- known tag limitations, supported devices, data retention, and pilot support terms are documented;
- no Smart Cup hardware or sensor service is required to complete the release checklist.
