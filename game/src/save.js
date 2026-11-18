// The save: money and story progress in localStorage, nothing else. The city, the traffic
// and the heat are rebuilt fresh each visit — what Rio earned and how far he got is what
// lasts. Storage can be unavailable (private windows); then the game simply forgets.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionIndex: state.mission.index,
      storyDone: state.storyDone,
    }));
  } catch {
    // No storage, no save — this visit only.
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
