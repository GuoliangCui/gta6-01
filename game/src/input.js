// Keyboard and mouse, translated into the simulation's input struct. Held keys are state;
// presses (enter car, reload, talk, pause, new game) are edges that live for exactly one
// snapshot. The mouse position is converted from client pixels to world coordinates here,
// using the camera and the letterboxed view, so the sim only ever sees world space.
import { EMPTY_INPUT } from './sim.js';

export function createInput(canvas) {
  const held = new Set();
  const edges = new Set();
  let mouseClient = null;
  let mouseDown = false;

  const EDGE_KEYS = {
    KeyF: 'interact', KeyE: 'interact',
    Enter: 'confirm', Space: 'confirm',
    KeyR: 'reload',
    Escape: 'pause', KeyP: 'pause',
    KeyN: 'newGame',
  };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      held.add(e.code);
      const edge = EDGE_KEYS[e.code];
      if (edge) edges.add(edge);
      edges.add('any');
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); mouseDown = false; });

  canvas.addEventListener('mousemove', (e) => { mouseClient = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('mousedown', (e) => {
    mouseClient = { x: e.clientX, y: e.clientY };
    mouseDown = true;
    edges.add('confirm');
    edges.add('any');
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t) mouseClient = { x: t.clientX, y: e.clientY };
    edges.add('any');
  }, { passive: true });

  const down = (...codes) => codes.some((c) => held.has(c));

  return {
    /**
     * Build this frame's inputs. `sim` goes to stepSim; `ui` carries the one-frame edges
     * the shell itself consumes (pause, new game, "pressed anything").
     */
    snapshot(state, view) {
      const p = state.player;
      let aimX = p.x + Math.cos(p.angle) * 120;
      let aimY = p.y + Math.sin(p.angle) * 120;
      let aimActive = false;
      if (mouseClient && view) {
        const rect = canvas.getBoundingClientRect();
        const vx = (mouseClient.x - rect.left - view.ox) / view.scale;
        const vy = (mouseClient.y - rect.top - view.oy) / view.scale;
        aimX = state.camera.x + vx;
        aimY = state.camera.y + vy;
        aimActive = true;
      }
      const sim = {
        ...EMPTY_INPUT,
        up: down('KeyW', 'ArrowUp'),
        down: down('KeyS', 'ArrowDown'),
        left: down('KeyA', 'ArrowLeft'),
        right: down('KeyD', 'ArrowRight'),
        sprint: down('ShiftLeft', 'ShiftRight'),
        shoot: mouseDown || held.has('Space'),
        interactPressed: edges.has('interact'),
        confirmPressed: edges.has('confirm'),
        reloadPressed: edges.has('reload'),
        aimX,
        aimY,
        aimActive,
      };
      const ui = {
        pause: edges.has('pause'),
        newGame: edges.has('newGame'),
        any: edges.has('any'),
        confirm: edges.has('confirm'),
      };
      edges.clear();
      return { sim, ui };
    },
  };
}
