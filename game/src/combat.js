// Gunplay: hitscan pistols with tracer lines. A shot travels until it meets a building, a
// car or a person, in that order of distance. The player's shots are crimes when witnessed
// (police.js decides); the harbour gang in the last mission shoots back with worse aim.
import { GUN_DAMAGE, GUN_INTERVAL, GUN_MAGAZINE, GUN_RANGE, GUN_RELOAD } from './config.js';
import { collideCircle, lineOfSight } from './world.js';
import { reportCrime } from './police.js';
import { scarePeds } from './pedestrians.js';
import { damagePlayer } from './player.js';

/** Distance along a ray until a building blocks it (raymarched, harbour blocks are big). */
export function rayBlockDistance(world, x, y, angle, range) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = 8; d < range; d += 8) {
    const px = x + dx * d;
    const py = y + dy * d;
    for (const b of world.buildings) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return d;
    }
  }
  return range;
}

function rayCircle(x, y, angle, cx, cy, r, range) {
  const relX = cx - x;
  const relY = cy - y;
  const t = relX * Math.cos(angle) + relY * Math.sin(angle);
  if (t < 0 || t > range) return -1;
  const perpX = relX - Math.cos(angle) * t;
  const perpY = relY - Math.sin(angle) * t;
  return perpX * perpX + perpY * perpY < r * r ? t : -1;
}

/**
 * Fire one shot. byPlayer says whose finger it was; damage scales accordingly. Pushes a
 * tracer effect and applies damage to whatever the shot meets first. Returns what it hit.
 */
export function fireShot(ctx, sx, sy, angle, byPlayer, damage) {
  const blockT = rayBlockDistance(ctx.world, sx, sy, angle, GUN_RANGE);
  let bestT = blockT;
  let hitKind = blockT < GUN_RANGE ? 'building' : 'air';
  let hitTarget = null;
  const people = byPlayer ? [...ctx.peds, ...ctx.gang] : [ctx.player];
  for (const person of people) {
    if (person.state === 'down' || person.hp <= 0) continue;
    const t = rayCircle(sx, sy, angle, person.x, person.y, 13, bestT);
    if (t >= 0 && t < bestT) { bestT = t; hitKind = 'person'; hitTarget = person; }
  }
  for (const car of ctx.cars) {
    if (ctx.player.car === car && byPlayer) continue;
    const t = rayCircle(sx, sy, angle, car.x, car.y, 24, bestT);
    if (t >= 0 && t < bestT) { bestT = t; hitKind = 'car'; hitTarget = car; }
  }
  const ex = sx + Math.cos(angle) * bestT;
  const ey = sy + Math.sin(angle) * bestT;
  ctx.effects.push({ type: 'tracer', x1: sx, y1: sy, x2: ex, y2: ey, ttl: 0.07, max: 0.07 });
  ctx.effects.push({ type: 'spark', x: ex, y: ey, ttl: 0.16, max: 0.16 });
  if (hitKind === 'person') {
    if (hitTarget === ctx.player) {
      damagePlayer(ctx.player, damage);
      ctx.events.push({ type: 'player-hit', hp: ctx.player.hp });
    } else {
      hitTarget.hp -= damage;
      if (hitTarget.hp <= 0 && hitTarget.state !== 'down') {
        hitTarget.state = 'down';
        if (byPlayer && ctx.gang.includes(hitTarget)) ctx.events.push({ type: 'gang-down' });
        if (byPlayer && ctx.peds.includes(hitTarget)) {
          reportCrime(ctx, 'kill', hitTarget.x, hitTarget.y);
          scarePeds(ctx.peds, hitTarget.x, hitTarget.y, 320);
        }
      }
    }
  } else if (hitKind === 'car') {
    hitTarget.health -= damage * 0.35;
  }
  return hitKind;
}

/** The player's trigger, reload and cooldowns; shooting near witnesses is a crime. */
export function stepPlayerGun(ctx, dt, input) {
  const player = ctx.player;
  player.fireCool = Math.max(0, player.fireCool - dt);
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) player.ammo = GUN_MAGAZINE;
    return;
  }
  if (!input.shoot || player.car) return;
  if (player.ammo <= 0) {
    player.reloading = GUN_RELOAD;
    ctx.events.push({ type: 'reload' });
    return;
  }
  if (player.fireCool > 0) return;
  player.fireCool = GUN_INTERVAL;
  player.ammo -= 1;
  const angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  fireShot(ctx, player.x, player.y, angle, true, GUN_DAMAGE);
  reportCrime(ctx, 'gunfire', player.x, player.y);
  scarePeds(ctx.peds, player.x, player.y, 300);
  ctx.events.push({ type: 'shot' });
}

/** One gang gunman: keeps his distance, strafes, and fires in ragged bursts. */
export function stepGangMember(ctx, member, dt) {
  if (member.state === 'down') return;
  const player = ctx.player;
  const dist = Math.hypot(player.x - member.x, player.y - member.y);
  member.angle = Math.atan2(player.y - member.y, player.x - member.x);
  member.strafeTimer -= dt;
  if (member.strafeTimer <= 0) {
    member.strafeTimer = ctx.rng.range(1.2, 2.4);
    member.strafe = ctx.rng.chance(0.5) ? -1 : 1;
  }
  const sees = dist < 430 && lineOfSight(ctx.world, member.x, member.y, player.x, player.y);
  if (sees) {
    let mx = Math.cos(member.angle + Math.PI / 2) * member.strafe * 42;
    let my = Math.sin(member.angle + Math.PI / 2) * member.strafe * 42;
    if (dist > 310) { mx += Math.cos(member.angle) * 62; my += Math.sin(member.angle) * 62; }
    if (dist < 150) { mx -= Math.cos(member.angle) * 62; my -= Math.sin(member.angle) * 62; }
    member.x += mx * dt;
    member.y += my * dt;
    collideCircle(ctx.world, member, 12);
    member.cool -= dt;
    if (member.cool <= 0 && dist < 390 && !player.car) {
      member.cool = ctx.rng.range(0.85, 1.25);
      const spread = ctx.rng.range(-0.055, 0.055);
      fireShot(ctx, member.x, member.y, member.angle + spread, false, 9);
      scarePeds(ctx.peds, member.x, member.y, 260);
      ctx.events.push({ type: 'gang-shot' });
    }
  }
}

/** Create a gang gunman for the harbour fight. */
export function createGangMember(x, y) {
  return { x, y, hp: 100, angle: 0, cool: 1.1, strafe: 1, strafeTimer: 1, state: 'fight', color: '#d63031' };
}
