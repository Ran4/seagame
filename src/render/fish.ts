import { TILE_SIZE, Actor, CAUGHT_DISPLAY_DURATION } from '../types';
import { RenderContext } from './context';

// ─── Fishing visuals ──────────────────────────────────────────────────────────

const FISH_MAX_LINE_LEN = TILE_SIZE * 1.6; // how far the line reaches over the water
// CAST_DURATION / CAUGHT_DISPLAY_DURATION are shared with the logic — imported from ../types.

/** Unit vector for a cast direction (toward the water). */
export function castDirVector(dir: Actor['fishingCastDir']): { x: number; y: number } {
  switch (dir) {
    case 'north': return { x: 0, y: -1 };
    case 'south': return { x: 0, y: 1 };
    case 'east': return { x: 1, y: 0 };
    case 'west': return { x: -1, y: 0 };
    default: return { x: -1, y: 0 }; // sensible default (left-edge spot casts west)
  }
}

/**
 * Draw the fishing line + bobber/splash for a crew member currently FISHING.
 * sx/sy are the screen-space tile center of the crew member.
 */
export function drawFishingRig(rc: RenderContext, member: Actor, sx: number, sy: number): void {
  const ctx = rc.ctx;
  const dir = castDirVector(member.fishingCastDir);
  const phase = member.fishingPhase;

  // Rod tip near the crew's hands, offset toward the water.
  const rodTipX = sx + dir.x * 8;
  const rodTipY = sy - 6 + dir.y * 4;

  if (phase === 'casting') {
    const prog = member.fishingLineProgress ?? 0;
    // Landing point = where the bobber will rest during 'waiting' (smooth hand-off).
    const landX = rodTipX + dir.x * FISH_MAX_LINE_LEN;
    const landY = rodTipY + dir.y * FISH_MAX_LINE_LEN;
    // The lure is THROWN: it travels linearly toward the landing point but is lifted by
    // a parabola that peaks mid-flight (zero at both ends), so it arcs up and drops in.
    const arcLift = FISH_MAX_LINE_LEN * 0.6;
    const parabola = 4 * prog * (1 - prog); // 0 → 1 → 0 over prog 0..1
    const lureX = rodTipX + (landX - rodTipX) * prog;
    const lureY = rodTipY + (landY - rodTipY) * prog - arcLift * parabola;
    // Line bows up toward the lure (control point above the chord), flattening on landing.
    const cpX = (rodTipX + lureX) / 2;
    const cpY = (rodTipY + lureY) / 2 - arcLift * 0.5 * parabola;
    ctx.strokeStyle = '#e8e8d0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rodTipX, rodTipY);
    ctx.quadraticCurveTo(cpX, cpY, lureX, lureY);
    ctx.stroke();
    // The lure/bobber rides the arc as it flies out.
    drawBobber(ctx, lureX, lureY);
    return;
  }

  if (phase === 'waiting') {
    const endX = rodTipX + dir.x * FISH_MAX_LINE_LEN;
    // Bobber bobs gently up/down; an occasional deeper dip when sin peaks.
    const bob = Math.sin(rc.time * 3) * 2;
    const endY = rodTipY + dir.y * FISH_MAX_LINE_LEN + bob;

    ctx.strokeStyle = '#e8e8d0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rodTipX, rodTipY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    drawBobber(ctx, endX, endY);
    return;
  }

  if (phase === 'fighting') {
    // Endpoint jitters around a struggling-fish splash.
    const jx = Math.sin(rc.time * 14) * 4;
    const jy = Math.cos(rc.time * 11) * 3;
    const endX = rodTipX + dir.x * FISH_MAX_LINE_LEN + jx;
    const endY = rodTipY + dir.y * FISH_MAX_LINE_LEN + jy;

    // Taut, BENT line (control point offset perpendicular to the line, oscillating).
    const perpX = -dir.y;
    const perpY = dir.x;
    const bend = Math.sin(rc.time * 9) * 5;
    const midX = (rodTipX + endX) / 2 + perpX * bend;
    const midY = (rodTipY + endY) / 2 + perpY * bend;
    ctx.strokeStyle = '#e8e8d0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rodTipX, rodTipY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();

    // Little white splash at the endpoint (2-3 short arcs).
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const r = 4 + i * 2.5 + Math.sin(rc.time * 13 + i) * 1.5;
      ctx.beginPath();
      ctx.arc(endX, endY, r, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }

    // Strain mark "!" near the rod tip (jittering for tension).
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const sjx = Math.sin(rc.time * 18) * 1.5;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeText('!', rodTipX + dir.x * 4 + sjx, rodTipY - 6);
    ctx.fillText('!', rodTipX + dir.x * 4 + sjx, rodTipY - 6);
    return;
  }
}

/** Small red/white bobber. */
function drawBobber(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = 3;
  // Bottom (red) half
  ctx.fillStyle = '#d33';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Top (white) half
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, Math.PI * 2);
  ctx.fill();
  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Floating framed window above the crew's head showing a freshly caught fish.
 * Pops in (scales 0.6 -> 1.0) over the first ~0.25s of its lifetime.
 */
export function drawCaughtFishWindow(
  rc: RenderContext,
  display: { name: string; kind: string; timer: number },
  sx: number,
  sy: number,
): void {
  const ctx = rc.ctx;
  const panelW = 46;
  const panelH = 34;
  // Sit above the head (and above where the name label goes at sy-22).
  const panelCY = sy - TILE_SIZE - panelH / 2 - 10;
  const panelCX = sx;

  // Pop-in scale from the timer.
  const age = CAUGHT_DISPLAY_DURATION - display.timer;
  const pop = Math.min(1, Math.max(0, age / 0.25));
  const scale = 0.6 + 0.4 * pop;

  ctx.save();
  ctx.translate(panelCX, panelCY);
  ctx.scale(scale, scale);

  const left = -panelW / 2;
  const top = -panelH / 2;
  const radius = 6;

  // Downward tail toward the head (drawn before the panel fill so the panel sits on top).
  ctx.fillStyle = 'rgba(255,255,250,0.96)';
  ctx.beginPath();
  ctx.moveTo(-4, panelH / 2 - 1);
  ctx.lineTo(0, panelH / 2 + 6);
  ctx.lineTo(4, panelH / 2 - 1);
  ctx.closePath();
  ctx.fill();

  // Rounded-rect panel.
  roundRectPath(ctx, left, top, panelW, panelH, radius);
  ctx.fillStyle = 'rgba(255,255,250,0.96)';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Fish icon (centered, upper portion).
  drawFishIcon(ctx, 0, -4, 22, display.kind);

  // Name in tiny bold text under the fish.
  if (display.name) {
    ctx.fillStyle = '#3a2f12';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(display.name, 0, panelH / 2 - 6);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}

/** Trace a rounded-rect path (caller sets fill/stroke). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Procedural fish icon, distinct per kind. Drawn centered at (cx, cy), facing left.
 * `size` is roughly the body length in px.
 */
function drawFishIcon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number, kind: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';

  const bodyL = size;          // horizontal extent
  const bodyH = size * 0.5;    // vertical extent

  if (kind === 'swordfish') {
    // Elongated steel-blue body + long pointed bill + tail (a bit bigger).
    const L = size * 1.15;
    const H = size * 0.32;
    // Body
    ctx.fillStyle = '#5f7d95';
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.42, H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Bill (points left)
    ctx.beginPath();
    ctx.moveTo(-L * 0.4, -2);
    ctx.lineTo(-L * 0.85, 0);
    ctx.lineTo(-L * 0.4, 2);
    ctx.closePath();
    ctx.fillStyle = '#46606f';
    ctx.fill();
    ctx.stroke();
    // Tail (right)
    drawTail(ctx, L * 0.4, 0, H * 1.4, '#5f7d95');
    // Dorsal fin
    ctx.fillStyle = '#46606f';
    ctx.beginPath();
    ctx.moveTo(-2, -H);
    ctx.lineTo(6, -H * 2.1);
    ctx.lineTo(8, -H);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawEye(ctx, -L * 0.28, -1);
    ctx.restore();
    return;
  }

  if (kind === 'pufferfish') {
    // Round green body + short spikes + dark spots + eye.
    const r = size * 0.42;
    ctx.fillStyle = '#7bae5a';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // Spikes around the rim
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    const spikes = 12;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const ix = Math.cos(a) * r;
      const iy = Math.sin(a) * r;
      const ox = Math.cos(a) * (r + 3);
      const oy = Math.sin(a) * (r + 3);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }
    // Body outline
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    // Dark spots
    ctx.fillStyle = 'rgba(40,60,30,0.7)';
    ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.2, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.1, r * 0.35, 1.4, 0, Math.PI * 2); ctx.fill();
    drawEye(ctx, -r * 0.45, -r * 0.15);
    ctx.restore();
    return;
  }

  // common / tropical (and any unknown kind) share the basic body shape.
  const bodyColor = kind === 'tropical' ? '#ff9f43' : '#8fa9bf';

  // Body (oval, facing left)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyL * 0.4, bodyH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tail (right side)
  drawTail(ctx, bodyL * 0.38, 0, bodyH * 0.9, bodyColor);

  if (kind === 'tropical') {
    // Dark vertical stripe.
    ctx.fillStyle = '#341f97';
    ctx.fillRect(-bodyL * 0.06, -bodyH * 0.42, 3, bodyH * 0.84);
  }

  drawEye(ctx, -bodyL * 0.26, -bodyH * 0.12);
  ctx.restore();
}

/** Triangular tail on the right side of a fish body. */
function drawTail(
  ctx: CanvasRenderingContext2D,
  baseX: number, baseY: number, halfH: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(baseX + halfH, baseY - halfH);
  ctx.lineTo(baseX + halfH, baseY + halfH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Small fish eye. */
function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x, y, 0.9, 0, Math.PI * 2);
  ctx.fill();
}
