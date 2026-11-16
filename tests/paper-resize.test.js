import test from 'node:test';
import assert from 'node:assert/strict';
import { Workspace } from '../src/core/workspace.js';
import { CombinedWorkspace } from '../src/core/combined-workspace.js';
import { InteractionController } from '../src/interaction/controller.js';
import { resizeEdges, resizeRectangle } from '../src/layout/resize.js';
import { createBackup, openBackup } from '../src/backup/payload.js';

const area = { x: 0, y: 0, width: 1200, height: 900 };
const content = text => ({ format: 'markdown', text, attachments: [] });
const geometry = rect => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, rect[key]]));
async function fixture() {
  let disk, fail = false, flushes = 0;
  const persist = async value => { if (fail) throw new Error('disk full'); disk = structuredClone(value); };
  const workspace = await Workspace.create({ profileId: 'local', deviceId: 'resize-fixture', area, persist });
  const group = workspace.snapshot.groups[0];
  const note = await workspace.createCard(content('Resize fixture'), group.id);
  const other = await workspace.createCard(content('Leave this paper alone'), group.id);
  await workspace.layout.configure({ grid: { rows: 1, columns: 1, slots: [group.id], area } }, workspace.snapshot);
  await workspace.layout.placeNew(workspace.working, [area]);
  const controller = new InteractionController({ getSnapshot: () => workspace.working, layout: workspace.layout,
    commands: workspace, workAreas: () => [area], saveDraft: async () => { flushes++; } });
  return { workspace, controller, note, other, group, persist, disk: () => structuredClone(disk),
    fail: value => { fail = value; }, flushes: () => flushes };
}

test('S01: every edge preserves its opposite edge, independent dimensions and the minimum', () => {
  const origin = { x: 100, y: 80, width: 240, height: 300 }, start = { x: 0, y: 0 };
  for (const edge of resizeEdges) {
    const rect = resizeRectangle(origin, start, { x: 30, y: 40 }, edge);
    assert.equal(rect.width, edge.includes('e') ? 270 : edge.includes('w') ? 210 : 240);
    assert.equal(rect.height, edge.includes('s') ? 340 : edge.includes('n') ? 260 : 300);
    assert.equal(rect.x, edge.includes('w') ? 130 : 100); assert.equal(rect.y, edge.includes('n') ? 120 : 80);
  }
  assert.deepEqual(resizeRectangle(origin, start, { x: 999, y: 999 }, 'nw'), { x: 180, y: 220, width: 160, height: 160 });
  assert.deepEqual(resizeRectangle(origin, start, { x: -999, y: -999 }, 'se'), { ...origin, width: 160, height: 160 });
  assert.equal(resizeRectangle({ ...origin, height: 96 }, start, { x: 20, y: 0 }, 'e').height, 160);
});

test('S02/S05: group/all resize previews only, saves once, promotes and Undo restores full geometry', async () => {
  for (const scope of ['group', 'all']) {
    const f = await fixture(), { workspace: w, controller: c } = f;
    await c.activate(scope === 'group' ? { kind: scope, groupId: f.group.id } : { kind: scope });
    const before = w.layout.state, rect = before.placements[f.note.id], other = before.placements[f.other.id];
    c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' });
    c.pointerMove({ x: 77, y: 53 });
    assert.deepEqual(w.layout.state, before);
    assert.equal((await c.pointerUp({ x: 77, y: 53 })).kind, 'resized');
    const after = w.layout.state;
    assert.deepEqual(geometry(after.placements[f.note.id]), { ...geometry(rect), width: rect.width + 77, height: rect.height + 53 });
    assert.equal(after.history.length, before.history.length + 1); assert.equal(after.history.at(-1).kind, 'move');
    assert.deepEqual(after.placements[f.other.id], other);
    await w.undo([area]); assert.deepEqual(geometry(w.layout.state.placements[f.note.id]), geometry(rect));
  }
});

test('S03: quick resize uses the opt-in gate and lifting, while Shift never transfers groups', async () => {
  const f = await fixture(), c = f.controller, w = f.workspace;
  assert.throws(() => c.pointerDown(f.note.id, { x: 0, y: 0 }, { quick: true, edge: 'e' }), { code: 'quick-move-off' });
  assert.throws(() => c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'e' }), { code: 'outside-scope' });
  await w.layout.configure({ quickMove: true }, w.snapshot);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { quick: true, edge: 'e', lift: true });
  c.pointerMove({ x: 50, y: 0 }, { shiftKey: true, labels: [{ groupId: 'other-group', x: 0, y: 0, width: 100, height: 100 }] });
  assert.equal(c.state.dragSession.lift, true); assert.equal(c.state.dragSession.target, null);
  assert.equal((await c.pointerUp({ x: 50, y: 0 }, { shiftKey: true })).kind, 'resized');
  assert.equal(w.snapshot.cards.find(card => card.id === f.note.id).groupId, f.group.id);
});

test('S05/S06/S07: no-op, cancel, conflicting geometry and storage failure preserve committed geometry/history', async () => {
  const f = await fixture(), c = f.controller, w = f.workspace;
  await c.activate({ kind: 'all' }); const before = w.layout.state;
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' }); await c.pointerUp({ x: 2, y: 1 });
  assert.deepEqual(w.layout.state, before);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' }); c.pointerMove({ x: 50, y: 30 }); c.cancelDrag();
  assert.deepEqual(w.layout.state, before);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' }); c.pointerMove({ x: 50, y: 30 });
  f.fail(true); await assert.rejects(c.pointerUp({ x: 50, y: 30 }), /disk full/); f.fail(false);
  assert.deepEqual(w.layout.state, before); assert.equal(c.state.dragSession, null);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' }); c.pointerMove({ x: 50, y: 30 });
  await w.layout.move(f.note.id, { x: 120, y: 130 });
  const moved = w.layout.state; assert.equal((await c.pointerUp({ x: 50, y: 30 })).kind, 'cancelled');
  assert.deepEqual(w.layout.state, moved);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' });
  await w.layout.setCardPolicy(f.note.id, { visible: false }); await c.reconcile(); assert.equal(c.state.dragSession, null);
});

test('S06/S07: unrelated layout/draft writes survive a resize and disabling quick operations cancels it', async () => {
  const f = await fixture(), c = f.controller, w = f.workspace;
  await w.layout.configure({ quickMove: true }, w.snapshot);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se', quick: true }); c.pointerMove({ x: 50, y: 20 });
  const draft = w.openDraft(f.group.id, f.note); draft.content.text = 'Keep this unsaved text'; await w.saveDraft(draft);
  const fresh = await w.createCard(content('New sync arrival'), f.group.id); await w.layout.placeNew(w.working, [area]);
  assert.equal((await c.pointerUp({ x: 50, y: 20 })).kind, 'resized');
  assert.equal(w.state.drafts[draft.id].content.text, draft.content.text); assert.ok(w.layout.state.placements[fresh.id]);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se', quick: true }); c.pointerMove({ x: 50, y: 20 });
  await w.layout.configure({ quickMove: false }, w.snapshot); await c.reconcile(); assert.equal(c.state.dragSession, null);
});

test('S08/S10/S12: editing, reset, reopen and portable V1 backup keep independent content and geometry', async () => {
  const f = await fixture(), c = f.controller, w = f.workspace;
  // A prior-format fixture has neither a size preference nor an optional quick-operation setting.
  assert.equal('newPaperSize' in f.disk().layout, false);
  await w.layout.configure({ quickMove: true }, w.snapshot); await c.beginEdit(f.note.id);
  const draft = w.openDraft(f.group.id, f.note); draft.content.text = 'Unsaved before resize'; await w.saveDraft(draft);
  const contentBefore = structuredClone(w.state.drafts), outboxBefore = structuredClone(w.state.outbox);
  const before = w.layout.state.placements[f.note.id], other = w.layout.state.placements[f.other.id], flushes = f.flushes();
  c.setComposing(true);
  c.pointerDown(f.note.id, { x: 0, y: 0 }, { edge: 'se' }); await c.pointerUp({ x: 80, y: 60 });
  assert.equal(f.flushes(), flushes); assert.deepEqual(w.state.drafts, contentBefore); assert.deepEqual(w.state.outbox, outboxBefore);
  c.setComposing(false); await c.endEdit();
  const custom = w.layout.state.placements[f.note.id]; assert.equal(custom.width, before.width + 80);
  const reopened = new Workspace(f.disk(), f.persist);
  assert.deepEqual(reopened.layout.state.placements[f.note.id], custom); assert.deepEqual(reopened.state.drafts, contentBefore);
  await w.layout.configure({ newPaperSize: 'tall' }, w.snapshot); await c.beginEdit(f.note.id); await c.resetSize(f.note.id);
  assert.deepEqual(geometry(w.layout.state.placements[f.note.id]), { x: custom.x, y: custom.y, width: 320, height: 480 });
  assert.deepEqual(w.layout.state.placements[f.other.id], other); await w.undo([area]);
  assert.deepEqual(geometry(w.layout.state.placements[f.note.id]), geometry(custom));
  const backup = await openBackup((await createBackup({ workspace: w, storage: { getAttachment: async () => null } })).bytes);
  assert.equal(backup.data.layout.schemaVersion, 1);
  assert.deepEqual(geometry(backup.data.layout.placements[f.note.id]), geometry(custom));
  assert.deepEqual(backup.data.layout.history, w.layout.state.history);
  assert.deepEqual(backup.data.drafts, Object.values(contentBefore));
});

test('S12: a combined desk routes resize/reset to the correct profile and uses the desk size preference', async () => {
  const a = await fixture(), b = await fixture();
  const values = new Map(), storage = { getControl: async key => structuredClone(values.get(key) ?? null),
    putControl: async (key, value) => { values.set(key, structuredClone(value)); } };
  const combined = await CombinedWorkspace.open([{ id: 'local', workspace: a.workspace, storage },
    { id: 'google:resize', workspace: b.workspace, storage }], storage);
  await combined.layout.configure({ grid: { rows: 1, columns: 2, area, slots: [a.group.id, b.group.id] } }, combined.snapshot);
  await combined.layout.placeNew(combined.working, [area]); await combined.layout.configure({ newPaperSize: 'large' }, combined.snapshot);
  const c = new InteractionController({ getSnapshot: () => combined.working, layout: combined.layout, commands: combined,
    workAreas: () => [area], saveDraft: async () => {} });
  await c.activate({ kind: 'all' }); const original = a.workspace.layout.state;
  c.pointerDown(b.note.id, { x: 0, y: 0 }, { edge: 'se' }); await c.pointerUp({ x: 37, y: 21 });
  const resized = geometry(b.workspace.layout.state.placements[b.note.id]);
  assert.deepEqual(a.workspace.layout.state, original); await c.resetSize(b.note.id);
  assert.equal(b.workspace.layout.state.placements[b.note.id].width, 320);
  await combined.undo([area]); assert.deepEqual(geometry(b.workspace.layout.state.placements[b.note.id]), resized);
});
