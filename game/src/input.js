// Keyboard and mouse input. Held keys drive movement and driving; one-shot
// presses (interact, pause, confirm, reload) are latched as edges the game loop
// consumes exactly once, so a press between frames is never lost or doubled.
// Mouse coordinates are reported in the fixed 1280x720 view space.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_CONTINUE = 8;
export const ACTION_RELOAD = 16;

const VIEW_W = 1280;
const VIEW_H = 720;

export function createInput(canvas) {
  const held = new Set();
  let pending = 0;
  let clicked = false;
  const mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };

  function toView(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') pending |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') pending |= ACTION_PAUSE;
    if (event.code === 'KeyE') pending |= ACTION_INTERACT;
    if (event.code === 'KeyC') pending |= ACTION_CONTINUE;
    if (event.code === 'KeyR') pending |= ACTION_RELOAD;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('mousemove', (event) => {
    const pos = toView(event);
    mouse.x = pos.x;
    mouse.y = pos.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    mouse.down = true;
    clicked = true;
    const pos = toView(event);
    mouse.x = pos.x;
    mouse.y = pos.y;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    if (touch) {
      const pos = toView(touch);
      mouse.x = pos.x;
      mouse.y = pos.y;
    }
    mouse.down = true;
    clicked = true;
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => {
    mouse.down = false;
  });

  return {
    mouse,
    /** Walking direction from the held keys: -1, 0 or 1 per axis, unnormalised. */
    moveDirection() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      return { x, y };
    },
    /** Driving input: throttle -1..1 (reverse/brake low, forward high), steer -1..1. */
    driveInput() {
      let throttle = 0;
      let steer = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) throttle += 1;
      if (held.has('KeyS') || held.has('ArrowDown')) throttle -= 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) steer -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) steer += 1;
      return { throttle, steer };
    },
    sprinting() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    firing() {
      return mouse.down;
    },
    /** Take the latched one-shot actions; each is reported exactly once. */
    takeActions() {
      const actions = pending;
      pending = 0;
      return actions;
    },
    /** Take the mouse-click edge (title screens and dialogue use it). */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
  };
}
