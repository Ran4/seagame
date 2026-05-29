import { TILE_SIZE, Actor, Camera, CrewState, Corpse } from '../types';
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

  if (sprite) {
    if (flipX) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
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
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
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
  }
}

/** Draw overlays (bubbles, name labels) for an actor — call in a second pass after all actors are drawn */
export function drawActorOverlays(rc: RenderContext, member: Actor, selected: boolean): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  const sx = member.pixelX - camera.x;
  const sy = member.pixelY - camera.y;

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
        : member.thoughtBubble === 'mischief' ? '#d4a017' : '#666666';
      const bubbleChar = member.thoughtBubble === 'heart' ? '\u2665'
        : member.thoughtBubble === 'music_note' ? '\u266A'
        : member.thoughtBubble === 'mischief' ? '\u263A' : '\uD83D\uDC94'; // \u263A cheeky grin
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
