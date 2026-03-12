import { TILE_SIZE, Actor, Camera, CrewState } from '../types';
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
  // Animals are drawn slightly smaller (monkey even smaller)
  const sizeScale = member.actorType === 'monkey' ? 0.7 : isAnimal ? 0.85 : 1.0;
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
      ctx.fillStyle = member.thoughtBubble === 'heart' ? '#e74c3c' : '#666666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(member.thoughtBubble === 'heart' ? '\u2665' : '\uD83D\uDC94', bx + bubbleSize / 2, by + bubbleSize / 2 + 5);
    }
  }

  // Name label (always show for humans, only when selected for animals)
  if (member.actorType === 'human' || selected) {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(member.profile.name, sx, sy - 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(member.profile.name, sx, sy - 22);
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
