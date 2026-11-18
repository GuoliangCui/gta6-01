// Neon Harbor — every tuning number and colour in one place. The simulation runs in a fixed
// 1280x720 logical view over a larger world; the renderer scales the view to the window, so no
// rule below depends on the screen size. All distances are world pixels, all times seconds.

export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };
export const WORLD = { width: 2640, height: 1840 };

/** Road centre lines: five north-south avenues, three east-west streets, one harbour edge. */
export const AVENUES = [280, 760, 1240, 1720, 2200];
export const STREETS = [300, 780, 1260];
export const ROAD_W = 120;
export const LANE = 29; // lane offset from a road centre line (right-hand traffic)
export const PROMENADE_Y = 1470; // pavement strip along the water
export const WATER_Y = 1560; // the harbour starts here

export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  runSpeed: 268,
  maxHealth: 100,
  regenDelay: 5,
  regenRate: 7,
};

export const CAR_TYPES = {
  compact: { w: 34, h: 19, maxSpeed: 305, accel: 250, colour: '#e2574c' },
  sedan: { w: 38, h: 20, maxSpeed: 345, accel: 265, colour: '#4c8de2' },
  taxi: { w: 38, h: 20, maxSpeed: 330, accel: 255, colour: '#f2b234' },
  van: { w: 42, h: 22, maxSpeed: 282, accel: 225, colour: '#9aa5b1' },
  sport: { w: 38, h: 19, maxSpeed: 438, accel: 330, colour: '#ff7a59' },
  police: { w: 38, h: 20, maxSpeed: 408, accel: 305, colour: '#f4f6f8' },
};

export const TRAFFIC_COUNT = 12;
export const PARKED_COUNT = 10;
export const PED_COUNT = 26;

export const WANTED = {
  witnessPoliceRange: 330,
  witnessPedRange: 155,
  sightRange: 430, // police spot the player inside this with line of sight
  unseenGrace: 7, // seconds unseen before the heat starts cooling
  coolPerStar: 5, // seconds unseen per star shed
  spawnInterval: 0.55,
  spawnMin: 620,
  spawnMax: 800,
  arrestRange: 84,
  arrestFill: 2.1, // seconds of close police contact to be busted
  arrestDrain: 1.4,
  /** Police cars on the street per star level (index 0 unused). */
  force: [0, 2, 3, 5, 7, 9],
};

export const GUN = {
  mag: 12,
  reload: 1.1,
  interval: 0.17,
  range: 540,
  damage: 34,
  spread: 0.028,
};

export const MISSIONS = {
  m1Time: 200,
  m1Pay: 300,
  m2Pay: 500,
  m2MinHealth: 25,
  m3Pay: 800,
  rearmDistance: 320,
};

export const SAVE_KEY = 'neon-harbor.save.v1';

export const PALETTE = {
  blockGround: '#d8c8a4',
  sidewalk: '#bfb091',
  park: '#7db45e',
  parkPath: '#cbb98f',
  road: '#3d4149',
  roadEdge: '#2f333a',
  laneMark: '#e9e4d2',
  water: '#2f7f9d',
  waterLight: '#3d94b2',
  pier: '#9a6b46',
  pierDark: '#7d5636',
  sand: '#e3d3a8',
  walls: ['#f2d5b8', '#eeb9a3', '#f4e3c1', '#bcd8c0', '#b9d2e8', '#f0c6cf', '#e8d8f0', '#f6e7b2'],
  roofs: ['#c96f4a', '#b85c48', '#a8a29a', '#7d9b76', '#5f83a6', '#a66a7d', '#7a6a9e', '#c2a24d'],
  player: '#fdfdfd',
  playerTrim: '#e2574c',
  ped: ['#e2b13c', '#7fb069', '#5aa9e6', '#ef6f6c', '#b388eb', '#f4f1de', '#81b29a', '#e07a5f'],
  policeLightA: '#e23b3b',
  policeLightB: '#3b6fe2',
  marker: '#ffc93c',
  markerPulse: '#ff9f1c',
  text: '#fdfbf5',
  panel: 'rgba(16,20,28,0.72)',
  health: '#69c24a',
  healthLow: '#e2574c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
