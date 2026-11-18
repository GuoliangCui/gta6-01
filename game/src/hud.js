// The interface layer: health, money, stars and the arrest meter; the objective pill with
// its distance (and the dock-run clock); a live minimap with police and objective blips;
// the dialogue box; and the title / pause / busted / wasted overlays. Pure screen-space
// drawing over the world frame — it reads state, never changes it.
import { VIEW, WORLD, WATER_Y, AVENUES, STREETS, PALETTE, FONT } from './config.js';

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(10,14,22,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
}

function star(ctx, cx, cy, r, filled, flash) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = flash ? '#ffe9a8' : PALETTE.star;
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawMinimap(ctx, state) {
  const W = 196;
  const H = 142;
  const x0 = 16;
  const y0 = VIEW.height - H - 16;
  panel(ctx, x0 - 4, y0 - 4, W + 8, H + 8, 0.66);
  const s = Math.min(W / WORLD.width, H / WORLD.height);
  const ox = x0 + (W - WORLD.width * s) / 2;
  const oy = y0 + (H - WORLD.height * s) / 2;
  ctx.fillStyle = '#cdbb96';
  ctx.fillRect(ox, oy, WORLD.width * s, WORLD.height * s);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(ox, oy + WATER_Y * s, WORLD.width * s, (WORLD.height - WATER_Y) * s);
  ctx.strokeStyle = 'rgba(90,84,70,0.8)';
  ctx.lineWidth = 1;
  for (const cx of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(ox + cx * s, oy);
    ctx.lineTo(ox + cx * s, oy + WORLD.height * s);
    ctx.stroke();
  }
  for (const cy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + cy * s);
    ctx.lineTo(ox + WORLD.width * s, oy + cy * s);
    ctx.stroke();
  }
  const dot = (x, y, colour, r) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(ox + x * s, oy + y * s, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (state.objective) dot(state.objective.x, state.objective.y, PALETTE.marker, 3.6);
  for (const car of state.cars) {
    if (car.kind === 'police' && car.health > 0 && !car.calm) {
      dot(car.x, car.y, Math.sin(state.time * 9) > 0 ? '#3b6fe2' : '#e23b3b', 2.6);
    }
  }
  const p = state.player;
  dot(p.x, p.y, '#ffffff', 3.4);
  ctx.strokeStyle = '#10141c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(ox + p.x * s, oy + p.y * s, 3.4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDialogue(ctx, state) {
  const d = state.dialogue;
  if (!d) return;
  const line = d.lines[d.i];
  const w = 620;
  const x = (VIEW.width - w) / 2;
  const y = VIEW.height - 118;
  panel(ctx, x, y, w, 86, 0.86);
  ctx.fillStyle = PALETTE.marker;
  ctx.font = `800 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(line.who.toUpperCase(), x + 18, y + 26);
  ctx.fillStyle = '#f2f4f8';
  ctx.font = `16px ${FONT}`;
  // Word-wrap by hand: measure, break, two lines at most.
  const words = line.text.split(' ');
  const lines = [''];
  for (const word of words) {
    const trial = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(trial).width > w - 36 && lines[lines.length - 1]) lines.push(word);
    else lines[lines.length - 1] = trial;
  }
  lines.slice(0, 2).forEach((text, i) => ctx.fillText(text, x + 18, y + 52 + i * 20));
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', x + w - 14, y + 76);
}

export function drawHud(ctx, state, screen, ui) {
  ctx.textAlign = 'left';
  const p = state.player;

  if (screen === 'play' || screen === 'paused') {
    // Health and money, top-left.
    panel(ctx, 14, 14, 208, 62);
    ctx.fillStyle = '#fff';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText('RIO', 26, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(58, 26, 150, 11);
    const hpFrac = Math.max(0, p.health / 100);
    ctx.fillStyle = hpFrac > 0.3 ? '#57d977' : '#e23b3b';
    ctx.fillRect(58, 26, 150 * hpFrac, 11);
    ctx.fillStyle = PALETTE.money;
    ctx.font = `800 19px ${FONT}`;
    ctx.fillText(`$${state.money}`, 26, 64);
    if (p.car) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `12px ${FONT}`;
      const carHp = Math.max(0, Math.round(p.car.health));
      ctx.fillText(`CAR ${carHp}%`, 118, 64);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `12px ${FONT}`;
      ctx.fillText(`AMMO ${p.ammo}${p.reloading > 0 ? ' ···' : ''}`, 118, 64);
    }

    // Stars, top-right. They pulse while the trail is going cold.
    const cooling = state.stars > 0 && state.time - state.lastSeen > 2;
    for (let i = 0; i < 5; i += 1) {
      const flash = cooling && Math.sin(state.time * 6) > 0;
      star(ctx, VIEW.width - 34 - i * 34, 36, 13, i < state.stars, flash);
    }

    // Objective pill, top-centre.
    if (state.objective) {
      const o = state.objective;
      const dist = Math.round(Math.hypot(p.x - o.x, p.y - o.y) / 10);
      let text = `${o.label} · ${dist}m`;
      if (o.timer != null) {
        const t = Math.max(0, o.timer);
        const mm = Math.floor(t / 60);
        const ss = String(Math.floor(t % 60)).padStart(2, '0');
        text += ` · ${mm}:${ss}`;
      }
      ctx.font = `700 14px ${FONT}`;
      const w = ctx.measureText(text).width + 30;
      panel(ctx, (VIEW.width - w) / 2, 14, w, 32, 0.78);
      ctx.fillStyle = o.timer != null && o.timer < 30 ? '#ff8a7a' : '#ffe9a8';
      ctx.textAlign = 'center';
      ctx.fillText(text, VIEW.width / 2, 35);
      ctx.textAlign = 'left';

      // Edge arrow when the target is off-screen.
      const sx = o.x - state.camera.x;
      const sy = o.y - state.camera.y;
      if (sx < 0 || sx > VIEW.width || sy < 0 || sy > VIEW.height) {
        const cx = Math.max(30, Math.min(VIEW.width - 30, sx));
        const cy = Math.max(70, Math.min(VIEW.height - 30, sy));
        const a = Math.atan2(o.y - p.y, o.x - p.x);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = PALETTE.marker;
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-8, -8);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Arrest meter, centre.
    if (state.arrest > 0.02) {
      const w = 300;
      panel(ctx, (VIEW.width - w) / 2, 120, w, 40, 0.8);
      ctx.fillStyle = '#ff8a7a';
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ARREST IN PROGRESS — BREAK LINE OF SIGHT', VIEW.width / 2, 138);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect((VIEW.width - w) / 2 + 14, 146, w - 28, 7);
      ctx.fillStyle = '#e23b3b';
      ctx.fillRect((VIEW.width - w) / 2 + 14, 146, (w - 28) * Math.min(1, state.arrest), 7);
      ctx.textAlign = 'left';
    }

    drawMinimap(ctx, state);
    drawDialogue(ctx, state);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('WASD move · Shift run · F car · Mouse aim · Click shoot · R reload · Esc pause', VIEW.width - 16, VIEW.height - 14);
    ctx.textAlign = 'left';
  }

  // Busted / wasted banner.
  if (state.respawnTimer > 0 && state.banner) {
    ctx.fillStyle = state.respawnKind === 'busted' ? 'rgba(20,40,110,0.42)' : 'rgba(110,16,16,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.font = `900 84px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.fillText(state.banner.text, VIEW.width / 2, VIEW.height / 2 + 10);
    ctx.shadowBlur = 0;
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(state.respawnKind === 'busted' ? 'The fine comes out of your pocket.' : 'The Clínica Sol patches you up — for a fee.', VIEW.width / 2, VIEW.height / 2 + 46);
    ctx.textAlign = 'left';
  }

  if (screen === 'title') {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(8,12,24,0.62)');
    grad.addColorStop(0.55, 'rgba(8,12,24,0.30)');
    grad.addColorStop(1, 'rgba(8,12,24,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.font = `900 96px ${FONT}`;
    ctx.shadowColor = '#ff5fa2';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffe9f4';
    ctx.fillText('NEON HARBOR', VIEW.width / 2, 218);
    ctx.shadowColor = '#39c2ff';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = '#dff4ff';
    ctx.fillText('霓 虹 港 湾', VIEW.width / 2, 264);
    ctx.shadowBlur = 0;
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('One harbour. Three jobs. Every siren in town.', VIEW.width / 2, 316);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(ui?.hasSave ? 'Press Enter or click — continue where Rio left off (N for a new game)' : 'Press Enter or click to play', VIEW.width / 2, 386);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('WASD / arrows — move & drive      Shift — run      F — enter / exit car', VIEW.width / 2, 452);
    ctx.fillText('Mouse — aim      Click / Space — shoot      R — reload      E — talk / advance', VIEW.width / 2, 478);
    ctx.fillText('Crimes only count when someone sees them. Break line of sight to cool the stars.', VIEW.width / 2, 504);
    ctx.textAlign = 'left';
  }

  if (screen === 'paused') {
    ctx.fillStyle = 'rgba(8,12,24,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.font = `900 54px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Esc or P to resume · N for a new game', VIEW.width / 2, VIEW.height / 2 + 40);
    ctx.textAlign = 'left';
  }
}
