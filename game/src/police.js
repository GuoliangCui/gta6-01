// The wanted system and the harbour police. The law here is literal: a crime only raises
// stars when somebody sees it — an officer in range with line of sight, or a pedestrian
// close enough to tell the tale. Pursuit is fast and layered: interceptors spawn on the
// avenues around the player, hunt predicted positions, and an arrest completes when an
// officer keeps the player pinned and slow.
import {
  BUST_TIME, COPS_PER_STAR, COP_SPAWN_INTERVAL, EVADE_TIME, WITNESS_COP_RANGE, WITNESS_PED_RANGE,
} from './config.js';
import { isRoad, lineOfSight } from './world.js';
import { createCar, stepCar } from './vehicles.js';

/** Minimum stars each crime earns when witnessed. */
const CRIME_STARS = { theft: 1, gunfire: 1, assault: 2, copcrash: 2, kill: 3, copkill: 4 };

export function createWanted() {
  return { stars: 0, evade: 0, bust: 0, spawnTimer: 0, gunCool: 0, seen: false };
}

/** Would anyone report a crime committed at (x, y) right now? */
export function witnessed(world, cars, peds, x, y) {
  for (const car of cars) {
    if (car.kind !== 'cop' || car.driver !== 'cop') continue;
    if (Math.hypot(car.x - x, car.y - y) < WITNESS_COP_RANGE && lineOfSight(world, car.x, car.y, x, y)) return true;
  }
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < WITNESS_PED_RANGE && lineOfSight(world, ped.x, ped.y, x, y)) return true;
  }
  return false;
}

/**
 * Report a crime at (x, y). Unwitnessed crimes pass quietly and return false. A witnessed
 * crime lifts the wanted level to at least its floor; a witnessed killing spree climbs.
 */
export function reportCrime(ctx, kind, x, y) {
  const wanted = ctx.wanted;
  if (kind === 'gunfire') {
    if (wanted.gunCool > 0) return false;
    wanted.gunCool = 2.2;
  }
  if (!witnessed(ctx.world, ctx.cars, ctx.peds, x, y)) return false;
  const floor = CRIME_STARS[kind] ?? 1;
  if (wanted.stars >= floor && (kind === 'kill' || kind === 'copkill')) {
    wanted.stars = Math.min(5, wanted.stars + 1);
  } else {
    wanted.stars = Math.max(wanted.stars, floor);
  }
  wanted.evade = 0;
  ctx.events.push({ type: 'crime', kind, stars: wanted.stars });
  return true;
}

function spawnCop(rng, world, player) {
  for (let tries = 0; tries < 14; tries += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(680, 840);
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    if (x < 40 || y < 40 || x > world.width - 40 || y > world.height - 40) continue;
    if (!isRoad(x, y)) continue;
    // No ambushes from dead ahead of a fast-moving player: help joins from the sides
    // and behind, where a chase can actually be escaped.
    const playerSpeed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
    if (playerSpeed > 200) {
      const dot = ((x - player.x) * player.vx + (y - player.y) * player.vy) / (dist * playerSpeed);
      if (dot > 0.88) continue;
    }
    const car = createCar(rng, x, y, Math.atan2(player.y - y, player.x - x), 'cop', false);
    car.driver = 'cop';
    return car;
  }
  return null;
}

function pursuitControl(car, player) {
  const lead = player.car ? 0.35 : 0.12;
  const tx = player.x + (player.vx ?? 0) * lead;
  const ty = player.y + (player.vy ?? 0) * lead;
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  let diff = wanted - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const dist = Math.hypot(player.x - car.x, player.y - car.y);
  let throttle = 1;
  if (dist < 58) throttle = car.speed > 24 ? -0.7 : 0;
  else if (dist < 120 && Math.abs(diff) > 2.2) throttle = -0.6;
  return { throttle, steer: Math.max(-1, Math.min(1, diff * 2.4)) };
}

/**
 * Run the police for one step: spawn to strength, pursue, watch for the player, fill the
 * arrest meter when an officer has the player pinned, and let stars fade once the player
 * has truly broken contact. Calls ctx.onBusted() when an arrest completes.
 */
export function stepPolice(ctx, dt) {
  const { world, rng, cars, player, wanted } = ctx;
  wanted.gunCool = Math.max(0, wanted.gunCool - dt);
  let cops = 0;
  let anySee = false;
  let pinning = false;
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    const car = cars[i];
    if (car.kind !== 'cop' || car.driver !== 'cop') continue;
    cops += 1;
    const dist = Math.hypot(car.x - player.x, car.y - player.y);
    if (wanted.stars === 0) {
      if (dist > 760) { cars.splice(i, 1); cops -= 1; }
      continue;
    }
    stepCar(world, car, dt, pursuitControl(car, player));
    if (dist < 640 && lineOfSight(world, car.x, car.y, player.x, player.y)) anySee = true;
    const playerSpeed = player.car ? Math.abs(player.car.speed) : player.speedNow;
    // An arrest needs the officer stopped with the player, not a high-speed shunt.
    if (dist < 56 && playerSpeed < 46 && Math.abs(car.speed) < 130) pinning = true;
  }
  if (wanted.stars > 0) {
    wanted.spawnTimer -= dt;
    if (cops < COPS_PER_STAR[wanted.stars] && wanted.spawnTimer <= 0) {
      const car = spawnCop(rng, world, player);
      if (car) { cars.push(car); wanted.spawnTimer = COP_SPAWN_INTERVAL; }
      else wanted.spawnTimer = 0.3;
    }
    if (anySee) { wanted.evade = 0; wanted.seen = true; }
    else {
      wanted.seen = false;
      wanted.evade += dt;
      if (wanted.evade >= EVADE_TIME) {
        wanted.stars -= 1;
        wanted.evade = 0;
        ctx.events.push({ type: 'star-down', stars: wanted.stars });
      }
    }
    if (pinning) {
      wanted.bust += dt;
      if (wanted.bust >= BUST_TIME) ctx.onBusted();
    } else {
      wanted.bust = Math.max(0, wanted.bust - dt * 2.2);
    }
  } else {
    wanted.bust = 0;
    wanted.evade = 0;
    wanted.seen = false;
  }
}
