import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  TileType, TILE_COLORS, OBJECT_MAX_HP, Deck, CrewMember, Camera, CrewState,
  ContextMenu, STATE_NAMES, WorldMap, Item,
} from './types';
import { SpriteSheet } from './sprites';
import { SECONDS_PER_DAY, SHIP_SPEED } from './worldmap';

const WATER_COLOR_1 = '#1a5276';
const WATER_COLOR_2 = '#1b6090';


const TILE_NAMES: Partial<Record<TileType, string>> = {
  [TileType.STAIRS]: 'Stairs',
  [TileType.HELM]: 'Helm',
  [TileType.MAST]: 'Mast',
  [TileType.CANNON]: 'Cannon',
  [TileType.STOVE]: 'Stove',
  [TileType.BED]: 'Bed',
  [TileType.BARREL]: 'Barrel',
  [TileType.TABLE]: 'Table',
  [TileType.MAP_TABLE]: 'Map Table',
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sprites: SpriteSheet | null = null;
  private hoveredItem: { item: Item; x: number; y: number } | null = null;
  private mousePos: { x: number; y: number } = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  setSprites(sprites: SpriteSheet): void {
    this.sprites = sprites;
  }

  render(
    deck: Deck,
    deckIndex: number,
    crew: CrewMember[],
    camera: Camera,
    selectedCrewId: number | null,
    selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null,
    time: number,
    mousePos: { x: number; y: number },
    contextMenu: ContextMenu | null = null,
    decks: Deck[] = [],
    soundMuted: boolean = false,
    worldMap: WorldMap | null = null,
    mapOverlayOpen: boolean = false,
    hasNavigator: boolean = false,
    hasHelmsman: boolean = false,
    barrelInventory: Map<string, Item[]> = new Map(),
  ): void {
    const ctx = this.ctx;
    this.hoveredItem = null as typeof this.hoveredItem;
    this.mousePos = mousePos;

    ctx.fillStyle = WATER_COLOR_1;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.drawWater(camera, time);

    // Crow's nest: draw upper deck faintly underneath (tiles + crew)
    if (deckIndex === 0 && decks.length > 1) {
      this.drawDeck(decks[1], camera, time);
      for (const member of crew) {
        if (member.deck === 1) {
          this.drawCrewMember(member, camera, member.id === selectedCrewId);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    this.drawDeck(deck, camera, time);

    // Lower decks are darker (below deck, less light)
    if (deckIndex > 0) {
      ctx.fillStyle = `rgba(0,0,0,${0.125 * deckIndex})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Selected object highlight
    if (selectedObject && selectedObject.deck === deckIndex) {
      const ox = selectedObject.x * TILE_SIZE - camera.x;
      const oy = selectedObject.y * TILE_SIZE - camera.y;
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + 1, oy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    for (const member of crew) {
      if (member.deck === deckIndex) {
        this.drawCrewMember(member, camera, member.id === selectedCrewId);
      }
    }

    this.drawUI(deck, deckIndex, crew, selectedCrewId, selectedObject, decks, barrelInventory, time);
    this.drawSoundButton(soundMuted);
    this.drawTooltip(deck, camera, mousePos);
    if (contextMenu) {
      this.drawContextMenu(contextMenu, mousePos);
    }
    if (mapOverlayOpen && worldMap) {
      this.drawMapOverlay(worldMap, mousePos, time, hasNavigator, hasHelmsman);
    }
    const hovered = this.hoveredItem;
    if (hovered) {
      this.drawItemTooltip(hovered.item, mousePos);
    }
  }

  private drawWater(camera: Camera, time: number): void {
    const ctx = this.ctx;
    const startTileX = Math.floor(camera.x / TILE_SIZE);
    const startTileY = Math.floor(camera.y / TILE_SIZE);
    const tilesX = Math.ceil(CANVAS_WIDTH / TILE_SIZE) + 1;
    const tilesY = Math.ceil(CANVAS_HEIGHT / TILE_SIZE) + 1;
    const phase = Math.floor(time * 0.5) % 2;

    if (this.sprites) {
      const waterImg = this.sprites.waterFrames[phase];
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const worldTX = startTileX + tx;
          const worldTY = startTileY + ty;
          const sx = worldTX * TILE_SIZE - camera.x;
          const sy = worldTY * TILE_SIZE - camera.y;
          ctx.drawImage(waterImg, sx, sy, TILE_SIZE, TILE_SIZE);
        }
      }
    } else {
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const worldTX = startTileX + tx;
          const worldTY = startTileY + ty;
          const isLight = (worldTX + worldTY + phase) % 2 === 0;
          ctx.fillStyle = isLight ? WATER_COLOR_1 : WATER_COLOR_2;
          const sx = worldTX * TILE_SIZE - camera.x;
          const sy = worldTY * TILE_SIZE - camera.y;
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private drawDeck(deck: Deck, camera: Camera, time: number): void {
    const ctx = this.ctx;
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        const tile = deck.tiles[y][x];
        if (tile === TileType.WATER) continue;

        const sx = x * TILE_SIZE - camera.x;
        const sy = y * TILE_SIZE - camera.y;
        if (sx + TILE_SIZE < 0 || sx > CANVAS_WIDTH || sy + TILE_SIZE < 0 || sy > CANVAS_HEIGHT) continue;

        const sprite = this.sprites?.tiles.get(tile);
        if (sprite) {
          // Draw floor underneath furniture/objects with transparent backgrounds
          const needsFloorUnder = tile !== TileType.HULL && tile !== TileType.FLOOR;
          if (needsFloorUnder) {
            const floorSprite = this.sprites?.tiles.get(TileType.FLOOR);
            if (floorSprite) {
              ctx.drawImage(floorSprite, sx, sy, TILE_SIZE, TILE_SIZE);
            }
          }
          ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = TILE_COLORS[tile];
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

          if (tile === TileType.FLOOR || tile === TileType.STAIRS || tile === TileType.HELM) {
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
          if (tile === TileType.HULL) {
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
          this.drawTileIconFallback(tile, sx, sy);
        }
      }
    }
  }

  private drawTileIconFallback(tile: TileType, sx: number, sy: number): void {
    const ctx = this.ctx;
    const cx = sx + TILE_SIZE / 2;
    const cy = sy + TILE_SIZE / 2;

    switch (tile) {
      case TileType.STAIRS: {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(sx + 8, cy + i * 5);
          ctx.lineTo(sx + TILE_SIZE - 8, cy + i * 5);
          ctx.stroke();
        }
        break;
      }
      case TileType.HELM: {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * 6, cy + Math.sin(angle) * 6);
          ctx.lineTo(cx + Math.cos(angle) * 10, cy + Math.sin(angle) * 10);
          ctx.stroke();
        }
        break;
      }
      case TileType.MAST: {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1f14';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case TileType.CANNON: {
        ctx.fillStyle = '#555';
        ctx.fillRect(cx - 4, cy - 8, 8, 16);
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(cx, cy - 8, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case TileType.STOVE: {
        ctx.fillStyle = '#661a00';
        ctx.fillRect(sx + 6, sy + 6, TILE_SIZE - 12, TILE_SIZE - 12);
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
        break;
      }
      case TileType.BED: {
        ctx.fillStyle = '#4a6a8a';
        ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        ctx.fillStyle = '#8ab4d4';
        ctx.fillRect(sx + 6, sy + 4, TILE_SIZE - 12, 8);
        break;
      }
      case TileType.BARREL: {
        ctx.fillStyle = '#6b4f0a';
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a2a00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case TileType.TABLE: {
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        break;
      }
      case TileType.MAP_TABLE: {
        // Green table with parchment + compass cross
        ctx.fillStyle = '#3a5a34';
        ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        // Parchment
        ctx.fillStyle = '#d4c49a';
        ctx.fillRect(sx + 7, sy + 7, TILE_SIZE - 14, TILE_SIZE - 14);
        // Compass cross
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, sy + 9);
        ctx.lineTo(cx, sy + TILE_SIZE - 9);
        ctx.moveTo(sx + 9, cy);
        ctx.lineTo(sx + TILE_SIZE - 9, cy);
        ctx.stroke();
        // Compass circle
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
  }

  private drawCrewMember(member: CrewMember, camera: Camera, selected: boolean): void {
    const ctx = this.ctx;
    const sx = member.pixelX - camera.x;
    const sy = member.pixelY - camera.y;

    const crewSprite = this.sprites?.crew[member.profile.spriteIndex % (this.sprites?.crew.length ?? 1)];

    if (crewSprite) {
      // Draw sprite centered on position
      const size = TILE_SIZE;
      ctx.drawImage(crewSprite, sx - size / 2, sy - size / 2, size, size);
    } else {
      // Fallback: colored circle
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 10, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = member.profile.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
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
    }

    // Name label
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

  private drawUI(
    deck: Deck, deckIndex: number, crew: CrewMember[],
    selectedCrewId: number | null,
    selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null,
    decks: Deck[] = [],
    barrelInventory: Map<string, Item[]> = new Map(),
    gameTime: number = 0,
  ): void {
    const ctx = this.ctx;

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
    if (selectedCrewId !== null) {
      const member = crew.find(c => c.id === selectedCrewId);
      if (member) {
        this.drawCrewPanel(member);
      }
    }

    // Selected object info
    if (selectedObject) {
      this.drawObjectPanel(selectedObject, barrelInventory, gameTime);
    }
  }

  private drawSoundButton(muted: boolean): void {
    const ctx = this.ctx;
    const size = 24;
    const x = 8;
    const y = CANVAS_HEIGHT - size - 8;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    const cx = x + size / 2 - 2;
    const cy = y + size / 2;

    // Speaker body
    ctx.fillStyle = muted ? '#666' : '#ddd';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 3);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7);
    ctx.lineTo(cx - 3, cy + 3);
    ctx.lineTo(cx - 6, cy + 3);
    ctx.closePath();
    ctx.fill();

    if (muted) {
      // X mark
      ctx.strokeStyle = '#cc4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 4);
      ctx.lineTo(cx + 9, cy + 4);
      ctx.moveTo(cx + 9, cy - 4);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.stroke();
    } else {
      // Sound waves
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx + 3, cy, 4, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 3, cy, 7, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
    }
  }

  private drawCrewPanel(member: CrewMember): void {
    const ctx = this.ctx;
    const px = CANVAS_WIDTH - 210;
    const py = 10;
    const pw = 200;
    const p = member.profile;
    const slotSize = 28;
    const slotGap = 4;
    const sectionGap = 14; // label height
    // Hands row (always shown)
    let extraH = sectionGap + slotSize + slotGap;
    // Inventory rows
    const invCols = 5;
    if (p.inventory.length > 0) {
      const invRows = Math.ceil(p.inventory.length / invCols);
      extraH += sectionGap + invRows * (slotSize + slotGap);
    }
    const ph = 126 + extraH + 8;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    // Color dot + name
    ctx.fillStyle = member.profile.color;
    ctx.beginPath();
    ctx.arc(px + 20, py + 25, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${member.profile.name} (${member.profile.sex})`, px + 35, py + 30);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`State: ${STATE_NAMES[member.state]}`, px + 10, py + 52);

    ctx.fillStyle = '#cccccc';
    ctx.font = '11px monospace';
    ctx.fillText('Hunger', px + 10, py + 72);
    this.drawBar(px + 75, py + 62, 115, 12, member.profile.hunger / 255, '#e67e22');

    ctx.fillText('Energy', px + 10, py + 92);
    this.drawBar(px + 75, py + 82, 115, 12, member.profile.energy / 255, '#3498db');

    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    const deckNames = ["Crow's Nest", 'Upper', 'Lower'];
    ctx.fillText(`Deck: ${deckNames[member.deck] ?? `Deck ${member.deck}`}`, px + 10, py + 112);

    this.drawCrewHandsAndInventory(member, px, py + 124, pw);
  }

  private drawCrewHandsAndInventory(member: CrewMember, px: number, startY: number, pw: number): void {
    const ctx = this.ctx;
    const p = member.profile;
    const s = 28;   // slot size
    const gap = 4;
    let cy = startY;

    // Hands label + slots
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.numberOfHands === 0 ? '#666666' : '#aaaaaa';
    ctx.fillText(p.numberOfHands === 0 ? 'No hands' : 'Hands:', px + 10, cy);
    cy += 14;
    for (let i = 0; i < p.numberOfHands; i++) {
      const sx = px + 10 + i * (s + gap);
      this.drawItemSlot(sx, cy, s, p.hands[i] ?? null);
    }
    if (p.numberOfHands > 0) cy += s + gap;

    // Inventory label + grid
    if (p.inventory.length > 0) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Inventory:', px + 10, cy);
      cy += 14;
      const cols = 5;
      for (let i = 0; i < p.inventory.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const sx = px + 10 + col * (s + gap);
        const sy = cy + row * (s + gap);
        this.drawItemSlot(sx, sy, s, p.inventory[i]);
      }
    }
  }

  private drawItemSlot(x: number, y: number, size: number, item: Item | null): void {
    const ctx = this.ctx;
    // Slot background
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    if (!item) return;

    // Try sprite
    const spriteKey = item.name.toLowerCase();
    const sprite = this.sprites?.items.get(spriteKey);
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
    const mp = this.mousePos;
    if (mp.x >= x && mp.x <= x + size && mp.y >= y && mp.y <= y + size) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      this.hoveredItem = { item, x: mp.x, y: mp.y };
    }
  }

  private drawItemTooltip(item: Item, mousePos: { x: number; y: number }): void {
    const ctx = this.ctx;
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

  private drawObjectPanel(
    obj: { tileType: TileType; x: number; y: number; deck: number },
    barrelInventory: Map<string, Item[]> = new Map(),
    gameTime: number = 0,
  ): void {
    const ctx = this.ctx;
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
    const ph = 80 + contentsHeight;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    // Draw sprite or colored square
    const sprite = this.sprites?.tiles.get(obj.tileType);
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
    this.drawBar(px + 35, py + 48, 155, 12, 1.0, '#4caf50');

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
          this.drawItemSlot(sx, sy, slotSize, items[i]);
        }
      }
    }
  }

  private drawTooltip(deck: Deck, camera: Camera, mousePos: { x: number; y: number }): void {
    const worldX = mousePos.x + camera.x;
    const worldY = mousePos.y + camera.y;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (tileY < 0 || tileY >= deck.height || tileX < 0 || tileX >= deck.width) return;
    const tile = deck.tiles[tileY][tileX];
    const name = TILE_NAMES[tile];
    if (!name) return;

    const ctx = this.ctx;
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

  private drawContextMenu(menu: ContextMenu, mousePos: { x: number; y: number }): void {
    const ctx = this.ctx;
    const itemW = 140;
    const itemH = 24;
    const pad = 4;
    const totalH = menu.items.length * itemH + pad * 2;

    // Position next to the tile, clamped to canvas
    let mx = menu.screenX;
    let my = menu.screenY;
    if (mx + itemW > CANVAS_WIDTH) mx = mx - itemW - 4;
    if (my + totalH > CANVAS_HEIGHT) my = CANVAS_HEIGHT - totalH - 4;
    if (mx < 0) mx = 4;
    if (my < 0) my = 4;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(mx, my, itemW, totalH);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, itemW - 1, totalH - 1);

    // Items
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < menu.items.length; i++) {
      const iy = my + pad + i * itemH;

      // Hover highlight
      if (mousePos.x >= mx && mousePos.x <= mx + itemW &&
          mousePos.y >= iy && mousePos.y <= iy + itemH) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(mx + 1, iy, itemW - 2, itemH);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillText(menu.items[i].label, mx + 10, iy + 16);

      // Separator
      if (i < menu.items.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(mx + 4, iy + itemH);
        ctx.lineTo(mx + itemW - 4, iy + itemH);
        ctx.stroke();
      }
    }
  }

  private drawMapOverlay(worldMap: WorldMap, mousePos: { x: number; y: number }, time: number, hasNavigator: boolean = false, hasHelmsman: boolean = false): void {
    const ctx = this.ctx;
    const ox = 40, oy = 40, ow = 880, oh = 460;

    // Dark blue overlay background
    ctx.fillStyle = 'rgba(10, 20, 50, 0.92)';
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = '#5577aa';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, ow, oh);

    // Title
    ctx.fillStyle = '#aaccee';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('World Map', ox + ow / 2, oy + 22);

    // Grid lines
    ctx.strokeStyle = 'rgba(80, 120, 180, 0.15)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= 100; gx += 10) {
      const sx = ox + (gx / 100) * ow;
      ctx.beginPath();
      ctx.moveTo(sx, oy + 30);
      ctx.lineTo(sx, oy + oh - 20);
      ctx.stroke();
    }
    for (let gy = 0; gy <= 80; gy += 10) {
      const sy = oy + 30 + ((gy / 80) * (oh - 50));
      ctx.beginPath();
      ctx.moveTo(ox, sy);
      ctx.lineTo(ox + ow, sy);
      ctx.stroke();
    }

    const toScreenX = (wx: number) => ox + (wx / 100) * ow;
    const toScreenY = (wy: number) => oy + 30 + ((wy / 80) * (oh - 50));

    // Dashed line from ship to destination island
    if (worldMap.destinationIsland) {
      const sx = toScreenX(worldMap.shipX);
      const sy = toScreenY(worldMap.shipY);
      const dx = toScreenX(worldMap.destinationIsland.x);
      const dy = toScreenY(worldMap.destinationIsland.y);
      ctx.strokeStyle = '#88aacc';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(dx, dy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Islands
    let hoveredIsland: typeof worldMap.islands[0] | null = null;
    for (const island of worldMap.islands) {
      const ix = toScreenX(island.x);
      const iy = toScreenY(island.y);
      const radius = 8;

      // Check hover
      const hdx = mousePos.x - ix;
      const hdy = mousePos.y - iy;
      if (hdx * hdx + hdy * hdy < (radius + 4) * (radius + 4)) {
        hoveredIsland = island;
      }

      // Destination highlight (golden ring)
      if (worldMap.destinationIsland && worldMap.destinationIsland.id === island.id) {
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ix, iy, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Island dot
      ctx.fillStyle = island.hasHarbor ? '#44aa55' : '#8b6644';
      ctx.beginPath();
      ctx.arc(ix, iy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ix, iy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Name label
      ctx.fillStyle = '#ccddee';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(island.name, ix, iy - radius - 4);
    }

    // Ship (red triangle, rotated to currentHeading)
    const shipSX = toScreenX(worldMap.shipX);
    const shipSY = toScreenY(worldMap.shipY);
    ctx.save();
    ctx.translate(shipSX, shipSY);
    // heading 0 = right (east), triangle points up by default, so rotate heading + π/2
    ctx.rotate(worldMap.currentHeading + Math.PI / 2);
    ctx.fillStyle = '#ee4444';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Hovered island tooltip
    if (hoveredIsland) {
      const ix = toScreenX(hoveredIsland.x);
      const iy = toScreenY(hoveredIsland.y);
      ctx.font = '11px monospace';
      const desc = hoveredIsland.description;
      const tw = ctx.measureText(desc).width + 12;
      let ttx = ix - tw / 2;
      const tty = iy + 18;
      if (ttx < ox + 4) ttx = ox + 4;
      if (ttx + tw > ox + ow - 4) ttx = ox + ow - tw - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(ttx, tty, tw, 20);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(desc, ttx + 6, tty + 14);
    }

    // Bottom info
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#667788';
    // Close button (X) in top-right corner
    const closeX = ox + ow - 28;
    const closeY = oy + 8;
    const closeSize = 20;
    // Hover highlight
    const hoverClose = mousePos.x >= closeX && mousePos.x <= closeX + closeSize &&
                       mousePos.y >= closeY && mousePos.y <= closeY + closeSize;
    if (hoverClose) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(closeX - 2, closeY - 2, closeSize + 4, closeSize + 4);
    }
    ctx.strokeStyle = hoverClose ? '#ffffff' : '#8899aa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(closeX, closeY);
    ctx.lineTo(closeX + closeSize, closeY + closeSize);
    ctx.moveTo(closeX + closeSize, closeY);
    ctx.lineTo(closeX, closeY + closeSize);
    ctx.stroke();

    ctx.fillText('ESC / M to close', ox + ow / 2, oy + oh - 6);

    // Role status indicators (bottom-left of overlay)
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    const statusX = ox + 12;
    const statusY = oy + oh - 30;
    ctx.fillStyle = hasNavigator ? '#44cc66' : '#cc4444';
    ctx.fillText('●', statusX, statusY);
    ctx.fillStyle = '#aabbcc';
    ctx.fillText(`Navigator: ${hasNavigator ? 'Active' : 'None'}`, statusX + 14, statusY);
    ctx.fillStyle = hasHelmsman ? '#44cc66' : '#cc4444';
    ctx.fillText('●', statusX, statusY + 16);
    ctx.fillStyle = '#aabbcc';
    ctx.fillText(`Helmsman: ${hasHelmsman ? 'Active' : 'None'}`, statusX + 14, statusY + 16);

    ctx.textAlign = 'center';

    if (worldMap.destinationIsland) {
      const dx = worldMap.destinationIsland.x - worldMap.shipX;
      const dy = worldMap.destinationIsland.y - worldMap.shipY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let etaStr: string;
      if (worldMap.currentSpeed > 0) {
        const etaSec = dist / worldMap.currentSpeed;
        const etaDays = etaSec / SECONDS_PER_DAY;
        const days = Math.floor(etaDays);
        const hours = Math.round((etaDays - days) * 24);
        etaStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
      } else {
        etaStr = 'Ship stopped';
      }
      ctx.fillStyle = '#aabbcc';
      ctx.fillText(`Sailing to ${worldMap.destinationIsland.name} — ${Math.round(dist)} leagues — ETA: ${etaStr}`, ox + ow / 2, oy + oh - 22);

      // Stop Sailing button
      const btnW = 100;
      const btnH = 22;
      const btnX = ox + ow - btnW - 10;
      const btnY = oy + oh - btnH - 8;
      const hoverStop = mousePos.x >= btnX && mousePos.x <= btnX + btnW &&
                        mousePos.y >= btnY && mousePos.y <= btnY + btnH;
      ctx.fillStyle = hoverStop ? 'rgba(180, 60, 60, 0.9)' : 'rgba(120, 40, 40, 0.8)';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = '#aa5555';
      ctx.lineWidth = 1;
      ctx.strokeRect(btnX, btnY, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Stop Sailing', btnX + btnW / 2, btnY + 15);
    }
  }

  private drawBar(x: number, y: number, w: number, h: number, fill: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fill)), h);
  }
}
