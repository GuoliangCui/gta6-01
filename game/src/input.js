// Keyboard and pointer input. Held keys give the move axes; one-shot presses (confirm,
// pause, interact, continue) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. The mouse position is
// kept in CSS pixels; main.js turns it into a world aim point through the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_CONTINUE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const CONTINUE = new Set(['KeyC']);
const GAME_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, ...CONFIRM]);

export function createInput(canvas) {
  const held = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  let queued = 0;

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (CONFIRM.has(event.code)) queued |= ACTION_CONFIRM;
    if (PAUSE.has(event.code)) queued |= ACTION_PAUSE;
    if (INTERACT.has(event.code)) queued |= ACTION_INTERACT;
    if (CONTINUE.has(event.code)) queued |= ACTION_CONTINUE;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.seen = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    mouse.down = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.seen = true;
    queued |= ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  function anyIn(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    mouse,
    /** Move axes, each -1, 0 or 1: y grows downward, so up is -1. */
    axes() {
      return {
        mx: (anyIn(RIGHT) ? 1 : 0) - (anyIn(LEFT) ? 1 : 0),
        my: (anyIn(DOWN) ? 1 : 0) - (anyIn(UP) ? 1 : 0),
      };
    },
    sprint() {
      return anyIn(SPRINT);
    },
    /** Take the queued one-shot actions; each press is reported exactly once. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
