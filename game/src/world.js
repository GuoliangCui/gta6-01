// The city of Neon Harbor as pure data: a grid of avenues over a harbour, blocks of
// sun-bleached buildings, one park, two piers. Generation draws from the seeded stream the
// simulation hands it, so every seed builds the same city twice. Nothing here touches the
// DOM — collision and line-of-sight queries live here too, shared by the sim and the tests.
import { ROADS_H, ROADS_V, ROAD_WIDTH, WATER_Y, WORLD_HEIGHT, WORLD_WIDTH } from './config.js';

/** Building paint: stucco pastels for the walls, brighter roofs, neon for the signs. */
const WALLS = ['#f2d5a0', '#eeb98a', '#f7e3c3', '#e8a2a2', '#a8d5ba', '#9fc6e8', '#f4f1de', '#e07a5f'];
const ROOFS = ['#c96f4a', '#b5522f', '#8a7f6a', '#5d8a7a', '#7a6a9b', '#a85751'];
const NEON = ['#ff5d8f', '#22d3ee', '#facc15', '#4ade80', '#f472b6', '#38bdf8'];
const SIGNS = ['HOTEL AZUL', 'CAFÉ SOL', 'CLUB NEÓN', 'BANCO MAR', 'CINE LUNA', 'PAWN & CO',
  'TACOS REY', 'HOTEL PALMA', 'BAR TIBURÓN', 'LIBROS', 'FARMACIA', 'GYM FUERTE', 'SUSHI GO',
  'PIZZA VOLCÁN', 'RADIO FM', 'TALLER MAR', 'JOYAS', 'CIBER CAFÉ', 'FLORISTERÍA', 'PANADERÍA'];

/** The block between the park avenues is grass, not buildings (column 2, row 2). */
const PARK_COL = 2;
const PARK_ROW = 2;

/** Fixed story places, found by name once the city exists. */
export const PLACE_PIER = 'pier';
export const PLACE_CAFE = 'cafe';
export const PLACE_GARAGE = 'garage';
export const PLACE_WAREHOUSE = 'warehouse';

function blockBands(centres, limit) {
  const bands = [];
  let edge = 30;
  for (const centre of centres) {
    bands.push([edge, centre - ROAD_WIDTH / 2]);
    edge = centre + ROAD_WIDTH / 2;
  }
  bands.push([edge, limit - 30]);
  return bands;
}

function makeBuilding(rng, x, y, w, h, signIndex) {
  return {
    x, y, w, h,
    height: rng.range(26, 118),
    wall: rng.pick(WALLS),
    roof: rng.pick(ROOFS),
    sign: signIndex >= 0 ? SIGNS[signIndex % SIGNS.length] : null,
    signColor: rng.pick(NEON),
    windows: rng.int(2, 5),
  };
}

/**
 * Build the city for a seed. Returns roads, buildings, trees, the park, the piers and the
 * named story places (each a point a mission can point at, just outside its building).
 */
export function generateCity(rng) {
  const cols = blockBands(ROADS_V, WORLD_WIDTH);
  const rows = blockBands(ROADS_H, WATER_Y - 60);
  const buildings = [];
  const trees = [];
  const places = {};
  let signIndex = rng.int(0, SIGNS.length);

  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < cols.length; col += 1) {
      const [bx, bx2] = cols[col];
      const [by, by2] = rows[row];
      if (col === PARK_COL && row === PARK_ROW) continue;
      // Lots inside the block, in from the sidewalk, with alleys between them.
      const lotW = 196;
      const lotH = 176;
      for (let lx = bx + 24; lx + lotW <= bx2 - 12; lx += lotW + 20) {
        for (let ly = by + 24; ly + lotH <= by2 - 12; ly += lotH + 20) {
          if (!rng.chance(0.86)) continue;
          const signed = rng.chance(0.34);
          const building = makeBuilding(rng, lx + 12, ly + 12, lotW - 24, lotH - 24, signed ? signIndex++ : -1);
          buildings.push(building);
        }
      }
      // A tree or two on the block's corners.
      if (rng.chance(0.8)) trees.push({ x: bx + 14, y: by + 14, r: 9 });
      if (rng.chance(0.8)) trees.push({ x: bx2 - 14, y: by2 - 14, r: 9 });
    }
  }

  // The park: lawn, a fountain, palms around the paths.
  const park = { x: cols[PARK_COL][0], y: rows[PARK_ROW][0], w: cols[PARK_COL][1] - cols[PARK_COL][0], h: rows[PARK_ROW][1] - rows[PARK_ROW][0] };
  const fountain = { x: park.x + park.w / 2, y: park.y + park.h / 2, r: 30 };
  for (let i = 0; i < 30; i += 1) {
    const x = rng.range(park.x + 30, park.x + park.w - 30);
    const y = rng.range(park.y + 30, park.y + park.h - 30);
    if (Math.hypot(x - fountain.x, y - fountain.y) > 70) trees.push({ x, y, r: rng.range(8, 12) });
  }

  // Palms along the promenade and the piers reaching into the sea.
  for (let x = 90; x < WORLD_WIDTH - 60; x += 150) trees.push({ x, y: WATER_Y - 26, r: 9 });
  const piers = [
    { x: 838, y: WATER_Y, w: 84, h: WORLD_HEIGHT - WATER_Y },
    { x: 2038, y: WATER_Y, w: 84, h: WORLD_HEIGHT - WATER_Y },
  ];

  // Story places: standpoints on the street beside their buildings.
  places[PLACE_PIER] = { x: 880, y: 2640, label: 'Muelle Viejo' };
  places[PLACE_CAFE] = { x: 2520, y: 2322 + 66, label: 'Café Sol' };
  places[PLACE_GARAGE] = { x: 240, y: 438 - 66, label: 'Taller Mar' };
  places[PLACE_WAREHOUSE] = { x: 3300, y: 2322 + 66, label: 'Almacén 9' };
  const spawn = { x: 1060, y: 2472 };

  return { width: WORLD_WIDTH, height: WORLD_HEIGHT, buildings, trees, park, fountain, piers, places, spawn };
}

/** True when the point is on a road (asphalt), not a block or the promenade. */
export function isRoad(x, y) {
  if (y > WATER_Y - 40) return false;
  for (const cx of ROADS_V) if (Math.abs(x - cx) <= ROAD_WIDTH / 2) return true;
  for (const cy of ROADS_H) if (Math.abs(y - cy) <= ROAD_WIDTH / 2) return true;
  return false;
}

/** True when the point is open sea (piers are decks over it, and count as land). */
export function isWater(world, x, y) {
  if (y < WATER_Y) return false;
  for (const pier of world.piers) {
    if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
  }
  return true;
}

function circleRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Push a circle out of every building, the fountain and the sea, and clamp it to the
 * world. Returns true when anything had to move it (a collision happened).
 */
export function collideCircle(world, pos, r) {
  let hit = false;
  for (const b of world.buildings) {
    if (!circleRect(pos.x, pos.y, r, b)) continue;
    hit = true;
    const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    let dx = pos.x - nx;
    let dy = pos.y - ny;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) {
      // Centre inside the rect: leave by the nearest face.
      const left = pos.x - b.x;
      const right = b.x + b.w - pos.x;
      const top = pos.y - b.y;
      const bottom = b.y + b.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.x - r;
      else if (m === right) pos.x = b.x + b.w + r;
      else if (m === top) pos.y = b.y - r;
      else pos.y = b.y + b.h + r;
      continue;
    }
    dx /= d;
    dy /= d;
    d = r - d;
    pos.x += dx * d;
    pos.y += dy * d;
  }
  const f = world.fountain;
  const fd = Math.hypot(pos.x - f.x, pos.y - f.y);
  if (fd < f.r + r && fd > 0.001) {
    hit = true;
    pos.x = f.x + ((pos.x - f.x) / fd) * (f.r + r);
    pos.y = f.y + ((pos.y - f.y) / fd) * (f.r + r);
  }
  if (isWater(world, pos.x, pos.y + r * 0.4)) {
    pos.y = Math.min(pos.y, WATER_Y - r * 0.4 - 1);
    hit = true;
  }
  if (pos.x < r) { pos.x = r; hit = true; }
  if (pos.y < r) { pos.y = r; hit = true; }
  if (pos.x > world.width - r) { pos.x = world.width - r; hit = true; }
  if (pos.y > world.height - r) { pos.y = world.height - r; hit = true; }
  return hit;
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  // Slab test: does the segment cross the rect at all?
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.w - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.h - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Line of sight between two points: false when a building stands between them. */
export function lineOfSight(world, x1, y1, x2, y2) {
  for (const b of world.buildings) {
    if (segmentHitsRect(x1, y1, x2, y2, b)) return false;
  }
  return true;
}
