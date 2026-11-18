// Cars and their arcade physics. One model serves the player's ride, ambient traffic and
// police interceptors; only the driver (a control object) and the top speed differ. A car
// is a position, a heading and a forward speed — collisions treat it as a circle, which
// keeps the harbour's tight corners forgiving.
import {
  CAR_ACCEL, CAR_BRAKE, CAR_DRAG, CAR_REVERSE, CAR_TOP_COP, CAR_TOP_SPORT,
  CAR_TOP_SPEED, CAR_TURN,
} from './config.js';
import { collideCircle } from './world.js';

/** Step results, as bit flags so the simulation can react (sound, damage, crime). */
export const CAR_HIT_WORLD = 1;
export const CAR_HIT_HARD = 2;

const PAINTS = ['#e74c3c', '#f39c12', '#ecf0f1', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#95a5a6'];
const SPORT_PAINTS = ['#ff2d78', '#ffb400', '#00e5ff', '#7cff00'];

/** Create a car. kind: 'car' | 'sport' | 'cop' | 'taxi'. Parked cars have no driver. */
export function createCar(rng, x, y, angle, kind, parked) {
  return {
    id: 0,
    x, y, angle,
    speed: 0,
    kind,
    topSpeed: kind === 'sport' ? CAR_TOP_SPORT : kind === 'cop' ? CAR_TOP_COP : CAR_TOP_SPEED,
    color: kind === 'cop' ? '#f5f6fa' : kind === 'sport' ? rng.pick(SPORT_PAINTS) : kind === 'taxi' ? '#f7b731' : rng.pick(PAINTS),
    health: 100,
    parked: Boolean(parked),
    locked: parked ? rng.chance(0.3) : false,
    driver: null,
    cruise: rng.range(190, 265),
    wx: x,
    wy: y,
    stuck: 0,
  };
}

/**
 * Advance one car one step. control is {throttle: -1..1, steer: -1..1}. The car slows
 * itself with drag, steers harder the faster it goes (up to a point), and reports hard
 * impacts so the caller can hurt the occupants and dent the bodywork.
 */
export function stepCar(world, car, dt, control) {
  const before = car.speed;
  if (control.throttle > 0) {
    car.speed += CAR_ACCEL * control.throttle * dt * (1 - Math.max(0, car.speed) / (car.topSpeed * 1.25));
  } else if (control.throttle < 0) {
    if (car.speed > 12) car.speed -= CAR_BRAKE * dt;
    else car.speed = Math.max(-CAR_REVERSE, car.speed + CAR_ACCEL * control.throttle * dt);
  }
  car.speed -= car.speed * CAR_DRAG * dt;
  if (Math.abs(car.speed) < 2 && control.throttle === 0) car.speed = 0;
  const grip = Math.min(1, Math.abs(car.speed) / 130);
  car.angle += control.steer * CAR_TURN * grip * dt * (car.speed < 0 ? -1 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  let events = 0;
  if (collideCircle(world, car, 21)) {
    events |= CAR_HIT_WORLD;
    if (Math.abs(before) > 190) events |= CAR_HIT_HARD;
    car.speed *= -0.22;
  }
  return events;
}

/**
 * Two cars meeting: push them apart, and trade momentum only on a real impact — the
 * approach speed along the line of centres. Resting contact (a police car leaning on
 * the player's door) moves nobody's speedometer, so a floored throttle still pulls
 * away. Returns the approach speed, 0 when there was no impact.
 */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= 40 || d < 0.001) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const push = (40 - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const avx = Math.cos(a.angle) * a.speed;
  const avy = Math.sin(a.angle) * a.speed;
  const bvx = Math.cos(b.angle) * b.speed;
  const bvy = Math.sin(b.angle) * b.speed;
  const an = avx * nx + avy * ny;
  const bn = bvx * nx + bvy * ny;
  const approach = an - bn;
  if (approach <= 0) return 0;
  // Exchange the normal velocity components, damped; tangents carry through. A
  // head-on now bounces both cars back instead of grinding them to a standstill.
  const anAfter = bn * 0.85;
  const bnAfter = an * 0.85;
  const aVx = avx - an * nx + anAfter * nx;
  const aVy = avy - an * ny + anAfter * ny;
  const bVx = bvx - bn * nx + bnAfter * nx;
  const bVy = bvy - bn * ny + bnAfter * ny;
  a.speed = aVx * Math.cos(a.angle) + aVy * Math.sin(a.angle);
  b.speed = bVx * Math.cos(b.angle) + bVy * Math.sin(b.angle);
  return approach;
}
