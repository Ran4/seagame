import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  TileType, TILE_COLORS, Deck, CrewMember, Camera, CrewState,
} from './types';
import { SpriteSheet } from './sprites';

const WATER_COLOR_1 = '#1a5276';
const WATER_COLOR_2 = '#1b6090';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sprites: SpriteSheet | null = null;

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
    time: number,
  ): void {
    const ctx = this.ctx;

    ctx.fillStyle = WATER_COLOR_1;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.drawWater(camera, time);
    this.drawDeck(deck, camera, time);

    for (const member of crew) {
      if (member.deck === deckIndex) {
        this.drawCrewMember(member, camera, member.id === selectedCrewId);
      }
    }

    this.drawUI(deck, deckIndex, crew, selectedCrewId);
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
    }
  }

  private drawCrewMember(member: CrewMember, camera: Camera, selected: boolean): void {
    const ctx = this.ctx;
    const sx = member.pixelX - camera.x;
    const sy = member.pixelY - camera.y;

    const crewSprite = this.sprites?.crew[member.id % (this.sprites?.crew.length ?? 1)];

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

      ctx.fillStyle = member.color;
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
    }

    // Name label
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(member.name, sx, sy - 22);
    ctx.textBaseline = 'alphabetic';
  }

  private drawUI(deck: Deck, deckIndex: number, crew: CrewMember[], selectedCrewId: number | null): void {
    const ctx = this.ctx;

    // Deck selector
    const decks = ['[2] Upper Deck', '[3] Lower Deck'];
    const lineH = 22;
    const panelW = 160;
    const panelH = decks.length * lineH + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, 10, panelW, panelH);
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < decks.length; i++) {
      const active = i === deckIndex;
      if (active) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(12, 14 + i * lineH, panelW - 4, lineH);
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#777777';
      }
      ctx.fillText((active ? '▸ ' : '  ') + decks[i], 18, 28 + i * lineH);
    }

    // Selected crew info
    if (selectedCrewId !== null) {
      const member = crew.find(c => c.id === selectedCrewId);
      if (member) {
        this.drawCrewPanel(member);
      }
    }
  }

  private drawCrewPanel(member: CrewMember): void {
    const ctx = this.ctx;
    const px = CANVAS_WIDTH - 210;
    const py = 10;
    const pw = 200;
    const ph = 120;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    // Color dot + name
    ctx.fillStyle = member.color;
    ctx.beginPath();
    ctx.arc(px + 20, py + 25, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(member.name, px + 35, py + 30);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`State: ${member.state}`, px + 10, py + 52);

    ctx.fillStyle = '#cccccc';
    ctx.font = '11px monospace';
    ctx.fillText('Hunger', px + 10, py + 72);
    this.drawBar(px + 75, py + 62, 115, 12, member.hunger / 255, '#e67e22');

    ctx.fillText('Energy', px + 10, py + 92);
    this.drawBar(px + 75, py + 82, 115, 12, member.energy / 255, '#3498db');

    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    ctx.fillText(`Deck: ${member.deck === 0 ? 'Upper' : 'Lower'}`, px + 10, py + 112);
  }

  private drawBar(x: number, y: number, w: number, h: number, fill: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fill)), h);
  }
}
