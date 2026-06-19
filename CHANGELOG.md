# Changelog

All notable changes to the CUP app are recorded here. Both Claude Code and Codex should update this file when making changes.

## Format

Each entry should include the date, the agent that made the change, and a short description.

---

## [2026-06-16] — Claude Code

- Deleted `src/services/nfcService.js` — legacy file (~600 lines) unused since migration to `nfcServiceMinimal.js`. No imports were affected.
- Updated `handleVerifySample` in `CuppingSessionDetailsScreen.js` — verification now checks that NDEF1 `s` field is `1` (ready state) for smart cups. If metadata matches but state is not `1`, verification stays pending with a specific message. NTAG cups are unaffected.
- Updated score summary circles in `ActiveSessionScreen.js` to match cupping screen spec: 46×46, radius 23 (fully circular), border 2.3 — all before scale. Added score summary circle spec to `docs/UI_STYLE_GUIDE.md`.
- Improved clarity of `ActiveSessionScreen.js`: moved expand chevron to top-right of each cup row; added "CUPS" section header between meta and cup list; changed "Score -" to "Score pending"; removed the no-defects "-" dash from the scores line; defect icons now render on their own line only when present.
- Aligned `ActiveSessionScreen.js` with style guide: replaced hard-coded `INK`/`IOS_BLUE` constants and all inline hex values with `colors` tokens; replaced hand-rolled font styles with `typography` tokens; fixed divider colour from `colors.panel` to `colors.quietBorder`; updated drawer body background to `colors.panel`; aligned muted and unavailable text to `colors.subtle`/`colors.muted`.
- Reworked flavour pill display: `NotesInput` is now a plain text input (no inline pill overlay); `KeywordPillRow` gains an `outline` prop (grey border, no fill) for use during tasting; cupping form shows a live grey-outline pill row below each notes box derived from the current text; active session drawer shows plain notes text with a coloured pill row below. Removed `KeywordTokenPreview`, `InlineNotesWithPills`, `buildKeywordLabelOverrides`, and `buildLatestObservationLabelsByKeyword` helpers.
- Added `pruneSampleFlavourObservations` to `sessionRepository.js` and wired it into `CuppingScreen.handleSave`: when the user saves, any stored flavour observations whose keyword no longer appears in the notes text are deleted from the database. This means removing a flavour keyword from the notes and pressing Save will also remove its pill from the active session screen.
- Updated `ActiveSessionScreen.js` expanded drawer: flavour keyword pills now render inline within the notes text, replacing matching words (e.g. "Frogs Strawberry peach" shows "Frogs 🔴33°C|strawberry 🟠33°C|peach"). Observations not matched in the text still appear as a pill row below. Removed the separate pill row and the unused `extractFlavourPills` helper.
- Updated `handleRewriteSample` in `CuppingSessionDetailsScreen.js` — rewrite now uses `readAndWriteNdefMinimal` (single NFC session, one scan) instead of separate `readNdefMinimal` + `writeNdefMinimal` calls (two scans). Also explicitly sets `state: 1` in NDEF1 for smart cups.

## [2026-06-17] — Claude Code

### Flavour pills rework
- `NotesInput.js` simplified to a plain `TextInput` — removed the `KeywordTokenPreview` inline overlay and focused/unfocused switching logic.
- `KeywordPillRow.js` gains an `outline` prop: when true, pills render as a grey border with `colors.ink` text and no fill, for use in the cupping form during tasting to avoid influencing flavour perception.
- `CuppingScreen.js`: live grey-outline pill row now appears below each notes box, derived from current text as the user types. Pills show `temp|keyword` label when the observation has been previously saved. Removed `buildLatestObservationLabelsByKeyword` (unused).
- `ActiveSessionScreen.js` expanded drawer: reverted to plain notes text with a coloured `KeywordPillRow` below (with `temp|keyword` labels from stored observations). Removed `InlineNotesWithPills`, `buildKeywordLabelOverrides`, `KeywordTokenPreview` import, and `tokenizeFlavourKeywords` import.
- `sessionRepository.js`: added `pruneSampleFlavourObservations` — deletes stored observations whose keyword no longer appears in the notes text. Called from `CuppingScreen.handleSave` so removing a keyword from notes and saving removes its pill from the active session.

### Active Session screen improvements
- Expanded drawer redesigned: Coffee/Process on white surface, separated from notes sections by a thin divider; Fragrance/Aroma Notes and Flavour Notes each in a grey input-style box (matching cupping form style) with coloured pills below.
- Defect icons moved to appear after the score summary text (below "Current score X.XX" / "Score pending").
- Screen auto-scrolls to bring the expanded sample row to the top when a drawer is opened.
- `Header` gains a `hideBack` prop — when true the back arrow is hidden while keeping the header layout intact. Used in `ActiveSessionScreen` (hidden when any sample is expanded) and `CuppingScreen` (hidden when defects drawer is open) to prevent accidental back navigation.

### Three session state screens (Pending / Active / Complete)
- Added `active` as a new session status between `pending` and `complete`.
- DB migration: sessions that have any feedback data but are still `pending` are automatically migrated to `active`.
- `resolveActiveSampleFromCupMetadata` now transitions a session from `pending` → `active` the first time one of its cups is scanned.
- `markSessionCompleteIfAllSamplesComplete` now restores sessions to `active` (not `pending`) when a previously complete session is edited.
- New `sessionRepository` exports: `activateSession`, `manuallyMarkSessionComplete`, `getSessionCompletionSummary`, `deleteSampleFromSession`.
- `ActiveSessionScreen` gains a `mode` prop (`pending` / `active` / `complete`) that controls titles, footer actions, and editability:
  - **Pending**: header "Pending Session", footer "EDIT SESSION" → `CuppingSessionDetailsScreen`.
  - **Active**: header "Active Session", footer "SCAN CUP" + "MARK COMPLETE". Tapping "Mark Complete" checks completion; if any sample is missing scores a dialog lists them. If all complete the session is marked complete and the user returns to the session list.
  - **Complete**: header "Session Review", no footer. Read-only.
- Sample delete button (×) shown on each cup row in pending and active modes. Tapping removes the sample and reloads the list.
- `CuppingSessionScreen` now routes session list taps to the appropriate screen based on status (Pending/Active/Complete Session).
- `CuppingScreen` gains an `isSessionComplete` prop; when true all inputs are locked (read-only review).
- Back button from `CuppingScreen` now always returns to Home.

### Active Session — defects summary in expanded drawer
- Added read-only defects summary below the notes sections when a sample row is expanded.
- Cup circles (46×46 scaled, fully circular) show highlighted slots for any non-uniform or defective cups.
- Bean defect pills and roast defect pills appear below the circles, matching the style from the cupping defects drawer (panel background, quiet border, icon + label).
- Summary section is hidden entirely when no defects are recorded.

### Cupping Session screen
- Full style guide alignment: all hardcoded hex colours replaced with `colors` tokens; all hardcoded font sizes replaced with `typography` tokens.
- `FloatingActionButton` replaced with standard fixed-footer `FullPageButton` ("NEW SESSION", charcoal).
- `ScreenContainer` replaced with plain `ScrollView` using `spacing.lg` (24) horizontal padding.
- Session status (Complete/Pending) displayed as plain `text_secondary_body` text on its own line.
- Filter row (session type filter chips) removed — not needed.
- Empty/error state simplified to centred text without a border card.
