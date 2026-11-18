// The simulation: one state object, one fixed step, no browser anywhere. Subsystems raise
// events (crimes, crashes, shots, payments); this file judges them after the step — it is
// the only place that calls the police about a crime — and runs the busted/wasted respawn
// cycle. The renderer and the headless tests both drive the game through here.
import { PARKED_COUNT, VIEW, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createCar, collideCars } from './vehicles.js';
import { seedTraffic, updateTraffic } from './traffic.js';
import { seedPeds, updatePeds, knockDown, scarePeds } from './pedestrians.js';
import { createPlayer, updatePlayer } from './player.js';
import { commitCrime, updatePolice } from './police.js';
import { updateCombat } from './combat.js';
import { createMissionState, updateMissions, onPlayerDown } from './missions.js';

export const EMPTY_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false, sprint: false,
  shoot: false, interactPressed: false, confirmPressed: false, reloadPressed: false,
  aimX: 0, aimY: 0, aimActive: false,
});

const PARKED_TYPES = ['compact', 'sedan', 'van', 'sedan', 'compact'];

export function createSim(seed, save) {
  const rng = createRandom(seed);
  const world = createWorld(rng);
  const state = {
    rng,
    world,
    time: 0,
    money: save?.money ?? 0,
    storyDone: save?.storyDone ?? false,
    player: createPlayer(world.spots.cafeDoor.x + 30, world.spots.cafeDoor.y + 56),
    cars: [],
    peds: [],
    gunmen: [],
    effects: [],
    events: [],
    carHits: [],
    stars: 0,
    lastSeen: -99,
    coolTimer: 0,
    spawnTimer: 0,
    arrest: 0,
    lastGunStar: -99,
    dialogue: null,
    objective: null,
    mission: createMissionState(),
    flags: { mode: 'play', busted: false, wasted: false },
    respawnTimer: 0,
    respawnKind: null,
    camera: { x: 0, y: 0 },
    banner: null, // {text, until} centre-screen announcements (BUSTED / WASTED)
  };

  // Parked cars on the open lots, waiting to be borrowed.
  const spots = [...world.parkingSpots];
  for (let i = 0; i < Math.min(PARKED_COUNT, spots.length); i += 1) {
    const spot = spots[(i * 3) % spots.length];
    const car = createCar(PARKED_TYPES[i % PARKED_TYPES.length], spot.x, spot.y, spot.angle, 'parked');
    state.cars.push(car);
  }
  // Marina's coral convertible, asleep outside Hotel Palma.
  const hotel = world.spots.hotelFront;
  const target = createCar('sport', hotel.x, hotel.y, -Math.PI / 2, 'mission', '#ff6f61');
  state.cars.push(target);
  state.mission.targetCar = target;

  seedTraffic(state);
  seedPeds(state);

  if (save && save.missionIndex > 0) {
    state.mission.index = Math.min(4, save.missionIndex);
    state.mission.stage = ['meet', 'pickup', 'steal', 'clear', 'done'][state.mission.index];
  }
  updateCamera(state);
  return state;
}

function updateCamera(state) {
  const p = state.player;
  state.camera.x = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2));
  state.camera.y = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2));
}

function processEvents(state) {
  for (const ev of state.events) {
    if (ev.type === 'crime') {
      commitCrime(state, ev.crime, ev.x, ev.y);
    } else if (ev.type === 'hitPed') {
      if (knockDown(ev.ped)) {
        // Only Rio's own driving is Rio's crime. A pedestrian put down by traffic — or by
        // a police car hunting Rio — is a tragedy, not a charge on his sheet.
        if (ev.byPlayer) commitCrime(state, ev.fatal ? 'hitPedFatal' : 'hitPed', ev.x, ev.y);
        scarePeds(state, ev.x, ev.y, 170);
        state.effects.push({ kind: 'spark', x: ev.x, y: ev.y, t: 0, ttl: 0.3 });
      }
    } else if (ev.type === 'crash') {
      scarePeds(state, ev.x, ev.y, 150);
    } else if (ev.type === 'paid') {
      state.effects.push({ kind: 'text', x: ev.x, y: ev.y - 26, text: `+$${ev.amount}`, t: 0, ttl: 1.4 });
    }
  }
}

function startRespawn(state, kind) {
  state.respawnKind = kind;
  state.respawnTimer = 1.6;
  state.banner = { text: kind === 'busted' ? 'BUSTED' : 'WASTED', until: state.time + 1.6 };
  onPlayerDown(state);
  if (state.player.car) {
    state.player.car.driver = null;
    state.player.car = null;
  }
}

function doRespawn(state) {
  const p = state.player;
  const spots = state.world.spots;
  if (state.respawnKind === 'busted') {
    state.money = Math.floor(state.money * 0.88);
    p.x = spots.hqFront.x;
    p.y = spots.hqFront.y;
  } else {
    state.money = Math.floor(state.money * 0.92);
    p.x = spots.clinicFront.x;
    p.y = spots.clinicFront.y;
  }
  p.health = 100;
  p.vx = 0;
  p.vy = 0;
  state.stars = 0;
  state.arrest = 0;
  state.lastSeen = -99;
  for (const car of state.cars) if (car.kind === 'police') car.calm = true;
  state.respawnKind = null;
}

export function stepSim(state, input, dt) {
  state.events.length = 0;

  if (state.respawnTimer > 0) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) doRespawn(state);
    updateEffects(state, dt);
    updateCamera(state);
    return;
  }

  state.time += dt;

  if (state.flags.mode === 'title') {
    // Attract mode: the city lives, Rio waits.
    updateAmbient(state, dt);
    updateEffects(state, dt);
    updateCamera(state);
    return;
  }

  updatePlayer(state, input, dt);
  updateAmbient(state, dt);
  collideCars(state.cars, state.carHits);
  for (const hit of state.carHits) {
    const involvesPlayer = hit.a.driver === 'player' || hit.b.driver === 'player';
    const involvesPolice = hit.a.kind === 'police' || hit.b.kind === 'police';
    if (involvesPlayer && involvesPolice) commitCrime(state, 'hitPolice', state.player.x, state.player.y);
    else if (involvesPlayer) state.events.push({ type: 'crash', x: state.player.x, y: state.player.y, impact: hit.closing });
    // Any fast car can put a pedestrian down, whoever is driving.
  }
  knockDownPass(state);
  updatePolice(state, dt);
  updateCombat(state, input, dt);
  updateMissions(state, input, dt);
  processEvents(state);
  updateEffects(state, dt);

  if (state.flags.busted) {
    state.flags.busted = false;
    startRespawn(state, 'busted');
  } else if (state.player.health <= 0) {
    startRespawn(state, 'wasted');
  }
  updateCamera(state);
}

/** Traffic and pedestrians, shared by play and the title screen's attract mode. */
function updateAmbient(state, dt) {
  updateTraffic(state, dt);
  updatePeds(state, dt);
}

function knockDownPass(state) {
  for (const car of state.cars) {
    if (Math.abs(car.speed) < 55 || car.driver === 'player') continue;
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius + 10) {
        state.events.push({ type: 'hitPed', ped, x: ped.x, y: ped.y, fatal: Math.abs(car.speed) > 190, byPlayer: false });
      }
    }
  }
}

function updateEffects(state, dt) {
  for (let i = state.effects.length - 1; i >= 0; i -= 1) {
    const e = state.effects[i];
    e.t += dt;
    if (e.t >= e.ttl) state.effects.splice(i, 1);
  }
  // Wounded cars smoke.
  for (const car of state.cars) {
    if (car.health > 0 && car.health < 42 && Math.abs(car.speed) + 1 > 0) {
      car.smoke = (car.smoke ?? 0) + dt;
      if (car.smoke > 0.14) {
        car.smoke = 0;
        state.effects.push({ kind: 'smoke', x: car.x, y: car.y - 8, t: 0, ttl: 0.8 });
      }
    }
  }
}
