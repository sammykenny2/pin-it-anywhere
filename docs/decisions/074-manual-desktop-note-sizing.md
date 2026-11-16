# ADR-074: Manual desktop note sizing

## Status

Accepted (2026-11-16).

## Context

Desktop papers have persisted independent width and height, but the scene renderer only implements moving.
Stable paper size during selection, editing and cycling was never a reason to omit deliberate manual sizing.
The maintainer approved documenting and implementing manual sizing after the interaction discussion.

## Decision

Implement [SPEC-015](../specs/015-manual-desktop-note-sizing.md): resize the paper being edited in place,
papers in the adjusted group/all scope, and resting interactive papers with the existing quick-operation key.
Use eight edge/corner handles, a visible keyboard-accessible bottom-right grip, and a single-paper reset.
No new setting, content revision, synchronization field or application version is needed.

The shared interaction controller owns preview, cancellation and release. The layout owner persists the complete
rectangle atomically using the existing `move` history record, whose before-geometry already includes width/height.
This is a compatible operation over the existing format, not a new persisted history kind. Old-format fixtures must
round-trip custom geometry, history, unsaved changes and portable layouts. Native scene commands remain allowlisted;
only the current editor's view may size its edited paper. Windows retains its quick-move lifting policy for resizing.

## Consequences

- A single-paper adjustment needs neither an editor transition nor a whole-desktop overlay.
- Resizing never changes group membership or fonts. Entering/leaving an editor never sizes a paper automatically.
- Geometry is saved independently of the content editor's Save/Cancel actions and can be undone through layout Undo.
- The native hosts must deliver edge input, keep pointer capture through frame changes, and permit the reset command.
- Installed-host mouse, multiple-display and input-method acceptance are separate from shared/browser tests.

## Alternatives considered

- Adjust-mode only: forces an overlay just to make one note wider while writing or reading.
- Editing only: forces an edit session for a layout operation and excludes arranging several papers.
- Always-active edges: changes ordinary reading/text selection and the resting click-through contract.
- New size/history schema: unnecessary because persisted rectangles and Undo already represent the operation.

## References

- [SPEC-003](../specs/003-desktop-cards-groups-and-formation.md), [ADR-006](006-card-group-and-formation-semantics.md)
- [ADR-073](073-alpha-data-compatibility-and-migrations.md), [PLAN-016](../plans/016-manual-desktop-note-sizing.md)
