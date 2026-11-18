// Neon Harbor — every tuning number, colour and city dimension in one place.
// The view is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the player's screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/**
 * The city grid: blocks of BLOCK pixels separated by roads of ROAD pixels.
 * Land runs from y=0 to the waterfront; WATER_DEPTH pixels of harbour water
 * (with wooden piers) lie south of the promenade.
 */
export const CITY = {
  cols: 6,
  rows: 5,
  block: 230,
  road: 92,
  waterDepth: 300,
};

/** Distance between the starts of neighbouring blocks (one block plus one road). */
export const PITCH = CITY.block + CITY.road;
/** Land width and height in world pixels, and the full height including the harbour. */
export const LAND_W = CITY.cols * PITCH + CITY.road;
export const LAND_H = CITY.rows * PITCH + CITY.road;
export const WORLD_W = LAND_W;
export const WORLD_H = LAND_H + CITY.waterDepth;

export const PLAYER = {
  radius: 11,
  walkSpeed: 152,
  runSpeed: 238,
  maxHealth: 100,
  startMoney: 120,
  fireInterval: 0.22,
  magazine: 12,
  reloadTime: 0.9,
  bulletRange: 430,
  bulletDamage: 34,
};

/** Crime heat: how many wanted stars each act earns, and how hiding decays them. */
export const WANTED = {
  stealCar: 1,
  stealMovingCar: 1,
  fireGun: 1,
  hitPedestrian: 1,
  killPedestrian: 1,
  hitPolice: 1,
  max: 5,
  /** Seconds unseen before one star drops; higher stars cool off more slowly. */
  hideSecondsPerStar: 2.6,
};

/** Police strength by wanted level: cars on the hunt and how hard they press. */
export const POLICE_BY_STAR = [
  { cars: 0, officersShoot: false },
  { cars: 1, officersShoot: false },
  { cars: 2, officersShoot: false },
  { cars: 3, officersShoot: true },
  { cars: 4, officersShoot: true },
  { cars: 6, officersShoot: true },
];

export const TRAFFIC = { cars: 12, speed: 168 };
export const PEDESTRIANS = { count: 24, speed: 62 };
export const PARKED_CARS = 16;

/** Car handling shared by every drivable car; individual models scale these. */
export const CAR = {
  length: 46,
  width: 21,
  radius: 16,
  accel: 265,
  brake: 430,
  reverseMax: 145,
  drag: 0.55,
  turnRate: 2.35,
  maxHealth: 100,
};

/** Sun-soaked palette: warm pavement, pastel blocks, teal harbour water. */
export const PALETTE = {
  water: '#1f7d8c',
  waterDeep: '#176878',
  sand: '#e6cf9e',
  promenade: '#d9c39a',
  sidewalk: '#cfc7b8',
  blockGround: '#bfb49f',
  parkGrass: '#69a84f',
  parkPath: '#d9c39a',
  plaza: '#cbb693',
  road: '#3f434c',
  roadEdge: '#565d68',
  laneMark: '#e8e2d0',
  crosswalk: '#ddd6c4',
  buildingSide: '#8a6f5c',
  roofA: '#f2d5a0',
  roofB: '#e8a87c',
  roofC: '#d97b6c',
  roofD: '#9fc6c5',
  roofE: '#f4ead8',
  treeTop: '#3e7d3a',
  treeTrunk: '#6d4c33',
  player: '#0f766e',
  hudPanel: 'rgba(16, 22, 30, 0.72)',
  hudText: '#f5efe2',
  hudAccent: '#ffb454',
  danger: '#ef4444',
  money: '#7ee787',
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

/** localStorage keys for the save file. */
export const SAVE_KEY = 'neon-harbor.save.v1';
