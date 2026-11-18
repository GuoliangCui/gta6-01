// The HUD and the screens: health, money, wanted stars, the objective bar, a
// live minimap, dialogue boxes, and the title / pause / busted / wasted veils.
// Everything is drawn over the rendered world in the fixed 1280x720 view space.
import { FONT, LAND_H, PALETTE, PITCH, PLAYER, VIEW, WORLD_H, WORLD_W } from './config.js';
import { clamp, distance } from './geom.js';
import { MISSION_DEFS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MAP = { x: 16, y: VIEW.height - 204, size: 188 };

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    /** Draw the overlay for the current screen; mouse is in view coordinates. */
    draw(state, screen, extras = {}) {
      if (screen === SCREEN_TITLE) {
        drawTitle(ctx, state, extras);
        return;
      }
      drawHud(ctx, state, extras);
      if (state.dialogue) drawDialogue(ctx, state);
      if (screen === SCREEN_PAUSED) drawVeil(ctx, 'PAUSED', 'The city holds its breath.', 'Click or press P to keep going.');
      if (screen === SCREEN_OVER) {
        const busted = extras.overKind === 'busted';
        drawVeil(ctx, busted ? 'BUSTED' : 'WASTED', busted ? 'The NHPD got their hands on you.' : 'Harbor General did what they could.', 'Click or press Enter to step back into the city.');
      }
    },
  };
}

/** The always-on layer while playing: vitals, stars, objective, minimap, prompts. */
function drawHud(ctx, state, extras) {
  const player = state.player;
  // Vitals panel, top-left.
  panel(ctx, 16, 16, 232, 74);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('JUNO', 30, 38);
  bar(ctx, 74, 27, 158, 12, player.health / PLAYER.maxHealth, player.health > 30 ? '#57c256' : PALETTE.danger);
  ctx.fillStyle = PALETTE.money;
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText(`$${player.money}`, 30, 66);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(`Jobs done: ${state.missions.index} / ${MISSION_DEFS.length}`, 118, 66);

  drawStars(ctx, state);
  drawObjective(ctx, state);
  drawMinimap(ctx, state);

  // Weapon and vehicle readouts, bottom-right.
  ctx.textAlign = 'right';
  if (player.car) {
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(player.car.name, VIEW.width - 24, VIEW.height - 58);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`${Math.round(Math.abs(player.car.speed) * 0.31)} km/h`, VIEW.width - 24, VIEW.height - 36);
    bar(ctx, VIEW.width - 204, VIEW.height - 28, 180, 8, player.car.health / 100, player.car.health > 30 ? '#e8b34b' : PALETTE.danger);
  } else {
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 15px ${FONT}`;
    const ammo = player.reloadT > 0 ? 'RELOADING…' : `PISTOL  ${player.ammo} / ${PLAYER.magazine}`;
    ctx.fillText(ammo, VIEW.width - 24, VIEW.height - 36);
  }

  // The arrest closing in.
  if (player.bustedMeter > 0.02) {
    const w = 260;
    panel(ctx, VIEW.width / 2 - w / 2, VIEW.height - 148, w, 34);
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `800 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', VIEW.width / 2, VIEW.height - 136);
    bar(ctx, VIEW.width / 2 - w / 2 + 70, VIEW.height - 130, w - 130, 7, player.bustedMeter, PALETTE.danger);
  }

  // Story-complete ribbon once the chain is done.
  if (state.missions.phase === 'complete') {
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('★ Story complete — Neon Harbor is yours to roam ★', VIEW.width / 2, 108);
  }

  // Toasts and the context prompt.
  if (state.message) {
    const m = state.message;
    const alpha = clamp(m.ttl - m.t, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 17px ${FONT}`;
    ctx.fillText(m.text, VIEW.width / 2, 138);
    if (m.sub) {
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.fillText(m.sub, VIEW.width / 2, 160);
    }
    ctx.globalAlpha = 1;
  }
  if (state.prompt && !state.dialogue) {
    ctx.font = `700 14px ${FONT}`;
    const w = ctx.measureText(state.prompt).width + 30;
    panel(ctx, VIEW.width / 2 - w / 2, VIEW.height - 108, w, 32);
    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(state.prompt, VIEW.width / 2, VIEW.height - 87);
  }
  // Crosshair at the mouse while on foot.
  if (!player.car && extras.mouseX !== undefined && !state.dialogue) {
    ctx.strokeStyle = 'rgba(245, 239, 226, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(extras.mouseX, extras.mouseY, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 239, 226, 0.9)';
    ctx.fillRect(extras.mouseX - 1, extras.mouseY - 1, 2, 2);
  }
}

/** Wanted stars, top-right; the top star pulses while the heat cools off. */
function drawStars(ctx, state) {
  const size = 15;
  const gap = 7;
  const total = 5 * (size * 2 + gap);
  const x0 = VIEW.width - 24 - total;
  for (let i = 0; i < 5; i += 1) {
    const cx = x0 + i * (size * 2 + gap) + size;
    const cy = 34;
    const active = i < state.wanted;
    let alpha = 1;
    if (active && i === state.wanted - 1 && !state.seenByPolice && state.wanted > 0) {
      alpha = 0.45 + 0.4 * Math.sin(state.time * 6);
    }
    ctx.globalAlpha = alpha;
    star(ctx, cx, cy, size, active ? '#ffb454' : 'rgba(230, 230, 230, 0.28)');
  }
  ctx.globalAlpha = 1;
  if (state.wanted > 0) {
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(state.seenByPolice ? 'The police have eyes on you' : 'Break their line of sight…', VIEW.width - 24, 62);
  }
}

function star(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** The current job, top-centre: its name, the objective, distance and the clock. */
function drawObjective(ctx, state) {
  const m = state.missions;
  if (m.phase !== 'active' || !m.objective) return;
  const def = MISSION_DEFS[m.index];
  const dist = Math.round(distance(state.player.x, state.player.y, m.objective.x, m.objective.y));
  let line = `${def.name} — ${m.objective.text}  ·  ${dist} m`;
  if (m.timer !== null && m.timer !== undefined) {
    const seconds = Math.max(0, Math.ceil(m.timer));
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    line += `  ·  ${clock}`;
  }
  ctx.font = `700 14px ${FONT}`;
  const w = ctx.measureText(line).width + 36;
  panel(ctx, VIEW.width / 2 - w / 2, 14, w, 34);
  ctx.fillStyle = m.timer !== null && m.timer < 30 ? PALETTE.danger : PALETTE.hudText;
  ctx.textAlign = 'center';
  ctx.fillText(line, VIEW.width / 2, 37);
}

/** The minimap: roads and water, the hunt, and where the money is. */
function drawMinimap(ctx, state) {
  const { x, y, size } = MAP;
  const scale = size / WORLD_W;
  const h = WORLD_H * scale;
  ctx.save();
  panel(ctx, x - 6, y - 6, size + 12, h + 12);
  ctx.beginPath();
  ctx.rect(x, y, size, h);
  ctx.clip();
  ctx.fillStyle = '#176878';
  ctx.fillRect(x, y, size, h);
  ctx.fillStyle = '#8d8574';
  ctx.fillRect(x, y, size, LAND_H * scale);
  // Roads.
  ctx.strokeStyle = 'rgba(40, 42, 48, 0.9)';
  ctx.lineWidth = Math.max(2, 92 * scale);
  ctx.beginPath();
  for (let i = 0; i <= 6; i += 1) {
    const rx = x + (i * PITCH + 46) * scale;
    ctx.moveTo(rx, y);
    ctx.lineTo(rx, y + LAND_H * scale);
  }
  for (let j = 0; j <= 5; j += 1) {
    const ry = y + (j * PITCH + 46) * scale;
    ctx.moveTo(x, ry);
    ctx.lineTo(x + size, ry);
  }
  ctx.stroke();
  const dot = (wx, wy, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * scale, y + wy * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const car of state.cars) {
    if (car.kind === 'traffic') dot(car.x, car.y, 1.6, 'rgba(230,230,230,0.55)');
  }
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.wrecked) {
      dot(car.x, car.y, 3, Math.floor(state.time * 2.4) % 2 === 0 ? '#ff3b30' : '#3d8bfd');
    }
  }
  for (const ped of state.peds) {
    if (ped.role === 'officer' && !ped.dead) dot(ped.x, ped.y, 2.4, '#ff3b30');
    if (ped.role === 'gang' && !ped.dead) dot(ped.x, ped.y, 2.4, '#c0392b');
  }
  const objective = state.missions.objective;
  if (objective) {
    const pulse = 4.5 + Math.sin(state.time * 5) * 1.6;
    dot(objective.x, objective.y, pulse, '#ffb454');
    dot(objective.x, objective.y, 2.2, '#fff3d6');
  }
  // The player: a heading arrow in teal.
  const px = x + state.player.x * scale;
  const py = y + state.player.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#2dd4bf';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.5, -4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('NEON HARBOR', x, y - 10);
}

/** The dialogue box: a name, wrapped words, and the way onward. */
function drawDialogue(ctx, state) {
  const dialogue = state.dialogue;
  const line = dialogue.lines[dialogue.index];
  const boxH = 108;
  const boxY = VIEW.height - boxH - 18;
  panel(ctx, 90, boxY, VIEW.width - 180, boxH);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(line.who, 116, boxY + 30);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `16px ${FONT}`;
  wrapText(ctx, line.text, 116, boxY + 58, VIEW.width - 232, 21);
  ctx.fillStyle = 'rgba(245, 239, 226, 0.65)';
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('E / Click ▸', VIEW.width - 116, boxY + boxH - 14);
}

/** The title screen: the name of the city, the promise, and the controls. */
function drawTitle(ctx, state, extras) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, 'rgba(10, 16, 26, 0.42)');
  grad.addColorStop(0.55, 'rgba(10, 16, 26, 0.55)');
  grad.addColorStop(1, 'rgba(10, 16, 26, 0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb454';
  ctx.font = `800 74px ${FONT}`;
  ctx.fillText('NEON HARBOR', VIEW.width / 2, 196);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 19px ${FONT}`;
  ctx.fillText('A small city of big trouble — steal the cars, run the jobs, outrun the NHPD.', VIEW.width / 2, 236);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = 'rgba(245, 239, 226, 0.85)';
  const lines = [
    'WASD / Arrows — walk and drive      Shift — run      Mouse — aim, click — shoot',
    'E — talk, steal, get in and out      P / Esc — pause      R — reload',
    'Three jobs wait in the city: Mara at Cafe Lumen has the first of them.',
    'Get caught and it costs you. Get flattened and it costs you more.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 300 + i * 27));
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = '#7ee787';
  if (extras.hasSave) {
    ctx.fillText('Click / Enter — New game        C — Continue your story', VIEW.width / 2, 452);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = PALETTE.hudText;
    ctx.fillText(`Saved: $${extras.saveMoney} · Jobs done ${extras.saveJobs} / ${MISSION_DEFS.length}`, VIEW.width / 2, 482);
  } else {
    ctx.fillText('Click or press Enter to step into the city', VIEW.width / 2, 452);
  }
}

/** A dark veil with a verdict on it: paused, busted, wasted. */
function drawVeil(ctx, title, sub, hint) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = title === 'BUSTED' || title === 'WASTED' ? PALETTE.danger : PALETTE.hudText;
  ctx.font = `800 62px ${FONT}`;
  ctx.fillText(title, VIEW.width / 2, VIEW.height / 2 - 26);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText(sub, VIEW.width / 2, VIEW.height / 2 + 14);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = 'rgba(245, 239, 226, 0.75)';
  ctx.fillText(hint, VIEW.width / 2, VIEW.height / 2 + 48);
}

/** A translucent rounded panel, the HUD's one piece of furniture. */
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

/** A plain progress bar with a soft track. */
function bar(ctx, x, y, w, h, fraction, color) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (fraction > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * clamp(fraction, 0, 1)), h, h / 2);
    ctx.fill();
  }
}

/** Greedy word wrap for the dialogue box. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
