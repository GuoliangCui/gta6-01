// A seeded random source (an LCG with a good spread) plus the small helpers the
// simulation uses everywhere. One seed always makes the same city, the same
// traffic and the same screenshot scenes — nothing in the game calls Math.random.

const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;
const MODULUS = 4294967296;

/** Create a random function returning [0, 1), with range/pick helpers attached. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function random() {
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) >>> 0;
    return state / MODULUS;
  }
  /** A float in [min, max). */
  random.range = (min, max) => min + random() * (max - min);
  /** An integer in [min, max], both ends included. */
  random.int = (min, max) => min + Math.floor(random() * (max - min + 1));
  /** True with probability p. */
  random.chance = (p) => random() < p;
  /** One element of a non-empty array. */
  random.pick = (items) => items[Math.floor(random() * items.length)];
  return random;
}

/** Mix a seed with a label so sub-systems (city, traffic) draw independent streams. */
export function deriveSeed(seed, salt) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < salt.length; i += 1) {
    h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
  }
  return h >>> 0;
}
