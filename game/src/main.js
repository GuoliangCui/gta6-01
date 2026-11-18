// Boot and the one loop. The world advances in fixed 1/60 s steps (several in a slow
// frame, none in a fast one); the renderer paints what is there. Screens: title (the city
// idles in attract mode behind the logo), play, paused. Sound is synthesized — the audio
// module wakes on the first gesture, and the loop feeds it the step's events.
//
// ?seed=N fixes the city layout. ?shot=walk|drive|chase|mission (with &seed=N) stages that
// scene through the real simulation instead of running the loop, paints it twice and sets
// window.__shotReady for the screenshot.
import { STEP } from './config.js';
import { createSim, stepSim } from './sim.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { drawHud } from './hud.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { loadSave, clearSave } from './save.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Date.now() % 2147483646) + 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const ctx = renderer.ctx;
const audio = createAudio();

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function paint(state, screen, ui) {
  const view = renderer.draw(state);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  drawHud(ctx, state, screen, ui);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return view;
}

function runShot(name) {
  const state = stageShot(name, seed);
  let painted = 0;
  function frame() {
    paint(state, 'play', { hasSave: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(frame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runGame() {
  const input = createInput(canvas);
  let save = loadSave();
  let state = createSim(seed, save);
  state.flags.mode = 'title';
  let screen = 'title';
  let view = null;
  let accumulator = 0;
  let last = performance.now();
  let wasRespawning = false;
  status.textContent = 'Neon Harbor. Press Enter or click to play.';

  function newGame() {
    clearSave();
    save = null;
    state = createSim((Date.now() % 2147483646) + 1, null);
    state.flags.mode = 'play';
    screen = 'play';
    audio.stopPad();
    status.textContent = 'Neon Harbor. New game.';
  }

  function startPlay() {
    state.flags.mode = 'play';
    screen = 'play';
    audio.stopPad();
    status.textContent = 'Neon Harbor. Meet Marina by the harbour.';
  }

  function playSounds() {
    for (const ev of state.events) {
      if (ev.type === 'shotFired') audio.shot(ev.byPlayer);
      else if (ev.type === 'paid') audio.cash();
      else if (ev.type === 'enterCar' || ev.type === 'exitCar') audio.door();
      else if (ev.type === 'crash') audio.crash();
    }
    const respawning = state.respawnTimer > 0;
    if (respawning && !wasRespawning) {
      if (state.respawnKind === 'busted') audio.busted();
      else audio.wasted();
    }
    wasRespawning = respawning;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const { sim, ui } = input.snapshot(state, view);
    if (ui.any) audio.unlock();

    if (screen === 'title') {
      if (ui.newGame) { newGame(); accumulator = 0; }
      else if (ui.confirm || ui.any) startPlay();
    } else if (screen === 'play' && ui.pause) {
      screen = 'paused';
      status.textContent = 'Paused.';
    } else if (screen === 'paused') {
      if (ui.newGame) { newGame(); accumulator = 0; }
      else if (ui.pause || ui.confirm) { screen = 'play'; status.textContent = 'Playing.'; }
    }

    if (screen === 'title') {
      while (accumulator >= STEP) { stepSim(state, sim, STEP); accumulator -= STEP; }
    } else if (screen === 'play') {
      let stepped = false;
      while (accumulator >= STEP) { stepSim(state, sim, STEP); accumulator -= STEP; stepped = true; }
      if (stepped) playSounds();
    } else {
      accumulator = 0;
    }
    audio.update(state);
    view = paint(state, screen, { hasSave: !!save });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      status.textContent = 'Paused.';
    }
  });

  audio.startPad();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
