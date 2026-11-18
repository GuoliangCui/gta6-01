// Ambient traffic: harbour drivers following the avenues on the correct side of the road,
// turning at junctions, braking for whatever is in front of them. Cars fade in on roads
// away from the player and are recycled once they fall too far behind.
import { ROADS_H, ROADS_V, TRAFFIC_TARGET } from './config.js';
import { isRoad } from './world.js';
import { createCar, stepCar } from './vehicles.js';

/** Lane offset from a road's centre line: traffic keeps right. */
const LANE = 27;

function laneTarget(rng, car) {
  // From the car's heading, aim far down its lane; at a junction, sometimes turn.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const atCrossing = ROADS_V.some((x) => Math.abs(car.x - x) < 70) && ROADS_H.some((y) => Math.abs(car.y - y) < 70);
  let dirX = hx;
  let dirY = hy;
  if (atCrossing && rng.chance(0.4)) {
    dirX = hy;
    dirY = hx;
    if (rng.chance(0.5)) { dirX = -dirX; dirY = -dirY; }
  }
  const rx = -dirY;
  const ry = dirX;
  car.wx = car.x + dirX * 420 + rx * LANE;
  car.wy = car.y + dirY * 420 + ry * LANE;
}

function spawnTrafficCar(rng, world, player) {
  for (let tries = 0; tries < 12; tries += 1) {
    const vertical = rng.chance(0.5);
    const centre = vertical ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
    const along = rng.range(120, vertical ? world.height - 300 : world.width - 120);
    const dir = rng.chance(0.5) ? 1 : -1;
    const x = vertical ? centre + (dir > 0 ? -LANE : LANE) : along;
    const y = vertical ? along : centre + (dir > 0 ? LANE : -LANE);
    if (Math.hypot(x - player.x, y - player.y) < 520) continue;
    if (!isRoad(x, y)) continue;
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(rng, x, y, angle, rng.chance(0.14) ? 'taxi' : 'car', false);
    car.driver = 'traffic';
    laneTarget(rng, car);
    return car;
  }
  return null;
}

/** A driver controls a car toward its lane target and brakes for trouble ahead. */
export function trafficControl(rng, car, obstacles) {
  const dx = car.wx - car.x;
  const dy = car.wy - car.y;
  if (Math.hypot(dx, dy) < 60) laneTarget(rng, car);
  const wanted = Math.atan2(dy, dx);
  let diff = wanted - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = car.speed < car.cruise ? 0.75 : 0;
  // Anything close in front means brakes.
  const fx = car.x + Math.cos(car.angle) * 58;
  const fy = car.y + Math.sin(car.angle) * 58;
  for (const other of obstacles) {
    if (other === car) continue;
    if (Math.hypot(other.x - fx, other.y - fy) < 34) { throttle = car.speed > 30 ? -0.8 : 0; break; }
  }
  if (Math.abs(diff) > 2.4) throttle = -0.5;
  return { throttle, steer };
}

/**
 * Keep TRAFFIC_TARGET drivers around the player and step them. Parked and player-driven
 * cars in the same list are left alone. Returns nothing; cars are mutated in place and
 * dead ones are spliced by the caller through the shared array.
 */
export function stepTraffic(rng, world, cars, player, dt) {
  let driven = 0;
  for (const car of cars) if (car.driver === 'traffic') driven += 1;
  if (driven < TRAFFIC_TARGET) {
    const car = spawnTrafficCar(rng, world, player);
    if (car) cars.push(car);
  }
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    const car = cars[i];
    if (car.driver !== 'traffic') continue;
    if (Math.hypot(car.x - player.x, car.y - player.y) > 1150) {
      cars.splice(i, 1);
      continue;
    }
    stepCar(world, car, dt, trafficControl(rng, car, cars));
  }
}
