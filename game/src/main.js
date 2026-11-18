// Boot and the one loop. The simulation advances in fixed steps behind an accumulator;
// input is snapshotted per step (one-shot presses land on the first step of their frame);
// the renderer paints the world, the HUD and whichever screen is up — title, play, paused,
// busted, wasted. Sound is fed the steps' events once per frame.
//
// ?seed=N fixes the city and its luck. ?shot=walk|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createSim, resolveOutcome, stepSim } from './sim.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_INTERACT, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const sim = createSim(seed, null);
  stageShot(name, sim);
  let painted = 0;
  function paint() {
    renderer.draw(sim, SCREEN_PLAY);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  const saved = loadSave();
  let sim = createSim(seed, saved);
  sim.hasSave = Boolean(saved);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let savedMoney = sim.money;
  let savedIndex = sim.missions.index;

  function startPlay(fresh) {
    if (fresh) {
      clearSave();
      sim = createSim(seed, null);
      sim.hasSave = false;
      savedMoney = 0;
      savedIndex = 0;
    }
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce(`Neon Harbor. Cash $${sim.money}. ${sim.missions.objective}`);
  }

  function snapshot(actions, firstStep) {
    const { mx, my } = input.axes();
    const aim = renderer.toWorld(input.mouse.x, input.mouse.y);
    return {
      mx,
      my,
      sprint: input.sprint(),
      interact: firstStep && (actions & ACTION_INTERACT) !== 0,
      shoot: input.mouse.down,
      aiming: input.mouse.seen,
      aimX: aim.x,
      aimY: aim.y,
      confirm: firstStep && (actions & ACTION_CONFIRM) !== 0,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions) audio.unlock();

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE && sim.hasSave) startPlay(false);
      else if (actions & ACTION_CONFIRM) startPlay(sim.hasSave);
      while (accumulator >= STEP) {
        stepSim(sim, STEP, snapshot(0, false));
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      const frameEvents = [];
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepSim(sim, STEP, snapshot(actions, first));
        first = false;
        frameEvents.push(...sim.events);
        accumulator -= STEP;
        if (sim.outcome) {
          const kind = sim.outcome;
          const fine = resolveOutcome(sim);
          sim.lastOutcome = { kind, fine };
          screen = kind === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
          announce(kind === 'busted' ? `Busted. Fined $${fine}.` : `Wasted. Hospital bill $${fine}.`);
        }
      }
      audio.handleEvents(frameEvents);
      if (sim.money !== savedMoney || sim.missions.index !== savedIndex) {
        savedMoney = sim.money;
        savedIndex = sim.missions.index;
        writeSave(sim);
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      accumulator = 0;
    } else {
      // Busted or wasted: the panel waits for a confirm.
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back on the street.');
      }
      accumulator = 0;
    }
    audio.update(sim);
    renderer.draw(sim, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  canvas.addEventListener('mousedown', () => audio.unlock());

  announce('Neon Harbor. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
