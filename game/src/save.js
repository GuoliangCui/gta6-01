// The save: cash and story progress in localStorage, nothing else. Rio always wakes up
// at the harbour; what he has earned and which jobs are done is what persists. Storage
// can be unavailable (private windows), so every access is guarded and the game simply
// runs session-only when it is.
import { SAVE_KEY } from './config.js';

/** Read the save, or null when there is none worth trusting. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: Math.max(0, Math.floor(Number(data.money) || 0)),
      missionIndex: Math.max(0, Math.min(3, Math.floor(Number(data.missionIndex) || 0))),
    };
  } catch {
    return null;
  }
}

/** Persist the simulation's money and story progress. */
export function writeSave(sim) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: sim.money,
      missionIndex: sim.missions.index,
    }));
  } catch {
    // Session-only play: nothing to do.
  }
}

/** Forget the save (a fresh new game). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget.
  }
}
