import { TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, TileType, TILE_COLORS, Deck } from '../types';
import { RenderContext } from './context';

const WATER_COLOR_1 = '#1a5276';
const WATER_COLOR_2 = '#1b6090';

export function drawWater(rc: RenderContext, time: number, waterOffset: { x: number; y: number }): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  // Water uses its own effective camera that includes the scroll offset,
  // so water moves independently of the ship tiles
  const effCamX = camera.x + waterOffset.x;
  const effCamY = camera.y + waterOffset.y;
  const startTileX = Math.floor(effCamX / TILE_SIZE);
  const startTileY = Math.floor(effCamY / TILE_SIZE);
  const tilesX = Math.ceil(CANVAS_WIDTH / TILE_SIZE) + 2;
  const tilesY = Math.ceil(CANVAS_HEIGHT / TILE_SIZE) + 2;
  const phase = Math.floor(time * 0.5) % 2;

  if (rc.sprites) {
    const waterImg = rc.sprites.waterFrames[phase];
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const worldTX = startTileX + tx;
        const worldTY = startTileY + ty;
        const sx = worldTX * TILE_SIZE - effCamX;
        const sy = worldTY * TILE_SIZE - effCamY;
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
        const sx = worldTX * TILE_SIZE - effCamX;
        const sy = worldTY * TILE_SIZE - effCamY;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

export function drawDeck(rc: RenderContext, deck: Deck, time: number): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      const tile = deck.tiles[y][x];
      if (tile === TileType.WATER) continue;

      const sx = x * TILE_SIZE - camera.x;
      const sy = y * TILE_SIZE - camera.y;
      if (sx + TILE_SIZE < 0 || sx > CANVAS_WIDTH || sy + TILE_SIZE < 0 || sy > CANVAS_HEIGHT) continue;

      const sprite = rc.sprites?.tiles.get(tile);
      if (sprite) {
        // Draw floor underneath furniture/objects with transparent backgrounds
        const needsFloorUnder = tile !== TileType.HULL && tile !== TileType.FLOOR;
        if (needsFloorUnder) {
          const floorSprite = rc.sprites?.tiles.get(TileType.FLOOR);
          if (floorSprite) {
            ctx.drawImage(floorSprite, sx, sy, TILE_SIZE, TILE_SIZE);
          }
        }
        ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);
        // Bright glow on lit lantern sprite
        if (tile === TileType.LANTERN) {
          const lKey = `${rc.deckIndex}-${x}-${y}`;
          const lOil = rc.lanternOil.get(lKey) ?? 0;
          if (lOil > 0) {
            const intensity = Math.min(1, lOil / 20);
            const prevComp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';
            const gcx = sx + TILE_SIZE / 2;
            const gcy = sy + TILE_SIZE / 2;
            const grad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, TILE_SIZE * 0.7);
            grad.addColorStop(0, `rgba(255, 220, 100, ${0.6 * intensity})`);
            grad.addColorStop(0.6, `rgba(255, 180, 60, ${0.25 * intensity})`);
            grad.addColorStop(1, 'rgba(255, 160, 40, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(sx - TILE_SIZE * 0.2, sy - TILE_SIZE * 0.2, TILE_SIZE * 1.4, TILE_SIZE * 1.4);
            ctx.globalCompositeOperation = prevComp;
          }
        }
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
        drawTileIconFallback(rc, tile, sx, sy);
      }
    }
  }
}

function drawTileIconFallback(rc: RenderContext, tile: TileType, sx: number, sy: number): void {
  const ctx = rc.ctx;
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
    case TileType.LANTERN: {
      const litKey = getLanternKeyFromScreen(rc, sx, sy);
      const litOil = litKey ? (rc.lanternOil.get(litKey) ?? 0) : 0;
      // Base/handle
      ctx.fillStyle = '#8a6820';
      ctx.fillRect(cx - 2, sy + 4, 4, 4);   // handle top
      ctx.fillRect(cx - 1, sy + 3, 2, 2);   // handle tip
      // Glass body
      ctx.fillStyle = litOil > 0 ? 'rgba(255,200,60,0.5)' : 'rgba(180,180,180,0.3)';
      ctx.fillRect(cx - 5, sy + 8, 10, 14);
      // Brass frame
      ctx.strokeStyle = '#b8892e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 5, sy + 8, 10, 14);
      ctx.fillStyle = '#b8892e';
      ctx.fillRect(cx - 6, sy + 7, 12, 2);  // top rim
      ctx.fillRect(cx - 6, sy + 21, 12, 3); // bottom base
      // Flame when lit
      if (litOil > 0) {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.ellipse(cx, sy + 15, 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.ellipse(cx, sy + 14, 1, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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

function getLanternKeyFromScreen(rc: RenderContext, sx: number, sy: number): string {
  const tileX = Math.floor((sx + rc.camera.x) / TILE_SIZE);
  const tileY = Math.floor((sy + rc.camera.y) / TILE_SIZE);
  return `${rc.deckIndex}-${tileX}-${tileY}`;
}
