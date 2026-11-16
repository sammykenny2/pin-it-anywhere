# SPEC-015: Manual desktop note sizing

## Metadata

| Field | Value |
|---|---|
| Status | Implemented; installed-host acceptance pending |
| Approval | Maintainer instruction, 2026-11-16 |

## Summary and goals

Let users deliberately change the width/height of one desktop paper where they work, independently of content.
This extends SPEC-003's stable-paper contract: automatic selection/edit transitions still preserve dimensions.
It does not change the main-window board, full editor, phone layout, group membership or font size.

## Requirements

1. **Entry points.** In-place desktop editing permits resizing that paper without a modifier. Adjust group/all
   permits resizing any participating paper without a modifier. Outside those states, the existing opt-in quick
   move/edit setting also permits resizing a resting interactive paper with Command (macOS) or Ctrl (Windows/Linux)
   already held at pointer-down. No new setting. Releasing the key mid-gesture does not end it.
2. **Pointer.** All four edges and corners have hit regions inside the paper. A bottom-right grip is visible when
   sizing is available. Dragging an edge changes one dimension; a corner changes both freely, with the opposite
   edge/corner fixed. Text, checkboxes, links, attachments and scrolling retain their inner hit regions. During
   in-place editing the title band can move the paper; the text area keeps text selection.
3. **Bounds.** Manual sizing has a 160 by 160 logical-unit minimum, keeping title/actions operable. Existing smaller
   formation geometry is retained until deliberately resized. The paper may exceed its group region and overlap other
   papers. Releasing rescues an unreachable title onto a current display without shrinking the paper.
4. **Persistence and Undo.** Pointer movement is preview only. Release commits one complete rectangle and conditional
   stacking promotion as one atomic local layout Undo step. A click/no change adds no step. The setting never syncs and
   survives restart/backup. Every persisted history entry uses the already supported `move` kind; schema stays V1.
5. **Cancel and races.** Escape, pointer cancel/lost capture, changed display topology, leaving the eligible scope,
   hiding/removing the paper, a conflicting geometry change or disabling quick operations cancels the preview. Failure
   to persist leaves the previous rectangle/history intact. Unrelated draft/content/layout writes do not invalidate
   a gesture if its paper's original geometry and availability still hold. Resize never transfers groups, even over a
   receiving label with Shift held.
6. **Content independence.** Resize neither flushes nor saves/discards content and preserves composition, caret and
   unsaved changes. Save/Cancel/end editing keeps the committed size. Escape during a resize cancels only that gesture.
7. **Keyboard.** The bottom-right grip is a focusable named button in adjust/in-place states. Enter/Space starts sizing,
   arrows change width/height by one logical unit (Shift: ten), Enter commits, Escape cancels; moving focus away cancels
   an unfinished keyboard preview. These keys do not intercept text-editing keys. A named reset button is available
   in the paper's title band, keeping the editing action row operable at the minimum size. Quick-only resting handles
   do not add keyboard tab stops.
8. **Single-paper reset.** Reset uses this device's currently selected new-paper dimensions, keeps x/y and every other
   paper unchanged, and is one layout Undo step. Offer it on the active paper and in the main-window note
   settings for a placed paper on desktop platforms. It is separate from resetting the entire desktop layout.
9. **Presentation and hosts.** Shared scene and browser Desktop preview use the same handles/geometry. The main-window
   board/list have no free sizing. Wallpaper/click-through papers require adjust mode. Windows quick resize uses the
   existing lift-to-Top policy. Native scene authority checks eligibility, editor ownership and gesture identity.
10. **Localization.** English and Traditional Chinese name controls and explain keyboard use and the expanded quick
    operation switch. No inline user-visible strings.

## Acceptance

| Case | Required observable result |
|---|---|
| S01 | Each edge/corner changes only its intended dimensions, respects the floor and keeps opposite edges fixed |
| S02 | Edited paper and adjusted group/all papers resize; ordinary reading does not |
| S03 | Quick setting/key gates a resting-paper resize; key release continues; Windows retains lifting |
| S04 | Text selection, checklist/link/attachment controls, scrolling and existing move/transfer gestures still work |
| S05 | Release is one Undo step; click/no change/cancel writes none; restart and portable backup retain custom size |
| S06 | Escape/lost capture/display change/eligibility change/conflicting geometry cancel without losing content |
| S07 | Failed storage writes preserve old dimensions/history; unrelated draft saves and new arrivals can continue |
| S08 | Save/Cancel/end an editor preserves committed geometry and editor input survives resizing |
| S09 | Keyboard grip supports start/arrows/Shift/commit/cancel/blur and retains focus through frames |
| S10 | Reset changes only the selected paper's size, preserves position, and Undo restores custom dimensions |
| S11 | Native command rejects out-of-scope, click-through, foreign-editor and malformed/stale gesture requests |
| S12 | Prior-format rectangles/history/unsaved changes survive resize, reopen and backup round trips unchanged in format |

## Dependencies and open questions

Existing layout owner, single-owner scene bridge, persistent stacking (SPEC-014) and alpha compatibility (SPEC-007).
No product questions block implementation. Native pointer, IME and multiple-display acceptance require real hosts.

## References

[ADR-074](../decisions/074-manual-desktop-note-sizing.md), [PLAN-016](../plans/016-manual-desktop-note-sizing.md).
