import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  Item, SECONDS_PER_DAY,
  ActivityLogEntry,
} from '../../types';
import { RenderContext } from '../context';

export function drawSoundButton(rc: RenderContext, muted: boolean, sfxMuted: boolean): void {
  const ctx = rc.ctx;
  const size = 24;
  const x = 8;
  const y = CANVAS_HEIGHT - size - 8;

  // Music button (left)
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  const cx = x + size / 2 - 2;
  const cy = y + size / 2;

  // Music note icon
  ctx.fillStyle = muted ? '#666' : '#ddd';
  ctx.beginPath();
  ctx.arc(cx - 2, cy + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx + 0.5, cy - 6, 2, 10);
  ctx.fillRect(cx + 0.5, cy - 6, 6, 2);

  if (muted) {
    ctx.strokeStyle = '#cc4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 4);
    ctx.lineTo(cx + 9, cy + 4);
    ctx.moveTo(cx + 9, cy - 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.stroke();
  }

  // SFX button (right)
  const sx = x + size + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(sx, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, y + 0.5, size - 1, size - 1);

  const scx = sx + size / 2 - 2;
  const scy = y + size / 2;

  // Speaker body
  ctx.fillStyle = sfxMuted ? '#666' : '#ddd';
  ctx.beginPath();
  ctx.moveTo(scx - 6, scy - 3);
  ctx.lineTo(scx - 3, scy - 3);
  ctx.lineTo(scx + 1, scy - 7);
  ctx.lineTo(scx + 1, scy + 7);
  ctx.lineTo(scx - 3, scy + 3);
  ctx.lineTo(scx - 6, scy + 3);
  ctx.closePath();
  ctx.fill();

  if (sfxMuted) {
    ctx.strokeStyle = '#cc4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scx + 4, scy - 4);
    ctx.lineTo(scx + 9, scy + 4);
    ctx.moveTo(scx + 9, scy - 4);
    ctx.lineTo(scx + 4, scy + 4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(scx + 3, scy, 4, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(scx + 3, scy, 7, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
}

export function drawActivityLog(rc: RenderContext, log: ActivityLogEntry[], currentTime: number): void {
  const ctx = rc.ctx;
  const lineH = 13;
  const maxLines = 8;
  const entries = log.slice(-maxLines);
  const pad = 6;
  const logW = 320;
  const logH = entries.length * lineH + pad * 2;
  const lx = CANVAS_WIDTH - logW - 8;
  const ly = CANVAS_HEIGHT - logH - 8;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(lx, ly, logW, logH);

  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < entries.length; i++) {
    const age = currentTime - entries[i].time;
    const alpha = age < 10 ? 1.0 : Math.max(0.3, 1.0 - (age - 10) / 20);
    ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    ctx.fillText(entries[i].text, lx + pad, ly + pad + (i + 1) * lineH - 2, logW - pad * 2);
  }
}

export function drawCompass(rc: RenderContext, heading: number, moving: boolean, deckCount: number, timeOfDay: number = 0): void {
  const ctx = rc.ctx;
  const panelH = deckCount * 22 + 8;
  const size = panelH;
  const x = 10 + 160 + 8; // right of deck selector
  const y = 10;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 6;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, size, size);

  // Outer ring
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cardinal direction labels
  ctx.fillStyle = '#666666';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r + 5);
  ctx.fillText('S', cx, cy + r - 5);
  ctx.fillText('W', cx - r + 6, cy);
  ctx.fillText('E', cx + r - 6, cy);

  // Needle — heading 0 = east, standard math angles
  // North arrow (red) points toward heading, south arrow (white) opposite
  const needleLen = r - 8;
  // Convert heading: 0=east in math, but compass north is -π/2
  const angle = heading;
  const nx = Math.cos(angle) * needleLen;
  const ny = Math.sin(angle) * needleLen;

  // Red half (direction of travel)
  ctx.strokeStyle = moving ? '#ee4444' : '#884444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + nx, cy + ny);
  ctx.stroke();

  // White half (opposite)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - nx, cy - ny);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = '#cccccc';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  // Clock display below compass
  // timeOfDay 0 = midnight (00:00), 360 = noon (12:00)
  const totalHours = (timeOfDay / SECONDS_PER_DAY) * 24;
  const hours = Math.floor(totalHours);
  const minutes = Math.floor((totalHours - hours) * 60);
  const clockStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const clockW = 50;
  const clockH = 18;
  const clockX = x + (size - clockW) / 2;
  const clockY = y + size + 4;
  ctx.fillRect(clockX, clockY, clockW, clockH);
  ctx.fillStyle = '#cccccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockStr, clockX + clockW / 2, clockY + clockH / 2);

  ctx.textBaseline = 'alphabetic';
}

export function drawBar(rc: RenderContext, x: number, y: number, w: number, h: number, fill: number, color: string): void {
  const ctx = rc.ctx;
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fill)), h);
}

export function drawItemSlot(rc: RenderContext, x: number, y: number, size: number, item: Item | null): void {
  const ctx = rc.ctx;
  // Slot background
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  if (!item) return;

  // Try sprite
  const spriteKey = item.name.toLowerCase().replace(/ /g, '_');
  const sprite = rc.sprites?.items.get(spriteKey);
  if (sprite) {
    // Sprites are 1024x1024 with 32x32 pixel art centered — crop to inner ~60%
    const inset = Math.floor(sprite.width * 0.2);
    const srcSize = sprite.width - inset * 2;
    ctx.drawImage(sprite, inset, inset, srcSize, srcSize, x + 2, y + 2, size - 4, size - 4);
  } else {
    // Fallback: first 2 letters
    ctx.fillStyle = '#cccccc';
    ctx.font = `bold ${Math.floor(size * 0.4)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name.slice(0, 2), x + size / 2, y + size / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // Quantity badge
  if (item.quantity > 1) {
    const label = `${item.quantity}`;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const tw = ctx.measureText(label).width + 4;
    ctx.fillRect(x + size - tw, y + size - 12, tw, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + size - 2, y + size - 3);
  }

  // Hover detection
  const mp = rc.mousePos;
  if (mp.x >= x && mp.x <= x + size && mp.y >= y && mp.y <= y + size) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    rc.hoveredItem = { item, x: mp.x, y: mp.y };
  }
}
