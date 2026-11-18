// The HUD and the screens around the play: health and cash, the wanted stars (the highest
// blinks while the player is breaking contact), the mission line with its distance and
// countdown, a live minimap with police blips, dialogue and toasts, and the title / pause
// / busted / wasted panels. Everything here is screen-space drawing over the world.
import { BUST_TIME, EVADE_TIME, ROADS_H, ROADS_V, WATER_Y, WORLD_HEIGHT, WORLD_WIDTH } from './config.js';
import { MARINA } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function pill(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = `rgba(12,16,26,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

function star(ctx, cx, cy, r, filled, alpha) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = `rgba(255,197,0,${alpha})`;
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(255,197,0,${alpha})`;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawMinimap(ctx, sim, view) {
  const w = 192;
  const h = 144;
  const x = view.w - w - 14;
  const y = 14;
  const sx = w / WORLD_WIDTH;
  const sy = h / WORLD_HEIGHT;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = '#0e8ba0';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e8dcbc';
  ctx.fillRect(x, y, w, WATER_Y * sy);
  ctx.fillStyle = '#7cc463';
  const park = sim.world.park;
  ctx.fillRect(x + park.x * sx, y + park.y * sy, park.w * sx, park.h * sy);
  ctx.strokeStyle = '#4b4b54';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const cx of ROADS_V) { ctx.moveTo(x + cx * sx, y); ctx.lineTo(x + cx * sx, y + h); }
  for (const cy of ROADS_H) { ctx.moveTo(x, y + cy * sy); ctx.lineTo(x + w, y + cy * sy); }
  ctx.stroke();
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2); ctx.fill();
  };
  if (sim.missions.phase === 'contact') dot(MARINA.x, MARINA.y, '#22d3ee', 3);
  for (const member of sim.gang) if (member.state !== 'down') dot(member.x, member.y, '#ff3b30', 3);
  const blink = Math.floor(sim.time * 2.4) % 2 === 0;
  for (const car of sim.cars) {
    if (car.kind === 'cop' && car.driver === 'cop') dot(car.x, car.y, blink ? '#ff3b30' : '#3b82f6', 3.2);
  }
  const marker = sim.missions.marker;
  if (marker) {
    const pulse = 3.4 + Math.sin(sim.time * 5) * 1.1;
    dot(marker.x, marker.y, '#ffd60a', pulse);
  }
  dot(sim.player.x, sim.player.y, '#ffffff', 3.6);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.stroke();
  return { x, y, w, h };
}

export function drawHud(ctx, sim, view) {
  const player = sim.player;
  const wanted = sim.wanted;
  ctx.font = `600 15px ${FONT}`;
  ctx.textAlign = 'left';
  // Health and cash, top-left.
  pill(ctx, 14, 14, 196, 30, 0.55);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(52, 24, 148, 10);
  ctx.fillStyle = player.hp > 34 ? '#4ade80' : '#f87171';
  ctx.fillRect(52, 24, 148 * Math.max(0, player.hp) / 100, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('RIO', 22, 34);
  pill(ctx, 14, 50, 196, 30, 0.55);
  ctx.fillStyle = '#ffd60a';
  ctx.font = `700 17px ${FONT}`;
  ctx.fillText(`$ ${sim.money.toLocaleString('en-US')}`, 24, 71);
  if (sim.missions.hasPackage) {
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(150, 58, 13, 13);
    ctx.fillStyle = '#20242e';
    ctx.font = `700 9px ${FONT}`;
    ctx.fillText('PKG', 151, 68);
  }
  // Minimap and wanted stars, top-right.
  const map = drawMinimap(ctx, sim, view);
  if (wanted.stars > 0) {
    for (let i = 0; i < 5; i += 1) {
      const active = i < wanted.stars;
      let alpha = active ? 1 : 0.28;
      if (active && !wanted.seen && i === wanted.stars - 1) alpha = 0.45 + 0.4 * Math.sin(sim.time * 7);
      star(ctx, map.x + 18 + i * 34, map.y + map.h + 24, 13, active, alpha);
    }
    if (!wanted.seen && wanted.stars > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(map.x + 4, map.y + map.h + 44, 150, 5);
      ctx.fillStyle = '#ffd60a';
      ctx.fillRect(map.x + 4, map.y + map.h + 44, 150 * Math.min(1, wanted.evade / EVADE_TIME), 5);
    }
  }
  // Mission line, top-centre, with distance and countdown.
  const missions = sim.missions;
  if (missions.objective) {
    let text = missions.objective;
    if (missions.marker) {
      const d = Math.hypot(player.x - missions.marker.x, player.y - missions.marker.y);
      text += `  ·  ${Math.round(d / 10)} m`;
    }
    ctx.font = `600 15px ${FONT}`;
    const tw = ctx.measureText(text).width + 30;
    pill(ctx, (view.w - tw) / 2, 14, tw, 32, 0.6);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, view.w / 2, 35);
    if (missions.stage === 'deliver' && missions.index === 0 && missions.phase === 'active') {
      const left = Math.max(0, Math.ceil(missions.timer));
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = left < 30 ? '#f87171' : '#ffd60a';
      ctx.fillText(`${left}s`, view.w / 2, 62);
    }
    ctx.textAlign = 'left';
  }
  // Toasts under the mission line.
  ctx.font = `600 14px ${FONT}`;
  ctx.textAlign = 'center';
  sim.toasts.forEach((toast, i) => {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, toast.ttl)})`;
    ctx.fillText(toast.text, view.w / 2, 92 + i * 20);
  });
  ctx.textAlign = 'left';
  // Bottom-right: speed in a car, ammunition on foot.
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  if (player.car) {
    ctx.fillText(`${Math.round(Math.abs(player.car.speed) * 0.36)} km/h`, view.w - 18, view.h - 20);
  } else if (player.reloading > 0) {
    ctx.fillStyle = '#ffd60a';
    ctx.fillText('RELOADING', view.w - 18, view.h - 20);
  } else {
    ctx.fillText(`PISTOL ${player.ammo} / 12`, view.w - 18, view.h - 20);
  }
  ctx.textAlign = 'left';
  // Arrest meter over the player while an officer has him pinned.
  if (wanted.bust > 0.04) {
    const perWorld = view.w / 1180;
    const px = (player.x - view.cx) * perWorld + view.w / 2;
    const py = (player.y - view.cy) * perWorld + view.h / 2;
    pill(ctx, px - 46, py - 64, 92, 16, 0.7);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(px - 42, py - 60, 84 * Math.min(1, wanted.bust / BUST_TIME), 8);
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('ARRESTING', px, py - 70);
    ctx.textAlign = 'left';
  }
  // Dialogue, bottom-centre.
  const dialogue = missions.dialogue;
  if (dialogue) {
    const line = dialogue.lines[dialogue.index];
    const w = Math.min(700, view.w - 48);
    const x = (view.w - w) / 2;
    const y = view.h - 118;
    pill(ctx, x, y, w, 84, 0.78);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(dialogue.speaker, x + 18, y + 26);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, x + 18, y + 54);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `12px ${FONT}`;
    ctx.fillText('E ▸', x + w - 34, y + 70);
  }
  // Controls reminder, faint, bottom-left.
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('WASD move · E car / talk · mouse aim · click shoot · Shift run · P pause', 16, view.h - 16);
}

export function drawOverlay(ctx, sim, screen, view) {
  const cx = view.w / 2;
  if (screen === 'paused') {
    ctx.fillStyle = 'rgba(8,10,18,0.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = `800 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PAUSED', cx, view.h / 2);
    ctx.font = `16px ${FONT}`;
    ctx.fillText('P or Esc to keep playing', cx, view.h / 2 + 34);
    ctx.textAlign = 'left';
    return;
  }
  if (screen === 'busted' || screen === 'wasted') {
    const out = sim.lastOutcome ?? { kind: screen, fine: 0 };
    ctx.fillStyle = screen === 'busted' ? 'rgba(10,16,40,0.62)' : 'rgba(40,8,8,0.62)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = `800 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = screen === 'busted' ? '#7db4ff' : '#ff6b5e';
    ctx.fillText(screen === 'busted' ? 'BUSTED' : 'WASTED', cx, view.h / 2 - 10);
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(screen === 'busted'
      ? `The harbour police fine you $${out.fine}. Your heat is gone.`
      : `The hospital bills you $${out.fine}. The harbour keeps your secrets.`, cx, view.h / 2 + 30);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('ENTER — back on the street', cx, view.h / 2 + 62);
    ctx.textAlign = 'left';
    return;
  }
  // Title.
  const grad = ctx.createLinearGradient(0, 0, 0, view.h);
  grad.addColorStop(0, 'rgba(10,12,26,0.72)');
  grad.addColorStop(0.55, 'rgba(10,12,26,0.25)');
  grad.addColorStop(1, 'rgba(10,12,26,0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.font = `800 76px ${FONT}`;
  ctx.shadowColor = '#ff5d8f';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('NEON HARBOR', cx, 168);
  ctx.shadowBlur = 0;
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText('Un puerto, tres trabajos, ninguna pregunta.', cx, 204);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const lines = [
    'Rio runs errands for Marina, the harbour fixer. Steal, deliver, disappear.',
    'Crimes only count when somebody sees them — break line of sight to cool down.',
    '',
    'WASD / arrows — move and drive      E — car, talk, confirm',
    'Mouse — aim      Click — shoot      Shift — run      P — pause',
  ];
  lines.forEach((line, i) => ctx.fillText(line, cx, 268 + i * 26));
  ctx.font = `700 21px ${FONT}`;
  ctx.fillStyle = '#ffd60a';
  if (sim.hasSave) ctx.fillText('ENTER — new game        C — continue', cx, 452);
  else ctx.fillText('ENTER — start', cx, 452);
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('An original harbour-tale. Every car, name and street invented; any resemblance to a certain other city is sunshine.', cx, view.h - 26);
  ctx.textAlign = 'left';
}
