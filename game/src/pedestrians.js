// Pedestrians: harbour-town folk strolling the sidewalk loop around their block. They keep
// to the pavement, panic and run when a shot rings out or a car bears down on them, and fall
// when a car does not stop. A fallen pedestrian is the city's fastest way to earn a star.
import { PED_COUNT, PALETTE } from './config.js';
import { collideCircle, sidewalkLoops } from './world.js';

export function createPed(rng, loops) {
  const loop = rng.pick(loops);
  const perimeter = 2 * (loop.w + loop.h);
  return {
    loop,
    s: rng.range(0, perimeter), // distance along the loop
    dir: rng.chance(0.5) ? 1 : -1,
    speed: rng.range(38, 62),
    x: 0, y: 0, vx: 0, vy: 0,
    colour: rng.pick(PALETTE.ped),
    flee: 0,
    fleeX: 0,
    fleeY: 0,
    down: 0, // seconds spent on the ground; 0 = upright
    angle: 0,
  };
}

export function seedPeds(state) {
  const loops = sidewalkLoops(state.world);
  for (let i = 0; i < PED_COUNT; i += 1) {
    const ped = createPed(state.rng, loops);
    placeOnLoop(ped, 0);
    state.peds.push(ped);
  }
}

function placeOnLoop(ped, dt) {
  const { loop } = ped;
  const perimeter = 2 * (loop.w + loop.h);
  ped.s = ((ped.s + ped.dir * ped.speed * dt) % perimeter + perimeter) % perimeter;
  let s = ped.s;
  if (s < loop.w) { ped.x = loop.x + s; ped.y = loop.y; ped.angle = ped.dir > 0 ? 0 : Math.PI; }
  else if ((s -= loop.w) < loop.h) { ped.x = loop.x + loop.w; ped.y = loop.y + s; ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  else if ((s -= loop.h) < loop.w) { ped.x = loop.x + loop.w - s; ped.y = loop.y + loop.h; ped.angle = ped.dir > 0 ? Math.PI : 0; }
  else { s -= loop.w; ped.x = loop.x; ped.y = loop.y + loop.h - s; ped.angle = ped.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
  if (ped.dir < 0) ped.angle += Math.PI;
}

/** Something frightening happened at (x, y): nearby pedestrians run from it. */
export function scarePeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.flee = state.rng.range(2.2, 3.6);
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.fleeX = Math.cos(a);
      ped.fleeY = Math.sin(a);
    }
  }
}

export function updatePeds(state, dt) {
  for (const ped of state.peds) {
    if (ped.down) {
      ped.down += dt;
      ped.vx = 0;
      ped.vy = 0;
      continue;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      ped.x += ped.fleeX * 148 * dt;
      ped.y += ped.fleeY * 148 * dt;
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      collideCircle(state.world, ped, 10);
      continue;
    }
    // A car coming straight at them clears the pavement faster than any siren.
    let danger = null;
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 60) continue;
      const d = Math.hypot(car.x - ped.x, car.y - ped.y);
      if (d < 64) {
        const toward = ((ped.x - car.x) * car.vx + (ped.y - car.y) * car.vy) / (Math.abs(car.speed) + 1);
        if (toward > 20) { danger = car; break; }
      }
    }
    if (danger) {
      ped.flee = 0.7;
      const a = Math.atan2(ped.y - danger.y, ped.x - danger.x);
      ped.fleeX = Math.cos(a);
      ped.fleeY = Math.sin(a);
      continue;
    }
    placeOnLoop(ped, dt);
  }
}

/** Knock a pedestrian down (a car did it). Returns true the moment it happens. */
export function knockDown(ped) {
  if (ped.down) return false;
  ped.down = 0.001;
  ped.flee = 0;
  return true;
}
