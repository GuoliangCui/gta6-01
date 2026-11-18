// The law: a wanted level of one to five stars, earned only when a crime is witnessed — a
// police unit with eyes on it, or a pedestrian close enough to call it in. Police spawn on
// the road net out of sight, hunt the player's position, ram his car and close in on foot
// to fill an arrest meter. Stay unseen and the heat cools, one star at a time.
import { WANTED } from './config.js';
import { createCar, stepCarPhysics } from './vehicles.js';
import { losClear, randomRoadPoint } from './world.js';

export function policeCars(state) {
  return state.cars.filter((c) => c.kind === 'police');
}

function witnessedBy(state, x, y) {
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.health <= 0) continue;
    if (Math.hypot(car.x - x, car.y - y) < WANTED.witnessPoliceRange && losClear(state.world, car.x, car.y, x, y)) {
      return 'police';
    }
  }
  for (const ped of state.peds) {
    if (ped.down) continue;
    if (Math.hypot(ped.x - x, ped.y - y) < WANTED.witnessPedRange && losClear(state.world, ped.x, ped.y, x, y)) {
      return 'ped';
    }
  }
  return null;
}

const STAR_GAIN = { theft: 1, gunshot: 1, hitPed: 1, hitPedFatal: 2, hitPolice: 1, assault: 1, murder: 2 };

/** Judge a crime. Returns true when it was seen and the heat rose (or was refreshed). */
export function commitCrime(state, crime, x, y) {
  if (crime === 'hitPolice') {
    // The unit you hit needs no witness.
    state.stars = Math.min(5, state.stars + STAR_GAIN.hitPolice);
    state.lastSeen = state.time;
    return true;
  }
  const seen = witnessedBy(state, x, y);
  if (!seen) return false;
  if (crime === 'gunshot') {
    if (state.time - (state.lastGunStar ?? -99) < 4) return true; // seen, but no stacking
    state.lastGunStar = state.time;
  }
  state.stars = Math.min(5, state.stars + (STAR_GAIN[crime] ?? 1));
  if (seen === 'police') state.lastSeen = state.time;
  return true;
}

function spawnPolice(state) {
  const p = randomRoadPoint(state.rng, state.player.x, state.player.y, WANTED.spawnMin, WANTED.spawnMax);
  const car = createCar('police', p.x, p.y, Math.atan2(state.player.y - p.y, state.player.x - p.x), 'police');
  car.driver = 'ai';
  car.gunTimer = state.rng.range(0.5, 1.2);
  state.cars.push(car);
}

function drivePolice(state, car, dt) {
  const p = state.player;
  const tx = p.x + p.vx * 0.35;
  const ty = p.y + p.vy * 0.35;
  const dist = Math.hypot(tx - car.x, ty - car.y);
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  if (Math.abs(car.speed) < 9 && Math.abs(diff) < 2.4) car.stuck += dt;
  else car.stuck = 0;
  let throttle;
  let steer = Math.max(-1, Math.min(1, diff * 2.3));
  if (car.stuck > 1.1) {
    throttle = -1; // reverse out and come again
    steer = -steer;
    if (car.stuck > 1.9) car.stuck = 0;
  } else if (Math.abs(diff) > 2.5) {
    throttle = -0.7;
  } else if (dist < 52 && !p.car) {
    throttle = 0.12; // on foot: park on his toes and let the meter do the work
  } else {
    throttle = 1;
  }
  const impact = stepCarPhysics(state.world, car, { throttle, steer }, dt);
  if (impact > 200) state.events.push({ type: 'crash', x: car.x, y: car.y, impact });
}

export function updatePolice(state, dt) {
  const p = state.player;
  const cops = policeCars(state);

  // Who can see the player right now?
  let seenNow = false;
  for (const car of cops) {
    if (car.health <= 0) continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) < WANTED.sightRange && losClear(state.world, car.x, car.y, p.x, p.y)) {
      seenNow = true;
      break;
    }
  }
  if (seenNow) {
    state.lastSeen = state.time;
    state.coolTimer = 0;
  } else if (state.stars > 0 && state.time - state.lastSeen > WANTED.unseenGrace) {
    state.coolTimer += dt;
    if (state.coolTimer >= WANTED.coolPerStar) {
      state.coolTimer = 0;
      state.stars -= 1;
      state.lastSeen = state.time;
    }
  }

  // Reinforce up to the star level's strength, fast.
  state.spawnTimer -= dt;
  const active = cops.filter((c) => c.health > 0 && !c.calm).length;
  if (state.stars > 0 && active < WANTED.force[state.stars] && state.spawnTimer <= 0) {
    spawnPolice(state);
    state.spawnTimer = WANTED.spawnInterval;
  }

  // Drive them; calm units (heat gone) wander off and despawn.
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.kind !== 'police' || car.driver !== 'ai') continue;
    if (state.stars === 0) car.calm = true;
    if (car.calm) {
      const away = Math.atan2(car.y - p.y, car.x - p.x);
      let diff = away - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      stepCarPhysics(state.world, car, { throttle: 0.55, steer: Math.max(-1, Math.min(1, diff * 2)) }, dt);
      if (Math.hypot(car.x - p.x, car.y - p.y) > 780) state.cars.splice(i, 1);
      continue;
    }
    if (car.health > 0) drivePolice(state, car, dt);
  }

  // Arrest: a close unit and a player who cannot get away. On foot the meter fills at
  // the plain rate; in a car Rio must be properly stopped, and even then the unit needs
  // longer to make the arrest stick — a ram that merely slows him is not a bust.
  let nearCop = false;
  if (state.stars > 0) {
    for (const car of cops) {
      if (car.health <= 0 || car.calm) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < WANTED.arrestRange && (!p.car || Math.abs(p.car.speed) < 15)) { nearCop = true; break; }
    }
  }
  if (nearCop) {
    const fill = p.car ? WANTED.arrestFill * 1.8 : WANTED.arrestFill;
    state.arrest = Math.min(1, state.arrest + dt / fill);
    if (state.arrest >= 1) state.flags.busted = true;
  } else {
    state.arrest = Math.max(0, state.arrest - dt * WANTED.arrestDrain * 0.4);
  }

  // At three stars the units shoot at a fleeing player on foot.
  if (state.stars >= 3 && !p.car) {
    for (const car of cops) {
      if (car.health <= 0 || car.calm || Math.abs(car.speed) > 30) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d > 300 || !losClear(state.world, car.x, car.y, p.x, p.y)) continue;
      car.gunTimer -= dt;
      if (car.gunTimer <= 0) {
        car.gunTimer = state.rng.range(0.85, 1.4);
        const hitChance = Math.max(0.16, 0.6 - d / 620);
        const hit = state.rng() < hitChance;
        const ex = hit ? p.x : p.x + state.rng.range(-46, 46);
        const ey = hit ? p.y : p.y + state.rng.range(-46, 46);
        state.effects.push({ kind: 'tracer', x1: car.x, y1: car.y - 6, x2: ex, y2: ey, t: 0, ttl: 0.09 });
        state.events.push({ type: 'shotFired', x: car.x, y: car.y, byPlayer: false });
        if (hit) {
          p.health -= 5;
          p.lastDamage = state.time;
          state.events.push({ type: 'playerHit', x: p.x, y: p.y });
        }
      }
    }
  }
}
