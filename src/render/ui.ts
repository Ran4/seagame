import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  TileType, TILE_COLORS, OBJECT_MAX_HP, Deck, Actor,
  STATE_NAMES, Item, SECONDS_PER_DAY,
  ActivityLogEntry,
} from '../types';
import { RenderContext } from './context';
import { TILE_NAMES } from './index';

export function drawUI(
  rc: RenderContext,
  deck: Deck, deckIndex: number, crew: Actor[],
  selectedActorId: number | null,
  selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null,
  decks: Deck[],
  barrelInventory: Map<string, Item[]>,
  gameTime: number,
): void {
  const ctx = rc.ctx;

  // Deck selector
  const deckLabels = decks.map((d, i) => `[${i + 1}] ${d.name}`);
  const lineH = 22;
  const panelW = 160;
  const panelH = deckLabels.length * lineH + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(10, 10, panelW, panelH);
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < deckLabels.length; i++) {
    const active = i === deckIndex;
    if (active) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(12, 14 + i * lineH, panelW - 4, lineH);
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#777777';
    }
    ctx.fillText((active ? '▸ ' : '  ') + deckLabels[i], 18, 28 + i * lineH);
  }

  // Selected crew info
  if (selectedActorId !== null) {
    const member = crew.find(c => c.id === selectedActorId);
    if (member) {
      drawCrewPanel(rc, member);
    }
  }

  // Selected object info
  if (selectedObject) {
    drawObjectPanel(rc, selectedObject, barrelInventory, gameTime);
  }
}

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

function drawCrewPanel(rc: RenderContext, member: Actor): void {
  const ctx = rc.ctx;
  const px = CANVAS_WIDTH - 210;
  const py = 10;
  const pw = 200;
  const ph = layoutCrewPanel(rc, member, false);

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

  layoutCrewPanel(rc, member, true);
}

/** Measure or draw the crew panel. When draw=false, only returns height. */
function layoutCrewPanel(rc: RenderContext, member: Actor, draw: boolean): number {
  const ctx = rc.ctx;
  const px = CANVAS_WIDTH - 210;
  const py = 10;
  const pw = 200;
  const p = member.profile;
  const slot = 28;
  const slotGap = 4;
  let y = py + 8;

  // Name row
  if (draw) {
    ctx.fillStyle = member.profile.color;
    ctx.beginPath();
    ctx.arc(px + 20, y + 17, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    const typeLabel = member.actorType === 'human' ? p.sex : `${member.actorType} ${p.sex}`;
    ctx.fillText(`${p.name} (${typeLabel})`, px + 35, y + 22);
  }
  y += 32;

  // State
  if (draw) {
    ctx.font = '11px monospace';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`State: ${STATE_NAMES[member.state]}`, px + 10, y + 10);
  }
  y += 18;

  // Hunger bar
  if (draw) {
    ctx.fillStyle = '#cccccc';
    ctx.font = '11px monospace';
    ctx.fillText('Hunger', px + 10, y + 10);
    drawBar(rc, px + 75, y, 115, 12, p.hunger / 255, '#e67e22');
  }
  y += 20;

  // Energy bar
  if (draw) {
    ctx.fillText('Energy', px + 10, y + 10);
    drawBar(rc, px + 75, y, 115, 12, p.energy / 255, '#3498db');
  }
  y += 20;

  // Drunk bar (conditional)
  const drunkAmount = (member.statuses.get('drunkedness') as { amount: number } | undefined)?.amount ?? 0;
  if (drunkAmount > 0) {
    if (draw) {
      ctx.fillText('Drunk', px + 10, y + 10);
      drawBar(rc, px + 75, y, 115, 12, drunkAmount / 255, '#9b59b6');
    }
    y += 20;
  }

  // Lust bar (conditional)
  const lustAmount = (member.statuses.get('lust') as { amount: number } | undefined)?.amount ?? 0;
  if (lustAmount > 0) {
    if (draw) {
      ctx.fillText('Lust', px + 10, y + 10);
      drawBar(rc, px + 75, y, 115, 12, lustAmount / 255, '#e74c8b');
    }
    y += 20;
  }

  // Conditions
  if (member.conditions.size > 0) {
    if (draw) {
      ctx.fillStyle = '#ccaa44';
      ctx.font = '10px monospace';
      ctx.fillText([...member.conditions].join(', '), px + 10, y + 10);
    }
    y += 16;
  }

  // Deck
  if (draw) {
    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    const deckNames = ["Crow's Nest", 'Upper', 'Lower'];
    ctx.fillText(`Deck: ${deckNames[member.deck] ?? `Deck ${member.deck}`}`, px + 10, y + 10);
  }
  y += 18;

  // Hands & Inventory (humans only)
  if (member.actorType === 'human') {
    if (draw) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = p.numberOfHands === 0 ? '#666666' : '#aaaaaa';
      ctx.fillText(p.numberOfHands === 0 ? 'No hands' : 'Hands:', px + 10, y + 10);
    }
    y += 14;
    if (draw) {
      for (let i = 0; i < p.numberOfHands; i++) {
        drawItemSlot(rc, px + 10 + i * (slot + slotGap), y, slot, p.hands[i] ?? null);
      }
    }
    if (p.numberOfHands > 0) y += slot + slotGap;
    y += 4;

    // Inventory
    if (p.inventory.length > 0) {
      if (draw) {
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Inventory:', px + 10, y + 10);
      }
      y += 14;
      const cols = 5;
      const rows = Math.ceil(p.inventory.length / cols);
      if (draw) {
        for (let i = 0; i < p.inventory.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          drawItemSlot(rc, px + 10 + col * (slot + slotGap), y + row * (slot + slotGap), slot, p.inventory[i]);
        }
      }
      y += rows * (slot + slotGap);
    }
  }

  y += 6; // bottom padding
  return y - py;
}

function drawObjectPanel(
  rc: RenderContext,
  obj: { tileType: TileType; x: number; y: number; deck: number },
  barrelInventory: Map<string, Item[]>,
  gameTime: number,
): void {
  const ctx = rc.ctx;
  const px = CANVAS_WIDTH - 210;
  const py = 10;
  const pw = 200;

  const name = TILE_NAMES[obj.tileType] ?? 'Object';
  const maxHp = OBJECT_MAX_HP[obj.tileType] ?? 50;

  // Calculate barrel contents for dynamic panel height
  let items: Item[] = [];
  if (obj.tileType === TileType.BARREL) {
    const key = `${obj.deck}-${obj.x}-${obj.y}`;
    items = barrelInventory.get(key) || [];
  }
  const slotSize = 28;
  const slotGap = 4;
  const slotCols = 5;
  const contentsHeight = obj.tileType === TileType.BARREL
    ? 14 + (items.length > 0
        ? Math.ceil(items.length / slotCols) * (slotSize + slotGap) + slotGap
        : 18)
    : 0;
  const oilHeight = obj.tileType === TileType.LANTERN ? 24 : 0;
  const ph = 80 + contentsHeight + oilHeight;

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

  // Draw sprite or colored square
  const sprite = rc.sprites?.tiles.get(obj.tileType);
  if (sprite) {
    ctx.drawImage(sprite, px + 8, py + 10, 24, 24);
  } else {
    ctx.fillStyle = TILE_COLORS[obj.tileType];
    ctx.fillRect(px + 8, py + 10, 24, 24);
  }

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(name, px + 40, py + 28);

  // HP bar
  ctx.fillStyle = '#cccccc';
  ctx.font = '11px monospace';
  ctx.fillText('HP', px + 10, py + 58);
  drawBar(rc, px + 35, py + 48, 155, 12, 1.0, '#4caf50');

  // HP text
  ctx.fillStyle = '#888888';
  ctx.font = '10px monospace';
  ctx.fillText(`${maxHp}/${maxHp}`, px + 135, py + 72);

  // Barrel contents
  if (obj.tileType === TileType.BARREL) {
    const cy = py + 76;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(px + 8, cy);
    ctx.lineTo(px + pw - 8, cy);
    ctx.stroke();

    ctx.fillStyle = '#cccccc';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Contents:', px + 10, cy + 14);

    if (items.length === 0) {
      ctx.fillStyle = '#666666';
      ctx.fillText('(empty)', px + 20, cy + 28);
    } else {
      const gridY = cy + 18;
      for (let i = 0; i < items.length; i++) {
        const col = i % slotCols;
        const row = Math.floor(i / slotCols);
        const sx = px + 10 + col * (slotSize + slotGap);
        const sy = gridY + row * (slotSize + slotGap);
        drawItemSlot(rc, sx, sy, slotSize, items[i]);
      }
    }
  }

  // Oil bar for lanterns
  if (obj.tileType === TileType.LANTERN) {
    const oilKey = `${obj.deck}-${obj.x}-${obj.y}`;
    const oil = rc.lanternOil.get(oilKey) ?? 0;
    const oilY = py + 76;
    ctx.fillStyle = '#cccccc';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Oil', px + 10, oilY + 12);
    drawBar(rc, px + 35, oilY + 2, 155, 12, oil / 100, '#e6a822');
  }
}
