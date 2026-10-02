# Cup App Agent Entry Point

This file is the repository entrypoint for Codex, Claude, and other development agents.

If Project Manager, Codex/chat, worktree, or machine state must be recovered, start with [`docs/PROJECT_MANAGER_RECOVERY.md`](docs/PROJECT_MANAGER_RECOVERY.md) and perform its inspection before changing repository state.

## Before meaningful development work

Read, in this order:

1. [`docs/AI_DEVELOPMENT_OPERATING_MODEL.md`](docs/AI_DEVELOPMENT_OPERATING_MODEL.md).
2. The sections of [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) relevant to the task.
3. Any relevant canonical technical specification, such as [`docs/NDEF_PROTOCOL.md`](docs/NDEF_PROTOCOL.md).
4. [`docs/UI_STYLE_GUIDE.md`](docs/UI_STYLE_GUIDE.md) before creating or modifying user-facing UI.

The authority hierarchy is defined in `docs/AI_DEVELOPMENT_OPERATING_MODEL.md`. Do not infer product policy from source code, tests, or README material when a higher-authority specification governs the behaviour.

Every meaningful development task requires a canonical `docs/tasks/<TASK-ID>.md` record before implementation begins. Read and update that record as required by the operating model. Trivial typo-only or document-formatting work may be exempt only when the Project Manager explicitly treats it as trivial.

## Working rules

- Never develop or push directly on `main`.
- Work only within the task record's declared scope; do not opportunistically refactor unrelated code.
- If work unexpectedly requires an unassigned shared file, interface, schema, protocol, navigation contract, or repository API owned by another active task, stop that part and return to the Project Manager for coordination.
- Never claim physical NFC or device verification from simulation, mocks, bundling, or automated tests alone.
- Record changelog-worthy information in the task handoff. Only the Project Manager/Release Manager, or an agent explicitly assigned changelog ownership, edits `CHANGELOG.md`. Parallel implementation agents do not edit it by default.
- Keep NFC workflow changes separate from unrelated visual refactoring.

## UI rules

Use the Home and Cupping screens as visual references. Preserve the established quiet, neutral, professional appearance.

- Prefer existing theme tokens, shared components, and established component patterns.
- Do not introduce arbitrary colours, spacing values, border radii, button treatments, or typography styles. Check the style guide first and update it with any genuinely new approved pattern.
- Keep sample colours as small identification markers, not large backgrounds.
- Use flavour-pill colours only for recorded flavour data.
- When touching an older screen, move it incrementally toward the style guide without changing unrelated behaviour.

### Responsive scale factor

Apply a screen-derived `scale` only to layout values such as padding, margin, gap, dimensions, and border radius. Never apply it to font sizes. Typography tokens are the intended rendered sizes.

```js
// Correct: scale layout, not typography.
<View style={{ paddingVertical: 10 * scale, gap: 8 * scale }}>
  <Text style={styles.cupNumber}>Cup 1/2</Text>
</View>

const styles = StyleSheet.create({
  cupNumber: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
});
```
