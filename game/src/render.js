// The world renderer: a sun-soaked top-down city with a lift of pseudo-3D —
// buildings throw long shadows and show their south faces, cars carry roofs and
// light bars, and the harbour sparkles. Everything is drawn from the simulation
// state and state.time alone, so a staged scene paints the same frame twice.
import { CITY, LAND_H, LAND_W, PALETTE, PITCH, VIEW, WORLD_H, WORLD_W } from './config.js';
import { clamp } from './geom.js';
import { missionTrigger } from './missions.js';

const PED_COLORS = ['#e2725b', '#5b8dd9', '#7fb069', '#e9c46a', '#8e6cc8', '#d95f76', '#4fb0a5', '#c96f2e'];

/** Where the camera sits: on the player, led by their motion, clamped to the world. */
export function computeCamera(state) {
  const player = state.player;
  const lead = player.car ? 0.32 : 0.12;
  const speed = player.car ? player.car.speed : 60;
  const cx = player.x + Math.cos(player.angle) * Math.abs(speed) * lead;
  const cy = player.y + Math.sin(player.angle) * Math.abs(speed) * lead;
  const shakeX = state.shake ? Math.sin(state.time * 91) * state.shake : 0;
  const shakeY = state.shake ? Math.cos(state.time * 113) * state.shake * 0.7 : 0;
  return {
    x: clamp(cx - VIEW.width / 2 + shakeX, 0, Math.max(0, WORLD_W - VIEW.width)),
    y: clamp(cy - VIEW.height / 2 + shakeY, 0, Math.max(0, WORLD_H - VIEW.height)),
  };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    /** Paint the world (not the HUD: hud.js layers that on afterwards). */
    draw(state, camera) {
      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      drawHarbour(ctx, state);
      drawStreets(ctx, state);
      drawBlocks(ctx, state);
      drawMarkers(ctx, state);
      drawCars(ctx, state);
      drawPeds(ctx, state);
      drawEffects(ctx, state);
      drawFloaters(ctx, state);
      ctx.restore();
      drawSunlight(ctx);
    },
  };
}

/** Water first, then the sand line and the piers that reach into it. */
function drawHarbour(ctx, state) {
  const { city } = state;
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, LAND_H, WORLD_W, WORLD_H - LAND_H + 40);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, LAND_H + 8, WORLD_W, WORLD_H - LAND_H);
  // Sparkle: short pale strokes on a fixed grid, twinkling with time.
  ctx.strokeStyle = 'rgba(220, 245, 250, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 30; x < WORLD_W; x += 92) {
    for (let y = LAND_H + 34; y < WORLD_H - 10; y += 54) {
      if (Math.sin(state.time * 1.4 + x * 0.7 + y * 1.3) <= 0.25) continue;
      ctx.moveTo(x + ((y * 7) % 23), y);
      ctx.lineTo(x + ((y * 7) % 23) + 16, y);
    }
  }
  ctx.stroke();
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, LAND_H - 3, WORLD_W, 11);
  for (const pier of city.piers) {
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(60, 40, 20, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = pier.y + 14; y < pier.y + pier.h; y += 18) {
      ctx.moveTo(pier.x + 3, y);
      ctx.lineTo(pier.x + pier.w - 3, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#6d4c33';
    ctx.fillRect(pier.x - 4, pier.y + pier.h - 10, pier.w + 8, 8);
  }
}

/** Asphalt under everything, with lane dashes and crosswalks at intersections. */
function drawStreets(ctx, state) {
  ctx.fillStyle = PALETTE.road;
  ctx.fillRect(0, 0, LAND_W, LAND_H);
  ctx.strokeStyle = PALETTE.laneMark;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let i = 0; i <= CITY.cols; i += 1) {
    const x = i * PITCH + CITY.road / 2;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, LAND_H);
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    const y = j * PITCH + CITY.road / 2;
    ctx.moveTo(0, y);
    ctx.lineTo(LAND_W, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Crosswalks: four striped bands around every intersection.
  ctx.fillStyle = PALETTE.crosswalk;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let j = 0; j <= CITY.rows; j += 1) {
      const x = i * PITCH;
      const y = j * PITCH;
      for (let s = 0; s < 4; s += 1) {
        ctx.fillRect(x + 10 + s * 20, y - 12, 11, 9);
        ctx.fillRect(x + 10 + s * 20, y + CITY.road + 3, 11, 9);
        ctx.fillRect(x - 12, y + 10 + s * 20, 9, 11);
        ctx.fillRect(x + CITY.road + 3, y + 10 + s * 20, 9, 11);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Block grounds, then the buildings with their shadows, faces and roofs. */
function drawBlocks(ctx, state) {
  const { city } = state;
  for (const block of city.blocks) {
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(block.x - 7, block.y - 7, block.w + 14, block.h + 14);
    ctx.fillStyle = block.kind === 'park' ? PALETTE.parkGrass
      : block.kind === 'plaza' ? PALETTE.plaza
        : block.kind === 'parking' ? '#a89a80'
          : PALETTE.blockGround;
    ctx.fillRect(block.x, block.y, block.w, block.h);
    if (block.kind === 'park') {
      ctx.strokeStyle = PALETTE.parkPath;
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(block.x, block.y + block.h / 2);
      ctx.lineTo(block.x + block.w, block.y + block.h / 2);
      ctx.moveTo(block.x + block.w / 2, block.y);
      ctx.lineTo(block.x + block.w / 2, block.y + block.h);
      ctx.stroke();
    }
    if (block.kind === 'parking') {
      ctx.strokeStyle = 'rgba(245, 240, 225, 0.65)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        const x = block.x + 16 + i * 40;
        ctx.strokeRect(x, block.y + 18, 34, 66);
        ctx.strokeRect(x, block.y + block.h - 84, 34, 66);
      }
    }
  }
  if (city.fountain) {
    const f = city.fountain;
    ctx.fillStyle = '#9a917e';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57b6c9';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(f.x + Math.sin(state.time * 2) * 5, f.y + Math.cos(state.time * 1.6) * 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const crate of city.crates) {
    ctx.fillStyle = '#a97c50';
    ctx.fillRect(crate.x, crate.y, crate.w, crate.h);
    ctx.strokeStyle = 'rgba(70, 45, 20, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(crate.x + 1, crate.y + 1, crate.w - 2, crate.h - 2);
    ctx.beginPath();
    ctx.moveTo(crate.x, crate.y);
    ctx.lineTo(crate.x + crate.w, crate.y + crate.h);
    ctx.moveTo(crate.x + crate.w, crate.y);
    ctx.lineTo(crate.x, crate.y + crate.h);
    ctx.stroke();
  }
  for (const tree of city.trees) drawTree(ctx, tree);
  // Buildings last within the block pass, ordered by their base line.
  const sorted = [...city.buildings].sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const building of sorted) drawBuilding(ctx, building);
}

function drawTree(ctx, tree) {
  ctx.fillStyle = 'rgba(40, 30, 15, 0.25)';
  ctx.beginPath();
  ctx.ellipse(tree.x + 7, tree.y + 9, tree.r, tree.r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.treeTrunk;
  ctx.fillRect(tree.x - 2.5, tree.y - 3, 5, 8);
  ctx.fillStyle = PALETTE.treeTop;
  ctx.beginPath();
  ctx.arc(tree.x, tree.y - 4, tree.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4c9440';
  ctx.beginPath();
  ctx.arc(tree.x - tree.r * 0.3, tree.y - tree.r * 0.45, tree.r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

/** One building: shadow, south face with windows, and a sunlit roof. */
function drawBuilding(ctx, b) {
  const lift = b.height * 0.34;
  ctx.fillStyle = 'rgba(45, 32, 18, 0.28)';
  ctx.fillRect(b.x + 12, b.y + 14 - lift * 0.3, b.w, b.h);
  // South face.
  ctx.fillStyle = PALETTE.buildingSide;
  ctx.fillRect(b.x, b.y + b.h - lift, b.w, lift);
  // Windows on the face: a quiet grid, some lit.
  ctx.fillStyle = 'rgba(255, 240, 200, 0.75)';
  const cols = Math.max(2, Math.floor(b.w / 26));
  const rows = Math.max(1, Math.floor(lift / 17));
  for (let cx = 0; cx < cols; cx += 1) {
    for (let cy = 0; cy < rows; cy += 1) {
      if ((cx * 7 + cy * 13 + b.x) % 5 === 0) continue;
      ctx.fillRect(b.x + 8 + cx * ((b.w - 14) / cols), b.y + b.h - lift + 5 + cy * (lift / (rows + 0.6)), 7, 8);
    }
  }
  // Roof.
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y - lift, b.w, b.h);
  ctx.strokeStyle = 'rgba(90, 60, 30, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 3, b.y - lift + 3, b.w - 6, b.h - 6);
  ctx.fillStyle = 'rgba(90, 60, 30, 0.25)';
  ctx.fillRect(b.x + b.w * 0.18, b.y - lift + b.h * 0.2, b.w * 0.22, b.h * 0.18);
  if (b.awning) {
    ctx.fillStyle = b.awning;
    ctx.fillRect(b.x - 3, b.y + b.h - lift - 2, b.w + 6, 7);
  }
  if (b.name) {
    ctx.fillStyle = '#3a2c1c';
    ctx.font = '700 15px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - lift / 2 + 5);
  }
}

/** The job marker and the objective beacon: light pillars visible across town. */
function drawMarkers(ctx, state) {
  const t = state.time;
  const drawBeacon = (x, y, color, label) => {
    const grad = ctx.createLinearGradient(0, y - 190, 0, y);
    grad.addColorStop(0, 'rgba(255, 200, 80, 0)');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(x - 9, y - 190, 18, 190);
    const bob = Math.sin(t * 3.2) * 6;
    ctx.save();
    ctx.translate(x, y - 34 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = '#fff7e0';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
    if (label) {
      ctx.fillStyle = '#fff7e0';
      ctx.font = '700 14px "Avenir Next", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y - 58 + bob);
    }
  };
  const trigger = missionTrigger(state);
  if (trigger && !state.player.car) drawBeacon(trigger.x, trigger.y, 'rgba(255, 180, 84, 0.85)', '!');
  const objective = state.missions.objective;
  if (objective) drawBeacon(objective.x, objective.y, 'rgba(255, 120, 90, 0.8)', '');
}

/** Every car: shadow, body, roof, glass, lights — police get a flashing bar. */
function drawCars(ctx, state) {
  for (const car of state.cars) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(30, 25, 15, 0.3)';
    ctx.beginPath();
    ctx.ellipse(5, 7, car.radius + 5, car.radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    const L = car.model === 'van' ? 54 : 46;
    const W = car.model === 'van' ? 24 : 21;
    ctx.fillStyle = car.wrecked ? '#3c3c40' : car.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#23262b';
      ctx.fillRect(-L / 2, -W / 2, 11, W);
      ctx.fillRect(L / 2 - 9, -W / 2, 9, W);
    }
    // Cabin and glass.
    ctx.fillStyle = car.wrecked ? '#242428' : '#bfe6ef';
    roundRect(ctx, -L * 0.16, -W / 2 + 3.5, L * 0.36, W - 7, 4);
    ctx.fill();
    ctx.fillStyle = car.wrecked ? '#2c2c30' : shadeOf(car.color);
    roundRect(ctx, -L * 0.13, -W / 2 + 5, L * 0.2, W - 10, 3);
    ctx.fill();
    if (car.model === 'sport') {
      ctx.fillStyle = 'rgba(30,30,34,0.85)';
      ctx.fillRect(-L / 2 + 1, -W / 2 + 2, 5, W - 4);
    }
    if (car.model === 'taxi') {
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(-3, -3, 6, 6);
    }
    if (car.kind === 'police') {
      const phase = Math.floor(state.time * 2.4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#5e2b27';
      ctx.fillRect(-7, -W / 2 + 2, 6, 6);
      ctx.fillStyle = phase ? '#274b73' : '#3d8bfd';
      ctx.fillRect(1, -W / 2 + 2, 6, 6);
    }
    // Headlights and tail lights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(L / 2 - 2.5, -W / 2 + 2.5, 2.5, 4);
    ctx.fillRect(L / 2 - 2.5, W / 2 - 6.5, 2.5, 4);
    ctx.fillStyle = '#d64541';
    ctx.fillRect(-L / 2, -W / 2 + 2.5, 2.5, 4);
    ctx.fillRect(-L / 2, W / 2 - 6.5, 2.5, 4);
    if (car.missionTarget) {
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.lineWidth = 2;
      roundRect(ctx, -L / 2 - 3, -W / 2 - 3, L + 6, W + 6, 8);
      ctx.stroke();
    }
    ctx.restore();
    if (car.wrecked) {
      ctx.fillStyle = 'rgba(20,20,22,0.35)';
      ctx.beginPath();
      ctx.arc(car.x, car.y, car.radius + 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** People: the player in teal, officers in navy, Breakers in rust, everyone else bright. */
function drawPeds(ctx, state) {
  for (const ped of state.peds) {
    if (ped.dead) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - ped.deadT / 7, 0, 1);
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = '#5a4a42';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.fillStyle = 'rgba(30, 25, 15, 0.3)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 3, ped.y + 5, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    let color = PED_COLORS[ped.id % PED_COLORS.length];
    if (ped.role === 'officer') color = '#274b73';
    else if (ped.role === 'gang') color = '#8c3b2e';
    else if (ped.role === 'contact') color = ped.name === 'Mara Voss' ? '#e2725b' : '#d9a441';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c09a';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 2.5, ped.y + Math.sin(ped.angle) * 2.5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    if (ped.role === 'gang' || ped.role === 'officer') {
      // A held pistol, pointed the way they face.
      ctx.strokeStyle = '#22252a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ped.x, ped.y);
      ctx.lineTo(ped.x + Math.cos(ped.angle) * 14, ped.y + Math.sin(ped.angle) * 14);
      ctx.stroke();
    }
    if (ped.role === 'contact') {
      ctx.fillStyle = '#fff7e0';
      ctx.font = '600 11px "Avenir Next", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ped.name, ped.x, ped.y - 15);
    }
  }
  // The player, when on foot: teal jacket and a pistol line toward the aim.
  const player = state.player;
  if (!player.car) {
    ctx.fillStyle = 'rgba(30, 25, 15, 0.3)';
    ctx.beginPath();
    ctx.ellipse(player.x + 3, player.y + 5, 9, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c09a';
    ctx.beginPath();
    ctx.arc(player.x + Math.cos(player.angle) * 3, player.y + Math.sin(player.angle) * 3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#22252a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.angle) * 15, player.y + Math.sin(player.angle) * 15);
    ctx.stroke();
  }
}

/** Tracers, muzzle flashes, sparks and the smoke of cooling wrecks. */
function drawEffects(ctx, state) {
  for (const e of state.effects) {
    const life = 1 - e.t / e.ttl;
    if (e.kind === 'tracer') {
      ctx.strokeStyle = e.hostile ? `rgba(255, 90, 70, ${0.85 * life})` : `rgba(255, 230, 150, ${0.9 * life})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    } else if (e.kind === 'flash') {
      ctx.fillStyle = `rgba(255, 210, 90, ${life})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 7 * life + 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'spark') {
      ctx.strokeStyle = e.color ?? '#ffd166';
      ctx.globalAlpha = life;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + e.x;
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * 9, e.y + Math.sin(a) * 9);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'smoke') {
      ctx.fillStyle = `rgba(70, 70, 74, ${0.35 * life})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y - e.t * 22, 6 + e.t * 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Little rising texts: cash earned, fines paid. */
function drawFloaters(ctx, state) {
  ctx.font = '700 15px "Avenir Next", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = clamp(1 - f.t / f.ttl, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/** A warm wash over the whole frame: late-afternoon sun. */
function drawSunlight(ctx) {
  const grad = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
  grad.addColorStop(0, 'rgba(255, 190, 90, 0.07)');
  grad.addColorStop(1, 'rgba(255, 120, 60, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A darker shade of a hex colour, for cabin tops. */
function shadeOf(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 46);
  const g = Math.max(0, ((n >> 8) & 255) - 46);
  const b = Math.max(0, (n & 255) - 46);
  return `rgb(${r}, ${g}, ${b})`;
}
