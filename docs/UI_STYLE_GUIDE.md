# CUP App UI Style Guide

## Purpose

The CUP app supports professional coffee cupping. The user must concentrate on tasting and recording observations. The interface should help them work confidently without distracting them or influencing flavour perception.

The desired character is:

- Simple
- Clear
- Professional
- Minimal
- Contemporary
- Calm
- Precise

The app should feel like a quiet measuring instrument, not a lifestyle coffee app.

## Reference Screens

Use these existing screens as the primary visual reference:

1. Home
2. Brewing
3. Cupping

The Active Session screen is also close to the desired direction and should be aligned with these reference screens as it evolves.

Some older screens still contain legacy card styles, small square buttons, and additional hard-coded colours. Treat those as migration work, not as new design references.

## Design Principles

### Reduce Visual Influence

- Use neutral surfaces around tasting and scoring controls.
- Do not introduce flavour imagery, coffee-brown palettes, decorative gradients, or expressive illustrations.
- Do not use large areas of sample colour.
- Use animation sparingly. Animation should confirm a meaningful event, such as completing a sample.

### Make The Next Action Obvious

- Keep one dominant action at the bottom of the screen.
- Use iOS blue for the neutral forward action: `SCAN CUP`.
- Use charcoal for a required commit action: `SAVE`.
- Keep secondary actions visually quieter than primary actions.

### Support Fast, Repeated Use

- Use large touch targets suitable for users handling cups and a phone.
- Keep score controls visually stable when states change.
- Keep the top status area and bottom action area persistent where practical.
- Use scrollable content between fixed header and footer regions.

### Prefer Structure Over Decoration

- Use whitespace and thin dividers before adding cards.
- Use cards only for repeated records, modals, bottom sheets, and genuinely grouped controls.
- Avoid placing cards inside cards.

## Colour System

Use a restrained neutral palette.

| Token | Hex | Purpose |
| --- | --- | --- |
| `background` | `#FFFFFF` | Main screen background |
| `surface` | `#FFFFFF` | Header, footer, modal, and input surfaces |
| `ink` | `#3F4852` | Primary interface text, selected score controls, save actions |
| `inkSoft` | `#667078` | Secondary text and descriptions |
| `muted` | `#B8BEC5` | Disabled controls |
| `subtle` | `#CFD4D8` | Pagination dots and quiet visual markers |
| `panel` | `#EEF0F2` | Drawer headers and subtle grouped areas |
| `input` | `#F4F5F6` | Notes input background |
| `border` | `#D7DADD` | Dividers and quiet control borders |
| `action` | `#3478F6` | Primary scan action |
| `danger` | `#DC2626` | Errors and destructive actions only |

The existing Home screen uses `#007AFF` for its scan button. When shared button tokens are consolidated, standardise scan actions on one approved blue. Use `#3478F6` unless a visual review selects the native iOS value instead.

### Sample Colours

Sample colours identify physical cups. They must:

- Appear as small dots or swatches.
- Never become page backgrounds, large banners, or dominant control colours.
- Be accompanied by a textual sample number where possible.

### Flavour Pills

Flavour keyword colours represent recorded data. They may appear in notes previews and session details. Do not use these colours decoratively.

## Typography

Use the platform system font. Keep text compact, readable, and unembellished.

| Role | Suggested size | Weight | Notes |
| --- | --- | --- | --- |
| Screen title | `22` | `700` | Centred in header |
| Section title | `20` | `800` | Scoring rows and drawer titles |
| Primary metric | `44` | `800` | Temperature, timer, or prominent score |
| Secondary metric | `30` | `700` | Score summaries and sample indicators |
| Body | `18` | `600` | Instructions and notes |
| Secondary body | `15` | `600` | Supporting text |
| Caption | `12-14` | `700` | Compact metadata |
| Primary action button | `15` | `700` | Uppercase, `1` letter spacing |

Reusable tokens:

- `text_screen_title`
- `text_section_title`
- `text_primary_metric`
- `text_secondary_metric`
- `text_body`
- `text_secondary_body`

Rules:

- Use letter spacing `0` for most text.
- Restrict uppercase to short action labels and compact metadata labels.
- Avoid oversized headings inside compact panels.
- Do not use decorative fonts.

### Typography Audit Mode

`src/components/ui/TypographyAuditText.js` provides a temporary visual audit. When enabled, text that has not inherited a shared typography token is highlighted yellow. Approved typography tokens clear the highlight.

- Keep the audit enabled while reviewing legacy screens.
- Treat yellow text as a prompt to classify the role or deliberately document an exception.
- Disable `TYPOGRAPHY_AUDIT_ENABLED` after the review is complete.

## Spacing

Use a small spacing scale:

| Token | Value |
| --- | --- |
| `xs` | `6` |
| `sm` | `10` |
| `md` | `16` |
| `lg` | `24` |

Additional layout rules:

- Prefer multiples of the spacing scale.
- Use `24-26` horizontal padding for major page content where space allows.
- Keep fixed footer content visually separated from scrollable content.
- Preserve comfortable vertical separation between scoring rows without making the page feel loose.

## Shape Language

Use three deliberate radius families:

| Element | Radius |
| --- | --- |
| Score circles and sample dots | Fully circular |
| Primary footer buttons | `28` for a `56` height |
| Inputs, sheets, dialogs, repeated records | `8-18` depending on scale |

Avoid arbitrary radius variation. Do not use pill shapes for every container.

## Iconography

Use the shared icon system in `src/components/ui/AppIcon.js` and `src/components/ui/IconButton.js`. Do not add raw text symbols directly inside feature screens.

| Token | Size | Touch target | Purpose |
| --- | --- | --- | --- |
| `icon_navigation` | `24` | `44` | Hamburger menu, back navigation, and drawer toggles |
| `icon_action` | `20` | `44` | Close, edit, and add actions |
| `icon_status` | `22` | `44` | Information and status indicators |
| `icon_compact` | `18` | `32` | Search and chevrons inside compact controls |

Rules:

- Use `IconButton` for tappable icon-only controls.
- Use the named `MenuButton`, `BackButton`, and `CloseButton` wrappers where they apply.
- Use `AppIcon` for non-interactive visual indicators.
- Icon components are exempt from the yellow typography audit because they are not text content.
- If a vector icon library is adopted later, replace glyph rendering inside `AppIcon` rather than rewriting screens.

## Core Components

### Header

The header is a persistent white surface with a quiet bottom divider.

Standard arrangement:

- Left: back arrow or menu icon.
- Centre: screen title or sample indicator.
- Right: optional contextual metric such as temperature.

Cupping header:

- Centre: small sample-colour dot and sample position such as `2/4`.
- Right: thermometer icon and temperature.
- Keep the header visible while the content scrolls or the keyboard opens.

### Bottom Action

Use one fixed bottom action button.

| State | Label | Colour |
| --- | --- | --- |
| Ready to scan | `SCAN CUP` | Blue `action` |
| Unsaved edits | `SAVE` | Charcoal `ink` |
| Loading | Short progress label or spinner | Disabled neutral |

Standard dimensions:

- Height: `56`
- Radius: `28`
- Large horizontal inset
- Label typography: system font, `15`, weight `700`, uppercase, `1` letter spacing

Use this label treatment consistently for prominent footer actions, full-width dialog choices, and other primary app actions.

### Secondary Action

Use a secondary action when an extra screen-level action is useful but should not compete with the primary bottom action.

Reference example: `ADD AROMA` on the Brewing screen.

| Element | Treatment |
| --- | --- |
| Background | White `surface` |
| Border | `1` point `quietBorder` |
| Text | `ink` |
| Label typography | Same as primary action button |
| Height | `56` |
| Radius | `28` |

Use secondary actions sparingly. They should sit near the related primary action and remain visually quieter than blue `SCAN CUP` or charcoal `SAVE`.

### Dialogs

Dialogs must always include an explicit close control in the top-right corner.

- Use a quiet `✕` symbol with a generous touch target.
- Closing a dialog dismisses it without triggering its primary action.
- Keep destructive confirmation actions separate from the close control.
- Bottom sheets should provide the same explicit close affordance.

### Score Rows

Each cupping characteristic uses:

- A section title.
- Nine circular score controls labelled `1-9`.

Base dimensions before responsive scaling:

- Circle size: `46 x 46`
- Border radius: `23`
- Border width: `2.3`
- Number text: `text_body`, weight `600`, line height `23`
- Gap below the section title: `xs`

Scale the circle row using the same width-based factor as the Cupping screen so all nine controls fit on one line on small phones, including iPhone 13 mini.

States:

| State | Appearance |
| --- | --- |
| Default | White fill, charcoal outline and text |
| Selected | Charcoal fill, white text |
| Disabled | Muted outline and text |

Requirements:

- A score can be selected, changed, and deselected.
- Only one score may be selected per row.
- Score rows remain editable until the form is saved.
- Saving commits selected scores internally as final values for scoring and session completion.
- Saving a changed score supersedes the previous saved final value for that row.

### Notes

Use one notes field after the score rows on the Cupping screen.

- Background: `input`
- Border: `border`
- Large enough for several lines of tasting notes
- Keyboard-aware scrolling
- iOS keyboard accessory with a clear `Done` action
- Flavour keywords shown as coloured data pills in the unfocused preview

### Pagination Indicator

Use a quiet horizontal page indicator only where the extra affordance is needed:

- Inactive dots: `subtle`
- Active item: wider charcoal capsule
- Keep it secondary to the sample number.
- Do not show it in the Cupping header unless a future usability review shows that the swipe affordance is unclear.

### Cup Selectors

Use a custom circular cup selector when an input represents one physical cup in a sample, such as non-uniform cups or defective cups.

The selector should look like a cup viewed from above rather than a standard rectangular checkbox:

- Outer shape: circular rim.
- Base visible size before responsive scaling: `46 x 46`.
- Base inner rim before responsive scaling: `39 x 39`.
- Default: white fill, charcoal outline.
- Selected: charcoal fill or a clear inner mark.
- Disabled: muted outline and muted fill.
- Use the same width-based scaling factor as the `1-9` score controls so the selectors match visually on small phones.
- Accessibility role: `checkbox`.
- Accessibility label: identify the row and cup number, for example `Non-uniform cups cup 2`.

Use this component for physical cup selection only. Standard boolean defect flags may use a single circular selector, but should not be confused with the `1-9` score controls.

### Defect Selectors

Use a custom circular defect selector when an input represents one negative defect occurrence, such as Mouldy, Phenolic, Potato, or roast defects.

- Use the same base visible size and responsive scaling as the `1-9` score controls.
- Default: white fill, charcoal outline.
- Selected: grey fill with a white cross.
- Disabled: muted outline and muted fill.
- Accessibility role: `checkbox`.
- Accessibility label: identify the defect type, for example `Mouldy defect`.

Use a cross rather than a tick because the selected state records a negative occurrence.

### Defects Drawer

The defects drawer is collapsed by default and sits above the bottom action.

Collapsed:

- Full-width quiet grey section header
- Centred label: `Defects`
- Chevron indicating open/closed state

Expanded:

- White content surface
- Compact vertical layout
- Circular cup selectors for physical cup counts
- Clear labels and short descriptions

Inputs:

- `Non-uniform cups`: one circular cup selector per physical cup
- `Bean defects`: one circular cup selector per physical cup. Selecting a cup opens a bean defect type dialog.
- Bean defect type dialog options: `Mouldy`, `Phenolic`, `Potato`, `Other`.
- The bean defect dialog is multi-select for the selected cup; a cup may record more than one bean defect.
- `Roast defects`: one circular cup selector per physical cup. Selecting a cup opens a roast defect type dialog.
- Roast defect type dialog options: `Underdeveloped`, `Baked`, `Uneven roast`, `Overdeveloped`.
- The roast defect dialog is multi-select for the selected cup; a cup may record more than one roast defect.
- Selected defect types appear as compact icon pills in the drawer and in the Cupping form.
- Bean defects affect the SCA score through the selected cup count. Roast defects are recorded as observations and do not affect the SCA score.

### Dialogs

Dialogs should feel calm and decisive.

- White surface
- Rounded container
- Short centred title
- Brief explanation
- Large full-width actions
- No accidental action when tapping outside a choice dialog

Sleeping-cup dialog:

- Title: `Cup Sleeping`
- Primary action: `ADD CUP TO SESSION`
- Secondary action: `QUICK CUPPING`
- Use the newer blue/charcoal button language.

### Active Session Rows

Use a restrained, information-dense layout:

- Sample dot and sample number first
- Eight score summary circles
- Defect icons only when present
- Current or final score
- Expand/collapse chevron (`icon_navigation`) in the top-right corner
- Expanded details for coffee, process, and flavour pills

Prefer dividers between rows rather than floating cards.

### Score Summary Boxes

The eight score summary boxes on the Active Session screen indicate whether each cupping attribute has been scored and whether it is final.

- Size: `46 × 46` before scaling
- Border radius: `7` before scaling
- Border width: `2` before scaling

States:

| State | Appearance |
| --- | --- |
| No score | White fill, charcoal outline, `-` label |
| Score entered (not final) | White fill, charcoal outline, score value |
| Score final | Charcoal fill, white text, score value |

Labels above each box use `text_caption` at `12` with `inkSoft` colour. Do not scale font sizes — apply scale to layout dimensions only.

## Interaction States

Every interactive component must define:

- Default
- Pressed
- Selected
- Disabled
- Loading, where relevant
- Error, where relevant

Pressed states should be subtle:

- Slight opacity reduction
- Optional scale to `0.98` for primary buttons
- No dramatic animation

## Accessibility

- Use a minimum touch target of approximately `44 x 44`.
- Provide accessibility labels for icon-only controls.
- Do not use colour alone to convey meaning.
- Maintain strong contrast for text and selected states.
- Ensure the keyboard does not obscure the active notes field.
- Keep text readable at common iPhone viewport sizes.

## Patterns To Avoid

- Decorative gradients
- Coffee-brown or flavour-led page palettes
- Large colourful areas
- Excessive shadows
- Nested cards
- Marketing-style hero composition inside operational screens
- Tiny tap targets
- Multiple equally prominent actions
- New one-off colours or radii without updating this guide
- Raw text symbols where an established app icon component exists

## Implementation Guidance

When adding or modifying a screen:

1. Start with the Home and Cupping screens as references.
2. Reuse shared components where possible.
3. Use theme tokens rather than new hard-coded values.
4. Keep behaviour changes separate from visual refactors where practical.
5. Check the screen on a physical iPhone viewport.
6. Update this guide if a genuinely new reusable pattern is introduced.

## Migration Priorities

The current codebase still contains legacy styles. Align screens gradually:

1. Consolidate palette tokens in `src/theme/colors.js`.
2. Consolidate the blue `SCAN CUP` and charcoal `SAVE` footer button.
3. Standardise headers.
4. Standardise dialogs and bottom sheets.
5. Align session setup and settings screens with the quieter Home/Cupping language.
6. Replace remaining legacy symbols with the shared icon system and adopt a vector icon library when needed.
