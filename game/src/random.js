// A seeded random source (mulberry32). The whole simulation draws from streams made here,
// never from Math.random, so a seed plus an input script always replays the same game —
// that is what makes the screenshot scenes and the headless tests deterministic.

/** Create a random stream from a 32-bit seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** One element of a non-empty array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** A fresh independent stream, for a subsystem that wants its own sequence. */
    fork() {
      return createRandom(Math.floor(next() * 4294967296));
    },
  };
}
