// The save file: money and story progress in localStorage, nothing else. It is
// written whenever the simulation marks itself dirty (a job paid out, a fine
// landed) and read once at boot for the Continue option on the title screen.
import { SAVE_KEY } from './config.js';

/** The stored progress, or null when there is none worth continuing. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const money = Number.isFinite(parsed.money) ? Math.max(0, Math.floor(parsed.money)) : null;
    const missionsDone = Number.isFinite(parsed.missionsDone) ? Math.min(3, Math.max(0, Math.floor(parsed.missionsDone))) : 0;
    if (money === null) return null;
    return { money, missionsDone };
  } catch {
    return null;
  }
}

/** Persist the player's money and how many of the three jobs are done. */
export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.player.money,
      missionsDone: state.missions.index,
    }));
  } catch {
    // Private windows and full disks: the story then lasts this visit only.
  }
}

/** Forget the save (a fresh New Game from the title screen). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget twice.
  }
}
