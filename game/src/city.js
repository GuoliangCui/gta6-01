// Neon Harbor's city: a seeded grid of blocks, roads, buildings, a park, a plaza,
// parking lots, warehouses and a harbour with piers. Everything the simulation
// collides with and the renderer draws comes from this one generated layout.
import { CITY, LAND_H, LAND_W, PALETTE, PITCH } from './config.js';

const ROAD = CITY.road;
const BLOCK = CITY.block;

/** The rectangle of block (col, row): the land between the roads around it. */
export function blockRect(col, row) {
  return { x: col * PITCH + ROAD, y: row * PITCH + ROAD, w: BLOCK, h: BLOCK };
}

/** X of the driving lane on vertical road i for a heading: +1 drives south, -1 north. */
export function laneCenterX(roadIndex, heading) {
  return roadIndex * PITCH + (heading > 0 ? ROAD * 0.3 : ROAD * 0.7);
}

/** Y of the driving lane on horizontal road j for a heading: +1 drives east, -1 west. */
export function laneCenterY(roadIndex, heading) {
  return roadIndex * PITCH + (heading > 0 ? ROAD * 0.7 : ROAD * 0.3);
}

/** Centre point of the intersection of vertical road i and horizontal road j. */
export function intersectionCenter(roadI, roadJ) {
  return { x: roadI * PITCH + ROAD / 2, y: roadJ * PITCH + ROAD / 2 };
}

const ROOFS = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];

/** What each special block holds; every other block is ordinary buildings. */
const SPECIAL_BLOCKS = {
  '0,0': 'hospital',
  '3,0': 'police',
  '1,1': 'cafe',
  '2,1': 'park',
  '4,1': 'plaza',
  '2,3': 'parking',
  '1,4': 'parking',
  '4,4': 'docks',
  '5,4': 'warehouse',
  '5,0': 'garage',
  '0,3': 'diner',
};

function addBuilding(city, rng, x, y, w, h, options = {}) {
  const building = {
    x, y, w, h,
    height: options.height ?? rng.range(26, 120),
    roof: options.roof ?? rng.pick(ROOFS),
    name: options.name ?? null,
    awning: options.awning ?? null,
  };
  city.buildings.push(building);
  city.solids.push({ x, y, w, h });
  return building;
}

/** Fill an ordinary block with a 2x2 of lots; a skipped lot becomes parking spots. */
function fillBuildingBlock(city, rng, rect, block) {
  const margin = 16;
  const gap = 12;
  const lotW = (rect.w - margin * 2 - gap) / 2;
  const lotH = (rect.h - margin * 2 - gap) / 2;
  for (let a = 0; a < 2; a += 1) {
    for (let b = 0; b < 2; b += 1) {
      const lx = rect.x + margin + a * (lotW + gap);
      const ly = rect.y + margin + b * (lotH + gap);
      if (rng.chance(0.16)) {
        // An open lot: two kerbside parking spots the player can help themselves to.
        city.parkSpots.push({ x: lx + lotW / 2, y: ly + lotH / 2 - 16, angle: 0 });
        city.parkSpots.push({ x: lx + lotW / 2, y: ly + lotH / 2 + 16, angle: 0 });
        continue;
      }
      const inset = rng.range(2, 9);
      addBuilding(city, rng, lx + inset, ly + inset, lotW - inset * 2, lotH - inset * 2);
    }
  }
  block.kind = 'buildings';
}

/** A car park: marked bays in two rows, most of them filled by the simulation. */
function fillParkingBlock(city, rng, rect, block) {
  block.kind = 'parking';
  for (let i = 0; i < 5; i += 1) {
    const x = rect.x + 34 + i * 40;
    city.parkSpots.push({ x, y: rect.y + 52, angle: Math.PI / 2 });
    city.parkSpots.push({ x, y: rect.y + rect.h - 52, angle: -Math.PI / 2 });
  }
}

/** The park: lawns, a crossing path and a loose grid of palms and shade trees. */
function fillParkBlock(city, rng, rect, block) {
  block.kind = 'park';
  for (let i = 0; i < 16; i += 1) {
    const x = rect.x + rng.range(22, rect.w - 22);
    const y = rect.y + rng.range(22, rect.h - 22);
    if (Math.abs(x - (rect.x + rect.w / 2)) < 16 || Math.abs(y - (rect.y + rect.h / 2)) < 16) continue;
    city.trees.push({ x, y, r: rng.range(13, 20) });
  }
}

/** The plaza: open paving, corner trees and a fountain the traffic must respect. */
function fillPlazaBlock(city, rng, rect, block) {
  block.kind = 'plaza';
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  city.fountain = { x: cx, y: cy, r: 30 };
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    city.trees.push({ x: cx + dx * (rect.w / 2 - 26), y: cy + dy * (rect.h / 2 - 26), r: 15 });
  }
  city.parkSpots.push({ x: rect.x + 40, y: cy, angle: 0 });
  city.parkSpots.push({ x: rect.x + rect.w - 40, y: cy, angle: Math.PI });
}

/** Two long warehouses and a yard of crates down by the water. */
function fillWarehouseBlock(city, rng, rect, block) {
  block.kind = 'warehouse';
  addBuilding(city, rng, rect.x + 14, rect.y + 16, rect.w - 28, 74, { height: 30, roof: '#b08968', name: 'Breakwater Storage' });
  addBuilding(city, rng, rect.x + 14, rect.y + 118, rect.w - 28, 62, { height: 24, roof: '#9c6644' });
  for (let i = 0; i < 5; i += 1) {
    const x = rect.x + 22 + i * 42;
    const y = rect.y + rect.h - 34;
    city.solids.push({ x, y, w: 26, h: 22 });
    city.crates.push({ x, y, w: 26, h: 22 });
  }
}

/** Low dock offices and crate stacks on the waterfront block. */
function fillDocksBlock(city, rng, rect, block) {
  block.kind = 'docks';
  addBuilding(city, rng, rect.x + 18, rect.y + 18, 92, 64, { height: 18, roof: '#f4ead8', name: 'Harbour Office' });
  addBuilding(city, rng, rect.x + 128, rect.y + 18, 84, 64, { height: 16, roof: '#9fc6c5' });
  for (let i = 0; i < 4; i += 1) {
    const x = rect.x + 26 + i * 52;
    const y = rect.y + 140;
    city.solids.push({ x, y, w: 30, h: 24 });
    city.crates.push({ x, y, w: 30, h: 24 });
  }
  city.parkSpots.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h - 30, angle: 0 });
}

/** A named landmark block: the landmark building plus one small annex, kept clear of it. */
function fillNamedBlock(city, rng, rect, block, landmark, annex) {
  addBuilding(city, rng, rect.x + landmark.dx, rect.y + landmark.dy, landmark.w, landmark.h, landmark);
  if (annex) addBuilding(city, rng, rect.x + annex.dx, rect.y + annex.dy, annex.w, annex.h, annex);
}

/** Generate the whole city from a seeded random stream. */
export function createCity(rng) {
  const city = {
    buildings: [],
    solids: [],
    crates: [],
    trees: [],
    parkSpots: [],
    blocks: [],
    fountain: null,
    piers: [],
    pois: {},
  };

  for (let row = 0; row < CITY.rows; row += 1) {
    for (let col = 0; col < CITY.cols; col += 1) {
      const rect = blockRect(col, row);
      const kind = SPECIAL_BLOCKS[`${col},${row}`] ?? 'buildings';
      const block = { col, row, ...rect, kind };
      city.blocks.push(block);
      if (kind === 'park') fillParkBlock(city, rng, rect, block);
      else if (kind === 'plaza') fillPlazaBlock(city, rng, rect, block);
      else if (kind === 'parking') fillParkingBlock(city, rng, rect, block);
      else if (kind === 'warehouse') fillWarehouseBlock(city, rng, rect, block);
      else if (kind === 'docks') fillDocksBlock(city, rng, rect, block);
      else if (kind === 'cafe') {
        fillNamedBlock(city, rng, rect, block,
          { dx: 60, dy: 74, w: 110, h: 66, height: 15, roof: '#e2725b', name: 'Cafe Lumen', awning: '#ffb454' },
          { dx: 20, dy: 158, w: 80, h: 46, height: 22 });
      } else if (kind === 'diner') {
        fillNamedBlock(city, rng, rect, block,
          { dx: 52, dy: 80, w: 126, h: 60, height: 14, roof: '#f2d5a0', name: 'Sunset Diner', awning: '#e2725b' },
          { dx: 140, dy: 158, w: 70, h: 46, height: 20 });
      } else if (kind === 'hospital') {
        fillNamedBlock(city, rng, rect, block,
          { dx: 34, dy: 30, w: 162, h: 96, height: 64, roof: '#f4ead8', name: 'Harbor General' },
          { dx: 20, dy: 152, w: 84, h: 50, height: 18 });
      } else if (kind === 'police') {
        fillNamedBlock(city, rng, rect, block,
          { dx: 40, dy: 34, w: 150, h: 92, height: 44, roof: '#9fc6c5', name: 'NHPD Central' },
          { dx: 116, dy: 152, w: 88, h: 50, height: 16 });
      } else if (kind === 'garage') {
        fillNamedBlock(city, rng, rect, block,
          { dx: 44, dy: 60, w: 142, h: 84, height: 20, roof: '#b08968', name: 'Harborlight Garage', awning: '#0f766e' },
          { dx: 20, dy: 160, w: 80, h: 44, height: 14 });
      } else {
        fillBuildingBlock(city, rng, rect, block);
      }
    }
  }

  // Piers jutting into the harbour from the promenade, in front of three blocks.
  for (const col of [1, 3, 4]) {
    const rect = blockRect(col, CITY.rows - 1);
    city.piers.push({ x: rect.x + rect.w / 2 - 27, y: LAND_H, w: 54, h: 196 });
  }

  const front = (col, row, side = 'south') => {
    const rect = blockRect(col, row);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (side === 'south') return { x: cx, y: rect.y + rect.h + 14 };
    if (side === 'north') return { x: cx, y: rect.y - 14 };
    return { x: cx, y: cy };
  };

  city.pois = {
    cafe: front(1, 1),
    diner: front(0, 3, 'north'),
    garage: front(5, 0),
    warehouse: front(5, 4, 'west'),
    hospital: front(0, 0),
    police: front(3, 0),
    plaza: front(4, 1, 'centre'),
    pier: { x: blockRect(4, 4).x + BLOCK / 2, y: LAND_H + 168 },
    playerStart: { x: blockRect(1, 1).x + BLOCK / 2, y: blockRect(1, 1).y + BLOCK + 40 },
  };
  city.pois.warehouse.x = blockRect(5, 4).x - 14;

  return city;
}

/** True when a point is open water (the harbour south of the promenade, off a pier). */
export function isWaterAt(city, x, y) {
  if (y <= LAND_H) return false;
  for (const pier of city.piers) {
    if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
  }
  return true;
}

/** The sidewalk corner points of every block: the pedestrian waypoint network. */
export function sidewalkCorners(city) {
  const points = [];
  for (const block of city.blocks) {
    const inset = 9;
    points.push(
      { x: block.x + inset, y: block.y + inset, block },
      { x: block.x + block.w - inset, y: block.y + inset, block },
      { x: block.x + block.w - inset, y: block.y + block.h - inset, block },
      { x: block.x + inset, y: block.y + block.h - inset, block },
    );
  }
  return points;
}
