// Neon Harbor tuning: every number the simulation lives by, in one place. The world is a
// sunlit harbour city drawn top-down; units are pixels and seconds throughout.

/** The fixed simulation step; the main loop accumulates real time into whole steps. */
export const STEP = 1 / 60;

/** World size in pixels. The sea fills everything south of WATER_Y. */
export const WORLD_WIDTH = 3600;
export const WORLD_HEIGHT = 2700;
export const WATER_Y = 2520;

/** Road centre lines: four avenues run north-south, three streets and the harbour
 *  avenue run east-west. Roads are ROAD_WIDTH wide, centred on these lines. */
export const ROADS_V = [420, 1260, 2100, 2940];
export const ROADS_H = [380, 1080, 1780, 2380];
export const ROAD_WIDTH = 116;

/** The on-foot player. */
export const PLAYER_RADIUS = 13;
export const PLAYER_SPEED = 196;
export const PLAYER_SPRINT = 268;
export const PLAYER_HEALTH = 100;
/** Health per second regained after CALM_TIME seconds without taking damage. */
export const PLAYER_REGEN = 9;
export const CALM_TIME = 5;

/** Cars: one arcade model shared by the player's ride, traffic and police. */
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;
export const CAR_ACCEL = 340;
export const CAR_BRAKE = 520;
export const CAR_REVERSE = 150;
export const CAR_DRAG = 0.55;
export const CAR_TURN = 2.8;
/** Top speeds: a family car, the marked convertible, a police interceptor. */
export const CAR_TOP_SPEED = 430;
export const CAR_TOP_SPORT = 540;
export const CAR_TOP_COP = 478;

/** The pistol: hitscan, a tracer line, three hits to drop a person. */
export const GUN_RANGE = 430;
export const GUN_DAMAGE = 34;
export const GUN_INTERVAL = 0.24;
export const GUN_MAGAZINE = 12;
export const GUN_RELOAD = 1.1;

/** Wanted tuning: stars 0..5. A crime only counts when a witness sees it (see police.js). */
export const WITNESS_COP_RANGE = 560;
export const WITNESS_PED_RANGE = 270;
/** Seconds with no pursuer seeing the player before one star fades. */
export const EVADE_TIME = 5;
/** Police cars the city fields per star, and how fast replacements roll in. */
export const COPS_PER_STAR = [0, 2, 3, 4, 6, 8];
export const COP_SPAWN_INTERVAL = 0.55;
/** Seconds a police officer must stay on top of the player to complete an arrest. */
export const BUST_TIME = 1.5;

/** Ambient life: cars and pedestrians the city keeps around the player. */
export const TRAFFIC_TARGET = 9;
export const PED_TARGET = 14;

/** Save slot key for localStorage (money, story progress, position). */
export const SAVE_KEY = 'neon-harbor-save-v1';
