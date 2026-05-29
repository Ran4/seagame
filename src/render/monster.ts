// FEATURE 6 — Sea Monster / Kraken rendering.
//
// Tentacles are world-space overlays drawn between the deck pass and the crew pass
// (see render-fx map §7 recipe 4). Colored/hand-drawn fallback only — no sprites
// required. Also a small phase indicator in the HUD (top-center, like the combat HUD).

import { TILE_SIZE, CANVAS_WIDTH, Tentacle, MonsterState } from '../types';
import { RenderContext } from './context';
import { drawBar } from './ui/widgets';

/** Draw all tentacles on the currently-viewed deck as writhing green limbs. */
export function drawTentacles(rc: RenderContext, tentacles: Tentacle[], deckIndex: number, time: number): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  for (const t of tentacles) {
    if (t.deck !== deckIndex) continue;
    const cx = t.x * TILE_SIZE + TILE_SIZE / 2 - camera.x;
    const cy = t.y * TILE_SIZE + TILE_SIZE / 2 - camera.y;
    if (cx < -TILE_SIZE || cx > CANVAS_WIDTH + TILE_SIZE) continue;

    // Writhe: sinusoidal sway seeded by the tentacle id so each one moves differently.
    const phase = t.id * 1.3;
    const sway = Math.sin(time * 3 + phase) * 5;
    const grabbing = t.grabbedActorId !== null;

    ctx.save();
    // Suckered limb: a tapering segmented body curling up over the railing.
    const segs = 5;
    const baseColor = grabbing ? '#7a1f3a' : '#2f6b3a';
    const suckerColor = grabbing ? '#c06a86' : '#9fd0a0';
    ctx.lineCap = 'round';
    ctx.strokeStyle = baseColor;
    for (let s = segs; s >= 1; s--) {
      const frac = s / segs;
      const segY = cy + TILE_SIZE / 2 - (TILE_SIZE * 0.9) * (1 - frac);
      const segX = cx + sway * (1 - frac);
      const w = 3 + 8 * frac;
      ctx.lineWidth = w;
      ctx.beginPath();
      const prevFrac = (s + 1) / segs;
      const prevY = cy + TILE_SIZE / 2 - (TILE_SIZE * 0.9) * (1 - Math.min(1, prevFrac));
      const prevX = cx + sway * (1 - Math.min(1, prevFrac));
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(segX, segY);
      ctx.stroke();
      // Suckers along the underside.
      ctx.fillStyle = suckerColor;
      ctx.beginPath();
      ctx.arc(segX - w * 0.4, segY, Math.max(1, w * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
    // Curling tip.
    const tipX = cx + sway;
    const tipY = cy - TILE_SIZE * 0.4;
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tipX + 4, tipY, 5, Math.PI * 0.5, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();

    // HP pip bar above the tentacle.
    const barW = 22, barH = 4;
    const bx = cx - barW / 2;
    const by = cy - TILE_SIZE * 0.7;
    drawBar(rc, bx, by, barW, barH, t.hp / t.maxHp, grabbing ? '#dd4466' : '#55cc66');
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
  }
}

/** Top-center kraken phase indicator (sits where the combat HUD would, when no enemy ship). */
export function drawMonsterHud(rc: RenderContext, monster: MonsterState, tentacleCount: number): void {
  const ctx = rc.ctx;
  const w = 260, h = 50;
  const x = CANVAS_WIDTH / 2 - w / 2;
  const y = 38;

  ctx.fillStyle = 'rgba(8,20,12,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = monster.phase === 'attacking' ? '#3a8a4a' : '#2a5a3a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = '#9fe0a8';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const title = monster.phase === 'warning' ? '🐙 SOMETHING RISES…'
    : monster.phase === 'retreating' ? '🐙 The kraken flees!'
    : '🐙 KRAKEN ATTACK';
  ctx.fillText(title, x + 8, y + 18);

  ctx.fillStyle = '#cfe8d2';
  ctx.font = '10px monospace';
  if (monster.phase === 'warning') {
    ctx.fillText(`Brace yourselves — ${Math.ceil(monster.timer)}s`, x + 8, y + 34);
  } else if (monster.phase === 'attacking') {
    ctx.fillText(`Tentacles: ${tentacleCount}    Severed: ${monster.tentaclesSevered}/4`, x + 8, y + 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#bbaa88';
    ctx.font = '9px monospace';
    ctx.fillText('Right-click a tentacle: Fight', x + w / 2, y + h - 4);
    ctx.textAlign = 'left';
  } else {
    ctx.fillText('Victory — the deep is quiet again.', x + 8, y + 34);
  }
}
