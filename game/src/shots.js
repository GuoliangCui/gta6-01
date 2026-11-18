// The screenshot scenes behind ?shot=walk|drive|chase|mission&seed=N. Each one
// builds a fresh world from the seed and plays the real simulation forward with
// a scripted driver, so the frame is an honest moment of the game — traffic,
// police and missions behaving exactly as they do in play — and the same seed
// always stages the same frame.
import { STEP } from './config.js';
import { laneCenterX } from './city.js';
import { angleDelta, clamp, distance } from './geom.js';
import { addWanted } from './police.js';
import { startBriefing } from './missions.js';
import { advanceDialogue, stepGame } from './sim.js';

const IDLE = { moveX: 0, moveY: 0, firing: false, interact: false, sprint: false, throttle: 0, steer: 0 };

function step(state, input, frames) {
  for (let i = 0; i < frames; i += 1) stepGame(state, { ...IDLE, ...input }, STEP);
}

/** A simple driver: steer at a world point, hold a cruise speed. */
function driveToward(state, targetX, targetY, cruise, frames) {
  const car = state.player.car;
  for (let i = 0; i < frames; i += 1) {
    const want = Math.atan2(targetY - car.y, targetX - car.x);
    const steer = clamp(angleDelta(car.angle, want) * 1.9, -1, 1);
    const throttle = car.speed < cruise ? 1 : 0;
    stepGame(state, { ...IDLE, throttle, steer }, STEP);
  }
}

/** Put the player behind the wheel of a car, wherever it currently sits. */
function putPlayerInCar(state, car) {
  car.driver = 'player';
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
}

/** The nearest parked car to a point (the staging crew is not picky). */
function nearestParkedCar(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked' || car.missionTarget) continue;
    const d = distance(car.x, car.y, x, y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** walk: Juno crosses the plaza quarter on foot, traffic rolling past. */
function stageWalk(state) {
  const player = state.player;
  player.x = 1330;
  player.y = 640;
  step(state, { moveX: 1, moveY: -0.35, sprint: false }, 150);
  step(state, { moveX: 0.4, moveY: -1, sprint: false }, 90);
}

/** drive: southbound down the long avenue, the harbour opening up ahead. */
function stageDrive(state) {
  const car = nearestParkedCar(state, 700, 500);
  putPlayerInCar(state, car);
  car.x = laneCenterX(2, 1);
  car.y = 330;
  car.angle = Math.PI / 2;
  car.speed = 190;
  state.player.x = car.x;
  state.player.y = car.y;
  driveToward(state, laneCenterX(2, 1), 1560, 235, 400);
}

/** chase: four stars, a fast car, and the NHPD arriving from every side street. */
function stageChase(state) {
  const car = state.cars.find((c) => c.missionTarget);
  putPlayerInCar(state, car);
  car.x = laneCenterX(3, -1);
  car.y = 980;
  car.angle = -Math.PI / 2;
  car.speed = 250;
  state.player.x = car.x;
  state.player.y = car.y;
  addWanted(state, 4);
  // Two interceptors start close enough to be in frame; the rest roll in live.
  for (const [dx, dy] of [[-150, 300], [170, 380]]) {
    const cop = state.spawnPoliceCar();
    if (cop) {
      cop.x = car.x + dx;
      cop.y = car.y + dy;
      cop.angle = -Math.PI / 2;
      cop.speed = 240;
    }
  }
  driveToward(state, laneCenterX(3, -1), 120, 300, 215);
}

/** mission: the case is in hand, the diner clock is running, the city is awake. */
function stageMission(state) {
  const player = state.player;
  const cafe = state.city.pois.cafe;
  player.x = cafe.x;
  player.y = cafe.y;
  startBriefing(state);
  while (state.dialogue) advanceDialogue(state);
  // Collect the case from the pier.
  const pier = state.city.pois.pier;
  player.x = pier.x;
  player.y = pier.y;
  step(state, {}, 2);
  // Then drive the delivery: north up the avenue with the timer on the HUD.
  const car = nearestParkedCar(state, pier.x, pier.y - 160);
  putPlayerInCar(state, car);
  car.x = laneCenterX(2, -1);
  car.y = 1330;
  car.angle = -Math.PI / 2;
  car.speed = 210;
  player.x = car.x;
  player.y = car.y;
  driveToward(state, laneCenterX(2, -1), 300, 250, 170);
}

const SCENES = { walk: stageWalk, drive: stageDrive, chase: stageChase, mission: stageMission };

/** Stage the named scene on a fresh world; unknown names fall back to walk. */
export function stageShot(name, state) {
  (SCENES[name] ?? stageWalk)(state);
}
