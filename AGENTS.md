# CUP App UI Instructions

## Changelog

After completing any task that changes code or docs, add an entry to `CHANGELOG.md` under today's date (`## [YYYY-MM-DD] — <agent name>`), describing what changed and why. If today's date section already exists, append to it instead of creating a duplicate. This applies to both Claude Code and Codex.

**If you are Codex**: this file (`AGENTS.md`) is your primary source of instructions for this repo — read it in full before starting any task, and follow the changelog rule above without being asked.

Before creating or modifying any user-facing UI, read:

- `docs/UI_STYLE_GUIDE.md`

Use the Home and Cupping screens as the visual reference for the app. Preserve the established quiet, neutral, professional appearance.

## Working Rules

- Prefer existing theme tokens and shared UI components.
- Reuse an established component pattern before creating a new variation.
- Do not introduce a new colour, spacing value, border radius, button treatment, or typography style without checking the style guide.
- If a genuinely new visual pattern is needed, update `docs/UI_STYLE_GUIDE.md` as part of the same change.
- Keep sample colours as small identification markers. Do not use them as large backgrounds.
- Use flavour-pill colours only to represent recorded flavour data.
- Keep NFC workflow changes separate from visual refactors wherever possible.
- When touching an older screen, move it incrementally toward the style guide without changing unrelated behaviour.

## Responsive Scale Factor

Several screens use a `scale` variable derived from the device width (e.g. `const scale = Math.min(Math.max(width / 616, 0.58), 1.05)`). On a standard iPhone this value is approximately `0.63`.

**The scale factor must only be applied to layout values** — padding, margin, gap, component width/height, and border radius.

**Never apply the scale factor to font sizes.** Typography token values (`typography.text_body`, `typography.text_section_title`, etc.) are the intended rendered sizes. Multiplying them by `scale` produces text that is ~37% smaller than the style guide specifies.

Correct pattern:
```js
// Layout: scale applies
<View style={{ paddingVertical: 10 * scale, gap: 8 * scale }}>

// Typography: no scale, use the token directly
<Text style={styles.cupNumber}>Cup 1/2</Text>

// StyleSheet: token only, no scale
cupNumber: {
  ...typography.text_section_title,
  letterSpacing: 0,
},
```

Incorrect pattern:
```js
// Do NOT do this — shrinks text far below the intended size
<Text style={{ fontSize: 20 * scale }}>Cup 1/2</Text>
```

