# U1 — fixture-only compact session title review

This renders the actual React Native `SessionTitleSummary` through React Native Web. It is not another hand-authored screen mockup. Only static fixture strings are supplied. It is deliberately outside app entrypoints and navigation, and does not read or change sessions, score state, NFC or uploads.

From this isolated checkout, using the existing shared dependency installation (no install or package changes):

```sh
NODE_PATH=/Volumes/external/code/cup_app/node_modules node review/session-title/check.cjs
NODE_PATH=/Volumes/external/code/cup_app/node_modules node review/session-title/render.cjs
```

The renderer prints a standalone HTML review containing PENDING, IN PROGRESS and COMPLETE versions. The review is shown at thread-owned `cup-session-title-u1-review.html`. Generate it again after component edits; it is not a separately editable implementation. DRAFT is deliberately unsupported by this component and remains on its existing screen.

Plain upload-status text is a supplied fixture label, not an upload state machine or new claim that uploads work. Cloud icons and upload controls belong to a later slice.

Checks exercise rendering, escaping, supported-state guards, no interactive controls, normal-weight text styles and wrapping declarations. They do not prove pixel layout, native Dynamic Type, physical phone behaviour, accessibility traversal or actual device rendering. Independent review and Product Owner visual acceptance remain required before any screen integration. No Metro entry change, live screen import, rollout, new route or native build is included.
