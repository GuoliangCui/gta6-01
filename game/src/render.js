// Drawing the world: a sunny, flat-shaded harbour town with a 2.5D lift on the buildings —
// offset shadows, a windowed south wall and a roof on top. Everything is culled to the
// camera, and every pattern (lit windows, wave lines) is hashed from the building's seed,
// so a frame is a pure function of the state: same state, same picture, every time.
import {
  VIEW, WORLD, WATER_Y, PROMENADE_Y, AVENUES, STREETS, ROAD_W, PALETTE, FONT,
} from './config.js';

/** Fit the 1280x720 view into the canvas, centred, and report the transform. */
export function computeView(canvas) {
  const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
  return {
    scale,
    ox: (canvas.width - VIEW.width * scale) / 2,
    oy: (canvas.height - VIEW.height * scale) / 2,
  };
}

function hash(n) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawBuilding(b, cam) {
    if (b.x + b.w < cam.x - 80 || b.y + b.h < cam.y - 120 || b.x > cam.x + VIEW.width + 80 || b.y > cam.y + VIEW.height + 80) return;
    const lift = b.height * 0.55;
    ctx.fillStyle = 'rgba(60,40,20,0.20)';
    ctx.fillRect(b.x + 10, b.y + 14 - lift * 0.2, b.w, b.h);
    // South wall, then the roof slab on top of it.
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y - lift, b.w, b.h + lift);
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
    // Windows on the wall strip.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(lift / 17));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const lit = hash(b.seed + i * 13 + j * 71) > 0.42;
        ctx.fillStyle = lit ? 'rgba(255,236,170,0.9)' : 'rgba(52,64,84,0.55)';
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + b.h - lift + 7 + j * 16, 11, 9);
      }
    }
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y - lift, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 3, b.y - lift + 3, b.w - 6, b.h - 6);
    if (b.name) {
      ctx.save();
      ctx.font = `700 ${Math.min(19, b.w / b.name.length + 9)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#39ffb0';
      ctx.shadowBlur = 9;
      ctx.fillStyle = '#c8ffe9';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - lift * 0.42);
      ctx.restore();
    }
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(40,30,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(3, 5, car.w * 0.55, car.h * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    rr(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 5);
    ctx.fillStyle = car.health <= 0 ? '#4a4a4a' : car.colour;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Cabin and glass.
    ctx.fillStyle = 'rgba(24,32,44,0.85)';
    rr(ctx, -car.w * 0.16, -car.h * 0.36, car.w * 0.34, car.h * 0.72, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,240,0.5)';
    rr(ctx, car.w * 0.2, -car.h * 0.34, car.w * 0.1, car.h * 0.68, 2);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#20242a';
      rr(ctx, -car.w * 0.34, -car.h * 0.5, car.w * 0.16, car.h, 3);
      ctx.fill();
      const on = Math.sin(car.flash) > 0;
      ctx.fillStyle = on ? PALETTE.policeLightA : 'rgba(226,59,59,0.35)';
      ctx.fillRect(-5, -car.h * 0.32, 8, car.h * 0.28);
      ctx.fillStyle = on ? 'rgba(59,111,226,0.35)' : PALETTE.policeLightB;
      ctx.fillRect(-5, car.h * 0.06, 8, car.h * 0.28);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#fdf6d8';
      ctx.fillRect(-4, -3, 8, 6);
    }
    if (car.health < 55 && car.health > 0) {
      ctx.fillStyle = `rgba(20,20,20,${(55 - car.health) / 130})`;
      rr(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 5);
      ctx.fill();
    }
    ctx.restore();
    if (car.kind === 'mission' && car.driver !== 'player') {
      // The one car in the city with a bounty on it gets a gentle gold halo.
      ctx.save();
      ctx.strokeStyle = PALETTE.marker;
      ctx.globalAlpha = 0.65 + Math.sin(time * 5) * 0.3;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPerson(x, y, angle, body, trim, down) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(40,30,10,0.22)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    if (down) {
      ctx.fillStyle = body;
      ctx.globalAlpha = 0.75;
      rr(ctx, -12, -6, 24, 12, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#f2c29b';
      ctx.beginPath();
      ctx.arc(2.5, 0, 4.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld(state) {
    const world = state.world;
    const cam = state.camera;
    const time = state.time;
    ctx.fillStyle = PALETTE.blockGround;
    ctx.fillRect(cam.x - 40, cam.y - 40, VIEW.width + 80, VIEW.height + 80);

    // The harbour.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(cam.x - 40, WATER_Y, VIEW.width + 80, WORLD.height - WATER_Y + 40);
    ctx.strokeStyle = PALETTE.waterLight;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    for (let y = WATER_Y + 26; y < WORLD.height; y += 44) {
      ctx.beginPath();
      for (let x = Math.max(0, cam.x - 40); x < cam.x + VIEW.width + 40; x += 90) {
        const yy = y + Math.sin(x / 130 + y) * 3;
        if (x === Math.max(0, cam.x - 40)) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Blocks: park grass, parking asphalt, plain ground with a sidewalk rim.
    for (const b of world.blocks) {
      if (b.kind === 'park') {
        ctx.fillStyle = PALETTE.park;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = PALETTE.parkPath;
        ctx.fillRect(b.x, b.y + b.h / 2 - 9, b.w, 18);
        ctx.fillRect(b.x + b.w / 2 - 9, b.y, 18, b.h);
      } else {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = PALETTE.blockGround;
        ctx.fillRect(b.x + 11, b.y + 11, b.w - 22, b.h - 22);
      }
    }
    for (const lot of world.parking) {
      ctx.fillStyle = '#8f8a80';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(lot.x + (lot.w / 4) * i, lot.y + 6);
        ctx.lineTo(lot.x + (lot.w / 4) * i, lot.y + lot.h - 6);
        ctx.stroke();
      }
    }

    // Promenade and piers.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, PROMENADE_Y, WORLD.width, WATER_Y - PROMENADE_Y);
    for (const pier of world.piers) {
      ctx.fillStyle = PALETTE.pier;
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.strokeStyle = PALETTE.pierDark;
      ctx.lineWidth = 2;
      for (let x = pier.x + 22; x < pier.x + pier.w; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, pier.y);
        ctx.lineTo(x, pier.y + pier.h);
        ctx.stroke();
      }
    }

    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const cx of AVENUES) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, WATER_Y + 4);
    for (const cy of STREETS) ctx.fillRect(0, cy - ROAD_W / 2, WORLD.width, ROAD_W);
    ctx.strokeStyle = PALETTE.laneMark;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.globalAlpha = 0.75;
    for (const cx of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, WATER_Y);
      ctx.stroke();
    }
    for (const cy of STREETS) {
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(WORLD.width, cy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Crosswalks at junctions.
    ctx.fillStyle = 'rgba(240,238,228,0.65)';
    for (const cx of AVENUES) {
      for (const cy of STREETS) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(cx - ROAD_W / 2 - 8, cy + i * 20 - 5, 12, 10);
          ctx.fillRect(cx + ROAD_W / 2 - 4, cy + i * 20 - 5, 12, 10);
        }
      }
    }

    // Fountain.
    const f = world.fountain;
    ctx.fillStyle = '#b9d2e8';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.waterLight;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Trees.
    for (const t of world.trees) {
      if (t.x < cam.x - 40 || t.x > cam.x + VIEW.width + 40 || t.y < cam.y - 40 || t.y > cam.y + VIEW.height + 40) continue;
      ctx.fillStyle = 'rgba(40,60,20,0.25)';
      ctx.beginPath();
      ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5d9b47';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#74b45e';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const b of world.buildings) drawBuilding(b, cam);

    // Objective marker: a breathing gold ring and a soft beam of light.
    if (state.objective) {
      const o = state.objective;
      const pulse = 15 + Math.sin(time * 5) * 4;
      const grad = ctx.createLinearGradient(0, o.y - 300, 0, o.y);
      grad.addColorStop(0, 'rgba(255,201,60,0)');
      grad.addColorStop(1, 'rgba(255,201,60,0.16)');
      ctx.fillStyle = grad;
      ctx.fillRect(o.x - 13, o.y - 300, 26, 300);
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(o.x, o.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.markerPulse;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Marina, waiting on her pier.
    if (!state.storyDone) {
      const m = world.spots.marinaStand;
      drawPerson(m.x, m.y, Math.PI / 2, '#d6336c', '#8f1d47', false);
      ctx.font = `700 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('MARINA', m.x, m.y - 17);
    }

    // The package, when the pier is holding it.
    if (state.mission.index === 1 && state.mission.stage === 'pickup') {
      const s = world.spots.marina;
      ctx.fillStyle = '#b0783c';
      ctx.fillRect(s.x - 9, s.y - 9, 18, 18);
      ctx.strokeStyle = '#7d5636';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x - 9, s.y - 9, 18, 18);
    }

    for (const ped of state.peds) {
      if (ped.x < cam.x - 30 || ped.x > cam.x + VIEW.width + 30 || ped.y < cam.y - 30 || ped.y > cam.y + VIEW.height + 30) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.colour, 'rgba(0,0,0,0.25)', ped.down > 0);
    }
    for (const g of state.gunmen) {
      if (!g.active) continue;
      drawPerson(g.x, g.y, g.angle, g.dead ? '#5a5a5a' : '#7a1f1f', '#3d0f0f', g.dead);
      if (!g.dead) {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x + Math.cos(g.angle) * 17, g.y + Math.sin(g.angle) * 17);
        ctx.stroke();
      }
    }
    for (const car of state.cars) {
      if (car.x < cam.x - 70 || car.x > cam.x + VIEW.width + 70 || car.y < cam.y - 70 || car.y > cam.y + VIEW.height + 70) continue;
      drawCar(car, time);
    }

    // Rio.
    const p = state.player;
    if (p.car) {
      // Already drawn with the cars; add a small you-are-here tick above his car.
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(p.car.x - 6, p.car.y - 30);
      ctx.lineTo(p.car.x + 6, p.car.y - 30);
      ctx.lineTo(p.car.x, p.car.y - 22);
      ctx.closePath();
      ctx.fill();
    } else {
      drawPerson(p.x, p.y, p.angle, PALETTE.player, PALETTE.playerTrim, false);
      ctx.strokeStyle = '#22252a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6);
      ctx.lineTo(p.x + Math.cos(p.angle) * 19, p.y + Math.sin(p.angle) * 19);
      ctx.stroke();
    }

    // Effects on top.
    for (const e of state.effects) {
      const k = 1 - e.t / e.ttl;
      if (e.kind === 'tracer') {
        ctx.strokeStyle = `rgba(255,217,122,${k * 0.9})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
      } else if (e.kind === 'spark') {
        ctx.strokeStyle = `rgba(255,150,60,${k})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 + e.x;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(a) * 9 * k, e.y + Math.sin(a) * 9 * k);
          ctx.stroke();
        }
      } else if (e.kind === 'smoke') {
        ctx.fillStyle = `rgba(70,70,70,${k * 0.4})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y - e.t * 22, 6 + e.t * 13, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'text') {
        ctx.font = `800 19px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255,201,60,${k})`;
        ctx.fillText(e.text, e.x, e.y - e.t * 30);
      }
    }
  }

  return {
    ctx,
    /** Paint one frame: backdrop, the world through the camera, nothing else. */
    draw(state) {
      const view = computeView(canvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#10141c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(view.scale, 0, 0, view.scale, view.ox - state.camera.x * view.scale, view.oy - state.camera.y * view.scale);
      drawWorld(state);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return view;
    },
  };
}
