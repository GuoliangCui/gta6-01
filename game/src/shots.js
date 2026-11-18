// Deterministic screenshot scenes. Each one builds a fresh sim at the requested seed and
// plays it — really plays it, through stepSim with scripted inputs — into a photogenic
// moment: Rio strolling by the park, Rio driving, Rio being hunted, Rio arriving at
// Marina's first job. No state is hand-posed that the game itself could not reach.
import { STEP } from './config.js';
import { createSim, stepSim, EMPTY_INPUT } from './sim.js';
import { commitCrime } from './police.js';

function input(patch) {
  return { ...EMPTY_INPUT, ...patch };
}

/** Hold a control pattern for a number of fixed steps. */
function hold(state, patch, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepSim(state, input(patch), STEP);
}

/** Walk or drive toward a point, steering by the same keys a player would use. */
function goTo(state, tx, ty, seconds, sprint = true) {
  const steps = Math.round(seconds / STEP);
  let stallTime = 0;
  let lastX = state.player.x;
  let lastY = state.player.y;
  let detour = 0;
  for (let i = 0; i < steps; i += 1) {
    const p = state.player;
    let dx = tx - p.x;
    let dy = ty - p.y;
    if (Math.hypot(dx, dy) < 26) break;
    // On foot, a building face can hold Rio up: if he has barely moved for a moment,
    // sidestep along the wall until the way opens — the classic unstuck shuffle.
    if (!p.car) {
      if (Math.hypot(p.x - lastX, p.y - lastY) > 14) {
        stallTime = 0;
        lastX = p.x;
        lastY = p.y;
      } else {
        stallTime += STEP;
      }
      if (stallTime > 1.1) { detour = 0.65; stallTime = 0; }
      if (detour > 0) {
        detour -= STEP;
        const tmp = dx;
        dx = -dy;
        dy = tmp;
      }
    }
    if (p.car) {
      const target = Math.atan2(dy, dx);
      let diff = target - p.car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Wedged on a wall? Back out and try the line again, like any driver would.
      if (Math.hypot(p.x - lastX, p.y - lastY) > 14) {
        stallTime = 0;
        lastX = p.x;
        lastY = p.y;
      } else {
        stallTime += STEP;
      }
      if (stallTime > 1.1) { detour = 0.7; stallTime = 0; }
      const backingOut = detour > 0;
      if (backingOut) detour -= STEP;
      const reversing = Math.abs(diff) >= 2.4 || backingOut;
      const patch = { up: !reversing, down: reversing };
      // Steering flips while reversing: swap the keys so the nose still hunts the target.
      if (diff > 0.12) patch[reversing ? 'left' : 'right'] = true;
      if (diff < -0.12) patch[reversing ? 'right' : 'left'] = true;
      stepSim(state, input(patch), STEP);
    } else {
      stepSim(state, input({
        right: dx > 12, left: dx < -12, down: dy > 12, up: dy < -12, sprint,
      }), STEP);
    }
  }
}

/** The nearest standing pedestrian to Rio. */
function nearestPed(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const ped of state.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}

/** Drive at a (probably fleeing) pedestrian until close enough to be seen offending. */
function chasePed(state, ped, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const p = state.player;
    const dx = ped.x - p.x;
    const dy = ped.y - p.y;
    if (Math.hypot(dx, dy) < 120) break;
    if (p.car) {
      const target = Math.atan2(dy, dx);
      let diff = target - p.car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const reversing = Math.abs(diff) >= 2.4;
      const patch = { up: !reversing, down: reversing };
      if (diff > 0.12) patch[reversing ? 'left' : 'right'] = true;
      if (diff < -0.12) patch[reversing ? 'right' : 'left'] = true;
      stepSim(state, input(patch), STEP);
    } else {
      stepSim(state, input({ right: dx > 12, left: dx < -12, down: dy > 12, up: dy < -12, sprint: true }), STEP);
    }
  }
}

function enterNearestCar(state) {
  // Try the parked cars nearest-first until one lets him in — a car boxed in behind a
  // building should not sink the scene.
  const p = state.player;
  const cars = state.cars
    .filter((c) => c.kind === 'parked')
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  for (const car of cars) {
    goTo(state, car.x + 6, car.y + 26, 9);
    stepSim(state, input({ interactPressed: true }), STEP);
    hold(state, {}, 0.1);
    if (state.player.car) return state.player.car;
  }
  return null;
}

export function stageShot(name, seed) {
  const state = createSim(seed, null);

  if (name === 'walk') {
    // Up the café street toward the park, mid-morning stroll.
    goTo(state, 700, 470, 5);
    hold(state, { up: true }, 0.5);
    state.player.angle = -0.7;
  } else if (name === 'drive') {
    // The sedan in the north lot: reached up the avenue on foot, with a clean exit
    // straight back onto the road — no threading a car out of a walled yard.
    const sedan = state.cars.find((c) => c.kind === 'parked' && c.x > 1000 && c.y < 300);
    if (sedan) {
      goTo(state, 1211, 700, 6);
      goTo(state, 1211, 330, 6);
      goTo(state, sedan.x + 6, sedan.y + 26, 6);
      stepSim(state, input({ interactPressed: true }), STEP);
      hold(state, {}, 0.1);
    }
    if (!state.player.car) enterNearestCar(state);
    // South down the avenue, then east along the middle street.
    goTo(state, 1211, 700, 6);
    goTo(state, 1750, 762, 6);
    hold(state, { up: true }, 0.4);
  } else if (name === 'chase') {
    enterNearestCar(state);
    // Earn the heat the way the game awards it: crimes committed beside a witness, judged
    // by the police module itself. Rio hunts down a bystander, offends, repeats — four
    // stars — then runs, and the force closes in around him.
    for (let round = 0; round < 8 && state.stars < 4; round += 1) {
      const ped = nearestPed(state);
      if (ped) chasePed(state, ped, 3);
      commitCrime(state, 'hitPed', state.player.x, state.player.y);
      hold(state, {}, 0.4);
    }
    // End the scene mid-flight on the avenue, with the force converging.
    goTo(state, 745, 430, 5);
    hold(state, { up: true }, 1.6);
    hold(state, {}, 0.3);
  } else if (name === 'mission') {
    // Down to the promenade and along to Marina: the gold marker, the pier, the sea.
    goTo(state, 700, 1440, 6);
    goTo(state, 760, 1560, 5);
    hold(state, {}, 0.3);
    state.player.angle = Math.PI * 0.75;
  }
  return state;
}
