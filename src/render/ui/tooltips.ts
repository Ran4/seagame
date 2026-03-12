import {
  TILE_SIZE, CANVAS_WIDTH,
  Deck, Item,
} from '../../types';
import { RenderContext } from '../context';
import { TILE_NAMES } from '../index';

export function drawTooltip(rc: RenderContext, deck: Deck): void {
  const mousePos = rc.mousePos;
  const camera = rc.camera;
  const worldX = mousePos.x + camera.x;
  const worldY = mousePos.y + camera.y;
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);

  if (tileY < 0 || tileY >= deck.height || tileX < 0 || tileX >= deck.width) return;
  const tile = deck.tiles[tileY][tileX];
  const name = TILE_NAMES[tile];
  if (!name) return;

  const ctx = rc.ctx;
  ctx.font = '11px monospace';
  const textW = ctx.measureText(name).width;
  const px = mousePos.x + 16;
  const py = mousePos.y - 8;
  const pad = 4;

  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(px - pad, py - 12 - pad, textW + pad * 2, 16 + pad);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, px, py);
}

export function drawItemTooltip(rc: RenderContext, item: Item): void {
  const ctx = rc.ctx;
  const mousePos = rc.mousePos;
  ctx.font = '11px monospace';

  const lines: string[] = [item.name];
  const weightStr = item.weight >= 1000 ? `${(item.weight / 1000).toFixed(1)} kg` : `${item.weight}g`;
  lines.push(weightStr);
  if (item.quantity > 1) lines.push(`Qty: ${item.quantity}`);
  if (item.description) lines.push(item.description);

  const pad = 6;
  const lineH = 14;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const tw = maxW + pad * 2;
  const th = lines.length * lineH + pad * 2;

  let tx = mousePos.x + 14;
  let ty = mousePos.y - th - 4;
  if (tx + tw > CANVAS_WIDTH) tx = mousePos.x - tw - 4;
  if (ty < 0) ty = mousePos.y + 18;

  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? '#ffffff' : '#aaaaaa';
    ctx.fillText(lines[i], tx + pad, ty + pad + (i + 1) * lineH - 3);
  }
}

export function drawBarTooltip(rc: RenderContext, lines: string[]): void {
  const ctx = rc.ctx;
  const mousePos = rc.mousePos;
  ctx.font = '11px monospace';
  const pad = 6;
  const lineH = 14;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const tw = maxW + pad * 2;
  const th = lines.length * lineH + pad * 2;
  let tx = mousePos.x + 14;
  let ty = mousePos.y - th - 4;
  if (tx + tw > CANVAS_WIDTH) tx = mousePos.x - tw - 4;
  if (ty < 0) ty = mousePos.y + 18;
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? '#ffffff' : '#aaaaaa';
    ctx.fillText(lines[i], tx + pad, ty + pad + (i + 1) * lineH - 3);
  }
}
