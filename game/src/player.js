// Rio, the player: on foot he walks, sprints and aims with the mouse; at a car's door he
// gets in — politely when it is parked, less so when it is not — and drives with the same
// arcade physics as everyone else. Crimes are not judged here; this file raises events on
// the state and the police module decides what was seen.
import { PLAYER } from './config.js';
import { collideCircle } from './world.js';
import { stepCarPhysics, exitSpot } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { sidewalkLoops } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    angle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    car: null,
    ammo: 12,
    reloading: 0,
    fireTimer: 0,
    lastDamage: -99,
    name: 'RIO',
  };
}

export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.health <= 0) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(state, car) {
  const p = state.player;
  if (car.driver === 'ai') {
    // The driver bails out and runs — a witness with every reason to call it in.
    const ped = createPed(state.rng, sidewalkLoops(state.world));
    ped.x = car.x + 24;
    ped.y = car.y + 10;
    ped.flee = 3.2;
    const a = Math.atan2(ped.y - p.y, ped.x - p.x);
    ped.fleeX = Math.cos(a);
    ped.fleeY = Math.sin(a);
    state.peds.push(ped);
    state.events.push({ type: 'crime', crime: 'theft', x: car.x, y: car.y, loud: true });
  } else if (car.kind === 'mission') {
    state.events.push({ type: 'crime', crime: 'theft', x: car.x, y: car.y, loud: true });
  }
  car.driver = 'player';
  p.car = car;
  state.events.push({ type: 'enterCar', car });
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  const spot = exitSpot(car);
  p.x = spot.x;
  p.y = spot.y;
  collideCircle(state.world, p, PLAYER.radius);
  car.driver = null;
  p.car = null;
  p.vx = 0;
  p.vy = 0;
  state.events.push({ type: 'exitCar', car });
}

export function updatePlayer(state, input, dt) {
  const p = state.player;
  const world = state.world;

  if (state.time - p.lastDamage > PLAYER.regenDelay && p.health > 0) {
    p.health = Math.min(PLAYER.maxHealth, p.health + PLAYER.regenRate * dt);
  }

  if (p.car) {
    const car = p.car;
    const drive = {
      throttle: (input.up ? 1 : 0) - (input.down ? 1 : 0),
      steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    };
    const impact = stepCarPhysics(world, car, drive, dt);
    if (impact > 170) state.events.push({ type: 'crash', x: car.x, y: car.y, impact });
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.vx = car.vx;
    p.vy = car.vy;
    // Running someone down is checked here, where the speed is known.
    if (Math.abs(car.speed) > 55) {
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius + 10) {
          state.events.push({ type: 'hitPed', ped, x: ped.x, y: ped.y, fatal: Math.abs(car.speed) > 190, byPlayer: true });
        }
      }
    }
    if (input.interactPressed && Math.abs(car.speed) < 60) exitCar(state);
    return;
  }

  // On foot.
  const sprint = input.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    p.angle = Math.atan2(my, mx);
  }
  p.vx = mx * (len > 0 ? sprint : 0);
  p.vy = my * (len > 0 ? sprint : 0);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  collideCircle(world, p, PLAYER.radius);
  if (input.aimActive && input.aimX !== undefined) {
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  }

  if (input.interactPressed) {
    const car = nearestCar(state, p.x, p.y, 54);
    if (car) enterCar(state, car);
  }
}
