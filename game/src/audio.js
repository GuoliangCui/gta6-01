// Every sound in Neon Harbor is synthesised with WebAudio — no audio files, no
// samples, nothing borrowed. A noise burst is a gunshot, a sawtooth is an
// engine, two alternating squares are a siren, and a slow triangle chord is the
// harbour air. All of it starts only after the player's first click or key.
import { distance } from './geom.js';

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let noiseBuffer = null;
let padTimer = 0;

/** Create the audio graph. Safe to call on every gesture; it builds itself once. */
export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // A shared half-second of white noise for shots, hits and doors.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    // The engine: a sawtooth whose pitch follows the car's speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    // The siren: a square wave the update loop flips between two tones.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 800;
    sirenOsc.connect(sirenFilter).connect(sirenGain).connect(master);
    sirenOsc.start();
  } catch {
    ctx = null;
  }
}

/** One-shot effects by name: shot, door, talk, cash, thud. */
export function playSfx(name) {
  if (!ctx || !master) return;
  try {
    const now = ctx.currentTime;
    if (name === 'shot') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
      src.connect(filter).connect(gain).connect(master);
      src.start(now);
      src.stop(now + 0.14);
    } else if (name === 'door' || name === 'thud') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (name === 'talk') {
      blip(660, 0.05, 0.08);
    } else if (name === 'cash') {
      blip(880, 0.07, 0.12);
      setTimeout(() => blip(1318, 0.09, 0.12), 70);
    }
  } catch {
    // Sound is garnish; a failed effect never breaks the game.
  }
}

function blip(freq, dur, vol) {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + dur);
  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** The continuous layer, called each frame: engine, siren and the ambient pad. */
export function updateAudio(state, dt) {
  if (!ctx || !master) return;
  try {
    const now = ctx.currentTime;
    const player = state.player;
    // Engine follows the car the player is driving.
    if (player.car && !player.car.wrecked) {
      const speed = Math.abs(player.car.speed);
      engineOsc.frequency.setTargetAtTime(52 + speed * 0.34, now, 0.06);
      engineGain.gain.setTargetAtTime(0.028 + Math.min(0.05, speed / 9000), now, 0.09);
    } else {
      engineGain.gain.setTargetAtTime(0, now, 0.08);
    }
    // Siren: loudness by the nearest hunting police car.
    let nearest = Infinity;
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.wrecked && !car.leaving) {
        nearest = Math.min(nearest, distance(car.x, car.y, player.x, player.y));
      }
    }
    if (nearest < 950 && state.wanted > 0) {
      sirenOsc.frequency.value = Math.floor(state.time * 2.6) % 2 === 0 ? 659 : 880;
      const vol = 0.05 * (1 - nearest / 1000) + 0.008;
      sirenGain.gain.setTargetAtTime(vol, now, 0.1);
    } else {
      sirenGain.gain.setTargetAtTime(0, now, 0.1);
    }
    // The pad: a slow warm chord every few seconds, barely there.
    padTimer -= dt;
    if (padTimer <= 0) {
      padTimer = 4.6;
      const base = [220, 261.6, 329.6][Math.floor(state.time / 4.6) % 3];
      for (const mult of [1, 1.5]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = base * mult;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.014, now + 1.4);
        gain.gain.linearRampToValueAtTime(0, now + 4.4);
        osc.connect(gain).connect(master);
        osc.start(now);
        osc.stop(now + 4.5);
      }
    }
  } catch {
    // As above: garnish only.
  }
}
