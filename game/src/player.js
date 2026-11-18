// The player on foot: Rio, a harbour courier. Movement is plain top-down walking with a
// sprint, the body turns toward the aim when a shot is being lined up and toward the walk
// otherwise, and health creeps back once the shooting stops. Cars are entered from sim.js.
import { CALM_TIME, PLAYER_HEALTH, PLAYER_RADIUS, PLAYER_REGEN, PLAYER_SPEED, PLAYER_SPRINT } from './config.js';
import { collideCircle } from './world.js';

export function createPlayer(x, y) {
  return {
    x, y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: PLAYER_HEALTH,
    speedNow: 0,
    car: null,
    ammo: 12,
    reloading: 0,
    fireCool: 0,
    calmTimer: CALM_TIME + 1,
  };
}

/** Advance the on-foot player. input: {mx, my, sprint, aimX, aimY, aiming}. */
export function stepPlayer(world, player, dt, input) {
  const mag = Math.hypot(input.mx, input.my);
  const speed = input.sprint ? PLAYER_SPRINT : PLAYER_SPEED;
  if (mag > 0.01) {
    const nx = input.mx / Math.max(1, mag);
    const ny = input.my / Math.max(1, mag);
    player.vx = nx * speed * Math.min(1, mag);
    player.vy = ny * speed * Math.min(1, mag);
    if (!input.aiming) player.angle = Math.atan2(player.vy, player.vx);
  } else {
    player.vx = 0;
    player.vy = 0;
  }
  player.speedNow = Math.hypot(player.vx, player.vy);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  collideCircle(world, player, PLAYER_RADIUS);
  if (input.aiming) player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  player.calmTimer += dt;
  if (player.calmTimer > CALM_TIME && player.hp > 0) {
    player.hp = Math.min(PLAYER_HEALTH, player.hp + PLAYER_REGEN * dt);
  }
}

/** Hurt the player; the simulation decides what dying means. */
export function damagePlayer(player, amount) {
  player.hp -= amount;
  player.calmTimer = 0;
}
