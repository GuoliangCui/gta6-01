// The story: three jobs that chain cafe owner Mara Voss's errands into dockmaster
// Ren Okafor's fight for the harbour. Each mission is a small state machine —
// briefing dialogue, one or two objectives, a payoff dialogue — and a timed-out
// job stays dead until the player leaves the area, so it never nags twice.
import { addWanted } from './police.js';
import { distance } from './geom.js';

/** Distance from a failed job's trigger that re-arms it. */
const REARM_DISTANCE = 320;
/** Seconds to carry the case across town in Dock Run. */
const DELIVERY_TIME = 200;
/** The Vireo must arrive with more than this much health to be worth fencing. */
const DELIVERY_MIN_HEALTH = 25;

export const MISSION_DEFS = [
  {
    id: 'dock-run',
    name: 'Dock Run',
    contact: 'Mara Voss',
    trigger: 'cafe',
    reward: 300,
    intro: [
      { who: 'Mara Voss', text: 'Juno. Sit. You look like someone who can drive and not ask questions.' },
      { who: 'Juno', text: 'I can do both of those things separately.' },
      { who: 'Mara Voss', text: 'A locked case came in on the morning boat. It sits on the south pier, and it is getting warmer by the minute.' },
      { who: 'Mara Voss', text: 'Fetch it, then take it to the Sunset Diner across town. Fast, but not famous. Understand?' },
      { who: 'Juno', text: 'Fast, not famous. On it.' },
    ],
    outro: [
      { who: 'Mara Voss', text: 'The diner called. Case delivered, nobody famous. That is exactly my kind of help.' },
      { who: 'Mara Voss', text: 'Here is your cut. Come back tomorrow — the harbour has been restless.' },
    ],
  },
  {
    id: 'borrowed-wings',
    name: 'Borrowed Wings',
    contact: 'Mara Voss',
    trigger: 'cafe',
    reward: 500,
    intro: [
      { who: 'Mara Voss', text: 'See the coral Vireo GT parked at the plaza? It belongs to a dealer who owes me four months of rent.' },
      { who: 'Juno', text: 'And you want it… borrowed.' },
      { who: 'Mara Voss', text: 'Repossessed. Take it to Harborlight Garage, north-east corner. My cousin strips the tracker there.' },
      { who: 'Mara Voss', text: 'The alarm will sing and the police will come. Bring it back whole, Juno — a wreck is worth nothing.' },
    ],
    outro: [
      { who: 'Mara Voss', text: 'Whole, shiny, and only slightly illegal. My cousin says the tracker is already in the bay.' },
      { who: 'Mara Voss', text: 'You have a gift. One more favour — Ren at the harbour needs hands, not questions.' },
    ],
  },
  {
    id: 'harbor-cleanup',
    name: 'Harbor Cleanup',
    contact: 'Ren Okafor',
    trigger: 'warehouse',
    reward: 800,
    intro: [
      { who: 'Ren Okafor', text: 'You are Mara\'s driver? Then you are the closest thing to help this dock has.' },
      { who: 'Ren Okafor', text: 'The Breakers took Breakwater Storage last week. Four of them, loud and armed, scaring every crew off the pier.' },
      { who: 'Juno', text: 'And you want them… tidied.' },
      { who: 'Ren Okafor', text: 'I want my harbour back. Clear them out, then come see me. The dock pays its debts.' },
    ],
    outro: [
      { who: 'Ren Okafor', text: 'Quiet docks. Do you hear that? That is the sound of a working harbour.' },
      { who: 'Ren Okafor', text: 'Neon Harbor owes you, Juno. Mara, the crews, me — we will not forget it.' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,
    phase: 'available', // available | briefing | active | outro | cooldown | complete
    objective: null,
    timer: null,
    data: {},
    cooldownPoi: null,
    homeSpot: null,
  };
}

/** Where the current job can be picked up, or null when no job is waiting. */
export function missionTrigger(state) {
  const m = state.missions;
  if (m.phase !== 'available' || m.index >= MISSION_DEFS.length) return null;
  const def = MISSION_DEFS[m.index];
  const poi = state.city.pois[def.trigger];
  return { x: poi.x, y: poi.y, def };
}

/** Open the briefing dialogue for the current job. */
export function startBriefing(state) {
  const m = state.missions;
  const def = MISSION_DEFS[m.index];
  m.phase = 'briefing';
  state.dialogue = { lines: def.intro, index: 0, after: `start-${def.id}` };
}

/** A dialogue just ended: start the job it briefed, or close out the one it ended. */
export function onDialogueFinished(state, after) {
  const m = state.missions;
  const def = MISSION_DEFS[m.index];
  if (after === `start-${def.id}`) {
    m.phase = 'active';
    activateMission(state, def);
  } else if (after === `done-${def.id}`) {
    m.index += 1;
    m.objective = null;
    m.timer = null;
    m.data = {};
    m.phase = m.index >= MISSION_DEFS.length ? 'complete' : 'available';
    state.dirtySave = true;
  }
}

/** Set up the first objective (and any actors) for a job that just started. */
function activateMission(state, def) {
  const m = state.missions;
  const pois = state.city.pois;
  m.data = {};
  if (def.id === 'dock-run') {
    m.data.stage = 'pickup';
    m.objective = { x: pois.pier.x, y: pois.pier.y, radius: 52, kind: 'pickup', text: 'Pick up the locked case on the south pier' };
  } else if (def.id === 'borrowed-wings') {
    const car = state.cars.find((c) => c.missionTarget);
    m.data.stolen = false;
    m.homeSpot = { x: car.x, y: car.y, angle: car.angle };
    m.objective = { x: car.x, y: car.y, radius: 60, kind: 'steal', text: 'Steal the coral Vireo GT at the plaza', carId: car.id };
  } else if (def.id === 'harbor-cleanup') {
    state.spawnGang();
    m.objective = { x: pois.warehouse.x, y: pois.warehouse.y, radius: 90, kind: 'clear', text: 'Clear the Breakers out of Breakwater Storage' };
  }
}

/** Pay the reward and roll into the payoff dialogue. */
function completeMission(state, def) {
  const m = state.missions;
  state.player.money += def.reward;
  state.stats.earned += def.reward;
  state.dirtySave = true;
  pushFloater(state, state.player.x, state.player.y - 26, `+$${def.reward}`, '#7ee787');
  m.phase = 'outro';
  m.objective = null;
  m.timer = null;
  state.dialogue = { lines: def.outro, index: 0, after: `done-${def.id}` };
}

/** Kill the current job without pay; it re-arms only once the player leaves. */
function failMission(state, def, reason, poi) {
  const m = state.missions;
  m.phase = 'cooldown';
  m.objective = null;
  m.timer = null;
  m.data = {};
  m.cooldownPoi = poi;
  state.message = { text: `Job failed — ${reason}`, sub: 'Leave the area and the job will come up again.', t: 0, ttl: 3.6 };
}

/** The simulation tells the missions when the player climbs into a car. */
export function onPlayerEnteredCar(state, car) {
  const m = state.missions;
  if (m.phase !== 'active' || !car.missionTarget || m.data.stolen) return;
  m.data.stolen = true;
  addWanted(state, 2);
  const garage = state.city.pois.garage;
  m.objective = { x: garage.x, y: garage.y, radius: 80, kind: 'deliverCar', text: 'Deliver the Vireo GT to Harborlight Garage — keep it whole', carId: car.id };
  state.message = { text: 'The alarm sings. The police are coming.', sub: 'Lose them or outrun them — but bring the car back whole.', t: 0, ttl: 3.2 };
}

/** Being busted or wasted mid-delivery drops the case back on the pier. */
export function onPlayerRespawn(state) {
  const m = state.missions;
  if (m.phase === 'active' && MISSION_DEFS[m.index].id === 'dock-run' && m.data.stage === 'deliver') {
    m.data.stage = 'pickup';
    m.timer = null;
    const pier = state.city.pois.pier;
    m.objective = { x: pier.x, y: pier.y, radius: 52, kind: 'pickup', text: 'Pick up the locked case on the south pier (again)' };
  }
}

/** Advance every live job: timers, arrivals, body counts, cooldown re-arming. */
export function stepMissions(state, dt) {
  const m = state.missions;
  const player = state.player;
  if (m.phase === 'cooldown') {
    if (m.cooldownPoi && distance(player.x, player.y, m.cooldownPoi.x, m.cooldownPoi.y) > REARM_DISTANCE) {
      m.phase = 'available';
      m.cooldownPoi = null;
      // A wrecked or moved Vireo goes back to the plaza for another try.
      if (MISSION_DEFS[m.index].id === 'borrowed-wings') resetTargetCar(state);
    }
    return;
  }
  if (m.phase !== 'active') return;
  const def = MISSION_DEFS[m.index];
  const obj = m.objective;
  if (!obj) return;

  if (def.id === 'dock-run') {
    if (m.data.stage === 'pickup' && distance(player.x, player.y, obj.x, obj.y) < obj.radius) {
      m.data.stage = 'deliver';
      m.timer = DELIVERY_TIME;
      const diner = state.city.pois.diner;
      m.objective = { x: diner.x, y: diner.y, radius: 66, kind: 'deliver', text: 'Take the case to the Sunset Diner — before it goes cold' };
      state.message = { text: 'Case in hand.', sub: 'The clock is running.', t: 0, ttl: 2.4 };
    } else if (m.data.stage === 'deliver') {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(state, def, 'the case went cold.', state.city.pois.cafe);
      } else if (distance(player.x, player.y, obj.x, obj.y) < obj.radius) {
        completeMission(state, def);
      }
    }
  } else if (def.id === 'borrowed-wings') {
    const car = state.cars.find((c) => c.id === obj.carId);
    if (!car) return;
    if (!m.data.stolen) {
      obj.x = car.x;
      obj.y = car.y;
      if (car.wrecked) failMission(state, def, 'the Vireo is a wreck.', state.city.pois.plaza);
    } else if (player.car === car && distance(player.x, player.y, obj.x, obj.y) < obj.radius) {
      if (car.health > DELIVERY_MIN_HEALTH) completeMission(state, def);
      else failMission(state, def, 'the Vireo arrived too damaged to fence.', state.city.pois.garage);
    } else if (car.wrecked) {
      failMission(state, def, 'the Vireo is a wreck.', state.city.pois.garage);
    }
  } else if (def.id === 'harbor-cleanup') {
    const alive = state.peds.filter((ped) => ped.role === 'gang' && !ped.dead).length;
    if (m.data.returning) {
      if (distance(player.x, player.y, obj.x, obj.y) < obj.radius) completeMission(state, def);
    } else {
      obj.text = `Clear the Breakers out of Breakwater Storage — ${alive} left`;
      if (alive === 0) {
        m.data.returning = true;
        const ren = state.city.pois.warehouse;
        m.objective = { x: ren.x, y: ren.y, radius: 62, kind: 'return', text: 'Report back to Ren at the warehouse gate' };
        state.message = { text: 'The storage yard is quiet.', sub: 'Go and see Ren.', t: 0, ttl: 2.6 };
      }
    }
  }
}

/** Put the Vireo back at the plaza, whole, ready to be stolen again. */
function resetTargetCar(state) {
  const m = state.missions;
  const car = state.cars.find((c) => c.missionTarget);
  if (!car || !m.homeSpot) return;
  car.x = m.homeSpot.x;
  car.y = m.homeSpot.y;
  car.angle = m.homeSpot.angle;
  car.speed = 0;
  car.health = 100;
  car.wrecked = false;
  if (car.driver === 'player') return;
  car.driver = null;
}

function pushFloater(state, x, y, text, color) {
  state.floaters.push({ x, y, text, color, t: 0, ttl: 1.4 });
}
