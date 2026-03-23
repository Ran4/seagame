import {
  TILE_SIZE, CANVAS_WIDTH,
  TileType, TILE_COLORS, OBJECT_MAX_HP, Actor, Corpse,
  STATE_NAMES, Item, NIGHT_FEAR_MORALE_THRESHOLD, LANTERN_SAFE_RADIUS,
  SKILL_MASTERY,
} from '../../types';
import { RenderContext } from '../context';
import { TILE_NAMES } from '../index';
import { drawBar, drawItemSlot } from './widgets';

export function drawCrewPanel(rc: RenderContext, member: Actor): void {
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
    const npcData = member.statuses.get('npc') as { role: string } | null;
    const typeLabel = npcData ? npcData.role : member.actorType === 'human' ? p.sex : `${member.actorType} ${p.sex}`;
    ctx.fillText(`${p.name} (${typeLabel})`, px + 35, y + 22);

    // Skills tooltip on name hover (humans only)
    if (member.actorType === 'human' && Object.keys(member.skills).length > 0) {
      const nameY = y;
      if (rc.mousePos.x >= px && rc.mousePos.x <= px + pw &&
          rc.mousePos.y >= nameY && rc.mousePos.y <= nameY + 32) {
        const skills: [string, string][] = [
          ['sailing', 'Sailing'], ['gunnery', 'Gunnery'], ['combat', 'Combat'],
          ['cooking', 'Cooking'], ['navigation', 'Navigation'],
          ['singing', 'Singing'], ['dancing', 'Dancing'],
        ];
        const lines = ['Skills'];
        const maxLen = Math.max(...skills.map(([, label]) => label.length));
        for (const [key, label] of skills) {
          const val = Math.floor(member.skills[key] ?? 0);
          const tag = val >= SKILL_MASTERY ? ' ★' : '';
          lines.push(`${label.padStart(maxLen)}: ${val}${tag}`);
        }
        rc.hoveredBarTooltip = lines;
      }
    }
  }
  y += 32;

  // State
  if (draw) {
    ctx.font = '11px monospace';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`State: ${STATE_NAMES[member.state]}`, px + 10, y + 10);
  }
  y += 18;

  // Health bar (only show when damaged)
  if (member.health < member.maxHealth * 0.99) {
    if (draw) {
      ctx.fillStyle = '#cccccc';
      ctx.font = '11px monospace';
      ctx.fillText('Health', px + 10, y + 10);
      drawBar(rc, px + 75, y, 115, 12, member.health / member.maxHealth, '#e74c3c');
    }
    y += 20;
  }

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

  // Morale bar
  if (draw) {
    ctx.fillText('Morale', px + 10, y + 10);
    drawBar(rc, px + 75, y, 115, 12, p.morale / 255, '#2ecc71');
    // Hover tooltip
    const barX = px + 75, barY = y, barW = 115, barH = 12;
    if (rc.mousePos.x >= barX && rc.mousePos.x <= barX + barW &&
        rc.mousePos.y >= barY && rc.mousePos.y <= barY + barH) {
      rc.hoveredBarTooltip = buildMoraleTooltip(member, rc.brightness, rc.lanternOil);
    }
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

function buildMoraleTooltip(member: Actor, brightness: number, lanternOil: Map<string, number>): string[] {
  const p = member.profile;
  const lines: string[] = [`Morale: ${Math.round(p.morale)}/255`];

  // Hunger
  if (p.hunger >= 200) lines.push('Belly: Well-fed  \u2191');
  else if (p.hunger >= 128) lines.push('Belly: Fed  \u2192');
  else if (p.hunger < 15) lines.push('Belly: Starving  \u2193\u2193');
  else if (p.hunger < 70) lines.push('Belly: Hungry  \u2193');
  else lines.push('Belly: Peckish  \u2192');

  // Energy
  if (p.energy >= 200) lines.push('Rest: Well-rested  \u2191');
  else if (p.energy >= 128) lines.push('Rest: Rested  \u2192');
  else if (p.energy < 25) lines.push('Rest: Exhausted  \u2193\u2193');
  else if (p.energy < 60) lines.push('Rest: Tired  \u2193');
  else lines.push('Rest: Okay  \u2192');

  // Friendship
  let avgFriendship = 128;
  if (member.relations.length > 0) {
    let sum = 0;
    for (const r of member.relations) sum += r.friendship;
    avgFriendship = sum / member.relations.length;
  }
  if (avgFriendship >= 160) lines.push('Crew: Well-liked  \u2191');
  else if (avgFriendship >= 128) lines.push('Crew: Gets along  \u2192');
  else if (avgFriendship < 64) lines.push('Crew: Disliked  \u2193\u2193');
  else if (avgFriendship < 96) lines.push('Crew: Unpopular  \u2193');
  else lines.push('Crew: Tolerated  \u2192');

  // Injured
  if (member.conditions.has('injured')) lines.push('Health: Injured  \u2193\u2193');

  // Dog morale
  if (member.conditions.has('near_friendly_dog')) lines.push('Dog: Faithful friend  \u2191');
  if (member.conditions.has('despises_nearby_dog')) lines.push('Dog: Despises hounds  \u2193\u2193');

  // Night status
  if (brightness < 0.5) {
    const RADIUS = LANTERN_SAFE_RADIUS;
    const mx = Math.floor(member.pixelX / TILE_SIZE);
    const my = Math.floor(member.pixelY / TILE_SIZE);
    let nearLit = false;
    for (const [key, oil] of lanternOil) {
      if (oil <= 0) continue;
      if (!key.startsWith(`${member.deck}-`)) continue;
      const parts = key.slice(`${member.deck}-`.length).split('-');
      if (Math.abs(mx - parseInt(parts[0])) + Math.abs(my - parseInt(parts[1])) <= RADIUS) {
        nearLit = true; break;
      }
    }
    if (nearLit) lines.push('Night: Lantern nearby  \u2192');
    else if (p.morale < NIGHT_FEAR_MORALE_THRESHOLD) lines.push('Night: Fear  \u2193\u2193');
    else lines.push('Night: Brave  \u2192');
  }

  return lines;
}

export function drawObjectPanel(
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

export function drawCorpsePanel(rc: RenderContext, corpse: Corpse): void {
  const ctx = rc.ctx;
  const px = CANVAS_WIDTH - 210;
  const py = 10;
  const pw = 200;
  const slot = 28;
  const slotGap = 4;
  const slotCols = 5;
  const hasItems = corpse.inventory.length > 0;
  const rows = hasItems ? Math.ceil(corpse.inventory.length / slotCols) : 0;
  const ph = 50 + (hasItems ? 14 + rows * (slot + slotGap) + 6 : 0);

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

  // Color dot
  ctx.fillStyle = corpse.color;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(px + 20, py + 25, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Name
  ctx.fillStyle = '#cccccc';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Corpse of ${corpse.name}`, px + 35, py + 30);

  // Type
  ctx.fillStyle = '#888888';
  ctx.font = '10px monospace';
  const typeLabel = corpse.actorType === 'human' ? corpse.sex : `${corpse.actorType} ${corpse.sex}`;
  ctx.fillText(typeLabel, px + 35, py + 44);

  // Inventory
  if (hasItems) {
    let y = py + 50;
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px monospace';
    ctx.fillText('Inventory:', px + 10, y + 10);
    y += 14;
    for (let i = 0; i < corpse.inventory.length; i++) {
      const col = i % slotCols;
      const row = Math.floor(i / slotCols);
      drawItemSlot(rc, px + 10 + col * (slot + slotGap), y + row * (slot + slotGap), slot, corpse.inventory[i]);
    }
  }
}
