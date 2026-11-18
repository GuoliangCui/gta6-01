// The screenshot scenes behind ?shot=walk|drive|chase|mission. Each one stages a real
// moment of the game — the player is placed, the simulation runs forward on scripted
// inputs for a few seconds, and the frame the renderer then paints is exactly what a
// player would see: the city on foot, a drive through traffic, a three-star chase, and
// a delivery in progress with its countdown and dialogue. Same seed, same frame.
import { STEP } from './config.js';
import { stepSim } from './sim.js';
import { PLACE_CAFE } from './world.js';

function baseInput() {
  return { mx: 0, my: 0, sprint: false, interact: false, shoot: false, aiming: false, aimX: 0, aimY: 0, confirm: false };
}

function run(sim, seconds, control) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepSim(sim, STEP, control(sim));
}

function walkToward(sim, tx, ty, sprint = false) {
  const input = baseInput();
  const dx = tx - sim.player.x;
  const dy = ty - sim.player.y;
  const d = Math.hypot(dx, dy) || 1;
  input.mx = dx / d;
  input.my = dy / d;
  input.sprint = sprint;
  return input;
}

const unstick = { lowTime: 0, reverseLeft: 0 };

function driveToward(sim, tx, ty) {
  const input = baseInput();
  const car = sim.player.car;
  if (!car) return input;
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  let diff = wanted - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  input.mx = Math.max(-1, Math.min(1, diff * 2.2));
  input.my = Math.abs(diff) > 1.9 ? 0.4 : -1;
  // Brake for corners: a sharp heading change close ahead means slow down.
  if (Math.hypot(tx - car.x, ty - car.y) < 280 && Math.abs(diff) > 0.5 && Math.abs(car.speed) > 250) input.my = 0.55;
  // Wedged against a wall at walking pace: reverse out with opposite lock.
  if (Math.abs(car.speed) < 28 && unstick.reverseLeft <= 0) unstick.lowTime += STEP;
  else if (unstick.reverseLeft <= 0) unstick.lowTime = 0;
  if (unstick.lowTime > 1.2) { unstick.reverseLeft = 0.65; unstick.lowTime = 0; }
  if (unstick.reverseLeft > 0) {
    unstick.reverseLeft -= STEP;
    input.my = 0.85;
    input.mx = -input.mx;
  }
  return input;
}

function waypointDriver(points) {
  let at = 0;
  return (sim) => {
    const car = sim.player.car;
    if (!car) return baseInput();
    let [tx, ty] = points[Math.min(at, points.length - 1)];
    if (Math.hypot(tx - car.x, ty - car.y) < 90 && at < points.length - 1) {
      at += 1;
      [tx, ty] = points[at];
    }
    return driveToward(sim, tx, ty);
  };
}

function enterHarbourCar(sim) {
  sim.player.x = 972;
  sim.player.y = 2274;
  let step = 0;
  run(sim, 0.1, () => {
    const input = baseInput();
    input.interact = step === 2;
    step += 1;
    return input;
  });
}

const SCENES = {
  walk(sim) {
    sim.player.x = 1150;
    sim.player.y = 985;
    const loop = [[1345, 985], [1345, 1160], [1150, 1160], [1150, 985]];
    let at = 0;
    run(sim, 7, () => {
      const [tx, ty] = loop[at % loop.length];
      if (Math.hypot(tx - sim.player.x, ty - sim.player.y) < 30) at += 1;
      return walkToward(sim, tx, ty);
    });
  },
  drive(sim) {
    enterHarbourCar(sim);
    // The calm-drive scene starts clean: whatever the harbour thought it saw, forget it.
    sim.wanted.stars = 0;
    sim.cars = sim.cars.filter((car) => car.kind !== 'cop');
    run(sim, 9, waypointDriver([[1560, 2332], [2360, 2332], [2880, 2332], [2940, 1960]]));
    if (sim.wanted.stars > 0) {
      sim.wanted.stars = 0;
      sim.cars = sim.cars.filter((car) => car.kind !== 'cop');
    }
  },
  chase(sim) {
    enterHarbourCar(sim);
    const drive = waypointDriver([[1560, 2332], [2100, 2332], [2100, 1560], [2100, 640]]);
    run(sim, 2.2, () => drive(sim));
    sim.wanted.stars = 3;
    run(sim, 8, () => drive(sim));
  },
  mission(sim) {
    const state = sim.missions;
    state.index = 0;
    state.phase = 'active';
    state.stage = 'deliver';
    state.hasPackage = true;
    state.timer = 118;
    state.marker = sim.world.places[PLACE_CAFE];
    state.objective = 'Deliver the package to Café Sol — fast';
    sim.player.x = 880;
    sim.player.y = 2562;
    run(sim, 2.4, () => walkToward(sim, 880, 2410));
    // The phone call lands in the final frame, not before it.
    state.dialogue = {
      speaker: 'Marina · phone',
      lines: ['You have it? Good. Café Sol, and do not stop for anyone.'],
      at: 0.4,
      index: 0,
    };
  },
};

/** Stage the named scene on a fresh simulation (any other name is the walk scene). */
export function stageShot(name, sim) {
  (SCENES[name] ?? SCENES.walk)(sim);
}
