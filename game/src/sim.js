// Neon Harbor's simulation: the whole game as a pure, seeded state machine with
// no DOM in it. The browser loop feeds it inputs and paints the result; the Node
// smoke test feeds it scripted inputs and checks the rules. One seed, one city,
// one outcome — which is what makes the screenshot scenes repeatable.
import {
  CAR, CITY, LAND_H, LAND_W, PITCH, PLAYER, POLICE_BY_STAR, STEP, TRAFFIC, WANTED, WORLD_H, WORLD_W,
} from './config.js';
import { createCity, intersectionCenter, isWaterAt, laneCenterX, laneCenterY, sidewalkCorners } from './city.js';
import { createRandom, deriveSeed } from './random.js';
import { clamp, distance, pushOutOfRect, segmentRectHit, turnToward } from './geom.js';
import { addWanted, createPoliceState, stepPolice } from './police.js';
import {
  createMissionState, missionTrigger, onDialogueFinished, onPlayerEnteredCar, onPlayerRespawn, startBriefing, stepMissions,
} from './missions.js';

export { STEP };

const CAR_MODELS = [
  { model: 'sedan', name: 'Meridian Sedan', topSpeed: 402, weight: 5 },
  { model: 'hatch', name: 'Pico Hatch', topSpeed: 378, weight: 3 },
  { model: 'van', name: 'Hauler Van', topSpeed: 342, weight: 2, radius: 19 },
  { model: 'sport', name: 'Vireo GT', topSpeed: 522, weight: 1 },
  { model: 'taxi', name: 'Sun Cab', topSpeed: 402, weight: 2 },
];
const CAR_COLORS = ['#e74c3c', '#3d8bfd', '#f4b942', '#39c17c', '#eef1f5', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8', '#7f8c9b'];
const TARGET_CAR_COLOR = '#ff6b5e';

function pickModel(rng) {
  const total = CAR_MODELS.reduce((sum, m) => sum + m.weight, 0);
  let roll = rng() * total;
  for (const m of CAR_MODELS) {
    roll -= m.weight;
    if (roll <= 0) return m;
  }
  return CAR_MODELS[0];
}

function makeCar(state, fields) {
  const car = {
    id: state.nextId,
    x: 0, y: 0, angle: 0, speed: 0,
    health: 100, wrecked: false, removeMe: false,
    color: '#cccccc', model: 'sedan', name: 'Car', topSpeed: 400, radius: CAR.radius,
    kind: 'parked', driver: null, missionTarget: false, leaving: false, abandoned: false,
    axis: 'v', road: 0, heading: 1, cross: 0, speedFactor: 1, lastCrossKey: '',
    ...fields,
  };
  state.nextId += 1;
  state.cars.push(car);
  return car;
}

function makePed(state, fields) {
  const ped = {
    id: state.nextId,
    x: 0, y: 0, angle: 0, health: 40,
    role: 'walker', name: null, carId: null,
    corner: 0, targetX: 0, targetY: 0,
    fleeT: 0, fleeX: 0, fleeY: 0, fireCd: 0,
    dead: false, deadT: 0, fadeFast: false, home: null,
    ...fields,
  };
  state.nextId += 1;
  state.peds.push(ped);
  return ped;
}

/** Build a fresh game: city, traffic, pedestrians, contacts and the player. */
export function createGame(seed, save = null) {
  const city = createCity(createRandom(deriveSeed(seed, 'city')));
  const rng = createRandom(deriveSeed(seed, 'sim'));
  const state = {
    seed,
    rng,
    time: 0,
    city,
    nextId: 1,
    cars: [],
    peds: [],
    effects: [],
    floaters: [],
    player: {
      x: city.pois.playerStart.x, y: city.pois.playerStart.y, angle: Math.PI / 2,
      health: PLAYER.maxHealth, money: save?.money ?? PLAYER.startMoney,
      car: null, fireCd: 0, ammo: PLAYER.magazine, reloadT: 0,
      bustedMeter: 0, hurtT: 99,
    },
    wanted: 0,
    hideTimer: 0,
    seenByPolice: false,
    police: createPoliceState(),
    missions: createMissionState(),
    dialogue: null,
    message: null,
    prompt: null,
    flags: { busted: false, wasted: false },
    stats: { stolen: 0, shots: 0, earned: 0 },
    shake: 0,
    lastNoiseT: -99,
    dirtySave: false,
    corners: sidewalkCorners(city),
  };
  if (save?.missionsDone) {
    state.missions.index = Math.min(save.missionsDone, 3);
    state.missions.phase = state.missions.index >= 3 ? 'complete' : 'available';
  }

  // The coral Vireo GT waits at the plaza, first: other parked cars keep clear of it.
  const plaza = city.pois.plaza;
  makeCar(state, {
    x: plaza.x - 74, y: plaza.y + 66, angle: 0, kind: 'parked',
    model: 'sport', name: 'Vireo GT', topSpeed: 522, color: TARGET_CAR_COLOR, missionTarget: true,
  });
  // Parked cars in the bays and open lots the city generated.
  const spots = [...city.parkSpots];
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  let parked = 0;
  for (const spot of spots) {
    if (parked >= 16) break;
    if (state.cars.some((c) => distance(c.x, c.y, spot.x, spot.y) < 44)) continue;
    const m = pickModel(rng);
    makeCar(state, {
      x: spot.x, y: spot.y, angle: spot.angle, kind: 'parked',
      model: m.model, name: m.name, topSpeed: m.topSpeed, radius: m.radius ?? CAR.radius,
      color: m.model === 'taxi' ? '#f4b942' : rng.pick(CAR_COLORS),
    });
    parked += 1;
  }
  // Traffic already rolling on the road network.
  for (let i = 0; i < TRAFFIC.cars; i += 1) spawnTrafficCar(state);
  // Pedestrians on the sidewalks, and the two contacts who give the story its jobs.
  for (let i = 0; i < 24; i += 1) {
    const cornerIndex = rng.int(0, state.corners.length - 1);
    const corner = state.corners[cornerIndex];
    const ped = makePed(state, { x: corner.x, y: corner.y, corner: cornerIndex, health: 40 });
    pickNextCorner(state, ped);
  }
  makePed(state, { x: city.pois.cafe.x - 30, y: city.pois.cafe.y + 4, role: 'contact', name: 'Mara Voss', health: 999 });
  makePed(state, { x: city.pois.warehouse.x + 16, y: city.pois.warehouse.y - 6, role: 'contact', name: 'Ren Okafor', health: 999 });

  // Factories the police and mission modules call back into.
  state.spawnPoliceCar = () => spawnPoliceCar(state);
  state.spawnOfficer = (car) => spawnOfficer(state, car);
  state.spawnGang = () => spawnGang(state);
  return state;
}

/** A traffic car joins the network on a random lane, clear of the player. */
function spawnTrafficCar(state) {
  const rng = state.rng;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const axis = rng.chance(0.5) ? 'v' : 'h';
    const road = axis === 'v' ? rng.int(0, CITY.cols) : rng.int(0, CITY.rows);
    const heading = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(80, (axis === 'v' ? LAND_H : LAND_W) - 80);
    const cross = axis === 'v' ? laneCenterX(road, heading) : laneCenterY(road, heading);
    const x = axis === 'v' ? cross : along;
    const y = axis === 'v' ? along : cross;
    if (distance(x, y, state.player.x, state.player.y) < 240) continue;
    if (state.cars.some((c) => distance(c.x, c.y, x, y) < 54)) continue;
    const m = pickModel(rng);
    makeCar(state, {
      x, y, kind: 'traffic', driver: 'ai',
      model: m.model, name: m.name, topSpeed: m.topSpeed, radius: m.radius ?? CAR.radius,
      color: m.model === 'taxi' ? '#f4b942' : rng.pick(CAR_COLORS),
      axis, road, heading, cross, speed: TRAFFIC.speed * 0.7, speedFactor: rng.range(0.85, 1.08),
      angle: axis === 'v' ? (heading > 0 ? Math.PI / 2 : -Math.PI / 2) : (heading > 0 ? 0 : Math.PI),
    });
    return;
  }
}

/** A police interceptor appears on a road a few blocks away and joins the hunt. */
function spawnPoliceCar(state) {
  const rng = state.rng;
  const player = state.player;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const i = rng.int(0, CITY.cols);
    const j = rng.int(0, CITY.rows);
    const centre = intersectionCenter(i, j);
    const d = distance(centre.x, centre.y, player.x, player.y);
    if (d < 580 || d > 980) continue;
    const car = makeCar(state, {
      x: centre.x + rng.range(-16, 16), y: centre.y + rng.range(-16, 16),
      angle: Math.atan2(player.y - centre.y, player.x - centre.x),
      kind: 'police', driver: 'ai', model: 'police', name: 'NHPD Interceptor',
      topSpeed: 478, color: '#eef2f5', health: 150,
    });
    return car;
  }
  return null;
}

/** The driver of a police car gets out to make the arrest on foot. */
function spawnOfficer(state, car) {
  const side = state.rng.chance(0.5) ? 1 : -1;
  return makePed(state, {
    x: car.x + Math.cos(car.angle + Math.PI / 2) * 20 * side,
    y: car.y + Math.sin(car.angle + Math.PI / 2) * 20 * side,
    role: 'officer', carId: car.id, health: 60, fireCd: state.rng.range(0.4, 0.9),
  });
}

/** The Breakers: four armed peds holding the warehouse yard for mission three. */
function spawnGang(state) {
  const spots = [
    { x: 1776, y: 1585 }, { x: 1860, y: 1585 }, { x: 1690, y: 1470 }, { x: 1800, y: 1666 },
  ];
  for (const spot of spots) {
    makePed(state, {
      x: spot.x, y: spot.y, role: 'gang', health: 48, fireCd: state.rng.range(0.5, 1.2),
      home: { x: spot.x, y: spot.y },
    });
  }
}

/** Send a pedestrian toward their next sidewalk corner (or across the street). */
function pickNextCorner(state, ped) {
  const rng = state.rng;
  const corners = state.corners;
  const blockIndex = Math.floor(ped.corner / 4);
  const cornerInBlock = ped.corner % 4;
  let next;
  if (rng.chance(0.34)) {
    // Cross to a neighbouring block: aim at whichever of its corners is nearest.
    const block = state.city.blocks[blockIndex];
    const options = [];
    if (block.col > 0) options.push(blockIndex - 1);
    if (block.col < CITY.cols - 1) options.push(blockIndex + 1);
    if (block.row > 0) options.push(blockIndex - CITY.cols);
    if (block.row < CITY.rows - 1) options.push(blockIndex + CITY.cols);
    const targetBlock = rng.pick(options);
    let best = targetBlock * 4;
    let bestD = Infinity;
    for (let c = 0; c < 4; c += 1) {
      const p = corners[targetBlock * 4 + c];
      const d = distance(ped.x, ped.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = targetBlock * 4 + c; }
    }
    next = best;
  } else {
    next = blockIndex * 4 + (cornerInBlock + (rng.chance(0.5) ? 1 : 3)) % 4;
  }
  ped.corner = next;
  ped.targetX = corners[next].x;
  ped.targetY = corners[next].y;
}

/** Keep a circle (the player, a ped, a car) out of buildings, trees and the harbour. */
function collideCircle(state, obj, r) {
  const city = state.city;
  for (const solid of city.solids) {
    const out = pushOutOfRect(obj.x, obj.y, r, solid);
    if (out.hit) { obj.x = out.x; obj.y = out.y; }
  }
  for (const tree of city.trees) {
    const d = distance(obj.x, obj.y, tree.x, tree.y);
    const min = r + 6;
    if (d > 0.001 && d < min) {
      obj.x = tree.x + ((obj.x - tree.x) / d) * min;
      obj.y = tree.y + ((obj.y - tree.y) / d) * min;
    }
  }
  if (city.fountain) {
    const d = distance(obj.x, obj.y, city.fountain.x, city.fountain.y);
    const min = r + city.fountain.r;
    if (d > 0.001 && d < min) {
      obj.x = city.fountain.x + ((obj.x - city.fountain.x) / d) * min;
      obj.y = city.fountain.y + ((obj.y - city.fountain.y) / d) * min;
    }
  }
  // The harbour: piers are walkable, open water is not.
  if (isWaterAt(city, obj.x, obj.y)) {
    obj.y = Math.min(obj.y, LAND_H + r * 0.4);
    if (isWaterAt(city, obj.x, obj.y)) obj.y = LAND_H - r;
  }
  obj.x = clamp(obj.x, r, WORLD_W - r);
  obj.y = clamp(obj.y, r, WORLD_H - r);
}

/** Damage a car; at zero health it is a wreck: stopped, smoking, undriveable. */
export function damageCar(state, car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    if (car.kind === 'police') {
      for (const ped of state.peds) {
        if (ped.role === 'officer' && ped.carId === car.id) ped.carGone = true;
      }
    }
  }
}

/** Advance the whole game one fixed step under the given input. */
export function stepGame(state, input, dt = STEP) {
  state.time += dt;
  const player = state.player;
  player.hurtT += dt;
  if (player.health < PLAYER.maxHealth && player.hurtT > 6 && !state.dialogue) {
    player.health = Math.min(PLAYER.maxHealth, player.health + dt * 2.2);
  }
  if (state.message) {
    state.message.t += dt;
    if (state.message.t > state.message.ttl) state.message = null;
  }
  state.shake = Math.max(0, state.shake - dt * 30);

  stepTraffic(state, dt);
  if (!state.dialogue) {
    stepPlayer(state, input, dt);
    stepMissions(state, dt);
  }
  stepPolice(state, dt);
  stepPeds(state, dt);
  stepEffects(state, dt);
  updatePrompt(state, input);

  state.cars = state.cars.filter((car) => !car.removeMe);
  state.peds = state.peds.filter((ped) => !(ped.dead && ped.deadT > 7));
  if (player.health <= 0 && !state.flags.wasted) state.flags.wasted = true;
}

/** The player, on foot or driving: movement, collisions, crime and gunfire. */
function stepPlayer(state, input, dt) {
  const player = state.player;
  player.fireCd -= dt;
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) player.ammo = PLAYER.magazine;
  }
  if (player.car) {
    // A mission marker outranks the door handle: E at a briefing point starts
    // the conversation even from the driver's seat.
    if (input.interact) {
      const trigger = missionTrigger(state);
      if (trigger && distance(player.x, player.y, trigger.x, trigger.y) < 64) {
        startBriefing(state);
        return;
      }
    }
    stepDriving(state, input, dt);
    return;
  }
  // On foot.
  const moveX = input.moveX ?? 0;
  const moveY = input.moveY ?? 0;
  const moving = moveX !== 0 || moveY !== 0;
  if (moving) {
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    const speed = input.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    player.x += (moveX / len) * speed * dt;
    player.y += (moveY / len) * speed * dt;
    player.angle = Math.atan2(moveY, moveX);
  }
  if (input.aimX !== undefined) player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  collideCircle(state, player, PLAYER.radius);
  // Cars are heavy furniture to a walker.
  for (const car of state.cars) {
    if (car === player.car) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    const min = PLAYER.radius + car.radius - 2;
    if (d > 0.001 && d < min) {
      player.x = car.x + ((player.x - car.x) / d) * min;
      player.y = car.y + ((player.y - car.y) / d) * min;
    }
  }
  if (input.firing) fireGun(state);
  if (input.interact) handleInteract(state);
}

/** Driving: arcade handling, then the collisions that make it cost something. */
function stepDriving(state, input, dt) {
  const player = state.player;
  const car = player.car;
  if (input.interact) {
    exitCar(state);
    return;
  }
  if (car.wrecked) return;
  const throttle = input.throttle ?? 0;
  const steer = input.steer ?? 0;
  if (throttle > 0) {
    car.speed += CAR.accel * throttle * dt * Math.max(0.14, 1 - car.speed / car.topSpeed);
  } else if (throttle < 0) {
    if (car.speed > 10) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(car.speed - CAR.accel * 0.55 * dt, -CAR.reverseMax);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 42 * dt);
  }
  car.speed -= car.speed * CAR.drag * dt * 0.32;
  const steerAuthority = clamp(car.speed / 150, -1, 1);
  car.angle += steer * CAR.turnRate * dt * steerAuthority;
  const prevSpeed = car.speed;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  collideCarWithWorld(state, car, prevSpeed);
  collideCarWithCars(state, car);
  collideCarWithPeds(state, car);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
}

/** A moving car against buildings, trees and the harbour edge. */
function collideCarWithWorld(state, car, prevSpeed) {
  const before = { x: car.x, y: car.y };
  collideCircle(state, car, car.radius);
  const moved = distance(before.x, before.y, car.x, car.y);
  if (moved > 1.2 && Math.abs(prevSpeed) > 60) {
    const impact = Math.abs(prevSpeed);
    if (impact > 175) {
      damageCar(state, car, (impact - 150) / 20);
      if (car.driver === 'player') {
        state.shake = Math.min(9, (impact - 150) / 26);
        state.player.health -= (impact - 175) / 30;
        state.player.hurtT = 0;
      }
    }
    car.speed = impact > 175 ? -prevSpeed * 0.18 : prevSpeed * 0.45;
  }
  if (car.y > LAND_H - car.radius && isWaterAt(state.city, car.x, car.y + car.radius)) {
    car.y = LAND_H - car.radius;
    car.speed *= 0.5;
  }
}

/** Cars push each other around; hard shunts damage both and draw attention. */
function collideCarWithCars(state, car) {
  for (const other of state.cars) {
    if (other === car) continue;
    const d = distance(car.x, car.y, other.x, other.y);
    const min = car.radius + other.radius;
    if (d < 0.001 || d >= min) continue;
    const nx = (other.x - car.x) / d;
    const ny = (other.y - car.y) / d;
    const overlap = (min - d) / 2;
    car.x -= nx * overlap;
    car.y -= ny * overlap;
    if (other.kind !== 'parked' || other.driver) {
      other.x += nx * overlap;
      other.y += ny * overlap;
    }
    const closing = Math.abs(car.speed);
    if (closing > 190) {
      damageCar(state, car, (closing - 160) / 26);
      damageCar(state, other, (closing - 160) / 22);
      if (other.kind === 'police' && car.driver === 'player') addWanted(state, WANTED.hitPolice);
      if (car.driver === 'player') state.shake = Math.min(8, (closing - 150) / 30);
      car.speed *= 0.42;
    } else if (car.driver || car.kind === 'police') {
      car.speed *= 0.8;
    }
  }
}

/** Running someone down: the darkest shortcut in the game, priced accordingly. */
function collideCarWithPeds(state, car) {
  if (Math.abs(car.speed) < 46) return;
  for (const ped of state.peds) {
    if (ped.dead || ped.role === 'contact') continue;
    const d = distance(car.x, car.y, ped.x, ped.y);
    if (d >= car.radius + 10) continue;
    const lethal = Math.abs(car.speed) > 150;
    ped.health -= lethal ? 60 : 18;
    ped.x += Math.cos(car.angle) * 16;
    ped.y += Math.sin(car.angle) * 16;
    car.speed *= 0.84;
    state.effects.push({ kind: 'spark', x: ped.x, y: ped.y, t: 0, ttl: 0.3, color: '#e8e2d0' });
    if (car.driver === 'player') {
      state.shake = Math.min(6, state.shake + 2.5);
      if (ped.role === 'officer') addWanted(state, WANTED.hitPolice);
      else if (ped.role !== 'gang') {
        addWanted(state, WANTED.hitPedestrian);
        if (ped.health <= 0) addWanted(state, WANTED.killPedestrian);
      }
    }
    if (ped.health <= 0 && !ped.dead) killPed(state, ped, car.driver === 'player');
    else ped.fleeT = 3;
  }
}

/** The pistol: a hitscan shot toward the aim point, stopped by buildings. */
function fireGun(state) {
  const player = state.player;
  if (player.fireCd > 0 || player.reloadT > 0 || player.car) return;
  if (player.ammo <= 0) {
    player.reloadT = PLAYER.reloadTime;
    return;
  }
  player.fireCd = PLAYER.fireInterval;
  player.ammo -= 1;
  state.stats.shots += 1;
  state.sfx = 'shot';
  const fromX = player.x + Math.cos(player.angle) * 14;
  const fromY = player.y + Math.sin(player.angle) * 14;
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  // Gunfire is a crime when anyone is close enough to hear it, throttled so a
  // firefight costs one star, not five.
  const heard = state.peds.some((p) => !p.dead && distance(p.x, p.y, player.x, player.y) < 330)
    || state.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, player.x, player.y) < 620);
  if (heard && state.time - state.lastNoiseT > 2.5) {
    state.lastNoiseT = state.time;
    addWanted(state, WANTED.fireGun);
  }
  // Find the nearest hittable thing along the ray, checking walls first.
  let bestT = PLAYER.bulletRange;
  let bestTarget = null;
  for (const ped of state.peds) {
    if (ped.dead || ped.role === 'contact') continue;
    const t = rayHit(fromX, fromY, dirX, dirY, ped.x, ped.y, 13);
    if (t !== null && t < bestT && !wallBetween(state, fromX, fromY, ped.x, ped.y)) {
      bestT = t;
      bestTarget = { ped };
    }
  }
  for (const car of state.cars) {
    const t = rayHit(fromX, fromY, dirX, dirY, car.x, car.y, car.radius + 3);
    if (t !== null && t < bestT && !wallBetween(state, fromX, fromY, car.x, car.y)) {
      bestT = t;
      bestTarget = { car };
    }
  }
  const endX = fromX + dirX * bestT;
  const endY = fromY + dirY * bestT;
  state.effects.push({ kind: 'tracer', x1: fromX, y1: fromY, x2: endX, y2: endY, t: 0, ttl: 0.07, hostile: false });
  state.effects.push({ kind: 'flash', x: fromX, y: fromY, t: 0, ttl: 0.05 });
  if (!bestTarget) return;
  state.effects.push({ kind: 'spark', x: endX, y: endY, t: 0, ttl: 0.22, color: '#ffd166' });
  if (bestTarget.car) {
    damageCar(state, bestTarget.car, PLAYER.bulletDamage);
    if (bestTarget.car.kind === 'police') addWanted(state, WANTED.hitPolice);
    return;
  }
  const ped = bestTarget.ped;
  ped.health -= PLAYER.bulletDamage;
  if (ped.role === 'officer') addWanted(state, WANTED.hitPolice);
  else if (ped.role === 'walker') addWanted(state, WANTED.hitPedestrian);
  if (ped.health <= 0) killPed(state, ped, true);
  else {
    ped.fleeT = 2.5;
    ped.fleeX = player.x;
    ped.fleeY = player.y;
  }
}

/** Distance along a ray to a circle, or null when the ray misses it. */
function rayHit(fromX, fromY, dirX, dirY, x, y, r) {
  const relX = x - fromX;
  const relY = y - fromY;
  const t = relX * dirX + relY * dirY;
  if (t < 0 || t > PLAYER.bulletRange) return null;
  const perpSq = relX * relX + relY * relY - t * t;
  if (perpSq > r * r) return null;
  return t;
}

/** True when a building stands between two points. */
function wallBetween(state, x1, y1, x2, y2) {
  for (const solid of state.city.solids) {
    if (segmentRectHit(x1, y1, x2, y2, solid)) return true;
  }
  return false;
}

/** A death: when the player caused it, consequences and dropped cash follow. */
function killPed(state, ped, byPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deadT = 0;
  if (!byPlayer) return;
  if (ped.role === 'walker') {
    addWanted(state, WANTED.killPedestrian);
    const cash = state.rng.int(4, 14);
    state.player.money += cash;
    state.floaters.push({ x: ped.x, y: ped.y - 14, text: `+$${cash}`, color: '#7ee787', t: 0, ttl: 1.1 });
  } else if (ped.role === 'gang') {
    const cash = state.rng.int(10, 25);
    state.player.money += cash;
    state.floaters.push({ x: ped.x, y: ped.y - 14, text: `+$${cash}`, color: '#7ee787', t: 0, ttl: 1.1 });
  }
}

/** The E key: talk, steal, or climb out — whichever the moment offers. */
function handleInteract(state) {
  const player = state.player;
  if (state.dialogue) {
    advanceDialogue(state);
    return;
  }
  const trigger = missionTrigger(state);
  if (trigger && distance(player.x, player.y, trigger.x, trigger.y) < 56) {
    startBriefing(state);
    return;
  }
  let nearest = null;
  let nearestD = 58;
  for (const car of state.cars) {
    if (car.wrecked) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < nearestD) { nearestD = d; nearest = car; }
  }
  if (nearest) enterCar(state, nearest);
}

/** Climb in and take a car: parked ones quietly, driven ones by force. */
function enterCar(state, car) {
  const player = state.player;
  const wasDriven = car.kind === 'traffic' && car.driver === 'ai';
  if (wasDriven) {
    // The driver is pulled out onto the pavement and runs for it.
    const driver = makePed(state, { x: car.x + 18, y: car.y + 10, role: 'walker', health: 40, corner: 0 });
    driver.fleeT = 3.5;
    driver.fleeX = car.x;
    driver.fleeY = car.y;
    pickNextCorner(state, driver);
    addWanted(state, WANTED.stealMovingCar);
    state.stats.stolen += 1;
  } else if (car.kind === 'police') {
    // Joyriding an interceptor: the whole force takes it personally.
    addWanted(state, WANTED.stealCar);
    state.stats.stolen += 1;
  } else if (car.kind === 'parked' || car.abandoned) {
    const witnessed = state.peds.some((p) => !p.dead && p.role !== 'contact' && distance(p.x, p.y, player.x, player.y) < 250)
      || state.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, player.x, player.y) < 520);
    if (witnessed && !car.missionTarget) addWanted(state, WANTED.stealCar);
    state.stats.stolen += 1;
  }
  car.driver = 'player';
  car.abandoned = false;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.bustedMeter = 0;
  state.sfx = 'door';
  onPlayerEnteredCar(state, car);
}

/** Climb out, left or right, whichever side is not a wall. */
function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  car.driver = null;
  if (car.kind === 'traffic') car.abandoned = true;
  if (car.kind === 'police') car.leaving = true; // a dumped interceptor heads back to the depot
  player.car = null;
  for (const side of [1, -1]) {
    const x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.radius + 15) * side;
    const y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.radius + 15) * side;
    if (!isWaterAt(state.city, x, y)) {
      player.x = x;
      player.y = y;
      break;
    }
  }
  collideCircle(state, player, PLAYER.radius);
  state.sfx = 'door';
}

/** Traffic: lane-following cars that turn at intersections and brake for trouble. */
function stepTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.driver !== 'ai' || car.wrecked) continue;
    // Desired speed, less whatever is in the way.
    let desired = TRAFFIC.speed * car.speedFactor;
    const aheadX = car.x + Math.cos(car.angle) * 40;
    const aheadY = car.y + Math.sin(car.angle) * 40;
    for (const other of state.cars) {
      if (other !== car && distance(other.x, other.y, aheadX, aheadY) < 24) desired = 0;
    }
    if (!state.player.car) {
      if (distance(state.player.x, state.player.y, aheadX, aheadY) < 20) desired = 0;
    }
    for (const ped of state.peds) {
      if (!ped.dead && distance(ped.x, ped.y, aheadX, aheadY) < 18) desired = 0;
    }
    car.speed += clamp(desired - car.speed, -CAR.brake * dt, CAR.accel * 0.6 * dt);
    // Advance along the current axis and blend the lateral position to the lane.
    const laneTarget = car.axis === 'v' ? laneCenterX(car.road, car.heading) : laneCenterY(car.road, car.heading);
    car.cross += clamp(laneTarget - car.cross, -300 * dt, 300 * dt);
    if (car.axis === 'v') {
      car.y += car.heading * car.speed * dt;
      car.x = car.cross;
      maybeTurn(state, car, dt);
    } else {
      car.x += car.heading * car.speed * dt;
      car.y = car.cross;
      maybeTurn(state, car, dt);
    }
    const targetAngle = car.axis === 'v'
      ? (car.heading > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.heading > 0 ? 0 : Math.PI);
    car.angle = turnToward(car.angle, targetAngle, 3.6 * dt);
    if (car.speed > 30) collideCarWithPeds(state, car);
  }
}

/** At each intersection a traffic car may turn onto the crossing road. */
function maybeTurn(state, car) {
  const rng = state.rng;
  // Which intersection is the car passing through right now?
  let crossIndex;
  let centreAlong;
  if (car.axis === 'v') {
    crossIndex = Math.round((car.y - CITY.road / 2) / PITCH);
    centreAlong = crossIndex * PITCH + CITY.road / 2;
    if (crossIndex < 0 || crossIndex > CITY.rows) return;
    if (Math.abs(car.y - centreAlong) > 7) return;
  } else {
    crossIndex = Math.round((car.x - CITY.road / 2) / PITCH);
    centreAlong = crossIndex * PITCH + CITY.road / 2;
    if (crossIndex < 0 || crossIndex > CITY.cols) return;
    if (Math.abs(car.x - centreAlong) > 7) return;
  }
  const key = car.axis === 'v' ? `${car.road},${crossIndex}` : `${crossIndex},${car.road}`;
  if (car.lastCrossKey === key) return;
  car.lastCrossKey = key;
  const along = car.axis === 'v' ? crossIndex : crossIndex;
  const across = car.axis === 'v' ? car.road : car.road;
  // Candidate moves: straight on, or a turn onto the crossing road either way.
  const moves = [];
  const straightLimit = car.axis === 'v' ? CITY.rows : CITY.cols;
  const straightPos = car.axis === 'v' ? crossIndex : crossIndex;
  if ((car.heading > 0 && straightPos < straightLimit) || (car.heading < 0 && straightPos > 0)) {
    moves.push({ type: 'straight', weight: 5.5 });
  }
  const turnLimit = car.axis === 'v' ? CITY.cols : CITY.rows;
  const turnPos = across;
  if (turnPos < turnLimit) moves.push({ type: 'turn', heading: 1, weight: 2.2 });
  if (turnPos > 0) moves.push({ type: 'turn', heading: -1, weight: 2.2 });
  if (moves.length === 0) {
    // Dead end (should not happen on this grid): reverse the heading.
    car.heading = -car.heading;
    return;
  }
  let roll = rng() * moves.reduce((sum, m) => sum + m.weight, 0);
  let chosen = moves[0];
  for (const move of moves) {
    roll -= move.weight;
    if (roll <= 0) { chosen = move; break; }
  }
  if (chosen.type === 'turn') {
    const oldAxis = car.axis;
    car.axis = oldAxis === 'v' ? 'h' : 'v';
    car.road = crossIndex;
    car.heading = chosen.heading;
    car.cross = oldAxis === 'v' ? car.y : car.x;
    car.lastCrossKey = car.axis === 'v' ? `${car.road},${along}` : `${along},${car.road}`;
  }
}

/** Pedestrians: sidewalk wandering, fleeing trouble, and the Breakers' gunfight. */
function stepPeds(state, dt) {
  const player = state.player;
  for (const ped of state.peds) {
    if (ped.dead) {
      ped.deadT += dt;
      continue;
    }
    if (ped.role === 'officer') {
      collideCircle(state, ped, 10);
      continue;
    }
    if (ped.role === 'contact') {
      if (distance(ped.x, ped.y, player.x, player.y) < 130) {
        ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      }
      continue;
    }
    if (ped.role === 'gang') {
      stepGangPed(state, ped, dt);
      collideCircle(state, ped, 10);
      continue;
    }
    // Walkers.
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.x += Math.cos(away) * 196 * dt;
      ped.y += Math.sin(away) * 196 * dt;
      ped.angle = away;
    } else {
      const d = distance(ped.x, ped.y, ped.targetX, ped.targetY);
      if (d < 8) pickNextCorner(state, ped);
      else {
        const speed = 62;
        ped.x += ((ped.targetX - ped.x) / d) * speed * dt;
        ped.y += ((ped.targetY - ped.y) / d) * speed * dt;
        ped.angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
      }
    }
    collideCircle(state, ped, 10);
  }
}

/** A Breaker: holds the yard, closes to range, and shoots with ragged aim. */
function stepGangPed(state, ped, dt) {
  const player = state.player;
  const dist = distance(ped.x, ped.y, player.x, player.y);
  ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
  const inRange = dist < 335 && !wallBetween(state, ped.x, ped.y, player.x, player.y);
  if (dist > 215) {
    ped.x += Math.cos(ped.angle) * 118 * dt;
    ped.y += Math.sin(ped.angle) * 118 * dt;
  } else if (dist < 110) {
    ped.x -= Math.cos(ped.angle) * 70 * dt;
    ped.y -= Math.sin(ped.angle) * 70 * dt;
  } else {
    // Sidestep between shots, the way nervous gunmen do.
    const sway = Math.sin(state.time * 1.7 + ped.id * 2.3);
    ped.x += Math.cos(ped.angle + Math.PI / 2) * sway * 34 * dt;
    ped.y += Math.sin(ped.angle + Math.PI / 2) * sway * 34 * dt;
  }
  if (inRange && state.missions.phase === 'active') {
    ped.fireCd -= dt;
    if (ped.fireCd <= 0) {
      ped.fireCd = state.rng.range(0.8, 1.4);
      state.effects.push({ kind: 'tracer', x1: ped.x, y1: ped.y, x2: player.x, y2: player.y, t: 0, ttl: 0.07, hostile: true });
      if (state.rng() < clamp(0.6 - dist / 800, 0.16, 0.52)) {
        player.health -= 6;
        player.hurtT = 0;
        state.effects.push({ kind: 'spark', x: player.x, y: player.y, t: 0, ttl: 0.25, color: '#ef4444' });
      }
    }
  }
}

/** Tracers fade in a blink, sparks in a breath, smoke while a wreck cools. */
function stepEffects(state, dt) {
  for (const effect of state.effects) effect.t += dt;
  state.effects = state.effects.filter((e) => e.t < e.ttl);
  for (const floater of state.floaters) {
    floater.t += dt;
    floater.y -= 30 * dt;
  }
  state.floaters = state.floaters.filter((f) => f.t < f.ttl);
  // Wrecks smoke until they are towed by the cleanup in the next spawn cycle.
  for (const car of state.cars) {
    if (car.wrecked && state.rng.chance(0.25)) {
      state.effects.push({ kind: 'smoke', x: car.x + state.rng.range(-8, 8), y: car.y - 8, t: 0, ttl: state.rng.range(0.6, 1.1) });
    }
  }
}

/** What the one context key would do right now, for the HUD prompt line. */
function updatePrompt(state, input) {
  const player = state.player;
  if (state.dialogue) {
    state.prompt = 'E / Click — Continue';
    return;
  }
  if (player.car) {
    state.prompt = `E — Step out of the ${player.car.name}`;
    return;
  }
  const trigger = missionTrigger(state);
  if (trigger && distance(player.x, player.y, trigger.x, trigger.y) < 56) {
    state.prompt = `E — Talk to ${trigger.def.contact}`;
    return;
  }
  let nearest = null;
  let nearestD = 58;
  for (const car of state.cars) {
    if (car.wrecked) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < nearestD) { nearestD = d; nearest = car; }
  }
  state.prompt = nearest ? `E — ${nearest.driver === 'ai' ? 'Steal' : 'Drive'} the ${nearest.name}` : null;
}

/** Move a conversation on by one line; the last line hands back to the missions. */
export function advanceDialogue(state) {
  const dialogue = state.dialogue;
  if (!dialogue) return;
  dialogue.index += 1;
  state.sfx = 'talk';
  if (dialogue.index >= dialogue.lines.length) {
    state.dialogue = null;
    onDialogueFinished(state, dialogue.after);
  }
}

/** After an arrest or a collapse: a fine, a clean slate, a familiar doorway. */
export function respawnPlayer(state, kind) {
  const player = state.player;
  const fineRate = kind === 'busted' ? 0.12 : 0.08;
  const fine = Math.min(player.money, Math.max(20, Math.round(player.money * fineRate)));
  player.money -= fine;
  if (player.car) {
    player.car.driver = null;
    if (player.car.kind === 'traffic') player.car.abandoned = true;
    player.car = null;
  }
  const door = kind === 'busted' ? state.city.pois.police : state.city.pois.hospital;
  player.x = door.x;
  player.y = door.y;
  player.health = PLAYER.maxHealth;
  player.bustedMeter = 0;
  player.ammo = PLAYER.magazine;
  state.wanted = 0;
  state.hideTimer = 0;
  state.cars = state.cars.filter((car) => car.kind !== 'police');
  state.peds = state.peds.filter((ped) => ped.role !== 'officer');
  state.flags.busted = false;
  state.flags.wasted = false;
  onPlayerRespawn(state);
  state.message = kind === 'busted'
    ? { text: `BUSTED — the NHPD kept $${fine} for their trouble.`, sub: 'Your record is wiped clean. Try to keep it that way.', t: 0, ttl: 3.6 }
    : { text: `WASTED — Harbor General patched you up for $${fine}.`, sub: 'The city kept turning without you.', t: 0, ttl: 3.6 };
  state.dirtySave = true;
}
