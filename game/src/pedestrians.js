// Pedestrians: harbour folk strolling the sidewalks and the promenade. They amble between
// corners, keep out of the buildings, and run from gunfire, crashes and speeding cars.
// A person knocked down stays down — the simulation counts the cost.
import { PED_TARGET, ROADS_H, ROADS_V } from './config.js';
import { collideCircle, isWater } from './world.js';

const SHIRTS = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43', '#54a0ff', '#5f27cd', '#c8d6e5'];

/** Create one pedestrian at a sidewalk point. */
export function createPed(rng, x, y) {
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    hp: 100,
    state: 'walk',
    color: rng.pick(SHIRTS),
    wx: x,
    wy: y,
    panic: 0,
    think: rng.range(0, 0.4),
  };
}

function pickStrollTarget(rng, ped) {
  // Sidewalks live just off the road centre lines; aim for a point along one of them.
  const vertical = rng.chance(0.5);
  const centre = vertical ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
  const side = rng.chance(0.5) ? -72 : 72;
  const along = rng.range(80, vertical ? 2440 : 3520);
  ped.wx = vertical ? centre + side : along;
  ped.wy = vertical ? along : centre + side;
}

/** Spawn pedestrians on sidewalks within sight of the player, up to PED_TARGET. */
export function stepPedestrians(rng, world, peds, focus, dt) {
  let alive = 0;
  for (const ped of peds) if (ped.state !== 'down') alive += 1;
  if (alive < PED_TARGET) {
    for (let tries = 0; tries < 6; tries += 1) {
      const x = focus.x + rng.range(-560, 560);
      const y = focus.y + rng.range(-420, 420);
      if (x < 20 || y < 20 || x > world.width - 20 || y > world.height - 20) continue;
      if (isWater(world, x, y)) continue;
      const ped = createPed(rng, x, y);
      if (collideCircle(world, ped, 10)) continue;
      pickStrollTarget(rng, ped);
      peds.push(ped);
      break;
    }
  }
  for (let i = peds.length - 1; i >= 0; i -= 1) {
    const ped = peds[i];
    if (Math.hypot(ped.x - focus.x, ped.y - focus.y) > 1250 && ped.state !== 'down') {
      peds.splice(i, 1);
      continue;
    }
    if (ped.state === 'down') continue;
    ped.think -= dt;
    if (ped.panic > 0) ped.panic -= dt;
    const fleeing = ped.panic > 0;
    if (ped.think <= 0 && !fleeing) {
      ped.think = rng.range(0.2, 0.5);
      if (Math.hypot(ped.wx - ped.x, ped.wy - ped.y) < 24) pickStrollTarget(rng, ped);
    }
    const tx = fleeing ? ped.x + Math.cos(ped.angle) * 120 : ped.wx;
    const ty = fleeing ? ped.y + Math.sin(ped.angle) * 120 : ped.wy;
    const wanted = Math.atan2(ty - ped.y, tx - ped.x);
    let diff = wanted - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
    const top = fleeing ? 215 : 74;
    ped.speed += ((Math.abs(diff) < 1.2 ? top : top * 0.3) - ped.speed) * Math.min(1, dt * 5);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    collideCircle(world, ped, 10);
  }
}

/** Send every pedestrian near a point running from it (a shot, a crash, a stolen car). */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.panic = 2.6;
      ped.angle = Math.atan2(ped.y - y, ped.x - x);
    }
  }
}
