// The simulation core: one state object, one fixed step, no DOM, no clock, no storage.
// The browser shell (main.js) feeds it inputs and paints the result; the headless tests
// feed it scripts and check the outcomes. Every subsystem receives this state as its
// context — money, wanted level, missions, effects and the event list the shell turns
// into sound all live here.
import { PLAYER_HEALTH, ROADS_H, ROADS_V, ROAD_WIDTH } from './config.js';
import { createRandom } from './random.js';
import { collideCircle, generateCity, PLACE_GARAGE } from './world.js';
import { createCar, stepCar, collideCars, CAR_HIT_HARD } from './vehicles.js';
import { stepTraffic } from './traffic.js';
import { createPed, stepPedestrians, scarePeds } from './pedestrians.js';
import { createWanted, reportCrime, stepPolice } from './police.js';
import { createPlayer, stepPlayer, damagePlayer } from './player.js';
import { createGangMember, stepGangMember, stepPlayerGun } from './combat.js';
import {
  createMissions, onPlayerDown, onTargetDelivered, onTargetStolen, stepMissions,
} from './missions.js';

/** Where the law and the hospital put Rio back after an arrest or a wreck. */
const STATION = { x: 1196, y: 1002 };
const HOSPITAL = { x: 742, y: 2296 };

export function createSim(seed, saved) {
  const rng = createRandom(seed);
  const world = generateCity(rng.fork());
  const sim = {
    seed,
    rng,
    world,
    time: 0,
    player: createPlayer(world.spawn.x, world.spawn.y),
    cars: [],
    peds: [],
    gang: [],
    wanted: createWanted(),
    missions: createMissions(),
    money: saved && Number.isFinite(saved.money) ? saved.money : 0,
    effects: [],
    events: [],
    toasts: [],
    outcome: null,
    carSeq: 1,
    hitCool: 0,
    toast(text) {
      sim.toasts.push({ text, ttl: 3.4 });
      if (sim.toasts.length > 3) sim.toasts.shift();
    },
    onBusted() {
      if (!sim.outcome) sim.outcome = 'busted';
    },
  };
  if (saved && saved.missionIndex > 0) {
    sim.missions.index = Math.min(saved.missionIndex, 3);
    if (sim.missions.index >= 3) {
      sim.missions.phase = 'done';
      sim.missions.objective = 'The harbour is yours. Free roam — the city saves your cash.';
    }
  }
  // Cars parked along the avenue shoulders, two of them near Rio's door.
  const addCar = (car) => { car.id = sim.carSeq++; sim.cars.push(car); return car; };
  sim.addCar = addCar;
  for (let i = 0; i < 15; i += 1) {
    const vertical = rng.chance(0.55);
    const centre = vertical ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
    const along = rng.range(140, vertical ? 2300 : 3460);
    const side = rng.chance(0.5) ? -1 : 1;
    const off = ROAD_WIDTH / 2 + 19;
    const x = vertical ? centre + side * off : along;
    const y = vertical ? along : centre + side * off;
    addCar(createCar(rng, x, y, vertical ? Math.PI / 2 : 0, rng.chance(0.12) ? 'sport' : 'car', true));
  }
  addCar(createCar(rng, 972, 2306, 0, 'car', true));
  addCar(createCar(rng, 1508, 2306, Math.PI, 'car', true));

  /** The coral convertible of the second job, with its owner standing guard. */
  sim.spawnMissionCar = () => {
    // The marked car stands alone: clear any parked car that would crowd its spot.
    sim.cars = sim.cars.filter((other) => Math.hypot(other.x - 2856, other.y - 1962) > 110);
    const car = createCar(rng, 2856, 1962, -Math.PI / 2, 'sport', true);
    car.color = '#ff6b57';
    car.locked = false;
    addCar(car);
    const owner = createPed(rng, 2834, 1940);
    sim.peds.push(owner);
    return car;
  };
  /** Three gunmen around the warehouse for the last job. */
  sim.spawnGangFight = () => {
    sim.gang = [
      createGangMember(3236, 2332),
      createGangMember(3372, 2306),
      createGangMember(3304, 2226),
    ];
    for (const member of sim.gang) {
      member.x += rng.range(-8, 8);
      member.y += rng.range(-8, 8);
      collideCircle(sim.world, member, 12);
    }
  };
  sim.clearGang = () => { sim.gang = []; };
  sim.removeCar = (car) => {
    const at = sim.cars.indexOf(car);
    if (at >= 0) sim.cars.splice(at, 1);
  };
  return sim;
}

function enterCar(sim, car) {
  const player = sim.player;
  if (car.driver === 'traffic') {
    const driver = createPed(sim.rng, car.x + 20, car.y + 10);
    driver.panic = 3;
    driver.angle = Math.atan2(driver.y - car.y, driver.x - car.x);
    sim.peds.push(driver);
  }
  player.car = car;
  car.driver = 'player';
  car.parked = false;
  if (car.id === sim.missions.targetCarId) {
    onTargetStolen(sim);
  } else {
    if (car.locked) {
      sim.events.push({ type: 'alarm' });
      sim.toast('Alarm! Somebody heard that.');
      scarePeds(sim.peds, car.x, car.y, 300);
    }
    reportCrime(sim, 'theft', car.x, car.y);
  }
  sim.events.push({ type: 'enter-car' });
}

function exitCar(sim) {
  const player = sim.player;
  const car = player.car;
  if (!car) return;
  player.car = null;
  car.driver = null;
  if (Math.abs(car.speed) < 8) car.parked = true;
  player.x = car.x + Math.cos(car.angle - Math.PI / 2) * 27;
  player.y = car.y + Math.sin(car.angle - Math.PI / 2) * 27;
  player.vx = 0;
  player.vy = 0;
  const garage = sim.world.places[PLACE_GARAGE];
  if (car.id === sim.missions.targetCarId && Math.hypot(car.x - garage.x, car.y - garage.y) < 96) {
    onTargetDelivered(sim);
  }
  sim.events.push({ type: 'exit-car' });
}

function stepDriving(sim, dt, input) {
  const player = sim.player;
  const car = player.car;
  const control = { throttle: -input.my, steer: input.mx };
  const events = stepCar(sim.world, car, dt, control);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.vx = Math.cos(car.angle) * car.speed;
  player.vy = Math.sin(car.angle) * car.speed;
  player.speedNow = Math.abs(car.speed);
  if (events & CAR_HIT_HARD) {
    car.health -= 9;
    damagePlayer(player, 5);
    sim.events.push({ type: 'crash', hard: true });
    scarePeds(sim.peds, car.x, car.y, 240);
  } else if (events) {
    sim.events.push({ type: 'crash', hard: false });
  }
  if (car.health <= 0) damagePlayer(player, 5 * dt);
  if (input.interact) exitCar(sim);
}

function stepCollisions(sim, dt) {
  const { cars, peds, player } = sim;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (Math.abs(a.x - b.x) > 44 || Math.abs(a.y - b.y) > 44) continue;
      const impact = collideCars(a, b);
      if (impact > 130) {
        a.health -= (impact - 130) * 0.05;
        b.health -= (impact - 130) * 0.05;
        const playerCar = player.car;
        if (playerCar && (a === playerCar || b === playerCar)) {
          const other = a === playerCar ? b : a;
          if (other.kind === 'cop') reportCrime(sim, 'copcrash', player.x, player.y);
          if (impact > 230) damagePlayer(player, (impact - 230) * 0.05);
          sim.events.push({ type: 'crash', hard: impact > 200 });
          scarePeds(peds, player.x, player.y, 220);
        }
      }
    }
  }
  // Cars versus people.
  for (const car of cars) {
    if (Math.abs(car.speed) < 34) continue;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) > 27) continue;
      const blow = Math.abs(car.speed);
      ped.hp -= blow * 0.34;
      ped.x += Math.cos(car.angle) * 16;
      ped.y += Math.sin(car.angle) * 16;
      car.speed *= 0.55;
      if (ped.hp <= 0) {
        ped.state = 'down';
        if (car.driver === 'player') reportCrime(sim, 'kill', ped.x, ped.y);
      } else {
        ped.panic = 3;
        if (car.driver === 'player') reportCrime(sim, 'assault', ped.x, ped.y);
      }
      scarePeds(peds, ped.x, ped.y, 200);
      sim.events.push({ type: 'hit-ped' });
    }
    // A moving car versus the player on foot.
    if (!player.car && sim.hitCool <= 0 && car.driver !== 'player') {
      if (Math.hypot(player.x - car.x, player.y - car.y) < 30 && Math.abs(car.speed) > 70) {
        damagePlayer(player, Math.abs(car.speed) * 0.055);
        player.x += Math.cos(car.angle) * 22;
        player.y += Math.sin(car.angle) * 22;
        sim.hitCool = 0.8;
        sim.events.push({ type: 'player-hit', hp: player.hp });
      }
    }
  }
}

/**
 * Advance the whole city one fixed step. input is the shell's snapshot:
 * {mx, my, sprint, interact, shoot, aiming, aimX, aimY, confirm}.
 */
export function stepSim(sim, dt, input) {
  sim.events = [];
  for (let i = sim.effects.length - 1; i >= 0; i -= 1) {
    sim.effects[i].ttl -= dt;
    if (sim.effects[i].ttl <= 0) sim.effects.splice(i, 1);
  }
  for (let i = sim.toasts.length - 1; i >= 0; i -= 1) {
    sim.toasts[i].ttl -= dt;
    if (sim.toasts[i].ttl <= 0) sim.toasts.splice(i, 1);
  }
  if (sim.outcome) return;
  sim.time += dt;
  sim.hitCool = Math.max(0, sim.hitCool - dt);
  const player = sim.player;
  // A confirm press hurries the current line of dialogue along.
  if (input.confirm && sim.missions.dialogue) sim.missions.dialogue.at = 99;

  if (player.car) {
    stepDriving(sim, dt, input);
  } else {
    stepPlayer(sim.world, player, dt, input);
    if (input.interact) {
      let best = null;
      let bestDist = 44;
      for (const car of sim.cars) {
        if (car.driver === 'cop') continue;
        const d = Math.hypot(car.x - player.x, car.y - player.y);
        if (d < bestDist) { bestDist = d; best = car; }
      }
      if (best) enterCar(sim, best);
    }
    stepPlayerGun(sim, dt, input);
  }

  stepTraffic(sim.rng, sim.world, sim.cars, player, dt);
  stepPedestrians(sim.rng, sim.world, sim.peds, player, dt);
  stepCollisions(sim, dt);
  for (const member of sim.gang) stepGangMember(sim, member, dt);
  stepPolice(sim, dt);
  stepMissions(sim, dt);

  if (player.hp <= 0 && !sim.outcome) sim.outcome = 'wasted';
}

/** Apply the fine, put Rio back on his feet, and clear the heat. */
export function resolveOutcome(sim) {
  const player = sim.player;
  const fine = sim.outcome === 'busted' ? 50 + sim.wanted.stars * 30 : 80;
  sim.money = Math.max(0, sim.money - fine);
  if (player.car) {
    player.car.driver = null;
    player.car = null;
  }
  const home = sim.outcome === 'busted' ? STATION : HOSPITAL;
  player.x = home.x;
  player.y = home.y;
  player.hp = PLAYER_HEALTH;
  player.calmTimer = 99;
  sim.cars = sim.cars.filter((car) => car.kind !== 'cop');
  sim.wanted.stars = 0;
  sim.wanted.bust = 0;
  sim.wanted.evade = 0;
  onPlayerDown(sim);
  sim.outcome = null;
  return fine;
}
