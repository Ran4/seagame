import { TILE_SIZE, Actor, Camera, CrewState, Corpse, CAUGHT_DISPLAY_DURATION } from '../types';
// FishingPhase type lives in ../types; referenced via Actor.fishingPhase.
import { DirectionalSprite } from '../sprites';
import { RenderContext } from './context';

export function drawActor(rc: RenderContext, member: Actor, selected: boolean): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  const sx = member.pixelX - camera.x;
  const sy = member.pixelY - camera.y;

  // Pick directional sprite for the actor's facing direction
  const isAnimal = member.actorType !== 'human';
  let sprite: HTMLImageElement | null = null;
  let flipX = false;
  const dirSprite: DirectionalSprite | null = isAnimal
    ? (rc.sprites?.animals.get(member.actorType) ?? null)
    : (rc.sprites?.crew[member.profile.spriteIndex % (rc.sprites?.crew.length ?? 1)] ?? null);
  if (dirSprite) {
    if (member.facing === 'north' && dirSprite.north) {
      sprite = dirSprite.north;
    } else if (member.facing === 'west' && dirSprite.west) {
      sprite = dirSprite.west;
    } else if (member.facing === 'east' && dirSprite.west) {
      sprite = dirSprite.west;
      flipX = true;
    } else {
      sprite = dirSprite.south;
    }
  }
  // Animals are drawn slightly smaller (monkey even smaller); babies smaller still
  const isBaby = member.statuses.has('baby');
  const sizeScale = isBaby ? 0.6
    : (member.actorType === 'monkey' || member.actorType === 'cat') ? 0.7
    : isAnimal ? 0.85 : 1.0;
  const size = TILE_SIZE * sizeScale;

  // Fishing: while fighting the line, the crew rocks/leans back against the pull.
  const isFishing = member.state === CrewState.FISHING && !!member.fishingPhase;
  const fishDir = isFishing ? castDirVector(member.fishingCastDir) : { x: 0, y: 0 };
  const fightLean = (isFishing && member.fishingPhase === 'fighting')
    ? Math.sin(rc.time * 12) * 2.5 : 0;
  // Lean BACK against the pull (opposite the cast direction).
  const leanX = -fishDir.x * fightLean;
  const leanY = -fishDir.y * fightLean;

  if (sprite) {
    if (flipX) {
      ctx.save();
      ctx.translate(sx + leanX, sy + leanY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, sx - size / 2 + leanX, sy - size / 2 + leanY, size, size);
    }
  } else {
    // Fallback: colored circle (smaller for animals)
    const radius = isAnimal ? (member.actorType === 'monkey' ? 6 : 7) : 10;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + radius, radius * 0.8, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = member.profile.color;
    ctx.beginPath();
    ctx.arc(sx + leanX, sy + leanY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx + leanX, sy + leanY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Fishing rig (line + bobber/splash) — drawn over the sprite. Anchor it to the
  // leaned body so the rod tip stays in the angler's hands while they fight.
  if (isFishing) {
    drawFishingRig(rc, member, sx + leanX, sy + leanY);
  }

  // Selection ring
  if (selected) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  // State indicator
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  if (member.state === CrewState.SLEEPING) {
    ctx.fillText('z', sx + 14, sy - 12);
  } else if (member.state === CrewState.EATING) {
    ctx.fillText('~', sx + 14, sy - 12);
  } else if (member.state === CrewState.STEERING) {
    ctx.fillText('*', sx + 14, sy - 12);
  } else if (member.state === CrewState.MANNING_CANNON) {
    ctx.fillText('!', sx + 14, sy - 12);
  } else if (member.state === CrewState.LOOKOUT) {
    ctx.fillText('?', sx + 14, sy - 12);
  } else if (member.state === CrewState.NAVIGATING) {
    ctx.fillText('N', sx + 14, sy - 12);
  } else if (member.state === CrewState.COPULATING) {
    ctx.fillText('\u2665', sx + 14, sy - 12);
  } else if (member.state === CrewState.KISSING) {
    ctx.fillText('\u2665', sx + 14, sy - 12);
  } else if (member.state === CrewState.LIGHTING_LANTERN || member.state === CrewState.EXTINGUISHING_LANTERN) {
    ctx.fillText('L', sx + 14, sy - 12);
  } else if (member.state === CrewState.TALKING) {
    ctx.fillText('...', sx + 14, sy - 12);
  } else if (member.state === CrewState.SINGING) {
    ctx.fillText('\u266A', sx + 14, sy - 12);
  } else if (member.state === CrewState.DANCING) {
    ctx.fillText('\u266B', sx + 14, sy - 12);
  } else if (member.state === CrewState.REPAIRING) {
    ctx.fillText('\u2692', sx + 14, sy - 12); // hammer & pick
  } else if (member.state === CrewState.FIGHTING) {
    ctx.fillText('\u2694', sx + 14, sy - 12); // crossed swords
  } else if (member.state === CrewState.FLEEING) {
    ctx.fillText('\u203c', sx + 14, sy - 12); // double exclamation (panic)
  } else if (member.state === CrewState.PRAYING) {
    ctx.fillText('\u271d', sx + 14, sy - 12); // latin cross (prayer)
  }
}

/** Draw overlays (bubbles, name labels) for an actor — call in a second pass after all actors are drawn */
export function drawActorOverlays(rc: RenderContext, member: Actor, selected: boolean): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  const sx = member.pixelX - camera.x;
  const sy = member.pixelY - camera.y;

  // Caught-fish window (floats above the head, beneath the name label)
  if (member.caughtFishDisplay) {
    drawCaughtFishWindow(rc, member.caughtFishDisplay, sx, sy);
  }

  // Speech bubble (conversation) — takes priority over thought bubble
  if (member.speechBubbleText) {
    drawSpeechBubble(rc, member.speechBubbleText, sx, sy);
  } else if (member.thoughtBubble) {
    // Thought bubble
    const bubbleSprite = rc.sprites?.bubbles.get(member.thoughtBubble);
    const bubbleSize = 24;
    const bx = sx - bubbleSize / 2;
    const by = sy - TILE_SIZE - bubbleSize + 4;
    if (bubbleSprite) {
      ctx.drawImage(bubbleSprite, bx, by, bubbleSize, bubbleSize);
    } else {
      // Fallback: draw a simple bubble with text
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(bx + bubbleSize / 2, by + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      const bubbleColor = member.thoughtBubble === 'heart' ? '#e74c3c'
        : member.thoughtBubble === 'music_note' ? '#3498db'
        : member.thoughtBubble === 'mischief' ? '#d4a017'
        : member.thoughtBubble === 'prayer' ? '#d9c98a' : '#666666';
      const bubbleChar = member.thoughtBubble === 'heart' ? '\u2665'
        : member.thoughtBubble === 'music_note' ? '\u266A'
        : member.thoughtBubble === 'mischief' ? '\u263A'
        : member.thoughtBubble === 'prayer' ? '\u271D' : '\uD83D\uDC94'; // \u271D latin cross (prayer), \u263A cheeky grin
      ctx.fillStyle = bubbleColor;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bubbleChar, bx + bubbleSize / 2, by + bubbleSize / 2 + 5);
    }
  }

  // Name label (always show for humans, only when selected for animals)
  if (member.actorType === 'human' || selected) {
    const npcData = member.statuses.get('npc') as { role: string } | null;
    const label = npcData
      ? `${member.profile.name} (${npcData.role})`
      : member.profile.name;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(label, sx, sy - 22);
    ctx.fillStyle = npcData ? '#ffdd88' : '#ffffff';
    ctx.fillText(label, sx, sy - 22);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSpeechBubble(rc: RenderContext, text: string, sx: number, sy: number): void {
  const ctx = rc.ctx;
  ctx.font = 'bold 9px sans-serif';
  const metrics = ctx.measureText(text);
  const padX = 6;
  const bubbleW = metrics.width + padX * 2;
  const bubbleH = 16;
  const bubbleX = sx - bubbleW / 2;
  const bubbleY = sy - TILE_SIZE - 22;
  const radius = 4;
  const tailSize = 4;

  // Rounded rect
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(bubbleX + radius, bubbleY);
  ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
  ctx.arcTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + radius, radius);
  ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
  ctx.arcTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - radius, bubbleY + bubbleH, radius);
  ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
  ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius, radius);
  ctx.lineTo(bubbleX, bubbleY + radius);
  ctx.arcTo(bubbleX, bubbleY, bubbleX + radius, bubbleY, radius);
  ctx.closePath();
  ctx.fill();

  // Tail pointing down toward crew head
  ctx.beginPath();
  ctx.moveTo(sx - tailSize, bubbleY + bubbleH);
  ctx.lineTo(sx, bubbleY + bubbleH + tailSize + 2);
  ctx.lineTo(sx + tailSize, bubbleY + bubbleH);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Also stroke the rounded rect
  ctx.beginPath();
  ctx.moveTo(bubbleX + radius, bubbleY);
  ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
  ctx.arcTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + radius, radius);
  ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
  ctx.arcTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - radius, bubbleY + bubbleH, radius);
  ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
  ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius, radius);
  ctx.lineTo(bubbleX, bubbleY + radius);
  ctx.arcTo(bubbleX, bubbleY, bubbleX + radius, bubbleY, radius);
  ctx.closePath();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#222222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx, bubbleY + bubbleH / 2);
  ctx.textBaseline = 'alphabetic';
}

// ─── Fishing visuals ──────────────────────────────────────────────────────────

const FISH_MAX_LINE_LEN = TILE_SIZE * 1.6; // how far the line reaches over the water
// CAST_DURATION / CAUGHT_DISPLAY_DURATION are shared with the logic — imported from ../types.

/** Unit vector for a cast direction (toward the water). */
function castDirVector(dir: Actor['fishingCastDir']): { x: number; y: number } {
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
function drawFishingRig(rc: RenderContext, member: Actor, sx: number, sy: number): void {
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
function drawCaughtFishWindow(
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

export function drawCorpse(rc: RenderContext, corpse: Corpse, selected: boolean = false): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  const sx = corpse.pixelX - camera.x;
  const sy = corpse.pixelY - camera.y;

  const isAnimal = corpse.actorType !== 'human';
  const dirSprite = isAnimal
    ? (rc.sprites?.animals.get(corpse.actorType) ?? null)
    : (rc.sprites?.crew[corpse.spriteIndex % (rc.sprites?.crew.length ?? 1)] ?? null);
  const sprite = dirSprite?.south ?? null;

  const sizeScale = corpse.actorType === 'monkey' ? 0.7 : isAnimal ? 0.85 : 1.0;
  const size = TILE_SIZE * sizeScale;

  ctx.save();
  ctx.globalAlpha = 0.6;
  if (sprite) {
    // Draw south-facing sprite rotated 90° (lying down)
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
  } else {
    // Fallback: dark ellipse with 'X'
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Darken the actor's color
    ctx.fillStyle = corpse.color;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', 0, 0);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  if (selected) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.stroke();
  }
}
