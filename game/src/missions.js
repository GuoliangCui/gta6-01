// Marina's jobs: a three-job story that teaches the whole city. Meet her on the pier, run a
// package to Café Sol against the clock, borrow a coral convertible for Taller Brisa, then
// clear the Almacén 9 crew and shake the heat. A failed job goes on cooldown and only
// re-arms once Rio has left the area and come back — no standing on the trigger, waiting.
import { MISSIONS } from './config.js';
import { createGunman } from './combat.js';
import { saveGame } from './save.js';

export function createMissionState() {
  return {
    index: 0, // 0 meet Marina · 1 dock run · 2 borrowed wings · 3 harbour cleanup · 4 done
    stage: 'meet',
    timer: 0,
    hasPackage: false,
    cooldown: null, // {index, x, y} of a failed job, until Rio leaves and returns
    targetCar: null,
    gunmenSpawned: false,
  };
}

function talk(state, lines, done) {
  state.dialogue = { lines, i: 0, timer: 0, done };
}

function pay(state, amount) {
  state.money += amount;
  state.events.push({ type: 'paid', amount, x: state.player.x, y: state.player.y });
  saveGame(state);
}

function failJob(state, index, x, y, lines) {
  const m = state.mission;
  m.cooldown = { index, x, y };
  m.stage = 'cooldown';
  m.hasPackage = false;
  m.timer = 0;
  talk(state, lines, null);
}

function finishDialogue(state) {
  const done = state.dialogue?.done;
  state.dialogue = null;
  const m = state.mission;
  if (done === 'startM1') {
    m.index = 1;
    m.stage = 'pickup';
  } else if (done === 'startM2') {
    m.index = 2;
    m.stage = 'steal';
  } else if (done === 'startM3') {
    m.index = 3;
    m.stage = 'clear';
    spawnGunmen(state);
  } else if (done === 'storyDone') {
    m.index = 4;
    m.stage = 'done';
    state.storyDone = true;
    saveGame(state);
  }
}

function spawnGunmen(state) {
  const m = state.mission;
  if (m.gunmenSpawned) return;
  m.gunmenSpawned = true;
  const yard = state.world.spots.warehouseYard;
  state.gunmen.push(
    createGunman(yard.x - 90, yard.y - 6),
    createGunman(yard.x + 30, yard.y + 16),
    createGunman(yard.x + 120, yard.y - 14),
  );
  for (const g of state.gunmen) g.active = true;
}

/** Busted or wasted mid-job: the package goes back, the borrowed car is impounded. */
export function onPlayerDown(state) {
  const m = state.mission;
  if (m.index === 1 && m.hasPackage) {
    m.hasPackage = false;
    m.timer = 0;
    if (m.stage === 'deliver') m.stage = 'pickup';
  }
  if (m.index === 2 && m.targetCar && state.player.car === m.targetCar) {
    resetTargetCar(state);
    if (m.stage === 'deliver') m.stage = 'steal';
  }
}

function resetTargetCar(state) {
  const car = state.mission.targetCar;
  if (!car) return;
  const spot = state.world.spots.hotelFront;
  car.x = spot.x;
  car.y = spot.y;
  car.angle = -Math.PI / 2;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  car.health = 100;
  car.driver = null;
  car.kind = 'mission';
}

function setObjective(state, x, y, label, timer) {
  state.objective = { x, y, label, timer: timer ?? null };
}

export function updateMissions(state, input, dt) {
  const m = state.mission;
  const p = state.player;
  const spots = state.world.spots;

  // Dialogue advances on its own clock, or early when Rio answers (interact / click).
  if (state.dialogue) {
    const d = state.dialogue;
    d.timer += dt;
    if (input.interactPressed || input.confirmPressed || d.timer > 4.2) {
      d.i += 1;
      d.timer = 0;
      if (d.i >= d.lines.length) finishDialogue(state);
    }
  }

  // Cooldown: the failed job re-arms only after Rio has left the area.
  if (m.stage === 'cooldown' && m.cooldown) {
    const c = m.cooldown;
    setObjective(state, c.x, c.y, 'Leave the area — the job needs a fresh start', null);
    if (Math.hypot(p.x - c.x, p.y - c.y) > MISSIONS.rearmDistance) {
      m.cooldown = null;
      if (c.index === 1) { m.index = 1; m.stage = 'pickup'; }
      if (c.index === 2) { resetTargetCar(state); m.index = 2; m.stage = 'steal'; }
    }
    return;
  }

  if (m.index === 0) {
    setObjective(state, spots.marinaStand.x, spots.marinaStand.y, 'Meet Marina by the harbour', null);
    if (!state.dialogue && Math.hypot(p.x - spots.marinaStand.x, p.y - spots.marinaStand.y) < 50) {
      talk(state, [
        { who: 'Marina', text: 'Rio. You came. The harbour grapevine said you would.' },
        { who: 'Rio', text: 'I need work, Marina. Real money — not another summer of dock shifts.' },
        { who: 'Marina', text: 'Then prove you can move. A package waits at the end of my pier. Take it to Café Sol — fast, and do not stop for anyone.' },
      ], 'startM1');
    }
    return;
  }

  if (m.index === 1) {
    if (m.stage === 'pickup') {
      setObjective(state, spots.marina.x, spots.marina.y, 'Pick up the package on the pier', null);
      if (!p.car && Math.hypot(p.x - spots.marina.x, p.y - spots.marina.y) < 32) {
        m.hasPackage = true;
        m.stage = 'deliver';
        m.timer = MISSIONS.m1Time;
        talk(state, [
          { who: 'Marina · phone', text: 'You have it? Good. Café Sol, and do not stop for anyone.' },
        ], null);
      }
    } else if (m.stage === 'deliver') {
      m.timer -= dt;
      setObjective(state, spots.cafeDoor.x, spots.cafeDoor.y, 'Deliver the package to Café Sol — fast', m.timer);
      if (Math.hypot(p.x - spots.cafeDoor.x, p.y - spots.cafeDoor.y) < 52) {
        m.hasPackage = false;
        m.timer = 0;
        pay(state, MISSIONS.m1Pay);
        talk(state, [
          { who: 'Marina · phone', text: 'Clean work, and the coffee is still warm. Now something with wheels.' },
          { who: 'Marina · phone', text: 'A coral convertible naps outside Hotel Palma. Taller Brisa wants it — intact. The owner will disagree. Bring it home anyway.' },
        ], 'startM2');
        m.stage = 'interlude';
      } else if (m.timer <= 0) {
        failJob(state, 1, spots.marina.x, spots.marina.y, [
          { who: 'Marina · phone', text: 'Too slow. The café stopped waiting. Leave the pier, clear your head, and come back ready.' },
        ]);
      }
    }
    return;
  }

  if (m.index === 2) {
    const car = m.targetCar;
    if (m.stage === 'steal') {
      setObjective(state, car.x, car.y, 'Take the coral convertible at Hotel Palma', null);
      if (p.car === car) {
        m.stage = 'deliver';
        state.stars = Math.max(state.stars, 2);
        state.lastSeen = state.time;
        talk(state, [
          { who: 'Rio', text: 'Borrowed wings. Sorry, friend — Marina needs this one more than you do.' },
        ], null);
      }
    } else if (m.stage === 'deliver') {
      setObjective(state, spots.garageYard.x, spots.garageYard.y, 'Deliver the convertible to Taller Brisa — intact', null);
      if (car.health <= 0) {
        failJob(state, 2, spots.hotelFront.x, spots.hotelFront.y, [
          { who: 'Marina · phone', text: 'You wrecked it. Brisa pays for cars, not sculptures. Leave the hotel be for a while.' },
        ]);
      } else if (p.car === car && Math.hypot(car.x - spots.garageYard.x, car.y - spots.garageYard.y) < 62 && Math.abs(car.speed) < 30) {
        if (car.health >= MISSIONS.m2MinHealth) {
          // Hand it over: Rio steps out, the garage keeps the car.
          p.x = car.x + 34;
          p.y = car.y + 20;
          car.driver = null;
          car.kind = 'parked';
          p.car = null;
          pay(state, MISSIONS.m2Pay);
          talk(state, [
            { who: 'Marina · phone', text: 'Brisa is smiling, which frightens everyone. One last job, Rio — the ugly one.' },
            { who: 'Marina · phone', text: 'Three of the Gull Crew hold Almacén 9 and tax my boats. Clear the yard. Then lose any heat and come to me.' },
          ], 'startM3');
          m.stage = 'interlude';
        } else {
          failJob(state, 2, spots.hotelFront.x, spots.hotelFront.y, [
            { who: 'Marina · phone', text: 'Too bent. Brisa will not pay for scrap. Leave the hotel be for a while.' },
          ]);
        }
      }
    }
    return;
  }

  if (m.index === 3) {
    if (!m.gunmenSpawned) spawnGunmen(state);
    if (m.stage === 'clear') {
      setObjective(state, spots.warehouseYard.x, spots.warehouseYard.y, 'Clear the Gull Crew at Almacén 9', null);
      if (state.gunmen.length && state.gunmen.every((g) => g.dead)) {
        m.stage = 'escape';
        talk(state, [
          { who: 'Marina · phone', text: 'The yard is quiet. Now shake the sirens off and come home to the pier.' },
        ], null);
      }
    } else if (m.stage === 'escape') {
      const label = state.stars > 0 ? 'Lose the heat, then reach Marina' : 'Reach Marina on the pier';
      setObjective(state, spots.marinaStand.x, spots.marinaStand.y, label, null);
      if (state.stars === 0 && Math.hypot(p.x - spots.marinaStand.x, p.y - spots.marinaStand.y) < 52) {
        pay(state, MISSIONS.m3Pay);
        talk(state, [
          { who: 'Marina', text: 'The harbour breathes again, Rio. You are not a dock rat any more.' },
          { who: 'Rio', text: 'Never was. I just needed a tide.' },
        ], 'storyDone');
        m.stage = 'interlude';
      }
    }
    return;
  }

  // index 4: story told. The harbour is a free roam now.
  state.objective = null;
}
