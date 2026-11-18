// Guns: Rio's pistol is a hitscan with a twelve-round magazine, a tracer and a bark loud
// enough to empty the pavement. The warehouse crew in the last job shoot back. Every shot
// is a crime scene: whether it costs stars is the police module's call, made on witnesses.
import { GUN } from './config.js';
import { losClear, rayHit } from './world.js';
import { knockDown, scarePeds } from './pedestrians.js';

export function createGunman(x, y) {
  return {
    x, y, baseX: x, baseY: y,
    hp: 100, angle: 0, fireTimer: 1, strafe: 1, active: false, dead: false,
  };
}

function rayCircle(ox, oy, dx, dy, cx, cy, r, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const tca = lx * dx + ly * dy;
  if (tca < 0 || tca > maxDist) return Infinity;
  const d2 = lx * lx + ly * ly - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

function firePlayerGun(state, input) {
  const p = state.player;
  const rng = state.rng;
  p.ammo -= 1;
  p.fireTimer = GUN.interval;
  const angle = Math.atan2(input.aimY - p.y, input.aimX - p.x) + rng.range(-GUN.spread, GUN.spread);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const wall = rayHit(state.world, p.x, p.y, angle, GUN.range);
  let bestT = wall.dist;
  let victim = null;
  let victimKind = null;

  for (const g of state.gunmen) {
    if (!g.active || g.dead) continue;
    const t = rayCircle(p.x, p.y, dx, dy, g.x, g.y, 13, bestT);
    if (t < bestT) { bestT = t; victim = g; victimKind = 'gunman'; }
  }
  for (const ped of state.peds) {
    const t = rayCircle(p.x, p.y, dx, dy, ped.x, ped.y, 11, bestT);
    if (t < bestT) { bestT = t; victim = ped; victimKind = 'ped'; }
  }
  for (const car of state.cars) {
    if (car === p.car) continue;
    const t = rayCircle(p.x, p.y, dx, dy, car.x, car.y, car.radius + 3, bestT);
    if (t < bestT) { bestT = t; victim = car; victimKind = 'car'; }
  }

  const hx = p.x + dx * bestT;
  const hy = p.y + dy * bestT;
  state.effects.push({ kind: 'tracer', x1: p.x + dx * 16, y1: p.y + dy * 16, x2: hx, y2: hy, t: 0, ttl: 0.08 });
  state.effects.push({ kind: 'spark', x: hx, y: hy, t: 0, ttl: 0.22 });
  state.events.push({ type: 'shotFired', x: p.x, y: p.y, byPlayer: true });
  state.events.push({ type: 'crime', crime: 'gunshot', x: p.x, y: p.y });
  scarePeds(state, p.x, p.y, 250);

  if (victimKind === 'gunman') {
    victim.hp -= GUN.damage;
    state.events.push({ type: 'hitFlesh', x: hx, y: hy });
    if (victim.hp <= 0 && !victim.dead) {
      victim.dead = true;
      state.events.push({ type: 'gunmanDown', gunman: victim });
    }
  } else if (victimKind === 'ped') {
    if (!victim.down) {
      knockDown(victim);
      state.events.push({ type: 'hitFlesh', x: hx, y: hy });
      state.events.push({ type: 'crime', crime: victim.shot ? 'murder' : 'assault', x: victim.x, y: victim.y });
      victim.shot = true;
    }
  } else if (victimKind === 'car') {
    victim.health = Math.max(0, victim.health - GUN.damage * 0.5);
    if (victim.kind === 'police') {
      state.events.push({ type: 'crime', crime: 'hitPolice', x: victim.x, y: victim.y });
    } else if (victim.driver === 'ai') {
      victim.driver = null; // shot-at drivers abandon the car
      state.events.push({ type: 'crime', crime: 'assault', x: victim.x, y: victim.y });
    }
  }
  if (p.ammo <= 0) p.reloading = GUN.reload;
}

export function updateCombat(state, input, dt) {
  const p = state.player;
  p.fireTimer -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) p.ammo = GUN.mag;
  }
  if (input.reloadPressed && !p.car && p.reloading <= 0 && p.ammo < GUN.mag) {
    p.reloading = GUN.reload;
  }
  if (input.shoot && !p.car && p.reloading <= 0 && p.fireTimer <= 0 && state.flags.mode === 'play') {
    if (p.ammo <= 0) {
      p.reloading = GUN.reload;
      p.fireTimer = 0.3;
    } else {
      firePlayerGun(state, input);
    }
  }

  // The warehouse crew shoot back when they can see their man.
  for (const g of state.gunmen) {
    if (!g.active || g.dead) continue;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    g.angle = Math.atan2(p.y - g.y, p.x - g.x);
    // Slow strafe across their patch of yard, so they are not statues.
    const drift = Math.sin(state.time * 0.7 + g.baseX) * 22;
    g.x = g.baseX + Math.cos(g.angle + Math.PI / 2) * drift * 0.4;
    g.y = g.baseY + Math.sin(g.angle + Math.PI / 2) * drift * 0.4;
    if (d > 400 || p.car || !losClear(state.world, g.x, g.y, p.x, p.y)) continue;
    g.fireTimer -= dt;
    if (g.fireTimer <= 0) {
      g.fireTimer = state.rng.range(0.8, 1.3);
      const hit = state.rng() < Math.max(0.1, 0.38 - d / 1600);
      const ex = hit ? p.x : p.x + state.rng.range(-42, 42);
      const ey = hit ? p.y : p.y + state.rng.range(-42, 42);
      state.effects.push({ kind: 'tracer', x1: g.x, y1: g.y - 4, x2: ex, y2: ey, t: 0, ttl: 0.09 });
      state.events.push({ type: 'shotFired', x: g.x, y: g.y, byPlayer: false });
      scarePeds(state, g.x, g.y, 200);
      if (hit) {
        p.health -= 6;
        p.lastDamage = state.time;
        state.events.push({ type: 'playerHit', x: p.x, y: p.y });
      }
    }
  }
}
