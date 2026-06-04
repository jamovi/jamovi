# InteractionManager Agent Instructions

Before changing InteractionManager or FocusLoop code, read `README.md` in this
directory. It is the canonical design reference for lifecycle behavior, usage
patterns, and invariants. Keep this file focused on workflow rules for agents.

## Module Shape

- `../interactionmanager.ts` is the public InteractionManager singleton and `InteractionManager` class.
- Files in this directory are internal support modules, tests, and reference
  docs.
- `focusloop.ts` defines the `FocusLoop` handle returned by
  `registerLoop()`.
- `loopregistry.ts` defines `FocusLoopRegistry`.
- `keytipcontroller.ts`, `keytiptoken.ts`, and `keytiptype.ts` are for visible
  KeyTips and KeyTip paths.
- `shortcuts.ts` defines executable keyboard shortcut registration and
  dispatch.
- `keyTips` and `shortcuts` are named public exports from `../interactionmanager.ts`.
  They point at the controller instances owned by the default InteractionManager
  singleton; prefer them over adding wrapper methods to `InteractionManager`.
- Preserve the public import path `../common/interactionmanager`.

## Lifecycle Rules

- Do not change lifecycle behavior without checking `README.md` first.
- Key invariants include focusin-driven activation, `FocusLoop.activate()` as an
  activation request, passive `keyToEnter` root focus not activating the loop,
  active roots acting as focus controllers, and modal focus trapping.
- The modules are split so lifecycle, registry, keyboard navigation, and mode 
  handling can evolve independently.

## Tests

Run the InteractionManager tests after any InteractionManager, FocusLoop, or test-helper change:

```sh
cd client
node ./node_modules/vitest/vitest.mjs run common/interactionmanager/tests
```

Prefer focused lifecycle tests for lifecycle changes. Do not add browser test
dependencies unless explicitly requested; real browser behavior should normally
be checked manually by the user.

## Editing Notes

- Avoid unrelated refactors while fixing lifecycle issues.
- Keep test fake DOM helpers type-safe; do not assign directly to
  `document.activeElement`. Use `setActiveElement()` from `tests/helpers.ts`.
- When adding declarative loop options, update `loopregistry.ts`,
  `README.md`, and registry tests together.
- If a change affects public usage patterns, update `README.md` in the same
  change.
