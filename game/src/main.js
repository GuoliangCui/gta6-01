// Boot and the one loop. The world advances in fixed 1/60 s steps fed by the
// simulation; the renderer and HUD paint what is there. Screens: title, play,
// paused, and the busted/wasted veil — after which the city takes the player
// back in through a familiar doorway.
//
// ?seed=N fixes the world. ?shot=walk|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for the screenshot.
import { PLAYER, STEP, VIEW } from './config.js';
import { advanceDialogue, createGame, respawnPlayer, stepGame } from './sim.js';
import {
  ACTION_CONFIRM, ACTION_CONTINUE, ACTION_INTERACT, ACTION_PAUSE, ACTION_RELOAD, createInput,
} from './input.js';
import { computeCamera, createRenderer } from './render.js';
import { createHud, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { ensureAudio, playSfx, updateAudio } from './audio.js';
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
const hud = createHud(canvas);

function announce(message) {
  status.textContent = message;
}

/** A staged screenshot: build, play the scene forward, paint twice, done. */
function runShot(name) {
  const state = createGame(seed);
  stageShot(name, state);
  const camera = computeCamera(state);
  let painted = 0;
  function paint() {
    renderer.draw(state, camera);
    hud.draw(state, SCREEN_PLAY, {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

/** The living game: title first, then the city. */
function runGame() {
  const input = createInput(canvas);
  let save = loadSave();
  let state = createGame(seed); // the title screen's living backdrop
  let screen = SCREEN_TITLE;
  let overKind = null;
  let accumulator = 0;
  let last = performance.now();

  function freshSeed() {
    return Math.floor(Math.random() * 4294967296);
  }

  function startNewGame() {
    clearSave();
    save = null;
    state = createGame(freshSeed());
    screen = SCREEN_PLAY;
    overKind = null;
    announce('A new story in Neon Harbor.');
  }

  function continueGame() {
    if (!save) return;
    state = createGame(freshSeed(), save);
    screen = SCREEN_PLAY;
    overKind = null;
    announce('Welcome back to Neon Harbor.');
  }

  function buildStepInput(camera) {
    const dir = input.moveDirection();
    const drive = input.driveInput();
    const actions = input.takeActions();
    const stepInput = {
      moveX: dir.x, moveY: dir.y, sprint: input.sprinting(),
      throttle: drive.throttle, steer: drive.steer,
      aimX: input.mouse.x + camera.x, aimY: input.mouse.y + camera.y,
      firing: false, interact: false,
    };
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
    if (state.dialogue) {
      if ((actions & ACTION_INTERACT) || input.takeClick()) advanceDialogue(state);
      return stepInput;
    }
    if (actions & ACTION_INTERACT) stepInput.interact = true;
    if ((actions & ACTION_RELOAD) && !state.player.car && state.player.ammo < PLAYER.magazine && state.player.reloadT <= 0) {
      state.player.reloadT = PLAYER.reloadTime;
    }
    stepInput.firing = input.firing() && !state.player.car;
    return stepInput;
  }

  function handleScreenActions() {
    const click = input.takeClick();
    const actions = input.takeActions();
    if (screen === SCREEN_TITLE) {
      if ((actions & ACTION_CONFIRM) || click) startNewGame();
      else if (actions & ACTION_CONTINUE) continueGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if ((actions & (ACTION_PAUSE | ACTION_CONFIRM)) || click) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if ((actions & ACTION_CONFIRM) || click) {
        respawnPlayer(state, overKind);
        overKind = null;
        screen = SCREEN_PLAY;
        announce('Back in the city.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameDt;

    if (screen === SCREEN_PLAY) {
      const camera = computeCamera(state);
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        stepGame(state, buildStepInput(camera), STEP);
        accumulator -= STEP;
        steps += 1;
        if (state.flags.busted || state.flags.wasted || screen !== SCREEN_PLAY) break;
      }
      if (steps === 5) accumulator = 0;
      if (state.flags.busted || state.flags.wasted) {
        overKind = state.flags.busted ? 'busted' : 'wasted';
        state.dialogue = null;
        screen = SCREEN_OVER;
        announce(overKind === 'busted' ? 'Busted.' : 'Wasted.');
      }
    } else if (screen === SCREEN_TITLE) {
      // The backdrop city lives its own life behind the title.
      while (accumulator >= STEP) {
        stepGame(state, { moveX: 0, moveY: 0, firing: false, interact: false, sprint: false, throttle: 0, steer: 0 }, STEP);
        accumulator -= STEP;
      }
      handleScreenActions();
    } else {
      accumulator = 0;
      handleScreenActions();
    }

    if (state.sfx) {
      playSfx(state.sfx);
      state.sfx = null;
    }
    if (state.dirtySave && screen === SCREEN_PLAY) {
      writeSave(state);
      save = loadSave();
      state.dirtySave = false;
    }
    updateAudio(state, frameDt);

    const camera = computeCamera(state);
    renderer.draw(state, camera);
    hud.draw(state, screen, {
      mouseX: screen === SCREEN_PLAY ? input.mouse.x : undefined,
      mouseY: input.mouse.y,
      hasSave: Boolean(save),
      saveMoney: save?.money ?? 0,
      saveJobs: save?.missionsDone ?? 0,
      overKind,
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', ensureAudio, { once: false });
  window.addEventListener('keydown', ensureAudio, { once: false });

  announce('Neon Harbor. Click or press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
