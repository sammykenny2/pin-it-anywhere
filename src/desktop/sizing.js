import { resizeEdges } from '../layout/resize.js';
import { t } from '../i18n/index.js';

/** Keep the grip nodes stable while frames arrive, including keyboard focus during a resize. */
export function updateSizingControls(paper, active, quick = false) {
  if (!paper.querySelector('.paper-resize-edge')) {
    for (const edge of resizeEdges) {
      const grip = document.createElement(edge === 'se' ? 'button' : 'span');
      grip.className = `paper-resize-edge resize-${edge}`; grip.dataset.resizeEdge = edge;
      if (edge === 'se') grip.type = 'button'; else grip.setAttribute('aria-hidden', 'true');
      paper.append(grip);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'paper-size-reset';
    reset.dataset.resetSize = ''; reset.textContent = '↺'; paper.append(reset);
  }
  paper.classList.toggle('paper-sizing', active); paper.classList.toggle('paper-quick-sizing', quick);
  const grip = paper.querySelector('.resize-se'); grip.tabIndex = active ? 0 : -1;
  grip.setAttribute('aria-label', t('desktop.resize.grip')); grip.setAttribute('aria-description', t('desktop.resize.keys'));
  const reset = paper.querySelector('.paper-size-reset'); reset.hidden = !active; reset.tabIndex = active ? 0 : -1;
  reset.setAttribute('aria-label', t('desktop.resize.reset')); reset.title = t('desktop.resize.reset');
}

/** Quick-only handles do not take ordinary reading clicks; determine the edge when the modifier is held. */
export function resizeEdgeAt(event, paper) {
  const handle = event.target.closest('[data-resize-edge]');
  if (handle) return handle.dataset.resizeEdge;
  const rect = paper.getBoundingClientRect(), margin = 6;
  const horizontal = event.clientX >= rect.right - margin ? 'e' : event.clientX < rect.left + margin ? 'w' : '';
  const vertical = event.clientY >= rect.bottom - margin ? 's' : event.clientY < rect.top + margin ? 'n' : '';
  return vertical + horizontal || null;
}

/** Keyboard sizing has its own focus target, leaving textarea arrows, Enter and Undo untouched. */
export function installKeyboardSizing(root, { begin, move, end, cancel, reset, report }) {
  let current = null, tail = Promise.resolve();
  const run = action => { tail = tail.then(action).catch(async error => { current = null; await cancel().catch(() => {}); report(error); }); };
  const withdraw = () => { if (!current) return; current = null; run(cancel); };
  root.addEventListener('keydown', event => {
    const grip = event.target.closest('.paper-sizing .resize-se');
    if (!grip || event.isComposing) return;
    const keys = ['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const paper = grip.closest('[data-card-id]');
    if (event.key === 'Escape') { withdraw(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.repeat) return;
      if (current) { const last = current; current = null; run(() => end(last.point)); }
      else {
        const rect = paper.getBoundingClientRect();
        current = { point: { clientX: rect.right - 1, clientY: rect.bottom - 1 } };
        const point = current.point; run(() => begin(paper.dataset.cardId, point));
      }
      return;
    }
    if (!current) return;
    const step = event.shiftKey ? 10 : 1;
    const point = { clientX: current.point.clientX + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      clientY: current.point.clientY + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) };
    current.point = point; run(() => move(point));
  }, true);
  root.addEventListener('focusout', event => { if (event.target.matches('.resize-se')) withdraw(); });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-reset-size]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); withdraw(); run(() => reset(button.closest('[data-card-id]').dataset.cardId));
  }, true);
  return { cancel: withdraw };
}
