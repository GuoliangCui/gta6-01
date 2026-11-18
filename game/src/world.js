// The city of Neon Harbor: a sunny harbour town generated once from the seed. A grid of five
// avenues and three streets leaves blocks for pastel buildings with neon signs; the south
// block row faces a promenade, two wooden piers and the water. Landmarks the story needs —
// Café Sol, the police headquarters, the clinic, Taller Brisa's garage, Almacén 9, Hotel
// Palma and Marina's pier — are placed by hand; everything else is filled in by the seed.
import {
  AVENUES, STREETS, ROAD_W, WORLD, WATER_Y, PROMENADE_Y,
} from './config.js';

const BLOCK_COLS = [[0, 220], [340, 700], [820, 1180], [1300, 1660], [1780, 2140], [2260, 2640]];
const BLOCK_ROWS = [[0, 240], [360, 720], [840, 1200], [1320, 1470]];
const NAMES = [
  'CAFÉ SOL', 'HOTEL AZUL', 'LIBROS', 'GYM FUERTE', 'PIZZA VOLCÁN', 'BAR TIBURÓN',
  'PAWN & CO', 'HOTEL PALMA', 'FARMACIA MAR', 'CINE LUMEN', 'PANADERÍA LUZ', 'BAR PUERTO',
  'TIENDA NOVA', 'CLUB CORAL', 'OFICINAS BRISA', 'MERCADO SOL', 'TATTOO ONDA', 'FLORISTERÍA',
];
const PIERS = [
  { x: 660, y: WATER_Y, w: 240, h: 210 },
  { x: 1560, y: WATER_Y, w: 240, h: 210 },
];

function rectsOverlap(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function createWorld(rng) {
  const buildings = [];
  const blocks = [];
  const parking = []; // flat open lots (asphalt) — also where spare cars sit
  const parkingSpots = []; // {x, y, angle} an enterable parked car can wait at
  const trees = [];
  let nameIndex = rng.int(0, NAMES.length - 1);

  const specials = [
    { x: 430, y: 460, w: 190, h: 150, name: 'CAFÉ SOL', key: 'cafe' },
    { x: 1380, y: 36, w: 220, h: 150, name: 'POLICÍA MUNICIPAL', key: 'hq' },
    { x: 24, y: 900, w: 168, h: 190, name: 'CLÍNICA SOL', key: 'clinic' },
    { x: 1840, y: 890, w: 240, h: 170, name: 'TALLER BRISA', key: 'garage' },
    { x: 850, y: 1330, w: 300, h: 118, name: 'ALMACÉN 9', key: 'warehouse' },
    { x: 2330, y: 36, w: 240, h: 150, name: 'HOTEL PALMA', key: 'hotel' },
  ];
  const byKey = {};
  for (const s of specials) {
    const b = {
      ...s, height: 44, wall: '#f4e3c1', roof: '#b85c48', seed: rng.int(0, 99999),
    };
    buildings.push(b);
    byKey[s.key] = b;
  }

  for (let c = 0; c < BLOCK_COLS.length; c += 1) {
    for (let r = 0; r < BLOCK_ROWS.length; r += 1) {
      const [x0, x1] = BLOCK_COLS[c];
      const [y0, y1] = BLOCK_ROWS[r];
      const block = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'buildings' };
      if (c === 2 && r === 1) block.kind = 'park';
      blocks.push(block);
      if (block.kind === 'park') continue;
      const lotCols = 2;
      const lotRows = block.h > 200 ? 2 : 1;
      for (let i = 0; i < lotCols; i += 1) {
        for (let j = 0; j < lotRows; j += 1) {
          const lot = {
            x: x0 + (block.w / lotCols) * i + 15,
            y: y0 + (block.h / lotRows) * j + 13,
            w: block.w / lotCols - 30,
            h: block.h / lotRows - 26,
          };
          if (specials.some((s) => rectsOverlap(lot, s, 6))) continue;
          if (rng.chance(0.8)) {
            const b = {
              x: lot.x + rng.range(0, 14),
              y: lot.y + rng.range(0, 10),
              w: lot.w - rng.range(0, 26),
              h: lot.h - rng.range(0, 18),
              height: rng.range(24, 68),
              wall: rng.pick(['#f2d5b8', '#eeb9a3', '#f4e3c1', '#bcd8c0', '#b9d2e8', '#f0c6cf', '#e8d8f0', '#f6e7b2']),
              roof: rng.pick(['#c96f4a', '#b85c48', '#a8a29a', '#7d9b76', '#5f83a6', '#a66a7d', '#7a6a9e', '#c2a24d']),
              name: rng.chance(0.34) ? NAMES[nameIndex++ % NAMES.length] : null,
              key: null,
              seed: rng.int(0, 99999),
            };
            buildings.push(b);
          } else {
            parking.push(lot);
            parkingSpots.push({ x: lot.x + lot.w * 0.3, y: lot.y + lot.h / 2, angle: 0 });
            parkingSpots.push({ x: lot.x + lot.w * 0.72, y: lot.y + lot.h / 2, angle: 0 });
          }
        }
      }
    }
  }

  // Trees: a row along the promenade, a grove in the park, a few scattered on dry land.
  for (let x = 60; x < WORLD.width - 40; x += 92) trees.push({ x: x + rng.range(-8, 8), y: PROMENADE_Y + 44, r: rng.range(10, 15) });
  for (let i = 0; i < 15; i += 1) trees.push({ x: rng.range(850, 1150), y: rng.range(390, 690), r: rng.range(11, 17) });
  for (let i = 0; i < 14; i += 1) trees.push({ x: rng.range(30, WORLD.width - 30), y: rng.range(30, 1440), r: rng.range(9, 13) });

  const fountain = { x: 1000, y: 540, r: 34 };
  const spots = {
    marina: { x: 780, y: 1700 }, // end of the west pier
    marinaStand: { x: 780, y: 1635 }, // where Marina waits
    cafeDoor: { x: byKey.cafe.x + byKey.cafe.w / 2, y: byKey.cafe.y + byKey.cafe.h + 30 },
    hqFront: { x: byKey.hq.x + byKey.hq.w / 2, y: byKey.hq.y + byKey.hq.h + 42 },
    clinicFront: { x: 238, y: byKey.clinic.y + byKey.clinic.h / 2 },
    garageYard: { x: byKey.garage.x + byKey.garage.w / 2, y: byKey.garage.y + byKey.garage.h + 62 },
    warehouseYard: { x: 1000, y: 1512 },
    hotelFront: { x: 2228, y: 210 },
    park: { x: 1000, y: 540 },
  };

  return {
    buildings, blocks, parking, parkingSpots, trees, fountain, piers: PIERS, spots, byKey,
  };
}

/** Which road is the point on, if any? Avenues run along y, streets along x. */
export function roadAt(x, y) {
  for (let i = 0; i < AVENUES.length; i += 1) {
    if (Math.abs(x - AVENUES[i]) <= ROAD_W / 2) return { axis: 'y', index: i, centre: AVENUES[i] };
  }
  for (let i = 0; i < STREETS.length; i += 1) {
    if (Math.abs(y - STREETS[i]) <= ROAD_W / 2) return { axis: 'x', index: i, centre: STREETS[i] };
  }
  return null;
}

export function overWater(world, x, y) {
  if (y < WATER_Y) return false;
  return !world.piers.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

/** Push a circle (body has x/y, optional vx/vy) out of buildings, the fountain and the sea. */
export function collideCircle(world, body, radius) {
  let impact = 0;
  const speedBefore = Math.hypot(body.vx ?? 0, body.vy ?? 0);
  for (const b of world.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x += (dx / d) * (radius - d);
        body.y += (dy / d) * (radius - d);
      } else {
        body.y = b.y + b.h + radius;
      }
      impact = Math.max(impact, speedBefore);
    }
  }
  const f = world.fountain;
  const fdx = body.x - f.x;
  const fdy = body.y - f.y;
  const fd = Math.hypot(fdx, fdy);
  if (fd < f.r + radius && fd > 0.001) {
    body.x = f.x + (fdx / fd) * (f.r + radius);
    body.y = f.y + (fdy / fd) * (f.r + radius);
    impact = Math.max(impact, speedBefore);
  }
  if (body.y + radius * 0.4 > WATER_Y && overWater(world, body.x, body.y + radius * 0.4)) {
    body.y = Math.min(body.y, WATER_Y - radius * 0.4 - 0.1);
    impact = Math.max(impact, speedBefore * 0.7);
  }
  if (body.x < radius) body.x = radius;
  if (body.y < radius) body.y = radius;
  if (body.x > WORLD.width - radius) body.x = WORLD.width - radius;
  if (body.y > WORLD.height - radius) body.y = WORLD.height - radius;
  return impact;
}

/** Segment versus one axis-aligned rect (slab test). */
function segHitsRect(x1, y1, x2, y2, b) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < b.x || x1 > b.x + b.w) return false;
  } else {
    let ta = (b.x - x1) / dx;
    let tb = (b.x + b.w - x1) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < b.y || y1 > b.y + b.h) return false;
  } else {
    let ta = (b.y - y1) / dy;
    let tb = (b.y + b.h - y1) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** True when no building blocks the view between two points. */
export function losClear(world, x1, y1, x2, y2) {
  for (const b of world.buildings) {
    if (segHitsRect(x1, y1, x2, y2, b)) return false;
  }
  return true;
}

/** Where a ray first hits a building, for gun tracers and impact sparks. */
export function rayHit(world, x, y, angle, maxRange) {
  let best = maxRange;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const b of world.buildings) {
    if (!segHitsRect(x, y, x + cos * best, y + sin * best, b)) continue;
    let lo = 0;
    let hi = best;
    for (let i = 0; i < 14; i += 1) {
      const mid = (lo + hi) / 2;
      if (segHitsRect(x, y, x + cos * mid, y + sin * mid, b)) hi = mid;
      else lo = mid;
    }
    best = hi;
  }
  return { dist: best, x: x + cos * best, y: y + sin * best };
}

/** A random lane point on the road net, optionally kept within a distance ring of (px, py). */
export function randomRoadPoint(rng, px, py, minD, maxD) {
  for (let tries = 0; tries < 16; tries += 1) {
    let x;
    let y;
    if (rng.chance(0.55)) {
      x = rng.pick(AVENUES) + (rng.chance(0.5) ? 29 : -29);
      y = rng.range(60, WATER_Y - 60);
    } else {
      y = rng.pick(STREETS) + (rng.chance(0.5) ? 29 : -29);
      x = rng.range(60, WORLD.width - 60);
    }
    const d = Math.hypot(x - px, y - py);
    if (minD === undefined || (d >= minD && d <= maxD)) return { x, y };
  }
  return { x: AVENUES[0] + 29, y: 120 };
}

/** Sidewalk loops pedestrians stroll around: one rectangle hugging each block, plus the promenade. */
export function sidewalkLoops(world) {
  const loops = world.blocks.map((b) => ({
    x: b.x + 11, y: b.y + 11, w: b.w - 22, h: b.h - 22,
  }));
  loops.push({ x: 16, y: PROMENADE_Y + 8, w: WORLD.width - 32, h: 74 });
  return loops;
}
