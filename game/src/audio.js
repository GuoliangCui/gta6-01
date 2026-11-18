// All sound is synthesized WebAudio — no audio files exist in this game. A sawtooth
// engine follows the car's speed, a two-tone siren swells with the nearest interceptor,
// gunfire is filtered noise, and a slow pad drifts under everything. The graph is built
// lazily on the first user gesture, as browsers require.
export function createAudio() {
  let ac = null;
  let master = null;
  let engine = null;
  let siren = null;
  let nextPad = 0;

  function noiseSource(duration) {
    const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  function burst(duration, filterType, freq, gainPeak) {
    if (!ac) return;
    const source = noiseSource(duration);
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(gainPeak, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function tone(freq, duration, gainPeak, type = 'sine', when = 0) {
    if (!ac) return;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ac.createGain();
    const start = ac.currentTime + when;
    gain.gain.setValueAtTime(gainPeak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function unlock() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    master = ac.createGain();
    master.gain.value = 0.42;
    master.connect(ac.destination);
    // Engine: a detuned saw pair through a lowpass, gain driven per frame.
    const engineOsc = ac.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineFilter = ac.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    const engineGain = ac.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    engine = { osc: engineOsc, gain: engineGain };
    // Siren: a square wave whose pitch an LFO flips between two tones.
    const sirenOsc = ac.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 830;
    const lfo = ac.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.85;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain).connect(sirenOsc.frequency);
    const sirenGain = ac.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    lfo.start();
    siren = { gain: sirenGain };
  }

  function handleEvents(events) {
    if (!ac) return;
    for (const event of events) {
      if (event.type === 'shot') burst(0.13, 'bandpass', 1700, 0.5);
      else if (event.type === 'gang-shot') burst(0.13, 'bandpass', 1100, 0.3);
      else if (event.type === 'crash') burst(event.hard ? 0.3 : 0.16, 'lowpass', 300, event.hard ? 0.6 : 0.3);
      else if (event.type === 'hit-ped') burst(0.2, 'lowpass', 220, 0.45);
      else if (event.type === 'cash') { tone(1318, 0.12, 0.22); tone(1760, 0.2, 0.22, 'sine', 0.09); }
      else if (event.type === 'pickup') { tone(880, 0.1, 0.2); tone(1174, 0.14, 0.2, 'sine', 0.07); }
      else if (event.type === 'alarm') { tone(1240, 0.12, 0.25, 'square'); tone(1240, 0.12, 0.25, 'square', 0.2); tone(1240, 0.12, 0.25, 'square', 0.4); }
      else if (event.type === 'enter-car') burst(0.07, 'lowpass', 500, 0.25);
      else if (event.type === 'crime') tone(660, 0.07, 0.1, 'square');
    }
  }

  const CHORDS = [[110, 220, 261.6, 329.6], [87.3, 174.6, 220, 261.6], [98, 196, 246.9, 293.7], [110, 220, 261.6, 392]];

  function update(sim) {
    if (!ac) return;
    const player = sim.player;
    if (engine) {
      const ratio = player.car ? Math.abs(player.car.speed) / player.car.topSpeed : 0;
      const target = player.car ? 0.028 + ratio * 0.03 : 0;
      engine.gain.gain.setTargetAtTime(target, ac.currentTime, 0.09);
      engine.osc.frequency.setTargetAtTime(52 + ratio * 165, ac.currentTime, 0.09);
    }
    if (siren) {
      let nearest = Infinity;
      for (const car of sim.cars) {
        if (car.kind !== 'cop' || car.driver !== 'cop') continue;
        nearest = Math.min(nearest, Math.hypot(car.x - player.x, car.y - player.y));
      }
      const target = sim.wanted.stars > 0 && nearest < 950 ? 0.035 * (1 - nearest / 1100) : 0;
      siren.gain.gain.setTargetAtTime(Math.max(0, target), ac.currentTime, 0.15);
    }
    // A slow harbour pad, one chord every few seconds.
    if (ac.currentTime >= nextPad) {
      nextPad = ac.currentTime + 4.6;
      const chord = CHORDS[Math.floor(sim.time / 4.6) % CHORDS.length];
      for (const freq of chord) {
        const osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0, ac.currentTime);
        gain.gain.linearRampToValueAtTime(0.016, ac.currentTime + 1.4);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 4.4);
        osc.connect(gain).connect(master);
        osc.start();
        osc.stop(ac.currentTime + 4.6);
      }
    }
  }

  return { unlock, handleEvents, update };
}
