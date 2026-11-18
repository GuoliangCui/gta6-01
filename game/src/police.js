// The wanted system and the police response: stars rise with witnessed crime and
// cool off while the player stays unseen. Police cars hunt in numbers set by the
// star level, reinforcements roll in quickly, officers get out to make arrests,
// and at three stars and up those officers shoot.
import { CAR, POLICE_BY_STAR, WANTED } from './config.js';
import { angleDelta, clamp, distance, turnToward } from './geom.js';

/** How far the police can spot the player, and how close an officer must be to arrest. */
const SIGHT_RANGE = 580;
const ARREST_RANGE = 46;
const CAR_ARREST_RANGE = 78;
/** Seconds between reinforcement checks: the next car is never far behind. */
const REINFORCE_EVERY = 0.55;

export function createPoliceState() {
  return { spawnTimer: 0.3, officerTimer: 0 };
}

/** Raise the wanted level (capped), reset the cooling-off clock, hurry the response. */
export function addWanted(state, points) {
  if (points <= 0) return;
  const before = state.wanted;
  state.wanted = Math.min(WANTED.max, state.wanted + points);
  state.hideTimer = 0;
  if (state.wanted > before) {
    // New stars bring an immediate response: the next car rolls almost at once.
    state.police.spawnTimer = Math.min(state.police.spawnTimer, 0.35);
  }
}

/** Police cars still able to chase (not wrecked, not leaving, not stolen). */
export function activePoliceCars(state) {
  return state.cars.filter((car) => car.kind === 'police' && !car.wrecked && !car.leaving && car.driver !== 'player');
}

/** Drive one police car toward the player with pursuit steering and ramming weight. */
function drivePoliceCar(state, car, dt) {
  const player = state.player;
  const targetX = player.x;
  const targetY = player.y;
  const dist = distance(car.x, car.y, targetX, targetY);
  const lead = clamp(dist / 300, 0, 0.45);
  const aimX = targetX + (player.car ? Math.cos(player.car.angle) * player.car.speed * lead : 0);
  const aimY = targetY + (player.car ? Math.sin(player.car.angle) * player.car.speed * lead : 0);
  const wantedAngle = Math.atan2(aimY - car.y, aimX - car.x);
  const diff = angleDelta(car.angle, wantedAngle);
  const steer = clamp(diff * 1.6, -1, 1);
  car.angle += steer * CAR.turnRate * dt * clamp(Math.abs(car.speed) / 150, 0.25, 1) * (car.speed < 0 ? -1 : 1);
  const topSpeed = 478;
  if (Math.abs(diff) < 1.25) {
    car.speed += CAR.accel * 1.12 * dt * Math.max(0.12, 1 - car.speed / topSpeed);
  } else if (car.speed > 60) {
    car.speed -= CAR.brake * dt;
  }
  if (dist < 54 && !player.car) car.speed = Math.max(car.speed - CAR.brake * dt, 0); // pull up beside a runner
  car.speed -= car.speed * CAR.drag * dt * 0.3;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

/** An officer on foot: chase the player, arrest on contact, shoot at high stars. */
function stepOfficer(state, officer, dt) {
  const player = state.player;
  const dist = distance(officer.x, officer.y, player.x, player.y);
  officer.angle = Math.atan2(player.y - officer.y, player.x - officer.x);
  const level = POLICE_BY_STAR[state.wanted];
  if (level.officersShoot && !player.car && dist < 320 && dist > 60) {
    // Hold position and fire in controlled bursts.
    officer.fireCd -= dt;
    if (officer.fireCd <= 0) {
      officer.fireCd = 0.85 + state.rng() * 0.5;
      state.effects.push({ kind: 'tracer', x1: officer.x, y1: officer.y, x2: player.x, y2: player.y, t: 0, ttl: 0.07, hostile: true });
      if (state.rng() < clamp(0.62 - dist / 700, 0.15, 0.6)) {
        player.health -= 5;
        player.hurtT = 0;
        state.effects.push({ kind: 'spark', x: player.x, y: player.y, t: 0, ttl: 0.25, color: '#ef4444' });
      }
    }
    return;
  }
  if (dist > 20) {
    const speed = 208;
    officer.x += Math.cos(officer.angle) * speed * dt;
    officer.y += Math.sin(officer.angle) * speed * dt;
  }
}

/** Spawn or release officers: one gets out when their car stops close to a runner. */
function manageOfficers(state, dt) {
  const player = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.wrecked || car.leaving || car.driver === 'player') continue;
    const hasOfficer = state.peds.some((ped) => ped.role === 'officer' && ped.carId === car.id);
    if (hasOfficer) continue;
    const dist = distance(car.x, car.y, player.x, player.y);
    if (!player.car && dist < 150 && Math.abs(car.speed) < 90) {
      state.spawnOfficer(car);
    }
  }
  // Officers whose chase is over climb back in or give up with the car.
  for (const ped of state.peds) {
    if (ped.role !== 'officer') continue;
    if (state.wanted === 0 || ped.carGone) {
      ped.dead = true;
      ped.fadeFast = true;
    }
  }
}

/** The whole police step: spawning, pursuit, arrests, cooling off. */
export function stepPolice(state, dt) {
  const player = state.player;
  const level = POLICE_BY_STAR[state.wanted];

  // Spotting: any active police unit with a clear-ish line counts as seeing the player.
  let seen = false;
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.wrecked && distance(car.x, car.y, player.x, player.y) < SIGHT_RANGE) seen = true;
  }
  for (const ped of state.peds) {
    if (ped.role === 'officer' && !ped.dead && distance(ped.x, ped.y, player.x, player.y) < SIGHT_RANGE) seen = true;
  }
  state.seenByPolice = seen;

  // Cooling off: unseen time sheds stars, one at a time.
  if (state.wanted > 0) {
    if (seen) state.hideTimer = 0;
    else {
      state.hideTimer += dt;
      if (state.hideTimer >= WANTED.hideSecondsPerStar * state.wanted) {
        state.wanted -= 1;
        state.hideTimer = 0;
        if (state.wanted > 0) pushMessage(state, 'The heat is cooling off…', '');
      }
    }
  }

  // Reinforcements: keep the hunt at strength, arriving in quick succession.
  state.police.spawnTimer -= dt;
  const active = activePoliceCars(state);
  if (state.wanted > 0 && active.length < level.cars && state.police.spawnTimer <= 0) {
    state.spawnPoliceCar();
    state.police.spawnTimer = REINFORCE_EVERY;
  }
  // When the heat dies, the hunt breaks off: cars leave and are cleaned up far away.
  if (state.wanted === 0) {
    for (const car of state.cars) {
      if (car.kind === 'police' && !car.wrecked) car.leaving = true;
    }
  }

  for (const car of state.cars) {
    if (car.kind !== 'police' || car.wrecked || car.driver === 'player') continue;
    if (car.leaving) {
      car.speed = Math.min(car.speed + CAR.accel * dt * 0.5, 240);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (distance(car.x, car.y, player.x, player.y) > 980) car.removeMe = true;
      continue;
    }
    drivePoliceCar(state, car, dt);
  }

  manageOfficers(state, dt);
  for (const ped of state.peds) {
    if (ped.role === 'officer' && !ped.dead) stepOfficer(state, ped, dt);
  }

  // Arrests: an officer on top of a runner, or cars pinning a stopped driver.
  let arrestPressure = 0;
  if (!player.car) {
    for (const ped of state.peds) {
      if (ped.role === 'officer' && !ped.dead && distance(ped.x, ped.y, player.x, player.y) < ARREST_RANGE) arrestPressure = 1.15;
    }
  } else if (Math.abs(player.car.speed) < 26) {
    for (const car of active) {
      if (distance(car.x, car.y, player.x, player.y) < CAR_ARREST_RANGE) arrestPressure = 0.55;
    }
  }
  if (arrestPressure > 0 && state.wanted > 0) {
    player.bustedMeter = Math.min(1, player.bustedMeter + arrestPressure * dt);
    if (player.bustedMeter >= 1) state.flags.busted = true;
  } else {
    player.bustedMeter = Math.max(0, player.bustedMeter - dt * 0.7);
  }
}

function pushMessage(state, text, sub) {
  state.message = { text, sub, t: 0, ttl: 2.4 };
}
