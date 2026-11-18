// Traffic: civilian cars that cruise the road net on the correct side, slow for the car in
// front, stop for pedestrians in the road and pick a new direction at each junction. They
// move kinematically (no throttle physics) but share the same collision body as every car,
// so the player can shunt them, rob them or write them off.
import { AVENUES, STREETS, LANE, TRAFFIC_COUNT } from './config.js';
import { createCar } from './vehicles.js';
import { randomRoadPoint } from './world.js';

const TYPES = ['compact', 'sedan', 'sedan', 'taxi', 'van', 'compact'];
const COLOURS = ['#e2574c', '#4c8de2', '#69c24a', '#b388eb', '#f4f1de', '#7fb3d5', '#e5989b', '#95a5a6'];

export function laneCoord(axis, centre, dir) {
  // Right-hand traffic: southbound keeps west, northbound east, eastbound south, westbound north.
  return axis === 'y' ? centre + (dir > 0 ? -LANE : LANE) : centre + (dir > 0 ? LANE : -LANE);
}

export function headingAngle(axis, dir) {
  if (axis === 'y') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function laneInfo(x, y) {
  for (let i = 0; i < AVENUES.length; i += 1) {
    if (Math.abs(Math.abs(x - AVENUES[i]) - LANE) < 6) {
      return { axis: 'y', index: i, centre: AVENUES[i], dir: x < AVENUES[i] ? 1 : -1 };
    }
  }
  for (let i = 0; i < STREETS.length; i += 1) {
    if (Math.abs(Math.abs(y - STREETS[i]) - LANE) < 6) {
      return { axis: 'x', index: i, centre: STREETS[i], dir: y > STREETS[i] ? 1 : -1 };
    }
  }
  return { axis: 'y', index: 0, centre: AVENUES[0], dir: 1 };
}

export function spawnTrafficCar(rng, px, py, minD, maxD) {
  const p = randomRoadPoint(rng, px, py, minD, maxD);
  const info = laneInfo(p.x, p.y);
  const type = rng.pick(TYPES);
  const car = createCar(type, p.x, p.y, headingAngle(info.axis, info.dir), 'traffic', type === 'taxi' ? undefined : rng.pick(COLOURS));
  car.driver = 'ai';
  car.traffic = {
    axis: info.axis, index: info.index, dir: info.dir, decide: 0,
  };
  car.cruise = rng.range(138, 205);
  return car;
}

export function seedTraffic(state) {
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const car = spawnTrafficCar(state.rng, state.player.x, state.player.y, 260, 1500);
    state.cars.push(car);
  }
}

function angleEase(current, target, rate, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, rate * dt);
}

/** The car (or pedestrian) blocking this one, and how far ahead it is. */
function obstacleAhead(state, car, t) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = Infinity;
  let bestSpeed = 0;
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 6 || ahead > 86) continue;
    if (Math.abs(dx * -fy + dy * fx) > 21) continue;
    if (ahead < best) {
      best = ahead;
      bestSpeed = Math.abs(other.speed);
    }
  }
  for (const ped of state.peds) {
    if (ped.down) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 4 && ahead < 48 && Math.abs(dx * -fy + dy * fx) < 15 && ahead < best) {
      best = ahead;
      bestSpeed = 0;
    }
  }
  void t;
  return { dist: best, speed: bestSpeed };
}

export function updateTraffic(state, dt) {
  const { rng } = state;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.driver !== 'ai') continue;
    const t = car.traffic;
    if (car.health <= 0) { car.driver = null; car.speed = 0; continue; }

    // Recycle cars that fall far behind the player's world.
    const dp = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (dp > 1650) {
      const fresh = spawnTrafficCar(rng, state.player.x, state.player.y, 760, 1150);
      Object.assign(car, fresh);
      continue;
    }

    // Junction decision: at a crossing, keep going or turn onto the crossing road.
    t.decide -= dt;
    const crossings = t.axis === 'y' ? STREETS : AVENUES;
    if (t.decide <= 0) {
      for (let i = 0; i < crossings.length; i += 1) {
        const along = t.axis === 'y' ? car.y : car.x;
        if (Math.abs(along - crossings[i]) < 9) {
          t.decide = 1.2;
          const roll = rng();
          if (roll > 0.45) {
            const left = roll < 0.72;
            const hd = t.axis === 'y' ? { x: 0, y: t.dir } : { x: t.dir, y: 0 };
            const nd = left ? { x: -hd.y * 1, y: hd.x * 1 } : { x: hd.y, y: -hd.x };
            // Facing south, left is east; the cross product sign flips with screen y — use the map directly:
            const key = `${t.axis},${t.dir},${left ? 'L' : 'R'}`;
            const table = {
              'y,1,L': ['x', 1], 'y,1,R': ['x', -1], 'y,-1,L': ['x', -1], 'y,-1,R': ['x', 1],
              'x,1,L': ['y', -1], 'x,1,R': ['y', 1], 'x,-1,L': ['y', 1], 'x,-1,R': ['y', -1],
            };
            const [nAxis, nDir] = table[key];
            void nd;
            t.axis = nAxis;
            t.dir = nDir;
            t.index = i;
          }
          break;
        }
      }
    }

    const centre = t.axis === 'y' ? AVENUES[t.index] : STREETS[t.index];
    const lane = laneCoord(t.axis, centre, t.dir);
    const obstacle = obstacleAhead(state, car, t);
    let target = car.cruise;
    if (obstacle.dist < 44) target = 0;
    else if (obstacle.dist < 86) target = Math.min(target, obstacle.speed * 0.92);
    if (car.speed < target) car.speed = Math.min(target, car.speed + 175 * dt);
    else car.speed = Math.max(target, car.speed - 330 * dt);

    if (t.axis === 'y') {
      car.y += t.dir * car.speed * dt;
      car.x += (lane - car.x) * Math.min(1, 2.4 * dt);
    } else {
      car.x += t.dir * car.speed * dt;
      car.y += (lane - car.y) * Math.min(1, 2.4 * dt);
    }
    car.angle = angleEase(car.angle, headingAngle(t.axis, t.dir), 5, dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.flash += dt * 9;
  }
}
