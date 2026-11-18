// Sound, all synthesized with WebAudio — no audio files. A low engine hum that follows the
// car's speed, a two-tone siren that swells as a unit closes in, noise-burst gunshots, a
// till-ding for payments and a slow synthwave pad under the title. Everything is created on
// the first user gesture (browsers refuse audio before it) and every call is guarded, so a
// muted or audio-less visit changes nothing about the game.

// Even the static is deterministic here: a tiny LCG, so no Math.random appears anywhere.
let noiseSeed = 22222;
function nextStatic() {
  noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
  return noiseSeed / 0x40000000 - 1;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;
  let padTimer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function burst(dur, freq, gain, type = 'square') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(dur, gain, low = 400, high = 3200) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = nextStatic() * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (low + high) / 2;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start(t);
  }

  return {
    unlock() { ensure(); },

    shot(byPlayer) { noise(0.14, byPlayer ? 0.5 : 0.3, 500, 3800); burst(0.08, 190, 0.2); },
    crash() { noise(0.28, 0.42, 120, 900); burst(0.2, 82, 0.3, 'triangle'); },
    cash() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [880, 1318].forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.22, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.22);
        osc.connect(g).connect(master);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.24);
      });
    },
    pickup() { burst(0.12, 660, 0.18, 'sine'); },
    door() { burst(0.07, 140, 0.22, 'triangle'); },
    busted() { burst(0.5, 220, 0.3, 'sawtooth'); },
    wasted() { burst(0.7, 160, 0.3, 'sawtooth'); },

    /** Continuous voices, driven once a frame from the loop. */
    update(state) {
      if (!ctx) return;
      const p = state.player;
      // Engine.
      if (p.car && state.respawnTimer <= 0) {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineGain.gain.value = 0;
          engineOsc.connect(engineGain).connect(master);
          engineOsc.start();
        }
        const ratio = Math.abs(p.car.speed) / p.car.maxSpeed;
        engineOsc.frequency.value = 55 + ratio * 165;
        engineGain.gain.value = 0.028 + ratio * 0.05;
      } else if (engineGain) {
        engineGain.gain.value = 0;
      }
      // Siren: nearest live unit sets the volume; a flip-flop sets the tone.
      let nearest = Infinity;
      for (const car of state.cars) {
        if (car.kind !== 'police' || car.health <= 0 || car.calm) continue;
        nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
      }
      if (nearest < 620 && state.stars > 0) {
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0;
          sirenOsc.connect(sirenGain).connect(master);
          sirenOsc.start();
          let high = false;
          sirenFlip = setInterval(() => {
            if (sirenOsc) sirenOsc.frequency.value = high ? 660 : 880;
            high = !high;
          }, 380);
        }
        sirenGain.gain.value = 0.05 * (1 - nearest / 620) + 0.008;
      } else if (sirenGain) {
        sirenGain.gain.value = 0;
      }
    },

    /** A slow two-chord pad for the title screen. */
    startPad() {
      if (!ensure() || padTimer) return;
      const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6]];
      let flip = false;
      const play = () => {
        if (!ctx) return;
        const t = ctx.currentTime;
        for (const f of chords[flip ? 1 : 0]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.05, t + 1.4);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3.9);
          osc.connect(g).connect(master);
          osc.start(t);
          osc.stop(t + 4);
        }
        flip = !flip;
      };
      play();
      padTimer = setInterval(play, 4000);
    },
    stopPad() {
      if (padTimer) clearInterval(padTimer);
      padTimer = null;
    },
  };
}
