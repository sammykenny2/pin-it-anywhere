# PLAN-016: Manual desktop note sizing

## Metadata

| Field | Value |
|---|---|
| Status | In Progress; implementation complete, installed-host acceptance pending |
| Scope | Maintainer-approved implementation, 2026-11-16 |

## Related spec

[SPEC-015](../specs/015-manual-desktop-note-sizing.md), [ADR-074](../decisions/074-manual-desktop-note-sizing.md).

## Implementation phases

### 1. Contract

- [x] Specify three entry states, pointer/keyboard behavior, reset, independent content and compatible persistence.
- [x] Reconcile the existing behavior contract, requirements and document indexes.

### 2. Shared implementation

- [x] Add pure resize geometry and atomic full-rectangle persistence using existing Undo format.
- [x] Extend controller and combined-profile owner with scope/geometry checks, cancellation and reset.
- [x] Add scene authority commands with editor ownership and native allowlist updates.
- [x] Add shared edge/grip controls, pointer preview and keyboard sizing in desktop scenes and browser preview.
- [x] Add single-note reset settings and both locale catalogs; preserve board/list presentation.

### 3. Verification and delivery

- [x] Cover edges, minimums, entry gates, no-op/cancel, failure/races, Undo/order and editor independence in model tests.
- [x] Round-trip prior-format geometry/history/unsaved changes and portable backup through the existing V1 writer.
- [x] Exercise actual handles, keyboard sizing and text/editor behavior in isolated browser scene/UI probes.
- [x] Run repository JS/Python/build/config/document checks and available native checks.
- [x] Update paired user guides, testing boundaries and current project snapshot with implemented behavior.

- [ ] Complete physical pointer/cursor, real IME and multiple-display acceptance on installed Windows/macOS/Linux.

## Approach and files

The interaction controller owns the same generation-bound pointer lifecycle for moves and resizes. A pure geometry
helper serves model and renderer previews. A full-rectangle layout command preserves metadata, promotes the paper
conditionally and writes one existing `move` record. CombinedLayout routes the command to its owning profile after
recovering any pending layout batch. Resizing never acquires content ownership or writes note content.

Principal files: `src/interaction/controller.js`, `src/layout/store.js`, `src/core/combined-workspace.js`,
`src/desktop/{authority,projection,scene}.js`, shared presentation controls, `src/app/main.js`, native command
allowlists, `contracts/desktop*.d.ts`, locale catalogs, targeted model tests and isolated scene/browser probes.

## Testing strategy and risk

Model tests cover S01-S12, with real persistence failures and combined profiles. Browser probes operate the production
controls with synthetic data, including editor textarea/caret and focus surviving frame updates. Native checks establish
command/input wiring and compilation only; installed Windows/macOS/Linux drag, cursor, mixed-display and IME acceptance
are tracked separately in `docs/testing.md`. Author checks are not independent review.
