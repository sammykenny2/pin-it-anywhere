/** Production scene + real shared authority with disposable notes. Usage: node scripts/testing/paper-resize-probe.mjs --url URL [--browser chromium|webkit] */
import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/testing/paper-resize-probe.mjs --url http://127.0.0.1:PORT [--browser chromium|webkit]\nUses only disposable in-memory notes and the production desktop scene/authority.');
  process.exit(0);
}
const option = (key, fallback) => { const index = process.argv.indexOf(key); return index < 0 ? fallback : process.argv[index + 1]; };
const base = new URL(option('--url'));
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
const engine = option('--browser', 'chromium'); assert.ok(['chromium', 'webkit'].includes(engine));
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, locale: 'en-US' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => console.error(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
await page.addInitScript(() => {
  const listeners = new Set(), frames = new Map(); let initialized, sequence = 0;
  window.sizingCommands = [];
  const send = data => setTimeout(() => listeners.forEach(listener => listener({ data })), 0);
  const notify = () => { sequence++; send({ v: 1, event: 'desktop-frame' }); };
  const initialize = async () => {
    const [{ Workspace }, { InteractionController }, { DesktopAuthority }, { projectDesktop }] = await Promise.all([
      import(new URL('/core/workspace.js', location.href).href), import(new URL('/interaction/controller.js', location.href).href),
      import(new URL('/desktop/authority.js', location.href).href), import(new URL('/desktop/projection.js', location.href).href)]);
    const area = { x: 0, y: 0, width: 1100, height: 800 }; let fail = false, editor = null;
    const workspace = await Workspace.create({ profileId: 'local', deviceId: crypto.randomUUID(), area,
      persist: async () => { if (fail) throw new Error('Injected storage failure'); } });
    const group = workspace.snapshot.groups[0];
    const card = await workspace.createCard({ text: 'Synthetic resizing paper', format: 'markdown', attachments: [] }, group.id);
    await workspace.layout.configure({ grid: { rows: 1, columns: 1, slots: [group.id], area }, quickMove: true }, workspace.snapshot);
    await workspace.layout.setGroupLayer(group.id, 'floating', workspace.snapshot);
    await workspace.layout.placeNew(workspace.working, [area]);
    const controller = new InteractionController({ getSnapshot: () => workspace.working, layout: workspace.layout,
      commands: workspace, workAreas: () => [area], saveDraft: async () => {} });
    const sessionId = crypto.randomUUID(), viewId = crypto.randomUUID();
    const authority = new DesktopAuthority({ workspace, controller, sessionId, editor: {
      current: () => editor,
      begin: async cardId => {
        await controller.beginEdit(cardId); const draft = workspace.openDraft(group.id, card); await workspace.saveDraft(draft);
        editor = { cardId, draftId: draft.id, viewId, text: draft.content.text, sequence: 0 }; return editor;
      },
      change: async value => { const draft = workspace.state.drafts[value.draftId]; draft.content.text = value.text; await workspace.saveDraft(draft); editor = value; },
      cancel: async () => { await workspace.discardChanges(card.id); await controller.endEdit(); editor = null; },
      end: async () => { await controller.endEdit(); editor = null; },
      save: async () => { await workspace.commitDraft(editor.draftId); await controller.endEdit(); editor = null; },
    } });
    authority.addView(viewId);
    window.sizingProbe = { workspace, controller, card, authority, notify, fail: value => { fail = value; },
      adjust: async () => { await controller.activate({ kind: 'all' }); notify(); },
      rect: () => { const p = workspace.layout.state.placements[card.id]; return { x: p.x, y: p.y, width: p.width, height: p.height }; },
      history: () => workspace.layout.state.history.length,
      frame: () => projectDesktop({ snapshot: workspace.working, layout: workspace.layout.state, interaction: controller.state,
        sessionId, sequence, workspaceRevision: workspace.state.revision, layers: ['desktop', 'floating'], editor,
        quickMove: /Mac/.test(navigator.platform) ? 'meta' : 'ctrl' }) };
    sequence++;
    return { sessionId, viewId };
  };
  const handle = async message => {
    const info = await (initialized ??= initialize());
    const reply = result => send({ v: 1, id: message.id, ok: true, result });
    if (message.method === 'scene.info') return reply({ ...info, layer: 'floating', active: true,
      viewport: { x: 0, y: 0, width: 1100, height: 800 }, bindings: {} });
    if (message.method === 'scene.frame') {
      const bytes = new TextEncoder().encode(JSON.stringify(window.sizingProbe.frame())), token = crypto.randomUUID(); frames.set(token, bytes);
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      return reply({ token, size: bytes.length, sha256 });
    }
    if (message.method === 'scene.read') {
      const { token, offset } = message.params, bytes = frames.get(token), chunk = bytes.subarray(offset, offset + 256 * 1024);
      return reply({ offset, base64: btoa(String.fromCharCode(...chunk)), done: offset + chunk.length === bytes.length });
    }
    if (message.method === 'scene.discard') frames.delete(message.params.token);
    if (message.method === 'scene.command') {
      const command = message.params.command;
      window.sizingCommands.push(command.method);
      try {
        const result = await window.sizingProbe.authority.request(info.viewId, command); notify();
        send({ v: 1, event: 'desktop-command-result', commandId: command.id, ok: true, result });
      } catch (error) {
        notify();
        send({ v: 1, event: 'desktop-command-result', commandId: command.id, ok: false,
          error: { code: error.code || 'probe-failure', message: error.message } });
      }
    }
    if (message.method === 'scene.applied') window.sizingApplied = sequence;
    return reply({});
  };
  window.chrome = { webview: { postMessage: message => { void handle(message); },
    addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) } };
  window.sizingFocus = [];
  for (const type of ['focusin', 'focusout', 'lostpointercapture', 'pointercancel']) document.addEventListener(type,
    event => window.sizingFocus.push({ type, target: event.target.className, related: event.relatedTarget?.className, id: event.pointerId }), true);
  document.addEventListener('dblclick', event => window.sizingFocus.push({ type: 'dblclick', target: event.target.className,
    meta: event.metaKey, ctrl: event.ctrlKey, under: document.elementFromPoint(event.clientX, event.clientY)?.className }), true);
});
const state = () => page.evaluate(() => ({ rect: window.sizingProbe.rect(), history: window.sizingProbe.history(),
  dragging: Boolean(window.sizingProbe.controller.state.dragSession), error: document.querySelector('#scene-status').hidden ? null : document.querySelector('#scene-status').textContent }));
const settled = () => page.waitForFunction(() => !window.sizingProbe.controller.state.dragSession && !document.querySelector('#scene').classList.contains('moving'));
async function drag(edge, dx, dy, key = null) {
  const box = await page.locator('.card').boundingBox();
  const x = edge.includes('w') ? box.x + 2 : edge.includes('e') ? box.x + box.width - 2 : box.x + box.width / 2;
  const y = edge.includes('n') ? box.y + 2 : edge.includes('s') ? box.y + box.height - 2 : box.y + box.height / 2;
  if (key) await page.keyboard.down(key);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 4 });
  if (key) await page.keyboard.up(key);
  await page.mouse.up(); await settled();
}
try {
  await page.goto(new URL('/desktop/index.html', base).href);
  await page.waitForFunction(() => window.sizingApplied && document.querySelector('.card'));
  const original = await state();
  await drag('se', 20, 30); assert.deepEqual((await state()).rect, original.rect, 'reading does not resize');
  await drag('se', 50, 30, modifier);
  assert.deepEqual((await state()).rect, { ...original.rect, width: original.rect.width + 50, height: original.rect.height + 30 });
  const title = await page.locator('.card-summary').boundingBox();
  await page.keyboard.down(modifier); await page.mouse.move(title.x + 30, title.y + 18);
  await page.mouse.down(); await page.mouse.up(); await settled();
  await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 }); await page.keyboard.up(modifier);
  const input = page.locator('textarea'); await input.waitFor(); await input.fill('Text stays while resizing');
  await page.waitForFunction(() => Object.values(window.sizingProbe.workspace.state.drafts).some(draft => draft.content.text === 'Text stays while resizing'));
  await input.evaluate(node => { node.setSelectionRange(4, 9); node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  const edited = await state(); await drag('e', 35, 0);
  assert.equal((await state()).rect.width, edited.rect.width + 35); assert.equal(await input.inputValue(), 'Text stays while resizing');
  assert.deepEqual(await input.evaluate(node => [node.selectionStart, node.selectionEnd]), [4, 9]);
  await mkdir('build/paper-resize-checks', { recursive: true });
  await page.screenshot({ path: `build/paper-resize-checks/${engine}-editor.png` });
  await input.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  const beforeEscape = await state(), editedBox = await page.locator('.card').boundingBox();
  await page.mouse.move(editedBox.x + editedBox.width - 2, editedBox.y + editedBox.height / 2);
  await page.mouse.down(); await page.mouse.move(editedBox.x + editedBox.width + 35, editedBox.y + editedBox.height / 2);
  await page.keyboard.press('Escape'); await page.mouse.up(); await settled();
  assert.deepEqual((await state()).rect, beforeEscape.rect); assert.equal((await state()).history, beforeEscape.history);
  assert.equal(await input.inputValue(), 'Text stays while resizing', 'pointer Escape cancels only the size preview');
  const grip = page.locator('.paper-sizing .resize-se'); await grip.focus();
  const beforeKeys = await state(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter'); await settled();
  assert.deepEqual((await state()).rect, { ...beforeKeys.rect, width: beforeKeys.rect.width + 1, height: beforeKeys.rect.height + 10 });
  assert.equal(await grip.evaluate(node => node === document.activeElement), true, 'frames retain grip focus');
  const beforeCancel = await state(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); await settled();
  assert.deepEqual((await state()).rect, beforeCancel.rect); assert.equal((await state()).history, beforeCancel.history);
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await input.focus(); await settled();
  assert.deepEqual((await state()).rect, beforeCancel.rect, 'leaving the grip cancels the keyboard preview');
  await page.locator('[data-reset-size]').click();
  await page.waitForFunction(() => window.sizingProbe.rect().width === 240);
  assert.deepEqual((await state()).rect, original.rect, 'single-note reset retains position');
  await page.evaluate(() => window.sizingProbe.adjust());
  await input.waitFor({ state: 'detached' });
  const beforeAdjust = await state(); await drag('nw', -25, -15);
  assert.deepEqual((await state()).rect, { x: Math.max(0, beforeAdjust.rect.x - 25), y: Math.max(0, beforeAdjust.rect.y - 15),
    width: beforeAdjust.rect.width + 25, height: beforeAdjust.rect.height + 15 });
  const beforeFailure = await state(); await page.evaluate(() => window.sizingProbe.fail(true)); await drag('se', 20, 20);
  await page.waitForFunction(() => document.querySelector('#scene-status').textContent.includes('storage failure')
    && !document.querySelector('#scene-status').hidden);
  assert.deepEqual((await state()).rect, beforeFailure.rect); assert.equal((await state()).history, beforeFailure.history);
  assert.deepEqual(await page.locator('.card').evaluate(node => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top),
    width: parseFloat(node.style.width), height: parseFloat(node.style.height) })), beforeFailure.rect, 'failed save restores the visible rectangle');
  assert.match((await state()).error, /storage failure/); await page.evaluate(() => window.sizingProbe.fail(false));
  await mkdir('build/paper-resize-checks', { recursive: true });
  await page.screenshot({ path: `build/paper-resize-checks/${engine}.png` });
  assert.deepEqual(errors, []); console.log(`PASS ${engine}: quick/edited/adjust resize, IME/caret, keyboard, cancel, reset and storage rollback`);
} catch (error) {
  console.error(JSON.stringify({ errors, diagnostic: await page.evaluate(() => ({ ready: Boolean(window.sizingProbe),
    status: document.querySelector('#scene-status')?.textContent, cards: document.querySelectorAll('.card').length,
    interaction: window.sizingProbe?.controller.state, commands: window.sizingCommands, focus: window.sizingFocus })).catch(() => null) }));
  throw error;
} finally { await browser.close(); }
