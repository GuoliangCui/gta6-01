// The story: three jobs for Marina, the harbour fixer, strung in a line. A courier run, a
// borrowed convertible, and a debt collected at the warehouse — each pays cash into the
// save, each teaches one system (driving, stealing under heat, fighting and escaping).
// Timed work that fails goes cold: the player must leave the area before it re-arms, so
// nobody stands on the spot farming retries.
import { PLACE_CAFE, PLACE_GARAGE, PLACE_PIER, PLACE_WAREHOUSE } from './world.js';

/** Where Marina waits, on the promenade by the old pier. */
export const MARINA = { x: 1006, y: 2450, label: 'Marina' };

/** Mission names and pay, in story order. */
export const MISSION_DEFS = [
  { name: 'La primera entrega', pay: 300 },
  { name: 'Coche prestado', pay: 500 },
  { name: 'Limpieza del puerto', pay: 800 },
];

const DELIVER_TIME = 150;
const REARM_DISTANCE = 320;

export function createMissions() {
  return {
    index: 0,
    phase: 'contact',
    stage: null,
    timer: 0,
    hasPackage: false,
    targetCarId: 0,
    dialogue: null,
    afterDialogue: null,
    marker: null,
    objective: '',
    gangLeft: 0,
  };
}

function talk(state, speaker, lines, after) {
  state.dialogue = { speaker, lines, at: 0, index: 0 };
  state.afterDialogue = after;
}

function startMission(ctx, state) {
  const world = ctx.world;
  if (state.index === 0) {
    state.stage = 'pickup';
    state.marker = world.places[PLACE_PIER];
    state.objective = 'Pick up the package at Muelle Viejo';
  } else if (state.index === 1) {
    const car = ctx.spawnMissionCar();
    state.targetCarId = car.id;
    state.stage = 'steal';
    state.marker = { x: car.x, y: car.y, label: 'Convertible' };
    state.objective = 'Steal the coral convertible by the beach club';
  } else if (state.index === 2) {
    state.stage = 'go';
    state.marker = world.places[PLACE_WAREHOUSE];
    state.objective = 'Go to Almacén 9, the harbour warehouse';
  }
  state.phase = 'active';
}

function completeMission(ctx, state) {
  const pay = MISSION_DEFS[state.index].pay;
  ctx.money += pay;
  ctx.events.push({ type: 'cash', amount: pay });
  ctx.toast(`Job done — $${pay}`);
  state.index += 1;
  state.stage = null;
  state.hasPackage = false;
  if (state.index >= MISSION_DEFS.length) {
    state.phase = 'done';
    state.marker = null;
    state.objective = 'The harbour is yours. Free roam — the city saves your cash.';
    talk(state, 'Marina', ['Three jobs, three payments, no names asked.', 'You are not a courier any more, Rio. You are a professional.'], null);
  } else {
    state.phase = 'contact';
    state.marker = MARINA;
    state.objective = 'Meet Marina by the harbour';
  }
}

const INTROS = [
  ['Rio. I need a package moved, quiet and quick.', 'It waits at the end of Muelle Viejo. Bring it to Café Sol — while it is still warm.'],
  ['A collector owes me a car. Coral convertible, parked by the beach club.', 'His driver watches it, so it will be loud. Bring it to Taller Mar in one piece.'],
  ['Last job. The crew at Almacén 9 stopped paying their harbour dues.', 'Clear them out, then lose the police. After that, we are even.'],
];

/** Advance the story one step. ctx is the simulation (see sim.js for its shape). */
export function stepMissions(ctx, dt) {
  const state = ctx.missions;
  const player = ctx.player;
  const world = ctx.world;
  if (state.dialogue) {
    state.dialogue.at += dt;
    if (state.dialogue.at > 3.6) {
      state.dialogue.at = 0;
      state.dialogue.index += 1;
      if (state.dialogue.index >= state.dialogue.lines.length) {
        state.dialogue = null;
        const after = state.afterDialogue;
        state.afterDialogue = null;
        if (after === 'start') startMission(ctx, state);
      }
    }
    return;
  }
  if (state.phase === 'contact') {
    state.marker = MARINA;
    state.objective = 'Meet Marina by the harbour';
    if (Math.hypot(player.x - MARINA.x, player.y - MARINA.y) < 48 && !player.car) {
      talk(state, 'Marina', INTROS[state.index], 'start');
    }
    return;
  }
  if (state.phase !== 'active' && state.phase !== 'cooldown') return;

  if (state.index === 0) stepFirstJob(ctx, state, dt);
  else if (state.index === 1) stepSecondJob(ctx, state);
  else if (state.index === 2) stepThirdJob(ctx, state);
}

function stepFirstJob(ctx, state, dt) {
  const player = ctx.player;
  const pier = ctx.world.places[PLACE_PIER];
  if (state.phase === 'cooldown') {
    state.objective = 'The drop went cold. Leave the pier area.';
    state.marker = null;
    if (Math.hypot(player.x - pier.x, player.y - pier.y) > REARM_DISTANCE) {
      state.phase = 'active';
      state.stage = 'pickup';
      state.marker = pier;
      state.objective = 'Pick up the package at Muelle Viejo';
      ctx.toast('Marina: one more time. Do not be late.');
    }
    return;
  }
  if (state.stage === 'pickup') {
    if (Math.hypot(player.x - pier.x, player.y - pier.y) < 46) {
      state.hasPackage = true;
      state.stage = 'deliver';
      state.timer = DELIVER_TIME;
      state.marker = ctx.world.places[PLACE_CAFE];
      state.objective = 'Deliver the package to Café Sol — fast';
      talk(state, 'Marina · phone', ['You have it? Good. Café Sol, and do not stop for anyone.'], null);
      ctx.events.push({ type: 'pickup' });
    }
  } else if (state.stage === 'deliver') {
    state.timer -= dt;
    const cafe = ctx.world.places[PLACE_CAFE];
    if (Math.hypot(player.x - cafe.x, player.y - cafe.y) < 52) {
      completeMission(ctx, state);
    } else if (state.timer <= 0) {
      state.hasPackage = false;
      state.phase = 'cooldown';
      ctx.toast('Too late — the buyer walked away.');
    }
  }
}

function targetCar(ctx, state) {
  return ctx.cars.find((car) => car.id === state.targetCarId) ?? null;
}

function stepSecondJob(ctx, state) {
  const player = ctx.player;
  const garage = ctx.world.places[PLACE_GARAGE];
  const car = targetCar(ctx, state);
  if (state.phase === 'cooldown') {
    state.objective = 'The car is a write-off. Walk away; Marina will find another.';
    state.marker = null;
    if (car && Math.hypot(player.x - car.x, player.y - car.y) > REARM_DISTANCE) {
      ctx.removeCar(car);
      const fresh = ctx.spawnMissionCar();
      state.targetCarId = fresh.id;
      state.phase = 'active';
      state.stage = 'steal';
    }
    return;
  }
  if (!car) return;
  if (state.stage === 'steal') {
    state.marker = { x: car.x, y: car.y, label: 'Convertible' };
    state.objective = 'Steal the coral convertible by the beach club';
  } else if (state.stage === 'deliver') {
    state.marker = garage;
    state.objective = 'Deliver the convertible to Taller Mar — intact';
    if (car.health <= 25) {
      state.phase = 'cooldown';
      ctx.toast('The convertible is wrecked. Marina will not pay for scrap.');
    }
  }
}

function stepThirdJob(ctx, state) {
  const player = ctx.player;
  const warehouse = ctx.world.places[PLACE_WAREHOUSE];
  if (state.stage === 'go') {
    if (Math.hypot(player.x - warehouse.x, player.y - warehouse.y) < 64) {
      ctx.spawnGangFight();
      state.gangLeft = ctx.gang.length;
      state.stage = 'fight';
      ctx.wanted.stars = Math.max(ctx.wanted.stars, 2);
      ctx.wanted.evade = 0;
      talk(state, 'Radio', ['Shots at the harbour! Units respond — the law is coming either way.'], null);
      ctx.events.push({ type: 'fight-start' });
    }
  } else if (state.stage === 'fight') {
    state.gangLeft = ctx.gang.filter((m) => m.state !== 'down').length;
    state.objective = `Clear the warehouse crew — ${state.gangLeft} left`;
    state.marker = warehouse;
    if (state.gangLeft <= 0) {
      state.stage = 'escape';
      state.marker = null;
      state.objective = 'Lose the heat';
      ctx.toast('Crew cleared. Now disappear.');
    }
  } else if (state.stage === 'escape') {
    state.objective = 'Lose the heat';
    if (ctx.wanted.stars === 0) completeMission(ctx, state);
  }
}

/** Called by the simulation the moment the player takes the marked convertible. */
export function onTargetStolen(ctx) {
  const state = ctx.missions;
  if (state.index !== 1 || state.stage !== 'steal') return;
  state.stage = 'deliver';
  ctx.wanted.stars = Math.max(ctx.wanted.stars, 2);
  ctx.wanted.evade = 0;
  ctx.events.push({ type: 'crime', kind: 'theft', stars: ctx.wanted.stars });
  ctx.toast('The owner saw that. Move!');
}

/** Called by the simulation when the player parks the marked car at the garage. */
export function onTargetDelivered(ctx) {
  const state = ctx.missions;
  if (state.index === 1 && state.stage === 'deliver' && state.phase === 'active') completeMission(ctx, state);
}

/** Busted or wasted mid-job: packages drop, fights reset, the story waits. */
export function onPlayerDown(ctx) {
  const state = ctx.missions;
  state.dialogue = null;
  state.afterDialogue = null;
  if (state.phase !== 'active') return;
  if (state.index === 0 && state.stage === 'deliver') {
    state.hasPackage = false;
    state.stage = 'pickup';
    state.marker = ctx.world.places[PLACE_PIER];
    state.objective = 'Pick up the package at Muelle Viejo';
  }
  if (state.index === 2 && (state.stage === 'fight' || state.stage === 'escape')) {
    ctx.clearGang();
    state.stage = 'go';
    state.marker = ctx.world.places[PLACE_WAREHOUSE];
    state.objective = 'Go to Almacén 9, the harbour warehouse';
  }
}
