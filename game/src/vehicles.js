// Cars: one arcade physics step shared by the player, the police and (in kinematic form) the
// traffic. A car is a circle for collision — radius from its width — which keeps building and
// car-to-car resolution cheap and stable at 60 steps a second. Hard knocks cost health; a car
// at zero health is a wreck: it will not start, and it smokes.
import { CAR_TYPES } from './config.js';
import { collideCircle } from './world.js';

export function createCar(type, x, y, angle, kind, colour) {
  const spec = CAR_TYPES[type];
  return {
    type,
    kind, // 'traffic' | 'parked' | 'police' | 'mission'
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    w: spec.w,
    h: spec.h,
    radius: 17,
    maxSpeed: spec.maxSpeed,
    accel: spec.accel,
    colour: colour ?? spec.colour,
    health: 100,
    driver: null, // null | 'player' | 'ai'
    cruise: 0,
    stuck: 0,
    lastImpact: 0,
    flash: 0, // police light phase
  };
}

const REVERSE_MAX = 0.34;

/**
 * Advance one car with {throttle: -1..1, steer: -1..1}. Returns the impact speed of the
 * hardest knock this step (0 when it rolled free), so callers can charge damage and noise.
 */
export function stepCarPhysics(world, car, input, dt) {
  if (car.health <= 0) {
    car.speed *= Math.max(0, 1 - 3 * dt);
  } else if (input.throttle > 0) {
    car.speed += car.accel * input.throttle * dt;
  } else if (input.throttle < 0) {
    car.speed += (car.speed > 12 ? car.accel * 2.1 : car.accel * 0.8) * input.throttle * dt;
  }
  car.speed -= car.speed * 0.32 * dt; // drag and rolling resistance
  const top = car.health <= 0 ? 0 : car.maxSpeed;
  car.speed = Math.max(-top * REVERSE_MAX, Math.min(top, car.speed));
  if (Math.abs(car.speed) < 2 && input.throttle === 0) car.speed = 0;

  const turnAuthority = Math.min(1, Math.abs(car.speed) / 130);
  car.angle += input.steer * 2.05 * turnAuthority * dt * (car.speed < 0 ? -1 : 1);

  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  const impact = collideCircle(world, car, car.radius);
  car.lastImpact = impact;
  if (impact > 130) {
    car.health = Math.max(0, car.health - (impact - 130) / 11);
    car.speed *= 0.42;
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
  } else if (impact > 0) {
    car.speed *= 0.82;
  }
  car.flash += dt * 9;
  return impact;
}

/**
 * Resolve overlaps between every pair of cars. Fills `hits` with {a, b, closing} for pairs
 * that met hard enough to matter; callers decide what a crash means (damage, noise, blame).
 */
export function collideCars(cars, hits) {
  hits.length = 0;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) {
        // Trade momentum along the line of impact, then bleed speed: a shunt, not a bounce.
        const impulse = closing * 0.62;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        a.speed = a.vx * Math.cos(a.angle) + a.vy * Math.sin(a.angle);
        b.speed = b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
        if (closing > 95) {
          const dmg = (closing - 95) / 13;
          a.health = Math.max(0, a.health - dmg);
          b.health = Math.max(0, b.health - dmg);
          hits.push({ a, b, closing });
        }
      }
    }
  }
  return hits;
}

/** The spot a driver steps out to: beside the car, clear of its body. */
export function exitSpot(car) {
  const side = car.angle - Math.PI / 2;
  return { x: car.x + Math.cos(side) * (car.radius + 16), y: car.y + Math.sin(side) * (car.radius + 16) };
}
